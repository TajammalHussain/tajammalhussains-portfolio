import { test, expect } from "@playwright/test";

test.describe("Site navigation", () => {
  test("homepage loads with the correct title and hero content", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Tajammal Hussain/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("primary nav links reach their pages", async ({ page }) => {
    await page.goto("/");
    const routes: Array<[string, RegExp]> = [
      ["Work", /Case Studies/i],
      ["Live Data", /Live Data/i],
      ["Writing", /Writing/i],
      ["About", /About/i],
      ["CV", /CV/i],
    ];
    for (const [linkText, expectedHeading] of routes) {
      await page.goto("/");
      // At narrow viewports the nav collapses behind a hamburger toggle
      // (see mobile.spec.ts for dedicated coverage of that interaction) —
      // open it first if it's present, so this test verifies the links
      // themselves work on every viewport, not just desktop.
      const navToggle = page.locator("#nav-toggle");
      if (await navToggle.isVisible()) {
        await navToggle.click();
      }
      await page
        .getByRole("link", { name: linkText, exact: true })
        .first()
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        expectedHeading,
      );
    }
  });

  test("footer links to /status, /api, /ventures all resolve", async ({
    page,
  }) => {
    await page.goto("/");
    for (const href of ["/status", "/api", "/ventures"]) {
      const res = await page.request.get(href);
      expect(res.status(), `${href} should return 200`).toBe(200);
    }
  });

  test("404 for a nonexistent route", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("og:image meta tag on every page type actually resolves, not a broken link", async ({
    page,
  }) => {
    for (const path of [
      "/",
      "/work/approval-workflow-platform",
      "/writing/rules-as-data",
    ]) {
      await page.goto(path);
      const ogImage = await page
        .locator('meta[property="og:image"]')
        .getAttribute("content");
      expect(ogImage, `${path} should have an og:image tag`).toBeTruthy();
      // og:image is rendered as an absolute production URL — request its path
      // against the local test server instead of the real (undeployed) domain.
      const res = await page.request.get(new URL(ogImage!).pathname);
      expect(
        res.status(),
        `${ogImage} (referenced from ${path}) should return 200`,
      ).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
    }
  });
});
