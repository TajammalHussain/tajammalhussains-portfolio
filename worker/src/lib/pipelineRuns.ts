import type { Env } from "./env";

export type TriggerType = "cron" | "manual" | "backfill";

export async function startPipelineRun(
  env: Env,
  pipeline: string,
  triggerType: TriggerType,
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO pipeline_runs (pipeline, trigger_type, status) VALUES (?1, ?2, 'running')`,
  )
    .bind(pipeline, triggerType)
    .run();
  return result.meta.last_row_id;
}

export async function finishPipelineRun(
  env: Env,
  runId: number,
  result: {
    status: "success" | "failed";
    rowsBronze?: number;
    rowsSilver?: number;
    rowsGold?: number;
    errorDetail?: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE pipeline_runs
     SET status = ?1, finished_at = datetime('now'), rows_bronze = ?2, rows_silver = ?3,
         rows_gold = ?4, error_detail = ?5
     WHERE id = ?6`,
  )
    .bind(
      result.status,
      result.rowsBronze ?? null,
      result.rowsSilver ?? null,
      result.rowsGold ?? null,
      result.errorDetail ?? null,
      runId,
    )
    .run();
}

export async function isPipelinePaused(env: Env, pipeline: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT paused FROM pipeline_config WHERE pipeline = ?1`)
    .bind(pipeline)
    .first<{ paused: number }>();
  return row?.paused === 1;
}
