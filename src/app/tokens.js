/* Tokens the library doesn't define, found on Scryfall or typed in by hand. */

import { $, normName, toast } from "./helpers.js";
import { SCRYFALL, cardFromEntry, cardFromScryfall } from "./scryfall.js";
import { categoryOf, primeImage, ptString } from "./cards.js";
import { G } from "./state.js";
import { bumpTokenSearchSeq, tokenChoice, tokenSearchSeq, tokenStep } from "./dialogs.js";
import { openTokenQtyStep } from "./copies.js";

/* =========================================================================
   Tokens the library doesn't define

   Plenty of horde cards make tokens that appear nowhere in the decklist —
   Skeletal Swarming's Skeletons, Rite of Belzenlok's Demons, Carrot Cake's
   Food. Those come from Scryfall's token search, with a typed-in plain token
   as the fallback when there's no connection or no printed token to match.
   ========================================================================= */

/* Kept apart from the import-time lookup on purpose: a search that fails at
   the table shouldn't trip networkDead and mark the whole session offline. */
async function searchCards(term, opts = {}) {
  const q = term.replace(/[^\w\s',-]/g, " ").trim() + (opts.tokensOnly ? " is:token" : "");
  const res = await fetch(SCRYFALL + "/cards/search?q=" + encodeURIComponent(q) +
    "&unique=cards&order=name");
  if (res.status === 404) return [];      // Scryfall's "no results"
  if (!res.ok) throw new Error("Scryfall " + res.status);
  const data = await res.json();
  const seen = new Set();
  const out = [];
  for (const sf of data.data || []) {
    const card = cardFromScryfall(sf, { name: sf.name });
    if (opts.tokensOnly) card.isToken = true;   // that search returns only tokens
    // The copy picker is looking for a creature, and an unfiltered name search
    // turns up the Sagas and Equipment that share the word.
    if (opts.creaturesOnly && categoryOf(card) !== "creature") continue;
    // Reprints differ by art alone, which is no help when you're picking one.
    const dedupe = card.name.toLowerCase() + "|" + card.typeLine + "|" + ptString(card);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(card);
    if (out.length >= 12) break;
  }
  return out;
}

const searchTokenCards = (term) => searchCards(term, { tokensOnly: true });

async function runTokenSearch(term) {
  const seq = bumpTokenSearchSeq();
  $("#ts-title").textContent = "\u201c" + term + "\u201d";
  $("#ts-sub").textContent = "Searching Scryfall\u2026";
  $("#token-search-grid").textContent = "";
  tokenStep("search");

  let cards;
  try {
    cards = await searchTokenCards(term);
  } catch {
    if (seq !== tokenSearchSeq) return;
    $("#ts-sub").textContent = "Couldn't reach Scryfall. Make a plain token instead.";
    return;
  }
  if (seq !== tokenSearchSeq) return;
  if (!cards.length) {
    $("#ts-sub").textContent = "No printed token by that name. Make a plain token instead.";
    return;
  }
  // Art first, then one render: the faces would otherwise pop in one by one.
  await Promise.all(cards.map(primeImage));
  if (seq !== tokenSearchSeq) return;
  $("#ts-sub").textContent = cards.length === 1 ? "One token." : cards.length + " tokens.";
  const grid = $("#token-search-grid");
  grid.textContent = "";
  cards.forEach((card) => grid.appendChild(
    tokenChoice(card, () => openTokenQtyStep(card, "search"), { nameLine: true })));
}

/* Searching for a token the deck already has should feed the existing stack,
   not stand a second one next to it. */
function existingTokenLike(card) {
  const want = card.name.toLowerCase();
  return Object.values(G.cards).find((c) => c.isToken && c.name.toLowerCase() === want);
}

function buildPlainToken() {
  const name = normName($("#tc-name").value);
  if (!name) { toast("Name the token first"); return null; }
  const isCreature = $("#tc-kind").getAttribute("aria-pressed") === "true";
  const card = cardFromEntry({ name, tokenHint: true });
  card.typeLine = isCreature ? "Token Creature" : "Token";
  card.handmade = true;   // never looked up, so not a Scryfall miss
  const power = $("#tc-power").value.trim();
  const tough = $("#tc-tough").value.trim();
  // Left blank, P/T stays null and the attacking total honestly reads "n+?".
  if (isCreature && power !== "" && tough !== "") {
    card.power = power;
    card.toughness = tough;
  }
  return card;
}

export {
  buildPlainToken, existingTokenLike, runTokenSearch, searchCards,
};
