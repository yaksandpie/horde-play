/* The full card view and the actions it offers. */

import { $, el } from "./helpers.js";
import { cardFace, cardMeta, categoryOf, objectUrls, ptString } from "./cards.js";
import {
  G, countOnBoard, countersLabel, effectivePT, findStack, hasCounters, stackId,
} from "./state.js";
import { openTokenQtyStep } from "./copies.js";
import { viewerMode } from "./share.js";

/* =========================================================================
   Dialogs
   ========================================================================= */

let cardDialogStackId = null;   // set when opened from a board tile, which carries actions

/* A board tile: the same full-size view, plus the actions that belong to those
   copies — counters, +1, and the two kills. */
const openStackDialog = (stack) => openCardDialog(stack.cardKey, { stackId: stackId(stack) });

/* Accepts a board/library card key, or a bare card object for the import
   review where there is no game in progress. */
function openCardDialog(keyOrCard, opts = {}) {
  const card = typeof keyOrCard === "string" ? G.cards[keyOrCard] : keyOrCard;
  if (!card) return;

  const slot = $("#cv-slot");
  slot.textContent = "";
  slot.appendChild(cardFace(card, { badge: true, rule: G ? G.waveEnd : null }));

  $("#cv-name").textContent = card.name;
  $("#cv-type").textContent = cardMeta(card, { defender: true });

  const hasArt = !!(card.scryfallId && objectUrls.get(card.scryfallId));
  const oracle = $("#cv-oracle");
  oracle.textContent = hasArt ? "" : (card.oracleText ||
    (card.handmade ? "Made by hand — no card text to show." :
     card.resolved ? "" : "Not found on Scryfall — play it from the paper card or memory."));
  oracle.hidden = !oracle.textContent;

  cardDialogStackId = opts.stackId || null;
  renderCardActions();
  $("#card-dialog").showModal();
}

/* The actions under a board card. A token stack can also grow: +1 for the
   common case — a trigger made one more — and the pad for a real
   correction. Redrawn in place rather than only on open, so tapping +1 a few
   times reads back the count it's building. */
function renderCardActions() {
  /* What the tile is, and what may be done to it, are different questions for
     a viewer: they can read a stack's counters, they just can't change them. */
  const shown = findStack(cardDialogStackId);
  const stack = viewerMode ? null : shown;
  $("#cv-actions").hidden = !stack;
  const line = $("#cv-counters");
  line.hidden = !shown || !hasCounters(shown);
  if (hasCounters(shown)) {
    const pt = effectivePT(shown);
    line.textContent = countersLabel(shown) +
      (pt ? " — " + (shown.count === 1 ? "a " : "each one a ") + pt.power + "/" + pt.toughness : "");
  }
  if (!stack) return;
  const card = G.cards[stack.cardKey];
  // Only tokens: a printed creature comes out of the library, so making a
  // second one by hand would be inventing a card the deck doesn't hold.
  $("#cv-qty").hidden = !card.isToken;
  /* Copying is different: what a copy effect makes is a token, so it's offered
     on the Horde's printed creatures too — that's the case the library can't
     cover. Not on a Treasure or a Clue, which nothing here copies. */
  $("#cv-copy").hidden = categoryOf(card) !== "creature";
  $("#cv-dup").setAttribute("aria-label", "Add one more " + card.name +
    (hasCounters(stack) ? " with the same counters" : ""));
  $("#cv-counters-btn").textContent = hasCounters(stack) ? "Counters…"
    : stack.count > 1 ? "Put counters on some…" : "Put counters on it…";
  $("#cv-kill1").textContent = "Kill one → graveyard";
  $("#cv-killall").textContent = "Kill all " + stack.count + " → graveyard";
}

let tokenPickCard = null;
let tokenQtyInput = "";
let tokenQtyBack = "pick";  // the step the quantity pad was reached from
let tokenQtyMode = "add";   // "add" puts new tokens out; "set" fixes a stack's count
let tokenSetKey = null;     // the board stack "set" is editing
let tokenSearchSeq = 0;     // so a slow search can't overwrite a newer one

function tokenTypes() {
  return Object.values(G.cards)
    .filter((c) => c.isToken)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function tokenStep(step) {
  $("#token-step-pick").hidden = step !== "pick";
  $("#token-step-search").hidden = step !== "search";
  $("#token-step-custom").hidden = step !== "custom";
  $("#token-step-copysrc").hidden = step !== "copysrc";
  $("#token-step-copy").hidden = step !== "copy";
  $("#token-step-qty").hidden = step !== "qty";
}

/* A tile in either token grid: the face, then what it is and how many are out.
   Text faces carry their own name and stats, but art faces are 120px wide at
   the table, so the line under them is where a 1/1 and a 4/4 Skeleton part. */
function tokenSubtitle(card) {
  const out = countOnBoard(card.key);
  const where = out ? out + " on the battlefield" : null;
  // P/T identifies a creature token; anything else leans on its type line.
  const what = ptString(card) || (categoryOf(card) === "creature" ? null :
    (card.typeLine || "").replace(/^Token\s+/i, "") || null);
  if (what && where) return what + " \u00b7 " + where;
  return what || where || "None on the battlefield yet";
}

function tokenChoice(card, onPick, opts = {}) {
  const slot = el("div", "slot");
  const btn = el("button", "plainbtn");
  btn.setAttribute("aria-label", opts.action
    ? opts.action + " " + card.name : "Create " + card.name + " tokens");
  btn.appendChild(cardFace(card, { rule: G.waveEnd, badge: false }));
  slot.appendChild(btn);
  // Search results get their name spelled out: the printed one on a 120px face
  // is unreadable, and "Skeleton" and "Skeleton Warrior" are a tap apart.
  if (opts.nameLine) slot.appendChild(el("p", "tiny tokname", card.name));
  slot.appendChild(el("p", "tiny muted", opts.subtitle || tokenSubtitle(card)));
  btn.addEventListener("click", onPick);
  return slot;
}

function openTokenDialog() {
  const grid = $("#token-pick-grid");
  grid.textContent = "";
  const types = tokenTypes();
  $("#token-pick-empty").hidden = types.length > 0;
  $("#token-pick-label").hidden = types.length === 0;
  types.forEach((card) => grid.appendChild(tokenChoice(card, () => openTokenQtyStep(card, "pick"))));
  $("#token-search").value = "";
  tokenSearchSeq++;
  tokenStep("pick");
  $("#token-dialog").showModal();
}

/* Written from other modules; ESM bindings are read-only across files. */
export const bumpTokenSearchSeq = () => ++tokenSearchSeq;
export const setTokenPickCard = (v) => { tokenPickCard = v; };
export const setTokenQtyBack = (v) => { tokenQtyBack = v; };
export const setTokenQtyMode = (v) => { tokenQtyMode = v; };
export const setTokenQtyInput = (v) => { tokenQtyInput = v; };
export const setTokenSetKey = (v) => { tokenSetKey = v; };

export {
  cardDialogStackId, openCardDialog, openStackDialog, openTokenDialog, renderCardActions,
  tokenChoice, tokenPickCard, tokenQtyBack, tokenQtyInput, tokenQtyMode, tokenSearchSeq,
  tokenSetKey, tokenStep,
};
