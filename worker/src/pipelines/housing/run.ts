import type { Env } from "../../lib/env";
import {
  fetchAndLandBronze,
  readBronzeJson,
  markBronzeProcessed,
} from "../../lib/bronze";
import {
  startPipelineRun,
  finishPipelineRun,
  isPipelinePaused,
  type TriggerType,
} from "../../lib/pipelineRuns";
import { logger } from "../../lib/logger";
import { runHousingQualityChecks } from "../../quality/run";
import {
  HOUSING_REGIONS,
  isMissingMonth,
  type UkHpiApiResponse,
} from "./types";
import { transformRegionToSilverRows } from "./transform";
import { computeHousingGoldRow } from "./aggregate";
import {
  upsertHousingSilver,
  upsertHousingGold,
  getAllPropertyTypeHistory,
} from "./persist";

const BASE_URL = "https://landregistry.data.gov.uk/data/ukhpi/region";
// UK HPI publishes with roughly a 2-month lag; 6 covers that with margin
// without probing indefinitely if the source ever goes quiet for longer.
const MAX_MONTHS_BACK = 6;

function regionUrl(regionSlug: string, period: string): string {
  return `${BASE_URL}/${regionSlug}/month/${period}.json`;
}

function monthsAgo(from: Date, count: number): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - count, 1),
  );
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Runs one full cycle of Pipeline 2: probe HM Land Registry's UK HPI for the
 * most recently published month (walking backward from the current month,
 * since publication lags by ~2 months and varies), then bronze -> silver ->
 * gold for every configured region for that month, then data quality checks.
 * Every probe — hit or miss — is landed in bronze, so the audit trail shows
 * exactly what was checked, not just what was found.
 */
export async function runHousingPipeline(
  env: Env,
  triggerType: TriggerType = "cron",
) {
  if (await isPipelinePaused(env, "housing")) {
    logger.info("housing pipeline is paused — skipping run", {
      pipeline: "housing",
    });
    return { skipped: true as const };
  }

  const runId = await startPipelineRun(env, "housing", triggerType);
  logger.info("housing pipeline run started", {
    pipeline: "housing",
    runId,
    triggerType,
  });

  try {
    const now = new Date();
    let targetPeriod: string | null = null;
    let ukBronzeId: number | null = null;
    let ukRows: ReturnType<typeof transformRegionToSilverRows> = [];
    let bronzeCount = 0;

    for (let back = 0; back <= MAX_MONTHS_BACK; back++) {
      const period = monthsAgo(now, back);
      const bronze = await fetchAndLandBronze(env, {
        pipeline: "housing",
        kind: `united-kingdom-${period}`,
        url: regionUrl("united-kingdom", period),
      });
      bronzeCount++;
      const payload = await readBronzeJson<UkHpiApiResponse>(env, bronze.r2Key);
      await markBronzeProcessed(env, bronze.bronzeId);

      if (!isMissingMonth(payload)) {
        targetPeriod = period;
        ukBronzeId = bronze.bronzeId;
        ukRows = transformRegionToSilverRows("united-kingdom", payload);
        break;
      }
      logger.info("UK HPI month not yet published — trying earlier", {
        pipeline: "housing",
        period,
      });
    }

    if (!targetPeriod || ukBronzeId === null) {
      throw new Error(
        `no published UK HPI month found in the last ${MAX_MONTHS_BACK} months`,
      );
    }

    let transformedCount = ukRows.length;
    let silverWritten = await upsertHousingSilver(env, ukRows, ukBronzeId);

    const otherRegions = HOUSING_REGIONS.filter(
      (r) => r.slug !== "united-kingdom",
    );
    for (const region of otherRegions) {
      const bronze = await fetchAndLandBronze(env, {
        pipeline: "housing",
        kind: region.slug,
        url: regionUrl(region.slug, targetPeriod),
      });
      bronzeCount++;
      const payload = await readBronzeJson<UkHpiApiResponse>(env, bronze.r2Key);
      const rows = transformRegionToSilverRows(region.slug, payload);
      transformedCount += rows.length;
      silverWritten += await upsertHousingSilver(env, rows, bronze.bronzeId);
      await markBronzeProcessed(env, bronze.bronzeId);
    }

    const goldRows = [];
    for (const region of HOUSING_REGIONS) {
      const history = await getAllPropertyTypeHistory(env, region.slug);
      const row = computeHousingGoldRow(region.slug, targetPeriod, history);
      if (row) goldRows.push(row);
    }
    const goldWritten = await upsertHousingGold(env, goldRows);

    await runHousingQualityChecks(
      env,
      silverWritten,
      transformedCount,
      HOUSING_REGIONS.length,
    );

    await finishPipelineRun(env, runId, {
      status: "success",
      rowsBronze: bronzeCount,
      rowsSilver: silverWritten,
      rowsGold: goldWritten,
    });

    logger.info("housing pipeline run finished", {
      pipeline: "housing",
      runId,
      targetPeriod,
      rowsSilver: silverWritten,
      rowsGold: goldWritten,
    });

    return {
      skipped: false as const,
      runId,
      targetPeriod,
      rowsSilver: silverWritten,
      rowsGold: goldWritten,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("housing pipeline run failed", {
      pipeline: "housing",
      runId,
      error: message,
    });
    await finishPipelineRun(env, runId, {
      status: "failed",
      errorDetail: message,
    });
    throw err;
  }
}
