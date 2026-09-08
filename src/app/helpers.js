/* Small shared utilities: DOM lookup, element building, shuffling, name normalisation, and the glossary popovers. */

/* =========================================================================
   Helpers
   ========================================================================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A term mentioned in prose that opens its definition from the glossary
   popovers declared once near the end of <body> (id="def-<term>"). */
const termBtn = (term, key, cls) => {
  const b = el("button", "term-btn" + (cls ? " " + cls : ""), term);
  b.type = "button";
  b.setAttribute("popovertarget", "def-" + key);
  return b;
};

/* Glossary popovers are top-layer elements, so the browser parks them in the
   middle of the viewport by default -- fine for a dialog, wrong for a word.
   These pin each one to the button that opened it: below the word when
   there's room, above it when there isn't, and pulled back inside the
   viewport either way. */
const POP_GAP = 8;   // breathing room between the trigger and the popover
const POP_EDGE = 10; // smallest gap we'll leave against a viewport edge
const POP_CARET = 16; // how close to a corner the caret may sit

let popAnchor = null; // trigger of the click currently opening a popover
let popOpen = null;   // {pop, btn} while an anchored popover is showing

function placeTermPop(pop, btn) {
  const a = btn.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  const below = a.bottom + POP_GAP;
  const above = a.top - POP_GAP - p.height;
  const goAbove = below + p.height > vh - POP_EDGE && above >= POP_EDGE;
  const top = Math.min(Math.max(goAbove ? above : below, POP_EDGE), Math.max(POP_EDGE, vh - p.height - POP_EDGE));

  const mid = a.left + a.width / 2;
  const left = Math.min(Math.max(mid - p.width / 2, POP_EDGE), Math.max(POP_EDGE, vw - p.width - POP_EDGE));

  pop.style.top = top + "px";
  pop.style.left = left + "px";
  pop.style.setProperty("--caret-x", Math.min(Math.max(mid - left, POP_CARET), Math.max(POP_CARET, p.width - POP_CARET)) + "px");
  pop.classList.toggle("above", goAbove);
  pop.classList.toggle("below", !goAbove);
  pop.classList.add("placed");
}

function initTermPops() {
  document.documentElement.classList.add("js-pop");

  /* The popover opens as this click's default action, so a capture-phase
     listener sees the trigger before the toggle event fires. Keyboard
     activation of a <button> dispatches a click too, so this covers both. */
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest("[popovertarget]") : null;
    popAnchor = t;
    const pop = t && document.getElementById(t.getAttribute("popovertarget"));
    if (pop && pop.classList.contains("term-pop")) pop.classList.add("anchoring");
  }, true);

  for (const pop of $$("[popover].term-pop")) {
    pop.addEventListener("toggle", (e) => {
      if (e.newState === "open") {
        const btn = pop.classList.contains("anchoring") ? popAnchor : null;
        if (!btn) return; // opened without a trigger we know: leave it centred
        popOpen = { pop, btn };
        placeTermPop(pop, btn);
      } else {
        if (popOpen && popOpen.pop === pop) popOpen = null;
        pop.classList.remove("anchoring", "placed", "above", "below");
        pop.style.removeProperty("top");
        pop.style.removeProperty("left");
      }
    });
  }

  /* Scrolling or resizing moves the word out from under its definition.
     Follow it, and give up once the word has left the viewport entirely. */
  const follow = () => {
    if (!popOpen) return;
    const a = popOpen.btn.getBoundingClientRect();
    if (a.bottom < 0 || a.top > document.documentElement.clientHeight) popOpen.pop.hidePopover();
    else placeTermPop(popOpen.pop, popOpen.btn);
  };
  addEventListener("scroll", follow, { passive: true, capture: true });
  addEventListener("resize", follow);
}

/* The mill pad and the token quantity pad are the same widget: a digit, a
   clear, or a backspace over a string of at most four digits. */
function padPress(current, btn) {
  const { d, k } = btn.dataset;
  if (d != null) return current.length < 4 ? (current + d).replace(/^0+(?=\d)/, "") : current;
  if (k === "clear") return "";
  if (k === "back") return current.slice(0, -1);
  return current;
}

function toast(msg) {
  const t = el("div", "toast", msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* A biased shuffle would quietly skew which bosses surface early, so this is
   a plain correct Fisher-Yates. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* Straight quotes for lookup; the decklists use curly ones inconsistently. */
const normName = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();

export {
  $, $$, el, initTermPops, normName, padPress, pick, shuffle, sleep, termBtn, toast,
  uid,
};
