/* Accessibility scan.
 *
 * axe-core is run against the real page in each of the states a player
 * actually passes through, rather than against index.html at rest — almost
 * every interesting surface here (the arena, the sheets, the review step) only
 * exists once the app has been driven into it.
 *
 * The suite asserts zero violations. That is a deliberate choice over a
 * baseline file of known failures: the app was already clean apart from one
 * colour token, so there is nothing to grandfather in, and a green run is a
 * signal that stays honest. If a rule ever needs to come off, take it off
 * explicitly in RULES below with a comment saying why. */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, backToDecks } from "./fixtures.mjs";

/* WCAG 2.1 A and AA. Deliberately not `best-practice`: those are opinions
   rather than the standard, and mixing them in makes a failure ambiguous. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/* A Bloomburrow deck, which swaps the whole palette for the green skin — the
   one code path where the colour tokens differ, so it gets its own scan. */
const BLOOM_DECK = "Rabbit Warren";

async function scan(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  // A bare count tells you nothing when it fails at 3am, so spell out the rule,
  // the elements and axe's own explanation of the fix.
  const detail = violations.map((v) =>
    `\n  [${v.impact}] ${v.id} — ${v.help}\n  ${v.helpUrl}\n` +
    v.nodes.map((n) => `    ${n.target.join(" ")}\n      ${(n.failureSummary || "").replace(/\n/g, "\n      ")}`).join("\n")
  ).join("\n");

  expect(violations.map((v) => v.id), `axe violations on "${label}":${detail}\n`).toEqual([]);
}

test("the decks, import and ban screens are clean", async ({ app: page }) => {
  await scan(page, "decks");

  await page.locator("#btn-import").click();
  await expect(page.locator("#screen-import")).toBeVisible();
  await scan(page, "import — paste step");
  await backToDecks(page);

  await page.locator("#btn-bans").click();
  await expect(page.locator("#screen-bans")).toBeVisible();
  await scan(page, "ban list");
});

test("the setup screen and a game in progress are clean", async ({ app: page }) => {
  await page.locator(".deckrow").first().getByRole("button", { name: "New game" }).click();
  await expect(page.locator("#screen-setup")).toBeVisible();
  await scan(page, "setup");

  await page.locator("#btn-start").click();
  await expect(page.locator("#screen-game")).toBeVisible();
  await scan(page, "game — survivors' setup turns");

  while (await page.evaluate(() => window.__horde.G.phase) === "setup") {
    await page.locator("#btn-action").click();
  }
  await scan(page, "game — the Horde's turn");
});

test("the sheets that open over a game are clean", async ({ app: page }) => {
  await page.locator(".deckrow").first().getByRole("button", { name: "New game" }).click();
  await page.locator("#btn-start").click();
  await expect(page.locator("#screen-game")).toBeVisible();

  // Each sheet is a native <dialog>, so it is scanned while open and modal —
  // which is also what makes the rest of the page inert to axe.
  for (const [button, dialog, label] of [
    ["#btn-log", "#log-dialog", "game log"],
    ["#btn-share", "#share-dialog", "share"],
  ]) {
    await page.locator(button).click();
    await expect(page.locator(dialog)).toBeVisible();
    await scan(page, `${label} sheet`);
    await page.keyboard.press("Escape");
    await expect(page.locator(dialog)).toBeHidden();
  }
});

test("the Bloomburrow palette is clean", async ({ app: page }) => {
  const row = page.locator(".deckrow", { hasText: BLOOM_DECK }).first();
  await row.getByRole("button", { name: "New game" }).click();
  await expect(page.locator("#screen-setup")).toBeVisible();
  await expect(page.locator("body.theme-bloomburrow")).toHaveCount(1);
  await scan(page, "setup — Bloomburrow skin");

  await page.locator("#btn-start").click();
  await expect(page.locator("#screen-game")).toBeVisible();
  await scan(page, "game — Bloomburrow skin");
});
