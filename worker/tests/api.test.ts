import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";

describe("GET /api/v1/health", () => {
  it("returns 200 ok when the database is reachable", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });
});

describe("GET /api/v1/carbon/current", () => {
  it("returns 503 when no data has been ingested yet (empty state)", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/carbon/current");
    expect(res.status).toBe(503);
  });

  it("returns the most recent reading once one exists", async () => {
    const insert = await env.DB.prepare(
      `INSERT INTO bronze_ingestion_log (pipeline, r2_key, source_url, fetched_at)
       VALUES ('carbon', 'bronze/carbon/test.json', 'https://example.com', datetime('now'))`,
    ).run();
    const bronzeId = insert.meta.last_row_id;

    await env.DB.prepare(
      `INSERT INTO carbon_readings_silver (period_from, period_to, actual_intensity, forecast_intensity, index_band, source_bronze_id)
       VALUES ('2026-01-01T12:00Z', '2026-01-01T12:30Z', 61, 52, 'low', ?1)`,
    )
      .bind(bronzeId)
      .run();

    const res = await SELF.fetch("https://example.com/api/v1/carbon/current");
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: { actualIntensity: number; indexBand: string };
    }>();
    expect(body.data.actualIntensity).toBe(61);
    expect(body.data.indexBand).toBe("low");
  });
});

describe("GET /api/v1/carbon/history", () => {
  it("returns 400 when 'from' and 'to' are missing", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/carbon/history");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed date", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/v1/carbon/history?from=not-a-date&to=2026-01-02",
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid granularity value", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/v1/carbon/history?from=2026-01-01&to=2026-01-02&granularity=hourly",
    );
    expect(res.status).toBe(400);
  });

  it("returns an empty array (not an error) for a valid range with no data", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/v1/carbon/history?from=2020-01-01&to=2020-01-02&granularity=daily",
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ data: unknown[] }>();
    expect(body.data).toEqual([]);
  });
});

describe("GET /api/v1/housing/regional", () => {
  it("reports 503 honestly when Pipeline 2 has not landed any data yet", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/housing/regional");
    expect(res.status).toBe(503);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("not yet deployed");
  });
});

describe("GET /api/v1/pipelines/status", () => {
  it("lists all three configured pipelines even with no runs yet", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/pipelines/status");
    expect(res.status).toBe(200);
    const body = await res.json<{ data: Array<{ pipeline: string }> }>();
    expect(body.data.map((p) => p.pipeline).sort()).toEqual([
      "carbon",
      "housing",
      "meta",
    ]);
  });
});

describe("unknown routes and methods", () => {
  it("returns 404 for an unrecognised API path", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-API path", async () => {
    const res = await SELF.fetch("https://example.com/some-random-path");
    expect(res.status).toBe(404);
  });

  it("rejects non-GET methods with 405 (every current route is read-only)", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/health", {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });

  it("responds to an OPTIONS preflight with CORS headers", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/health", {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("rate limiting", () => {
  it("returns 429 once a single IP exceeds the per-minute limit", async () => {
    const headers = { "CF-Connecting-IP": "203.0.113.5" };
    let lastStatus = 200;
    // Limit is 60/min — 65 requests from the same IP should trip it.
    for (let i = 0; i < 65; i++) {
      const res = await SELF.fetch("https://example.com/api/v1/health", {
        headers,
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("does not rate-limit a different IP that hasn't made requests yet", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/health", {
      headers: { "CF-Connecting-IP": "198.51.100.9" },
    });
    expect(res.status).toBe(200);
  });
});
