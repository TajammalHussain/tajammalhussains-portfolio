export interface Env {
  DB: D1Database;
  BRONZE_BUCKET: R2Bucket;
  CACHE_KV: KVNamespace;
  ENVIRONMENT: string;
  MAX_BACKFILL_DAYS_PER_RUN: string;
  API_CACHE_TTL_SECONDS: string;
  // Secrets — set via `wrangler secret put`, undefined in local dev unless
  // present in worker/.dev.vars
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}
