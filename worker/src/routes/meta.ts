// Routes for Pipeline 3 (the site meta-pipeline) that don't fit the public
// read-only API or the Access-gated admin API: a CI-facing webhook for
// reporting real deploy/build events, secured by a shared bearer secret
// rather than Cloudflare Access (CI can't do interactive SSO) or nothing at
// all (anyone could otherwise inject fake deploy history into the site's own
// story about itself).
import type { Env } from "../lib/env";
import { json, errorJson } from "../lib/http";
import {
  validateEventPayload,
  InvalidEventError,
} from "../pipelines/meta/transform";
import { recordSiteEvent } from "../pipelines/meta/run";

// POST /api/meta/report-event  { eventType: "deploy" | "build", ...fields }
// Authorization: Bearer <META_INGEST_SECRET>
export async function handleMetaReportEvent(
  env: Env,
  request: Request,
): Promise<Response> {
  if (!env.META_INGEST_SECRET) {
    return errorJson(
      "event ingestion is not configured on this deployment yet",
      503,
    );
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  if (presented !== env.META_INGEST_SECRET) {
    return errorJson("unauthorized", 401);
  }

  let body: { eventType?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorJson("request body must be JSON", 400);
  }

  try {
    const { eventType, detail } = validateEventPayload(
      String(body.eventType),
      body,
    );
    const result = await recordSiteEvent(env, eventType, detail);
    return json({ data: { eventType, ...result } }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidEventError) {
      return errorJson(err.message, 400);
    }
    throw err;
  }
}
