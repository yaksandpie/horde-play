/* Card lookup, with an offline fallback that never throws. */

import { sleep, uid } from "./helpers.js";
import { getImage, putImage } from "./persistence.js";

/* =========================================================================
   Scryfall lookup

   Non-tokens go through /cards/collection (75 identifiers per request, so a
   300-card horde is one or two calls). Tokens aren't reliably addressable by
   name there, so they fall back to a throttled search. Every failure is
   non-fatal: the card keeps its parsed name and plays as a text face.
   ========================================================================= */

const SCRYFALL = "https://api.scryfall.com";
const COLLECTION_CHUNK = 75;
const THROTTLE_MS = 110; // Scryfall asks for 50-100ms between requests
/* Art comes off Scryfall's image CDN, not the rate-limited API, so a few
   downloads can be in flight at once. Six is enough to hide the latency
   without opening a tab's worth of sockets on a phone. */
const IMAGE_CONCURRENCY = 6;

let lookupAborted = false;
/* A dead network should cost one failed request, not one per card: the first
   connection-level failure short-circuits the rest of the run. */
let networkDead = false;

function cardFromScryfall(sf, entry) {
  const face = sf.card_faces && sf.card_faces[0] ? sf.card_faces[0] : sf;
  const typeLine = sf.type_line || face.type_line || "";
  const oracle = sf.oracle_text || face.oracle_text || "";
  const imageUri =
    (sf.image_uris && sf.image_uris.normal) ||
    (face.image_uris && face.image_uris.normal) || null;
  return {
    key: "c_" + uid(),
    name: sf.name || entry.name,
    scryfallId: sf.id || null,
    isToken: sf.layout === "token" || /\bToken\b/.test(typeLine),
    rarity: sf.rarity || null,
    isLegendary: /\bLegendary\b/.test(typeLine),
    hasDefender: /\bDefender\b/.test(oracle),
    typeLine,
    manaCost: sf.mana_cost || face.mana_cost || "",
    oracleText: oracle,
    power: sf.power != null ? String(sf.power) : (face.power != null ? String(face.power) : null),
    toughness: sf.toughness != null ? String(sf.toughness) : (face.toughness != null ? String(face.toughness) : null),
    colors: sf.colors || face.colors || sf.color_identity || [],
    imageUri,
    resolved: true,
  };
}

function cardFromEntry(entry) {
  // No Scryfall data: the best card we can build from the decklist line alone.
  return {
    key: "c_" + uid(),
    name: entry.name,
    scryfallId: null,
    isToken: !!entry.tokenHint,
    catHint: entry.catHint || null,
    rarity: null,
    isLegendary: false,
    hasDefender: false,
    typeLine: entry.ptHint ? "Creature" : "",
    manaCost: "",
    oracleText: "",
    power: entry.ptHint ? entry.ptHint.power : null,
    toughness: entry.ptHint ? entry.ptHint.toughness : null,
    colors: [],
    imageUri: null,
    resolved: false,
  };
}

function readJSON(res) {
  if (!res.ok) throw new Error("Scryfall " + res.status);
  return res.json();
}

/* One request, with no memory of failure. The viewer resolves cards through
   this: a dropped request on the watching phone is that snapshot's problem,
   not a reason to stop looking anything up for the rest of the game. */
const fetchJSON = (url, opts) => fetch(url, opts).then(readJSON);

/* The import-time lookup: one connection-level failure short-circuits the
   rest of the run, so a dead network costs one request rather than one per
   card. Only runImport and startGame reset it. */
async function sfJSON(url, opts) {
  if (networkDead) throw new Error("offline");
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    // fetch only rejects on a connection-level failure, never on a 404.
    networkDead = true;
    throw e;
  }
  return readJSON(res);
}

async function lookupNamed(entry) {
  // Tokens first when hinted: an exact-name hit would otherwise silently turn
  // "Zombie" the token into "Zombie" the creature card.
  const order = entry.tokenHint ? ["token", "exact", "fuzzy"] : ["exact", "token", "fuzzy"];
  for (const how of order) {
    if (lookupAborted || networkDead) return null;
    try {
      if (how === "exact") {
        return await sfJSON(SCRYFALL + "/cards/named?exact=" + encodeURIComponent(entry.name));
      }
      if (how === "fuzzy") {
        return await sfJSON(SCRYFALL + "/cards/named?fuzzy=" + encodeURIComponent(entry.name));
      }
      const q = '!"' + entry.name.replace(/"/g, "") + '" is:token';
      const data = await sfJSON(SCRYFALL + "/cards/search?q=" + encodeURIComponent(q) + "&unique=cards");
      if (data.data && data.data.length) return data.data[0];
    } catch { /* try the next strategy */ }
    await sleep(THROTTLE_MS);
  }
  return null;
}

/* Resolve every entry to a card object. Never throws: whatever can't be looked
   up comes back as an unresolved card. */
async function resolveEntries(entries, onProgress) {
  const cards = new Array(entries.length).fill(null);
  let done = 0;
  const bump = (label) => onProgress && onProgress(done, entries.length, label);

  const batchIdx = entries.map((e, i) => i).filter((i) => !entries[i].tokenHint);
  for (let c = 0; c < batchIdx.length; c += COLLECTION_CHUNK) {
    if (lookupAborted || networkDead) break;
    const slice = batchIdx.slice(c, c + COLLECTION_CHUNK);
    bump("Looking up " + slice.length + " cards");
    try {
      const data = await sfJSON(SCRYFALL + "/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: slice.map((i) => ({ name: entries[i].name })) }),
      });
      // Results omit misses, so match by name rather than position.
      const byName = new Map();
      for (const sf of data.data || []) byName.set(sf.name.toLowerCase(), sf);
      for (const i of slice) {
        const want = entries[i].name.toLowerCase();
        const hit = byName.get(want) ||
          (data.data || []).find((sf) => sf.name.toLowerCase().startsWith(want));
        if (hit) { cards[i] = cardFromScryfall(hit, entries[i]); done++; }
      }
    } catch { /* fall through to the per-card pass */ }
    bump("Looking up cards");
    await sleep(THROTTLE_MS);
  }

  for (let i = 0; i < entries.length; i++) {
    if (lookupAborted || networkDead) break;
    if (cards[i]) continue;
    bump(entries[i].name);
    const sf = await lookupNamed(entries[i]);
    cards[i] = sf ? cardFromScryfall(sf, entries[i]) : cardFromEntry(entries[i]);
    done++;
    bump(entries[i].name);
  }

  for (let i = 0; i < entries.length; i++) {
    if (!cards[i]) cards[i] = cardFromEntry(entries[i]);
  }
  return cards;
}

/* Download and cache art. Failures are silent by design — a missing image
   costs a prettier card, not a playable one. */
async function cacheImages(cards, onProgress) {
  // One download per printing: a deck lists the same token under several
  // names less often than it lists the same card twice.
  const seen = new Set();
  const withArt = cards.filter((c) =>
    c.imageUri && c.scryfallId && !seen.has(c.scryfallId) && seen.add(c.scryfallId));
  let done = 0;
  const report = (label) => onProgress && onProgress(done, withArt.length, label);
  report("");
  for (let i = 0; i < withArt.length; i += IMAGE_CONCURRENCY) {
    if (lookupAborted || networkDead) break;
    await Promise.all(withArt.slice(i, i + IMAGE_CONCURRENCY).map(async (card) => {
      try {
        if (!(await getImage(card.scryfallId))) {
          const res = await fetch(card.imageUri);
          if (res.ok) await putImage(card.scryfallId, await res.blob());
        }
      } catch { /* keep going */ }
      done++;
      report(card.name);
    }));
  }
  report("");
}

/* Written from other modules; ESM bindings are read-only across files. */
export const setLookupAborted = (v) => { lookupAborted = v; };
export const setNetworkDead = (v) => { networkDead = v; };

export {
  COLLECTION_CHUNK, IMAGE_CONCURRENCY, SCRYFALL, THROTTLE_MS, cacheImages, cardFromEntry,
  cardFromScryfall, fetchJSON, lookupAborted, networkDead, resolveEntries, sfJSON,
};
