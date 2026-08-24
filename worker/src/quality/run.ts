import type { Env } from "../lib/env";
import {
  checkFreshness,
  checkCompleteness,
  checkValidity,
  checkUniqueness,
  checkReferential,
  type QualityCheckResult,
} from "./checks";

/** Persists a batch of check results to data_quality_runs in one D1 batch call. */
async function persistResults(
  env: Env,
  pipeline: string,
  layer: string,
  results: QualityCheckResult[],
): Promise<void> {
  const stmt = env.DB.prepare(
    `INSERT INTO data_quality_runs (pipeline, layer, check_name, status, observed_value, expected_value, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  );
  await env.DB.batch(
    results.map((r) =>
      stmt.bind(pipeline, layer, r.checkName, r.status, r.observedValue, r.expectedValue, r.detail ?? null),
    ),
  );
}

/**
 * Runs the full data-quality suite for the carbon pipeline against whatever
 * is currently in D1, and persists every result — including failures. Called
 * at the end of every pipeline run (see pipelines/carbon/run.ts).
 */
export async function runCarbonQualityChecks(env: Env, silverRowCountThisRun: number, bronzeExpectedCount: number) {
  const config = await env.DB.prepare(
    `SELECT staleness_threshold_minutes FROM pipeline_config WHERE pipeline = 'carbon'`,
  ).first<{ staleness_threshold_minutes: number }>();
  const thresholdMinutes = config?.staleness_threshold_minutes ?? 90;

  const lastIngestRow = await env.DB.prepare(
    `SELECT MAX(fetched_at) as last FROM bronze_ingestion_log WHERE pipeline = 'carbon' AND processed_at IS NOT NULL`,
  ).first<{ last: string | null }>();
  const freshness = checkFreshness(
    lastIngestRow?.last ? new Date(lastIngestRow.last) : null,
    new Date(),
    thresholdMinutes,
  );

  const completeness = checkCompleteness(silverRowCountThisRun, 1, 0);

  const recentRows = await env.DB.prepare(
    `SELECT actual_intensity, forecast_intensity, period_from FROM carbon_readings_silver
     ORDER BY period_from DESC LIMIT 100`,
  ).all<{ actual_intensity: number | null; forecast_intensity: number; period_from: string }>();
  const validity = checkValidity(
    recentRows.results.map((r) => r.actual_intensity),
    { min: 0, max: 1000 }, // gCO2/kWh — 1000 is a very generous upper bound
    { allowNull: true },
  );

  const uniqueness = checkUniqueness(recentRows.results.map((r) => r.period_from));

  const referential = checkReferential(silverRowCountThisRun, bronzeExpectedCount);

  const results = [freshness, completeness, validity, uniqueness, referential];
  await persistResults(env, "carbon", "silver", results);
  return results;
}
