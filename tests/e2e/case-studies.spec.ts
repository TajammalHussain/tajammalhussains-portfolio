import { test, expect } from "@playwright/test";

test.describe("Case studies", () => {
  test("the work index lists all 6 case studies", async ({ page }) => {
    await page.goto("/work");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Case Studies",
    );
    // Scoped to <main> — the footer's social-links pills are also an
    // <ul><li><a> list, so an unscoped locator here would double-count them.
    const cards = page.locator("main ul > li a");
    await expect(cards).toHaveCount(6);
  });

  test("opening a case study renders every required section and its Mermaid diagram", async ({
    page,
  }) => {
    await page.goto("/work/approval-workflow-platform");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Multi-Level Approval Workflow Platform",
    );

    for (const heading of [
      "Problem",
      "Constraints",
      "Approach",
      "Outcome",
      "What I'd do differently",
      "Architecture",
    ]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }

    // The diagram is rendered by an IntersectionObserver — it only fires once
    // the wrapper actually scrolls into the viewport (matching real user
    // behaviour, and deliberately not on every page load), so scroll to it
    // first rather than asserting from the top of the page.
    const wrapper = page.locator(".mermaid-wrapper");
    await wrapper.scrollIntoViewIfNeeded();
    const diagram = wrapper.locator("svg");
    // Generous timeout: this waits on a genuine dynamic import() of the ~680KB
    // mermaid module, which can be meaningfully slower under mobile device
    // emulation's CPU/network throttling than on desktop.
    await expect(diagram).toBeVisible({ timeout: 20_000 });
  });

  test("case study pages contain no employer-internal implementation detail markers", async ({
    page,
  }) => {
    // A light guardrail, not a substitute for human review: fails loudly if
    // wording that looks like an internal calculation/threshold ever creeps
    // into a case study (spec: no proprietary implementation detail).
    await page.goto("/work/compliance-certification-system");
    const bodyText = await page.locator("article").innerText();
    expect(bodyText.toLowerCase()).not.toContain("control electrical");
  });
});
