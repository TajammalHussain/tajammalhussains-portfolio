import type { Env } from "../lib/env";
import { json, errorJson, withCache } from "../lib/http";

const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// GET /api/v1/health
export async function handleHealth(env: Env): Promise<Response> {
  try {
    await env.DB.prepare("SELECT 1").first();
    return json({ status: "ok", time: new Date().toISOString() });
  } catch (err) {
    return errorJson("database unreachable", 503, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

// GET /api/v1/carbon/current
export async function handleCarbonCurrent(env: Env): Promise<Response> {
  const cacheTtl = Number(env.API_CACHE_TTL_SECONDS || "300");
  const { data, cacheHit } = await withCache(env, "api:carbon:current", cacheTtl, async () => {
    const reading = await env.DB.prepare(
      `SELECT period_from, period_to, actual_intensity, forecast_intensity, index_band
       FROM carbon_readings_silver ORDER BY period_from DESC LIMIT 1`,
    ).first<{
      period_from: string;
      period_to: string;
      actual_intensity: number | null;
      forecast_intensity: number;
      index_band: string;
    }>();

    if (!reading) return null;

    const mix = await env.DB.prepare(
      `SELECT fuel_type, percentage FROM carbon_generation_mix_silver
       WHERE period_from = ?1 ORDER BY percentage DESC`,
    )
      .bind(reading.period_from)
      .all<{ fuel_type: string; percentage: number }>();

    return {
      periodFrom: reading.period_from,
      periodTo: reading.period_to,
      actualIntensity: reading.actual_intensity,
      forecastIntensity: reading.forecast_intensity,
      indexBand: reading.index_band,
      generationMix: mix.results,
    };
  });

  if (data === null) {
    return errorJson("no carbon intensity data ingested yet", 503);
  }
  return json({ data, cacheHit });
}

// GET /api/v1/carbon/history?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=daily|raw
export async function handleCarbonHistory(env: Env, url: URL): Promise<Response> {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const granularity = url.searchParams.get("granularity") ?? "daily";

  if (!from || !to || !isValidDate(from) || !isValidDate(to)) {
    return errorJson("query params 'from' and 'to' are required, format YYYY-MM-DD", 400);
  }
  if (granularity !== "daily" && granularity !== "raw") {
    return errorJson("granularity must be 'daily' or 'raw'", 400);
  }

  const cacheKey = `api:carbon:history:${from}:${to}:${granularity}`;
  const cacheTtl = Number(env.API_CACHE_TTL_SECONDS || "300");
  const { data, cacheHit } = await withCache(env, cacheKey, cacheTtl, async () => {
    if (granularity === "daily") {
      const result = await env.DB.prepare(
        `SELECT date, avg_actual_intensity, avg_forecast_intensity, min_intensity,
                max_intensity, forecast_variance_pct, reading_count
         FROM carbon_daily_gold WHERE date BETWEEN ?1 AND ?2 ORDER BY date`,
      )
        .bind(from, to)
        .all();
      return result.results;
    }
    const result = await env.DB.prepare(
      `SELECT period_from, period_to, actual_intensity, forecast_intensity, index_band
       FROM carbon_readings_silver
       WHERE substr(period_from, 1, 10) BETWEEN ?1 AND ?2
       ORDER BY period_from`,
    )
      .bind(from, to)
      .all();
    return result.results;
  });

  return json({ data, cacheHit, meta: { from, to, granularity } });
}

// GET /api/v1/carbon/mix?date=YYYY-MM-DD (defaults to most recent date with data)
export async function handleCarbonMix(env: Env, url: URL): Promise<Response> {
  const date = url.searchParams.get("date");
  if (date && !isValidDate(date)) {
    return errorJson("query param 'date' must be YYYY-MM-DD", 400);
  }

  const cacheKey = `api:carbon:mix:${date ?? "latest"}`;
  const cacheTtl = Number(env.API_CACHE_TTL_SECONDS || "300");
  const { data, cacheHit } = await withCache(env, cacheKey, cacheTtl, async () => {
    const targetDate =
      date ??
      (
        await env.DB.prepare(`SELECT MAX(date) as d FROM carbon_fuel_mix_gold`).first<{
          d: string | null;
        }>()
      )?.d;

    if (!targetDate) return null;

    const result = await env.DB.prepare(
      `SELECT fuel_type, avg_share FROM carbon_fuel_mix_gold WHERE date = ?1 ORDER BY avg_share DESC`,
    )
      .bind(targetDate)
      .all<{ fuel_type: string; avg_share: number }>();

    return { date: targetDate, mix: result.results };
  });

  if (data === null) return errorJson("no generation mix data available", 503);
  return json({ data, cacheHit });
}

// GET /api/v1/housing/regional?region=
// Pipeline 2 lands later in the build order (see task tracker) — this route
// exists now so the documented API shape is stable, but honestly reports
// itself unavailable rather than fabricating data.
export async function handleHousingRegional(env: Env, url: URL): Promise<Response> {
  const region = url.searchParams.get("region");
  const check = await env.DB.prepare(`SELECT COUNT(*) as n FROM housing_regional_gold`).first<{
    n: number;
  }>();
  if (!check || check.n === 0) {
    return errorJson("housing pipeline not yet deployed", 503);
  }
  const result = region
    ? await env.DB.prepare(`SELECT * FROM housing_regional_gold WHERE region = ?1 ORDER BY period DESC`)
        .bind(region)
        .all()
    : await env.DB.prepare(`SELECT * FROM housing_regional_gold ORDER BY period DESC LIMIT 100`).all();
  return json({ data: result.results });
}

// GET /api/v1/pipelines/status
export async function handlePipelinesStatus(env: Env): Promise<Response> {
  const configs = await env.DB.prepare(
    `SELECT pipeline, paused, staleness_threshold_minutes, visible_on_live_page FROM pipeline_config`,
  ).all<{
    pipeline: string;
    paused: number;
    staleness_threshold_minutes: number;
    visible_on_live_page: number;
  }>();

  const statuses = await Promise.all(
    configs.results.map(async (cfg) => {
      const lastRun = await env.DB.prepare(
        `SELECT status, started_at, finished_at, rows_silver, rows_gold
         FROM pipeline_runs WHERE pipeline = ?1 ORDER BY started_at DESC LIMIT 1`,
      )
        .bind(cfg.pipeline)
        .first<{
          status: string;
          started_at: string;
          finished_at: string | null;
          rows_silver: number | null;
          rows_gold: number | null;
        }>();

      const latestQuality = await env.DB.prepare(
        `SELECT check_name, status, run_at FROM data_quality_runs
         WHERE pipeline = ?1 AND run_at = (SELECT MAX(run_at) FROM data_quality_runs WHERE pipeline = ?1)`,
      )
        .bind(cfg.pipeline)
        .all<{ check_name: string; status: string; run_at: string }>();

      return {
        pipeline: cfg.pipeline,
        paused: cfg.paused === 1,
        visibleOnLivePage: cfg.visible_on_live_page === 1,
        stalenessThresholdMinutes: cfg.staleness_threshold_minutes,
        lastRun: lastRun ?? null,
        latestQualityChecks: latestQuality.results,
      };
    }),
  );

  return json({ data: statuses });
}
