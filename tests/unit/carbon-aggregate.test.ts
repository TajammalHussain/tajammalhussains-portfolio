import { describe, it, expect } from "vitest";
import {
  computeDailyGold,
  computeFuelMixGold,
} from "@worker/pipelines/carbon/aggregate";
import { transformIntensityToSilver } from "@worker/pipelines/carbon/transform";
import intensityDay from "../fixtures/carbon-intensity-day.json";
import type { GenerationMixSilverRow } from "@worker/pipelines/carbon/types";

describe("computeDailyGold", () => {
  const rows = transformIntensityToSilver(intensityDay);

  it("computes exactly one gold row for a single-date input", () => {
    const gold = computeDailyGold(rows);
    expect(gold).toHaveLength(1);
    expect(gold[0].date).toBe("2026-01-01");
  });

  it("counts every reading, including ones with a null actual", () => {
    const gold = computeDailyGold(rows);
    expect(gold[0].readingCount).toBe(5);
  });

  it("computes avgActualIntensity only from readings with a non-null actual", () => {
    const gold = computeDailyGold(rows);
    // actual values: 75, 60, 35, 160 (period 5 is null and excluded)
    expect(gold[0].avgActualIntensity).toBeCloseTo((75 + 60 + 35 + 160) / 4, 5);
  });

  it("finds the correct min and max intensity periods", () => {
    const gold = computeDailyGold(rows);
    expect(gold[0].minIntensity).toBe(35);
    expect(gold[0].minIntensityPeriod).toBe("2026-01-01T01:00Z");
    expect(gold[0].maxIntensity).toBe(160);
    expect(gold[0].maxIntensityPeriod).toBe("2026-01-01T01:30Z");
  });

  it("computes forecast variance as a percentage of the forecast average", () => {
    const gold = computeDailyGold(rows);
    const avgForecast = (80 + 70 + 40 + 150 + 90) / 5;
    const avgActual = (75 + 60 + 35 + 160) / 4;
    const expectedVariance = ((avgActual - avgForecast) / avgForecast) * 100;
    expect(gold[0].forecastVariancePct).toBeCloseTo(expectedVariance, 5);
  });

  it("returns an empty array for empty input", () => {
    expect(computeDailyGold([])).toEqual([]);
  });

  it("splits readings across two different dates into two gold rows", () => {
    const twoDayRows = [
      ...rows,
      {
        periodFrom: "2026-01-02T00:00Z",
        periodTo: "2026-01-02T00:30Z",
        actualIntensity: 100,
        forecastIntensity: 100,
        indexBand: "moderate",
      },
    ];
    const gold = computeDailyGold(twoDayRows);
    expect(gold.map((g) => g.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("reports null aggregates (not zero) for a date with no actuals at all", () => {
    const onlyForecast = [
      {
        periodFrom: "2026-02-01T00:00Z",
        periodTo: "2026-02-01T00:30Z",
        actualIntensity: null,
        forecastIntensity: 50,
        indexBand: "moderate",
      },
    ];
    const gold = computeDailyGold(onlyForecast);
    expect(gold[0].avgActualIntensity).toBeNull();
    expect(gold[0].minIntensity).toBeNull();
    expect(gold[0].forecastVariancePct).toBeNull();
  });
});

describe("computeFuelMixGold", () => {
  it("averages each fuel type's share within a date", () => {
    const rows: GenerationMixSilverRow[] = [
      { periodFrom: "2026-01-01T00:00Z", fuelType: "wind", percentage: 20 },
      { periodFrom: "2026-01-01T00:30Z", fuelType: "wind", percentage: 30 },
      { periodFrom: "2026-01-01T00:00Z", fuelType: "gas", percentage: 10 },
    ];
    const gold = computeFuelMixGold(rows);
    expect(gold).toContainEqual({
      date: "2026-01-01",
      fuelType: "wind",
      avgShare: 25,
    });
    expect(gold).toContainEqual({
      date: "2026-01-01",
      fuelType: "gas",
      avgShare: 10,
    });
  });

  it("returns an empty array for empty input", () => {
    expect(computeFuelMixGold([])).toEqual([]);
  });
});
