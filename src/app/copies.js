/* "Create a token that's a copy of target creature", for the Horde's cards and the survivors'. */

import { $, toast, uid } from "./helpers.js";
import { cardMeta, categoryOf, primeImage, ptString } from "./cards.js";
import { G, countOnBoard, countersLabel, findStack, hasCounters, stackId } from "./state.js";
import {
  setTokenPickCard, setTokenQtyBack, setTokenQtyInput, setTokenQtyMode, setTokenSetKey,
  tokenChoice, tokenPickCard, tokenQtyBack, tokenQtyInput, tokenQtyMode, tokenSetKey,
  tokenStep,
} from "./dialogs.js";
import { existingTokenLike, searchCards } from "./tokens.js";

/* =========================================================================
   Copies

   "Create a token that's a copy of target creature" — and its cousin, the same
   clause ending "except it's a 4/4". The creature copied is sometimes the
   Horde's own and sometimes a survivor's, so the source is either a tile on
   the board or any card found by name. What lands is a token either way: that
   is what a copy token is, however printed the thing it copied was.
   ========================================================================= */

let copySource = null;        // the card being copied
let copyBack = "copysrc";     // the step Back from the copy step returns to
let copyBackStackId = null;   // ...or the board tile it was opened from
let copySearchSeq = 0;        // so a slow search can't overwrite a newer one

/* The copy keeps everything printed — art, type line, rules text, Defender —
   and takes whatever P/T the effect names. isToken is what earns it the token
   affordances: it stacks, it answers +1 and "Set how many…", and it's badged
   as a token rather than a card, which is what it is however printed the thing
   it copied was. Counters are deliberately not copied; a copy copies the
   printed card, not whatever is sitting on the one it pointed at. */
function buildCopyToken(source, pt) {
  const card = Object.assign({}, source, {
    key: "c_" + uid(),
    isToken: true,
    isCopy: true,
    copyOf: source.name,
  });
  if (pt) { card.power = pt.power; card.toughness = pt.toughness; }
  // A copy of a card with no type line — an offline import — still attacks.
  if (!card.typeLine) card.catHint = "creature";
  return card;
}

/* Where a copy belongs on the board. Two copies made the same way stack, but a
   4/4 copy of a Bat must not join the 1/1 Bats, so the match is on the printed
   identity *and* the stats the effect gave it.

   An unaltered copy of a token the Horde already has out is simply one more of
   those tokens — nothing about it differs — so it joins that stack rather than
   standing a second, identical tile beside it. A copy of a printed creature
   never does: the card in the library and the token on the battlefield are
   different objects, and only one of them can die into the graveyard. */
function existingCopyLike(card) {
  return Object.values(G.cards).find((c) =>
    c.typeLine === card.typeLine && c.power === card.power &&
    c.toughness === card.toughness &&
    (c.isCopy ? c.copyOf === card.copyOf : c.isToken && c.name === card.name));
}

/* What to call a card as it enters, in the log and in the toast: a copy carries
   the original's name, so "+1 Bat" would be a lie about which Bats arrived. */
const tokenLabel = (card, n) => card.isCopy
  ? (n === 1 ? "copy" : "copies") + " of " + card.copyOf +
    (ptString(card) ? " (" + ptString(card) + ")" : "")
  : card.name + (n === 1 ? " token" : " tokens");

/* One tile per distinct creature the Horde has out. Counters split a creature
   across tiles and a copy doesn't take them along, so the split is no help
   here — pick the card, not the pile. */
function copySources() {
  const seen = new Set();
  const out = [];
  for (const stack of G.board) {
    const card = G.cards[stack.cardKey];
    if (!card || seen.has(card.key) || categoryOf(card) !== "creature") continue;
    seen.add(card.key);
    out.push(card);
  }
  return out;
}

function copySrcStatus(msg) {
  $("#copy-src-empty").textContent = msg || "";
  $("#copy-src-empty").hidden = !msg;
}

/* The board list, which is also what a failed search falls back to. */
function renderCopySources() {
  const grid = $("#copy-src-grid");
  grid.textContent = "";
  const sources = copySources();
  $("#copy-src-label").hidden = sources.length === 0;
  $("#copy-src-label").textContent = "On the Horde\u2019s battlefield";
  sources.forEach((card) => grid.appendChild(tokenChoice(card,
    () => openCopyStep(card, "copysrc"), { action: "Copy" })));
  return sources.length;
}

function openCopySrcStep() {
  copySearchSeq++;
  $("#copy-search").value = "";
  copySrcStatus(renderCopySources() ? "" :
    "The Horde has nothing out to copy \u2014 search above for the creature you need.");
  tokenStep("copysrc");
}

async function runCopySearch(term) {
  const seq = ++copySearchSeq;
  $("#copy-src-grid").textContent = "";
  $("#copy-src-label").hidden = true;
  copySrcStatus("Searching Scryfall for \u201c" + term + "\u201d\u2026");

  let cards;
  try {
    cards = await searchCards(term, { creaturesOnly: true });
  } catch {
    if (seq !== copySearchSeq) return;
    renderCopySources();
    copySrcStatus("Couldn\u2019t reach Scryfall. Copy one of the Horde\u2019s own, " +
      "or make a plain token from the previous screen.");
    return;
  }
  if (seq !== copySearchSeq) return;
  if (!cards.length) {
    renderCopySources();
    copySrcStatus("No creature by that name.");
    return;
  }
  // Art first, then one render: the faces would otherwise pop in one by one.
  await Promise.all(cards.map(primeImage));
  if (seq !== copySearchSeq) return;
  copySrcStatus("");
  $("#copy-src-label").hidden = false;
  $("#copy-src-label").textContent = cards.length === 1
    ? "One creature matching \u201c" + term + "\u201d"
    : cards.length + " creatures matching \u201c" + term + "\u201d";
  const grid = $("#copy-src-grid");
  grid.textContent = "";
  cards.forEach((card) => grid.appendChild(tokenChoice(card,
    () => openCopyStep(card, "copysrc"), { nameLine: true, action: "Copy" })));
}

/* The P/T fields open on the original's, so a plain copy is one more tap and
   "except it's a 4/4" is two numbers. */
function openCopyStep(source, from, stackId) {
  copySource = source;
  copyBack = from;
  copyBackStackId = stackId || null;
  $("#cp-name").textContent = "Copy of " + source.name;
  $("#cp-sub").textContent = cardMeta(source, { defender: true });
  $("#cp-power").value = source.power == null ? "" : source.power;
  $("#cp-tough").value = source.toughness == null ? "" : source.toughness;
  tokenStep("copy");
}

function buildCopyFromForm() {
  if (!copySource) return null;
  const power = $("#cp-power").value.trim();
  const tough = $("#cp-tough").value.trim();
  // Both or neither: a 4/? is not a creature anyone can put on the table.
  if ((power === "") !== (tough === "")) {
    toast("Give the copy both a power and a toughness");
    return null;
  }
  return buildCopyToken(copySource,
    power === "" ? null : { power, toughness: tough });
}

function openTokenQtyStep(card, from) {
  setTokenPickCard((card.isCopy ? existingCopyLike(card) : existingTokenLike(card)) || card);
  setTokenQtyBack(from);
  setTokenQtyMode("add");
  setTokenQtyInput("1");
  $("#tq-name").textContent = tokenPickCard.isCopy
    ? "Copy of " + tokenPickCard.copyOf : tokenPickCard.name;
  const pt = ptString(tokenPickCard);
  $("#tq-sub").textContent = (pt ? pt + " \u2014 h" : "H") + "ow many enter the battlefield?";
  $("#tq-add").textContent = "Add";
  tokenStep("qty");
  renderTokenQty();
}

/* The same pad, reached from a token already on the board: it opens on the
   count that's out and sets the stack to whatever you leave it at — 0 clears
   the type off the board. */
function openTokenSetStep(id) {
  const stack = findStack(id);
  const card = stack ? G.cards[stack.cardKey] : null;
  if (!card) return;
  setTokenPickCard(card);
  setTokenSetKey(stackId(stack));
  setTokenQtyBack("card");
  setTokenQtyMode("set");
  setTokenQtyInput(String(stack.count));
  $("#tq-name").textContent = card.name;
  const pt = ptString(card);
  // Counters split a type across tiles and this pad only sets the one it was
  // opened from, so it says which when there's more than one.
  const split = countOnBoard(card.key) !== stack.count;
  $("#tq-sub").textContent = (pt ? pt + " \u00b7 " : "") +
    (hasCounters(stack) ? countersLabel(stack) + " \u00b7 " : "") + stack.count +
    (split ? " in this stack" : " on the battlefield") +
    " \u2014 how many should there be?";
  $("#tq-add").textContent = "Set";
  tokenStep("qty");
  renderTokenQty();
  $("#token-dialog").showModal();
}

function renderTokenQty() {
  $("#tq-out").textContent = tokenQtyInput || "0";
}

export {
  buildCopyFromForm, buildCopyToken, copyBack, copyBackStackId, existingCopyLike,
  openCopySrcStep, openCopyStep, openTokenQtyStep, openTokenSetStep, renderTokenQty,
  runCopySearch, tokenLabel,
};
