/* Proves the service worker's cache version really does track the app shell.
 *
 * The old rule was a human one: change index.html, remember to bump
 * CACHE_VERSION in sw.js. It was enforced by a CI job and repaired by an
 * autofix that rewrote open pull requests, because people forget. The build
 * now derives the version from a hash of the shell's own bytes, which makes
 * forgetting impossible — but only for as long as that derivation is actually
 * wired up.
 *
 * So this doesn't trust it. It builds, perturbs the app shell, builds again,
 * and checks that the version moved. A build.mjs that hashed the wrong bytes,
 * or left the placeholder unsubstituted, fails here.
 *
 * Dependency-free apart from the build itself: `node tests/check-cache-version.mjs`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE = join(ROOT, "src", "index.html");

const build = () => execFileSync("node", [join(ROOT, "build.mjs")], { cwd: ROOT, stdio: "pipe" });
const versionOf = async () => {
  const sw = await readFile(join(ROOT, "_site", "sw.js"), "utf8");
  const m = sw.match(/const CACHE_VERSION\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("built sw.js has no CACHE_VERSION");
  return m[1];
};

const original = await readFile(PAGE, "utf8");
const problems = [];

try {
  build();
  const before = await versionOf();
  if (!/^v[0-9a-f]{12}$/.test(before)) {
    problems.push(`CACHE_VERSION is "${before}", not the hash the build should have written.`);
  }

  // Two builds of the same source must agree, or every deploy invalidates
  // every installed copy for no reason.
  build();
  const again = await versionOf();
  if (again !== before) problems.push(`Two builds of the same source disagreed: ${before} then ${again}.`);

  // A changed app shell must change the version. This is the whole point.
  await writeFile(PAGE, original.replace("</head>", "<!-- cache version probe -->\n</head>"));
  build();
  const after = await versionOf();
  if (after === before) {
    problems.push(`The app shell changed but CACHE_VERSION stayed ${after}. Installed copies would keep serving the old shell.`);
  }
} finally {
  await writeFile(PAGE, original);
  build();
}

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error("  ✗ " + p);
  console.error("");
  process.exit(1);
}
console.log("✓ cache version tracks the app shell");
