#!/usr/bin/env node
// Generates real Open Graph share-preview images at build time — one
// default (site name + tagline) plus one per case study and writing post
// (real title, no photo). Text-only cards, not fabricated screenshots or
// stock photography: honest about what this site actually is.
//
// Runs before `astro build` (see package.json) because these files need to
// already exist in public/ by the time Astro copies that directory — Astro
// doesn't know or care how they got there.
import { chromium } from "@playwright/test";
import { readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SITE_NAME = "Tajammal Hussain";
const SITE_TAGLINE = "Data infrastructure that runs itself";
const ACCENT = "#2563eb";

function extractFrontmatterField(source, field) {
  const match = source.match(new RegExp(`^${field}:\\s*"([^"]+)"`, "m"));
  return match?.[1] ?? null;
}

function cardHtml({ eyebrow, title }) {
  return `<!doctype html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    display: flex; flex-direction: column; justify-content: center;
    padding: 90px;
    background: linear-gradient(135deg, #0b1120 0%, #111827 100%);
    font-family: -apple-system, "Segoe UI", Inter, Roboto, sans-serif;
  }
  .eyebrow { color: ${ACCENT}; font-size: 28px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; }
  .title { color: #ffffff; font-size: 56px; font-weight: 700; line-height: 1.2; margin-top: 24px; max-width: 950px; }
  .footer { display: flex; align-items: center; gap: 16px; position: absolute; bottom: 90px; left: 90px; }
  .dot { width: 14px; height: 14px; border-radius: 999px; background: ${ACCENT}; }
  .name { color: #94a3b8; font-size: 28px; font-weight: 500; }
</style>
</head>
<body>
  <div class="eyebrow">${eyebrow}</div>
  <div class="title">${title}</div>
  <div class="footer"><span class="dot"></span><span class="name">${SITE_NAME}</span></div>
</body>
</html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
  });

  async function render(html, outputPath) {
    await page.setContent(html);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath });
    console.log(`generated ${path.relative(ROOT, outputPath)}`);
  }

  await render(
    cardHtml({ eyebrow: "Portfolio", title: SITE_TAGLINE }),
    path.join(ROOT, "public/og/default.png"),
  );

  const caseStudiesDir = path.join(ROOT, "src/content/case-studies");
  for (const file of await readdir(caseStudiesDir)) {
    if (!file.endsWith(".mdx")) continue;
    const slug = file.replace(/\.mdx$/, "");
    const source = await readFile(path.join(caseStudiesDir, file), "utf-8");
    const title = extractFrontmatterField(source, "title") ?? slug;
    await render(
      cardHtml({ eyebrow: "Case Study", title }),
      path.join(ROOT, `public/og/work/${slug}.png`),
    );
  }

  const writingDir = path.join(ROOT, "src/content/writing");
  for (const file of await readdir(writingDir)) {
    if (!file.endsWith(".md")) continue;
    const slug = file.replace(/\.md$/, "");
    const source = await readFile(path.join(writingDir, file), "utf-8");
    const title = extractFrontmatterField(source, "title") ?? slug;
    await render(
      cardHtml({ eyebrow: "Writing", title }),
      path.join(ROOT, `public/og/writing/${slug}.png`),
    );
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
