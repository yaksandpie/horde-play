/* The game rules, exercised through the window.__horde harness the app
   already exposes. These are unit tests that happen to run in a browser,
   because that's where the code lives. */
import { test, expect } from "./fixtures.mjs";

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
