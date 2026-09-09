/* Assembles the static site Pages serves.
 *
 * The app still ships as one page with no runtime dependencies — this only
 * puts the source back together. src/ holds the app as files you can read:
 * markup in one place, the stylesheet cut into its sections, the game script
 * as ES modules, and each horde deck as its own JSON. The build inlines all
 * of it into _site/index.html, so what a tablet downloads is the single
 * static page it has always been.
 *
 * It also writes the service worker, and that is the part that earns its
 * keep: CACHE_VERSION comes out of a hash of the shell's own bytes and
 * APP_SHELL out of what actually landed in _site, so a changed app shell
 * cannot ship under a stale cache version.
 *
 *   node build.mjs
 *   node build.mjs --src <dir> --out <dir>   # build another tree somewhere else
 */
import { rm, mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = dirname(fileURLToPath(import.meta.url));

/* Both default to the repo's own src/ and _site/. The cache-version check
   passes its own, so it can perturb a copy of the source rather than the
   source, and leave _site alone. */
const flag = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
};
const SRC = flag("--src", join(ROOT, "src"));
const OUT = flag("--out", join(ROOT, "_site"));

/* Copied through untouched. Icons are referenced by the manifest and the
   page; the manifest is referenced by the page; the fonts by the stylesheet.
   Everything here is precached, so a font added under src/fonts/ is in the
   shell without anyone listing it. */
const ASSETS = ["manifest.json", "icon-192.png", "icon-512.png", "icon-180.png"];
const fontFiles = async () =>
  (await readdir(join(SRC, "fonts"))).filter((f) => f.endsWith(".woff2")).sort().map((f) => "fonts/" + f);

/* ---- the stylesheet ---------------------------------------------------- */

/* CSS is order-dependent — later rules win — so the files carry a numeric
   prefix and are concatenated in that order. The prefix is the cascade. */
async function buildCss() {
  const dir = join(SRC, "styles");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".css")).sort();
  const parts = [];
  for (const f of files) {
    parts.push(`/* ${f} */`, (await readFile(join(dir, f), "utf8")).trim(), "");
  }
  return parts.join("\n");
}

/* ---- the app ----------------------------------------------------------- */

/* boot.js is the entry because it is what runs: it pulls in the event wiring,
   which pulls in everything else, and the module graph decides the order the
   way the section order used to. */
async function buildJs() {
  const result = await esbuild.build({
    entryPoints: [join(SRC, "app", "boot.js")],
    bundle: true,
    format: "iife",
    // Match what the source is written in. The app targets the browser on a
    // tablet you already own, not a matrix of old ones, so nothing is lowered.
    target: "esnext",
    // Card names carry accents and the prose carries em dashes; without this
    // esbuild would escape them all into \u sequences.
    charset: "utf8",
    // The readable source is src/; what ships is for the tablet to run. This
    // takes about 40% off the script, and the page it's inlined into.
    minify: true,
    write: false,
    logLevel: "warning",
  });
  return result.outputFiles[0].text;
}

/* ---- partials ---------------------------------------------------------- */

/* Markup the page uses more than once lives in src/partials/ and is pulled in
   by name:

     <!-- build:partial pad mill-pad -->

   inlines src/partials/pad.html with __ID__ replaced by "mill-pad". Today the
   numeric pad is the only one — the same eleven buttons in the damage sheet,
   the life sheet and the token quantity step, differing only in the id, and
   already sharing their behaviour through padPress(). The marker's own
   indentation is applied to every line, so the assembled page reads as if the
   markup had been written there by hand. */
const PARTIAL = /^([ \t]*)<!-- build:partial (\S+) (\S+) -->[ \t]*$/gm;

async function inlinePartials(html) {
  const bodies = new Map();
  for (const [, , name] of html.matchAll(PARTIAL)) {
    if (bodies.has(name)) continue;
    try {
      bodies.set(name, (await readFile(join(SRC, "partials", `${name}.html`), "utf8")).trim());
    } catch {
      throw new Error(`src/index.html asks for partial "${name}", but src/partials/${name}.html is missing`);
    }
  }
  // Replacer functions rather than strings, for the same reason as below: in a
  // string replacement "$&" and friends are substitutions, and neither the
  // markup nor an id has any business being read that way.
  return html.replace(PARTIAL, (_, indent, name, id) =>
    bodies.get(name)
      .replaceAll("__ID__", () => id)
      .split("\n")
      .map((line) => (line ? indent + line : line))
      .join("\n"));
}

/* ---- assembly ---------------------------------------------------------- */

const shortHash = (bufs) => {
  const h = createHash("sha256");
  for (const b of bufs) h.update(b);
  return h.digest("hex").slice(0, 12);
};

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const [html, css, js] = await Promise.all([
    readFile(join(SRC, "index.html"), "utf8"),
    buildCss(),
    buildJs(),
  ]);

  for (const marker of ["<!-- build:styles -->", "<!-- build:script -->"]) {
    if (!html.includes(marker)) throw new Error(`src/index.html is missing ${marker}`);
  }

  // Both replacements pass a function rather than a string on purpose. In a
  // string replacement "$$" means a literal "$", which would quietly eat the
  // app's own $$ helper on the way into the page; a replacer function is
  // handed through untouched.
  const page = (await inlinePartials(html))
    .replace("<!-- build:styles -->", () => `<style>\n${css}</style>`)
    // A "</script>" inside a string literal would close the tag early. esbuild
    // has no reason to emit one today, but inlining is what makes it possible.
    .replace("<!-- build:script -->", () => `<script>\n${js.replace(/<\/script/gi, "<\\/script")}</script>`);

  await writeFile(join(OUT, "index.html"), page);
  const assets = [...ASSETS, ...(await fontFiles())];
  await mkdir(join(OUT, "fonts"), { recursive: true });
  await Promise.all(assets.map((a) => copyFile(join(SRC, a), join(OUT, a))));

  /* The service worker precaches whatever the build produced, under a version
     that is a hash of those same bytes. "./" is the page itself. */
  const shell = ["index.html", ...assets];
  const bytes = await Promise.all(shell.map((f) => readFile(join(OUT, f))));
  const version = "v" + shortHash(bytes);
  const sw = (await readFile(join(SRC, "sw.js"), "utf8"))
    .replace("__CACHE_VERSION__", version)
    .replace("__APP_SHELL__", JSON.stringify(["./", ...shell.map((f) => `./${f}`)], null, 2));
  await writeFile(join(OUT, "sw.js"), sw);

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + " kB";
  console.log(`✓ built _site  (index.html ${kb(page)} — css ${kb(css)}, js ${kb(js)})`);
  console.log(`  cache version ${version}, precaching ${shell.length + 1} entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
