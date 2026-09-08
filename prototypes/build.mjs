/* Builds the board-placement prototypes from index.html.
 *
 * These are throwaway copies of the app with one change each, kept out of
 * index.html so nothing ships by accident and no CACHE_VERSION bump is owed.
 * index.html moves fast, so the copies are generated rather than hand-forked:
 * rerun `node prototypes/build.mjs` after the app changes and the prototypes
 * come back current. Every patch below asserts its anchor, so a rename in
 * index.html fails the build loudly instead of silently producing a copy
 * with the change missing.
 *
 * Runs on plain Node with no dependencies.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = fileURLToPath(new URL(".", import.meta.url));

const source = await readFile(ROOT + "index.html", "utf8");

/* A patch is a find/replace that refuses to no-op: the whole point is to catch
   the day index.html renames the thing being patched. */
function patch(html, find, replace, label) {
  const at = html.indexOf(find);
  if (at === -1) throw new Error(`${label}: anchor not found in index.html — the app moved, update this patch.`);
  if (html.indexOf(find, at + find.length) !== -1) throw new Error(`${label}: anchor is ambiguous.`);
  return html.slice(0, at) + replace + html.slice(at + find.length);
}

/* ---- Shared: make a copy runnable from prototypes/ ---- */

function base(html, { slug, name, blurb, sibling, siblingName }) {
  // Icons live a directory up now; the manifest goes entirely, so a prototype
  // can't be installed to a home screen or fight the real app's start_url.
  html = patch(html, '<link rel="icon" type="image/png" href="icon-192.png">',
    '<link rel="icon" type="image/png" href="../icon-192.png">', "favicon");
  html = patch(html, '<link rel="apple-touch-icon" href="icon-180.png">',
    '<link rel="apple-touch-icon" href="../icon-180.png">', "touch icon");
  html = patch(html, '<link rel="manifest" href="manifest.json">',
    "<!-- manifest dropped: a prototype is not installable -->", "manifest");

  // Registering the real service worker from here would resolve to
  // prototypes/sw.js (a 404), and a prototype has no business owning a cache.
  html = patch(html,
    `if ("serviceWorker" in navigator) {\n  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));`,
    `if (false) {\n  // Service worker deliberately not registered in a prototype.`,
    "service worker");

  html = patch(html, "<title>Horde Play</title>",
    `<title>Horde Play — prototype ${slug.toUpperCase()}: ${name}</title>`, "title");

  // A ribbon, so a screenshot of one of these can never be mistaken for the
  // real app and either prototype is one tap from the other.
  // <body> also appears inside CSS comments, so anchor on the line itself.
  html = patch(html, "\n<body>\n", `
<body>
<div class="proto-ribbon">
  <b>Prototype ${slug.toUpperCase()}</b>
  <span>${name} — ${blurb}</span>
  <a href="${sibling}">Compare with ${siblingName} &rsaquo;</a>
</div>
`, "ribbon");

  html = patch(html, "</style>", `
  /* ---------- Prototype ribbon (not part of the app) ---------- */
  .proto-ribbon {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 7px 16px;
    background: #3a2f57; border-bottom: 1px solid #6d5bd0;
    font-size: 12.5px; color: #ded8f5;
  }
  .proto-ribbon b { color: #fff; letter-spacing: .06em; text-transform: uppercase; font-size: 11px; }
  .proto-ribbon a { color: #c9bdff; margin-left: auto; }
</style>`, "ribbon css");

  return html;
}

/* ---- A: trim the duplicated attackers grid out of combat ---- */

function protoA(html) {
  html = patch(html, `  if (count) {
    const grid = el("div", "cardgrid lg");
    for (const stack of attackers()) {
      grid.appendChild(cardSlot(G.cards[stack.cardKey],
        { count: stack.count, rule: G.waveEnd, stack },
        () => openStackDialog(stack)));
    }
    body.appendChild(grid);
  }`, `  if (count) {
    /* PROTOTYPE A: combat used to redraw every attacker here at 160px tiles —
       the board panel restated above it, larger, which pushed the panel itself
       further down the page exactly when it was being read. The roster names
       what is coming without drawing it twice, and the board panel below is
       the one place creatures are rendered. */
    const roster = el("p", "stage-roster");
    attackers().forEach((stack, i) => {
      if (i) roster.append(document.createTextNode(" "));
      roster.appendChild(el("span", "roster-chip",
        G.cards[stack.cardKey].name + (stack.count > 1 ? " \\u00d7" + stack.count : "")));
    });
    body.appendChild(roster);
    const jump = el("button", "btn sm ghost", "Review the board \\u2193");
    jump.addEventListener("click", jumpToBoard);
    body.appendChild(jump);
  }`, "A: combat grid");

  html = patch(html, "</style>", `
  /* ---------- Prototype A: the combat roster ---------- */
  .stage-roster { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .roster-chip {
    padding: 4px 9px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--line);
    font-size: 13px; color: var(--ink-soft);
  }
</style>`, "A: css");

  return html;
}

/* ---- B: a compact sticky strip of the board, panel left where it is ---- */

function protoB(html) {
  html = patch(html, `      <button class="t" id="tile-yard" aria-label="Open the graveyard">
        <span class="n" id="c-yard">0</span><span class="k">Graveyard</span>
      </button>
    </div>
`, `      <button class="t" id="tile-yard" aria-label="Open the graveyard">
        <span class="n" id="c-yard">0</span><span class="k">Graveyard</span>
      </button>
    </div>

    <!-- PROTOTYPE B: the board in miniature, stuck under the header so it is
         on screen through every phase. The full panel stays below. -->
    <div class="board-strip" id="board-strip" hidden>
      <span class="strip-label" id="strip-label"></span>
      <div class="strip-scroll" id="strip-scroll"></div>
    </div>
`, "B: strip markup");

  html = patch(html, `  for (const stack of G.board) {
    const card = G.cards[stack.cardKey];
    box.appendChild(cardSlot(card, { count: stack.count, rule: G.waveEnd, stack },
      () => openStackDialog(stack)));
  }
}`, `  for (const stack of G.board) {
    const card = G.cards[stack.cardKey];
    box.appendChild(cardSlot(card, { count: stack.count, rule: G.waveEnd, stack },
      () => openStackDialog(stack)));
  }

  renderBoardStrip(total, atk);
}

/* PROTOTYPE B: the same stacks as the panel, small enough to sit under the
   header all game. Tapping one opens the same stack sheet the panel does, so
   the strip is a second way in rather than a second set of controls. */
function renderBoardStrip(total, atk) {
  const strip = $("#board-strip");
  strip.hidden = G.board.length === 0;
  if (strip.hidden) return;

  $("#strip-label").textContent = total + " on board \\u00b7 " + atk + " attacking";

  const scroll = $("#strip-scroll");
  scroll.textContent = "";
  for (const stack of G.board) {
    scroll.appendChild(cardSlot(G.cards[stack.cardKey],
      { count: stack.count, rule: G.waveEnd, stack },
      () => openStackDialog(stack)));
  }
}`, "B: strip render");

  html = patch(html, "</style>", `
  /* ---------- Prototype B: the sticky board strip ---------- */
  .board-strip {
    position: sticky; top: 52px; z-index: 25;
    display: flex; align-items: center; gap: 10px;
    margin-top: 8px; padding: 7px 10px;
    background: var(--surface); border: 1px solid var(--line);
    border-left: 3px solid var(--accent); border-radius: 10px;
    box-shadow: var(--shadow);
  }
  .board-strip .strip-label {
    flex: none; max-width: 96px;
    font-size: 11px; line-height: 1.25; letter-spacing: .04em;
    text-transform: uppercase; color: var(--muted);
  }
  .strip-scroll {
    display: flex; gap: 6px;
    overflow-x: auto; overscroll-behavior-x: contain;
    padding-bottom: 2px;
  }
  .strip-scroll .slot { width: 76px; flex: none; container-type: inline-size; }
  /* The badges are sized for a 104px board tile and crowd a 76px one. */
  .strip-scroll .cf-count { font-size: 12px; min-width: 22px; padding: 1px 5px; right: 3px; bottom: 3px; }
  .strip-scroll .cf-badge, .strip-scroll .cf-counters { display: none; }
  @media (max-width: 560px) { .board-strip .strip-label { display: none; } }
</style>`, "B: css");

  return html;
}

/* ---- Build, and prove the copies still parse ---- */

const variants = [
  { slug: "a", file: "a-combat-trim.html", name: "Combat trim", apply: protoA,
    blurb: "combat names its attackers instead of redrawing them",
    sibling: "b-board-strip.html", siblingName: "B" },
  { slug: "b", file: "b-board-strip.html", name: "Board strip", apply: protoB,
    blurb: "a sticky miniature of the board under the header",
    sibling: "a-combat-trim.html", siblingName: "A" },
];

for (const v of variants) {
  const html = v.apply(base(source, v));

  // check-static.mjs only parses index.html, so the prototypes check themselves.
  for (const [i, [, code]] of [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
    try {
      new vm.Script(code, { filename: `${v.file} (inline script ${i + 1})` });
    } catch (e) {
      throw new Error(`${v.file} inline script ${i + 1} does not parse: ${e.message}`);
    }
  }

  await writeFile(OUT + v.file, html);
  console.log(`✓ prototypes/${v.file}`);
}
