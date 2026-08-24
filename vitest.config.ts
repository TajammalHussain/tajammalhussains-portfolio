import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Coverage is scoped to pure pipeline logic specifically (spec: "≥80%
      // coverage on pipeline logic" — transform functions, data-quality
      // checks, date/aggregation utilities). D1/R2-bound orchestration code
      // (persist.ts, run.ts, quality/run.ts) is exercised by the Miniflare
      // integration tests instead, per the spec's own unit/integration split
      // — it has no meaningful "logic" to unit test, only bindings to wire.
      include: [
        "worker/src/pipelines/*/transform.ts",
        "worker/src/pipelines/*/aggregate.ts",
        "worker/src/quality/checks.ts",
        "worker/src/lib/retry.ts",
      ],
      exclude: ["**/*.d.ts", "**/types.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@worker": path.resolve(__dirname, "worker/src"),
    },
  },
});
