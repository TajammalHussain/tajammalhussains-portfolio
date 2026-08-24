import type { Env } from "../../lib/env";
import { fetchAndLandBronze, readBronzeJson, markBronzeProcessed } from "../../lib/bronze";
import { startPipelineRun, finishPipelineRun, isPipelinePaused, type TriggerType } from "../../lib/pipelineRuns";
import { logger } from "../../lib/logger";
import { runCarbonQualityChecks } from "../../quality/run";
import {
  transformIntensityToSilver,
  transformGenerationToSilver,
} from "./transform";
import { computeDailyGold, computeFuelMixGold } from "./aggregate";
import {
  upsertCarbonReadings,
  upsertGenerationMix,
  upsertDailyGold,
  upsertFuelMixGold,
  getSilverReadingsForDates,
  getGenerationMixForDates,
} from "./persist";
import type { CarbonIntensityApiResponse, GenerationApiResponse } from "./types";

const INTENSITY_URL = "https://api.carbonintensity.org.uk/intensity";
const GENERATION_URL = "https://api.carbonintensity.org.uk/generation";

/**
 * Runs one full cycle of Pipeline 1: bronze (land raw) → silver (parse,
 * validate, upsert) → gold (recompute daily aggregates) → data quality checks
 * → run history. This is what the every-30-minutes cron trigger calls, and
 * what the admin ops "run now" / "re-run failed job" actions call too — same
 * code path either way, only `triggerType` differs.
 */
export async function runCarbonPipeline(env: Env, triggerType: TriggerType = "cron") {
  if (await isPipelinePaused(env, "carbon")) {
    logger.info("carbon pipeline is paused — skipping run", { pipeline: "carbon" });
    return { skipped: true as const };
  }

  const runId = await startPipelineRun(env, "carbon", triggerType);
  logger.info("carbon pipeline run started", { pipeline: "carbon", runId, triggerType });

  try {
    // ── Bronze ──────────────────────────────────────────────────────────────
    const intensityBronze = await fetchAndLandBronze(env, {
      pipeline: "carbon",
      kind: "intensity",
      url: INTENSITY_URL,
    });
    const generationBronze = await fetchAndLandBronze(env, {
      pipeline: "carbon",
      kind: "generation",
      url: GENERATION_URL,
    });

    // ── Silver ──────────────────────────────────────────────────────────────
    // Read back from R2 (not the in-memory fetch) — bronze is the real source
    // of truth for every downstream step, per the medallion pattern.
    const intensityPayload = await readBronzeJson<CarbonIntensityApiResponse>(
      env,
      intensityBronze.r2Key,
    );
    const generationPayload = await readBronzeJson<GenerationApiResponse>(
      env,
      generationBronze.r2Key,
    );

    const readingRows = transformIntensityToSilver(intensityPayload);
    const mixRows = transformGenerationToSilver(generationPayload);

    const readingsWritten = await upsertCarbonReadings(env, readingRows, intensityBronze.bronzeId);
    const mixWritten = await upsertGenerationMix(env, mixRows, generationBronze.bronzeId);

    await markBronzeProcessed(env, intensityBronze.bronzeId);
    await markBronzeProcessed(env, generationBronze.bronzeId);

    // ── Gold ────────────────────────────────────────────────────────────────
    const affectedDates = Array.from(
      new Set([...readingRows, ...mixRows].map((r) => r.periodFrom.slice(0, 10))),
    );
    const silverForDates = await getSilverReadingsForDates(env, affectedDates);
    const mixForDates = await getGenerationMixForDates(env, affectedDates);
    const dailyGold = computeDailyGold(silverForDates);
    const fuelMixGold = computeFuelMixGold(mixForDates);
    const goldWritten =
      (await upsertDailyGold(env, dailyGold)) + (await upsertFuelMixGold(env, fuelMixGold));

    // ── Data quality ────────────────────────────────────────────────────────
    await runCarbonQualityChecks(env, readingsWritten, readingRows.length);

    await finishPipelineRun(env, runId, {
      status: "success",
      rowsBronze: 2,
      rowsSilver: readingsWritten + mixWritten,
      rowsGold: goldWritten,
    });

    logger.info("carbon pipeline run finished", {
      pipeline: "carbon",
      runId,
      rowsSilver: readingsWritten + mixWritten,
      rowsGold: goldWritten,
    });

    return {
      skipped: false as const,
      runId,
      rowsSilver: readingsWritten + mixWritten,
      rowsGold: goldWritten,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("carbon pipeline run failed", { pipeline: "carbon", runId, error: message });
    await finishPipelineRun(env, runId, { status: "failed", errorDetail: message });
    throw err;
  }
}
