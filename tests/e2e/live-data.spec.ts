import { test, expect } from "@playwright/test";

// This IS the "deliberate failure-path" test the spec asks for. The API
// Worker may or may not happen to be running locally when these tests
// execute (it isn't part of Playwright's webServer, which only starts the
// static Astro preview) — rather than depend on that incidental state,
// every test in this file explicitly blocks the API origin, so the failure
// path is exercised deterministically in any environment, including CI.
test.describe("Live data — graceful degradation when the API is unreachable", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/**", (route) => route.abort("connectionrefused"));
  });

  test("homepage carbon widget shows an explicit error state, not stale/fake data", async ({
    page,
  }) => {
    await page.goto("/");
    const widget = page.locator("#carbon-live-widget");
    await expect(widget.locator("#carbon-error")).toBeVisible({ timeout: 10_000 });
    await expect(widget.locator("#carbon-error")).toContainText(/unavailable/i);
    // The "loading" state must resolve to the error state, never hang, and
    // the "content" (numbers) block must stay hidden — no fabricated data.
    await expect(widget.locator("#carbon-loading")).toBeHidden();
    await expect(widget.locator("#carbon-content")).toBeHidden();
  });

  test("/live/carbon detail page shows the same honest error state", async ({ page }) => {
    await page.goto("/live/carbon");
    const widget = page.locator("#carbon-live-widget");
    await expect(widget.locator("#carbon-error")).toBeVisible({ timeout: 10_000 });
  });

  test("/status shows an honest error rather than fabricated pipeline health", async ({
    page,
  }) => {
    await page.goto("/status");
    const widget = page.locator("#status-widget");
    await expect(widget.locator("#status-error")).toBeVisible({ timeout: 10_000 });
    await expect(widget.locator("#status-content")).toBeHidden();
  });

  test("architecture diagram and static content still render even though live data can't load", async ({
    page,
  }) => {
    await page.goto("/live/carbon");
    await expect(page.getByRole("heading", { name: "Architecture" })).toBeVisible();
    const wrapper = page.locator(".mermaid-wrapper");
    await wrapper.scrollIntoViewIfNeeded();
    await expect(wrapper.locator("svg")).toBeVisible({ timeout: 20_000 });
  });
});

// The mirror-image happy path — mocks a successful API response (rather than
// depending on a real worker happening to be running) to prove the widget
// renders real numbers correctly when data IS available.
test.describe("Live data — renders real numbers when the API is available", () => {
  test("homepage carbon widget shows the mocked current reading and index band", async ({
    page,
  }) => {
    await page.route("**/api/v1/carbon/current", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            periodFrom: new Date(Date.now() - 5 * 60_000).toISOString(),
            periodTo: new Date(Date.now() + 25 * 60_000).toISOString(),
            actualIntensity: 61,
            forecastIntensity: 52,
            indexBand: "low",
            generationMix: [{ fuel_type: "wind", percentage: 26.6 }],
          },
        }),
      }),
    );
    await page.route("**/api/v1/carbon/history**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
    );
    await page.route("**/api/v1/carbon/mix", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null }) }),
    );

    await page.goto("/");
    const widget = page.locator("#carbon-live-widget");
    await expect(widget.locator("#carbon-content")).toBeVisible({ timeout: 10_000 });
    await expect(widget.locator("#carbon-current-value")).toContainText("61");
    await expect(widget.locator("#carbon-index-band")).toContainText("low");
  });
});
