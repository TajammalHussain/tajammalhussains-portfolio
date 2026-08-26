// Pipeline 3 — the site meta-pipeline. Unlike Pipelines 1 and 2, its "source"
// isn't a third-party API: it's this Worker's own D1 state (an
// "analytics_snapshot" event, taken daily) and — once CI is wired up (see
// task tracker) — real deploy/build events posted by the GitHub Actions
// workflow after an actual deployment. No event here is ever fabricated:
// a day with no deploy has no deploy event, not a zeroed-out placeholder one.
export type SiteEventType = "deploy" | "build" | "analytics_snapshot";

export interface PipelineRunCounts {
  success: number;
  failed: number;
  running: number;
}

export interface SiteSnapshot {
  generatedAt: string;
  pipelineRunCounts: Record<string, PipelineRunCounts>;
  qualityCheckFailures24h: number;
  totalAuditActions: number;
  bronzeObjectsTotal: number;
}

export interface DeployEventDetail {
  commitSha: string;
  commitMessage?: string;
  deployedBy?: string;
  environment?: string;
}

export interface BuildEventDetail {
  commitSha: string;
  durationSeconds?: number;
  status: "success" | "failed";
}
