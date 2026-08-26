import type { Env } from "./lib/env";
import { logger } from "./lib/logger";
import {
  json,
  errorJson,
  corsPreflight,
  checkRateLimit,
  adminErrorJson,
  adminCorsPreflight,
} from "./lib/http";
import { verifyAccess, type AccessIdentity } from "./lib/access";
import { runCarbonPipeline } from "./pipelines/carbon/run";
import { runHousingPipeline } from "./pipelines/housing/run";
import { runMetaPipeline } from "./pipelines/meta/run";
import {
  handleHealth,
  handleCarbonCurrent,
  handleCarbonHistory,
  handleCarbonMix,
  handleHousingRegional,
  handlePipelinesStatus,
  handleMetaEvents,
} from "./routes/api";
import { handleMetaReportEvent } from "./routes/meta";
import {
  handleAdminPipelinesList,
  handleAdminSetPaused,
  handleAdminRunNow,
  handleAdminCarbonBackfill,
  handleAdminQualityHistory,
  handleAdminBronzeLog,
  handleAdminBronzePayload,
  handleAdminAuditLog,
  handleAdminWhoami,
} from "./routes/admin";
import { handleOauthAuthorize, handleOauthCallback } from "./routes/oauth";

// Matches wrangler.toml's [triggers].crons — Cloudflare passes back whichever
// expression fired as `event.cron`, so one Worker script can run several
// independently-scheduled pipelines.
const CRON_CARBON = "*/30 * * * *";
const CRON_HOUSING = "0 6 1 * *";
const CRON_META = "0 5 * * *";

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    logger.info("cron fired", { cron: event.cron });

    switch (event.cron) {
      case CRON_CARBON:
        ctx.waitUntil(
          runCarbonPipeline(env, "cron").catch((err) =>
            logger.error("carbon cron failed", { error: String(err) }),
          ),
        );
        break;
      case CRON_HOUSING:
        ctx.waitUntil(
          runHousingPipeline(env, "cron").catch((err) =>
            logger.error("housing cron failed", { error: String(err) }),
          ),
        );
        break;
      case CRON_META:
        ctx.waitUntil(
          runMetaPipeline(env, "cron").catch((err) =>
            logger.error("meta cron failed", { error: String(err) }),
          ),
        );
        break;
      default:
        logger.warn("unrecognised cron expression fired", { cron: event.cron });
    }
  },

  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // /api/admin/* has its own CORS (credentialed, origin-checked) and its
    // own auth gate (Cloudflare Access), and — unlike the public API — needs
    // POST for pipeline control actions. Handled entirely separately from
    // the public-API path below.
    if (url.pathname.startsWith("/api/admin/")) {
      if (request.method === "OPTIONS") return adminCorsPreflight(env, request);

      const identity = await verifyAccess(request, env);
      if (!identity) return adminErrorJson(env, request, "unauthorized", 401);

      try {
        return await routeAdmin(url, env, request, identity);
      } catch (err) {
        logger.error("unhandled admin API error", {
          path: url.pathname,
          error: String(err),
        });
        return adminErrorJson(env, request, "internal error", 500);
      }
    }

    // /oauth/* is deliberately unauthenticated — it's the GitHub OAuth
    // handshake that backs the /admin/content CMS's write access, not a
    // protected resource itself. Real access control for who gets to
    // *reach* /admin/content at all is Cloudflare Access, configured at the
    // edge on the Pages project, not app code.
    if (url.pathname === "/oauth/authorize")
      return handleOauthAuthorize(env, request);
    if (url.pathname === "/oauth/callback")
      return handleOauthCallback(env, request);

    // Bearer-secret-gated CI webhook — see routes/meta.ts for why this isn't
    // Cloudflare Access (CI can't SSO) or the public GET-only API.
    if (
      url.pathname === "/api/meta/report-event" &&
      request.method === "POST"
    ) {
      try {
        return await handleMetaReportEvent(env, request);
      } catch (err) {
        logger.error("unhandled meta report-event error", {
          error: String(err),
        });
        return errorJson("internal error", 500);
      }
    }

    if (request.method === "OPTIONS") return corsPreflight();

    if (request.method !== "GET") {
      return errorJson("method not allowed", 405);
    }

    if (url.pathname.startsWith("/api/")) {
      const allowed = await checkRateLimit(env, request);
      if (!allowed) return errorJson("rate limit exceeded", 429);

      try {
        return await routeApi(url, env);
      } catch (err) {
        logger.error("unhandled API error", {
          path: url.pathname,
          error: String(err),
        });
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
    case "/api/v1/meta/events":
      return handleMetaEvents(env, url);
    default:
      return json(
        { error: "unknown endpoint", path: url.pathname },
        { status: 404 },
      );
  }
}

async function routeAdmin(
  url: URL,
  env: Env,
  request: Request,
  identity: AccessIdentity,
): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/admin/whoami" && request.method === "GET") {
    return handleAdminWhoami(env, request, identity);
  }
  if (path === "/api/admin/pipelines" && request.method === "GET") {
    return handleAdminPipelinesList(env, request);
  }
  if (path === "/api/admin/quality" && request.method === "GET") {
    return handleAdminQualityHistory(env, request, url);
  }
  if (path === "/api/admin/bronze" && request.method === "GET") {
    return handleAdminBronzeLog(env, request, url);
  }
  if (path === "/api/admin/audit" && request.method === "GET") {
    return handleAdminAuditLog(env, request, url);
  }

  const pauseMatch = path.match(/^\/api\/admin\/pipelines\/([^/]+)\/pause$/);
  if (pauseMatch && request.method === "POST") {
    return handleAdminSetPaused(env, request, pauseMatch[1]!, identity);
  }

  if (path === "/api/admin/pipelines/carbon/backfill" && request.method === "POST") {
    return handleAdminCarbonBackfill(env, request, identity);
  }

  const runMatch = path.match(/^\/api\/admin\/pipelines\/([^/]+)\/run$/);
  if (runMatch && request.method === "POST") {
    return handleAdminRunNow(env, request, runMatch[1]!, identity);
  }

  const bronzePayloadMatch = path.match(
    /^\/api\/admin\/bronze\/([^/]+)\/payload$/,
  );
  if (bronzePayloadMatch && request.method === "GET") {
    return handleAdminBronzePayload(env, request, bronzePayloadMatch[1]!);
  }

  return adminErrorJson(env, request, "unknown admin endpoint", 404, { path });
}
