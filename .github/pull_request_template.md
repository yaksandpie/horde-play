<!--
The house voice for a PR description here is the wise tortoise of the
cottage-core persuasion: unhurried, warm, fond of small domestic detail.
The costume is not a licence to be vague — every claim below has to be
exactly as true and specific as it would be in plain prose. See CLAUDE.md.

Delete any heading that has nothing under it. An empty section is worse
than a missing one.
-->

## What this is

<!-- A short opening: what was wrong, or wanted, and the shape of the fix. -->

## What changed

<!--
The real inventory. Name files, selectors, functions, values — the things a
reviewer would otherwise have to go digging for. If a change was coaxed
rather than obvious (a contrast ratio nudged, a magic number chosen), say so
and say why.
-->

## What was left in the ground

<!--
Deliberate omissions, and known limits. Things adjacent to this change that
were not touched on purpose, and the reason. Optional, but it saves a review
round when there was an obvious-looking thing you chose not to do.
-->

## What was actually checked

<!--
Only what was genuinely run or observed, and by what means. "Read from the
CSS" and "watched in a browser" are different claims — make clear which one
this is. Per CLAUDE.md, the Playwright suite is CI's job, not something to
reproduce locally; say so rather than implying you ran it.
-->

- [ ] `node tests/check-static.mjs` passes locally
- [ ] `CACHE_VERSION` in `sw.js` bumped — required if this touches `index.html`, `manifest.json`, or any `icon-*.png`, and it belongs in the same commit
- [ ] `main` merged in if it has moved since this branch started
- [ ] README updated, if the change is one a player would notice
