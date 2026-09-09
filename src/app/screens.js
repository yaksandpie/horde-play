/* The four screens — decks, import review, setup, game — and what each one draws. */

import { BUNDLED_DECKS } from "../decks.js";
import { $, $$, el, termBtn, toast, uid } from "./helpers.js";
import { loadDecks, loadGame, persistGame, saveDecks } from "./persistence.js";
import { parseDecklist } from "./parse.js";
import {
  cacheImages, cardFromEntry, lookupAborted, networkDead, resolveEntries, setLookupAborted,
  setNetworkDead,
} from "./scryfall.js";
import { cardFace, cardMeta, cardSlot, primeImages } from "./cards.js";
import {
  G, PHASE, RULESETS, attackers, attackingPower, creatureCount, currentWaveSize,
  defaultRulesetFor, hasCounters, isWaveEnder, lifeInput, logit, millInput, newGame,
  powerIsPartial, rerollTarget, rulesetById, rulesetOfGame, setChips, setG, setLifeInput,
  setMillInput, setUndoStack, sharedLifeFor, undoStack, waveEndText, wavePatternText,
  waveSizeFor,
} from "./state.js";
import { openCardDialog, openStackDialog } from "./dialogs.js";
import { confirmDialog } from "./counters.js";
import { renderShare, setShareWasOn, shareStart, shareWasOn, viewerMode } from "./share.js";

/* =========================================================================
   Screens
   ========================================================================= */

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  renderGameActions();
  renderShare();
  if (id === "screen-decks") applyDeckTheme(null);
  setWakeLock(id === "screen-game");
  window.scrollTo(0, 0);

  /* The screen that was up is display:none now, so whatever had focus inside
     it no longer can — the browser drops focus to <body>, which puts a
     keyboard player back at the top of the document and tells a screen-reader
     player nothing about where they just arrived. Moving focus to the new
     screen's heading announces it and starts tabbing from the right place. */
  $(`#${id} h2`)?.focus({ preventScroll: true });
}

/* A tablet propped on the table shouldn't dim between waves. Held only while
   the game screen is up; the browser drops the lock whenever the tab is
   hidden, so it's re-taken on the way back. Unsupported browsers no-op. */
let wakeLock = null;
async function setWakeLock(want) {
  if (!("wakeLock" in navigator)) return;
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      const held = wakeLock;
      wakeLock = null;
      await held.release();
    }
  } catch { wakeLock = null; }  // denied, or the page lost focus mid-request
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    setWakeLock($("#screen-game").classList.contains("active"));
  }
});

/* Bundled decks are stored compactly and enriched from Scryfall on first use;
   until then they play as text cards with the token flag from the decklist. */
function hydrateBundled(b) {
  return {
    id: "b_" + b.name.replace(/\W+/g, "").toLowerCase(),
    name: b.name,
    builtin: true,
    waveEnd: b.waveEnd,
    enriched: false,
    entries: b.entries.map((e) => ({
      qty: e.q,
      card: cardFromEntry({ name: e.n, tokenHint: !!e.t, catHint: e.c || null }),
    })),
  };
}

function allDecks() {
  const saved = loadDecks();
  const savedIds = new Set(saved.map((d) => d.id));
  const builtin = BUNDLED_DECKS.map(hydrateBundled).filter((d) => !savedIds.has(d.id));
  return saved.concat(builtin);
}

/* ---- Set theme ----
   Bloomburrow decks get a forest-green skin (body.theme-bloomburrow) for as
   long as they're selected — through setup, into the game, and on resume. */
const DEFAULT_THEME_COLOR = "#2c2a25";
const BLOOMBURROW_THEME_COLOR = "#0f1a12";

function isBloomburrowDeck(deck) {
  return !!deck && /^Bloomburrow\b/i.test(deck.name);
}

function applyDeckTheme(deck) {
  const bloom = isBloomburrowDeck(deck);
  document.body.classList.toggle("theme-bloomburrow", bloom);
  $('meta[name="theme-color"]').setAttribute("content", bloom ? BLOOMBURROW_THEME_COLOR : DEFAULT_THEME_COLOR);
}

function renderDecks() {
  const list = $("#deck-list");
  list.textContent = "";

  for (const deck of allDecks()) {
    const total = deck.entries.reduce((n, e) => n + e.qty, 0);
    const tokens = deck.entries.reduce((n, e) => n + (e.card.isToken ? e.qty : 0), 0);
    const row = el("div", "deckrow");

    const name = el("div");
    const title = el("div", "dname", deck.name);
    name.appendChild(title);
    name.appendChild(el("div", "small muted",
      total + " cards · " + tokens + " tokens · " +
      rulesetById(defaultRulesetFor(deck)).name + " rules" +
      (deck.builtin ? " · built in" : "")));
    row.appendChild(name);

    const actions = el("div", "deck-actions");
    const play = el("button", "btn primary sm", "New game");
    play.addEventListener("click", () => openSetup(deck));
    actions.appendChild(play);

    if (!deck.builtin) {
      const del = el("button", "btn ghost sm danger", "Delete");
      del.addEventListener("click", () => {
        confirmDialog("Delete " + deck.name + "?", "The decklist is removed from this device.", () => {
          saveDecks(loadDecks().filter((d) => d.id !== deck.id));
          renderDecks();
          toast("Deck deleted");
        });
      });
      actions.appendChild(del);
    }
    row.appendChild(actions);
    list.appendChild(row);
  }

  const saved = loadGame();
  $("#btn-resume").hidden = !saved || !!saved.over;
}

/* ---- Import ---- */

let reviewCards = [];
let reviewEntries = [];

function importStep(step) {
  $("#import-step-paste").classList.toggle("hidden", step !== "paste");
  $("#import-step-loading").classList.toggle("hidden", step !== "loading");
  $("#import-step-review").classList.toggle("hidden", step !== "review");
}

function setLookupProgress(done, total, label) {
  $("#lookup-bar").style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
  $("#lookup-status").textContent = label ? label + " — " + done + " / " + total : done + " / " + total;
}

async function runImport() {
  const parsed = parseDecklist($("#import-text").value, { joinWrapped: $("#opt-join").checked });
  if (!parsed.entries.length) { toast("Nothing to import — paste a decklist first"); return; }

  reviewEntries = parsed.entries;
  setLookupAborted(false);
  setNetworkDead(false);
  importStep("loading");
  setLookupProgress(0, reviewEntries.length, "Starting");

  reviewCards = await resolveEntries(reviewEntries, setLookupProgress);

  $("#lookup-status").textContent = "Downloading card images…";
  $("#lookup-bar").style.width = "0%";
  await cacheImages(reviewCards, setLookupProgress);
  await primeImages(reviewCards);

  renderReview(parsed.warnings);
  importStep("review");
}

function renderReview(warnings) {
  const warnBox = $("#review-warnings");
  warnBox.textContent = "";

  if (networkDead) {
    warnBox.appendChild(el("div", "note bad",
      "Couldn't reach Scryfall, so there's no art, rules text or rarity. The deck still plays " +
      "as text cards — re-import later on a connection to fill it in."));
  }

  const unresolved = reviewCards.filter((c) => !c.resolved).length;
  if (unresolved && !networkDead) {
    warnBox.appendChild(el("div", "note warn",
      unresolved + " card" + (unresolved === 1 ? " was" : "s were") + " not found on Scryfall — " +
      "they'll play as text cards with no rules text or rarity. Check their Token/Card flag."));
  }
  for (const w of warnings || []) {
    const n = el("div", "note warn", w);
    n.style.marginTop = "8px";
    warnBox.appendChild(n);
  }

  const rows = $("#review-rows");
  rows.textContent = "";
  reviewCards.forEach((card, i) => {
    const row = el("div", "review-row");

    const slot = el("div", "slot");
    const redraw = () => {
      slot.textContent = "";
      const btn = el("button", "cardbtn");
      btn.setAttribute("aria-label", "View " + card.name);
      btn.appendChild(cardFace(card, { badge: false }));
      btn.addEventListener("click", () => openCardDialog(card));
      slot.appendChild(btn);
    };
    redraw();
    row.appendChild(slot);

    const mid = el("div");
    const nameInput = el("input", "txt");
    nameInput.value = card.name;
    nameInput.setAttribute("aria-label", "Card name");
    nameInput.addEventListener("input", () => { card.name = nameInput.value; redraw(); });
    mid.appendChild(nameInput);
    mid.appendChild(el("div", "tiny muted",
      reviewEntries[i].qty + "× · " +
      cardMeta(card, { unknownType: "unknown type", notFound: true })));
    row.appendChild(mid);

    const toggle = el("button", "toggle", card.isToken ? "Token" : "Card");
    toggle.setAttribute("aria-pressed", String(card.isToken));
    toggle.title = "Under the non-token wave rule, only cards end a wave.";
    toggle.addEventListener("click", () => {
      card.isToken = !card.isToken;
      toggle.textContent = card.isToken ? "Token" : "Card";
      toggle.setAttribute("aria-pressed", String(card.isToken));
      redraw();
      updateReviewSummary();
    });
    row.appendChild(toggle);
    rows.appendChild(row);
  });
  updateReviewSummary();
}

function updateReviewSummary() {
  const total = reviewEntries.reduce((n, e) => n + e.qty, 0);
  const tokens = reviewCards.reduce((n, c, i) => n + (c.isToken ? reviewEntries[i].qty : 0), 0);
  $("#review-summary").textContent =
    total + " cards · " + tokens + " tokens · " + (total - tokens) + " non-token";
}

function saveImportedDeck() {
  const finish = () => {
    const decks = loadDecks();
    decks.push({
      id: "d_" + uid(),
      name: ($("#import-name").value || "").trim() || "Horde deck",
      createdAt: Date.now(),
      ruleset: "hordemagic",
      waveEnd: "rarity",
      enriched: true,
      entries: reviewCards.map((card, i) => ({ qty: reviewEntries[i].qty, card })),
    });
    saveDecks(decks);
    toast("Deck saved");
    renderDecks();
    showScreen("screen-decks");
  };

  // No non-token card means the Horde flips its whole library in one wave.
  if (!reviewCards.some((c) => !c.isToken)) {
    confirmDialog("Every card is marked as a token",
      "Under the non-token wave rule the Horde would cast its entire library in one wave. Save anyway?",
      finish);
    return;
  }
  finish();
}

/* ---- Ban list ---- */

/* From hordemagic.com/ban-list. These bind the survivors' EDH decks, not the
   Horde's library, so nothing here is enforced — the app carries the list so
   it can be checked at the table, offline. Grouped as the site groups them,
   which lists the three artifact creatures under both of their types. */
const BAN_LIST = [
  { type: "Creatures", cards: [
    "Elesh Norn, Grand Cenobite", "Magus of the Moat", "Massacre Wurm", "Plague Engineer",
    "Platinum Angel", "Platinum Emperion", "Rampaging Ferocidon", "Silent Arbiter",
    "Stormtide Leviathan", "Urabrask the Hidden",
  ] },
  { type: "Enchantments", cards: [
    "Aether Flash", "Aurification", "Authority of the Consuls", "Barbed Foliage",
    "Blind Obedience", "Dueling Grounds", "Island Sanctuary", "Lethal Vapors",
    "Leyline of Singularity", "No Mercy", "Pyrohemia", "Rest in Peace",
    "Solitary Confinement", "Tainted Aether", "Teferi's Moat",
  ] },
  { type: "Artifacts", cards: [
    "Caltrops", "Crawlspace", "Ensnaring Bridge", "Grindstone", "Platinum Angel",
    "Platinum Emperion", "Quietus Spike", "Silent Arbiter", "Trepanation Blade",
  ] },
  { type: "Sorceries", cards: [
    "Eradicate", "Haunting Echoes", "Mind Funeral", "Time Stretch",
  ] },
  { type: "Instants", cards: ["Surgical Extraction"] },
];

const BAN_COMBOS = [
  "Midnight Guard + Elemental Mastery",
  "Exquisite Blood + Sanguine Bond",
];

const BAN_RULES = [
  "Anything that forces the Horde's creatures to enter tapped",
  "Anything that kills the Horde's creatures as they enter",
  "Anything that mills the Horde when a permanent enters or leaves",
  "Anything that gains life off the cumulative power of the attackers",
  "Anything that makes the game mathematically too easy to win",
];

const BANNED_NAMES = Array.from(new Set(BAN_LIST.flatMap((g) => g.cards)));

/* Marks the matched run so a name found by search reads as a hit, not a list. */
function banName(name, query) {
  const li = el("li");
  const at = query ? name.toLowerCase().indexOf(query) : -1;
  if (at < 0) { li.textContent = name; return li; }
  li.appendChild(document.createTextNode(name.slice(0, at)));
  li.appendChild(el("mark", null, name.slice(at, at + query.length)));
  li.appendChild(document.createTextNode(name.slice(at + query.length)));
  return li;
}

function renderBans() {
  const query = $("#ban-search").value.trim().toLowerCase();
  const box = $("#ban-sections");
  box.textContent = "";

  let shown = 0;
  for (const group of BAN_LIST) {
    const cards = group.cards.filter((c) => !query || c.toLowerCase().includes(query));
    if (!cards.length) continue;
    shown += cards.length;
    const sec = el("div", "bansec");
    sec.appendChild(el("h3", null, group.type + " (" + cards.length + ")"));
    const ul = el("ul", "banlist");
    cards.forEach((c) => ul.appendChild(banName(c, query)));
    sec.appendChild(ul);
    box.appendChild(sec);
  }

  $("#ban-count").textContent = !query
    ? BANNED_NAMES.length + " cards are banned."
    : shown
      ? "Banned."
      : "Nothing on the ban list matches “" + $("#ban-search").value.trim() + "”.";

  const combos = $("#ban-combos");
  combos.textContent = "";
  BAN_COMBOS.forEach((c) => combos.appendChild(el("li", null, c)));
  const rules = $("#ban-rules");
  rules.textContent = "";
  BAN_RULES.forEach((r) => rules.appendChild(el("li", null, r)));
}

/* ---- Setup ---- */

let setupDeck = null;
let setupNames = ["", ""];
let setupRuleset = "hordemagic";
let setupWaveEnd = "rarity";
let setupWavePattern = "fixed";

function openSetup(deck) {
  setupDeck = deck;
  applyDeckTheme(deck);
  setupRuleset = defaultRulesetFor(deck);
  const rs = rulesetById(setupRuleset);
  setupWaveEnd = rs.waveEnd || deck.waveEnd || "rarity";
  setupWavePattern = rs.wavePattern || "fixed";
  $("#setup-deckname").textContent = deck.name;
  renderSetupPlayers();
  syncLife();
  renderSetupRules();
  showScreen("screen-setup");
}

function renderSetupPlayers() {
  const box = $("#setup-players");
  box.textContent = "";
  setupNames.forEach((name, i) => {
    const row = el("div", "row");
    const input = el("input", "txt grow");
    input.value = name;
    input.placeholder = "Survivor " + (i + 1);
    input.setAttribute("aria-label", "Survivor " + (i + 1) + " name");
    input.addEventListener("input", () => { setupNames[i] = input.value; });
    row.appendChild(input);
    if (setupNames.length > 1) {
      const rm = el("button", "btn sm ghost danger", "Remove");
      rm.addEventListener("click", () => { setupNames.splice(i, 1); renderSetupPlayers(); syncLife(); });
      row.appendChild(rm);
    }
    box.appendChild(row);
  });
}

/* What the game will actually be played under: a ruleset's fixed values, or
   the controls when the table is running house rules. */
function effectiveRules() {
  const rs = rulesetById(setupRuleset);
  if (!rs.custom) {
    return {
      ruleset: rs.id,
      waveEnd: rs.waveEnd,
      wavePattern: rs.wavePattern,
      life: sharedLifeFor(setupNames.length),
      setupTurns: rs.setupTurns,
      poisonLimit: rs.poisonLimit,
      legendaryRule: rs.legendaryRule,
    };
  }
  return {
    ruleset: rs.id,
    waveEnd: setupWaveEnd,
    wavePattern: setupWavePattern,
    life: Math.max(1, parseInt($("#setup-life").value, 10) || sharedLifeFor(setupNames.length)),
    setupTurns: Math.max(0, parseInt($("#setup-turns").value, 10) || 0),
    poisonLimit: Math.max(1, parseInt($("#setup-poison").value, 10) || 10),
    legendaryRule: $("#opt-legendary").checked,
  };
}

function ruleRows(r) {
  const n = setupNames.length;
  return [
    ["A wave ends on", waveEndText(r.waveEnd)],
    ["Waves per turn", wavePatternText(r.wavePattern)],
    ["Setup turns", r.setupTurns + " before the Horde's first turn"],
    ["Shared life", r.life + " — " + n + " survivor" + (n === 1 ? "" : "s") +
      " (100, then 15 less for each one after)"],
    ["Poison limit", String(r.poisonLimit)],
    ["Milled legendary", r.legendaryRule
      ? "enters the battlefield, then phases out"
      : "stays in the graveyard"],
  ];
}

function renderSetupRules() {
  const box = $("#opt-ruleset");
  if (!box.children.length) {
    RULESETS.forEach((r) => {
      const chip = el("button", "chip", r.name);
      chip.dataset.v = r.id;
      box.appendChild(chip);
    });
  }
  setChips("#opt-ruleset", setupRuleset);

  const rs = rulesetById(setupRuleset);
  $("#ruleset-blurb").textContent = rs.blurb;
  $("#setup-custom").hidden = !rs.custom;

  setChips("#opt-waveend", setupWaveEnd);
  setChips("#opt-wavepattern", setupWavePattern);

  // House rules edit the values in place, so the read-out would only repeat them.
  const list = $("#setup-rules");
  list.hidden = !!rs.custom;
  list.textContent = "";
  if (rs.custom) return;
  for (const [label, value] of ruleRows(effectiveRules())) {
    const row = el("div");
    row.appendChild(el("dt", null, label));
    row.appendChild(el("dd", null, value));
    list.appendChild(row);
  }
}

function syncLife() {
  const n = setupNames.length;
  $("#setup-life").value = sharedLifeFor(n);
  // A ruleset already prints the life total, so the note only has to explain it.
  $("#setup-lifenote").textContent =
    (rulesetById(setupRuleset).custom
      ? n + " survivor" + (n === 1 ? "" : "s") + " share " + sharedLifeFor(n) +
        " life (100 for the first, 15 less for each one after). "
      : "") +
    "Survivors take their turns together as one player.";
  if ($("#opt-ruleset").children.length) renderSetupRules();
}

/* ---- Game ---- */

async function startGame() {
  const deck = setupDeck;

  // Built-in decks carry only names until their first game; fill in art and
  // rarity now, since the rarity wave rule depends on it.
  if (deck.builtin && !deck.enriched && navigator.onLine !== false) {
    importStep("loading");
    showScreen("screen-import");
    $("#import-step-paste").classList.add("hidden");
    $("#import-step-review").classList.add("hidden");
    setLookupAborted(false);
    setNetworkDead(false);
    setLookupProgress(0, deck.entries.length, "Preparing " + deck.name);
    const entries = deck.entries.map((e) => ({ name: e.card.name, tokenHint: e.card.isToken }));
    const cards = await resolveEntries(entries, setLookupProgress);
    $("#lookup-status").textContent = "Downloading card images…";
    await cacheImages(cards, setLookupProgress);
    // Keep the decklist's own token flags: they are authoritative for waves.
    cards.forEach((c, i) => {
      c.isToken = deck.entries[i].card.isToken;
      c.catHint = c.catHint || deck.entries[i].card.catHint;
    });
    deck.entries = deck.entries.map((e, i) => ({ qty: e.qty, card: cards[i] }));
    if (networkDead) {
      // Don't cache a failed enrich as done, or the deck stays text-only forever.
      toast("Offline — playing with text cards");
    } else {
      deck.enriched = true;
      const saved = loadDecks().filter((d) => d.id !== deck.id);
      saved.push(deck);
      saveDecks(saved);
    }
  }

  const rules = effectiveRules();
  setG(newGame(deck, { players: setupNames, ...rules }));
  setUndoStack([]);
  setMillInput("");
  setLifeInput("");
  lastCreatureCount = null;
  await primeImages(Object.values(G.cards));
  logit("Shuffled " + G.library.length + " cards. " + rulesetById(rules.ruleset).name +
    ": waves end on " + waveEndText(rules.waveEnd) +
    ", " + wavePatternText(rules.wavePattern) + " per turn.");
  persistGame();
  renderGame();
  showScreen("screen-game");
}

async function resumeGame() {
  const saved = loadGame();
  if (!saved) return;
  setG(saved);
  setUndoStack([]);
  setMillInput("");
  setLifeInput("");
  lastCreatureCount = null;
  applyDeckTheme(allDecks().find((d) => d.id === G.deckId));
  await primeImages(Object.values(G.cards));
  if (shareWasOn) { setShareWasOn(false); shareStart(); }
  renderGame();
  showScreen("screen-game");
}

function renderGame() {
  if (!G) return;
  if (G.over) {
    $$("dialog[open]").forEach((d) => d.close());
    renderEnd();
    return;
  }

  $("#c-library").textContent = G.library.length;
  $("#c-board").textContent = creatureCount();
  $("#c-power").textContent = attackingPower() + (powerIsPartial() ? "+?" : "");
  $("#c-yard").textContent = yardTotal();
  $("#c-turn").textContent = G.turn;
  $("#game-rules").textContent = rulesetOfGame(G).name + " — waves end on " +
    waveEndText(G.waveEnd) + ", " + wavePatternText(G.wavePattern) + " per turn.";

  $("#tile-life-val").textContent = G.life;
  $("#tile-life").classList.toggle("low", G.life <= 20);
  $("#tile-damage-val").textContent = millInput ? "Mill " + millInput : "Mill";
  $("#life-n").textContent = G.life;
  $("#life-out").textContent = lifeInput || "0";
  $("#ld-lose").textContent = lifeInput ? "Lose " + lifeInput : "Lose";
  $("#ld-gain").textContent = lifeInput ? "Gain " + lifeInput : "Gain";
  $("#poison-n").textContent = G.poison;
  $("#poison-limit").textContent = "of " + G.poisonLimit;
  $("#mill-out").textContent = millInput || "0";
  $("#dd-sub").textContent = G.library.length + " cards left in the library.";
  $("#dd-mill").textContent = millInput ? "Mill " + millInput : "Mill";
  const pw = attackingPower();
  const takeAll = $("#life-all");
  takeAll.textContent = pw > 0 ? "Take all " + pw : "Nothing is attacking";
  takeAll.disabled = pw <= 0;
  $("#life-partial").hidden = !powerIsPartial();
  $("#btn-undo").disabled = undoStack.length === 0;

  renderStage();
  renderBoard();
  renderLog();
  renderGameActions();
  renderShare();
}

function waveChip(size, castSoFar) {
  const chip = el("div", "wave-chip");
  chip.appendChild(el("span", null, "Wave " + size));
  const dots = el("span", "dots");
  for (let i = 0; i < size; i++) {
    dots.appendChild(el("span", "dot" + (i < castSoFar ? " on" : "")));
  }
  chip.appendChild(dots);
  return chip;
}

/* The arena header names whose turn it is, so the stage below can lead with
   content instead of restating the phase. */
function setArenaPhase(phase, label) {
  $("#arena").dataset.phase = phase;
  $("#arena-phase-label").textContent = label;
}

function renderStage() {
  const body = $("#stage-body");
  body.textContent = "";
  const btn = $("#btn-action");

  if (G.phase === PHASE.SETUP) {
    setArenaPhase("setup", "Setup");
    body.appendChild(el("h2", "stage-title", "Survivors are digging in"));
    body.appendChild(el("p", "stage-oracle",
      G.setupTurnsLeft + " setup turn" + (G.setupTurnsLeft === 1 ? "" : "s") +
      " left before the Horde's first turn. Play lands, get something on the board."));
    btn.textContent = "End your turn";
    return;
  }

  if (G.phase === PHASE.SURVIVORS) {
    setArenaPhase("survivors", "Your turn");
    body.appendChild(waveChip(currentWaveSize(), 0));
    body.appendChild(el("h2", "stage-title", "The Horde is holding"));
    body.appendChild(el("p", "stage-oracle",
      "Attack, block, cast. Damage you deal to the Horde goes in the pad and mills it. " +
      "Kill its creatures by tapping them below. The next wave is " + currentWaveSize() + "."));
    btn.textContent = "Take the Horde's turn";
    if (G.milledLegends.length) renderMilledLegends(body);
    return;
  }

  if (G.phase === PHASE.REVEAL) {
    if (!G.revealed.length) {
      setArenaPhase("reveal", "The Horde is spent");
      body.appendChild(el("h2", "stage-title", "Empty library"));
      body.appendChild(el("p", "stage-oracle",
        "The Horde has nothing left to cast. Clear its board and you've won."));
      btn.textContent = "Continue";
      return;
    }
    setArenaPhase("reveal", "The Horde casts");
    renderRevealStage(body);
    btn.textContent = "Finish casting";
    return;
  }

  // COMBAT
  const power = attackingPower();
  const count = attackers().reduce((n, s) => n + s.count, 0);
  const defenders = creatureCount() - count;
  setArenaPhase("combat", "The Horde attacks");
  const creatures = count + " creature" + (count === 1 ? "" : "s");
  /* Offline imports can have no stats at all, so lead with the count rather
     than a power total that would read "0+". */
  const noPower = power === 0 && powerIsPartial();
  body.appendChild(el("h2", "stage-title",
    !count ? "Nothing attacks this turn"
    : noPower ? creatures + " coming at you"
    : power + (powerIsPartial() ? "+" : "") + " power coming at you"));
  if (count) {
    body.appendChild(el("p", "stage-type",
      noPower ? "Their power isn't known here — read it off the cards."
      : creatures + " attacking" +
        (powerIsPartial() ? " — some stats are unknown, check the cards." : ".")));
  }
  const oracle = el("p", "stage-oracle");
  oracle.append("Everything is ", termBtn("goaded", "goaded"), " and attacking.");
  if (defenders) {
    oracle.append(" " + defenders + " with ", termBtn("Defender", "defender"), " stayed back to block.");
  }
  oracle.append(" Block what you can, then take the rest off the shared life total.");
  body.appendChild(oracle);
  if (count) {
    /* Combat used to redraw every attacker here at 160px tiles \u2014 the board
       panel below restated above it, larger, which pushed the panel itself
       further down the page exactly when it was being read. The roster names
       what is coming without drawing it twice, and the board panel is the one
       place creatures are rendered. The chips stay tappable: reading a card
       mid-combat is the reason to look at the list, so each one opens the same
       stack sheet the tile did. */
    const roster = el("div", "stage-roster");
    for (const stack of attackers()) {
      const chip = el("button", "roster-chip",
        G.cards[stack.cardKey].name + (stack.count > 1 ? " \u00d7" + stack.count : ""));
      chip.type = "button";
      chip.addEventListener("click", () => openStackDialog(stack));
      roster.appendChild(chip);
    }
    body.appendChild(roster);
    const jump = el("button", "btn sm ghost", "Review the board \u2193");
    jump.addEventListener("click", jumpToBoard);
    body.appendChild(jump);
  }
  btn.textContent = "Finish attacking";
}

function renderMilledLegends(body) {
  const box = el("div", "note warn");
  box.style.marginTop = "12px";
  box.textContent = "Milled legendary: " +
    G.milledLegends.map((k) => G.cards[k].name).join(", ") +
    " — put it onto the battlefield, trigger its ETB, then phase it out.";
  body.appendChild(box);
}

function renderRevealStage(body) {
  const heroIdx = G.revealed.length - 1;
  const hero = G.cards[G.revealed[heroIdx]];

  body.appendChild(waveChip(waveSizeFor(G.hordeTurn, G.wavePattern),
    G.revealed.filter((k) => isWaveEnder(G.cards[k], G.waveEnd)).length));

  const wrapEl = el("div", "stage-hero flipin");
  wrapEl.appendChild(cardSlot(hero, { rule: G.waveEnd },
    () => openCardDialog(G.revealed[heroIdx])));

  const meta = el("div", "meta");
  meta.appendChild(el("h2", "stage-title", hero.name));
  const kw = el("p", "stage-type");
  if (hero.isLegendary) kw.appendChild(el("span", "kw leg", "Legendary"));
  if (hero.hasDefender) kw.appendChild(termBtn("Defender", "defender", "kw def"));
  kw.appendChild(document.createTextNode(cardMeta(hero)));
  meta.appendChild(kw);

  // A wave can hold more than one spell, and each rolled its own victim, so
  // every target gets a row. With several, the label names the spell.
  const spellIdxs = Object.keys(G.spellTargets);
  for (const idx of spellIdxs) {
    const target = G.players.find((p) => p.id === G.spellTargets[idx]);
    if (!target) continue;
    const t = el("div", "target");
    t.appendChild(el("span", "small muted",
      spellIdxs.length > 1 ? G.cards[G.revealed[idx]].name : "Random target"));
    t.appendChild(el("span", "who", target.name));
    if (!viewerMode) {
      const re = el("button", "btn sm ghost", "Re-roll");
      re.addEventListener("click", () => { rerollTarget(idx); renderGame(); });
      t.appendChild(re);
    }
    meta.appendChild(t);
  }

  if (hero.oracleText) meta.appendChild(el("p", "stage-oracle", hero.oracleText));
  if (!hero.resolved) {
    meta.appendChild(el("div", "note warn",
      "Not found on Scryfall, so there's no rules text here — play it from the paper card or memory."));
  }
  wrapEl.appendChild(meta);
  body.appendChild(wrapEl);

  if (G.revealed.length > 1) {
    body.appendChild(el("h3", "small muted", "Cast this wave, in order"));
    const grid = el("div", "cardgrid");
    G.revealed.forEach((key) => {
      grid.appendChild(cardSlot(G.cards[key], { rule: G.waveEnd, slotClass: "flipin" },
        () => openCardDialog(key)));
    });
    body.appendChild(grid);
  }
}

function renderBoard() {
  const box = $("#board");
  box.textContent = "";
  $("#board-empty").hidden = G.board.length > 0;

  const total = creatureCount();
  const atk = attackers().reduce((n, s) => n + s.count, 0);
  const def = total - atk;
  const withCounters = G.board.reduce((n, s) => n + (hasCounters(s) ? s.count : 0), 0);
  $("#board-summary").textContent = G.board.length
    ? total + " creatures · " + atk + " attacking" +
      (def ? " · " + def + " holding back" : "") +
      (withCounters ? " · " + withCounters + " with counters" : "")
    : "";

  $("#board-panel").classList.toggle("live", G.board.length > 0);
  const tile = $("#tile-board");
  tile.classList.toggle("live", G.board.length > 0);
  // The label carries the count, which an aria-label would otherwise hide.
  tile.setAttribute("aria-label",
    total + (total === 1 ? " creature" : " creatures") + " on the Horde's board — jump to it");

  // Only a board that grew is worth interrupting for. A shrinking one is
  // something the survivors just did on purpose, and the first render of a
  // game — new or resumed — has nothing to announce.
  if (lastCreatureCount != null && total > lastCreatureCount) flashBoardChange();
  lastCreatureCount = total;

  for (const stack of G.board) {
    const card = G.cards[stack.cardKey];
    box.appendChild(cardSlot(card, { count: stack.count, rule: G.waveEnd, stack },
      () => openStackDialog(stack)));
  }
}

/* The arena at the top of the page is where the eye is during a turn, so the
   board announcing itself only down in its own panel would go unseen. The
   tally cell above the fold flares with it, and leads back down. */
let lastCreatureCount = null;

function flashBoardChange() {
  for (const node of [$("#board-panel"), $("#tile-board")]) {
    node.classList.remove("bump");
    void node.offsetWidth;  // restart the animation if it's still running
    node.classList.add("bump");
  }
}

function jumpToBoard() {
  const panel = $("#board-panel");
  panel.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
  // Focus follows the scroll, so a keyboard or screen-reader user lands on the
  // board rather than being left back up in the tally.
  panel.focus({ preventScroll: true });
}

/* What's in the graveyard, collapsed the way the board is: one tile per card
   with a count. Worth having on tap \u2014 plenty of horde cards care about it
   (Grave Betrayal, Footbottom Feast, Unbreathing Horde), and it's otherwise the
   one part of the game state with no way to look at it. */
function yardTotal() {
  return G.yardCount != null ? G.yardCount : G.graveyard.length;
}

function yardStacks() {
  const counts = new Map();
  // Skip anything with no card behind it: a viewer whose snapshot had to drop
  // the breakdown still has a count, and sorting on a missing name would throw.
  for (const key of G.graveyard) {
    if (G.cards[key]) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([cardKey, count]) => ({ cardKey, count }))
    .sort((a, b) => b.count - a.count ||
      G.cards[a.cardKey].name.localeCompare(G.cards[b.cardKey].name));
}

function renderYard() {
  const stacks = yardStacks();
  const grid = $("#yd-grid");
  grid.textContent = "";
  const total = yardTotal();
  $("#yd-empty").hidden = stacks.length > 0 || total > 0;
  $("#yd-sub").textContent = stacks.length
    ? total + " card" + (total === 1 ? "" : "s") + " \u00b7 " +
      stacks.length + " distinct \u00b7 " + G.library.length + " left in the library"
    : total
      // A viewer on a big board: the count came through, the cards didn't.
      ? total + " cards, too many to send to a viewer \u2014 look at the game screen."
      : G.library.length + " cards left in the library.";
  for (const stack of stacks) {
    grid.appendChild(cardSlot(G.cards[stack.cardKey],
      { count: stack.count, rule: G.waveEnd },
      () => openCardDialog(stack.cardKey)));
  }
}

function renderLog() {
  const box = $("#log");
  box.textContent = "";
  for (const entry of G.log) {
    const li = el("li");
    li.appendChild(el("span", "t", "R" + entry.t));
    li.appendChild(document.createTextNode(entry.msg));
    box.appendChild(li);
  }
  /* A viewer can join a game whose shared snapshot carried no entries — the
     log is the first thing dropped when a snapshot won't fit. On a board that
     plainly has a history, that empty state is a trim, not a quiet game, and
     saying "nothing has happened" would be a lie. */
  const empty = $("#log-empty");
  empty.hidden = G.log.length > 0;
  empty.textContent = viewerMode && (G.board.length || yardTotal())
    ? "The log was too long to send to a viewer \u2014 look at the game screen."
    : "Nothing has happened yet.";
}

/* Undo, the random survivor, the log and End game live in the header now, so
   like Share they answer to the game rather than to the screen they used to
   sit on: nothing to act on unless a game is up. A viewer reads the log —
   it came over the wire with the board — but drives none of the rest. */
function renderGameActions() {
  const live = !!G && $("#screen-game").classList.contains("active");
  $("#btn-log").hidden = !live;
  for (const id of ["#btn-undo", "#btn-random", "#btn-quit"]) {
    $(id).hidden = !live || viewerMode;
  }
}

const CONFETTI_COLORS = ["#c2b08a", "#efe5cf", "#4d9a72", "#6d5bd0", "#8b7b63", "#e8586a"];

/* Ash is the confetti's opposite and the palette says so first: no accent, no
   token purple, just the greys of a board that has finished burning, with one
   dull ember in the mix so it isn't flat. They are lighter than the page
   rather than darker — ash catches the light it is drifting through, and the
   first pass, picked to sit near the background, read as a dirty screen. */
const ASH_COLORS = ["#a79d8d", "#8d8474", "#c0b6a4", "#7a7264", "#b4aa98", "#9c5f4c"];

/* The end screen gets weather either way. A win drops confetti from the top:
   90 bright chips, quick, tumbling end over end. A loss gets the inverse on
   every axis — two thirds as many motes, grey, round instead of chipped, rising off
   the board instead of falling onto it, slow enough to read as settling smoke,
   and fading out before they clear the page rather than landing.

   Either way it is skipped entirely under prefers-reduced-motion rather than
   spawned and then hidden by CSS. */
function renderEndWeather(won) {
  const box = $("#end-weather");
  box.textContent = "";
  box.className = won ? "confetti" : "ash";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  if (won) {
    for (let i = 0; i < 90; i++) {
      const piece = el("i");
      piece.style.left = (Math.random() * 100) + "%";
      piece.style.width = (6 + Math.random() * 5) + "px";
      piece.style.height = (10 + Math.random() * 8) + "px";
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.setProperty("--drift", Math.round((Math.random() - .5) * 160) + "px");
      piece.style.animationDuration = (2.6 + Math.random() * 1.8) + "s";
      piece.style.animationDelay = (Math.random() * -4) + "s";
      box.appendChild(piece);
    }
    return;
  }

  for (let i = 0; i < 60; i++) {
    const mote = el("i");
    const size = 2 + Math.random() * 5;
    mote.style.left = (Math.random() * 100) + "%";
    mote.style.width = size + "px";
    mote.style.height = size + "px";
    mote.style.background = ASH_COLORS[i % ASH_COLORS.length];
    /* Wider wander than the confetti's drift: nothing is pulling ash down, so
       it has the whole climb to be pushed sideways. */
    mote.style.setProperty("--drift", Math.round((Math.random() - .5) * 260) + "px");
    /* The smaller motes read as further off, so they sit fainter. */
    mote.style.setProperty("--peak", String((size < 4 ? .34 : .52) + Math.random() * .22));
    mote.style.animationDuration = (7 + Math.random() * 6) + "s";
    mote.style.animationDelay = (Math.random() * -13) + "s";
    box.appendChild(mote);
  }
}

function renderEnd() {
  const won = G.over === "survivors";
  $("#end-title").textContent = won ? "The Horde falls." : "The Horde wins.";
  $("#end-sub").textContent = won
    ? "Library empty, board clear — you made it out after " + (G.turn - 1) + " rounds."
    : "The survivors are down after " + (G.turn - 1) + " rounds.";
  renderEndWeather(won);

  const stats = $("#end-stats");
  stats.textContent = "";
  const rows = [
    [G.turn - 1, "Rounds"],
    [G.library.length, "Left in library"],
    [yardTotal(), "Graveyard"],
    [G.peakCreatures || 0, "Peak board"],
  ];
  for (const [n, k] of rows) {
    const box = el("div", "t");
    box.appendChild(el("span", "n", String(n)));
    box.appendChild(el("span", "k", k));
    stats.appendChild(box);
  }
  $("#btn-again").hidden = viewerMode;
  $("#btn-end-home").textContent = viewerMode ? "Stop watching" : "Back to decks";
  showScreen("screen-end");
}

/* Written from other modules; ESM bindings are read-only across files. */
export const setLastCreatureCount = (v) => { lastCreatureCount = v; };
export const setSetupWaveEnd = (v) => { setupWaveEnd = v; };
export const setSetupWavePattern = (v) => { setupWavePattern = v; };
export const setSetupRuleset = (v) => { setupRuleset = v; };

export {
  allDecks, effectiveRules, hydrateBundled, importStep, jumpToBoard, lastCreatureCount,
  openSetup, renderBans, renderDecks, renderGame, renderGameActions, renderLog, renderReview,
  renderSetupPlayers, renderSetupRules, renderYard, resumeGame, reviewCards, runImport,
  saveImportedDeck, setArenaPhase, setupNames, setupRuleset, setupWaveEnd, setupWavePattern,
  showScreen, startGame, syncLife, yardStacks, yardTotal,
};
