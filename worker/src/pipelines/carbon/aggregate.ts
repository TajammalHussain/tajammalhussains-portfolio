// Pure silver → gold aggregation functions.
import type {
  CarbonReadingSilverRow,
  GenerationMixSilverRow,
  CarbonDailyGoldRow,
  FuelMixGoldRow,
} from "./types";

const dateOf = (isoTimestamp: string) => isoTimestamp.slice(0, 10); // YYYY-MM-DD

/**
 * Groups silver readings by UTC date and computes the daily gold aggregate for
 * each date present in the input. Readings with `actualIntensity === null`
 * (period hasn't happened yet, or actual not yet published) are excluded from
 * actual-based aggregates but still count toward `readingCount` and the
 * forecast average.
 */
export function computeDailyGold(readings: CarbonReadingSilverRow[]): CarbonDailyGoldRow[] {
  const byDate = new Map<string, CarbonReadingSilverRow[]>();
  for (const r of readings) {
    const date = dateOf(r.periodFrom);
    const bucket = byDate.get(date) ?? [];
    bucket.push(r);
    byDate.set(date, bucket);
  }

  const results: CarbonDailyGoldRow[] = [];
  for (const [date, dayReadings] of byDate) {
    const withActual = dayReadings.filter(
      (r): r is CarbonReadingSilverRow & { actualIntensity: number } =>
        r.actualIntensity !== null,
    );

    const avgForecastIntensity = average(dayReadings.map((r) => r.forecastIntensity));
    const avgActualIntensity = withActual.length
      ? average(withActual.map((r) => r.actualIntensity))
      : null;

    let minRow: (typeof withActual)[number] | undefined;
    let maxRow: (typeof withActual)[number] | undefined;
    for (const r of withActual) {
      if (!minRow || r.actualIntensity < minRow.actualIntensity) minRow = r;
      if (!maxRow || r.actualIntensity > maxRow.actualIntensity) maxRow = r;
    }

    results.push({
      date,
      avgActualIntensity,
      avgForecastIntensity,
      minIntensity: minRow?.actualIntensity ?? null,
      minIntensityPeriod: minRow?.periodFrom ?? null,
      maxIntensity: maxRow?.actualIntensity ?? null,
      maxIntensityPeriod: maxRow?.periodFrom ?? null,
      forecastVariancePct:
        avgActualIntensity !== null && avgForecastIntensity !== 0
          ? ((avgActualIntensity - avgForecastIntensity) / avgForecastIntensity) * 100
          : null,
      readingCount: dayReadings.length,
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/** Groups fuel-mix silver rows by date and computes each fuel type's average share. */
export function computeFuelMixGold(rows: GenerationMixSilverRow[]): FuelMixGoldRow[] {
  const byDateFuel = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${dateOf(r.periodFrom)}::${r.fuelType}`;
    const bucket = byDateFuel.get(key) ?? [];
    bucket.push(r.percentage);
    byDateFuel.set(key, bucket);
  }

  return Array.from(byDateFuel.entries())
    .map(([key, shares]) => {
      const [date, fuelType] = key.split("::") as [string, string];
      return { date, fuelType, avgShare: average(shares) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.fuelType.localeCompare(b.fuelType));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
