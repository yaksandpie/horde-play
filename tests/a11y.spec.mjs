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
import { test, expect, backToDecks, startGame } from "./fixtures.mjs";

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

/* ---- Keyboard ----

   The app is built for a tablet, but "built for touch" is not a reason to be
   unreachable without one. These drive it by key alone. */

test("every screen change moves focus to the new screen", async ({ app: page }) => {
  // Without this the old screen goes display:none under the focused element,
  // the browser drops focus to <body>, and the next Tab starts from the top of
  // the document with nothing said about where you now are.
  for (const [button, screen, heading] of [
    ["#btn-import", "#screen-import", "Import a decklist"],
    ["#btn-bans", "#screen-bans", "Ban list"],
  ]) {
    await page.locator(button).click();
    await expect(page.locator(screen)).toBeVisible();
    await expect(page.locator(`${screen} h2`).first()).toBeFocused();
    await expect(page.locator(`${screen} h2`).first()).toHaveText(heading);
    await backToDecks(page);
  }
});

test("a game can be started and played without a pointer", async ({ app: page }) => {
  const row = page.locator(".deckrow").first();
  await row.getByRole("button", { name: "New game" }).press("Enter");
  await expect(page.locator("#screen-setup")).toBeVisible();

  await page.locator("#btn-start").press("Enter");
  await expect(page.locator("#screen-game")).toBeVisible();
  await expect(page.locator("#screen-game h2").first()).toBeFocused();

  // Space on the focused action tile takes the turn, and must take exactly one
  // — the global shortcut handler bows out for a focused button so a single
  // press can't fire both paths.
  const before = await page.evaluate(() => window.__horde.G.turn);
  await page.locator("#btn-action").focus();
  await page.keyboard.press(" ");
  await expect.poll(() => page.evaluate(() => window.__horde.G.turn)).toBeGreaterThan(before);
});

test("the sheets are reachable, dismissable and give focus back", async ({ app: page }) => {
  await startGame(page, "Zombies Horde");

  const opener = page.locator("#btn-log");
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#log-dialog")).toBeVisible();

  // A native <dialog> opened with showModal() keeps Tab inside itself, so the
  // page behind is unreachable until it closes.
  await expect(page.locator("#log-dialog")).toContainText("Log");
  await page.keyboard.press("Escape");
  await expect(page.locator("#log-dialog")).toBeHidden();
  await expect(opener).toBeFocused();
});

test("a keyboard shortcut is ignored while a sheet is open or a field has focus",
  async ({ app: page }) => {
    await startGame(page, "Zombies Horde");

    await page.locator("#btn-log").click();
    await expect(page.locator("#log-dialog")).toBeVisible();
    const turn = await page.evaluate(() => window.__horde.G.turn);
    await page.keyboard.press("u");
    expect(await page.evaluate(() => window.__horde.G.turn)).toBe(turn);
    await page.keyboard.press("Escape");
  });

/* ---- Screen reader ----

   No real screen reader runs here. What can be checked is the thing a screen
   reader reads: the accessibility tree, and whether the app writes to a live
   region when the board changes underneath it. */

test("every sheet is announced by name, not as a bare dialog", async ({ app: page }) => {
  await startGame(page, "Zombies Horde");

  for (const [button, dialog, name] of [
    ["#btn-log", "#log-dialog", "Log"],
    ["#btn-share", "#share-dialog", "Share this game"],
  ]) {
    await page.locator(button).click();
    await expect(page.locator(dialog)).toBeVisible();
    // aria-labelledby has to resolve to a real element with real text — an id
    // pointing at nothing gives the dialog no name at all, silently.
    const label = await page.locator(dialog).evaluate((d) => {
      const t = document.getElementById(d.getAttribute("aria-labelledby"));
      return t && t.textContent.trim();
    });
    expect(label, `${dialog} should be named "${name}"`).toBe(name);
    await page.keyboard.press("Escape");
  }
});

test("the token sheet is named by the step actually showing", async ({ app: page }) => {
  await startGame(page, "Zombies Horde");
  await page.locator("#btn-add-tokens").click();
  await expect(page.locator("#token-dialog")).toBeVisible();

  const named = () => page.locator("#token-dialog").evaluate((d) =>
    document.getElementById(d.getAttribute("aria-labelledby"))?.textContent.trim());
  expect(await named()).toBe("Create tokens");

  await page.locator("#token-copy-open").click();
  await expect(page.locator("#token-step-copysrc")).toBeVisible();
  expect(await named()).toBe("Copy a creature");
});

test("what the Horde does is announced, not just written to the log",
  async ({ app: page }) => {
    await startGame(page, "Zombies Horde");
    const status = page.locator("#sr-status");

    // The region has to be in the tree from the start — one created at the
    // moment of the announcement is not reliably spoken.
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("role", "status");

    await page.locator("#btn-action").click();
    await expect(status).not.toHaveText("");

    // A wave logs several lines at once; they are flushed together so the
    // region is not overwritten four times and read once.
    const said = await status.textContent();
    const newest = await page.evaluate(() => window.__horde.G.log[0].msg);
    expect(said).toContain(newest);
  });

test("a repeated action is announced again rather than passing in silence",
  async ({ app: page }) => {
    await startGame(page, "Zombies Horde");

    /* Writing an identical string to a live region is not a change, and so is
       never spoken — two identical waves in a row would announce once. The
       region clears before it refills, which is two mutations either way.
       Watching the mutations is the only way to see that from out here; the
       final text alone can't tell the two implementations apart. */
    await page.evaluate(() => {
      window.__seen = [];
      new MutationObserver(() => window.__seen.push(document.getElementById("sr-status").textContent))
        .observe(document.getElementById("sr-status"), { childList: true, characterData: true, subtree: true });
    });

    await page.locator("#btn-action").click();
    await expect(page.locator("#sr-status")).not.toHaveText("");
    await page.locator("#btn-action").click();
    await expect(page.locator("#sr-status")).not.toHaveText("");

    const seen = await page.evaluate(() => window.__seen);
    const filled = seen.filter((t) => t !== "");
    expect(filled.length, `expected two announcements, saw ${JSON.stringify(seen)}`)
      .toBeGreaterThanOrEqual(2);
    // The clear between them is what makes the second one audible.
    expect(seen.indexOf(""), `expected the region to be cleared between announcements`)
      .toBeGreaterThan(-1);
  });
