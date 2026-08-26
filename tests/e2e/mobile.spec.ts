import { test, expect, devices } from "@playwright/test";

// Chromium-based (not WebKit) so this suite doesn't need a separate WebKit
// browser install — the "mobile" Playwright project already covers a
// Chromium mobile viewport (Pixel 7); this file uses a distinct device
// (Galaxy S9+) mainly to exercise the hamburger-nav interaction explicitly.
test.use({ ...devices["Galaxy S9+"] });

test.describe("Mobile viewport", () => {
  test("nav collapses behind a hamburger toggle and expands on tap", async ({
    page,
  }) => {
    await page.goto("/");
    const navLinks = page.locator("#nav-links");
    await expect(navLinks).toBeHidden();

    const toggle = page.locator("#nav-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(navLinks).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("homepage content is usable without horizontal scrolling", async ({
    page,
  }) => {
    await page.goto("/");
    const hasHorizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test("case study page remains readable and the diagram fits within the viewport", async ({
    page,
  }) => {
    await page.goto("/work/approval-workflow-platform");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });
});
