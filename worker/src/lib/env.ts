export interface Env {
  DB: D1Database;
  BRONZE_BUCKET: R2Bucket;
  CACHE_KV: KVNamespace;
  ENVIRONMENT: string;
  MAX_BACKFILL_DAYS_PER_RUN: string;
  API_CACHE_TTL_SECONDS: string;
  // Comma-separated origins allowed to make credentialed requests to
  // /api/admin/* (the ops dashboard's own origin, plus localhost for dev).
  // Never "*" — admin CORS carries cookies, so the origin must be checked.
  ADMIN_ALLOWED_ORIGINS: string;
  // Secrets — set via `wrangler secret put`, undefined in local dev unless
  // present in worker/.dev.vars
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  // GitHub OAuth App backing the /admin/content CMS's write access to the
  // repo. Client ID is not secret (it's public in the authorize URL), but is
  // still only set via wrangler.toml [vars] once a real OAuth App exists.
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  // Shared secret CI presents (as `Authorization: Bearer <secret>`) when
  // reporting a real deploy/build event to the meta-pipeline — see
  // routes/meta.ts. Not Cloudflare Access, because CI can't do interactive
  // SSO; not a public endpoint, because anyone could otherwise inject fake
  // deploy history.
  META_INGEST_SECRET?: string;
}
