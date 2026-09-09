/* Turning a pasted decklist into entries the app can resolve. */

import { normName } from "./helpers.js";

/* =========================================================================
   Decklist parsing

   Deliberately forgiving: horde lists come from many sources, and a line the
   parser mangles is far better surfaced on the review screen than rejected.
   ========================================================================= */

/* A section heading also hints at card type, which is all an offline import
   has to go on until Scryfall fills in real type lines. */
function catFromSection(label, isToken) {
  if (isToken) return "creature";
  if (/creature|legendar/i.test(label)) return "creature";
  if (/spell|instant|sorcer/i.test(label)) return "spell";
  if (/enchant|artifact|planeswalker/i.test(label)) return "permanent";
  return null;
}

/* "Creatures: (79)", "Tokens (150)", "Legendary Creatures (Bosses): (8)" */
const HEADER_RE = /^(.*?):?\s*\(([^()]*)\)\s*$/;
const BARE_HEADERS = /^(tokens?|deck|main ?deck|sideboard|commander|bosses?|horde|creatures?|spells?|instants?|sorceries|enchantments?|artifacts?|planeswalkers?|legendar(y|ies)|lands?)\b/i;

function parseDecklist(text, opts = {}) {
  const joinWrapped = opts.joinWrapped !== false;
  const entries = [];
  const warnings = [];
  let sectionIsToken = null;
  let sectionCat = null;
  let sawHeader = false;

  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("#")) continue;
    line = line.replace(/^(SB|MB):\s*/i, "");

    // Section header: no leading count ("3 ..." or "x3 ..."), and either
    // "(...)"-suffixed, ':'-suffixed, or a bare known heading word.
    if (!/^(\d|[xX]\d+\s)/.test(line)) {
      const h = line.match(HEADER_RE);
      const isHeader = h || line.endsWith(":") || (BARE_HEADERS.test(line) && line.split(" ").length <= 4);
      // A wrapped continuation always wins over a header guess when the
      // previous line was an entry and this line isn't count-suffixed.
      const canContinue = joinWrapped && entries.length && !h && !line.endsWith(":");
      if (canContinue) {
        const prev = entries[entries.length - 1];
        prev.name = (prev.name.endsWith("-") ? prev.name : prev.name + " ") + line;
        prev.name = prev.name.replace(/\s+/g, " ").trim();
        continue;
      }
      if (isHeader) {
        const label = (h ? h[1] : line.replace(/:$/, "")).trim();
        sectionIsToken = /token/i.test(label);
        sectionCat = catFromSection(label, sectionIsToken);
        sawHeader = true;
        continue;
      }
    }

    let qty = 1;
    let name = line;
    const m = line.match(/^(\d+)\s*[xX]?\s+(.*)$/) || line.match(/^[xX](\d+)\s+(.*)$/);
    if (m) { qty = parseInt(m[1], 10); name = m[2]; }

    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (qty > 999) {
      warnings.push('Clamped an implausible quantity on "' + name + '" (' + qty + ' → 999).');
      qty = 999;
    }

    entries.push({
      qty, name,
      tokenHint: sectionIsToken === true,
      catHint: sectionCat,
      raw: rawLine.trim(),
    });
  }

  // Post-process names now that continuations are joined.
  for (const e of entries) {
    let name = normName(e.name);

    // Trailing set/collector data and foil markers.
    const setMatch = name.match(/\s*[([]([A-Za-z0-9_]{2,6})[)\]]\s*([A-Za-z0-9-]+)?\s*$/);
    if (setMatch) name = name.slice(0, setMatch.index);
    name = name.replace(/\s*\*[^*]*\*\s*$/, "").trim();

    // "Token: Zombie" marks a token regardless of section.
    if (/^tokens?\s*[:\-]\s*/i.test(name)) {
      name = name.replace(/^tokens?\s*[:\-]\s*/i, "").trim();
      e.tokenHint = true;
    }

    // Split cards and DFCs: the front face is what Scryfall answers to.
    name = name.split(/\s*\/\/\s*/)[0].trim();

    // A trailing "2/2" is common token shorthand.
    const pt = name.match(/^(.*?)[\s,-]+(\d+|\*)\s*\/\s*(\d+|\*)$/);
    if (pt && pt[1].trim()) {
      name = pt[1].trim();
      e.ptHint = { power: pt[2], toughness: pt[3] };
      if (!sawHeader) e.tokenHint = true;
    }
    e.name = name;
  }

  const kept = entries.filter((e) => {
    if (e.name) return true;
    warnings.push('Skipped a line with no card name: "' + e.raw + '"');
    return false;
  });

  // Merge duplicates so the review screen shows one row per card.
  const merged = new Map();
  for (const e of kept) {
    const key = e.name.toLowerCase() + "|" + (e.tokenHint ? "t" : "c");
    const hit = merged.get(key);
    if (hit) { hit.qty += e.qty; hit.ptHint = hit.ptHint || e.ptHint; }
    else merged.set(key, { ...e });
  }

  return { entries: Array.from(merged.values()), warnings };
}

export {
  parseDecklist,
};
