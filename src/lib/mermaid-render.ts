// Renders Mermaid diagrams to static SVG at BUILD time instead of shipping
// the ~680KB Mermaid runtime to every visitor's browser. Diagrams on this
// site are static, unchanging content (an architecture flowchart), so there
// is no reason to pay that cost client-side — Lighthouse's performance
// audit caught exactly this (mermaid.core.js: 683KB, 68% unused, ~800ms
// bootup time on every page with a diagram).
//
// Mermaid's renderer manipulates real SVG/DOM APIs (via d3) and measures
// text with getBBox(), so it genuinely needs a browser engine, not just
// Node — this uses Playwright's bundled Chromium (already a devDependency
// for E2E tests) rather than adding a new dependency like puppeteer.
//
// Loads node_modules/mermaid/dist/mermaid.js specifically — the fully
// self-contained UMD/IIFE build (exposes `window.mermaid`, everything
// including d3/dompurify/cytoscape inlined) — NOT mermaid.core.mjs, which
// has real bare-specifier ESM imports ("d3", "dompurify", ...) that only
// resolve inside a bundler; loading it directly in a bare browser page
// throws "Cannot use import statement outside a module".
import { chromium, type Browser, type Page } from "@playwright/test";
import path from "node:path";

const MERMAID_UMD_BUNDLE_PATH = path.resolve(
  process.cwd(),
  "node_modules/mermaid/dist/mermaid.js",
);

let browserPromise: Promise<Browser> | null = null;
let pagePromise: Promise<Page> | null = null;
const svgCache = new Map<string, string>();

async function getRenderPage(): Promise<Page> {
  browserPromise ??= chromium.launch();
  const browser = await browserPromise;
  pagePromise ??= (async () => {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ path: MERMAID_UMD_BUNDLE_PATH });
    await page.evaluate(() => {
      // @ts-expect-error — mermaid is attached to window by the UMD bundle just loaded
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        flowchart: { htmlLabels: false },
      });
    });
    return page;
  })();
  return pagePromise;
}

/** Renders one Mermaid chart definition to an inline SVG string. Memoized — the same diagram source across multiple pages is only rendered once. */
export async function renderMermaidToSvg(chart: string): Promise<string> {
  const cached = svgCache.get(chart);
  if (cached) return cached;

  const page = await getRenderPage();
  const svg = await page.evaluate(async (chartSource) => {
    const id = `mmd-${Math.random().toString(36).slice(2)}`;
    // @ts-expect-error — mermaid is attached to window in the page context, not visible to this file's own types
    const result = await window.mermaid.render(id, chartSource);
    return result.svg;
  }, chart);

  svgCache.set(chart, svg);
  return svg;
}

/** Must be called once after the whole Astro build finishes — see the astro:build:done hook in astro.config.mjs — otherwise the held browser process keeps the build from exiting. */
export async function closeMermaidRenderer(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
  pagePromise = null;
}
