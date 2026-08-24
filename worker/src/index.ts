import type { Env } from "./lib/env";
import { logger } from "./lib/logger";
import { json, errorJson, corsPreflight, checkRateLimit } from "./lib/http";
import { runCarbonPipeline } from "./pipelines/carbon/run";
import {
  handleHealth,
  handleCarbonCurrent,
  handleCarbonHistory,
  handleCarbonMix,
  handleHousingRegional,
  handlePipelinesStatus,
} from "./routes/api";

// Matches wrangler.toml's [triggers].crons — Cloudflare passes back whichever
// expression fired as `event.cron`, so one Worker script can run several
// independently-scheduled pipelines.
const CRON_CARBON = "*/30 * * * *";
const CRON_HOUSING = "0 6 1 * *";
const CRON_META = "0 5 * * *";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info("cron fired", { cron: event.cron });

    switch (event.cron) {
      case CRON_CARBON:
        ctx.waitUntil(runCarbonPipeline(env, "cron").catch((err) => logger.error("carbon cron failed", { error: String(err) })));
        break;
      case CRON_HOUSING:
        // Pipeline 2 — see task tracker; wired up once built.
        logger.info("housing pipeline not yet implemented — skipping scheduled run");
        break;
      case CRON_META:
        logger.info("meta pipeline not yet implemented — skipping scheduled run");
        break;
      default:
        logger.warn("unrecognised cron expression fired", { cron: event.cron });
    }
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return corsPreflight();

    if (request.method !== "GET") {
      // Every route this Worker currently serves is read-only. Admin
      // mutating endpoints (POST/PATCH/DELETE) are added in routes/admin.ts
      // once the ops dashboard lands — see task tracker.
      return errorJson("method not allowed", 405);
    }

    if (url.pathname.startsWith("/api/")) {
      const allowed = await checkRateLimit(env, request);
      if (!allowed) return errorJson("rate limit exceeded", 429);

      try {
        return await routeApi(url, env);
      } catch (err) {
        logger.error("unhandled API error", { path: url.pathname, error: String(err) });
        return errorJson("internal error", 500);
      }
    }

    return errorJson("not found", 404);
  },
};

async function routeApi(url: URL, env: Env): Promise<Response> {
  switch (url.pathname) {
    case "/api/v1/health":
      return handleHealth(env);
    case "/api/v1/carbon/current":
      return handleCarbonCurrent(env);
    case "/api/v1/carbon/history":
      return handleCarbonHistory(env, url);
    case "/api/v1/carbon/mix":
      return handleCarbonMix(env, url);
    case "/api/v1/housing/regional":
      return handleHousingRegional(env, url);
    case "/api/v1/pipelines/status":
      return handlePipelinesStatus(env);
    default:
      return json({ error: "unknown endpoint", path: url.pathname }, { status: 404 });
  }
}
