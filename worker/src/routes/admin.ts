// Handlers behind /api/admin/* — every route here requires a verified
// Cloudflare Access identity (checked once in index.ts before any of these
// run) and every state-changing action is written to admin_audit_log via
// recordAudit, which has no corresponding delete/update anywhere in the
// codebase. This is the backend for the /admin/ops dashboard: pipeline
// control (pause/resume, run now), monitoring (run history, quality checks),
// data inspection (bronze ingestion log), and the audit trail itself.
//
// Responses use adminJson/adminErrorJson (not the public json/errorJson) so
// the CORS headers match the credentialed, origin-checked policy these
// cookie-bearing requests need — see lib/http.ts.
import type { Env } from "../lib/env";
import { adminJson, adminErrorJson } from "../lib/http";
import { recordAudit } from "../lib/audit";
import type { AccessIdentity } from "../lib/access";
import { runCarbonPipeline, runCarbonBackfill, InvalidBackfillRangeError } from "../pipelines/carbon/run";
import { runHousingPipeline } from "../pipelines/housing/run";
import { runMetaPipeline } from "../pipelines/meta/run";

const KNOWN_PIPELINES = ["carbon", "housing", "meta"] as const;
type KnownPipeline = (typeof KNOWN_PIPELINES)[number];

function isKnownPipeline(p: string): p is KnownPipeline {
  return (KNOWN_PIPELINES as readonly string[]).includes(p);
}

// Maps a pipeline name to its runner — the only place that needs updating
// when a new pipeline gets a real implementation. Pipelines absent here
// (e.g. "meta") report 501 rather than silently no-op'ing.
const PIPELINE_RUNNERS: Partial<
  Record<KnownPipeline, (env: Env, trigger: "manual") => Promise<unknown>>
> = {
  carbon: runCarbonPipeline,
  housing: runHousingPipeline,
  meta: runMetaPipeline,
};

function clampLimit(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

// GET /api/admin/pipelines — config + last 10 runs + latest quality checks,
// one payload the dashboard's overview tab renders in a single fetch.
export async function handleAdminPipelinesList(
  env: Env,
  request: Request,
): Promise<Response> {
  const configs = await env.DB.prepare(
    `SELECT pipeline, paused, staleness_threshold_minutes, min_expected_rows_per_run,
            visible_on_live_page, updated_at FROM pipeline_config ORDER BY pipeline`,
  ).all<{
    pipeline: string;
    paused: number;
    staleness_threshold_minutes: number;
    min_expected_rows_per_run: number;
    visible_on_live_page: number;
    updated_at: string;
  }>();

  const data = await Promise.all(
    configs.results.map(async (cfg) => {
      const runs = await env.DB.prepare(
        `SELECT id, trigger_type, status, started_at, finished_at, rows_bronze, rows_silver,
                rows_gold, error_detail
         FROM pipeline_runs WHERE pipeline = ?1 ORDER BY started_at DESC LIMIT 10`,
      )
        .bind(cfg.pipeline)
        .all();

      const quality = await env.DB.prepare(
        `SELECT check_name, layer, status, observed_value, expected_value, detail, run_at
         FROM data_quality_runs
         WHERE pipeline = ?1 AND run_at = (SELECT MAX(run_at) FROM data_quality_runs WHERE pipeline = ?1)`,
      )
        .bind(cfg.pipeline)
        .all();

      return {
        pipeline: cfg.pipeline,
        paused: cfg.paused === 1,
        stalenessThresholdMinutes: cfg.staleness_threshold_minutes,
        minExpectedRowsPerRun: cfg.min_expected_rows_per_run,
        visibleOnLivePage: cfg.visible_on_live_page === 1,
        configUpdatedAt: cfg.updated_at,
        implemented:
          isKnownPipeline(cfg.pipeline) &&
          Boolean(PIPELINE_RUNNERS[cfg.pipeline]),
        recentRuns: runs.results,
        latestQualityChecks: quality.results,
      };
    }),
  );

  return adminJson(env, request, { data });
}

// POST /api/admin/pipelines/:pipeline/pause  { paused: boolean }
export async function handleAdminSetPaused(
  env: Env,
  request: Request,
  pipeline: string,
  identity: AccessIdentity,
): Promise<Response> {
  if (!isKnownPipeline(pipeline))
    return adminErrorJson(env, request, "unknown pipeline", 404);

  let body: { paused?: unknown };
  try {
    body = await request.json();
  } catch {
    return adminErrorJson(env, request, "request body must be JSON", 400);
  }
  if (typeof body.paused !== "boolean") {
    return adminErrorJson(
      env,
      request,
      "body must include a boolean 'paused' field",
      400,
    );
  }

  await env.DB.prepare(
    `UPDATE pipeline_config SET paused = ?1, updated_at = datetime('now') WHERE pipeline = ?2`,
  )
    .bind(body.paused ? 1 : 0, pipeline)
    .run();

  await recordAudit(env, {
    actorEmail: identity.email,
    action: body.paused ? "pipeline.pause" : "pipeline.resume",
    target: pipeline,
    result: "success",
  });

  return adminJson(env, request, { data: { pipeline, paused: body.paused } });
}

// POST /api/admin/pipelines/:pipeline/run — triggers one run synchronously
// (same code path as the cron trigger, `triggerType: "manual"`) and waits
// for it to finish so the dashboard can show the outcome immediately rather
// than polling.
export async function handleAdminRunNow(
  env: Env,
  request: Request,
  pipeline: string,
  identity: AccessIdentity,
): Promise<Response> {
  if (!isKnownPipeline(pipeline))
    return adminErrorJson(env, request, "unknown pipeline", 404);

  const runner = PIPELINE_RUNNERS[pipeline];
  if (!runner) {
    return adminErrorJson(
      env,
      request,
      `pipeline '${pipeline}' has no implementation to run yet`,
      501,
    );
  }

  try {
    const result = await runner(env, "manual");
    await recordAudit(env, {
      actorEmail: identity.email,
      action: "pipeline.run",
      target: pipeline,
      result: "success",
      detail: JSON.stringify(result),
    });
    return adminJson(env, request, { data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit(env, {
      actorEmail: identity.email,
      action: "pipeline.run",
      target: pipeline,
      result: "error",
      detail: message,
    });
    return adminErrorJson(env, request, "pipeline run failed", 500, {
      detail: message,
    });
  }
}

// POST /api/admin/pipelines/carbon/backfill  { from: ISO8601, to: ISO8601 }
// Fetches real historical data from api.carbonintensity.org.uk for the given
// range (max 31 days, matching the source API's own limit) — see
// pipelines/carbon/run.ts for why this exists (populating real history right
// after a fresh deploy, rather than fabricating it). Only carbon supports
// this today: it's the only pipeline whose source exposes a date-range API.
export async function handleAdminCarbonBackfill(
  env: Env,
  request: Request,
  identity: AccessIdentity,
): Promise<Response> {
  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return adminErrorJson(env, request, "request body must be JSON", 400);
  }
  if (typeof body.from !== "string" || typeof body.to !== "string") {
    return adminErrorJson(env, request, "body must include string 'from' and 'to' ISO8601 timestamps", 400);
  }

  try {
    const result = await runCarbonBackfill(env, body.from, body.to);
    await recordAudit(env, {
      actorEmail: identity.email,
      action: "pipeline.backfill",
      target: "carbon",
      params: { from: body.from, to: body.to },
      result: "success",
      detail: JSON.stringify(result),
    });
    return adminJson(env, request, { data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAudit(env, {
      actorEmail: identity.email,
      action: "pipeline.backfill",
      target: "carbon",
      params: { from: body.from, to: body.to },
      result: "error",
      detail: message,
    });
    const status = err instanceof InvalidBackfillRangeError ? 400 : 500;
    return adminErrorJson(env, request, "backfill failed", status, { detail: message });
  }
}

// GET /api/admin/quality?pipeline=&limit= — data-quality check history, most
// recent first, across all layers (not just the latest run per pipeline —
// that's /api/admin/pipelines — this is the full timeline for trend-spotting
// and for showing past failures honestly rather than only the current state).
export async function handleAdminQualityHistory(
  env: Env,
  request: Request,
  url: URL,
): Promise<Response> {
  const pipeline = url.searchParams.get("pipeline");
  const limit = clampLimit(url.searchParams.get("limit"), 50, 500);

  const result = pipeline
    ? await env.DB.prepare(
        `SELECT pipeline, layer, check_name, status, observed_value, expected_value, detail, run_at
         FROM data_quality_runs WHERE pipeline = ?1 ORDER BY run_at DESC LIMIT ?2`,
      )
        .bind(pipeline, limit)
        .all()
    : await env.DB.prepare(
        `SELECT pipeline, layer, check_name, status, observed_value, expected_value, detail, run_at
         FROM data_quality_runs ORDER BY run_at DESC LIMIT ?1`,
      )
        .bind(limit)
        .all();

  return adminJson(env, request, { data: result.results });
}

// GET /api/admin/bronze?pipeline=&limit= — raw ingestion log, the "data
// inspection" surface: what landed, from where, when, and whether it's been
// consumed by a silver transform yet.
export async function handleAdminBronzeLog(
  env: Env,
  request: Request,
  url: URL,
): Promise<Response> {
  const pipeline = url.searchParams.get("pipeline");
  const limit = clampLimit(url.searchParams.get("limit"), 50, 500);

  const result = pipeline
    ? await env.DB.prepare(
        `SELECT id, pipeline, r2_key, source_url, http_status, byte_size, fetched_at,
                period_start, period_end, processed_at
         FROM bronze_ingestion_log WHERE pipeline = ?1 ORDER BY fetched_at DESC LIMIT ?2`,
      )
        .bind(pipeline, limit)
        .all()
    : await env.DB.prepare(
        `SELECT id, pipeline, r2_key, source_url, http_status, byte_size, fetched_at,
                period_start, period_end, processed_at
         FROM bronze_ingestion_log ORDER BY fetched_at DESC LIMIT ?1`,
      )
        .bind(limit)
        .all();

  return adminJson(env, request, { data: result.results });
}

// GET /api/admin/bronze/:id/payload — fetches one raw bronze object's actual
// JSON body from R2, for when a human wants to see exactly what a source API
// returned rather than just the ingestion-log's metadata about it.
export async function handleAdminBronzePayload(
  env: Env,
  request: Request,
  id: string,
): Promise<Response> {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0)
    return adminErrorJson(env, request, "invalid bronze id", 400);

  const row = await env.DB.prepare(
    `SELECT r2_key FROM bronze_ingestion_log WHERE id = ?1`,
  )
    .bind(idNum)
    .first<{ r2_key: string }>();
  if (!row) return adminErrorJson(env, request, "bronze record not found", 404);

  const object = await env.BRONZE_BUCKET.get(row.r2_key);
  if (!object)
    return adminErrorJson(env, request, "bronze payload missing from R2", 404, {
      r2Key: row.r2_key,
    });

  const text = await object.text();
  return adminJson(env, request, {
    data: { r2Key: row.r2_key, payload: JSON.parse(text) },
  });
}

// GET /api/admin/audit?limit= — the audit trail itself, read-only.
export async function handleAdminAuditLog(
  env: Env,
  request: Request,
  url: URL,
): Promise<Response> {
  const limit = clampLimit(url.searchParams.get("limit"), 50, 500);
  const result = await env.DB.prepare(
    `SELECT id, actor_email, action, target, params_json, result, detail, created_at
     FROM admin_audit_log ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all();
  return adminJson(env, request, { data: result.results });
}

// GET /api/admin/whoami — lets the dashboard confirm which identity Access
// resolved without duplicating JWT-parsing logic client-side.
export function handleAdminWhoami(
  env: Env,
  request: Request,
  identity: AccessIdentity,
): Response {
  return adminJson(env, request, { data: identity });
}
