/* Live share: the wire format, and the fact that a viewer can't touch anything.
 *
 * The relay and Scryfall are both off-limits here — fixtures.mjs cuts every
 * request that leaves the origin — so these cover the two halves that don't
 * need a network: the snapshot a host would send, and the game screen a viewer
 * is left holding. */
import { test, expect, startGame } from "./fixtures.mjs";

/* Play far enough to have a board, a graveyard and a log to encode. */
async function playATurn(app) {
  await app.locator("#btn-action").click();   // cast the wave
  await expect.poll(() => app.evaluate(() => window.__horde.G.phase)).toBe("reveal");
  await app.locator("#btn-action").click();   // resolve it
  await expect.poll(() => app.evaluate(() => window.__horde.G.phase)).toBe("combat");
}

test.describe("room codes", () => {
  test("are the advertised length and skip the lookalike glyphs", async ({ app }) => {
    const { codes, alphabet, len } = await app.evaluate(() => ({
      codes: Array.from({ length: 200 }, () => window.__horde.makeCode()),
      alphabet: window.__horde.CODE_ALPHABET,
      len: window.__horde.CODE_LEN,
    }));

    // 0/O and 1/I/L are exactly the pairs that get misheard across a table.
    for (const c of "01OIL") expect(alphabet).not.toContain(c);
    for (const code of codes) {
      expect(code).toHaveLength(len);
      expect([...code].every((ch) => alphabet.includes(ch))).toBe(true);
    }
    // A code that repeats would put two tables on one topic.
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a topic is derived from the code alone", async ({ app }) => {
    const topics = await app.evaluate(() =>
      [window.__horde.topicFor("K7P2QM"), window.__horde.topicFor("k7p2qm")]);
    expect(topics[0]).toBe("hordeplay-k7p2qm");
    expect(topics[1]).toBe(topics[0]);
  });
});

test.describe("the wire format", () => {
  test("a snapshot round-trips to the same board, counters and graveyard", async ({ app }) => {
    await startGame(app, "Zombies Horde");
    await playATurn(app);

    const { before, after } = await app.evaluate(() => {
      const { encodeSnapshot, decodeSnapshot, G } = window.__horde;
      const snap = encodeSnapshot(G);

      /* The viewer keys cards by their wire ref, not by the host's local card
         key, so rebuild the dictionary the way viewerResolve would. Offline
         here, so every card is unresolved and travels inline. */
      const cards = {};
      for (const c of snap.ic) cards[c[0]] = window.__horde.cardFromInline(c);
      const V = decodeSnapshot(snap, cards);

      /* Keys differ by design on either side of the wire; names don't. */
      const shape = (g) => {
        const yard = new Map();
        for (const key of g.graveyard) {
          const name = g.cards[key].name;
          yard.set(name, (yard.get(name) || 0) + 1);
        }
        return {
          turn: g.turn,
          hordeTurn: g.hordeTurn,
          phase: g.phase,
          life: g.life,
          poison: g.poison,
          library: g.library.length,
          players: g.players.map((p) => p.name),
          board: g.board.map((s) => [g.cards[s.cardKey].name, s.count]).sort(),
          revealed: g.revealed.map((k) => g.cards[k].name),
          graveyard: [...yard].sort(),
        };
      };
      return { before: shape(G), after: shape(V) };
    });

    expect(after.turn).toBe(before.turn);
    expect(after.hordeTurn).toBe(before.hordeTurn);
    expect(after.phase).toBe(before.phase);
    expect(after.life).toBe(before.life);
    expect(after.library).toBe(before.library);
    expect(after.players).toEqual(before.players);
    expect(after.board).toEqual(before.board);
    expect(after.revealed).toEqual(before.revealed);
    expect(after.graveyard).toEqual(before.graveyard);
    // A wave that resolved put something somewhere.
    expect(before.board.length + before.graveyard.length).toBeGreaterThan(0);
  });

  test("spell targets survive, because they are indexed by position in the wave", async ({ app }) => {
    await startGame(app, "Zombies Horde");

    const out = await app.evaluate(() => {
      const { encodeSnapshot, decodeSnapshot, cardFromInline, G } = window.__horde;
      G.revealed = Object.keys(G.cards).slice(0, 4);
      G.spellTargets = { 0: G.players[0].id, 2: G.players[1].id };

      const snap = encodeSnapshot(G);
      const cards = {};
      for (const c of snap.ic) cards[c[0]] = cardFromInline(c);
      const V = decodeSnapshot(snap, cards);

      /* spellTargets is keyed by position in the wave, so the wave must arrive
         the same length and in the same order or every spell retargets. */
      const named = (g, i) => g.cards[g.revealed[i]].name;
      return {
        hostWave: G.revealed.map((_, i) => named(G, i)),
        viewerWave: V.revealed.map((_, i) => named(V, i)),
        hostTargets: G.spellTargets,
        viewerTargets: V.spellTargets,
      };
    });

    expect(out.viewerWave).toEqual(out.hostWave);
    expect(out.viewerTargets).toEqual(out.hostTargets);
  });

  test("an oversized board sheds the log, then the graveyard breakdown, keeping the count",
    async ({ app }) => {
      const out = await app.evaluate(() => {
        const { encodeSnapshot, G, SHARE_MAX } = window.__horde;
        const keys = Object.keys(G.cards);

        // A long game: a full log and a graveyard holding most of the deck.
        G.log = Array.from({ length: 400 }, (_, i) => ({
          t: i, msg: "The Horde cast something with a fairly long name " + i,
        }));
        G.graveyard = [];
        for (const key of keys) {
          for (let i = 0; i < 3; i++) G.graveyard.push(key);
        }

        const snap = encodeSnapshot(G);
        return snap && {
          fits: new TextEncoder().encode(JSON.stringify(snap)).length <= SHARE_MAX,
          log: snap.lg.length,
          breakdown: snap.gy.length,
          count: snap.gn,
          realCount: G.graveyard.length,
        };
      });

      expect(out).toBeTruthy();
      expect(out.fits).toBe(true);
      expect(out.log).toBe(0);
      expect(out.breakdown).toBe(0);
      // The tally still reads true even though the cards behind it didn't fit.
      expect(out.count).toBe(out.realCount);
    });

  test("a card with no Scryfall id travels inline, so an offline import is still watchable",
    async ({ app }) => {
      const out = await app.evaluate(() => {
        const { encodeSnapshot, decodeSnapshot, cardFromEntry, G } = window.__horde;
        const card = Object.assign(cardFromEntry({ name: "Homebrew Horror", tokenHint: true }),
          { key: "c_local", oracleText: "It does something.", power: "4", toughness: "4" });
        G.cards[card.key] = card;
        G.board = [{ cardKey: card.key, count: 3 }];

        const snap = encodeSnapshot(G);
        const cards = {};
        for (const c of snap.ic) cards[c[0]] = window.__horde.cardFromInline(c);
        const V = decodeSnapshot(snap, cards);
        const seen = V.cards[V.board[0].cardKey];
        return {
          inlineCount: snap.ic.length,
          name: seen.name,
          count: V.board[0].count,
          oracle: seen.oracleText,
          isToken: seen.isToken,
          pt: [seen.power, seen.toughness],
        };
      });

      // Only the one card in play rides along — not the rest of the library.
      expect(out.inlineCount).toBe(1);
      expect(out.name).toBe("Homebrew Horror");
      expect(out.count).toBe(3);
      expect(out.oracle).toBe("It does something.");
      expect(out.isToken).toBe(true);
      expect(out.pt).toEqual(["4", "4"]);
    });
});

test.describe("viewer mode", () => {
  test("the join box refuses anything that isn't a code", async ({ app }) => {
    await app.locator("#btn-watch").click();
    await expect(app.locator("#join-dialog")).toBeVisible();

    await app.locator("#join-code").fill("NOPE");
    await app.locator("#join-go").click();
    await expect(app.locator("#join-error")).toBeVisible();
    await expect(app.locator("#join-dialog")).toBeVisible();

    // O and L aren't in the alphabet, so a six-character code full of them
    // is still not a code.
    await app.locator("#join-code").fill("OOLLOO");
    await app.locator("#join-go").click();
    await expect(app.locator("#join-error")).toBeVisible();
  });

  test("a viewer gets the board and none of the controls", async ({ app }) => {
    // Have a game of your own in progress first: watching must not disturb it.
    await startGame(app, "Zombies Horde");
    const mine = await app.evaluate(() => localStorage.getItem("horde.game"));
    await app.locator("#btn-home").click();

    await app.locator("#btn-watch").click();
    await app.locator("#join-code").fill("k7p2qm");   // lower case is fine
    await app.locator("#join-go").click();

    await expect(app.locator("#screen-game")).toBeVisible();
    await expect(app.locator("#viewer-bar")).toBeVisible();
    await expect(app.locator("#viewer-code")).toHaveText("K7P2QM");

    // Nothing here can change a game that belongs to another screen.
    await expect(app.locator("#screen-game .sticky-action")).toBeHidden();
    await expect(app.locator("#btn-add-tokens")).toBeHidden();
    await expect(app.locator("#share-row")).toBeHidden();
    await expect(app.locator("#tile-damage")).toBeDisabled();
    await expect(app.locator("#tile-life")).toBeDisabled();
    await expect(app.locator("#btn-home")).toBeHidden();

    // The relay is unreachable in these tests, so it says so rather than
    // sitting on an empty board pretending to be live.
    await expect(app.locator("#stage-body")).toContainText("Waiting for the game");

    // Watching must never overwrite the watcher's own saved game.
    expect(await app.evaluate(() => localStorage.getItem("horde.game"))).toBe(mine);
  });

  test("leaving puts the controls back and drops the watched game", async ({ app }) => {
    await app.locator("#btn-watch").click();
    await app.locator("#join-code").fill("K7P2QM");
    await app.locator("#join-go").click();
    await expect(app.locator("#viewer-bar")).toBeVisible();

    await app.locator("#btn-viewer-leave").click();
    await expect(app.locator("#screen-decks")).toBeVisible();
    await expect(app.locator("#viewer-bar")).toBeHidden();
    expect(await app.evaluate(() => window.__horde.G)).toBeNull();
  });

  test("a shared link opens the join box with the code filled in", async ({ page }) => {
    await page.goto("/index.html#watch=K7P2QM");
    await expect(page.locator("#join-dialog")).toBeVisible();
    await expect(page.locator("#join-code")).toHaveValue("K7P2QM");
    // The code shouldn't stay in the URL bar to be re-triggered on reload.
    expect(new URL(page.url()).hash).toBe("");
  });
});

test.describe("sharing a game", () => {
  test("nothing is sent until the host says so", async ({ app }) => {
    await startGame(app, "Zombies Horde");

    await expect(app.locator("#share-row")).toBeVisible();
    await expect(app.locator("#btn-share")).toHaveText("Share this game");
    // No code exists yet, so nothing could have been published.
    expect(await app.evaluate(() => localStorage.getItem("horde.share"))).toBeNull();
  });

  test("starting a share mints a code and remembers it across a reload", async ({ app }) => {
    await startGame(app, "Zombies Horde");
    await app.locator("#btn-share").click();
    await expect(app.locator("#share-dialog")).toBeVisible();
    await app.locator("#sh-toggle").click();

    const code = await app.locator("#share-code").textContent();
    expect(code).toHaveLength(6);
    await expect(app.locator("#sh-toggle")).toHaveText("Stop sharing");
    await expect(app.locator("#btn-share")).toContainText(code);

    const saved = await app.evaluate(() => JSON.parse(localStorage.getItem("horde.share")));
    expect(saved).toEqual({ code, on: true });

    // A tablet that reloads mid-game keeps the code, so viewers aren't stranded.
    await app.reload();
    await app.locator("#btn-resume").click();
    await expect(app.locator("#screen-game")).toBeVisible();
    await expect(app.locator("#btn-share")).toContainText(code);
  });

  test("stopping puts the host back to private", async ({ app }) => {
    await startGame(app, "Zombies Horde");
    await app.locator("#btn-share").click();
    await app.locator("#sh-toggle").click();
    await app.locator("#sh-toggle").click();

    await expect(app.locator("#sh-toggle")).toHaveText("Start sharing");
    await expect(app.locator("#btn-share")).toHaveText("Share this game");
    expect(await app.evaluate(() =>
      JSON.parse(localStorage.getItem("horde.share")).on)).toBe(false);
  });
});
