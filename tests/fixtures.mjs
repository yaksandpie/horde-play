import { test as base, expect } from "@playwright/test";

/* Every test loads the app with the network cut off at the origin boundary.
 *
 * Card art, rules text and the web fonts are all niceties — the app is written
 * to fall back when it can't reach them, and that fallback is both the
 * deterministic path and the one that matters on game night. Blocking them also
 * keeps CI from hammering a free public API on every push. */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    await page.route("**/*", (route) =>
      route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await use(page);
  },

  /* The app on the decks screen, with a clean origin. */
  app: async ({ page }, use) => {
    await page.goto("/index.html");
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await expect(page.locator("#screen-decks")).toBeVisible();
    await use(page);
  },
});

export { expect };

/* Start a game on a built-in deck and play past the survivors' setup turns,
   leaving the Horde about to take its first turn. */
export async function startGame(page, deckName) {
  const row = page.locator(".deckrow", { hasText: deckName }).first();
  await row.getByRole("button", { name: "New game" }).click();
  await expect(page.locator("#screen-setup")).toBeVisible();
  await page.locator("#btn-start").click();
  await expect(page.locator("#screen-game")).toBeVisible();

  // Three survivor setup turns before the Horde wakes up.
  while (await page.evaluate(() => window.__horde.G.phase) === "setup") {
    await page.locator("#btn-action").click();
  }
}
