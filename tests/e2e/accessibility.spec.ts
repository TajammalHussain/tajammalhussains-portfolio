import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = [
  "/",
  "/work",
  "/work/approval-workflow-platform",
  "/live",
  "/live/carbon",
  "/live/housing",
  "/live/meta",
  "/writing",
  "/writing/why-this-site-runs-real-pipelines",
  "/about",
  "/cv",
  "/ventures",
  "/uses",
  "/api",
  "/status",
];

test.describe("Accessibility — WCAG 2.1 AA, zero violations", () => {
  for (const path of PAGES) {
    test(`${path} has zero axe-core violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations,
        JSON.stringify(results.violations, null, 2),
      ).toEqual([]);
    });
  }

  test("heading hierarchy on the homepage has exactly one h1 and no skipped levels", async ({
    page,
  }) => {
    await page.goto("/");
    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((el) =>
        Number(el.tagName[1]),
      ),
    );
    expect(levels.filter((l) => l === 1)).toHaveLength(1);

    // A heading may jump back up to any shallower level freely, but may only
    // ever go one level *deeper* than the deepest level seen so far — i.e.
    // no skipping from h1 straight to h3.
    let deepestSoFar = levels[0];
    for (const level of levels.slice(1)) {
      expect(level).toBeLessThanOrEqual(deepestSoFar + 1);
      deepestSoFar = Math.max(deepestSoFar, level);
    }
  });

  test("full site is keyboard navigable: Tab reaches the skip link first", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() =>
      document.activeElement?.textContent?.trim(),
    );
    expect(focused).toBe("Skip to content");
  });

  test("theme toggle is reachable and operable by keyboard", async ({
    page,
  }) => {
    await page.goto("/");
    // The toggle lives inside the collapsible nav — open it first on
    // viewports narrow enough that it's hidden, since focusing a
    // display:none element is a no-op in real browsers.
    const navToggle = page.locator("#nav-toggle");
    if (await navToggle.isVisible()) {
      await navToggle.click();
    }
    const toggle = page.locator("#theme-toggle");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(["light", "dark"]).toContain(theme);
  });
});
