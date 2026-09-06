#!/usr/bin/env node
// Resolve CACHE_VERSION collisions between open pull requests and main.
//
// Two branches that both bump the service worker cache version land in one of
// two states once the first of them merges:
//
//   - different bumps (v20 vs v21) conflict on line 1 of sw.js;
//   - identical bumps (both v19 -> v20) merge cleanly, and quietly ship two
//     different app shells under the same version, which is the staleness the
//     "Service worker cache version" check exists to prevent.
//
// Both resolve to the same rule: the branch's version has to end up strictly
// above main's, so take max(branch, main + 1). Anything else -- a conflict
// touching another file, or another part of sw.js -- is left for a human.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const BASE_BRANCH = process.env.BASE_BRANCH || "main";
const DRY_RUN = process.env.DRY_RUN === "true";
const ONLY_PR = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : null;

const VERSION_RE = /CACHE_VERSION = "v(\d+)"/;
const SHELL_RE = /^(index\.html|manifest\.json|icon-.*\.png)$/;
const CONFLICT_RE = /^<<<<<<< .*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> .*\n/gm;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

function versionOf(source) {
  const match = source.match(VERSION_RE);
  if (!match) throw new Error("sw.js carries no CACHE_VERSION");
  return Number(match[1]);
}

// The version a branch has to land on so its app shell is never served under a
// version main already published.
export function nextVersion(branchVersion, mainVersion) {
  return Math.max(branchVersion, mainVersion + 1);
}

// Rewrite a conflicted sw.js, but only when the whole disagreement is the one
// CACHE_VERSION line. Returns null when anything else is in the conflict, which
// is the signal to leave the merge alone.
export function resolveConflict(text, mainVersion) {
  const blocks = [...text.matchAll(CONFLICT_RE)];
  if (blocks.length !== 1) return null;

  const [block, ours, theirs] = blocks[0];
  const sides = [ours, theirs].map((side) => side.split("\n").filter((line) => line !== ""));
  if (!sides.every((lines) => lines.length === 1 && VERSION_RE.test(lines[0]))) return null;

  const version = nextVersion(Math.max(...sides.map((lines) => versionOf(lines[0]))), mainVersion);
  const line = sides[0][0].replace(VERSION_RE, `CACHE_VERSION = "v${version}"`);
  return { version, text: text.replace(block, `${line}\n`) };
}

function setVersion(version) {
  const text = readFileSync("sw.js", "utf8");
  writeFileSync("sw.js", text.replace(VERSION_RE, `CACHE_VERSION = "v${version}"`));
}

// Merge main in without committing, so a clean result can be thrown away and a
// conflicted one can still be resolved and committed as a merge.
function mergeInBase() {
  try {
    git(["merge", "--no-commit", "--no-ff", `origin/${BASE_BRANCH}`]);
    return { conflicted: false };
  } catch {
    const unmerged = git(["diff", "--name-only", "--diff-filter=U"]).split("\n").filter(Boolean);
    return { conflicted: true, unmerged };
  }
}

function abortMerge() {
  try {
    git(["merge", "--abort"]);
  } catch {
    git(["reset", "--hard", "HEAD"]);
  }
}

async function fixPullRequest(pr, mainVersion) {
  const ref = pr.head.ref;
  const label = `#${pr.number} (${ref})`;

  if (pr.head.repo?.full_name !== REPO) {
    console.log(`${label}: from a fork, nothing this workflow can push to. Skipped.`);
    return null;
  }

  git(["fetch", "origin", `+refs/heads/${ref}:refs/remotes/origin/${ref}`]);
  git(["checkout", "--force", "-B", "autofix-work", `origin/${ref}`]);

  const forkPoint = git(["merge-base", `origin/${BASE_BRANCH}`, "HEAD"]);
  const touched = git(["diff", "--name-only", forkPoint, "HEAD"]).split("\n").filter(Boolean);
  const touchesShell = touched.some((file) => SHELL_RE.test(file));

  const merge = mergeInBase();
  let version = null;
  let merged = false;

  if (merge.conflicted) {
    if (merge.unmerged.length !== 1 || merge.unmerged[0] !== "sw.js") {
      console.log(`${label}: conflicts beyond sw.js (${merge.unmerged.join(", ")}). Left alone.`);
      abortMerge();
      return null;
    }
    const resolved = resolveConflict(readFileSync("sw.js", "utf8"), mainVersion);
    if (!resolved) {
      console.log(`${label}: the sw.js conflict is not just CACHE_VERSION. Left alone.`);
      abortMerge();
      return null;
    }
    writeFileSync("sw.js", resolved.text);
    git(["add", "sw.js"]);
    version = resolved.version;
    merged = true;
  } else {
    abortMerge();
    const branchVersion = versionOf(readFileSync("sw.js", "utf8"));
    if (!touchesShell || branchVersion > mainVersion) {
      console.log(`${label}: merges cleanly at v${branchVersion} against v${mainVersion}. Nothing to do.`);
      return null;
    }
    version = nextVersion(branchVersion, mainVersion);
    setVersion(version);
    git(["add", "sw.js"]);
  }

  const how = merged ? `resolving the merge with ${BASE_BRANCH}` : `${BASE_BRANCH} is already at v${mainVersion}`;
  console.log(`${label}: setting CACHE_VERSION to v${version} (${how}).`);

  if (DRY_RUN) {
    console.log(`${label}: dry run, nothing pushed.`);
    abortMerge();
    return null;
  }

  git(["commit", "-m", `Set CACHE_VERSION to v${version}\n\nResolved automatically: ${how}.`]);
  git(["push", "origin", `autofix-work:${ref}`]);
  return { version, merged };
}

async function main() {
  // resolveConflict parses the two-sided marker form. A runner configured for
  // diff3 or zdiff3 would add a third, base section that it would not match.
  git(["config", "merge.conflictStyle", "merge"]);
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  git(["fetch", "origin", `+refs/heads/${BASE_BRANCH}:refs/remotes/origin/${BASE_BRANCH}`]);

  const mainVersion = versionOf(git(["show", `origin/${BASE_BRANCH}:sw.js`]));
  console.log(`${BASE_BRANCH} is at CACHE_VERSION v${mainVersion}.`);

  const open = await api(`/repos/${REPO}/pulls?state=open&base=${BASE_BRANCH}&per_page=100`);
  const candidates = ONLY_PR ? open.filter((pr) => pr.number === ONLY_PR) : open;
  if (candidates.length === 0) {
    console.log("No open pull requests to look at.");
    return;
  }

  for (const pr of candidates) {
    let fixed = null;
    try {
      fixed = await fixPullRequest(pr, mainVersion);
    } catch (error) {
      console.log(`#${pr.number}: autofix failed, leaving it for a human. ${error.message}`);
      abortMerge();
      continue;
    }
    if (!fixed) continue;

    // A push made with GITHUB_TOKEN does not start a workflow run, so the new
    // head commit would sit with no checks and never become mergeable.
    // workflow_dispatch is the documented exception, so ask for CI by hand.
    await api(`/repos/${REPO}/actions/workflows/ci.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: pr.head.ref }),
    });
    await api(`/repos/${REPO}/issues/${pr.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body:
          `Bumped \`CACHE_VERSION\` to \`v${fixed.version}\` on this branch. ` +
          `\`${BASE_BRANCH}\` is at \`v${mainVersion}\`, and the service worker needs a version ` +
          `above it so installed copies pick up this branch's app shell` +
          (fixed.merged ? `, so the conflict on that line was resolved that way.` : `.`) +
          `\n\nCI has been re-requested on the new head commit.`,
      }),
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
