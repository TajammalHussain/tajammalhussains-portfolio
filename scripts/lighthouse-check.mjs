#!/usr/bin/env node
// Runs Lighthouse against the built preview server and asserts every
// category scores >= 0.95 (spec: "Lighthouse CI, >=95 all four categories").
//
// This exists instead of a plain `lhci autorun` because of a real,
// reproducible bug in this environment: chrome-launcher@1.2.1 (bundled with
// lighthouse@12) crashes with `EPERM` in its post-run temp-directory cleanup
// on Windows + Node 24 — confirmed by running bare `lighthouse` directly
// against an unrelated external URL, which crashes identically. The crash
// happens strictly AFTER the report JSON is already written to disk, so it's
// safe to treat a lighthouse child-process failure as non-fatal as long as
// its output file exists and parses — which is what this script does. `lhci
// autorun` itself does not tolerate that child crash and aborts the whole
// multi-URL run, hence not using it directly here. This is a Windows-local
// dev workaround; the GitHub Actions CI runs on Ubuntu, where this specific
// chrome-launcher/Node-version interaction has not been observed.
import { spawn, execFile } from "node:child_process";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const PATHS = [
  "/",
  "/work",
  "/work/approval-workflow-platform",
  "/live",
  "/live/carbon",
  "/live/housing",
  "/live/meta",
  "/about",
  "/cv",
  "/api",
  "/status",
  "/writing",
];
const THRESHOLD = 0.95;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs)
        return reject(new Error(`server did not start within ${timeoutMs}ms`));
      setTimeout(tick, 500);
    };
    tick();
  });
}

function runLighthouse(url, outputPath) {
  return new Promise((resolve) => {
    execFile(
      "npx",
      [
        "lighthouse",
        url,
        "--output=json",
        `--output-path=${outputPath}`,
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
        "--only-categories=" + CATEGORIES.join(","),
        "--quiet",
      ],
      { shell: true, windowsHide: true },
      () => resolve(), // exit code intentionally ignored — see file header
    );
  });
}

async function main() {
  const preview = spawn(
    "npm",
    ["run", "preview", "--", "--port", String(PORT)],
    {
      shell: true,
      stdio: "ignore",
    },
  );

  const results = [];
  try {
    await waitForServer(BASE);

    const workDir = await mkdtemp(path.join(tmpdir(), "lhcheck-"));
    for (const p of PATHS) {
      const outputPath = path.join(
        workDir,
        `${p.replace(/\//g, "_") || "root"}.json`,
      );
      await runLighthouse(`${BASE}${p}`, outputPath);
      try {
        const report = JSON.parse(await readFile(outputPath, "utf-8"));
        const scores = Object.fromEntries(
          CATEGORIES.map((c) => [c, report.categories[c]?.score ?? null]),
        );
        results.push({ path: p, scores });
      } catch (err) {
        results.push({ path: p, scores: null, error: String(err) });
      }
    }
    await rm(workDir, { recursive: true, force: true });
  } finally {
    preview.kill();
  }

  let allPass = true;
  console.log("\nLighthouse results (threshold: %s):\n", THRESHOLD);
  for (const r of results) {
    if (!r.scores) {
      allPass = false;
      console.log(`✗ ${r.path} — FAILED TO RUN: ${r.error}`);
      continue;
    }
    let rowPass = true;
    const line = CATEGORIES.map((c) => {
      const score = r.scores[c];
      const pass = score !== null && score >= THRESHOLD;
      if (!pass) rowPass = false;
      return `${c}=${score === null ? "n/a" : score.toFixed(2)}${pass ? "" : " ✗"}`;
    }).join("  ");
    if (!rowPass) allPass = false;
    console.log(`${rowPass ? "✓" : "✗"} ${r.path.padEnd(35)} ${line}`);
  }

  if (!allPass) {
    console.error(
      "\nOne or more pages scored below the threshold in one or more categories.",
    );
    process.exit(1);
  }
  console.log("\nAll pages meet the >=0.95 threshold in all four categories.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
