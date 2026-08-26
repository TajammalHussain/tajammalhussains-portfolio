import { describe, it, expect } from "vitest";
import { buildSiteSnapshot } from "@worker/pipelines/meta/aggregate";

describe("buildSiteSnapshot", () => {
  it("tallies run counts per pipeline by status", () => {
    const snapshot = buildSiteSnapshot({
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      runRows: [
        { pipeline: "carbon", status: "success" },
        { pipeline: "carbon", status: "success" },
        { pipeline: "carbon", status: "failed" },
        { pipeline: "housing", status: "running" },
      ],
      qualityCheckFailures24h: 0,
      totalAuditActions: 0,
      bronzeObjectsTotal: 0,
    });

    expect(snapshot.pipelineRunCounts.carbon).toEqual({
      success: 2,
      failed: 1,
      running: 0,
    });
    expect(snapshot.pipelineRunCounts.housing).toEqual({
      success: 0,
      failed: 0,
      running: 1,
    });
    expect(snapshot.pipelineRunCounts.meta).toBeUndefined();
  });

  it("carries through the other counts and an ISO timestamp unchanged", () => {
    const snapshot = buildSiteSnapshot({
      generatedAt: new Date("2026-01-01T12:30:00Z"),
      runRows: [],
      qualityCheckFailures24h: 3,
      totalAuditActions: 12,
      bronzeObjectsTotal: 45,
    });

    expect(snapshot.generatedAt).toBe("2026-01-01T12:30:00.000Z");
    expect(snapshot.qualityCheckFailures24h).toBe(3);
    expect(snapshot.totalAuditActions).toBe(12);
    expect(snapshot.bronzeObjectsTotal).toBe(45);
    expect(snapshot.pipelineRunCounts).toEqual({});
  });
});
