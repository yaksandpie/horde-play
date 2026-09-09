/* The live share: one screen runs the game, the rest watch it read-only. */

import { $, el, sleep } from "./helpers.js";
import {
  COLLECTION_CHUNK, IMAGE_CONCURRENCY, SCRYFALL, THROTTLE_MS, cardFromEntry, cardFromScryfall,
  fetchJSON,
} from "./scryfall.js";
import { primeImage, primeImages } from "./cards.js";
import { G, normCounters, setG } from "./state.js";
import {
  lastCreatureCount, renderDecks, renderGame, renderGameActions, setArenaPhase,
  setLastCreatureCount, showScreen,
} from "./screens.js";

/* =========================================================================
   Live share

   Everyone is sitting at the same table, but only one screen is running the
   game. This lets the others watch it from their own phones: the host pushes a
   snapshot of the board after every action, viewers read it and render the
   same game screen with nothing on it to press.

   There is no server here — the app is a static page — so the snapshots go
   through ntfy.sh, a free public pub/sub relay that speaks plain HTTP and
   Server-Sent Events. That means no account, no key and no library, at the
   price of a stranger's server seeing the board of a Magic game. The room code
   is the only thing keeping it private, so it is drawn from a CSPRNG.

   Two things shape the wire format. ntfy caps a message at 4 KB, and a
   snapshot after every action shouldn't be a card database. So the wire
   carries Scryfall ids and counts, and the viewer resolves them to real cards
   through the same /cards/collection endpoint and image cache the import
   already uses. What crosses the wire is the game, not the cards.
   ========================================================================= */

const NTFY = "https://ntfy.sh";
const SHARE_V = 1;
const SHARE_MAX = 3800;        // ntfy's own cap is 4096; leave room for framing
const SHARE_DEBOUNCE = 900;    // a burst of taps is one publish
const SHARE_HEARTBEAT = 20000; // so a viewer joining mid-game syncs promptly
const SHARE_LOG = 10;          // log entries a viewer gets
/* No 0/O/1/I/L: this gets read out loud across a table. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

function makeCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  // Rejection-free because 256 % 31 != 0 only skews by ~1%, which costs
  // nothing here — this is a room code, not a key.
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function topicFor(code) { return "hordeplay-" + code.toLowerCase(); }

const utf8 = new TextEncoder();
const byteLen = (str) => utf8.encode(str).length;

/* ---- The wire format ----
   Keys are short because the 4 KB cap is real: a 40-stack board with a full
   graveyard and a log tail is most of the budget on its own. */

/* A card is identified by its Scryfall id where it has one. Everything else —
   an offline import, a token typed in by hand — has no shared identity, so it
   travels inline under a synthetic ref.

   A copy token is the exception that has an id and still can't use it: it is a
   token, and may be a 4/4 where the printed card is a 2/2, so a viewer looking
   the id up would be shown the creature it copied rather than the copy. It
   travels inline with its id and image tacked on the end, which costs a little
   of the budget but keeps the art. Older rows simply end sooner. */
function shareRefs(G) {
  const refOf = new Map();   // host card key -> wire ref
  const inline = [];         // compact cards the viewer can't look up
  let n = 0;
  for (const [key, card] of Object.entries(G.cards)) {
    if (card.scryfallId && !card.isCopy) { refOf.set(key, card.scryfallId); continue; }
    const ref = "x" + (n++);
    refOf.set(key, ref);
    const row = [ref, card.name, card.typeLine || "", card.oracleText || "",
      card.power, card.toughness, card.isToken ? 1 : 0, card.isLegendary ? 1 : 0,
      card.hasDefender ? 1 : 0, (card.colors || []).join(""), card.rarity || "",
      card.catHint || "", card.resolved ? 1 : 0, card.handmade ? 1 : 0];
    if (card.isCopy) row.push(1, card.scryfallId || "", card.imageUri || "");
    inline.push(row);
  }
  return { refOf, inline };
}

function stacksOf(keys, refOf) {
  const counts = new Map();
  for (const key of keys) {
    const ref = refOf.get(key);
    if (ref) counts.set(ref, (counts.get(ref) || 0) + 1);
  }
  return Array.from(counts, ([ref, count]) => [ref, count]);
}

function encodeSnapshot(G) {
  const { refOf, inline } = shareRefs(G);
  const ref = (key) => refOf.get(key);
  const inlineByRef = new Map(inline.map((c) => [c[0], c]));

  const snap = {
    v: SHARE_V,
    dn: G.deckName || "",
    t: G.turn, hz: G.hordeTurn, ph: G.phase, su: G.setupTurnsLeft,
    li: G.life, po: G.poison, pl: G.poisonLimit,
    we: G.waveEnd, wp: G.wavePattern, lr: G.legendaryRule, rs: G.ruleset,
    pk: G.peakCreatures,
    lb: G.library.length,
    gn: G.graveyard.length,
    pj: G.players.map((p) => [p.id, p.name]),
    /* A third element only when there are counters: most tiles have none, and
       every byte here is a byte the 4 KB budget doesn't have. */
    bd: G.board.map((st) => {
      const c = normCounters(st.counters);
      const row = [ref(st.cardKey), st.count];
      if (Object.keys(c).length) row.push(c);
      return row;
    }).filter((e) => e[0]),
    // Not filtered: spellTargets indexes into this, so a gap would retarget
    // every spell after it. Every revealed key is a key of G.cards.
    rv: G.revealed.map(ref),
    ml: G.milledLegends.map(ref).filter(Boolean),
    sp: G.spellTargets,
    ov: G.over || null,
    gy: stacksOf(G.graveyard, refOf),
    lg: G.log.slice(0, SHARE_LOG).map((e) => [e.t, e.msg]),
  };

  /* A card with no Scryfall id can't be looked up, so it has to travel whole.
     That makes the inline set a function of what the snapshot still carries —
     recomputed after each cut, or an offline import with a big graveyard would
     keep paying for cards the viewer is no longer being shown. */
  const withInline = () => {
    const used = new Set();
    for (const [r] of snap.bd) used.add(r);
    for (const r of snap.rv) used.add(r);
    for (const r of snap.ml) used.add(r);
    for (const [r] of snap.gy) used.add(r);
    snap.ic = [...used].map((r) => inlineByRef.get(r)).filter(Boolean);
    return byteLen(JSON.stringify(snap));
  };

  /* Over budget, shed the least load-bearing part first. The board, the wave
     and the counters are the point; the log and the graveyard breakdown are
     reference, and the graveyard's size survives either way as gn. A snapshot
     still too big after that is one the viewer can't be given, and saying so
     beats sending a truncated board. */
  let size = withInline();
  if (size > SHARE_MAX) { snap.lg = []; size = withInline(); }
  if (size > SHARE_MAX) { snap.gy = []; size = withInline(); }
  return size > SHARE_MAX ? null : snap;
}

/* The inverse: a game state that every render function already knows how to
   draw. Cards arrive separately (Scryfall, or inline), so this takes the
   dictionary it should use. */
function decodeSnapshot(snap, cards) {
  const expand = (stacks) => {
    const out = [];
    for (const [ref, count] of stacks || []) {
      for (let i = 0; i < count; i++) out.push(ref);
    }
    return out;
  };
  return {
    deckId: null,
    deckName: snap.dn,
    cards,
    // Face-down cards with no identity: only the count is ever read.
    library: new Array(snap.lb).fill(null),
    graveyard: expand(snap.gy),
    /* Sent separately because the breakdown is the first thing dropped when a
       snapshot won't fit, and the tally should still read true when it is. */
    yardCount: snap.gn,
    board: (snap.bd || []).map(([ref, count, counters]) =>
      counters ? { cardKey: ref, count, counters } : { cardKey: ref, count }),
    revealed: snap.rv || [],
    spellTargets: snap.sp || {},
    milledLegends: snap.ml || [],
    players: (snap.pj || []).map(([id, name]) => ({ id, name })),
    life: snap.li, poison: snap.po, poisonLimit: snap.pl,
    ruleset: snap.rs, waveEnd: snap.we, wavePattern: snap.wp,
    legendaryRule: snap.lr,
    peakCreatures: snap.pk, hordeTurn: snap.hz, turn: snap.t,
    setupTurnsLeft: snap.su, phase: snap.ph,
    log: (snap.lg || []).map(([t, msg]) => ({ t, msg })),
    over: snap.ov || null,
  };
}

/* The only place an image URL crosses the wire, and a viewer fetches it. The
   room code is the whole of the access control on that wire, so the URL is
   held to where the host's own art came from rather than fetched on trust. */
const SCRYFALL_ART = /^https:\/\/([a-z0-9-]+\.)*scryfall\.(io|com)\//i;

function cardFromInline(c) {
  const [, name, typeLine, oracleText, power, toughness, isToken, isLegendary,
    hasDefender, colors, rarity, catHint, resolved, handmade,
    isCopy, scryfallId, imageUri] = c;
  return {
    key: c[0], name, scryfallId: scryfallId || null, isToken: !!isToken,
    rarity: rarity || null,
    isLegendary: !!isLegendary, hasDefender: !!hasDefender, typeLine,
    manaCost: "", oracleText, power, toughness,
    colors: colors ? colors.split("") : [],
    imageUri: SCRYFALL_ART.test(imageUri || "") ? imageUri : null,
    // Without catHint a card with no type line stops counting as a creature.
    catHint: catHint || null, resolved: !!resolved, handmade: !!handmade,
    // Only the badge cares, but a copy that read as a plain token on the
    // watching phone would be indistinguishable from what it copied.
    isCopy: !!isCopy, copyOf: isCopy ? name : undefined,
  };
}

/* ---- Host side ---- */

const LS_SHARE = "horde.share";

/* A tablet that sleeps or a tab that reloads shouldn't strand everyone
   watching, so the code and whether it was live outlive the page. */
function loadShare() {
  try { return JSON.parse(localStorage.getItem(LS_SHARE)) || null; }
  catch { return null; }
}
function persistShare() {
  try {
    if (shareCode) localStorage.setItem(LS_SHARE, JSON.stringify({ code: shareCode, on: shareOn }));
    else localStorage.removeItem(LS_SHARE);
  } catch { /* the game matters more than remembering the code */ }
}

let shareCode = null;
let shareOn = false;
let shareWasOn = false;   // sharing was live when the page went away
let shareTimer = null;
let shareBeat = null;
let sharePending = false;
let shareError = "";

function shareStart() {
  if (!shareCode) shareCode = makeCode();
  shareOn = true;
  shareError = "";
  persistShare();
  shareBroadcast(true);
  clearInterval(shareBeat);
  /* Also what lets a viewer who joins mid-game see the board without waiting
     for the host to do something. */
  shareBeat = setInterval(() => shareBroadcast(true), SHARE_HEARTBEAT);
  renderShare();
}

function shareStop(opts = {}) {
  const was = shareOn;
  shareOn = false;
  clearTimeout(shareTimer);
  clearInterval(shareBeat);
  shareTimer = shareBeat = null;
  persistShare();
  // Tell the viewers, rather than leaving them on a board that has quietly
  // stopped moving.
  if (was && !opts.quiet) sharePost({ v: SHARE_V, end: 1 });
  renderShare();
}

/* Called from persistGame(), so every action that changes the game publishes
   without anything having to remember to. Debounced: a run of taps on the
   damage pad is one snapshot, not six. */
function shareBroadcast(now) {
  if (!shareOn || !G || viewerMode) return;
  if (now) { clearTimeout(shareTimer); shareTimer = null; sharePush(); return; }
  if (shareTimer) { sharePending = true; return; }
  sharePush();
  shareTimer = setTimeout(() => {
    shareTimer = null;
    if (sharePending) { sharePending = false; shareBroadcast(); }
  }, SHARE_DEBOUNCE);
}

async function sharePush() {
  const snap = encodeSnapshot(G);
  if (!snap) {
    shareError = "This board is too big to share.";
    renderShare();
    return;
  }
  await sharePost(snap);
}

async function sharePost(payload) {
  if (!shareCode) return;
  try {
    // Deliberately no Content-Type: that keeps this a CORS-simple request, so
    // every snapshot is one round trip instead of a preflight and a POST.
    const res = await fetch(NTFY + "/" + topicFor(shareCode), {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("relay " + res.status);
    if (shareError) { shareError = ""; renderShare(); }
  } catch {
    // A dropped snapshot isn't a dropped game: the next action, or the
    // heartbeat, catches viewers back up.
    shareError = navigator.onLine
      ? "Can't reach the relay — retrying."
      : "Offline — viewers are paused.";
    renderShare();
  }
}

function shareLink() {
  return location.origin + location.pathname + "#watch=" + shareCode;
}

function renderShare() {
  /* The header is up on every screen, so this one answers to the game as well
     as to the share: there is nothing to share from the decks screen, and a
     viewer is watching a game that isn't theirs to share. */
  const btn = $("#btn-share");
  if (btn) {
    btn.hidden = viewerMode || !G ||
      !$("#screen-game").classList.contains("active");
    /* Off, this is one of the header's icon actions and the link glyph carries
       it. Live, the code is the thing worth reading, so the icon steps aside
       and the fixed icon box comes off to make room for it. */
    btn.classList.toggle("icon", !shareOn);
    $("#share-ico").hidden = shareOn;
    const dot = $("#share-dot");
    dot.hidden = !shareOn;
    dot.className = "dotlive" + (shareError ? " bad" : " on");
    const btnCode = $("#share-btn-code");
    btnCode.hidden = !shareOn;  /* an empty span still claims the flex gap */
    btnCode.textContent = shareOn ? shareCode : "";
    btn.title = shareOn
      ? (shareError || "Sharing live — tap for the code")
      : "Let others watch this game";
    btn.setAttribute("aria-label", shareOn
      ? "Sharing live as " + shareCode
      : "Share this game");
    btn.classList.toggle("on", shareOn && !shareError);
    btn.classList.toggle("warn", shareOn && !!shareError);
  }
  const toggle = $("#sh-toggle");
  if (toggle) toggle.textContent = shareOn ? "Stop sharing" : "Start sharing";
  const code = $("#share-code");
  if (code) code.textContent = shareCode || "------";
  const note = $("#sh-note");
  if (note) {
    note.textContent = !shareOn ? ""
      : shareError || "Live. Viewers see every action as you take it.";
    note.classList.toggle("warn-text", !!shareError);
  }
}

/* ---- Viewer side ---- */

let viewerMode = false;
let viewerSource = null;
let viewerCode = "";
let viewerCards = {};       // wire ref -> card object, kept across snapshots
let viewerPending = null;   // the newest snapshot, while cards are resolving
let viewerResolving = false;
let viewerSeen = false;
let viewerLastAt = 0;
let viewerWatchdog = null;
let viewerEnded = false;

/* The host's heartbeat is the only proof this is still live. Without a
   watchdog a closed tab across the table looks exactly like a quiet turn. */
const VIEWER_STALE = SHARE_HEARTBEAT * 3 + 10000;

function viewerTick() {
  if (!viewerMode || viewerEnded) return;
  if (viewerSeen && Date.now() - viewerLastAt > VIEWER_STALE) {
    viewerStatus("no updates — the game may have stopped", "bad");
  }
}

async function viewerJoin(code) {
  viewerLeave({ keepScreen: true });
  viewerMode = true;
  viewerCode = code;
  viewerCards = {};
  viewerSeen = false;
  viewerEnded = false;
  viewerLastAt = Date.now();
  setG(null);
  applyViewerMode();
  $("#viewer-code").textContent = code;
  viewerStatus("connecting…", "");
  viewerWaiting();
  showScreen("screen-game");
  clearInterval(viewerWatchdog);
  viewerWatchdog = setInterval(viewerTick, 15000);

  /* ntfy keeps recent messages, so a viewer joining mid-game gets the last
     snapshot immediately rather than waiting for the host's next action. Each
     message is a whole state, so replaying a few in order is harmless. */
  try {
    viewerSource = new EventSource(
      NTFY + "/" + topicFor(code) + "/sse?since=2m");
  } catch {
    viewerStatus("couldn't connect", "bad");
    return;
  }
  viewerSource.addEventListener("message", (ev) => {
    let snap;
    try {
      const env = JSON.parse(ev.data);
      if (env.event !== "message" || !env.message) return;
      snap = JSON.parse(env.message);
    } catch { return; }
    if (!snap || snap.v !== SHARE_V) {
      viewerStatus("this game is running a different version of the app", "bad");
      return;
    }
    viewerLastAt = Date.now();
    viewerEnded = false;
    if (snap.end) {
      viewerEnded = true;
      viewerStatus("the host stopped sharing", "bad");
      return;
    }
    viewerApply(snap);
  });
  viewerSource.addEventListener("error", () => {
    // EventSource reconnects on its own; say so rather than looking dead.
    if (!viewerSeen) viewerStatus("waiting for the game…", "");
    else viewerStatus("reconnecting…", "bad");
  });
}

function viewerLeave(opts = {}) {
  if (viewerSource) { viewerSource.close(); viewerSource = null; }
  clearInterval(viewerWatchdog);
  viewerWatchdog = null;
  viewerEnded = false;
  viewerMode = false;
  viewerCode = "";
  viewerPending = null;
  viewerCards = {};
  applyViewerMode();
  if (!opts.keepScreen) {
    setG(null);
    primeImages([]);   // drop the watched game's art rather than leak the URLs
    renderDecks();
    showScreen("screen-decks");
  }
}

/* Between joining and the first snapshot there is no game to render, so the
   game screen would otherwise still be showing whatever was on it last. */
function viewerWaiting() {
  setArenaPhase("setup", "Watching");
  const body = $("#stage-body");
  body.textContent = "";
  body.appendChild(el("h2", "stage-title", "Waiting for the game"));
  body.appendChild(el("p", "stage-oracle",
    "Nothing has come through on " + viewerCode + " yet. The board shows up here " +
    "as soon as the other screen sends it — check the code if this doesn't clear."));
  $("#board").textContent = "";
  $("#board-empty").hidden = false;
  $("#board-summary").textContent = "";
  $("#board-panel").classList.remove("live", "bump");
  $("#tile-board").classList.remove("live", "bump");
  setLastCreatureCount(null);
  $("#log").textContent = "";
  $("#game-rules").textContent = "";
  for (const id of ["#c-library", "#c-board", "#c-power", "#c-yard", "#c-turn"]) {
    $(id).textContent = "–";
  }
  $("#tile-life-val").textContent = "–";
}

function viewerStatus(text, cls) {
  const label = $("#viewer-status");
  if (label) label.textContent = text;
  const dot = $("#viewer-dot");
  if (dot) {
    dot.classList.toggle("on", cls === "");
    dot.classList.toggle("bad", cls === "bad");
  }
}

/* Snapshots can arrive faster than Scryfall answers, so a resolve in flight
   parks the newest one rather than queueing every one of them. */
function viewerApply(snap) {
  viewerPending = snap;
  if (viewerResolving) return;
  viewerResolveLoop().catch(() => viewerStatus("couldn't read that update", "bad"));
}

async function viewerResolveLoop() {
  viewerResolving = true;
  try {
    while (viewerPending) {
      const snap = viewerPending;
      viewerPending = null;
      await viewerResolve(snap);
      if (!viewerMode) return;
      setG(decodeSnapshot(snap, viewerCards));
      viewerSeen = true;
      viewerStatus("live", "");
      renderGame();
    }
  } finally {
    viewerResolving = false;
  }
}

/* Fill viewerCards with everything this snapshot names. Inline cards come with
   the snapshot; the rest are Scryfall ids resolved through the same endpoint
   and image cache the import uses, so a viewer gets real art.

   Not through sfJSON: that one remembers a failure as "offline" and refuses
   every call after it, which is right for an import and wrong here, where a
   viewer never runs the import that would clear it. One dropped request would
   otherwise leave every later card an "Unknown card" for the rest of the game. */
async function viewerResolve(snap) {
  for (const c of snap.ic || []) {
    if (!viewerCards[c[0]]) viewerCards[c[0]] = cardFromInline(c);
  }

  const want = new Set();
  for (const [ref] of snap.bd || []) want.add(ref);
  for (const ref of snap.rv || []) want.add(ref);
  for (const ref of snap.ml || []) want.add(ref);
  for (const [ref] of snap.gy || []) want.add(ref);
  const missing = [...want].filter((r) => r && !viewerCards[r] && !r.startsWith("x"));

  for (let i = 0; i < missing.length; i += COLLECTION_CHUNK) {
    const slice = missing.slice(i, i + COLLECTION_CHUNK);
    try {
      const data = await fetchJSON(SCRYFALL + "/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: slice.map((id) => ({ id })) }),
      });
      for (const sf of data.data || []) {
        // Keyed by the wire ref, so the board's cardKeys resolve unchanged.
        viewerCards[sf.id] = Object.assign(cardFromScryfall(sf, { name: sf.name }),
          { key: sf.id });
      }
    } catch { /* an unresolved card still renders, just without art */ }
    await sleep(THROTTLE_MS);
  }

  // Anything Scryfall wouldn't give up still needs to occupy its slot.
  for (const ref of want) {
    if (!viewerCards[ref]) {
      viewerCards[ref] = Object.assign(
        cardFromEntry({ name: "Unknown card", tokenHint: false }), { key: ref });
    }
  }

  const fresh = [...want].map((r) => viewerCards[r]).filter((c) => c && c.imageUri);
  for (let i = 0; i < fresh.length; i += IMAGE_CONCURRENCY) {
    await Promise.all(fresh.slice(i, i + IMAGE_CONCURRENCY).map((c) => primeImage(c)));
  }
}

/* Everything a viewer must not be able to press. The game screen is shared
   with the host on purpose — one board renderer, one set of card faces — so
   viewer mode is subtraction rather than a second screen to keep in step. */
function applyViewerMode() {
  const on = viewerMode;
  $("#viewer-bar").hidden = !on;
  renderGameActions();
  renderShare();
  $("#screen-game .sticky-action").hidden = on;
  $("#btn-add-tokens").hidden = on;
  $("#tile-damage").disabled = on;
  $("#tile-life").disabled = on;
  // The board is still tappable for a viewer — that's how you read a card —
  // but it no longer kills anything, so the hint shouldn't say it does.
  $("#board-hint-host").hidden = on;
  $("#board-hint-viewer").hidden = !on;
}

/* Written from other modules; ESM bindings are read-only across files. */
export const setShareWasOn = (v) => { shareWasOn = v; };
export const setShareCode = (v) => { shareCode = v; };

export {
  CODE_ALPHABET, CODE_LEN, SHARE_MAX, cardFromInline, decodeSnapshot, encodeSnapshot,
  loadShare, makeCode, persistShare, renderShare, shareBroadcast, shareCode, shareLink,
  shareOn, shareStart, shareStop, shareWasOn, topicFor, viewerJoin, viewerLeave,
  viewerMode,
};
