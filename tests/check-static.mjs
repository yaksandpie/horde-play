/* Static checks for a repo that has no build step.
 *
 * There is no bundler here to catch a typo, so CI does the job a build would
 * otherwise do: parse the inline script, parse the JSON, and prove that every
 * file the app and the service worker reference actually exists.
 *
 * Runs on plain Node with no dependencies: `node tests/check-static.mjs`.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (name) => readFile(join(ROOT, name), "utf8");

/* ---- 1. The inline script parses ---- */

const html = await read("index.html");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];

if (!scripts.length) fail("index.html has no inline <script> — did the app move out of the file?");

scripts.forEach(([, code], i) => {
  // Count the lines before this block so a syntax error points at index.html.
  const line = html.slice(0, html.indexOf(code)).split("\n").length;
  try {
    new vm.Script(code, { filename: `index.html (inline script ${i + 1}, starts at line ${line})` });
  } catch (e) {
    fail(`index.html inline script ${i + 1} (line ${line}): ${e.message}`);
  }
});

/* ---- 2. The service worker parses ---- */

const sw = await read("sw.js");
try {
  new vm.Script(sw, { filename: "sw.js" });
} catch (e) {
  fail(`sw.js: ${e.message}`);
}

/* ---- 3. The manifest is valid, and its icons exist ---- */

let manifest;
try {
  manifest = JSON.parse(await read("manifest.json"));
} catch (e) {
  fail(`manifest.json is not valid JSON: ${e.message}`);
}

if (manifest) {
  for (const field of ["name", "short_name", "start_url", "icons"]) {
    if (!manifest[field]) fail(`manifest.json is missing "${field}".`);
  }
  for (const icon of manifest.icons || []) {
    if (!existsSync(join(ROOT, icon.src))) fail(`manifest.json points at a missing icon: ${icon.src}`);
  }
}

/* ---- 4. Every local file index.html references exists ---- */

const refs = new Set();
for (const [, attr, url] of html.matchAll(/\b(href|src)\s*=\s*"([^"]+)"/gi)) {
  if (/^(https?:|data:|mailto:|#|\/\/)/i.test(url)) continue;
  refs.add(url.replace(/^\.\//, "").split(/[?#]/)[0]);
}
for (const ref of refs) {
  if (!existsSync(join(ROOT, ref))) fail(`index.html references a missing file: ${ref}`);
}

/* ---- 5. The service worker's app shell is complete and real ---- */

const shellMatch = sw.match(/const APP_SHELL\s*=\s*\[([\s\S]*?)\]/);
if (!shellMatch) {
  fail("sw.js no longer declares APP_SHELL — the precache check can't run.");
} else {
  const shell = [...shellMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""));
  for (const entry of shell) {
    if (entry === "" || entry === "/") continue; // "./" is the page itself
    if (!existsSync(join(ROOT, entry))) fail(`sw.js precaches a missing file: ${entry}`);
  }
  // Anything the page loads from our own origin has to be in the shell, or the
  // app installs to a home screen and then breaks the first time it's offline.
  for (const ref of refs) {
    if (!shell.includes(ref)) fail(`index.html loads ${ref}, but sw.js does not precache it — it won't work offline.`);
  }
  if (!/const CACHE_VERSION\s*=\s*"v\d+"/.test(sw)) {
    fail('sw.js should keep a CACHE_VERSION of the form "v<number>".');
  }
}

/* ---- Report ---- */

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error("  ✗ " + p);
  console.error("");
  process.exit(1);
}
console.log("✓ static checks passed");
