import type { Env } from "../../lib/env";
import type {
  CarbonReadingSilverRow,
  GenerationMixSilverRow,
  CarbonDailyGoldRow,
  FuelMixGoldRow,
} from "./types";

/**
 * Upserts silver readings — `ON CONFLICT(period_from) DO UPDATE` makes this
 * idempotent by construction: re-running ingestion for a period already seen
 * (e.g. a retried cron, or overlapping backfill windows) overwrites that
 * period's row rather than inserting a duplicate.
 */
export async function upsertCarbonReadings(
  env: Env,
  rows: CarbonReadingSilverRow[],
  bronzeId: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = env.DB.prepare(`
    INSERT INTO carbon_readings_silver
      (period_from, period_to, actual_intensity, forecast_intensity, index_band, source_bronze_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(period_from) DO UPDATE SET
      period_to = excluded.period_to,
      actual_intensity = excluded.actual_intensity,
      forecast_intensity = excluded.forecast_intensity,
      index_band = excluded.index_band,
      source_bronze_id = excluded.source_bronze_id,
      ingested_at = datetime('now')
  `);
  const batch = rows.map((r) =>
    stmt.bind(
      r.periodFrom,
      r.periodTo,
      r.actualIntensity,
      r.forecastIntensity,
      r.indexBand,
      bronzeId,
    ),
  );
  await env.DB.batch(batch);
  return rows.length;
}

export async function upsertGenerationMix(
  env: Env,
  rows: GenerationMixSilverRow[],
  bronzeId: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = env.DB.prepare(`
    INSERT INTO carbon_generation_mix_silver (period_from, fuel_type, percentage, source_bronze_id)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(period_from, fuel_type) DO UPDATE SET
      percentage = excluded.percentage,
      source_bronze_id = excluded.source_bronze_id
  `);
  const batch = rows.map((r) =>
    stmt.bind(r.periodFrom, r.fuelType, r.percentage, bronzeId),
  );
  await env.DB.batch(batch);
  return rows.length;
}

export async function upsertDailyGold(
  env: Env,
  rows: CarbonDailyGoldRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = env.DB.prepare(`
    INSERT INTO carbon_daily_gold
      (date, avg_actual_intensity, avg_forecast_intensity, min_intensity, min_intensity_period,
       max_intensity, max_intensity_period, forecast_variance_pct, reading_count, computed_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      avg_actual_intensity = excluded.avg_actual_intensity,
      avg_forecast_intensity = excluded.avg_forecast_intensity,
      min_intensity = excluded.min_intensity,
      min_intensity_period = excluded.min_intensity_period,
      max_intensity = excluded.max_intensity,
      max_intensity_period = excluded.max_intensity_period,
      forecast_variance_pct = excluded.forecast_variance_pct,
      reading_count = excluded.reading_count,
      computed_at = datetime('now')
  `);
  const batch = rows.map((r) =>
    stmt.bind(
      r.date,
      r.avgActualIntensity,
      r.avgForecastIntensity,
      r.minIntensity,
      r.minIntensityPeriod,
      r.maxIntensity,
      r.maxIntensityPeriod,
      r.forecastVariancePct,
      r.readingCount,
    ),
  );
  await env.DB.batch(batch);
  return rows.length;
}

export async function upsertFuelMixGold(
  env: Env,
  rows: FuelMixGoldRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = env.DB.prepare(`
    INSERT INTO carbon_fuel_mix_gold (date, fuel_type, avg_share, computed_at)
    VALUES (?1, ?2, ?3, datetime('now'))
    ON CONFLICT(date, fuel_type) DO UPDATE SET
      avg_share = excluded.avg_share,
      computed_at = datetime('now')
  `);
  const batch = rows.map((r) => stmt.bind(r.date, r.fuelType, r.avgShare));
  await env.DB.batch(batch);
  return rows.length;
}

/** Reads back silver readings for one or more UTC dates, for gold recomputation. */
export async function getSilverReadingsForDates(
  env: Env,
  dates: string[],
): Promise<CarbonReadingSilverRow[]> {
  if (dates.length === 0) return [];
  const placeholders = dates.map((_, i) => `?${i + 1}`).join(",");
  const result = await env.DB.prepare(
    `SELECT period_from, period_to, actual_intensity, forecast_intensity, index_band
     FROM carbon_readings_silver
     WHERE substr(period_from, 1, 10) IN (${placeholders})
     ORDER BY period_from`,
  )
    .bind(...dates)
    .all<{
      period_from: string;
      period_to: string;
      actual_intensity: number | null;
      forecast_intensity: number;
      index_band: string;
    }>();

  return result.results.map((r) => ({
    periodFrom: r.period_from,
    periodTo: r.period_to,
    actualIntensity: r.actual_intensity,
    forecastIntensity: r.forecast_intensity,
    indexBand: r.index_band,
  }));
}

export async function getGenerationMixForDates(
  env: Env,
  dates: string[],
): Promise<GenerationMixSilverRow[]> {
  if (dates.length === 0) return [];
  const placeholders = dates.map((_, i) => `?${i + 1}`).join(",");
  const result = await env.DB.prepare(
    `SELECT period_from, fuel_type, percentage
     FROM carbon_generation_mix_silver
     WHERE substr(period_from, 1, 10) IN (${placeholders})
     ORDER BY period_from`,
  )
    .bind(...dates)
    .all<{ period_from: string; fuel_type: string; percentage: number }>();

  return result.results.map((r) => ({
    periodFrom: r.period_from,
    fuelType: r.fuel_type,
    percentage: r.percentage,
  }));
}
