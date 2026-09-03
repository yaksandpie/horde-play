# Working in this repo

## Lean on CI, don't reproduce it locally

This repo has GitHub Actions CI (`.github/workflows/ci.yml`) covering static
checks and a full Playwright suite. When making changes:

- Do run `node tests/check-static.mjs` before pushing — it's dependency-free
  and near-instant, so it's worth the local check.
- Don't re-run the full Playwright suite locally as a pre-push gate. Push and
  let the CI job be the source of truth; check the PR's status instead of
  reproducing the run here. Installing Playwright, launching Chromium, and
  running 29 browser tests in-session on every iteration is slow and burns
  tokens for a signal CI already gives for free.
- If a CI job fails, pull the failure from the job logs (`get_job_logs` /
  `gh run view --log-failed`) rather than guessing, then fix and push again.

## Merging against a moving `main`

Other branches land on `main` while a PR sits open. Before assuming a CI
failure is caused by your own change, check whether `main` moved and merge it
in — a stale branch tested against the latest `main` (GitHub tests the merge,
not your branch alone) can fail for reasons that have nothing to do with your
diff, e.g. hardcoded counts in tests going stale after a new deck was added
upstream.

## Voice for pull request descriptions

Write PR descriptions as a wise tortoise of the cottage-core persuasion:
unhurried, warm, fond of small domestic detail, taking the long view because
one has, after all, seen a great many summers. Metaphors from the garden, the
hearth, and the slow business of growing things are welcome.

The voice is a costume, not a licence to be vague. Every claim underneath it
has to be exactly as true and as specific as it would be in plain prose: what
changed, why, and what was actually verified. A tortoise does not embellish.

This applies to PR descriptions only. Commit messages, code comments, and
replies in the terminal stay plain.

## Merge your own PRs once CI is green

Don't stop to ask before merging a PR you opened for work that was requested.
Open it, enable auto-merge (squash), and let GitHub finish the job once every
required check passes.

- `main` carries a ruleset requiring `Static checks`, `Service worker cache
  version`, and `Browser tests` on the head commit before a merge is allowed —
  a fresh PR now shows `mergeable_state: blocked` instead of `clean`, so
  `enable_pr_auto_merge` has something real to wait on. The browser suite is
  the slow check and the one that matters; a passing `Static checks` alone
  was never a result.
- A red or still-running job still isn't a merge — auto-merge just keeps
  waiting. If a check fails, fix it and push (or say what's blocking); the
  next green run is what auto-merge fires on, no need to re-enable it.
- `enable_pr_auto_merge` also needs the repo-level "Allow auto-merge" setting
  on (Settings → General → Pull Requests) — the ruleset alone isn't enough.
  If that's off, or auto-merge can't be enabled for any other reason, fall
  back to watching the run yourself and merging by hand once green.
- A merge is a release: pushing to `main` publishes to Pages. Nothing else
  guards that.
