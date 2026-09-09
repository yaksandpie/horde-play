/* The game rules, exercised through the window.__horde harness the app
   already exposes. These are unit tests that happen to run in a browser,
   because that's where the code lives. */
import { test, expect, startGame } from "./fixtures.mjs";

const horde = (page, fn, arg) => page.evaluate(fn, arg);

test.describe("decklist parsing", () => {
  test("reads the quantity shapes these lists actually come in", async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "3 Corpse Knight\n4x Zombie\n2 Grave Titan (M11) 96\n1 Zombie Apocalypse *F*"
    ).entries.map((e) => [e.qty, e.name]));

    expect(entries).toEqual([
      [3, "Corpse Knight"],
      [4, "Zombie"],
      [2, "Grave Titan"],
      [1, "Zombie Apocalypse"],
    ]);
  });

  test('an "x3 Card" line is a quantity, not a wrapped continuation', async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "4 Zombie\nx3 Ghoul\n2 Skeleton"
    ).entries.map((e) => [e.qty, e.name]));
    expect(entries).toEqual([[4, "Zombie"], [3, "Ghoul"], [2, "Skeleton"]]);
  });

  test("a token heading marks everything under it", async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "Creatures: (2)\n1 Death Baron\nTokens (200)\n187 Zombie\n13 Zombie Giant"
    ).entries.map((e) => [e.name, e.tokenHint]));

    expect(entries).toEqual([
      ["Death Baron", false],
      ["Zombie", true],
      ["Zombie Giant", true],
    ]);
  });

  test('"Token: Zombie" is a token whatever section it lands in', async ({ app }) => {
    const [entry] = await horde(app, () => window.__horde.parseDecklist(
      "Creatures: (1)\n187 Token: Zombie"
    ).entries);
    expect(entry).toMatchObject({ qty: 187, name: "Zombie", tokenHint: true });
  });

  test("joins names wrapped mid-line by a PDF paste", async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "3 Gray Merchant of\nAsphodel\n2 Undead Servant"
    ).entries.map((e) => e.name));
    expect(entries).toEqual(["Gray Merchant of Asphodel", "Undead Servant"]);
  });

  test("the join can be turned off for lists with quantity-less lines", async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "3 Gray Merchant of\nAsphodel",
      { joinWrapped: false }
    ).entries.map((e) => e.name));
    expect(entries).toEqual(["Gray Merchant of", "Asphodel"]);
  });

  test("split cards and DFCs look up by their front face", async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "1 Fire // Ice\n1 Edgar, Charmed Groom // Edgar Markov's Coffin"
    ).entries.map((e) => e.name));
    expect(entries).toEqual(["Fire", "Edgar, Charmed Groom"]);
  });

  test("merges duplicate lines into one row", async ({ app }) => {
    const entries = await horde(app, () => window.__horde.parseDecklist(
      "3 Undead Servant\n15 Undead Servant"
    ).entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].qty).toBe(18);
  });

  test("clamps an implausible quantity and says so", async ({ app }) => {
    const { entries, warnings } = await horde(app, () => window.__horde.parseDecklist("5000 Zombie"));
    expect(entries[0].qty).toBe(999);
    expect(warnings.join(" ")).toContain("Clamped");
  });
});

test.describe("wave rules", () => {
  test("a fixed pattern is always one wave", async ({ app }) => {
    const sizes = await horde(app, () =>
      [1, 2, 3, 4, 5, 6].map((t) => window.__horde.waveSizeFor(t, "fixed")));
    expect(sizes).toEqual([1, 1, 1, 1, 1, 1]);
  });

  test("the escalating pattern snakes 1, 2, 3, 2 and repeats", async ({ app }) => {
    const sizes = await horde(app, () =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => window.__horde.waveSizeFor(t, "snake")));
    expect(sizes).toEqual([1, 2, 3, 2, 1, 2, 3, 2, 1]);
  });

  test("the rarity rule ends a wave on uncommon or better", async ({ app }) => {
    const ends = await horde(app, () => {
      const w = (rarity) => window.__horde.isWaveEnder({ rarity, isToken: false }, "rarity");
      return { common: w("common"), uncommon: w("uncommon"), rare: w("rare"), mythic: w("mythic") };
    });
    expect(ends).toEqual({ common: false, uncommon: true, rare: true, mythic: true });
  });

  test("with rarity unknown, the token flag is the fallback", async ({ app }) => {
    const ends = await horde(app, () => ({
      token: window.__horde.isWaveEnder({ isToken: true }, "rarity"),
      card: window.__horde.isWaveEnder({ isToken: false }, "rarity"),
    }));
    expect(ends).toEqual({ token: false, card: true });
  });

  test("the original rule ends a wave on any non-token, however common", async ({ app }) => {
    const ends = await horde(app, () => ({
      token: window.__horde.isWaveEnder({ rarity: "mythic", isToken: true }, "nontoken"),
      card: window.__horde.isWaveEnder({ rarity: "common", isToken: false }, "nontoken"),
    }));
    expect(ends).toEqual({ token: false, card: true });
  });
});

test.describe("table rules", () => {
  test("shared life is 100, less 15 per extra survivor", async ({ app }) => {
    const life = await horde(app, () =>
      [1, 2, 3, 4, 5].map(window.__horde.sharedLifeFor));
    expect(life).toEqual([100, 85, 70, 55, 40]);
  });

  test("shared life never drops to zero, however big the table", async ({ app }) => {
    expect(await horde(app, () => window.__horde.sharedLifeFor(20))).toBe(1);
  });

  test("a deck opens on the ruleset its list was built for", async ({ app }) => {
    const picks = await horde(app, () => ({
      zombies: window.__horde.defaultRulesetFor({ waveEnd: "nontoken" }),
      vampires: window.__horde.defaultRulesetFor({ waveEnd: "rarity" }),
    }));
    expect(picks).toEqual({ zombies: "original", vampires: "hordemagic" });
  });

  test("every published ruleset uses the site's table rules", async ({ app }) => {
    const rules = await horde(app, () => window.__horde.RULESETS
      .filter((r) => !r.custom)
      .map((r) => ({ id: r.id, setupTurns: r.setupTurns, poisonLimit: r.poisonLimit, legendaryRule: r.legendaryRule })));

    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r).toMatchObject({ setupTurns: 3, poisonLimit: 10, legendaryRule: true });
    }
  });
});

test.describe("bundled decks", () => {
  test("every deck's card count matches the total its list states", async ({ app }) => {
    const totals = await horde(app, () => Object.fromEntries(
      window.__horde.BUNDLED_DECKS.map((d) => [d.name, d.entries.reduce((n, e) => n + e.q, 0)])
    ));

    expect(totals).toEqual({
      "Zombies Horde": 300,
      "Vampire Horde": 300,
      "Eldrazi Titans Horde": 301,
      "Slivers Horde": 305,
      "Angels & Demons — Clerics and Devils": 210,
      "Angels & Demons — Demons": 96,
      "D&D Dungeon — Lv1 Oozes": 100,
      "D&D Dungeon — Lv2 Goblins & Skeletons": 202,
      "D&D Dungeon — Lv3 Giants & Dragons": 200,
      "Bloomburrow — Rabbit Warren": 300,
      "Bloomburrow — Bat Coven": 300,
      "Bloomburrow — Squirrel Hoard": 300,
      "Bloomburrow — Raccoon Ruckus": 300,
      "Bloomburrow — Druid Circle": 300,
      "Bloomburrow — Mouse Brigade": 300,
      "Bloomburrow — Frog Pond": 300,
    });
  });

  test("every deck hydrates into a playable library with a unique id", async ({ app }) => {
    const decks = await horde(app, () => window.__horde.BUNDLED_DECKS.map((b) => {
      const d = window.__horde.hydrateBundled(b);
      return {
        id: d.id,
        cards: d.entries.reduce((n, e) => n + e.qty, 0),
        keyed: d.entries.every((e) => !!e.card.key && !!e.card.name),
      };
    }));

    expect(new Set(decks.map((d) => d.id)).size).toBe(decks.length);
    for (const d of decks) {
      expect(d.keyed).toBe(true);
      expect(d.cards).toBeGreaterThan(90);
    }
  });
});

test.describe("counters", () => {
  /* A game with one tile of six 1/1 Squirrels and nothing else going on, so
     the counter arithmetic can be read without a wave in the way. */
  const squirrels = (page, count = 6) => page.evaluate((n) => {
    const h = window.__horde;
    const deck = {
      id: "test", name: "Test",
      entries: [{ qty: 1, card: { key: "filler", name: "Filler", typeLine: "Creature — Zombie" } }],
    };
    h.G = h.newGame(deck, {
      players: ["A"], life: 100, poisonLimit: 10, ruleset: "hordemagic",
      waveEnd: "rarity", wavePattern: "fixed", legendaryRule: true, setupTurns: 0,
    });
    h.G.cards.squirrel = {
      key: "squirrel", name: "Squirrel", isToken: true, resolved: true,
      typeLine: "Token Creature — Squirrel", power: "1", toughness: "1",
    };
    h.G.board = [{ cardKey: "squirrel", count: n }];
    return h.stackId(h.G.board[0]);
  }, count);

  const board = (page) => page.evaluate(() =>
    window.__horde.G.board.map((s) => [s.cardKey, s.count, s.counters || null]));

  test("putting counters on some of a stack splits the rest off", async ({ app }) => {
    const id = await squirrels(app);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { "+1/+1": 1 }), id);

    expect(await board(app)).toEqual([
      ["squirrel", 4, null],
      ["squirrel", 2, { "+1/+1": 1 }],
    ]);
  });

  test("the attacking total counts the +1/+1 counters", async ({ app }) => {
    const id = await squirrels(app);
    expect(await horde(app, () => window.__horde.attackingPower())).toBe(6);

    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { "+1/+1": 1 }), id);
    // Four 1/1s and two 2/2s.
    expect(await horde(app, () => window.__horde.attackingPower())).toBe(8);
  });

  test("a creature shrunk past zero deals no damage rather than healing anyone", async ({ app }) => {
    const id = await squirrels(app);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { "-1/-1": 3 }), id);

    expect(await horde(app, () => window.__horde.attackingPower())).toBe(4);
  });

  test("counters the app doesn't understand are tracked, not applied", async ({ app }) => {
    const id = await squirrels(app);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { stun: 1 }), id);

    expect(await horde(app, () => window.__horde.attackingPower())).toBe(6);
    expect(await board(app)).toEqual([
      ["squirrel", 4, null],
      ["squirrel", 2, { stun: 1 }],
    ]);
  });

  test("the same counters merge back into one tile", async ({ app }) => {
    const plain = await squirrels(app);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { "+1/+1": 1 }), plain);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { "+1/+1": 1 }), plain);

    expect(await board(app)).toEqual([
      ["squirrel", 2, null],
      ["squirrel", 4, { "+1/+1": 1 }],
    ]);
  });

  test("taking the last counter off puts them back with the others", async ({ app }) => {
    const plain = await squirrels(app);
    const countered = await app.evaluate((id) =>
      window.__horde.stackId(window.__horde.setStackCounters(id, 2, { "+1/+1": 1 })), plain);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, {}), countered);

    expect(await board(app)).toEqual([["squirrel", 6, null]]);
  });

  test("a creature's counters die with it", async ({ app }) => {
    const plain = await squirrels(app);
    const countered = await app.evaluate((id) =>
      window.__horde.stackId(window.__horde.setStackCounters(id, 2, { "+1/+1": 1 })), plain);
    await app.evaluate((id) => window.__horde.killFromStack(id, 2), countered);

    expect(await board(app)).toEqual([["squirrel", 4, null]]);
    // The graveyard holds Squirrels, not Squirrels-with-a-counter.
    expect(await horde(app, () => window.__horde.yardStacks()))
      .toEqual([{ cardKey: "squirrel", count: 2 }]);
  });

  test("a fresh token joins the tile with no counters on it", async ({ app }) => {
    const plain = await squirrels(app);
    await app.evaluate((id) => window.__horde.setStackCounters(id, 2, { "+1/+1": 1 }), plain);
    await app.evaluate(() => window.__horde.createTokens(window.__horde.G.cards.squirrel, 3));

    expect(await board(app)).toEqual([
      ["squirrel", 7, null],
      ["squirrel", 2, { "+1/+1": 1 }],
    ]);
    // ...while "+1" on a tile makes one more of exactly what that tile shows.
    const countered = await app.evaluate(() =>
      window.__horde.stackId(window.__horde.G.board[1]));
    await app.evaluate((id) => window.__horde.duplicateStack(id), countered);
    expect(await board(app)).toEqual([
      ["squirrel", 7, null],
      ["squirrel", 3, { "+1/+1": 1 }],
    ]);
  });

  test("counters survive a save and reload", async ({ app }) => {
    const id = await squirrels(app);
    await app.evaluate((id) => {
      window.__horde.setStackCounters(id, 2, { "+1/+1": 2, stun: 1 });
    }, id);

    await app.reload();
    await app.locator("#btn-resume").click();
    await expect(app.locator("#screen-game")).toBeVisible();

    expect(await board(app)).toEqual([
      ["squirrel", 4, null],
      ["squirrel", 2, { "+1/+1": 2, stun: 1 }],
    ]);
    expect(await horde(app, () => window.__horde.attackingPower())).toBe(10);
  });
});

test.describe("copies", () => {
  /* A board with a printed 3/3 Squirrel Mob and six 1/1 Squirrel tokens, which
     is the pair of cases "create a token that's a copy of target creature"
     lands on: a card the library holds, and a token already out. */
  const boardWithBoth = (page) => page.evaluate(() => {
    const h = window.__horde;
    const deck = {
      id: "test", name: "Test",
      entries: [{ qty: 1, card: { key: "filler", name: "Filler", typeLine: "Creature — Zombie" } }],
    };
    h.G = h.newGame(deck, {
      players: ["A"], life: 100, poisonLimit: 10, ruleset: "hordemagic",
      waveEnd: "rarity", wavePattern: "fixed", legendaryRule: true, setupTurns: 0,
    });
    h.G.cards.mob = {
      key: "mob", name: "Squirrel Mob", isToken: false, resolved: true,
      typeLine: "Creature — Squirrel", power: "3", toughness: "3",
    };
    h.G.cards.squirrel = {
      key: "squirrel", name: "Squirrel", isToken: true, resolved: true,
      typeLine: "Token Creature — Squirrel", power: "1", toughness: "1",
    };
    h.G.board = [{ cardKey: "mob", count: 1 }, { cardKey: "squirrel", count: 6 }];
  });

  /* Board tiles as [name, isToken, P/T, count] — a copy carries the original's
     name, so the key alone wouldn't say which tile is which. */
  const tiles = (page) => page.evaluate(() => window.__horde.G.board.map((s) => {
    const c = window.__horde.G.cards[s.cardKey];
    return [c.name, !!c.isToken, c.power + "/" + c.toughness, s.count];
  }));

  const copy = (page, sourceKey, pt) => page.evaluate(([key, pt]) => {
    const h = window.__horde;
    const card = h.buildCopyToken(h.G.cards[key], pt);
    h.createTokens(h.existingCopyLike(card) || card, 1);
  }, [sourceKey, pt || null]);

  test("a copy of a printed creature enters as a token beside it", async ({ app }) => {
    await boardWithBoth(app);
    await copy(app, "mob");

    expect(await tiles(app)).toEqual([
      ["Squirrel Mob", false, "3/3", 1],
      ["Squirrel", true, "1/1", 6],
      ["Squirrel Mob", true, "3/3", 1],
    ]);
    // Three from the card, three from its copy, one each from the Squirrels.
    expect(await app.evaluate(() => window.__horde.attackingPower())).toBe(12);
  });

  test("\"except it's a 4/4\" keeps its own tile and its own arithmetic", async ({ app }) => {
    await boardWithBoth(app);
    await copy(app, "squirrel", { power: "4", toughness: "4" });

    expect(await tiles(app)).toEqual([
      ["Squirrel Mob", false, "3/3", 1],
      ["Squirrel", true, "1/1", 6],
      ["Squirrel", true, "4/4", 1],
    ]);
    expect(await app.evaluate(() => window.__horde.attackingPower())).toBe(13);
  });

  test("two copies made the same way stack together", async ({ app }) => {
    await boardWithBoth(app);
    await copy(app, "mob", { power: "4", toughness: "4" });
    await copy(app, "mob", { power: "4", toughness: "4" });

    expect(await tiles(app)).toEqual([
      ["Squirrel Mob", false, "3/3", 1],
      ["Squirrel", true, "1/1", 6],
      ["Squirrel Mob", true, "4/4", 2],
    ]);
  });

  test("an unaltered copy of a token is just one more of that token", async ({ app }) => {
    await boardWithBoth(app);
    await copy(app, "squirrel");

    expect(await tiles(app)).toEqual([
      ["Squirrel Mob", false, "3/3", 1],
      ["Squirrel", true, "1/1", 7],
    ]);
  });

  test("a copy keeps Defender, so it blocks rather than attacking", async ({ app }) => {
    await boardWithBoth(app);
    await app.evaluate(() => { window.__horde.G.cards.mob.hasDefender = true; });
    await copy(app, "mob");

    // Six Squirrels; neither the Mob nor its copy is in the attacking total.
    expect(await app.evaluate(() => window.__horde.attackingPower())).toBe(6);
  });

  test("a copy survives a save and reload with the stats it was given", async ({ app }) => {
    await boardWithBoth(app);
    await copy(app, "mob", { power: "4", toughness: "4" });

    await app.reload();
    await app.locator("#btn-resume").click();
    await expect(app.locator("#screen-game")).toBeVisible();

    expect(await tiles(app)).toEqual([
      ["Squirrel Mob", false, "3/3", 1],
      ["Squirrel", true, "1/1", 6],
      ["Squirrel Mob", true, "4/4", 1],
    ]);
  });
});

test.describe("ETB triggers", () => {
  /* Valley Mightcaller puts a +1/+1 counter on itself whenever another Frog,
     Rabbit, Raccoon or Squirrel enters under the Horde's control. Scryfall is
     blocked in the tests, so the type lines the trigger reads are set here,
     on top of whatever deck the game was started with. */
  const rig = (page, board) => page.evaluate((board) => {
    const h = window.__horde;
    h.G.cards.vm = {
      key: "vm", name: "Valley Mightcaller", typeLine: "Legendary Creature — Frog Warrior",
      power: "3", toughness: "3", isToken: false, resolved: true,
    };
    h.G.cards.fr = {
      key: "fr", name: "Frog", typeLine: "Token Creature — Frog",
      power: "1", toughness: "1", isToken: true, resolved: true,
    };
    h.G.board = board;
    h.renderGame();
  }, board);
  const board = (page) => page.evaluate(() =>
    window.__horde.G.board.map((s) => [s.cardKey, s.count, s.counters || null]));
  const enter = (page, key, n) => page.evaluate(([key, n]) => {
    const h = window.__horde;
    h.createTokens(h.G.cards[key], n);
    h.renderGame();
  }, [key, n]);

  test("a token entering grants every Mightcaller out a counter, whichever tile it is on",
    async ({ app }) => {
      await startGame(app, "Zombies Horde");
      // Two Mightcallers, split across tiles by the counter one already has.
      await rig(app, [{ cardKey: "vm", count: 1 }, { cardKey: "vm", count: 1, counters: { "+1/+1": 1 } }]);
      await enter(app, "fr", 1);
      const after = await board(app);
      expect(after).toHaveLength(3);
      expect(after).toEqual(expect.arrayContaining([
        ["fr", 1, null], ["vm", 1, { "+1/+1": 1 }], ["vm", 1, { "+1/+1": 2 }],
      ]));
    });

  test("a second Mightcaller entering triggers the first and not itself", async ({ app }) => {
    await startGame(app, "Zombies Horde");
    await rig(app, [{ cardKey: "vm", count: 1, counters: { "+1/+1": 1 } }]);
    await enter(app, "vm", 1);
    const after = await board(app);
    expect(after).toHaveLength(2);
    expect(after).toEqual(expect.arrayContaining([["vm", 1, null], ["vm", 1, { "+1/+1": 2 }]]));
  });

  test("the entry and the triggers it fired are one Undo", async ({ app }) => {
    await startGame(app, "Zombies Horde");
    await rig(app, [{ cardKey: "vm", count: 1 }]);
    await enter(app, "fr", 2);
    await expect(app.locator("#board .cf-counters")).toHaveCount(1);
    await app.locator("#btn-undo").click();
    expect(await board(app)).toEqual([["vm", 1, null]]);
    await expect(app.locator("#board .cardface")).toHaveCount(1);
  });
});
