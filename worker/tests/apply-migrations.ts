import { applyD1Migrations, env } from "cloudflare:test";

interface TestEnv {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
}

// Runs once before each isolated test-file's Worker environment, applying the
// same migrations/*.sql used in local/production deploys — so integration
// tests run against the real schema, not a hand-maintained copy of it.
const testEnv = env as unknown as TestEnv;
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
