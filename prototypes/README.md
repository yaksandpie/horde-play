# Board placement prototypes

Two throwaway builds of the app, each exploring one way to make the Horde's
board easier to see during a turn. They exist because the obvious change —
swapping the arena and the board panel — looked worse than the problem on
closer reading: the arena holds the things you must act on (the wave chip, the
random target and its **Re-roll**, the milled-legendary note), and the board
grows without bound, so leading with it would make the action area drift down
the page a little further every turn.

These are copies under their own filenames, not edits to `index.html`. Nothing
here ships, and no `CACHE_VERSION` bump is owed for them.

## The two

**A — `a-combat-trim.html`.** Combat used to redraw every attacker in the stage
at 160px tiles, restating the board panel above it at a larger size and pushing
the panel itself further down exactly when it was being read. Now the stage
names the attackers as chips and offers **Review the board ↓**; the panel below
is the one place creatures are drawn.

**B — `b-board-strip.html`.** The board in miniature — a horizontally scrolling
row of 76px stacks — stuck under the header so it stays on screen through every
phase. The full panel stays where it is. Tapping a stack in the strip opens the
same sheet the panel does, so it is a second way in rather than a second set of
controls.

Each build carries a ribbon naming it and linking to the other, so a screenshot
can't be mistaken for the real app.

## Rebuilding

`index.html` moves fast, so these are generated rather than hand-forked:

```
node prototypes/build.mjs
```

Every patch in `build.mjs` asserts that its anchor exists and is unique, so a
rename in `index.html` fails the build loudly instead of quietly producing a
copy with the change missing.

## What was checked

`node prototypes/build.mjs` parses both copies' inline scripts the way
`tests/check-static.mjs` parses `index.html`'s — the static job only reads
`index.html`, so these check themselves. Beyond that both were driven in
Chromium from a new game through to the Horde's combat step: no page errors, the
board panel renders, A shows its roster chips and no longer emits the `cardgrid
lg` attacker grid, and B's strip holds exactly as many stacks as the panel.
Those runs were scratch tests and aren't checked in — nothing in CI covers this
directory.
