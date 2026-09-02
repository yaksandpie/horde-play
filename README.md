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
  Vampire tokens is one card, not 145 — and the two of them carrying a +1/+1
  counter are a tile of their own. Tap any card — on the board, in a wave, or
  in the import review — to open it full size and actually read it; board cards
  carry kill-one / kill-all from there. A token stack also carries **+1** and
  **Set how many…**, for a trigger that made one more or a count that drifted
  from what's on the table — a stack lowered that way loses the extras without a
  trip through the graveyard, because those tokens never died.
- **Counters.** A trigger that puts +1/+1 counters on two of six Squirrels splits
  those two onto their own tile: a stack is copies that are identical to each
  other, and counters break that. The tile shows what it carries and the P/T it
  adds up to, and the attacking total does the arithmetic — +1/+1 and −1/−1 move
  the stats, and a creature shrunk past zero deals no damage rather than healing
  anyone. Any other counter (stun, charge, whatever the card names) is tracked
  and shown, and left to the players to apply. Counters die with the creature,
  so nothing follows it to the graveyard.
- **Create tokens.** **+ Create tokens** on the board takes any token, not just the
  deck's own. Hare Apparent and Empty the Warrens make more of a type the library
  already defines — those are one tap. Skeletal Swarming's Skeletons, Rite of
  Belzenlok's Demons and Carrot Cake's Food are in no decklist, so search for them
  and they arrive from Scryfall with their real art; offline, or for a token with no
  printed version, type a plain one (name, creature or not, P/T). Either way it's a
  manual add that doesn't touch the library, graveyard, or wave count, and the type
  stays on the list for the rest of the game.
- **Damage → mill.** A numeric pad; the Horde has no life total. Legendaries milled
  by damage are called out so you can apply the ETB-and-phase-out rule, and they
  stay called out until the turn ends — two mills in one turn is ordinary, and the
  first legendary is still owed its trigger.
- **The graveyard, on tap.** The Graveyard counter opens it, collapsed into stacks
  the way the board is. Plenty of horde cards care what's in there — Grave
  Betrayal, Footbottom Feast, Unbreathing Horde — and it's the only part of the
  game state you otherwise can't look at.
- **Attacks.** Everything is goaded and attacking; `Defender` creatures are held
  back as blockers and excluded from the attacking total.
- **Shared life**, per the site's rules: 100 for one survivor, 15 less for each one
  after (2 players = 85). Poison tracked too.
- **Random targeting** for the Horde's instants and sorceries, with a re-roll. A
  wave can carry several spells, and each one shows its own victim.
- **Undo** on every action, and the game survives a reload or a screen lock.
- **The screen stays awake** while a game is up, so a tablet propped on the table
  doesn't dim between waves.
- **Keyboard shortcuts** for a laptop driving the game: `space` takes the turn,
  `u` undoes, `d` opens damage, `l` life, `g` the graveyard.
- **An end screen that says how it went** — rounds survived, cards left in the
  library, graveyard size, and the biggest the Horde's board ever got.
- **Watching from another seat.** One screen runs the game; anyone else can open
  the app on their phone, type the six-character code, and see the same board —
  card art, the wave, life, poison, the graveyard — with nothing on it to press.
  Off by default; see [Watching a game](#watching-a-game).
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

## Watching a game

The Horde runs on one screen, but everyone wants to read the cards. **Share this
game** in the header mints a six-character code; anyone else opens the app,
taps **Watch a game**, and types it. They get the real board — art and all —
updated as the host acts, and no controls at all. **Copy link** gives a URL that
opens the join box with the code already filled in. While a share is live the
header carries the code, so it's readable without opening anything — and its dot
goes amber if the relay stops answering.

A viewer needs a connection: card art is fetched from Scryfall on their own
device. The host needs one too, and while the host is offline the status says so
and viewers stop updating rather than drifting silently. Nothing is sent until
you press start, and stopping tells the viewers rather than leaving them on a
board that has quietly stopped moving. A reload mid-game keeps the code, so a
tablet that goes to sleep doesn't strand the table.

**Where the data goes.** The app is a static page with no backend, and there is
no serverless way to push state between devices — so this one feature borrows
one. Snapshots go through [ntfy.sh](https://ntfy.sh), a free public pub/sub
relay, over plain HTTP out and Server-Sent Events back. No account, no API key,
no library. The trade-off is real and worth stating plainly:

- The board of your game passes through a server neither you nor this project
  controls, under its uptime, its logging and its retention. ntfy caches recent
  messages so a late joiner can sync, so the last few snapshots outlive the
  moment you sent them.
- The code is the only thing protecting a game, and an ntfy topic is
  unauthenticated **in both directions**. Anyone holding the code can publish to
  it as well as read it — a viewer, or anyone you forwarded the link to, could
  push a fake board that other viewers would render as real. Viewer mode is
  read-only in the app; it is not read-only on the wire.
- Guessing a code you didn't hand out is impractical (six characters over a
  31-character alphabet, from a CSPRNG, is about 900 million), so the exposure
  is to people you gave it to — which is why the app tells you to treat it like
  a password rather than a room name.
- Nothing else is sent — no decklists, no identifiers, and no names beyond the
  survivor names you typed on the setup screen.

There's no clean fix for the write side. Signing snapshots would need a secret
the viewers also hold, and the code *is* that secret — so it would stop someone
guessing a topic, who already faces those 900 million, and not the people you
handed the code to. For a Magic board around one table that's the right place to
stop; it's documented rather than engineered around.

If that isn't a trade you want, don't press the button: everything else in the
app still works with no network at all. ntfy is also self-hostable, and the
relay is a single constant (`NTFY`) in `index.html` if you'd rather point it at
your own.

**What actually crosses the wire.** ntfy caps a message at 4 KB, so a snapshot
carries Scryfall ids and counts, not cards — the viewer resolves them through the
same Scryfall endpoint and image cache the deck import already uses. A typical
board is about 1.4 KB. When a long game won't fit, the snapshot sheds the log
first, then the graveyard breakdown (its *count* always survives), so the board
and the counters are the last things to go.

## Hosting it on GitHub Pages

Pushes to `main` deploy themselves — `.github/workflows/deploy.yml` publishes the
site. One-time setup:

1. Push this repo to GitHub.
2. **Settings → Pages** → Source: **GitHub Actions**. Save.
3. Push to `main`. The **Deploy to GitHub Pages** workflow runs, and the site
   lands at `https://<your-username>.github.io/horde-play/`.
4. On the tablet you'll play on, use **Add to Home Screen**. It installs as a real
   offline-capable app.

The workflow publishes the repo root minus `.github/` and `tests/`, so what
Pages serves is exactly the app.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- **Static checks** (`node tests/check-static.mjs`, no dependencies) — parses the
  inline script and `sw.js`, validates `manifest.json`, and proves every file the
  page and the service worker reference actually exists. There's no bundler here
  to catch a typo, so this does the job a build would.
- **Service worker cache version** — a pull request that touches `index.html`,
  `manifest.json` or an icon has to bump `CACHE_VERSION` in `sw.js`, or installed
  copies keep serving the old shell.
- **Browser tests** — Playwright drives real Chromium against the real page:
  `tests/rules.spec.mjs` unit-tests the game rules through the `window.__horde`
  harness the app already exposes, `tests/share.spec.mjs` covers the live-share
  wire format and proves a viewer has no controls, and `tests/app.spec.mjs` plays a game through
  the UI — setup, a wave, damage as mill, undo, reload-and-resume, the ban list,
  and an import.

Scryfall is stubbed out in every test, so the suite runs offline, deterministically,
and without hammering a free public API on each push. That also means CI exercises
the app's offline path, which is the one that matters on game night.

### Running them locally

The app has no dependencies; the tests do, and they keep them to themselves:

```sh
cd tests
npm install
npx playwright install chromium
npm run check   # static checks
npm test        # browser tests
```

`npm run serve` alone starts the same static server on
<http://127.0.0.1:4173> if you just want to poke at the app over a real
origin (service workers and IndexedDB don't work over `file://`).

## Files

- `index.html` — the whole app
- `manifest.json` — web app manifest
- `sw.js` — service worker (network-first on page loads, cache-first on assets)
- `icon-192.png`, `icon-512.png`, `icon-180.png` — app icons
- `tests/` — the checks CI runs, and the only place with dependencies
- `.github/workflows/` — CI and the Pages deploy

## Not automated on purpose

The Horde is mindless about *what* to play, not about *how cards work*. Triggered
and activated abilities, "choose a creature", regeneration, phasing — those stay
yours to read and apply, which is why the current card is always shown large. The
app is scorekeeper and dealer, not a rules engine.

Horde Magic is unofficial fan content. Not approved or endorsed by Wizards of the Coast.
