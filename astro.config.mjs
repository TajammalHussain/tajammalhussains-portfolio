// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Full production domain — used for canonical URLs, sitemap, RSS, and OG tags.
const SITE_URL = "https://tajammalhussains.uk";

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
