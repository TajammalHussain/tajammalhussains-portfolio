import type { HousingGoldRow } from "./types";

/** "2026-06" -> "2026-05". Handles the January -> previous December rollover. */
export function previousMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-06" -> "2025-06". */
export function previousYear(period: string): string {
  const [year, month] = period.split("-");
  return `${Number(year) - 1}-${month}`;
}

/**
 * Computes month-on-month and year-on-year change for one region+period from
 * its own silver history — this pipeline's source API happens to publish
 * its own percentage-change fields, but gold is deliberately computed
 * independently from silver averages (same principle as Pipeline 1's
 * forecast-variance gold column), not a pass-through of the source's numbers.
 * `history` maps period -> average price for the "all" property type, for
 * whatever periods this region has in silver; missing comparison points
 * (e.g. no data 12 months back yet) yield a null change, not a fabricated one.
 */
export function computeHousingGoldRow(
  region: string,
  targetPeriod: string,
  history: ReadonlyMap<string, number>,
): HousingGoldRow | null {
  const targetPrice = history.get(targetPeriod);
  if (targetPrice === undefined) return null;

  const priorMonthPrice = history.get(previousMonth(targetPeriod));
  const priorYearPrice = history.get(previousYear(targetPeriod));

  return {
    period: targetPeriod,
    region,
    averagePrice: targetPrice,
    momChangePct: priorMonthPrice
      ? ((targetPrice - priorMonthPrice) / priorMonthPrice) * 100
      : null,
    yoyChangePct: priorYearPrice
      ? ((targetPrice - priorYearPrice) / priorYearPrice) * 100
      : null,
  };
}
