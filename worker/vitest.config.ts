import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
