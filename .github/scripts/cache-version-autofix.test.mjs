import test from "node:test";
import assert from "node:assert/strict";

import { nextVersion, resolveConflict } from "./cache-version-autofix.mjs";

// Exactly what `git merge` writes into sw.js when two branches bump the line
// to different values — captured from a real conflict, markers and all.
const conflicted = `<<<<<<< HEAD
const CACHE_VERSION = "v20";
=======
const CACHE_VERSION = "v21";
>>>>>>> main
const CACHE_NAME = \`horde-play-\${CACHE_VERSION}\`;
`;

test("a branch already above main keeps its own version", () => {
  assert.equal(nextVersion(25, 21), 25);
});

test("a branch level with or behind main goes one past it", () => {
  assert.equal(nextVersion(20, 20), 21);
  assert.equal(nextVersion(20, 21), 22);
});

test("a CACHE_VERSION conflict resolves above main, not merely to the higher side", () => {
  const resolved = resolveConflict(conflicted, 21);
  assert.equal(resolved.version, 22);
  assert.equal(
    resolved.text,
    'const CACHE_VERSION = "v22";\nconst CACHE_NAME = `horde-play-${CACHE_VERSION}`;\n'
  );
  assert.ok(!resolved.text.includes("<<<<<<<"));
});

test("a conflict carrying anything but the version line is left for a human", () => {
  const withExtra = conflicted.replace(
    'const CACHE_VERSION = "v21";\n',
    'const CACHE_VERSION = "v21";\nself.skipWaiting();\n'
  );
  assert.equal(resolveConflict(withExtra, 21), null);
});

test("a second conflict elsewhere in the file is left for a human", () => {
  assert.equal(resolveConflict(conflicted + conflicted, 21), null);
});
