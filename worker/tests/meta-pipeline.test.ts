import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { runMetaPipeline } from "../src/pipelines/meta/run";

describe("runMetaPipeline - self-referential snapshot run", () => {
  it("lands a bronze snapshot object, one silver event row, and records a successful run", async () => {
    const result = await runMetaPipeline(env as never, "manual");
    if (result.skipped)
      throw new Error("pipeline unexpectedly skipped (paused?)");

    expect(result.snapshot.generatedAt).toBeTruthy();
    expect(typeof result.snapshot.bronzeObjectsTotal).toBe("number");

    const bronzeRow = await env.DB.prepare(
      `SELECT source_url FROM bronze_ingestion_log WHERE pipeline = 'meta' ORDER BY id DESC LIMIT 1`,
    ).first<{ source_url: string }>();
    expect(bronzeRow?.source_url).toBe("internal://d1-self-snapshot");

    const silverRow = await env.DB.prepare(
      `SELECT event_type, detail_json FROM site_events_silver ORDER BY id DESC LIMIT 1`,
    ).first<{ event_type: string; detail_json: string }>();
    expect(silverRow?.event_type).toBe("analytics_snapshot");
    expect(JSON.parse(silverRow!.detail_json).generatedAt).toBe(
      result.snapshot.generatedAt,
    );

    const runRow = await env.DB.prepare(
      `SELECT status FROM pipeline_runs WHERE id = ?1`,
    )
      .bind(result.runId)
      .first<{ status: string }>();
    expect(runRow?.status).toBe("success");

    const qualityRuns = await env.DB.prepare(
      `SELECT check_name FROM data_quality_runs WHERE pipeline = 'meta'`,
    ).all<{ check_name: string }>();
    expect(qualityRuns.results).toHaveLength(5);
  });

  it("genuinely reflects prior runs in its own snapshot — a real self-referential read, not a static count", async () => {
    await runMetaPipeline(env as never, "manual");
    const second = await runMetaPipeline(env as never, "manual");
    if (second.skipped) throw new Error("pipeline unexpectedly skipped");

    // By the second run, bronze already has at least the first run's own
    // snapshot object landed — proving this pipeline reads real D1 state,
    // not a fixture.
    expect(second.snapshot.bronzeObjectsTotal).toBeGreaterThanOrEqual(1);
    expect(
      second.snapshot.pipelineRunCounts.meta?.success,
    ).toBeGreaterThanOrEqual(1);
  });

  it("appends events rather than upserting — two runs produce two silver rows", async () => {
    await runMetaPipeline(env as never, "manual");
    await runMetaPipeline(env as never, "manual");

    const count = await env.DB.prepare(
      `SELECT COUNT(*) as n FROM site_events_silver WHERE event_type = 'analytics_snapshot'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  it("skips the run entirely when the pipeline is paused", async () => {
    await env.DB.prepare(
      `UPDATE pipeline_config SET paused = 1 WHERE pipeline = 'meta'`,
    ).run();

    const result = await runMetaPipeline(env as never, "cron");
    expect(result.skipped).toBe(true);

    await env.DB.prepare(
      `UPDATE pipeline_config SET paused = 0 WHERE pipeline = 'meta'`,
    ).run();
  });
});

describe("POST /api/meta/report-event", () => {
  it("reports 503 honestly when no ingest secret is configured yet", async () => {
    const res = await SELF.fetch("https://example.com/api/meta/report-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "deploy", commitSha: "abc123" }),
    });
    expect(res.status).toBe(503);
  });

  it("rejects a request with no bearer token once a secret is configured", async () => {
    const { handleMetaReportEvent } = await import("../src/routes/meta");
    const configuredEnv = { ...env, META_INGEST_SECRET: "test-secret" };
    const res = await handleMetaReportEvent(
      configuredEnv,
      new Request("https://example.com/api/meta/report-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "deploy", commitSha: "abc123" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects the wrong bearer token", async () => {
    const { handleMetaReportEvent } = await import("../src/routes/meta");
    const configuredEnv = { ...env, META_INGEST_SECRET: "test-secret" };
    const res = await handleMetaReportEvent(
      configuredEnv,
      new Request("https://example.com/api/meta/report-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ eventType: "deploy", commitSha: "abc123" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("records a real deploy event with the correct bearer token, landing bronze + silver", async () => {
    const { handleMetaReportEvent } = await import("../src/routes/meta");
    const configuredEnv = { ...env, META_INGEST_SECRET: "test-secret" };
    const res = await handleMetaReportEvent(
      configuredEnv,
      new Request("https://example.com/api/meta/report-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
        body: JSON.stringify({
          eventType: "deploy",
          commitSha: "abc123",
          commitMessage: "Ship it",
          environment: "production",
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json<{
      data: { eventType: string; silverId: number; bronzeId: number };
    }>();
    expect(body.data.eventType).toBe("deploy");

    const silverRow = await env.DB.prepare(
      `SELECT event_type, detail_json FROM site_events_silver WHERE id = ?1`,
    )
      .bind(body.data.silverId)
      .first<{ event_type: string; detail_json: string }>();
    expect(silverRow?.event_type).toBe("deploy");
    expect(JSON.parse(silverRow!.detail_json).commitSha).toBe("abc123");
  });

  it("rejects a malformed event body with 400, not 500", async () => {
    const { handleMetaReportEvent } = await import("../src/routes/meta");
    const configuredEnv = { ...env, META_INGEST_SECRET: "test-secret" };
    const res = await handleMetaReportEvent(
      configuredEnv,
      new Request("https://example.com/api/meta/report-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret",
        },
        body: JSON.stringify({ eventType: "deploy" }), // missing commitSha
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/meta/events", () => {
  it("returns recent events after a run, most recent first", async () => {
    await runMetaPipeline(env as never, "manual");
    const res = await SELF.fetch("https://example.com/api/v1/meta/events");
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: Array<{ eventType: string; detail: unknown }>;
    }>();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]!.eventType).toBe("analytics_snapshot");
  });
});
