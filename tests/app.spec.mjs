/* A game played through the real UI, offline. If these pass, the app opens on a
   tablet with no signal and gets through a turn. */
import { test, expect, startGame, backToDecks } from "./fixtures.mjs";

test("the decks screen lists the built-in hordes", async ({ app }) => {
  await expect(app.locator("#screen-decks")).toBeVisible();
  const rows = app.locator(".deckrow");
  await expect(rows).toHaveCount(16);
  await expect(rows.filter({ hasText: "Zombies Horde" })).toContainText("300 cards");
  await expect(rows.filter({ hasText: "Zombies Horde" })).toContainText("Original Horde rules");
});

test("setup prints the ruleset and adjusts shared life per survivor", async ({ app }) => {
  await app.locator(".deckrow", { hasText: "Vampire Horde" }).first()
    .getByRole("button", { name: "New game" }).click();

  await expect(app.locator("#screen-setup")).toBeVisible();
  await expect(app.locator("#setup-deckname")).toHaveText("Vampire Horde");
  await expect(app.locator("#setup-rules")).toContainText("uncommon");

  // The setup screen opens on two survivors: 100 for the first, 15 less after.
  await expect(app.locator("#setup-life")).toHaveValue("85");
  await expect(app.locator("#setup-rules")).toContainText("85 — 2 survivors");

  await app.locator("#btn-add-player").click();
  await expect(app.locator("#setup-life")).toHaveValue("70");

  await app.locator("#setup-players").getByRole("button", { name: "Remove" }).first().click();
  await expect(app.locator("#setup-life")).toHaveValue("85");
});

test("a game plays a turn: cast a wave, resolve it, pass back", async ({ app }) => {
  await startGame(app, "Zombies Horde");

  await expect(app.locator("#c-library")).toHaveText("300");
  await expect(app.locator("#c-board")).toHaveText("0");

  // Cast the wave.
  await app.locator("#btn-action").click();
  await expect.poll(() => app.evaluate(() => window.__horde.G.phase)).toBe("reveal");
  const revealed = await app.evaluate(() => window.__horde.G.revealed.length);
  expect(revealed).toBeGreaterThan(0);

  // Resolve it: creatures land on the battlefield, spells go to the graveyard.
  await app.locator("#btn-action").click();
  await expect.poll(() => app.evaluate(() => window.__horde.G.phase)).toBe("combat");
  await expect(app.locator("#c-library")).toHaveText(String(300 - revealed));

  const { onBoard, inYard, stacks } = await app.evaluate(() => ({
    onBoard: window.__horde.G.board.reduce((n, s) => n + s.count, 0),
    inYard: window.__horde.G.graveyard.length,
    stacks: window.__horde.G.board.length,
  }));
  expect(onBoard + inYard).toBe(revealed);
  await expect(app.locator("#board .cardface")).toHaveCount(stacks);
  await expect(app.locator("#c-yard")).toHaveText(String(inYard));

  // Pass the turn back to the survivors.
  await app.locator("#btn-action").click();
  await expect.poll(() => app.evaluate(() => window.__horde.G.phase)).toBe("survivors");
  await expect(app.locator("#c-turn")).toHaveText("5");
});

test("combat names its attackers, and a name opens the card", async ({ app }) => {
  // The stage used to redraw every attacker at full size, restating the board
  // panel below it and pushing that panel off the screen. It names them now,
  // so the roster has to stay in step with the board and stay tappable.
  await startGame(app, "Zombies Horde");
  await app.locator("#btn-action").click(); // cast
  await app.locator("#btn-action").click(); // resolve
  await expect.poll(() => app.evaluate(() => window.__horde.G.phase)).toBe("combat");

  const attacking = await app.evaluate(() =>
    window.__horde.G.board.filter((s) => !window.__horde.G.cards[s.cardKey].hasDefender).length);
  const chips = app.locator(".stage-roster .roster-chip");
  await expect(chips).toHaveCount(attacking);
  // No second copy of the board in the stage.
  await expect(app.locator("#stage-body .cardface")).toHaveCount(0);

  const first = chips.first();
  const label = (await first.textContent()).replace(/\s*\u00d7\d+$/, "").trim();
  await first.click();
  await expect(app.locator("#card-dialog")).toBeVisible();
  await expect(app.locator("#cv-name")).toHaveText(label);
});

test("the original rule lets tokens ride along inside a wave", async ({ app }) => {
  // 187 of the Zombies horde's 300 cards are tokens, so a wave that stops on
  // the first non-token still tends to bring a crowd. Over ten waves at least
  // one should have carried a token along.
  await startGame(app, "Zombies Horde");

  let biggest = 0;
  for (let i = 0; i < 10; i++) {
    await app.locator("#btn-action").click(); // cast
    biggest = Math.max(biggest, await app.evaluate(() => window.__horde.G.revealed.length));
    await app.locator("#btn-action").click(); // resolve
    await app.locator("#btn-action").click(); // pass
  }
  expect(biggest).toBeGreaterThan(1);
});

test("damage mills the library", async ({ app }) => {
  await startGame(app, "Zombies Horde");

  await app.locator("#tile-damage").click();
  const dialog = app.locator("#damage-dialog");
  await expect(dialog).toBeVisible();

  await dialog.locator('[data-d="1"]').click();
  await dialog.locator('[data-d="2"]').click();
  await expect(app.locator("#mill-out")).toHaveText("12");

  await dialog.locator("#dd-mill").click();
  await expect(app.locator("#c-library")).toHaveText("288");
  await expect(app.locator("#c-yard")).toHaveText("12");
});

test("undo takes back the last action", async ({ app }) => {
  await startGame(app, "Zombies Horde");

  await app.locator("#btn-action").click();
  const afterWave = await app.locator("#c-library").textContent();
  expect(Number(afterWave)).toBeLessThan(300);

  await app.locator("#btn-undo").click();
  await expect(app.locator("#c-library")).toHaveText("300");
});

test("a game in progress survives a reload", async ({ app }) => {
  await startGame(app, "Zombies Horde");
  await app.locator("#btn-action").click();
  await app.locator("#btn-action").click();
  const library = await app.locator("#c-library").textContent();

  await app.reload();
  await expect(app.locator("#screen-decks")).toBeVisible();
  await expect(app.locator("#btn-resume")).toBeVisible();

  await app.locator("#btn-resume").click();
  await expect(app.locator("#screen-game")).toBeVisible();
  await expect(app.locator("#c-library")).toHaveText(library);
});

test("counters split a board tile, and the tile says so", async ({ app }) => {
  await startGame(app, "Zombies Horde");

  // Six Zombie tokens out, without waiting for the shuffle to produce them.
  await app.evaluate(() => {
    const h = window.__horde;
    const key = Object.keys(h.G.cards).find((k) => h.G.cards[k].name === "Zombie");
    h.G.board = [{ cardKey: key, count: 6 }];
    h.renderGame();
  });
  await expect(app.locator("#board .cardface")).toHaveCount(1);

  await app.locator("#board .cardbtn").first().click();
  await expect(app.locator("#card-dialog")).toBeVisible();
  await app.locator("#cv-counters-btn").click();
  await expect(app.locator("#counters-dialog")).toBeVisible();

  // Two of the six get a +1/+1 counter; the other four stay as they are.
  await app.locator("#ct-one").click();
  await app.locator("#ct-more").click();
  await expect(app.locator("#ct-n")).toHaveText("2");
  await app.locator("#ct-rows .ctrrow").first()
    .getByRole("button", { name: "One more +1/+1 counter" }).click();
  await expect(app.locator("#ct-preview")).toContainText("The other 4");

  await app.locator("#ct-apply").click();
  await expect(app.locator("#counters-dialog")).toBeHidden();

  await expect(app.locator("#board .cardface")).toHaveCount(2);
  await expect(app.locator("#board .cf-counters")).toHaveCount(1);
  await expect(app.locator("#board .cf-counters")).toContainText("+1/+1");
  await expect(app.locator("#board-summary")).toContainText("2 with counters");
  await expect(app.locator("#c-board")).toHaveText("6");

  // Undo puts the six back together.
  await app.locator("#btn-undo").click();
  await expect(app.locator("#board .cardface")).toHaveCount(1);
});

test("a board creature can be copied, at the stats the effect names", async ({ app }) => {
  await startGame(app, "Zombies Horde");

  // One printed Death Baron out — a card, not a token, which is the case the
  // library can't cover by hand.
  await app.evaluate(() => {
    const h = window.__horde;
    const key = Object.keys(h.G.cards).find((k) => h.G.cards[k].name === "Death Baron");
    h.G.board = [{ cardKey: key, count: 1 }];
    h.renderGame();
  });
  await expect(app.locator("#board .cardface")).toHaveCount(1);

  await app.locator("#board .cardbtn").first().click();
  await expect(app.locator("#card-dialog")).toBeVisible();
  await app.locator("#cv-copy").click();

  // The copy step opens on the original's stats; "...except it's a 4/4"
  // overwrites them.
  await expect(app.locator("#token-step-copy")).toBeVisible();
  await expect(app.locator("#cp-name")).toHaveText("Copy of Death Baron");
  await app.locator("#cp-power").fill("4");
  await app.locator("#cp-tough").fill("4");
  await app.locator("#cp-next").click();

  await expect(app.locator("#token-step-qty")).toBeVisible();
  await expect(app.locator("#tq-name")).toHaveText("Copy of Death Baron");
  await app.locator("#tq-add").click();
  await expect(app.locator("#token-dialog")).toBeHidden();

  // A second tile: same art, badged as a copy, and carrying the given stats.
  await expect(app.locator("#board .cardface")).toHaveCount(2);
  await expect(app.locator("#board .cf-badge.copy")).toHaveText("Copy 4/4");
  await expect(app.locator("#c-board")).toHaveText("2");

  // Undo takes the copy back off.
  await app.locator("#btn-undo").click();
  await expect(app.locator("#board .cardface")).toHaveCount(1);
});

test("copying is offered from the token sheet too, for a survivor's creature",
  async ({ app }) => {
    await startGame(app, "Zombies Horde");
    await app.evaluate(() => {
      const h = window.__horde;
      const key = Object.keys(h.G.cards).find((k) => h.G.cards[k].name === "Zombie");
      h.G.board = [{ cardKey: key, count: 6 }];
      h.renderGame();
    });

    await app.locator("#btn-add-tokens").click();
    await app.locator("#token-copy-open").click();
    await expect(app.locator("#token-step-copysrc")).toBeVisible();

    // The Horde's own board is the shortcut; the search is for everything else,
    // and offline it says so rather than leaving an empty grid.
    await expect(app.locator("#copy-src-grid .slot")).toHaveCount(1);
    await app.locator("#copy-search").fill("Grave Titan");
    await app.locator("#copy-search-form").getByRole("button", { name: "Find" }).click();
    await expect(app.locator("#copy-src-empty")).toContainText("Couldn\u2019t reach Scryfall");
    await expect(app.locator("#copy-src-grid .slot")).toHaveCount(1);

    // An unaltered copy of a token already out is just one more of them.
    await app.locator("#copy-src-grid .plainbtn").first().click();
    await app.locator("#cp-next").click();
    await app.locator("#tq-add").click();
    await expect(app.locator("#board .cardface")).toHaveCount(1);
    await expect(app.locator("#c-board")).toHaveText("7");
  });

test("the header carries the game's actions, and drops them with the game",
  async ({ app }) => {
    for (const id of ["#btn-undo", "#btn-random", "#btn-log", "#btn-quit"]) {
      await expect(app.locator(id)).toBeHidden();
    }

    await startGame(app, "Zombies Horde");
    for (const id of ["#btn-undo", "#btn-random", "#btn-log", "#btn-quit"]) {
      await expect(app.locator(id)).toBeVisible();
    }

    // The header dresses itself for the game screen, not for a saved game:
    // leave the screen and the actions go, even with the game still in hand.
    await backToDecks(app);
    await expect(app.locator("#screen-decks")).toBeVisible();
    for (const id of ["#btn-undo", "#btn-random", "#btn-log", "#btn-quit"]) {
      await expect(app.locator(id)).toBeHidden();
    }
  });

test("the log opens in a modal, newest line first", async ({ app }) => {
  await startGame(app, "Zombies Horde");
  await expect(app.locator("#log-dialog")).toBeHidden();

  await app.locator("#btn-log").click();
  await expect(app.locator("#log-dialog")).toBeVisible();
  await expect(app.locator("#log li").first()).toContainText("the Horde wakes up");
  await expect(app.locator("#log li").last()).toContainText("Shuffled 300 cards");

  /* Close is the only focusable thing under the list, so a sheet left to
     itself opens scrolled past every entry the log was opened for. */
  await app.evaluate(() => {
    const { G, renderGame } = window.__horde;
    for (let i = 0; i < 60; i++) G.log.unshift({ t: 4, msg: "filler " + i });
    renderGame();
  });
  await app.locator("#log-close").click();
  await app.locator("#btn-log").click();
  expect(await app.locator("#log-dialog").evaluate((d) => d.scrollTop)).toBe(0);

  await app.locator("#log-close").click();
  await expect(app.locator("#log-dialog")).toBeHidden();
});

test("the ban list answers offline", async ({ app }) => {
  await app.locator("#btn-bans").click();
  await expect(app.locator("#screen-bans")).toBeVisible();

  await app.locator("#ban-search").fill("Ensnaring Bridge");
  await expect(app.locator("#ban-sections")).toContainText("Ensnaring Bridge");
  await expect(app.locator("#ban-count")).toHaveText("Banned.");

  await app.locator("#ban-search").fill("Llanowar Elves");
  await expect(app.locator("#ban-count")).toContainText("Nothing on the ban list matches");
});

test("an imported decklist reaches the review screen without a network", async ({ app }) => {
  await app.locator("#btn-import").click();
  await expect(app.locator("#screen-import")).toBeVisible();

  await app.locator("#import-name").fill("Test Horde");
  await app.locator("#import-text").fill(
    "Creatures: (3)\n2 Death Baron\n1 Grave Titan\nTokens (10)\n10 Zombie"
  );
  await app.locator("#btn-parse").click();

  await expect(app.locator("#import-step-review")).toBeVisible({ timeout: 30_000 });
  await expect(app.locator("#review-summary")).toContainText("13");

  await app.locator("#btn-save-deck").click();
  await expect(app.locator("#screen-decks")).toBeVisible();
  await expect(app.locator(".deckrow", { hasText: "Test Horde" })).toContainText("13 cards");
});

test("the app registers a service worker so it installs offline", async ({ app }) => {
  await expect.poll(
    () => app.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
    { timeout: 15_000 }
  ).toBeGreaterThan(0);
});

test("the Bloomburrow skin paints the whole page, not just the body box", async ({ app }) => {
  /* The canvas behind the page comes from <html>, so a theme defined on
     <body> alone left the empty space below a short setup screen brown. */
  await app.setViewportSize({ width: 1280, height: 1024 });

  const bg = () => app.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
    shorterThanViewport: document.body.getBoundingClientRect().height < innerHeight,
  }));

  const plain = await bg();
  expect(plain.html).toBe("rgb(44, 42, 37)");

  await app.locator(".deckrow", { hasText: "Bloomburrow — Druid Circle" }).first()
    .getByRole("button", { name: "New game" }).click();
  await expect(app.locator("#screen-setup")).toBeVisible();

  const themed = await bg();
  expect(themed.body).toBe("rgb(15, 26, 18)");
  expect(themed.html).toBe(themed.body);
  // The bug is only visible when the page doesn't fill the window.
  expect(themed.shorterThanViewport).toBe(true);

  // And it comes back off when the deck is put down.
  await backToDecks(app);
  expect((await bg()).html).toBe("rgb(44, 42, 37)");
});

test("a glossary definition opens against the word, not in the middle of the screen",
  async ({ app }) => {
    await startGame(app, "Zombies Horde");

    const word = app.locator("#board-panel").getByRole("button", { name: "goaded" });
    await word.click();
    const pop = app.locator("#def-goaded");
    await expect(pop).toBeVisible();

    const w = await word.boundingBox();
    const p = await pop.boundingBox();

    // Tucked just under the word it explains...
    expect(p.y).toBeGreaterThanOrEqual(w.y + w.height);
    expect(p.y).toBeLessThan(w.y + w.height + 20);
    // ...and wide enough of it that the word sits under the popover, which is
    // where the caret points. The popover may be nudged sideways to stay on
    // screen, so this is the claim that survives that nudge.
    const mid = w.x + w.width / 2;
    expect(mid).toBeGreaterThan(p.x);
    expect(mid).toBeLessThan(p.x + p.width);
    await expect(pop).toHaveClass(/below/);
  });

test("a definition with no room beneath it opens above the word instead",
  async ({ app }) => {
    await startGame(app, "Zombies Horde");

    const word = app.locator("#board-panel").getByRole("button", { name: "goaded" });
    // Crop the viewport just under the word, leaving nowhere below for the
    // popover to go. Only the height changes, so nothing above it reflows.
    const seat = await word.boundingBox();
    await app.setViewportSize({ width: 1280, height: Math.round(seat.y + seat.height) + 24 });
    // Click in place: locator.click() would scroll the word back to the middle
    // of the viewport first, handing the popover the room we just took away.
    await word.evaluate((n) => n.click());
    const pop = app.locator("#def-goaded");
    await expect(pop).toBeVisible();

    const w = await word.boundingBox();
    const p = await pop.boundingBox();

    await expect(pop).toHaveClass(/above/);
    expect(p.y + p.height).toBeLessThanOrEqual(w.y);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

test("each ending gets its own weather: confetti for the win, ash for the loss",
  async ({ app }) => {
    await startGame(app, "Zombies Horde");

    // The survivors go down: life to zero, and the game screen re-renders into
    // the end screen the way it does after any action that kills them.
    await app.evaluate(() => {
      window.__horde.adjustLife(-999);
      window.__horde.renderGame();
    });
    await expect(app.locator("#screen-end")).toBeVisible();
    await expect(app.locator("#end-title")).toHaveText("The Horde wins.");

    const weather = app.locator("#end-weather");
    await expect(weather).toHaveClass("ash");
    // Rising, unspinning and round — the confetti's opposite on every axis.
    const mote = weather.locator("i").first();
    await expect(mote).toHaveCSS("animation-name", "ash-rise");
    await expect(mote).toHaveCSS("border-radius", "50%");

    // And the win still gets the confetti it always had.
    await backToDecks(app);
    await startGame(app, "Zombies Horde");
    await app.evaluate(() => {
      const H = window.__horde;
      H.G.library = [];
      H.G.revealed = [];
      H.G.board = [];
      H.G.over = "survivors";
      H.renderGame();
    });
    await expect(app.locator("#end-title")).toHaveText("The Horde falls.");
    await expect(weather).toHaveClass("confetti");
    await expect(weather.locator("i").first())
      .toHaveCSS("animation-name", "confetti-fall");
  });

test("neither ending animates for a reader who asked for less motion",
  async ({ app }) => {
    await app.emulateMedia({ reducedMotion: "reduce" });
    await startGame(app, "Zombies Horde");
    await app.evaluate(() => {
      window.__horde.adjustLife(-999);
      window.__horde.renderGame();
    });
    await expect(app.locator("#screen-end")).toBeVisible();
    // Not spawned and then hidden by CSS — never spawned at all.
    await expect(app.locator("#end-weather i")).toHaveCount(0);
  });
