/* The game itself: the Horde's turn, the board, damage as mill, and the rules each ruleset fixes. */

import { $$, pick, shuffle, toast } from "./helpers.js";
import { persistGame } from "./persistence.js";
import { categoryOf } from "./cards.js";
import { renderGame } from "./screens.js";
import { tokenLabel } from "./copies.js";

/* =========================================================================
   Game state

   G.library / G.graveyard hold card keys (duplicates allowed); G.cards is the
   deck's key -> card dictionary. Board stacks are {cardKey, count, counters},
   so 145 Vampire tokens are one tile rather than 145 — and the two of them
   carrying a +1/+1 counter are a tile of their own.
   ========================================================================= */

let G = null;
let undoStack = [];
let millInput = "";
let lifeInput = "";

const PHASE = { SETUP: "setup", SURVIVORS: "survivors", REVEAL: "reveal", COMBAT: "combat" };
const SNAKE = [1, 2, 3, 2]; // 1,2,3,2,1,2,3,2,1...

/* Per hordemagic.com: 100 life for one survivor, 15 less for each one after. */
const sharedLifeFor = (n) => Math.max(1, 100 - 15 * (Math.max(1, n) - 1));

/* The two wave-end rules in circulation aren't a preference, they come from
   two different rule documents — hordemagic.com ends a wave on an uncommon,
   rare or mythic; the original 2011 rules end it on a non-token card. Picking
   one card-by-card produces a game neither document describes, so they travel
   as whole rulesets. The values a ruleset fixes are printed on the setup
   screen rather than hidden behind the choice, and only "House rules" hands
   the individual controls back. */
const RULESETS = [
  {
    id: "hordemagic",
    name: "Horde Magic",
    blurb: "The rules published at hordemagic.com. One wave per turn, ending on the first uncommon or better.",
    waveEnd: "rarity",
    wavePattern: "fixed",
    setupTurns: 3,
    poisonLimit: 10,
    legendaryRule: true,
  },
  {
    id: "hordemagic-waves",
    name: "Horde Magic — escalating waves",
    blurb: "The same rules, plus the optional wave count they list: 1, 2, 3, 2, 1, 2, 3…",
    waveEnd: "rarity",
    wavePattern: "snake",
    setupTurns: 3,
    poisonLimit: 10,
    legendaryRule: true,
  },
  {
    id: "original",
    name: "Original Horde",
    blurb: "The 2011 wave rule the Zombies-style lists are built for: every token rides along, the wave stops on the first real card. The table rules follow hordemagic.com.",
    waveEnd: "nontoken",
    wavePattern: "fixed",
    setupTurns: 3,
    poisonLimit: 10,
    legendaryRule: true,
  },
  {
    id: "house",
    name: "House rules",
    blurb: "Set every value yourself.",
    custom: true,
  },
];

const rulesetById = (id) => RULESETS.find((r) => r.id === id) || RULESETS[0];

/* Chips are a radio group built out of buttons, so the selected one is marked
   with aria-pressed rather than a checked input. */
const setChips = (containerSel, value) =>
  $$(containerSel + " .chip").forEach((c) =>
    c.setAttribute("aria-pressed", String(c.dataset.v === value)));

/* A decklist is built for a wave rule, so the deck picks the opening ruleset. */
function defaultRulesetFor(deck) {
  if (deck.ruleset && RULESETS.some((r) => r.id === deck.ruleset)) return deck.ruleset;
  return deck.waveEnd === "nontoken" ? "original" : "hordemagic";
}

/* Games saved before rulesets existed carry only the two settings. */
function rulesetOfGame(g) {
  if (g.ruleset) return rulesetById(g.ruleset);
  const hit = RULESETS.find((r) => !r.custom &&
    r.waveEnd === g.waveEnd && r.wavePattern === g.wavePattern);
  return hit || rulesetById("house");
}

const waveEndText = (v) =>
  v === "rarity" ? "an uncommon, rare or mythic card" : "a non-token card";
const wavePatternText = (v) => (v === "snake" ? "1, 2, 3, 2, 1…" : "1");

function waveSizeFor(hordeTurn, pattern) {
  if (pattern !== "snake") return 1;
  return SNAKE[(Math.max(1, hordeTurn) - 1) % SNAKE.length];
}

/* A wave ends when the Horde casts a wave-ender. Which cards count depends on
   the deck: the Zombies horde ends waves on non-token cards, while the Eldrazi
   and D&D hordes end them on an uncommon/rare/mythic. */
function isWaveEnder(card, rule) {
  if (rule === "rarity") {
    if (card.rarity) return /^(uncommon|rare|mythic)$/.test(card.rarity);
    // Unknown rarity (offline import): non-tokens are the best available proxy.
    return !card.isToken;
  }
  return !card.isToken;
}

function newGame(deck, opts) {
  const cards = {};
  const library = [];
  for (const entry of deck.entries) {
    cards[entry.card.key] = entry.card;
    for (let i = 0; i < entry.qty; i++) library.push(entry.card.key);
  }
  shuffle(library);

  return {
    deckId: deck.id,
    deckName: deck.name,
    cards,
    library,
    graveyard: [],
    board: [],
    revealed: [],
    spellTargets: {},     // index into G.revealed -> player id
    milledLegends: [],    // card keys milled by damage this mill, for the ETB rule
    players: opts.players.map((name, i) => ({ id: "p" + i, name: name || "Survivor " + (i + 1) })),
    life: opts.life,
    poison: 0,
    poisonLimit: opts.poisonLimit,
    ruleset: opts.ruleset,
    waveEnd: opts.waveEnd,
    wavePattern: opts.wavePattern,
    legendaryRule: opts.legendaryRule,
    peakCreatures: 0,     // high-water mark of the board, for the end screen
    hordeTurn: 0,         // how many turns the Horde has actually taken
    turn: 1,
    setupTurnsLeft: opts.setupTurns,
    phase: opts.setupTurns > 0 ? PHASE.SETUP : PHASE.SURVIVORS,
    log: [],
    over: null,
  };
}

function snapshot() {
  undoStack.push(JSON.stringify(G));
  if (undoStack.length > 25) undoStack.shift();
}
function undo() {
  const prev = undoStack.pop();
  if (!prev) { toast("Nothing to undo"); return; }
  G = JSON.parse(prev);
  millInput = "";
  lifeInput = "";
  persistGame();
  renderGame();
  toast("Undone");
}

function logit(msg) {
  G.log.unshift({ t: G.turn, msg });
  if (G.log.length > 150) G.log.pop();
  announce(msg);
}

/* ---- Announcements ----

   The log is the running account of what the Horde just did, and until now it
   was only readable — you had to open the sheet and look. logit() is the one
   funnel every game event passes through, so hanging the live region off it
   covers the whole app rather than the handful of places someone remembered.

   One action can log several lines (a wave puts out four creatures, then
   attacks), and a live region given four rapid writes announces the last one
   and drops the rest. So they are collected and flushed together on the next
   microtask, by which point the action has finished logging. */
let srQueue = [];

function announce(msg) {
  srQueue.push(msg);
  if (srQueue.length === 1) queueMicrotask(flushAnnouncements);
}

function flushAnnouncements() {
  const text = srQueue.join(". ");
  srQueue = [];
  const el = document.getElementById("sr-status");
  if (!el) return;
  /* A live region announces a *change*. Two identical waves in a row would
     write the same string twice and the second would pass in silence, so the
     region is cleared first and filled on the next frame — two mutations, and
     the repeat is spoken like any other. */
  el.textContent = "";
  requestAnimationFrame(() => { el.textContent = text; });
}

/* ---- Counters ----

   A board stack is one tile: copies of a card that are identical to each
   other. Counters break that identity — the two Squirrels carrying a +1/+1
   counter are not the same permanent as the four without one — so a stack is
   keyed by its card *and* its counters, and putting counters on some of a
   stack splits those copies onto a tile of their own.

   stack.counters maps a counter name to how many each copy in the stack
   carries: {"+1/+1": 2}. It's absent on a stack that has none, which is most
   of them, and every stack in a game saved before counters existed. */
const PLUS_COUNTER = "+1/+1";
const MINUS_COUNTER = "-1/-1";

/* Drops zeroes and sorts by name, so the same counters arrived at two
   different ways are one tile rather than two that never merge. */
function normCounters(counters) {
  const out = {};
  for (const name of Object.keys(counters || {}).sort()) {
    const n = Math.max(0, Math.round(Number(counters[name]) || 0));
    if (n > 0) out[name] = n;
  }
  return out;
}
const counterEntries = (stack) => Object.entries(normCounters(stack && stack.counters));
const hasCounters = (stack) => counterEntries(stack).length > 0;

/* A tile's identity, stable across renders: the board is rebuilt from state on
   every action, so an index would go stale under an open dialog. */
const stackId = (stack) =>
  stack.cardKey + "#" + counterEntries(stack).map(([name, n]) => name + "\u00d7" + n).join(",");

/* Accepts a stack id, or a bare card key meaning the tile with no counters. */
function findStack(id) {
  if (!G || !id) return null;
  return G.board.find((s) => stackId(s) === id) || G.board.find((s) => s.cardKey === id) || null;
}

/* How many of a card are out, across every tile its counters split it into. */
const countOnBoard = (cardKey) =>
  G.board.reduce((n, s) => n + (s.cardKey === cardKey ? s.count : 0), 0);

/* "+1/+1 ×2 · stun" — what the tile, the card view and the log all print. */
const countersLabel = (stack) =>
  counterEntries(stack).map(([name, n]) => (n > 1 ? name + " \u00d7" + n : name)).join(" \u00b7 ");

/* The card's name, plus its counters when it has any: two tiles of Squirrel
   have to read differently in the log. */
const stackLabel = (stack) =>
  G.cards[stack.cardKey].name + (hasCounters(stack) ? " (" + countersLabel(stack) + ")" : "");

/* +1/+1 and −1/−1 counters move the stats, and the app does that arithmetic
   because the attacking total depends on it. Every other counter — stun,
   charge, whatever the trigger names — is tracked and shown, and left to the
   players to apply: reading what a counter does is a rules engine's job, not
   a scorekeeper's. */
function effectivePT(stack) {
  const card = G.cards[stack.cardKey];
  if (!card) return null;
  const p = parseInt(card.power, 10);
  const t = parseInt(card.toughness, 10);
  if (!Number.isFinite(p) || !Number.isFinite(t)) return null;
  const c = normCounters(stack.counters);
  const d = (c[PLUS_COUNTER] || 0) - (c[MINUS_COUNTER] || 0);
  return { power: p + d, toughness: t + d };
}

const boardCreatures = () => G.board.filter((s) => categoryOf(G.cards[s.cardKey]) === "creature");
const attackers = () => boardCreatures().filter((s) => !G.cards[s.cardKey].hasDefender);
const creatureCount = () => boardCreatures().reduce((n, s) => n + s.count, 0);
function attackingPower() {
  return attackers().reduce((n, s) => {
    const pt = effectivePT(s);
    // Shrunk below zero a creature deals no damage; it doesn't heal anyone.
    return n + (pt ? Math.max(0, pt.power) * s.count : 0);
  }, 0);
}

/* True when some attacker's power is unknown — an offline deck has names but
   no stats, and reporting a confident "0" there would be a lie. */
function powerIsPartial() {
  return attackers().some((s) => !Number.isFinite(parseInt(G.cards[s.cardKey].power, 10)));
}

/* The high-water mark of the Horde's board, kept for the end screen. Games
   saved before it existed simply start counting from now. */
function notePeak() {
  const n = creatureCount();
  if (n > (G.peakCreatures || 0)) G.peakCreatures = n;
}

/* Joins the tile whose counters match, so a creature entering with none lands
   on the plain tile however many countered ones are already out. */
function addToBoard(cardKey, n = 1, counters = null) {
  const want = stackId({ cardKey, counters });
  const hit = G.board.find((s) => stackId(s) === want);
  if (hit) { hit.count += n; return hit; }
  const stack = { cardKey, count: n };
  const c = normCounters(counters);
  if (Object.keys(c).length) stack.counters = c;
  G.board.push(stack);
  return stack;
}
/* Creatures that die land in the graveyard; their counters cease to exist with
   them, so nothing follows them there. Tokens taken back off by a quantity
   correction never really entered, so they leave without one — otherwise
   fixing a miscount would quietly pad Grave Betrayal's food. */
function removeFromStack(stack, n, toYard = true) {
  const i = G.board.indexOf(stack);
  if (i < 0) return 0;
  const killed = Math.min(n, stack.count);
  stack.count -= killed;
  if (stack.count <= 0) G.board.splice(i, 1);
  if (toYard) for (let k = 0; k < killed; k++) G.graveyard.push(stack.cardKey);
  return killed;
}

/* ---- The Horde's turn ---- */

function currentWaveSize() {
  return waveSizeFor(G.hordeTurn + 1, G.wavePattern);
}

function flipHordeTurn() {
  snapshot();
  G.hordeTurn++;
  G.revealed = [];
  G.spellTargets = {};
  G.milledLegends = [];

  const want = waveSizeFor(G.hordeTurn, G.wavePattern);
  let enders = 0;
  while (G.library.length && enders < want) {
    const key = G.library.pop();
    G.revealed.push(key);
    if (isWaveEnder(G.cards[key], G.waveEnd)) enders++;
  }

  if (!G.revealed.length) {
    logit("The Horde's library is empty — nothing to cast.");
  } else {
    logit("Wave " + want + ": cast " + G.revealed.length + " card" +
      (G.revealed.length === 1 ? "" : "s") + ".");
    if (enders < want) logit("The library ran out before the wave finished.");
  }

  // Spells roll their victim now so the target is visible before it resolves.
  G.revealed.forEach((key, i) => {
    if (categoryOf(G.cards[key]) === "spell") {
      const target = pick(G.players);
      if (target) G.spellTargets[i] = target.id;
    }
  });

  G.phase = PHASE.REVEAL;
  checkEnd();
  persistGame();
}

function resolveReveal() {
  snapshot();
  for (let i = 0; i < G.revealed.length; i++) {
    const key = G.revealed[i];
    const card = G.cards[key];
    if (categoryOf(card) === "spell") {
      const target = G.players.find((p) => p.id === G.spellTargets[i]);
      logit(card.name + " resolves" + (target ? " — random target: " + target.name : "") + ".");
      G.graveyard.push(key);
    } else {
      addToBoard(key, 1);
      logit(card.name + " enters the battlefield.");
      fireEtbTriggers(card, 1);
    }
  }
  G.revealed = [];
  G.spellTargets = {};
  G.phase = PHASE.COMBAT;
  notePeak();
  checkEnd();
  persistGame();
}

function endHordeTurn() {
  snapshot();
  G.turn++;
  G.phase = PHASE.SURVIVORS;
  G.milledLegends = [];
  persistGame();
}

function endSetupTurn() {
  snapshot();
  G.setupTurnsLeft--;
  G.turn++;
  if (G.setupTurnsLeft <= 0) {
    G.phase = PHASE.SURVIVORS;
    logit("Setup over — the Horde wakes up.");
  }
  persistGame();
}

/* ---- Damage, mill, life ---- */

function millCards(n) {
  if (!(n > 0)) return;
  snapshot();
  const moved = Math.min(n, G.library.length);
  const legends = [];
  for (let i = 0; i < moved; i++) {
    const key = G.library.pop();
    G.graveyard.push(key);
    if (G.legendaryRule && G.cards[key].isLegendary) legends.push(key);
  }
  logit(n + " damage to the Horde — milled " + moved + " card" + (moved === 1 ? "" : "s") + ".");
  if (moved < n) logit("The library ran out mid-mill.");

  // Recommended rule: a legendary milled by damage enters the battlefield and
  // immediately phases out. Surface it rather than resolving it silently, and
  // add to the reminder rather than replacing it — two mills in one turn are
  // ordinary, and the first legendary is still owed its ETB.
  G.milledLegends = (G.milledLegends || []).concat(legends);
  for (const key of legends) {
    logit(G.cards[key].name + " was milled — it enters the battlefield, then phases out.");
  }

  checkEnd();
  persistGame();
}

function adjustLife(delta) {
  snapshot();
  const before = G.life;
  G.life = Math.max(0, G.life + delta);
  if (G.life !== before) {
    logit((delta < 0 ? "Survivors take " + (before - G.life) : "Survivors gain " + (G.life - before)) +
      " \u2014 " + G.life + " life.");
  }
  if (G.life === 0) logit("The survivors are out of life.");
  checkEnd();
  persistGame();
}

function adjustPoison(delta) {
  snapshot();
  const before = G.poison;
  G.poison = Math.max(0, G.poison + delta);
  if (G.poison !== before) logit("Poison: " + G.poison + " of " + G.poisonLimit + ".");
  checkEnd();
  persistGame();
}

/* Takes a stack id — the tile that was tapped — because a card split across
   tiles by its counters has more than one "one" to kill. A bare card key still
   works, and means the tile with no counters on it. */
function killFromStack(id, n) {
  const stack = findStack(id);
  if (!stack) return;
  snapshot();
  const label = stackLabel(stack);
  const killed = removeFromStack(stack, n);
  if (killed) logit(killed + "× " + label + " destroyed.");
  checkEnd();
  persistGame();
}

/* Counters land on permanents, not on tiles: putting a +1/+1 counter on two of
   six Squirrels moves those two onto their own tile and leaves four behind.
   One call covers the lot — adding a counter, taking one off, correcting what
   a stack carries — because they're all the same move: n of this tile now
   carry exactly these counters. */
function setStackCounters(id, howMany, counters) {
  const from = findStack(id);
  if (!from) return null;
  const n = Math.min(Math.max(1, Math.round(howMany || 0)), from.count);
  const next = normCounters(counters);
  if (stackId({ cardKey: from.cardKey, counters: next }) === stackId(from)) return from;
  snapshot();
  const was = countersLabel(from);
  from.count -= n;
  if (from.count <= 0) G.board.splice(G.board.indexOf(from), 1);
  const to = addToBoard(from.cardKey, n, next);
  logit(n + "\u00d7 " + G.cards[to.cardKey].name + ": " +
    (hasCounters(to) ? countersLabel(to) : "counters removed" + (was ? " (was " + was + ")" : "")) + ".");
  persistGame();
  return to;
}

/* "+1" on a tile: one more of exactly what the tile shows, counters and all,
   because the trigger that made it copied the creature in front of you. A
   fresh one with no counters comes off the plain tile, or + Create tokens. */
function duplicateStack(id) {
  const stack = findStack(id);
  if (!stack) return;
  snapshot();
  addToBoard(stack.cardKey, 1, stack.counters);
  logit("+1 " + stackLabel(stack) + " token.");
  fireEtbTriggers(G.cards[stack.cardKey], 1);
  notePeak();
  persistGame();
}

/* Tokens put onto the battlefield by hand — by Hare Apparent and Empty the
   Warrens, but equally by Skeletal Swarming or Rite of Belzenlok, whose tokens
   the library never contains. A manual add, not a draw: the library, graveyard
   and wave count are all untouched. A token type the deck didn't define joins
   G.cards here, so it stacks, persists and is one tap away next time. */
function createTokens(card, n) {
  snapshot();
  if (!G.cards[card.key]) G.cards[card.key] = card;
  addToBoard(card.key, n);
  logit("+" + n + " " + tokenLabel(card, n) + ".");
  fireEtbTriggers(card, n);
  notePeak();
  persistGame();
}

/* Fixing a stack that's already out: you made six Zombies and meant eight, or
   the paper count drifted. Up is the same manual add as + Create tokens; down
   takes the extras off without a trip through the graveyard. */
function setTokenCount(id, n) {
  const stack = findStack(id);
  if (!stack || !(n >= 0) || n === stack.count) return;
  const have = stack.count;
  const label = stackLabel(stack);   // read before the stack can be spliced out
  snapshot();
  if (n > have) {
    addToBoard(stack.cardKey, n - have, stack.counters);
    logit("+" + (n - have) + " " + label + " \u2014 " + n + " on the battlefield.");
    fireEtbTriggers(G.cards[stack.cardKey], n - have);
    notePeak();
  } else {
    removeFromStack(stack, have - n, false);
    logit((have - n) + "\u00d7 " + label + " taken off \u2014 " +
      (n ? n + " on the battlefield." : "none left on the battlefield."));
  }
  checkEnd();
  persistGame();
}

/* ---- Auto-applied ETB triggers ----

   A handful of triggered abilities are simple enough — no target, no
   choice, just "put a counter on me" — that making the player click
   through them adds nothing. Registered by card name, since cardKey is a
   random id assigned at import (see cardFromScryfall/cardFromEntry) and
   isn't stable to hang a registry off. Anything not listed here is still
   the players' to read and apply, per the app's usual stance on triggers.

   "Another" is handled without per-permanent identity: a stack is already
   a homogeneous group of otherwise-identical copies, so excluding "itself"
   just means excluding however many of *this* entry just joined that same
   stack — the rest were already on the board before this trigger fired. */
const ETB_TRIGGERS = {
  "Valley Mightcaller": {
    watchTypes: ["Frog", "Rabbit", "Raccoon", "Squirrel"],
    grant: PLUS_COUNTER,
  },
};

// "Creature — Frog Warrior" -> ["Frog", "Warrior"]. Only tribal ETB
// triggers need this, so it's parsed on demand rather than stored.
function subtypesOf(card) {
  const dash = (card.typeLine || "").indexOf("—");
  return dash < 0 ? [] : card.typeLine.slice(dash + 1).trim().split(/\s+/);
}

/* Call once per permanent (or same-named group of `justEnteredN`) joining
   the board, after addToBoard. Grants apply immediately; there's nothing
   left for the player to decide. */
function fireEtbTriggers(enteredCard, justEnteredN = 1) {
  if (!(justEnteredN > 0)) return;
  const enteredTypes = subtypesOf(enteredCard);
  if (!enteredTypes.length) return;
  for (const stack of G.board.slice()) {
    const watcher = G.cards[stack.cardKey];
    const trig = watcher && ETB_TRIGGERS[watcher.name];
    if (!trig || !trig.watchTypes.some((t) => enteredTypes.includes(t))) continue;
    const already = stack.count - (stack.cardKey === enteredCard.key ? justEnteredN : 0);
    if (already <= 0) continue;
    const next = normCounters(stack.counters);
    next[trig.grant] = (next[trig.grant] || 0) + 1;
    setStackCounters(stackId(stack), already, next);
    logit(watcher.name + ": " + enteredCard.name + " entered — " + trig.grant +
      (already > 1 ? " (×" + already + ")" : "") + ".");
  }
}

function rerollTarget(index) {
  snapshot();
  const target = pick(G.players);
  if (target) G.spellTargets[index] = target.id;
  persistGame();
}

/* ---- End conditions ---- */

function checkEnd() {
  if (G.over) return;
  if (G.library.length === 0 && G.revealed.length === 0 && G.board.length === 0) {
    G.over = "survivors";
    logit("Library empty, board empty. The survivors win.");
    return;
  }
  if (G.life <= 0) {
    G.over = "horde";
    logit("The survivors are dead. The Horde wins.");
    return;
  }
  if (G.poison >= G.poisonLimit) {
    G.over = "horde";
    logit("Poison limit reached. The Horde wins.");
  }
}

/* Written from other modules; ESM bindings are read-only across files. */
export const setG = (v) => { G = v; };
export const setUndoStack = (v) => { undoStack = v; };
export const setMillInput = (v) => { millInput = v; };
export const setLifeInput = (v) => { lifeInput = v; };

export {
  G, MINUS_COUNTER, PHASE, PLUS_COUNTER, RULESETS, adjustLife, adjustPoison, attackers,
  attackingPower, countOnBoard, countersLabel, createTokens, creatureCount, currentWaveSize,
  defaultRulesetFor, duplicateStack, effectivePT, endHordeTurn, endSetupTurn, findStack,
  flipHordeTurn, hasCounters, isWaveEnder, killFromStack, lifeInput, logit, millCards,
  millInput, newGame, normCounters, powerIsPartial, rerollTarget, resolveReveal,
  rulesetById, rulesetOfGame, setChips, setStackCounters, setTokenCount, sharedLifeFor,
  stackId, undo, undoStack, waveEndText, wavePatternText, waveSizeFor,
};
