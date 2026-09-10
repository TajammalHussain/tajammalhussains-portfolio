// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { closeMermaidRenderer } from "./src/lib/mermaid-render.ts";

// Full production domain — used for canonical URLs, sitemap, RSS, and OG tags.
// tajammalhussains.uk still resolves to the same deployment and serves
// identical content, but this domain is the canonical one search engines
// and social previews should point to.
const SITE_URL = "https://tajammalhussain.co.uk";

// Mermaid diagrams render to static SVG at build time via a Playwright-
// controlled Chromium instance (see src/lib/mermaid-render.ts) — that
// browser process must be explicitly closed once the build finishes, or its
// open handle keeps `astro build` from ever exiting.
const closeMermaidBrowserAfterBuild = {
  name: "close-mermaid-renderer",
  hooks: {
    "astro:build:done": async () => {
      await closeMermaidRenderer();
    },
  },
};

export default defineConfig({
  site: SITE_URL,
  output: "static",
  integrations: [
    mdx(),
    sitemap({
      // Admin surfaces are deliberately excluded from the sitemap (spec 11.4) —
      // they should never be advertised to crawlers.
      filter: (page) => !page.includes("/admin/"),
    }),
    closeMermaidBrowserAfterBuild,
  ],
  vite: {
    // `@tailwindcss/vite` currently depends on vite@5 while Astro 5.x bundles
    // vite@6 internally — two structurally-identical-but-nominally-distinct
    // copies of the Vite `Plugin` type, which TypeScript (correctly, if
    // unhelpfully) refuses to unify. This does not affect runtime behaviour —
    // verified the compiled CSS is injected correctly in dev — so the cast is
    // safe. Revisit once the two packages converge on the same vite major.
    plugins: [/** @type {any} */ (tailwindcss())],
  },
  image: {
    // Astro's built-in image service handles WebP/AVIF + explicit dimensions
    // automatically for anything imported via <Image />.
    domains: [],
  },
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
