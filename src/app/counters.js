/* +1/+1, -1/-1 and everything else a card puts on a creature. */

import { $, el } from "./helpers.js";
import { ptString } from "./cards.js";
import {
  G, MINUS_COUNTER, PLUS_COUNTER, countOnBoard, countersLabel, effectivePT, findStack,
  hasCounters, normCounters, stackId,
} from "./state.js";

/* =========================================================================
   Counters

   The edit is made on a copy and applied in one go. At the table you're
   reading a trigger off a card — "put two +1/+1 counters on each of them" —
   and a half-applied trigger that has already split the board is worse than
   no counters at all. Cancel leaves the game untouched.
   ========================================================================= */

let counterEdit = null;   // { id, howMany, counters, extras }

function openCountersDialog(id) {
  const stack = findStack(id);
  if (!stack) return;
  const counters = normCounters(stack.counters);
  counterEdit = {
    id: stackId(stack),
    // Most horde triggers that make counters make them for every creature it
    // controls, so the whole tile is the safer default; One is a tap away.
    howMany: stack.count,
    counters,
    extras: Object.keys(counters).filter((n) => n !== PLUS_COUNTER && n !== MINUS_COUNTER),
  };
  $("#ct-add-name").value = "";
  renderCounters();
  $("#counters-dialog").showModal();
}

/* The two the app does arithmetic for always show, even at zero — they're what
   a trigger asks for nine times out of ten. Anything else appears once it's on
   the stack or has been typed in. */
const counterNames = () => [PLUS_COUNTER, MINUS_COUNTER, ...counterEdit.extras];

function renderCounters() {
  const stack = counterEdit && findStack(counterEdit.id);
  if (!stack) { $("#counters-dialog").close(); return; }
  const card = G.cards[stack.cardKey];
  const pt = ptString(card);
  $("#ct-name").textContent = card.name;
  $("#ct-sub").textContent = (pt ? pt + " · " : "") + stack.count +
    (countOnBoard(card.key) === stack.count ? " on the battlefield" : " in this stack") +
    (hasCounters(stack) ? " · " + countersLabel(stack) : "");

  $("#ct-howmany").hidden = stack.count < 2;
  $("#ct-n").textContent = counterEdit.howMany;

  const rows = $("#ct-rows");
  rows.textContent = "";
  for (const name of counterNames()) rows.appendChild(counterRow(name));
  $("#ct-preview").textContent = countersPreview(stack);
}

function counterRow(name) {
  const n = counterEdit.counters[name] || 0;
  const row = el("div", "ctrrow" + (n ? " on" : ""));
  row.appendChild(el("span", "nm", name));
  const less = el("button", null, "−");
  less.type = "button";
  less.disabled = n === 0;
  less.setAttribute("aria-label", "One less " + name + " counter");
  less.addEventListener("click", () => bumpCounter(name, -1));
  const more = el("button", null, "+");
  more.type = "button";
  more.setAttribute("aria-label", "One more " + name + " counter");
  more.addEventListener("click", () => bumpCounter(name, 1));
  row.append(less, el("b", null, String(n)), more);
  return row;
}

function bumpCounter(name, delta) {
  const n = (counterEdit.counters[name] || 0) + delta;
  if (n > 0) counterEdit.counters[name] = n;
  else delete counterEdit.counters[name];   // the row stays, so it can go back up
  renderCounters();
}

function setCounterHowMany(n) {
  const stack = counterEdit && findStack(counterEdit.id);
  if (!stack) return;
  counterEdit.howMany = Math.min(Math.max(1, n), stack.count);
  renderCounters();
}

/* What Apply would do, spelled out. The split is the part that surprises
   people, so it says how many stay behind and what they stay as. */
function countersPreview(stack) {
  const after = { cardKey: stack.cardKey, counters: normCounters(counterEdit.counters) };
  if (stackId(after) === stackId(stack)) {
    return hasCounters(stack)
      ? "These are the counters they already carry."
      : "No counters yet — add one above.";
  }
  const n = Math.min(counterEdit.howMany, stack.count);
  const ptAfter = effectivePT(after);
  let out = n + "× " + G.cards[stack.cardKey].name + " → " +
    (hasCounters(after) ? countersLabel(after) : "no counters") +
    (ptAfter ? " · " + ptAfter.power + "/" + ptAfter.toughness : "");
  const rest = stack.count - n;
  if (rest) {
    const ptRest = effectivePT(stack);
    out += ". The other " + rest + " stay " + (hasCounters(stack) ? "on " + countersLabel(stack)
      : ptRest ? ptRest.power + "/" + ptRest.toughness : "as they are");
  }
  out += ".";
  // The app won't kill them for you — it isn't a rules engine — but it
  // shouldn't let a 0-toughness stack sit there unremarked either.
  if (ptAfter && ptAfter.toughness <= 0) {
    out += " Toughness 0 — that's lethal; kill them off the tile once it's applied.";
  }
  return out;
}

let confirmCb = null;
function confirmDialog(title, body, onYes) {
  $("#cd-title").textContent = title;
  $("#cd-body").textContent = body;
  confirmCb = onYes;
  $("#confirm-dialog").showModal();
}

/* Written from other modules; ESM bindings are read-only across files. */
export const setCounterEdit = (v) => { counterEdit = v; };
export const setConfirmCb = (v) => { confirmCb = v; };

export {
  bumpCounter, confirmCb, confirmDialog, counterEdit, counterNames, openCountersDialog,
  setCounterHowMany,
};
