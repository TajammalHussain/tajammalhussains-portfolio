// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import astroPlugin from "eslint-plugin-astro";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      ".lighthouseci/**",
      "worker/dist/**",
      "worker/.wrangler/**",
      "public/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astroPlugin.configs.recommended,
  {
    rules: {
      // Astro components routinely accept props/slots that aren't otherwise
      // referenced (e.g. layout wrappers) — the TS compiler's own noUnusedLocals
      // (enabled via astro/tsconfigs/strict) already covers real dead code.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  },
  {
    // Worker code runs in the Cloudflare Workers runtime, not the browser —
    // its own tsconfig/typecheck (npm --prefix worker run typecheck) is the
    // real type-safety gate; skip Astro-flavoured linting for it here.
    files: ["worker/**"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Node build/verification scripts (OG image generation, the local
    // Lighthouse wrapper) — plain Node ESM, not bundled through Vite.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Astro's own generated triple-slash reference — required by Astro's
    // tooling, not something to "fix" into an import.
    files: ["src/env.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },
);
