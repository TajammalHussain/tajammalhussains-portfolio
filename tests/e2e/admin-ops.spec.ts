import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The ops dashboard's real backend is Cloudflare Access + Worker admin
// routes, neither of which is part of Playwright's webServer (which only
// starts the static Astro preview). Every test here mocks /api/admin/* so
// the dashboard's own rendering and interaction logic is exercised
// deterministically, independent of whether a real Access session exists.

const MOCK_PIPELINES = [
  {
    pipeline: "carbon",
    paused: false,
    stalenessThresholdMinutes: 90,
    minExpectedRowsPerRun: 1,
    visibleOnLivePage: true,
    implemented: true,
    recentRuns: [
      {
        id: 1,
        trigger_type: "cron",
        status: "success",
        started_at: "2026-01-01 12:00:00",
        finished_at: "2026-01-01 12:00:05",
        rows_bronze: 2,
        rows_silver: 10,
        rows_gold: 10,
        error_detail: null,
      },
    ],
    latestQualityChecks: [],
  },
  {
    pipeline: "housing",
    paused: false,
    stalenessThresholdMinutes: 44640,
    minExpectedRowsPerRun: 1,
    visibleOnLivePage: true,
    implemented: false,
    recentRuns: [],
    latestQualityChecks: [],
  },
];

async function mockAdminApi(page: import("@playwright/test").Page) {
  await page.route("**/api/admin/whoami", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { email: "dev@localhost" } }),
    }),
  );
  await page.route("**/api/admin/pipelines", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: MOCK_PIPELINES }),
    }),
  );
  await page.route("**/api/admin/quality**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/admin/bronze**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
  await page.route("**/api/admin/audit**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );
}

test.describe("Admin ops dashboard — happy path", () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page);
  });

  test("shows the signed-in identity and both pipelines once the mocked API responds", async ({
    page,
  }) => {
    await page.goto("/admin/ops");
    const dashboard = page.locator("#ops-dashboard");
    await expect(dashboard.locator("#ops-content")).toBeVisible({
      timeout: 10_000,
    });
    await expect(dashboard.locator("#ops-whoami")).toHaveText("dev@localhost");
    await expect(dashboard.locator("#ops-pipelines")).toContainText(
      "UK Grid Carbon Intensity",
    );
    await expect(dashboard.locator("#ops-pipelines")).toContainText(
      "UK House Price Data",
    );
  });

  test("disables Run now for a pipeline with no implementation yet", async ({
    page,
  }) => {
    await page.goto("/admin/ops");
    await expect(page.locator("#ops-content")).toBeVisible({ timeout: 10_000 });
    const housingCard = page.locator('[data-pipeline="housing"]');
    await expect(housingCard.locator(".ops-run-btn")).toBeDisabled();
    const carbonCard = page.locator('[data-pipeline="carbon"]');
    await expect(carbonCard.locator(".ops-run-btn")).toBeEnabled();
  });

  test("submitting the carbon backfill form posts the chosen range as ISO timestamps", async ({
    page,
  }) => {
    let backfillRequestBody: unknown = null;
    await page.route("**/api/admin/pipelines/carbon/backfill", (route) => {
      backfillRequestBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { skipped: false, rowsSilver: 970, rowsGold: 30 } }),
      });
    });

    await page.goto("/admin/ops");
    await expect(page.locator("#ops-content")).toBeVisible({ timeout: 10_000 });
    const carbonCard = page.locator('[data-pipeline="carbon"]');
    await carbonCard.locator('input[name="from"]').fill("2026-08-23T00:00");
    await carbonCard.locator('input[name="to"]').fill("2026-08-25T00:00");
    await carbonCard.getByRole("button", { name: "Backfill" }).click();

    await expect(carbonCard.locator(".ops-backfill-result")).toContainText(
      "Done — 970 silver rows, 30 gold rows.",
      { timeout: 10_000 },
    );
    // Computed the same way the widget does (local-time input -> ISO string)
    // rather than a hardcoded UTC literal, so this isn't timezone-dependent.
    expect(backfillRequestBody).toEqual({
      from: new Date("2026-08-23T00:00").toISOString(),
      to: new Date("2026-08-25T00:00").toISOString(),
    });
  });

  test("housing card has no backfill form — only carbon's source API supports date ranges", async ({
    page,
  }) => {
    await page.goto("/admin/ops");
    await expect(page.locator("#ops-content")).toBeVisible({ timeout: 10_000 });
    const housingCard = page.locator('[data-pipeline="housing"]');
    await expect(housingCard.locator(".ops-backfill-form")).toHaveCount(0);
  });

  test("pausing a pipeline calls the pause endpoint and reflects the new state", async ({
    page,
  }) => {
    let pauseRequestBody: unknown = null;
    let carbonPaused = false;

    // A single stateful route for the whole test (rather than swapping routes
    // mid-test, which races against the click's own re-fetch) — the list
    // endpoint always reflects whatever the pause endpoint last set.
    await page.unroute("**/api/admin/pipelines");
    await page.route("**/api/admin/pipelines", (route) => {
      const data = MOCK_PIPELINES.map((p) =>
        p.pipeline === "carbon" ? { ...p, paused: carbonPaused } : p,
      );
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    });
    await page.route("**/api/admin/pipelines/carbon/pause", (route) => {
      pauseRequestBody = route.request().postDataJSON();
      carbonPaused = Boolean((pauseRequestBody as { paused: boolean }).paused);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { pipeline: "carbon", paused: carbonPaused },
        }),
      });
    });

    await page.goto("/admin/ops");
    await expect(page.locator("#ops-content")).toBeVisible({ timeout: 10_000 });
    const carbonCard = page.locator('[data-pipeline="carbon"]');
    await carbonCard.getByRole("button", { name: "Pause" }).click();
    await expect(
      carbonCard.getByRole("button", { name: "Resume" }),
    ).toBeVisible({ timeout: 10_000 });
    expect(pauseRequestBody).toEqual({ paused: true });
  });

  test("has zero axe-core violations once loaded", async ({ page }) => {
    await page.goto("/admin/ops");
    await expect(page.locator("#ops-content")).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
});

test.describe("Admin ops dashboard — honest failure when unauthenticated", () => {
  test("shows an explicit error, not a blank or fabricated dashboard, when Access rejects the session", async ({
    page,
  }) => {
    await page.route("**/api/admin/**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthorized" }),
      }),
    );
    await page.goto("/admin/ops");
    const dashboard = page.locator("#ops-dashboard");
    await expect(dashboard.locator("#ops-error")).toBeVisible({
      timeout: 10_000,
    });
    await expect(dashboard.locator("#ops-error")).toContainText(
      /unauthorized/i,
    );
    await expect(dashboard.locator("#ops-content")).toBeHidden();
  });
});
