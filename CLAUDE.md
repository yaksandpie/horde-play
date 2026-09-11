# Working in this repo

## The app is built, not edited in place

`src/` is the source and `_site/` is the build output Pages serves. There is no
`index.html` at the repo root any more — `node build.mjs` assembles one from
`src/index.html`, `src/styles/*.css`, the ES modules under `src/app/` and the
deck JSON under `src/decks/`, and inlines all of it so what ships is still a
single static page with no runtime dependencies.

- Edit `src/`. Never edit `_site/`; it's gitignored and rewritten every build.
- `npm ci` at the repo root first, once per checkout. esbuild is the only build
  dependency; the app itself has none, and the test tooling lives separately
  under `tests/`.
- `src/app/boot.js` is the bundle entry. It pulls in `events.js`, which reaches
  the rest of the modules, so the module graph decides evaluation order the way
  the section order used to.
- ES module bindings are read-only across files. A module that has to write
  another module's `let` calls an exported setter (`setG`, `setMillInput`, …)
  rather than assigning. Reads are ordinary imports — live bindings, so they see
  the current value.
- `src/styles/` is concatenated in filename order, so the numeric prefix is the
  cascade order. Adding a file means picking where it belongs in that order.
- `src/decks/*.json` is one horde deck per file. `src/decks.js` imports them and
  lists them in the order they appear on the decks screen, so a new deck goes in
  the group it belongs to rather than on the end.
- Markup the page uses more than once lives in `src/partials/` and is pulled in
  by a marker: `<!-- build:partial pad mill-pad -->` inlines
  `src/partials/pad.html` with `__ID__` replaced by `mill-pad`, at the marker's
  own indentation. `pad.html` — the numeric keypad — is the only one today.
- `src/fonts/*.woff2` is copied through and precached by whatever is sitting
  there; the build globs the directory, so adding a face means adding a file and
  an `@font-face` rule, not editing a list.

## Lean on CI, don't reproduce it locally

`.github/workflows/ci.yml` runs three jobs on every push to `main` and every
pull request: **Static checks** (build, then `tests/check-static.mjs` over the
output), **Service worker cache version** (`tests/check-cache-version.mjs`), and
**Browser tests** (the Playwright suite in `tests/`, driving real Chromium).
`.github/workflows/deploy.yml` is what publishes `_site/` to Pages. When making
changes:

- Do run `node build.mjs && node tests/check-static.mjs` before pushing. The
  build is where an unresolved import or a syntax error surfaces, and the static
  check is dependency-free and near-instant, so both are worth the local run.
- Don't re-run the full Playwright suite locally as a pre-push gate. Push and
  let the CI job be the source of truth; check the PR's status instead of
  reproducing the run here. Installing the test tooling, fetching Chromium and
  running the whole browser suite in-session on every iteration is slow and
  burns tokens for a signal CI already gives for free.
- A large or mechanical refactor of the app source is the exception worth
  making: the suite drives the real page, and it is the only thing that catches
  a module split that parses and builds but no longer behaves.
- `tests/a11y.spec.mjs` runs axe-core (WCAG 2.1 A and AA) in each state a player
  passes through, and asserts *zero* violations — there is no baseline file of
  known failures to hide behind. New markup and new colour tokens have to land
  clean. The same file also covers keyboard-only play, focus after a screen
  change, and the live region. If a rule genuinely has to come off, take it off
  by name in `RULES` with a comment saying why.
- If a CI job fails, pull the failure from the job logs (`get_job_logs`, or
  `gh run view --log-failed` where the CLI is available) rather than guessing,
  then fix and push again.

## Don't hand-write the service worker's cache version

`CACHE_VERSION` and `APP_SHELL` in `src/sw.js` are the placeholders
`__CACHE_VERSION__` and `__APP_SHELL__`. `build.mjs` fills them in: the version
from a SHA-256 of the built shell's bytes, the shell from what actually landed
in `_site`. Shipping a changed app shell under a stale cache version — the thing
that leaves an installed copy serving old files — is therefore not possible, and
there is no number to remember to bump.

This retired a standing rule to bump by hand and a 218-line autofix script that
rewrote open pull requests. The **Service worker cache version** CI job is still
there, but it no longer polices a human: `tests/check-cache-version.mjs` builds
a scratch copy of the source, perturbs the app shell, builds again, and checks
the version moved — proving the derivation is still wired up. It is a few
seconds that would ride on **Static checks** for free, and stays a separate job
only because the ruleset on `main` requires a check by that name; fold it in
once that list is edited. If you find yourself reaching for a version number,
the build already has it.

## Merging against a moving `main`

Other branches land on `main` while a PR sits open. Before assuming a CI
failure is caused by your own change, check whether `main` moved and merge it
in — GitHub tests the merge, not your branch alone, so a stale branch can fail
on upstream code your diff never touched.

## Voice for pull request descriptions

Write PR descriptions as a wise tortoise of the cottage-core persuasion:
unhurried, warm, fond of small domestic detail, taking the long view because
one has, after all, seen a great many summers. Metaphors from the garden, the
hearth, and the slow business of growing things are welcome.

The voice is a costume, not a licence to be vague. Every claim underneath it
has to be exactly as true and as specific as it would be in plain prose: what
changed, why, and what was actually verified. A tortoise does not embellish.

`.github/pull_request_template.md` carries the headings to fill in and the
pre-merge checklist — including updating the README when the change is one a
player would notice. Delete a heading rather than leaving it empty.

This applies to PR descriptions only. Commit messages, code comments, and
replies in the terminal stay plain.

## Merge your own PRs once CI is green

Don't stop to ask before merging a PR you opened for work that was requested.
Open it, enable auto-merge (squash), and let GitHub finish the job once every
required check passes.

- `main` carries a ruleset requiring the checks on the head commit before a
  merge is allowed, so a fresh PR shows `mergeable_state: blocked` instead of
  `clean` and `enable_pr_auto_merge` has something real to wait on. The browser
  suite is the slow check and the one that matters; a passing `Static checks`
  alone was never a result.
- A red or still-running job still isn't a merge — auto-merge just keeps
  waiting. If a check fails, fix it and push (or say what's blocking); the
  next green run is what auto-merge fires on, no need to re-enable it.
- `enable_pr_auto_merge` also needs the repo-level "Allow auto-merge" setting
  on (Settings → General → Pull Requests) — the ruleset alone isn't enough.
  If that's off, or auto-merge can't be enabled for any other reason, fall
  back to watching the run yourself and merging by hand once green.
- A merge is a release: pushing to `main` publishes to Pages. Nothing else
  guards that.
