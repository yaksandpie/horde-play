/* Start the app, restore what was saved, and expose the test harness. */

import { BUNDLED_DECKS } from "../decks.js";
import { initTermPops, padPress } from "./helpers.js";
import { parseDecklist } from "./parse.js";
import { cardFromEntry } from "./scryfall.js";
import { cardMeta, categoryOf, primeImages } from "./cards.js";
import {
  G, RULESETS, adjustLife, adjustPoison, attackingPower, countOnBoard, countersLabel,
  createTokens, creatureCount, defaultRulesetFor, duplicateStack, effectivePT, endHordeTurn,
  findStack, flipHordeTurn, isWaveEnder, killFromStack, millCards, newGame, normCounters,
  powerIsPartial, resolveReveal, rulesetById, rulesetOfGame, setG, setStackCounters,
  setTokenCount, sharedLifeFor, stackId, waveSizeFor,
} from "./state.js";
import {
  effectiveRules, hydrateBundled, renderDecks, renderGame, showScreen, syncLife, yardStacks,
  yardTotal,
} from "./screens.js";
import { buildCopyToken, existingCopyLike } from "./copies.js";
import {
  CODE_ALPHABET, CODE_LEN, SHARE_MAX, cardFromInline, decodeSnapshot, encodeSnapshot,
  loadShare, makeCode, setShareCode, setShareWasOn, shareCode, shareWasOn, topicFor,
} from "./share.js";
import { openJoin } from "./events.js";

/* =========================================================================
   Boot
   ========================================================================= */

syncLife();
initTermPops();
{
  const saved = loadShare();
  if (saved && saved.code) { setShareCode(saved.code); setShareWasOn(!!saved.on); }
}
renderDecks();
showScreen("screen-decks");

/* A shared link lands here: #watch=CODE opens the join box with the code
   already in it, so the person who got the link only has to confirm. */
{
  const m = /[#&]watch=([A-Za-z0-9]+)/.exec(location.hash || "");
  if (m) {
    history.replaceState(null, "", location.pathname + location.search);
    openJoin(m[1].toUpperCase());
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Exposed for the test harness; harmless in normal use.
window.__horde = {
  parseDecklist, cardFromEntry, categoryOf, isWaveEnder, waveSizeFor, sharedLifeFor,
  hydrateBundled, BUNDLED_DECKS,
  RULESETS, rulesetById, defaultRulesetFor, rulesetOfGame, effectiveRules,
  get G() { return G; },
  set G(v) { setG(v); },
  newGame, flipHordeTurn, resolveReveal, endHordeTurn, millCards, adjustLife, adjustPoison,
  killFromStack, createTokens, setTokenCount, duplicateStack, attackingPower, powerIsPartial,
  buildCopyToken, existingCopyLike,
  creatureCount, yardStacks, yardTotal,
  setStackCounters, stackId, findStack, countOnBoard, countersLabel, effectivePT, normCounters,
  cardMeta, padPress, primeImages, renderGame, renderDecks, showScreen,
  encodeSnapshot, decodeSnapshot, cardFromInline, makeCode, topicFor,
  CODE_ALPHABET, CODE_LEN, SHARE_MAX,
};

