import { test, expect } from "@playwright/test";

const EXPECTED_LINKS: Record<string, string> = {
  LinkedIn: "https://www.linkedin.com/in/tajammal-hussain-233293ab/",
  GitHub: "https://github.com/TajammalHussain",
  Facebook: "https://www.facebook.com/tajammal.hussain.5851",
  Instagram: "https://www.instagram.com/hus_sain_786/",
  TikTok: "https://www.tiktok.com/@hussains_essence",
  X: "https://x.com/Tajammal72",
};

test.describe("Social links", () => {
  test("footer shows all six branded social buttons with correct URLs and safe link attributes", async ({
    page,
  }) => {
    await page.goto("/");
    const footerSocial = page.locator("footer ul").first();

    for (const [label, url] of Object.entries(EXPECTED_LINKS)) {
      const link = footerSocial.getByRole("link", { name: new RegExp(label, "i") });
      await expect(link).toHaveAttribute("href", url);
      await expect(link).toHaveAttribute("target", "_blank");
      // rel must include both noopener (prevents the opened tab from
      // controlling window.opener) and me (rel=me is what lets services
      // like Mastodon/IndieWeb verify these as this person's real profiles).
      const rel = await link.getAttribute("rel");
      expect(rel).toContain("noopener");
      expect(rel).toContain("me");
    }
  });

  test("the same buttons also appear prominently on /about", async ({ page }) => {
    await page.goto("/about");
    const aboutSocial = page.locator("main ul").first();
    await expect(aboutSocial.getByRole("link", { name: /LinkedIn/i })).toBeVisible();
    await expect(aboutSocial.getByRole("link", { name: /Instagram/i })).toBeVisible();
  });

  test("each button has an accessible name distinguishable from a bare icon", async ({ page }) => {
    await page.goto("/");
    const footerSocial = page.locator("footer ul").first();
    const links = await footerSocial.getByRole("link").all();
    expect(links.length).toBe(6);
    for (const link of links) {
      const accessibleName = await link.getAttribute("aria-label");
      expect(accessibleName).toMatch(/opens in a new tab/i);
    }
  });
});
