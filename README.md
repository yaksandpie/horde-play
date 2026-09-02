# Horde Play

A personal web app that **is** the Horde in [Horde Magic](https://hordemagic.com/basic-horde-rules/).

Horde Magic is a co-op Magic variant: everyone brings a normal deck and fights an
automated "horde" deck that plays itself. The problem is physical — a horde
library is 300 cards, mostly tokens, and building one eats a collection. This app
holds the library instead. You bring paper EDH decks; a screen between you casts
the Horde's waves, stacks up its board, rolls random targets, and takes damage as
mill.

It's a single static page — no build step, no dependencies, no accounts. It
installs to a home screen and runs offline once a deck has been loaded.

## What it does

- **Casts waves.** Each turn the Horde casts off the top of its library until the
  wave ends. Wave size snakes `1, 2, 3, 2, 1, 2, 3…` (or stays at 1, your choice).
- **Two wave-end rules**, because the published decks disagree: a wave ends either
  on a **non-token card** (the Zombies horde) or on an **uncommon/rare/mythic**
  (Eldrazi, D&D, Angels & Demons). Set per game.
- **Tracks the board.** Token stacks collapse into one tile with a count, so 145
  Vampire tokens is one card, not 145. Tap any card — on the board, in a wave, or
  in the import review — to open it full size and actually read it; board cards
  carry kill-one / kill-all from there.
- **Damage → mill.** A numeric pad; the Horde has no life total. Legendaries milled
  by damage are called out so you can apply the ETB-and-phase-out rule.
- **Attacks.** Everything is goaded and attacking; `Defender` creatures are held
  back as blockers and excluded from the attacking total.
- **Shared life**, per the site's rules: 100 for one survivor, 15 less for each one
  after (2 players = 85). Poison tracked too.
- **Random targeting** for the Horde's instants and sorceries, with a re-roll.
- **Undo** on every action, and the game survives a reload or a screen lock.

## Decks

Nine horde libraries from hordemagic.com are built in:

| Deck | Cards | Tokens | Wave ends on |
|---|---|---|---|
| Zombies Horde | 300 | 200 | non-token |
| Vampire Horde | 300 | 150 | uncommon+ |
| Eldrazi Titans Horde | 301 | 150 | uncommon+ |
| Slivers Horde | 305 | 170 | uncommon+ |
| Angels & Demons — Clerics and Devils | 210 | 142 | uncommon+ |
| Angels & Demons — Demons | 96 | 11 | uncommon+ |
| D&D Dungeon — Lv1 Oozes | 100 | 38 | uncommon+ |
| D&D Dungeon — Lv2 Goblins & Skeletons | 202 | 59 | uncommon+ |
| D&D Dungeon — Lv3 Giants & Dragons | 200 | 70 | uncommon+ |

Counts match each decklist's own stated totals.

**Multi-library decks aren't automated.** The D&D dungeon is three levels played in
sequence and Angels & Demons runs two libraries simultaneously; each is listed as a
separate deck. Run them as separate games (or on two screens) and treat the set as
beaten only when every library is empty.

The Vampire deck doesn't state its own wave rule, so it defaults to the site's
general `uncommon+`. Change it on the setup screen if your group plays it the other
way — the setting is per game, not baked into the deck.

### Importing your own

Paste any decklist into **Import a decklist**. The parser handles the shapes these
lists actually come in:

- `3 Corpse Knight`, `4x Zombie`, `2 Grave Titan (M11) 96`
- section headings like `Creatures: (79)` and `Tokens (200)` — a "token" heading
  marks everything under it, and the heading also hints at card type
- `187 Token: Zombie`
- `1 Fire // Ice` and double-faced cards (front face is used for lookup)
- lines wrapped mid-name, which is what you get pasting from the site's PDFs:
  ```
  3 Gray Merchant of
  Asphodel
  ```
  joins back into `Gray Merchant of Asphodel`. Turn this off with the checkbox if
  your list genuinely has quantity-less lines.

The review screen then shows every card with its art and lets you fix the name or
flip its **Token / Card** flag before saving — that flag decides where waves stop,
so it's worth a glance.

## Card art

Art, rules text, rarity, and P/T come from [Scryfall](https://scryfall.com) the
first time a deck is used, then live in IndexedDB, so game night needs no
connection. If Scryfall can't be reached the app says so and plays with generated
text cards — readable, just not pretty. Attacking power then shows as `6+?` rather
than pretending to know stats it doesn't have.

## Hosting it on GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages** → Source: **Deploy from a branch**, branch `main`, folder `/(root)`. Save.
3. Wait a minute, then open `https://<your-username>.github.io/horde-play/`.
4. On the tablet you'll play on, use **Add to Home Screen**. It installs as a real
   offline-capable app.

## Files

- `index.html` — the whole app
- `manifest.json` — web app manifest
- `sw.js` — service worker (network-first on page loads, cache-first on assets)
- `icon-192.png`, `icon-512.png`, `icon-180.png` — app icons

## Not automated on purpose

The Horde is mindless about *what* to play, not about *how cards work*. Triggered
and activated abilities, "choose a creature", regeneration, phasing — those stay
yours to read and apply, which is why the current card is always shown large. The
app is scorekeeper and dealer, not a rules engine.

Horde Magic is unofficial fan content. Not approved or endorsed by Wizards of the Coast.
