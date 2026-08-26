import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { runHousingPipeline } from "../src/pipelines/housing/run";
import { HOUSING_REGIONS } from "../src/pipelines/housing/types";
import ukhpiRegionFixture from "../../tests/fixtures/housing-ukhpi-region.json";
import ukhpiMissingFixture from "../../tests/fixtures/housing-ukhpi-missing.json";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

const ORIGIN = "https://landregistry.data.gov.uk";

function monthsAgo(back: number): string {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function regionFixtureFor(regionSlug: string, period: string) {
  // Real fixture is for london/2024-06 — reuse its shape but stamp in the
  // region+period actually being requested, since the transform reads
  // `refMonth` from the payload itself, not from the URL.
  return {
    ...ukhpiRegionFixture,
    result: {
      ...ukhpiRegionFixture.result,
      primaryTopic: {
        ...ukhpiRegionFixture.result.primaryTopic,
        refMonth: period,
      },
    },
  };
}

/** Mocks the probe walk-back finding data immediately at `monthsBack`, then every other region for that same month. */
function mockFullRun(monthsBack: number) {
  const targetPeriod = monthsAgo(monthsBack);

  for (let back = 0; back < monthsBack; back++) {
    fetchMock
      .get(ORIGIN)
      .intercept({
        path: `/data/ukhpi/region/united-kingdom/month/${monthsAgo(back)}.json`,
      })
      .reply(200, JSON.stringify(ukhpiMissingFixture), {
        headers: { "content-type": "application/json" },
      });
  }

  fetchMock
    .get(ORIGIN)
    .intercept({
      path: `/data/ukhpi/region/united-kingdom/month/${targetPeriod}.json`,
    })
    .reply(
      200,
      JSON.stringify(regionFixtureFor("united-kingdom", targetPeriod)),
      {
        headers: { "content-type": "application/json" },
      },
    );

  for (const region of HOUSING_REGIONS.filter(
    (r) => r.slug !== "united-kingdom",
  )) {
    fetchMock
      .get(ORIGIN)
      .intercept({
        path: `/data/ukhpi/region/${region.slug}/month/${targetPeriod}.json`,
      })
      .reply(200, JSON.stringify(regionFixtureFor(region.slug, targetPeriod)), {
        headers: { "content-type": "application/json" },
      });
  }

  return targetPeriod;
}

describe("runHousingPipeline - full bronze -> silver -> gold run", () => {
  it("walks backward past unpublished months, lands every region, and records a successful run", async () => {
    const targetPeriod = mockFullRun(2); // simulates the real ~2-month publication lag

    const result = await runHousingPipeline(env as never, "manual");
    if (result.skipped)
      throw new Error("pipeline unexpectedly skipped (paused?)");

    expect(result.targetPeriod).toBe(targetPeriod);
    // 7 property types per region (per the fixture) x 14 regions
    expect(result.rowsSilver).toBe(7 * HOUSING_REGIONS.length);
    expect(result.rowsGold).toBe(HOUSING_REGIONS.length);

    // 2 missed united-kingdom probes + 1 hit + 13 other regions
    const bronzeCount = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM bronze_ingestion_log WHERE pipeline = 'housing'`,
    ).first<{ n: number }>();
    expect(bronzeCount?.n).toBe(2 + 1 + (HOUSING_REGIONS.length - 1));

    const goldRow = await env.DB.prepare(
      `SELECT average_price, mom_change_pct, yoy_change_pct FROM housing_regional_gold WHERE region = 'london' AND period = ?1`,
    )
      .bind(targetPeriod)
      .first<{
        average_price: number;
        mom_change_pct: number | null;
        yoy_change_pct: number | null;
      }>();
    expect(goldRow?.average_price).toBe(556853);
    // No prior-month/prior-year silver rows exist yet on a first run.
    expect(goldRow?.mom_change_pct).toBeNull();
    expect(goldRow?.yoy_change_pct).toBeNull();

    const qualityRuns = await env.DB.prepare(
      `SELECT check_name, status FROM data_quality_runs WHERE pipeline = 'housing'`,
    ).all<{ check_name: string; status: string }>();
    expect(qualityRuns.results).toHaveLength(5);
  });

  it("is idempotent: re-running the same month upserts rather than duplicating silver rows", async () => {
    mockFullRun(2);
    await runHousingPipeline(env as never, "manual");

    mockFullRun(2);
    await runHousingPipeline(env as never, "manual");

    const rowCount = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM housing_readings_silver`,
    ).first<{
      n: number;
    }>();
    expect(rowCount?.n).toBe(7 * HOUSING_REGIONS.length);
  });

  it("computes a real mom change once a second consecutive month lands", async () => {
    mockFullRun(3); // first run: e.g. month M-3
    await runHousingPipeline(env as never, "manual");

    mockFullRun(2); // second run: month M-2, one month after the first
    const result = await runHousingPipeline(env as never, "manual");
    if (result.skipped) throw new Error("pipeline unexpectedly skipped");

    const goldRow = await env.DB.prepare(
      `SELECT mom_change_pct FROM housing_regional_gold WHERE region = 'london' AND period = ?1`,
    )
      .bind(result.targetPeriod)
      .first<{ mom_change_pct: number | null }>();
    // Both runs use the same fixture average price (556853), so a genuine,
    // correctly-computed month-on-month change here is exactly 0%, not null.
    expect(goldRow?.mom_change_pct).toBe(0);
  });

  it("records a failed run and rethrows when no published month is found within the lookback window", async () => {
    for (let back = 0; back <= 6; back++) {
      fetchMock
        .get(ORIGIN)
        .intercept({
          path: `/data/ukhpi/region/united-kingdom/month/${monthsAgo(back)}.json`,
        })
        .reply(200, JSON.stringify(ukhpiMissingFixture), {
          headers: { "content-type": "application/json" },
        });
    }

    await expect(runHousingPipeline(env as never, "manual")).rejects.toThrow(
      /no published UK HPI month/,
    );

    const failedRun = await env.DB.prepare(
      `SELECT status, error_detail FROM pipeline_runs WHERE pipeline = 'housing' ORDER BY started_at DESC LIMIT 1`,
    ).first<{ status: string; error_detail: string }>();
    expect(failedRun?.status).toBe("failed");
    expect(failedRun?.error_detail).toContain("no published UK HPI month");
  });

  it("skips the run entirely when the pipeline is paused", async () => {
    await env.DB.prepare(
      `UPDATE pipeline_config SET paused = 1 WHERE pipeline = 'housing'`,
    ).run();

    const result = await runHousingPipeline(env as never, "cron");
    expect(result.skipped).toBe(true);

    await env.DB.prepare(
      `UPDATE pipeline_config SET paused = 0 WHERE pipeline = 'housing'`,
    ).run();
  });
});
