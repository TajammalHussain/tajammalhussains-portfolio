// Shared HTTP helpers: CORS, JSON responses, KV-backed caching, and a simple
// fixed-window rate limiter. Kept dependency-free and Cloudflare-binding-light
// so the response-shaping logic is easy to reason about.
import type { Env } from "./env";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

export function errorJson(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return json({ error: message, ...extra }, { status });
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * CORS for /api/admin/* only. Unlike the public API's `Access-Control-Allow-Origin: *`,
 * these requests carry the CF_Authorization cookie, so the origin must be
 * checked against an allow-list rather than reflected or wildcarded — a
 * wildcard plus credentials would let any site read another user's
 * authenticated admin responses.
 */
export function adminCorsHeaders(
  env: Env,
  request: Request,
): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = env.ADMIN_ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function adminJson(
  env: Env,
  request: Request,
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...adminCorsHeaders(env, request),
      ...init.headers,
    },
  });
}

export function adminErrorJson(
  env: Env,
  request: Request,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
): Response {
  return adminJson(env, request, { error: message, ...extra }, { status });
}

export function adminCorsPreflight(env: Env, request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: adminCorsHeaders(env, request),
  });
}

/**
 * Reads from KV first; on a miss, calls `compute()`, caches the result for
 * `ttlSeconds`, and returns it. Cache-Control is set to match so browsers /
 * CDN agree with the KV TTL rather than caching indefinitely.
 */
export async function withCache<T>(
  env: Env,
  cacheKey: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<{ data: T; cacheHit: boolean }> {
  const cached = await env.CACHE_KV.get(cacheKey, "json");
  if (cached !== null) {
    return { data: cached as T, cacheHit: true };
  }
  const data = await compute();
  await env.CACHE_KV.put(cacheKey, JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
  return { data, cacheHit: false };
}

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 60; // per IP per window — generous for a portfolio API

/** Simple fixed-window rate limiter backed by KV. Fails open on KV errors. */
export async function checkRateLimit(
  env: Env,
  request: Request,
): Promise<boolean> {
  try {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const window = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS);
    const key = `ratelimit:${ip}:${window}`;
    const current = Number((await env.CACHE_KV.get(key)) ?? "0");
    if (current >= RATE_LIMIT_MAX_REQUESTS) return false;
    await env.CACHE_KV.put(key, String(current + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 5,
    });
    return true;
  } catch {
    return true; // fail open — a KV hiccup should never take the public API down
  }
}
