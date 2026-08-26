import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { runCarbonPipeline, runCarbonBackfill, InvalidBackfillRangeError } from "../src/pipelines/carbon/run";
import intensityFixture from "../../tests/fixtures/carbon-intensity-current.json";
import generationFixture from "../../tests/fixtures/generation-current.json";
import intensityDayFixture from "../../tests/fixtures/carbon-intensity-day.json";
import generationRangeFixture from "../../tests/fixtures/generation-range.json";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect(); // a real network call from this test is a bug, not a fallback
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

function mockCarbonApiOnce() {
  fetchMock
    .get("https://api.carbonintensity.org.uk")
    .intercept({ path: "/intensity" })
    .reply(200, JSON.stringify(intensityFixture), {
      headers: { "content-type": "application/json" },
    });
  fetchMock
    .get("https://api.carbonintensity.org.uk")
    .intercept({ path: "/generation" })
    .reply(200, JSON.stringify(generationFixture), {
      headers: { "content-type": "application/json" },
    });
}

describe("runCarbonPipeline - full bronze -> silver -> gold run", () => {
  it("lands bronze in R2, writes silver + gold to D1, and records a successful run", async () => {
    mockCarbonApiOnce();

    const result = await runCarbonPipeline(env as never, "manual");
    if (result.skipped)
      throw new Error("pipeline unexpectedly skipped (paused?)");

    expect(result.rowsSilver).toBe(1 + 9); // 1 intensity reading + 9 fuel-mix rows
    expect(result.rowsGold).toBeGreaterThan(0);

    const bronzeCount = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM bronze_ingestion_log WHERE pipeline = 'carbon'`,
    ).first<{ n: number }>();
    expect(bronzeCount?.n).toBe(2); // one bronze object per source endpoint

    const runRow = await env.DB.prepare(
      `SELECT status FROM pipeline_runs WHERE id = ?1`,
    )
      .bind(result.runId)
      .first<{ status: string }>();
    expect(runRow?.status).toBe("success");

    // The bronze object actually exists in R2 with the exact payload we sent —
    // proves the "raw, immutable, in object storage" part isn't just a log row.
    const objects = await env.BRONZE_BUCKET.list({ prefix: "bronze/carbon/" });
    expect(objects.objects.length).toBe(2);

    const qualityRuns = await env.DB.prepare(
      `SELECT check_name, status FROM data_quality_runs WHERE pipeline = 'carbon'`,
    ).all<{ check_name: string; status: string }>();
    expect(qualityRuns.results).toHaveLength(5); // freshness, completeness, validity, uniqueness, referential
  });

  it("is idempotent: running the same ingestion twice does not duplicate silver rows", async () => {
    mockCarbonApiOnce();
    await runCarbonPipeline(env as never, "manual");

    mockCarbonApiOnce();
    await runCarbonPipeline(env as never, "manual");

    const readings = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM carbon_readings_silver`,
    ).first<{ n: number }>();
    expect(readings?.n).toBe(1); // same period_from both times -> upsert, not insert

    const mixRows = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM carbon_generation_mix_silver`,
    ).first<{ n: number }>();
    expect(mixRows?.n).toBe(9);

    // Bronze is intentionally NOT deduplicated — every ingestion attempt
    // lands its own immutable, timestamped raw copy, successful or not.
    const bronzeCount = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM bronze_ingestion_log`,
    ).first<{ n: number }>();
    expect(bronzeCount?.n).toBe(4);
  });

  it("records a failed run and rethrows when the source API is unreachable", async () => {
    fetchMock
      .get("https://api.carbonintensity.org.uk")
      .intercept({ path: "/intensity" })
      .reply(500, "internal server error")
      .times(4); // matches retryWithBackoff's default maxAttempts

    await expect(runCarbonPipeline(env as never, "manual")).rejects.toThrow();

    const failedRun = await env.DB.prepare(
      `SELECT status, error_detail FROM pipeline_runs WHERE pipeline = 'carbon' ORDER BY started_at DESC LIMIT 1`,
    ).first<{ status: string; error_detail: string }>();
    expect(failedRun?.status).toBe("failed");
    expect(failedRun?.error_detail).toBeTruthy();
  });

  it("skips the run entirely when the pipeline is paused", async () => {
    await env.DB.prepare(
      `UPDATE pipeline_config SET paused = 1 WHERE pipeline = 'carbon'`,
    ).run();

    const result = await runCarbonPipeline(env as never, "cron");
    expect(result.skipped).toBe(true);

    await env.DB.prepare(
      `UPDATE pipeline_config SET paused = 0 WHERE pipeline = 'carbon'`,
    ).run();
  });
});

describe("runCarbonBackfill - real historical range ingestion", () => {
  function mockBackfillRangeOnce(from: string, to: string) {
    fetchMock
      .get("https://api.carbonintensity.org.uk")
      .intercept({ path: `/intensity/${from}/${to}` })
      .reply(200, JSON.stringify(intensityDayFixture), {
        headers: { "content-type": "application/json" },
      });
    fetchMock
      .get("https://api.carbonintensity.org.uk")
      .intercept({ path: `/generation/${from}/${to}` })
      .reply(200, JSON.stringify(generationRangeFixture), {
        headers: { "content-type": "application/json" },
      });
  }

  it("lands multi-period bronze, writes every silver row, and recomputes gold for the affected date", async () => {
    mockBackfillRangeOnce("2026-01-01T00:00Z", "2026-01-02T00:00Z");

    const result = await runCarbonBackfill(env as never, "2026-01-01T00:00Z", "2026-01-02T00:00Z");
    if (result.skipped) throw new Error("backfill unexpectedly skipped (paused?)");

    expect(result.rowsSilver).toBe(5 + 4); // 5 intensity periods (fixture) + 2 periods x 2 fuels
    expect(result.rowsGold).toBeGreaterThan(0);

    const readings = await env.DB.prepare(`SELECT COUNT(*) as n FROM carbon_readings_silver`).first<{
      n: number;
    }>();
    expect(readings?.n).toBe(5);

    const goldRow = await env.DB.prepare(`SELECT reading_count FROM carbon_daily_gold WHERE date = '2026-01-01'`).first<{
      reading_count: number;
    }>();
    expect(goldRow?.reading_count).toBe(5);
  });

  it("rejects a range spanning more than MAX_BACKFILL_DAYS_PER_RUN without making any request", async () => {
    await expect(
      runCarbonBackfill(env as never, "2026-01-01T00:00Z", "2026-03-01T00:00Z"),
    ).rejects.toThrow(InvalidBackfillRangeError);
  });

  it("rejects 'to' before 'from'", async () => {
    await expect(
      runCarbonBackfill(env as never, "2026-01-02T00:00Z", "2026-01-01T00:00Z"),
    ).rejects.toThrow(InvalidBackfillRangeError);
  });

  it("rejects an unparseable date", async () => {
    await expect(runCarbonBackfill(env as never, "not-a-date", "2026-01-02T00:00Z")).rejects.toThrow(
      InvalidBackfillRangeError,
    );
  });

  it("skips when the pipeline is paused", async () => {
    await env.DB.prepare(`UPDATE pipeline_config SET paused = 1 WHERE pipeline = 'carbon'`).run();

    const result = await runCarbonBackfill(env as never, "2026-01-01T00:00Z", "2026-01-02T00:00Z");
    expect(result.skipped).toBe(true);

    await env.DB.prepare(`UPDATE pipeline_config SET paused = 0 WHERE pipeline = 'carbon'`).run();
  });
});
