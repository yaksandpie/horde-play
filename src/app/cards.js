/* Building card faces and tiles out of card objects. */

import { el } from "./helpers.js";
import { getImage, putImage } from "./persistence.js";
import { countersLabel, effectivePT, hasCounters } from "./state.js";

/* =========================================================================
   Card rendering
   ========================================================================= */

const objectUrls = new Map(); // scryfallId -> object URL

async function primeImages(cards) {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  // Every read at once rather than one after another: this runs at the start
  // of every game, over every card in the deck.
  const ids = [...new Set(cards.map((c) => c.scryfallId).filter(Boolean))];
  const blobs = await Promise.all(ids.map(getImage));
  ids.forEach((id, i) => {
    if (blobs[i]) objectUrls.set(id, URL.createObjectURL(blobs[i]));
  });
}

/* One card's art, on demand: a token created mid-game never went through the
   import-time cache pass, so it fetches (and stores) its own image. */
async function primeImage(card) {
  if (!card.scryfallId || !card.imageUri || objectUrls.has(card.scryfallId)) return;
  try {
    let blob = await getImage(card.scryfallId);
    if (!blob) {
      const res = await fetch(card.imageUri);
      if (!res.ok) return;
      blob = await res.blob();
      await putImage(card.scryfallId, blob);
    }
    objectUrls.set(card.scryfallId, URL.createObjectURL(blob));
  } catch { /* the generated text face is the fallback */ }
}

function colorClass(card) {
  const c = card.colors || [];
  if (c.length > 1) return "c-M";
  if (c.length === 1) return "c-" + c[0];
  return "";
}

function categoryOf(card) {
  const t = card.typeLine || "";
  if (/Creature/i.test(t)) return "creature";
  if (/Instant|Sorcery/i.test(t)) return "spell";
  if (t) return "permanent";
  // No type line (an offline import): fall back to the decklist's own section
  // heading, then to the token flag.
  if (card.catHint) return card.catHint;
  return card.isToken ? "creature" : "permanent";
}

const ptString = (card) =>
  (card.power == null || card.toughness == null) ? null : card.power + "/" + card.toughness;

/* The one-line description under a card: whatever of type, P/T and rarity is
   known, in that order. Built here so the reveal stage, the full-card view and
   the import review all read the same. */
function cardMeta(card, opts = {}) {
  const bits = [card.typeLine || opts.unknownType || (card.isToken ? "Token" : "Card")];
  const pt = ptString(card);
  if (pt) bits.push(pt);
  if (card.rarity) bits.push(card.rarity);
  if (opts.defender && card.hasDefender) bits.push("Defender (blocks, doesn't attack)");
  if (opts.notFound && !card.resolved) bits.push("not found");
  return bits.join(" \u00b7 ");
}

/* Wraps a card face in its container-query slot, optionally making it a button.
   Cards render small on a crowded board, so every one of them is tappable to
   open the full-size view. */
function cardSlot(card, opts = {}, onClick) {
  const slot = el("div", "slot" + (opts.slotClass ? " " + opts.slotClass : ""));
  if (!onClick) {
    slot.appendChild(cardFace(card, opts));
    return slot;
  }
  const btn = el("button", "cardbtn");
  btn.setAttribute("aria-label", "View " + card.name);
  btn.appendChild(cardFace(card, opts));
  btn.addEventListener("click", onClick);
  slot.appendChild(btn);
  return slot;
}

/* Returns an element, not a string, so image object URLs never round-trip
   through innerHTML. */
function cardFace(card, opts = {}) {
  const node = el("div", "cardface");
  if (card.hasDefender) node.classList.add("defender");
  const art = card.scryfallId ? objectUrls.get(card.scryfallId) : null;

  if (art) {
    const img = el("img");
    img.src = art;
    img.alt = card.name;
    img.loading = "lazy";
    node.appendChild(img);
  } else {
    node.classList.add("gen");
    const cc = colorClass(card);
    if (cc) node.classList.add(cc);
    const top = el("div", "cf-top");
    top.appendChild(el("div", "cf-name", card.name));
    if (card.manaCost) top.appendChild(el("div", "cf-cost", card.manaCost));
    node.appendChild(top);
    node.appendChild(el("div", "cf-type",
      card.typeLine || (card.isToken ? "Token Creature" : "Card")));
    node.appendChild(el("div", "cf-oracle", card.oracleText || ""));
    const pt = ptString(card);
    if (pt) node.appendChild(el("div", "cf-pt", pt));
  }

  if (opts.badge !== false) {
    let label = card.isToken ? "Token" : "Card";
    let cls = card.isToken ? " token" : "";
    if (opts.rule === "rarity" && card.rarity) {
      label = card.rarity;
      cls = /uncommon|rare|mythic/.test(card.rarity) ? " rare" : "";
    }
    /* A copy wears the original's art, so the badge is the only thing on the
       face that separates a 4/4 copy of a Bat from the 1/1 Bats beside it. It
       wins over the rarity badge: a copy is never in a wave being read for its
       rarity, and it inherits the printed card's. */
    if (card.isCopy) {
      label = "Copy" + (ptString(card) ? " " + ptString(card) : "");
      cls = " copy";
    }
    node.appendChild(el("div", "cf-badge" + cls, label));
  }
  if (card.hasDefender) node.appendChild(el("div", "cf-badge defender", "Defender"));
  if (opts.count && opts.count > 1) node.appendChild(el("div", "cf-count", "×" + opts.count));
  // Board tiles pass their stack, so the counters on it — and the P/T they add
  // up to — are readable without opening the card.
  if (opts.stack && hasCounters(opts.stack)) {
    node.classList.add("countered");
    const chips = el("div", "cf-counters");
    chips.appendChild(el("span", "cc-n", countersLabel(opts.stack)));
    const pt = effectivePT(opts.stack);
    if (pt) chips.appendChild(el("span", "cc-pt", pt.power + "/" + pt.toughness));
    node.appendChild(chips);
  }
  return node;
}

export {
  cardFace, cardMeta, cardSlot, categoryOf, objectUrls, primeImage, primeImages,
  ptString,
};
