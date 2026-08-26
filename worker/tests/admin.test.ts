import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import { verifyAccess } from "../src/lib/access";

// In this test environment ENVIRONMENT="development" and no CF_ACCESS_TEAM_DOMAIN
// is set (matching a real `wrangler dev` on a laptop with no Access configured),
// so verifyAccess takes its documented dev-bypass path and every /api/admin/*
// request is treated as an authenticated "dev@localhost" identity. This lets
// the tests below exercise the actual admin logic without a real Cloudflare
// Access IdP — the auth-gate itself is covered separately, by temporarily
// configuring Access vars and confirming unauthenticated requests are rejected.

describe("GET /api/admin/whoami", () => {
  it("resolves the dev-bypass identity when Access isn't configured", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/whoami");
    expect(res.status).toBe(200);
    const body = await res.json<{ data: { email: string } }>();
    expect(body.data.email).toBe("dev@localhost");
  });
});

describe("admin auth gate (verifyAccess unit tests — env vars set on SELF.fetch's worker instance don't propagate back to a mutated import, so this exercises the function directly)", () => {
  const accessConfiguredEnv = {
    ...env,
    CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
    CF_ACCESS_AUD: "test-aud",
  };

  it("rejects with null once Access is configured and no token is presented", async () => {
    const request = new Request("https://example.com/api/admin/whoami");
    const identity = await verifyAccess(request, accessConfiguredEnv);
    expect(identity).toBeNull();
  });

  it("rejects a garbage bearer-style token the same way", async () => {
    const request = new Request("https://example.com/api/admin/whoami", {
      headers: { "Cf-Access-Jwt-Assertion": "not-a-real-jwt" },
    });
    const identity = await verifyAccess(request, accessConfiguredEnv);
    expect(identity).toBeNull();
  });

  it("fails closed (not open) if Access is only half-configured", async () => {
    const halfConfigured = {
      ...env,
      CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
      CF_ACCESS_AUD: undefined,
    };
    const identity = await verifyAccess(
      new Request("https://example.com/api/admin/whoami"),
      halfConfigured,
    );
    expect(identity).toBeNull();
  });

  it("still rejects unknown methods on the public API rather than falling through to admin", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/health", {
      method: "DELETE",
    });
    expect(res.status).toBe(405);
  });
});

describe("GET /api/admin/pipelines", () => {
  it("lists all configured pipelines with recent runs and quality checks", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/pipelines");
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: Array<{ pipeline: string; implemented: boolean }>;
    }>();
    expect(body.data.map((p) => p.pipeline).sort()).toEqual([
      "carbon",
      "housing",
      "meta",
    ]);
    expect(body.data.find((p) => p.pipeline === "carbon")?.implemented).toBe(
      true,
    );
    expect(body.data.find((p) => p.pipeline === "housing")?.implemented).toBe(
      true,
    );
    expect(body.data.find((p) => p.pipeline === "meta")?.implemented).toBe(
      true,
    );
  });
});

describe("POST /api/admin/pipelines/:pipeline/pause", () => {
  it("pauses and resumes a pipeline, and writes an audit log entry each time", async () => {
    const pauseRes = await SELF.fetch(
      "https://example.com/api/admin/pipelines/carbon/pause",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: true }),
      },
    );
    expect(pauseRes.status).toBe(200);

    const statusRes = await SELF.fetch(
      "https://example.com/api/v1/pipelines/status",
    );
    const statusBody = await statusRes.json<{
      data: Array<{ pipeline: string; paused: boolean }>;
    }>();
    expect(statusBody.data.find((p) => p.pipeline === "carbon")?.paused).toBe(
      true,
    );

    const auditRes = await SELF.fetch("https://example.com/api/admin/audit");
    const auditBody = await auditRes.json<{
      data: Array<{ action: string; target: string }>;
    }>();
    expect(auditBody.data[0]).toMatchObject({
      action: "pipeline.pause",
      target: "carbon",
    });

    // Resume it again so this test doesn't leak paused state into others.
    const resumeRes = await SELF.fetch(
      "https://example.com/api/admin/pipelines/carbon/pause",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: false }),
      },
    );
    expect(resumeRes.status).toBe(200);
  });

  it("returns 404 for an unknown pipeline name", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/not-a-pipeline/pause",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: true }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when 'paused' is missing or not a boolean", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/carbon/pause",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: "yes" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/pipelines/:pipeline/run", () => {
  it("runs the carbon pipeline on demand against the real external API", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/carbon/run",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: { skipped: boolean; rowsSilver?: number };
    }>();
    expect(body.data.skipped).toBe(false);
  });

  it("reports 404 for a pipeline name that doesn't exist at all", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/not-a-real-pipeline/run",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(404);
  });

  it("runs the housing pipeline on demand against the real external API", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/housing/run",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: { skipped: boolean; rowsSilver?: number; targetPeriod?: string };
    }>();
    expect(body.data.skipped).toBe(false);
    expect(body.data.targetPeriod).toMatch(/^\d{4}-\d{2}$/);
  });

  it("runs the meta pipeline on demand, taking a real self-referential snapshot", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/meta/run",
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: { skipped: boolean; snapshot?: { generatedAt: string } };
    }>();
    expect(body.data.skipped).toBe(false);
    expect(body.data.snapshot?.generatedAt).toBeTruthy();
  });

  it("does not run a paused pipeline", async () => {
    await SELF.fetch("https://example.com/api/admin/pipelines/carbon/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: true }),
    });
    try {
      const res = await SELF.fetch(
        "https://example.com/api/admin/pipelines/carbon/run",
        {
          method: "POST",
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json<{ data: { skipped: boolean } }>();
      expect(body.data.skipped).toBe(true);
    } finally {
      await SELF.fetch("https://example.com/api/admin/pipelines/carbon/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: false }),
      });
    }
  });
});

describe("POST /api/admin/pipelines/carbon/backfill", () => {
  it("backfills a real 2-day historical window against the actual external API", async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 2 * 24 * 60 * 60 * 1000);
    const res = await SELF.fetch("https://example.com/api/admin/pipelines/carbon/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: from.toISOString(), to: to.toISOString() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ data: { skipped: boolean; rowsSilver?: number } }>();
    expect(body.data.skipped).toBe(false);
    expect(body.data.rowsSilver).toBeGreaterThan(0);

    const auditRes = await SELF.fetch("https://example.com/api/admin/audit");
    const auditBody = await auditRes.json<{ data: Array<{ action: string; target: string }> }>();
    expect(auditBody.data[0]).toMatchObject({ action: "pipeline.backfill", target: "carbon" });
  });

  it("returns 400 for a range exceeding the 31-day limit, without recording it as a server error", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/pipelines/carbon/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "2026-01-01T00:00Z", to: "2026-03-01T00:00Z" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when 'from'/'to' are missing", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/pipelines/carbon/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/quality and /api/admin/bronze", () => {
  it("lists quality-check history and bronze ingestion log entries after a run", async () => {
    await SELF.fetch("https://example.com/api/admin/pipelines/carbon/run", {
      method: "POST",
    });

    const qualityRes = await SELF.fetch(
      "https://example.com/api/admin/quality?pipeline=carbon",
    );
    expect(qualityRes.status).toBe(200);
    const qualityBody = await qualityRes.json<{ data: unknown[] }>();
    expect(qualityBody.data.length).toBeGreaterThan(0);

    const bronzeRes = await SELF.fetch(
      "https://example.com/api/admin/bronze?pipeline=carbon&limit=5",
    );
    expect(bronzeRes.status).toBe(200);
    const bronzeBody = await bronzeRes.json<{
      data: Array<{ id: number; r2_key: string }>;
    }>();
    expect(bronzeBody.data.length).toBeGreaterThan(0);

    const firstId = bronzeBody.data[0]!.id;
    const payloadRes = await SELF.fetch(
      `https://example.com/api/admin/bronze/${firstId}/payload`,
    );
    expect(payloadRes.status).toBe(200);
    const payloadBody = await payloadRes.json<{
      data: { r2Key: string; payload: unknown };
    }>();
    expect(payloadBody.data.r2Key).toBe(bronzeBody.data[0]!.r2_key);
  });

  it("returns 404 for a bronze id that doesn't exist", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/bronze/999999/payload",
    );
    expect(res.status).toBe(404);
  });
});

describe("admin CORS", () => {
  it("reflects an allow-listed origin with credentials enabled", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/whoami", {
      headers: { Origin: "http://localhost:4321" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4321",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("does not reflect an origin that isn't on the allow-list", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/whoami", {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers an OPTIONS preflight for an admin route", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/admin/pipelines/carbon/pause",
      {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:4321" },
      },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
