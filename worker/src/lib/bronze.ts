import type { Env } from "./env";
import { retryWithBackoff } from "./retry";
import { logger } from "./logger";

export interface BronzeLandResult {
  bronzeId: number;
  r2Key: string;
  byteSize: number;
}

/**
 * Fetches a source URL (with retry/backoff), lands the raw response
 * untouched in R2, and indexes it in D1. This is the ONLY place raw source
 * data is ever written — every downstream step reads from what's landed
 * here, never straight from the live HTTP response, so a crash between
 * ingest and transform is always recoverable by re-running the transform
 * against bronze.
 */
export async function fetchAndLandBronze(
  env: Env,
  params: {
    pipeline: string;
    kind: string;
    url: string;
    periodStart?: string;
    periodEnd?: string;
  },
): Promise<BronzeLandResult> {
  const { pipeline, kind, url, periodStart, periodEnd } = params;
  const now = new Date();

  const response = await retryWithBackoff(async () => {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
    }
    return res;
  });

  const bodyText = await response.text();
  const r2Key = buildBronzeKey(pipeline, kind, now);

  await env.BRONZE_BUCKET.put(r2Key, bodyText, {
    httpMetadata: { contentType: "application/json" },
  });

  const insert = await env.DB.prepare(
    `INSERT INTO bronze_ingestion_log
       (pipeline, r2_key, source_url, http_status, byte_size, fetched_at, period_start, period_end)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      pipeline,
      r2Key,
      url,
      response.status,
      bodyText.length,
      now.toISOString(),
      periodStart ?? null,
      periodEnd ?? null,
    )
    .run();

  const bronzeId = insert.meta.last_row_id;
  logger.info("bronze landed", {
    pipeline,
    r2Key,
    bronzeId,
    byteSize: bodyText.length,
  });

  return { bronzeId, r2Key, byteSize: bodyText.length };
}

/**
 * Lands an already-in-hand payload as bronze, without fetching it from a
 * URL first. For the site meta-pipeline, whose "source" is this Worker's own
 * D1 state (a computed snapshot) or an externally-posted deploy/build event
 * — not a third-party HTTP API — bronze is still the same immutable,
 * R2-backed landing zone, just without the fetch step.
 */
export async function landBronzeObject(
  env: Env,
  params: {
    pipeline: string;
    kind: string;
    payload: unknown;
    sourceUrl: string;
  },
): Promise<BronzeLandResult> {
  const { pipeline, kind, payload, sourceUrl } = params;
  const now = new Date();
  const bodyText = JSON.stringify(payload);
  const r2Key = buildBronzeKey(pipeline, kind, now);

  await env.BRONZE_BUCKET.put(r2Key, bodyText, {
    httpMetadata: { contentType: "application/json" },
  });

  const insert = await env.DB.prepare(
    `INSERT INTO bronze_ingestion_log (pipeline, r2_key, source_url, http_status, byte_size, fetched_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(pipeline, r2Key, sourceUrl, 200, bodyText.length, now.toISOString())
    .run();

  const bronzeId = insert.meta.last_row_id;
  logger.info("bronze landed", {
    pipeline,
    r2Key,
    bronzeId,
    byteSize: bodyText.length,
  });

  return { bronzeId, r2Key, byteSize: bodyText.length };
}

/** Reads a bronze payload back from R2 and parses it as JSON. */
export async function readBronzeJson<T>(env: Env, r2Key: string): Promise<T> {
  const obj = await env.BRONZE_BUCKET.get(r2Key);
  if (!obj) throw new Error(`bronze object not found: ${r2Key}`);
  return obj.json<T>();
}

export async function markBronzeProcessed(
  env: Env,
  bronzeId: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE bronze_ingestion_log SET processed_at = ?1 WHERE id = ?2`,
  )
    .bind(new Date().toISOString(), bronzeId)
    .run();
}

function buildBronzeKey(pipeline: string, kind: string, when: Date): string {
  const yyyy = when.getUTCFullYear();
  const mm = String(when.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(when.getUTCDate()).padStart(2, "0");
  const hh = String(when.getUTCHours()).padStart(2, "0");
  const min = String(when.getUTCMinutes()).padStart(2, "0");
  const ss = String(when.getUTCSeconds()).padStart(2, "0");
  const ms = String(when.getUTCMilliseconds()).padStart(3, "0");
  // A short random suffix, on top of millisecond precision, guarantees a
  // unique r2_key (UNIQUE in D1) even for two ingestions landing within the
  // same millisecond — e.g. a manual re-run fired immediately after a cron
  // tick, or two pipelines' bronze writes racing each other under test.
  const rand = Math.random().toString(36).slice(2, 8);
  return `bronze/${pipeline}/${yyyy}/${mm}/${dd}/${hh}${min}${ss}${ms}-${rand}-${kind}.json`;
}
