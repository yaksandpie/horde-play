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
