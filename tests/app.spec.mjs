/* A game played through the real UI, offline. If these pass, the app opens on a
   tablet with no signal and gets through a turn. */
import { test, expect, startGame } from "./fixtures.mjs";

test("the decks screen lists the built-in hordes", async ({ app }) => {
  await expect(app.locator("#screen-decks")).toBeVisible();
  const rows = app.locator(".deckrow");
  await expect(rows).toHaveCount(14);
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
