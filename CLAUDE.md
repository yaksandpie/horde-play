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
