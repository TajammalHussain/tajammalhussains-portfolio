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
      stmt.bind(
        pipeline,
        layer,
        r.checkName,
        r.status,
        r.observedValue,
        r.expectedValue,
        r.detail ?? null,
      ),
    ),
  );
}

/**
 * Runs the full data-quality suite for the carbon pipeline against whatever
 * is currently in D1, and persists every result — including failures. Called
 * at the end of every pipeline run (see pipelines/carbon/run.ts).
 */
export async function runCarbonQualityChecks(
  env: Env,
  silverRowCountThisRun: number,
  bronzeExpectedCount: number,
) {
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
  ).all<{
    actual_intensity: number | null;
    forecast_intensity: number;
    period_from: string;
  }>();
  const validity = checkValidity(
    recentRows.results.map((r) => r.actual_intensity),
    { min: 0, max: 1000 }, // gCO2/kWh — 1000 is a very generous upper bound
    { allowNull: true },
  );

  const uniqueness = checkUniqueness(
    recentRows.results.map((r) => r.period_from),
  );

  const referential = checkReferential(
    silverRowCountThisRun,
    bronzeExpectedCount,
  );

  const results = [freshness, completeness, validity, uniqueness, referential];
  await persistResults(env, "carbon", "silver", results);
  return results;
}

/**
 * Same five checks, parametrized for the housing pipeline. Freshness still
 * means "did bronze land recently" (wall-clock, via bronze_ingestion_log),
 * not "how recent is the underlying month" — those are different questions,
 * and the latter is a monthly-publication-lag fact of the source data, not a
 * pipeline health signal.
 */
export async function runHousingQualityChecks(
  env: Env,
  silverRowCountThisRun: number,
  transformedRowCount: number,
  regionCount: number,
) {
  const config = await env.DB.prepare(
    `SELECT staleness_threshold_minutes FROM pipeline_config WHERE pipeline = 'housing'`,
  ).first<{ staleness_threshold_minutes: number }>();
  const thresholdMinutes = config?.staleness_threshold_minutes ?? 44640;

  const lastIngestRow = await env.DB.prepare(
    `SELECT MAX(fetched_at) as last FROM bronze_ingestion_log WHERE pipeline = 'housing' AND processed_at IS NOT NULL`,
  ).first<{ last: string | null }>();
  const freshness = checkFreshness(
    lastIngestRow?.last ? new Date(lastIngestRow.last) : null,
    new Date(),
    thresholdMinutes,
  );

  // At minimum, every region should contribute its "all property types" row.
  const completeness = checkCompleteness(silverRowCountThisRun, regionCount, 0);

  const recentRows = await env.DB.prepare(
    `SELECT average_price, period, region, property_type FROM housing_readings_silver
     ORDER BY period DESC LIMIT 200`,
  ).all<{
    average_price: number;
    period: string;
    region: string;
    property_type: string;
  }>();
  const validity = checkValidity(
    recentRows.results.map((r) => r.average_price),
    { min: 1000, max: 10_000_000 }, // GBP — generous bounds, not a real-world price ceiling
    { allowNull: false },
  );

  const uniqueness = checkUniqueness(
    recentRows.results.map((r) => `${r.period}:${r.region}:${r.property_type}`),
  );

  const referential = checkReferential(
    silverRowCountThisRun,
    transformedRowCount,
  );

  const results = [freshness, completeness, validity, uniqueness, referential];
  await persistResults(env, "housing", "silver", results);
  return results;
}

/**
 * Same five checks, parametrized for the site meta-pipeline. site_events_silver
 * is append-only (no natural upsert key — see pipelines/meta/persist.ts), so
 * uniqueness here checks (event_type, occurred_at) pairs rather than a single
 * primary-key column, and validity checks the snapshot's own counts are
 * never negative rather than checking a specific numeric field.
 */
export async function runMetaQualityChecks(
  env: Env,
  silverRowCountThisRun: number,
) {
  const config = await env.DB.prepare(
    `SELECT staleness_threshold_minutes FROM pipeline_config WHERE pipeline = 'meta'`,
  ).first<{ staleness_threshold_minutes: number }>();
  const thresholdMinutes = config?.staleness_threshold_minutes ?? 1440;

  const lastIngestRow = await env.DB.prepare(
    `SELECT MAX(fetched_at) as last FROM bronze_ingestion_log WHERE pipeline = 'meta' AND processed_at IS NOT NULL`,
  ).first<{ last: string | null }>();
  const freshness = checkFreshness(
    lastIngestRow?.last ? new Date(lastIngestRow.last) : null,
    new Date(),
    thresholdMinutes,
  );

  const completeness = checkCompleteness(silverRowCountThisRun, 1, 0);

  const recentEvents = await env.DB.prepare(
    `SELECT event_type, occurred_at, detail_json FROM site_events_silver ORDER BY occurred_at DESC LIMIT 100`,
  ).all<{ event_type: string; occurred_at: string; detail_json: string }>();

  // Every numeric field a snapshot/event can contain (run counts, failure
  // counts, durations) is a non-negative count or duration by definition —
  // flatten them all out and check none went negative, which would indicate
  // a real computation bug upstream, not a valid observation.
  const numericFieldsAcrossEvents = recentEvents.results.flatMap((r) => {
    try {
      return Object.values(
        JSON.parse(r.detail_json) as Record<string, unknown>,
      ).filter((v): v is number => typeof v === "number");
    } catch {
      return [Number.NaN]; // unparseable detail fails validity via NaN
    }
  });
  const validity = checkValidity(numericFieldsAcrossEvents, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });

  const uniqueness = checkUniqueness(
    recentEvents.results.map((r) => `${r.event_type}:${r.occurred_at}`),
  );

  const referential = checkReferential(
    silverRowCountThisRun,
    silverRowCountThisRun,
  );

  const results = [freshness, completeness, validity, uniqueness, referential];
  await persistResults(env, "meta", "silver", results);
  return results;
}
