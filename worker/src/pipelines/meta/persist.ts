import type { Env } from "../../lib/env";
import type { SiteEventType } from "./types";

/**
 * Unlike the other two pipelines' silver tables, site_events_silver has no
 * natural unique key to upsert against — it's an append-only event log by
 * design (a "deploy happened at 14:02" event is never the same row as one
 * from 14:03, even if nothing else differs), so this is a plain insert.
 */
export async function insertSiteEvent(
  env: Env,
  event: {
    eventType: SiteEventType;
    occurredAt: string;
    detail: unknown;
    bronzeId: number | null;
  },
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO site_events_silver (event_type, occurred_at, detail_json, source_bronze_id)
     VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(
      event.eventType,
      event.occurredAt,
      JSON.stringify(event.detail),
      event.bronzeId,
    )
    .run();
  return result.meta.last_row_id;
}

export async function getRecentSiteEvents(
  env: Env,
  limit: number,
): Promise<
  Array<{
    id: number;
    event_type: string;
    occurred_at: string;
    detail_json: string;
  }>
> {
  const result = await env.DB.prepare(
    `SELECT id, event_type, occurred_at, detail_json FROM site_events_silver
     ORDER BY occurred_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<{
      id: number;
      event_type: string;
      occurred_at: string;
      detail_json: string;
    }>();
  return result.results;
}
