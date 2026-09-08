/* Every listener the page wires up, in one place. */

import { $, $$, padPress, pick, toast } from "./helpers.js";
import { persistGame } from "./persistence.js";
import { lookupAborted, setLookupAborted } from "./scryfall.js";
import {
  G, PHASE, adjustLife, adjustPoison, attackingPower, countersLabel, createTokens,
  duplicateStack, endHordeTurn, endSetupTurn, findStack, flipHordeTurn, killFromStack,
  lifeInput, logit, millCards, millInput, normCounters, resolveReveal, rulesetById, setG,
  setLifeInput, setMillInput, setStackCounters, setTokenCount, setUndoStack, stackId, undo,
  undoStack,
} from "./state.js";
import {
  allDecks, effectiveRules, importStep, jumpToBoard, openSetup, renderBans, renderDecks,
  renderGame, renderLog, renderReview, renderSetupPlayers, renderSetupRules, renderYard,
  resumeGame, reviewCards, runImport, saveImportedDeck, setSetupRuleset, setSetupWaveEnd,
  setSetupWavePattern, setupNames, setupRuleset, setupWaveEnd, setupWavePattern, showScreen,
  startGame, syncLife,
} from "./screens.js";
import {
  cardDialogStackId, openStackDialog, openTokenDialog, renderCardActions, setTokenQtyInput,
  tokenPickCard, tokenQtyBack, tokenQtyInput, tokenQtyMode, tokenSetKey, tokenStep,
} from "./dialogs.js";
import { buildPlainToken, runTokenSearch } from "./tokens.js";
import {
  buildCopyFromForm, copyBack, copyBackStackId, openCopySrcStep, openCopyStep,
  openTokenQtyStep, openTokenSetStep, renderTokenQty, runCopySearch, tokenLabel,
} from "./copies.js";
import {
  bumpCounter, confirmCb, confirmDialog, counterEdit, counterNames, openCountersDialog,
  setConfirmCb, setCounterEdit, setCounterHowMany,
} from "./counters.js";
import {
  CODE_ALPHABET, CODE_LEN, makeCode, persistShare, renderShare, setShareCode, shareCode,
  shareLink, shareOn, shareStart, shareStop, viewerJoin, viewerLeave, viewerMode,
} from "./share.js";

/* =========================================================================
   Events
   ========================================================================= */

$("#btn-bans").addEventListener("click", () => {
  $("#ban-search").value = "";
  renderBans();
  showScreen("screen-bans");
});
$("#ban-search").addEventListener("input", renderBans);
$("#btn-bans-back").addEventListener("click", () => { renderDecks(); showScreen("screen-decks"); });

// --- game log ---
$("#btn-log").addEventListener("click", () => {
  if (!G) return;
  renderLog();
  const dlg = $("#log-dialog");
  dlg.showModal();
  /* Close is the only focusable thing in here, and it sits under a list that
     can run to 150 entries — so the browser would open the sheet scrolled to
     the oldest line. Take focus to the title instead, where the newest is. */
  $("#log-title").focus();
  dlg.scrollTop = 0;
});
$("#log-close").addEventListener("click", () => $("#log-dialog").close());

// --- live share ---
$("#btn-share").addEventListener("click", () => {
  renderShare();
  $("#share-dialog").showModal();
});
$("#sh-toggle").addEventListener("click", () => (shareOn ? shareStop() : shareStart()));
$("#sh-close").addEventListener("click", () => $("#share-dialog").close());
$("#sh-copy").addEventListener("click", async () => {
  if (!shareCode) { setShareCode(makeCode()); persistShare(); }
  renderShare();
  try {
    await navigator.clipboard.writeText(shareLink());
    toast("Link copied");
  } catch {
    // Clipboard access is refused often enough (no permission, insecure
    // context) that the code itself has to remain readable on screen.
    toast("Read them the code: " + shareCode);
  }
});

$("#btn-watch").addEventListener("click", () => openJoin(""));
$("#join-close").addEventListener("click", () => $("#join-dialog").close());
$("#join-go").addEventListener("click", submitJoin);
$("#join-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); submitJoin(); }
});
$("#btn-viewer-leave").addEventListener("click", () => viewerLeave());

function openJoin(prefill) {
  $("#join-code").value = prefill || "";
  $("#join-error").hidden = true;
  $("#join-dialog").showModal();
}

function submitJoin() {
  const raw = ($("#join-code").value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const err = $("#join-error");
  if (raw.length !== CODE_LEN || [...raw].some((c) => !CODE_ALPHABET.includes(c))) {
    err.textContent = "That isn't a game code — they're " + CODE_LEN +
      " letters and digits, no O, I or L.";
    err.hidden = false;
    return;
  }
  err.hidden = true;
  $("#join-dialog").close();
  viewerJoin(raw);
}

// --- import ---
$("#btn-import").addEventListener("click", () => {
  $("#import-name").value = "";
  $("#import-text").value = "";
  importStep("paste");
  showScreen("screen-import");
});
$("#btn-import-cancel").addEventListener("click", () => showScreen("screen-decks"));
$("#btn-parse").addEventListener("click", runImport);
$("#btn-back-paste").addEventListener("click", () => importStep("paste"));
$("#btn-skip-lookup").addEventListener("click", () => { setLookupAborted(true); });
$("#btn-save-deck").addEventListener("click", saveImportedDeck);
$("#btn-all-token").addEventListener("click", () => {
  reviewCards.forEach((c) => (c.isToken = true));
  renderReview([]);
});
$("#btn-all-card").addEventListener("click", () => {
  reviewCards.forEach((c) => (c.isToken = false));
  renderReview([]);
});

// --- setup ---
$("#btn-add-player").addEventListener("click", () => {
  if (setupNames.length >= 4) { toast("Horde Magic tops out at four survivors"); return; }
  setupNames.push("");
  renderSetupPlayers();
  syncLife();
});
$("#opt-ruleset").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const next = rulesetById(chip.dataset.v);
  // Switching to house rules starts from wherever the table already was.
  if (next.custom) {
    const from = effectiveRules();
    $("#setup-life").value = from.life;
    $("#setup-turns").value = from.setupTurns;
    $("#setup-poison").value = from.poisonLimit;
    $("#opt-legendary").checked = from.legendaryRule;
    setSetupWaveEnd(from.waveEnd);
    setSetupWavePattern(from.wavePattern);
  } else {
    setSetupWaveEnd(next.waveEnd);
    setSetupWavePattern(next.wavePattern);
  }
  setSetupRuleset(next.id);
  syncLife();
});
$("#opt-waveend").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setSetupWaveEnd(chip.dataset.v);
  renderSetupRules();
});
$("#opt-wavepattern").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setSetupWavePattern(chip.dataset.v);
  renderSetupRules();
});
$("#btn-setup-cancel").addEventListener("click", () => showScreen("screen-decks"));
$("#btn-start").addEventListener("click", startGame);
$("#btn-resume").addEventListener("click", resumeGame);

// --- game ---
$("#btn-action").addEventListener("click", () => {
  switch (G.phase) {
    case PHASE.SETUP: endSetupTurn(); break;
    case PHASE.SURVIVORS: flipHordeTurn(); break;
    case PHASE.REVEAL: resolveReveal(); break;
    case PHASE.COMBAT: endHordeTurn(); break;
  }
  renderGame();
});

$("#btn-undo").addEventListener("click", undo);

$("#tile-damage").addEventListener("click", () => {
  setMillInput("");
  renderGame();
  $("#damage-dialog").showModal();
});
$("#dd-close").addEventListener("click", () => $("#damage-dialog").close());

$("#tile-life").addEventListener("click", () => {
  setLifeInput("");
  renderGame();
  $("#life-dialog").showModal();
});
$("#ld-close").addEventListener("click", () => $("#life-dialog").close());

$("#tile-board").addEventListener("click", jumpToBoard);

$("#tile-yard").addEventListener("click", () => {
  renderYard();
  $("#yard-dialog").showModal();
});
$("#yd-close").addEventListener("click", () => $("#yard-dialog").close());

$("#btn-random").addEventListener("click", () => {
  const p = pick(G.players);
  if (!p) return;
  toast("Random survivor: " + p.name);
  logit("Rolled a random survivor: " + p.name + ".");
  persistGame();
  renderGame();
});

$("#btn-quit").addEventListener("click", () => {
  confirmDialog("End this game?", "The board and life total are discarded. Your decks stay saved.", () => {
    setG(null);
    setUndoStack([]);
    persistGame();
    renderDecks();
    showScreen("screen-decks");
  });
});

// --- mill pad (inside the damage dialog) ---
$("#mill-pad").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  setMillInput(padPress(millInput, btn));
  renderGame();
});

$("#dd-mill").addEventListener("click", () => {
  const n = parseInt(millInput, 10);
  if (!(n > 0)) { toast("Enter an amount first"); return; }
  millCards(n);
  setMillInput("");
  $("#damage-dialog").close();
  renderGame();
  toast("Milled " + n);
});

// --- life pad (inside the survivors dialog) ---
$("#life-pad").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  setLifeInput(padPress(lifeInput, btn));
  renderGame();
});

/* Unlike the mill pad, this one leaves its sheet open: a hit, a lifelink gain
   and a poison counter are one visit to the life total, not three. */
function applyLifeEntry(sign) {
  const n = parseInt(lifeInput, 10);
  if (!(n > 0)) { toast("Enter an amount first"); return; }
  adjustLife(sign * n);
  setLifeInput("");
  renderGame();
  toast(sign < 0 ? "Lost " + n : "Gained " + n);
}
$("#ld-lose").addEventListener("click", () => applyLifeEntry(-1));
$("#ld-gain").addEventListener("click", () => applyLifeEntry(1));

// --- life / poison ---
$("#life-all").addEventListener("click", () => { adjustLife(-attackingPower()); renderGame(); });
$$("[data-poison]").forEach((b) =>
  b.addEventListener("click", () => { adjustPoison(parseInt(b.dataset.poison, 10)); renderGame(); }));

// --- stack dialog ---
$("#cv-close").addEventListener("click", () => $("#card-dialog").close());
$("#cv-copy").addEventListener("click", () => {
  const stack = findStack(cardDialogStackId);
  const card = stack && G.cards[stack.cardKey];
  if (!card) return;
  const id = stackId(stack);
  $("#card-dialog").close();
  openCopyStep(card, "card", id);
  $("#token-dialog").showModal();
});
$("#cv-dup").addEventListener("click", () => {
  duplicateStack(cardDialogStackId);
  // Left open on purpose: three triggers is three taps, not three reopens.
  renderCardActions();
  renderGame();
});
$("#cv-setqty").addEventListener("click", () => {
  const id = cardDialogStackId;
  $("#card-dialog").close();
  openTokenSetStep(id);
});
$("#cv-counters-btn").addEventListener("click", () => {
  const id = cardDialogStackId;
  $("#card-dialog").close();
  openCountersDialog(id);
});
$("#cv-kill1").addEventListener("click", () => {
  killFromStack(cardDialogStackId, 1);
  $("#card-dialog").close();
  renderGame();
});
$("#cv-killall").addEventListener("click", () => {
  const stack = findStack(cardDialogStackId);
  killFromStack(cardDialogStackId, stack ? stack.count : 1);
  $("#card-dialog").close();
  renderGame();
});

// --- counters ---
$("#ct-cancel").addEventListener("click", () => $("#counters-dialog").close());
$("#counters-dialog").addEventListener("close", () => { setCounterEdit(null); });
$("#ct-fewer").addEventListener("click", () => counterEdit && setCounterHowMany(counterEdit.howMany - 1));
$("#ct-more").addEventListener("click", () => counterEdit && setCounterHowMany(counterEdit.howMany + 1));
$("#ct-one").addEventListener("click", () => setCounterHowMany(1));
$("#ct-all").addEventListener("click", () => setCounterHowMany(Infinity));
/* A counter the app knows nothing about — stun, charge, whatever the card
   names. Typing it in puts one on; the row then works like the other two. */
$("#ct-add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!counterEdit) return;
  const typed = $("#ct-add-name").value.trim().replace(/\s+/g, " ").slice(0, 24);
  if (!typed) { toast("Name the counter first"); return; }
  const name = counterNames().find((n) => n.toLowerCase() === typed.toLowerCase()) || typed;
  if (!counterNames().includes(name)) counterEdit.extras.push(name);
  $("#ct-add-name").value = "";
  bumpCounter(name, 1);
});
$("#ct-apply").addEventListener("click", () => {
  const stack = counterEdit && findStack(counterEdit.id);
  if (!stack) { $("#counters-dialog").close(); return; }
  const next = normCounters(counterEdit.counters);
  if (stackId({ cardKey: stack.cardKey, counters: next }) === stackId(stack)) {
    toast("Nothing to apply");
    return;
  }
  const n = Math.min(counterEdit.howMany, stack.count);
  const name = G.cards[stack.cardKey].name;
  setStackCounters(counterEdit.id, n, next);
  $("#counters-dialog").close();
  renderGame();
  toast(n + "× " + name + (Object.keys(next).length
    ? " → " + countersLabel({ counters: next }) : " — counters off"));
});

// --- token dialog ---
$("#btn-add-tokens").addEventListener("click", openTokenDialog);
$("#token-pick-close").addEventListener("click", () => $("#token-dialog").close());
$("#token-copy-open").addEventListener("click", openCopySrcStep);
$("#copy-src-back").addEventListener("click", () => tokenStep("pick"));
$("#copy-search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const term = $("#copy-search").value.trim();
  if (!term) { toast("Type a card name first"); return; }
  runCopySearch(term);
});
$("#cp-back").addEventListener("click", () => {
  // Reached from a board tile, Back is the card it was opened from.
  if (copyBack === "card") {
    const stack = findStack(copyBackStackId);
    $("#token-dialog").close();
    if (stack) openStackDialog(stack);
    return;
  }
  tokenStep(copyBack);
});
$("#cp-next").addEventListener("click", () => {
  const card = buildCopyFromForm();
  if (card) openTokenQtyStep(card, "copy");
});
$("#tq-back").addEventListener("click", () => {
  // "set" was reached from the card, not from a step inside this dialog.
  if (tokenQtyBack === "card") {
    const stack = findStack(tokenSetKey);
    $("#token-dialog").close();
    if (stack) openStackDialog(stack);
    return;
  }
  tokenStep(tokenQtyBack);
});
$("#token-search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const term = $("#token-search").value.trim();
  if (!term) { toast("Type a token name first"); return; }
  runTokenSearch(term);
});
$("#ts-back").addEventListener("click", () => tokenStep("pick"));
$("#ts-custom").addEventListener("click", () => {
  $("#tc-name").value = $("#token-search").value.trim();
  $("#tc-power").value = "";
  $("#tc-tough").value = "";
  tokenStep("custom");
  $("#tc-pt").hidden = $("#tc-kind").getAttribute("aria-pressed") !== "true";
  $("#tc-name").focus();
});
$("#tc-back").addEventListener("click", () => tokenStep("search"));
$("#tc-kind").addEventListener("click", (e) => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(on));
  e.currentTarget.textContent = on ? "Creature" : "Other permanent";
  // A Treasure or a Clue has no P/T, and shouldn't be counted as an attacker.
  $("#tc-kind-note").textContent = on ? "Counted in the attacking total" : "Not an attacker";
  $("#tc-pt").hidden = !on;
});
$("#tc-next").addEventListener("click", () => {
  const card = buildPlainToken();
  if (card) openTokenQtyStep(card, "custom");
});
$("#token-qty-pad").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  setTokenQtyInput(padPress(tokenQtyInput, btn));
  renderTokenQty();
});
$("#tq-add").addEventListener("click", () => {
  const n = parseInt(tokenQtyInput, 10);
  if (tokenQtyMode === "set") {
    const stack = findStack(tokenSetKey);
    if (!stack) { $("#token-dialog").close(); return; }
    if (!(n >= 0)) { toast("Enter an amount first"); return; }
    const name = G.cards[stack.cardKey].name;
    setTokenCount(tokenSetKey, n);
    $("#token-dialog").close();
    renderGame();
    toast(n ? n + " " + name + " on the battlefield" : name + " cleared off");
    return;
  }
  if (!(n > 0)) { toast("Enter an amount first"); return; }
  const what = tokenLabel(tokenPickCard, n);
  createTokens(tokenPickCard, n);
  $("#token-dialog").close();
  renderGame();
  toast("+" + n + " " + what);
});

/* Clicking the backdrop closes any dialog. The click lands on the <dialog>
   itself, so compare against its box rather than the event target — padding
   inside the dialog reports the same target and would close it wrongly. */
for (const d of $$("dialog")) {
  d.addEventListener("click", (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) d.close();
  });
}

// --- confirm dialog ---
$("#cd-no").addEventListener("click", () => $("#confirm-dialog").close());
$("#cd-yes").addEventListener("click", () => {
  $("#confirm-dialog").close();
  const cb = confirmCb;
  setConfirmCb(null);
  if (cb) cb();
});

// --- end screen ---
$("#btn-again").addEventListener("click", () => {
  const deck = allDecks().find((d) => d.id === G.deckId);
  setG(null);
  persistGame();
  if (deck) openSetup(deck);
  else { renderDecks(); showScreen("screen-decks"); }
});
$("#btn-end-home").addEventListener("click", () => {
  if (viewerMode) { viewerLeave(); return; }
  setG(null);
  persistGame();
  renderDecks();
  showScreen("screen-decks");
});

/* Shortcuts for a laptop driving the game. Anything focusable keeps its own
   keys — a focused button already answers Space and Enter itself, and typing
   into a field must never advance the turn. */
const SHORTCUTS = {
  u: undo,
  " ": () => $("#btn-action").click(),
  enter: () => $("#btn-action").click(),
  d: () => $("#tile-damage").click(),
  l: () => $("#tile-life").click(),
  g: () => $("#tile-yard").click(),
  b: () => $("#tile-board").click(),
};

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$("#screen-game").classList.contains("active")) return;
  if (viewerMode) return;
  if ($("dialog[open]")) return;
  const t = e.target instanceof Element ? e.target : null;
  if (t && t.closest("input, textarea, select, [contenteditable]")) return;
  const key = e.key.toLowerCase();
  // A focused button already answers Space and Enter, and firing both would
  // take two turns on one press.
  if ((key === " " || key === "enter") && t && t.closest("button, a")) return;
  const run = SHORTCUTS[key];
  if (!run) return;
  e.preventDefault();
  run();
});

export {
  openJoin,
};
