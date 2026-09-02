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
  wave ends. Tokens are shuffled in with everything else and ride along inside a
  wave, so a one-wave turn can still put a dozen creatures on the board.
- **Rulesets, not switches.** The wave rules come from two different rule
  documents, so you pick a ruleset and the app prints every value it fixes
  (see below).
- **Tracks the board.** Token stacks collapse into one tile with a count, so 145
  Vampire tokens is one card, not 145. Tap any card — on the board, in a wave, or
  in the import review — to open it full size and actually read it; board cards
  carry kill-one / kill-all from there.
- **Create tokens.** **+ Create tokens** on the board takes any token, not just the
  deck's own. Hare Apparent and Empty the Warrens make more of a type the library
  already defines — those are one tap. Skeletal Swarming's Skeletons, Rite of
  Belzenlok's Demons and Carrot Cake's Food are in no decklist, so search for them
  and they arrive from Scryfall with their real art; offline, or for a token with no
  printed version, type a plain one (name, creature or not, P/T). Either way it's a
  manual add that doesn't touch the library, graveyard, or wave count, and the type
  stays on the list for the rest of the game.
- **Damage → mill.** A numeric pad; the Horde has no life total. Legendaries milled
  by damage are called out so you can apply the ETB-and-phase-out rule.
- **Attacks.** Everything is goaded and attacking; `Defender` creatures are held
  back as blockers and excluded from the attacking total.
- **Shared life**, per the site's rules: 100 for one survivor, 15 less for each one
  after (2 players = 85). Poison tracked too.
- **Random targeting** for the Horde's instants and sorceries, with a re-roll.
- **Undo** on every action, and the game survives a reload or a screen lock.
- **The ban list**, offline and searchable — type a card name to find out whether
  it's legal in a survivor's deck.

## Decks

Nine horde libraries transcribed from hordemagic.com are built in, plus five
Bloomburrow tribal hordes built for this app:

| Deck | Cards | Tokens | Opens on |
|---|---|---|---|
| Zombies Horde | 300 | 200 | Original Horde |
| Vampire Horde | 300 | 150 | Horde Magic |
| Eldrazi Titans Horde | 301 | 150 | Horde Magic |
| Slivers Horde | 305 | 170 | Horde Magic |
| Angels & Demons — Clerics and Devils | 210 | 142 | Horde Magic |
| Angels & Demons — Demons | 96 | 11 | Horde Magic |
| D&D Dungeon — Lv1 Oozes | 100 | 38 | Horde Magic |
| D&D Dungeon — Lv2 Goblins & Skeletons | 202 | 59 | Horde Magic |
| D&D Dungeon — Lv3 Giants & Dragons | 200 | 70 | Horde Magic |
| Bloomburrow — Rabbit Warren | 300 | 185 | Horde Magic |
| Bloomburrow — Bat Coven | 300 | 178 | Horde Magic |
| Bloomburrow — Squirrel Hoard | 300 | 172 | Horde Magic |
| Bloomburrow — Raccoon Ruckus | 300 | 178 | Horde Magic |
| Bloomburrow — Druid Circle | 300 | 174 | Horde Magic |

Counts match each decklist's own stated totals. The five Bloomburrow hordes aren't
published lists — they're built here out of real cards, each 300 with a spine of
tribal creatures, a handful of anthems and wraths, and a boss or two:

- **Rabbit Warren** — a white Rabbit swarm that keeps making more Rabbits.
- **Bat Coven** — a Bat air force, so most of the board flies.
- **Squirrel Hoard** — Bloomburrow's Golgari Squirrels backed by the older
  Squirrel cards (Chatterfang, Squirrel Mob, Nut Collector, Deep Forest Hermit).
- **Raccoon Ruckus** — Gruul Raccoons plus Beast tokens, leaning on mass pump
  (Trumpet Blast, Overrun) rather than card quality.
- **Druid Circle** — Druid kindred from across Magic, swarming with Elf Druid
  tokens; the only horde here that reaches for infect (Triumph of the Hordes),
  so watch the poison counter.

Only Rabbit Warren and Bat Coven are all-Bloomburrow. The other three pull cards
from wherever the tribe exists — Odyssey Squirrels, Modern Horizons, Commander
sets — because Bloomburrow alone doesn't have enough Squirrels, Raccoons, or
Druids to fill 300 cards.

## Ban list

**Ban list** on the decks screen carries the 36 cards banned at
[hordemagic.com](https://hordemagic.com/ban-list/), the two banned combos, and the
rules of thumb behind them. They bind the *survivors'* EDH decks, not the Horde's
library, so nothing is enforced — type a name into the box and it tells you
whether that card is out. It works offline like the rest of the app.

**Multi-library decks aren't automated.** The D&D dungeon is three levels played in
sequence and Angels & Demons runs two libraries simultaneously; each is listed as a
separate deck. Run them as separate games (or on two screens) and treat the set as
beaten only when every library is empty.

The Vampire deck doesn't state its own wave rule, so it opens on the site's
general one. A deck only picks the *opening* ruleset; the choice is per game, made
on the setup screen, and isn't baked into the deck.

## Rulesets

The two wave-end rules in circulation aren't a preference — they come from two
different rule documents, and mixing their pieces produces a game neither one
describes. So the setup screen asks for a ruleset, then prints every value it
fixes: wave-end rule, waves per turn, setup turns, shared life, poison limit, and
the milled-legendary rule.

| Ruleset | A wave ends on | Waves per turn |
|---|---|---|
| **Horde Magic** — the rules published at [hordemagic.com](https://hordemagic.com/basic-horde-rules/) | an uncommon, rare or mythic | 1 |
| **Horde Magic — escalating waves** — the same rules, plus their optional wave count | an uncommon, rare or mythic | 1, 2, 3, 2, 1… |
| **Original Horde** — the 2011 rule the Zombies-style lists are built for | a non-token card | 1 |
| **House rules** — every control unlocked | your call | your call |

All three published rulesets use the site's table rules: three survivor setup
turns, 100 shared life less 15 per extra survivor, a poison limit of 10, and a
legendary milled by damage entering and then phasing out. Only **House rules**
hands those back as editable fields. The ruleset in play is printed under the
tally for the whole game.

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
flip its **Token / Card** flag before saving. That flag decides where waves stop
under **Original Horde**, and it's the fallback whenever rarity is unknown (an
offline import), so it's worth a glance.

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
