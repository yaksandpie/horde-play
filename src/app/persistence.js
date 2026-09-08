/* localStorage for decks and the game in progress, IndexedDB for card art. */

import { toast } from "./helpers.js";
import { G } from "./state.js";
import { shareBroadcast, shareOn, shareStop, viewerMode } from "./share.js";

/* =========================================================================
   Persistence
   ========================================================================= */

const LS_DECKS = "horde.decks";
const LS_GAME = "horde.game";

function loadDecks() {
  try { return JSON.parse(localStorage.getItem(LS_DECKS)) || []; }
  catch { return []; }
}
function saveDecks(decks) {
  try { localStorage.setItem(LS_DECKS, JSON.stringify(decks)); }
  catch { toast("Couldn't save — device storage is full"); }
}
function loadGame() {
  try { return JSON.parse(localStorage.getItem(LS_GAME)) || null; }
  catch { return null; }
}
function persistGame() {
  if (viewerMode) return;  // a viewer is holding someone else's game
  try {
    if (G) localStorage.setItem(LS_GAME, JSON.stringify(G));
    else localStorage.removeItem(LS_GAME);
  } catch { /* a full quota shouldn't interrupt a game in progress */ }
  if (G) shareBroadcast();
  else if (shareOn) shareStop();
}

const IDB_NAME = "horde-cards";
const IDB_STORE = "images";

/* Image storage is a nice-to-have: if IndexedDB is unavailable (private mode,
   storage denied) every call degrades to a no-op and the app falls back to
   generated text faces rather than failing to start. */
let imageDB = null;
const imageDBReady = new Promise((resolve) => {
  let req;
  try { req = indexedDB.open(IDB_NAME, 1); } catch { return resolve(null); }
  req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
  req.onsuccess = () => { imageDB = req.result; resolve(imageDB); };
  req.onerror = () => resolve(null);
});

async function putImage(key, blob) {
  await imageDBReady;
  if (!imageDB) return;
  return new Promise((resolve) => {
    try {
      const tx = imageDB.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    } catch { resolve(); }
  });
}
async function getImage(key) {
  await imageDBReady;
  if (!imageDB) return null;
  return new Promise((resolve) => {
    try {
      const tx = imageDB.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export {
  getImage, loadDecks, loadGame, persistGame, putImage, saveDecks,
};
