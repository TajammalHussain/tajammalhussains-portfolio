import type { PipelineRunCounts, SiteSnapshot } from "./types";

/**
 * Assembles a SiteSnapshot from already-queried raw counts. Kept pure and
 * separate from the D1 queries that gather those counts (in run.ts) so the
 * shape of a snapshot — what it means to summarize the site's own operational
 * state — is directly unit-testable without any bindings.
 */
export function buildSiteSnapshot(input: {
  generatedAt: Date;
  runRows: Array<{ pipeline: string; status: string }>;
  qualityCheckFailures24h: number;
  totalAuditActions: number;
  bronzeObjectsTotal: number;
}): SiteSnapshot {
  const pipelineRunCounts: Record<string, PipelineRunCounts> = {};
  for (const row of input.runRows) {
    const bucket = (pipelineRunCounts[row.pipeline] ??= {
      success: 0,
      failed: 0,
      running: 0,
    });
    if (row.status === "success") bucket.success++;
    else if (row.status === "failed") bucket.failed++;
    else if (row.status === "running") bucket.running++;
  }

  return {
    generatedAt: input.generatedAt.toISOString(),
    pipelineRunCounts,
    qualityCheckFailures24h: input.qualityCheckFailures24h,
    totalAuditActions: input.totalAuditActions,
    bronzeObjectsTotal: input.bronzeObjectsTotal,
  };
}
