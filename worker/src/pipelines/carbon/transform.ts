// Pure bronze → silver transform functions. No Cloudflare bindings — directly
// unit-testable with fixture payloads (see tests/unit/carbon-transform.test.ts).
import type {
  CarbonIntensityApiResponse,
  GenerationApiResponse,
  GenerationRangeApiResponse,
  CarbonReadingSilverRow,
  GenerationMixSilverRow,
} from "./types";

export class InvalidPayloadError extends Error {}

/** Parses/validates the intensity endpoint response into typed silver rows. */
export function transformIntensityToSilver(
  payload: CarbonIntensityApiResponse,
): CarbonReadingSilverRow[] {
  if (!payload || !Array.isArray(payload.data)) {
    throw new InvalidPayloadError("intensity payload missing data[] array");
  }

  return payload.data.map((entry) => {
    if (!entry.from || !entry.to) {
      throw new InvalidPayloadError(`intensity entry missing from/to: ${JSON.stringify(entry)}`);
    }
    if (typeof entry.intensity?.forecast !== "number") {
      throw new InvalidPayloadError(
        `intensity entry missing numeric forecast: ${JSON.stringify(entry)}`,
      );
    }
    const validBands = ["very low", "low", "moderate", "high", "very high"];
    if (!validBands.includes(entry.intensity.index)) {
      throw new InvalidPayloadError(`unexpected index band: ${entry.intensity.index}`);
    }

    return {
      periodFrom: entry.from,
      periodTo: entry.to,
      actualIntensity:
        typeof entry.intensity.actual === "number" ? entry.intensity.actual : null,
      forecastIntensity: entry.intensity.forecast,
      indexBand: entry.intensity.index,
    };
  });
}

/** Parses the "current" generation mix endpoint (single period). */
export function transformGenerationToSilver(
  payload: GenerationApiResponse,
): GenerationMixSilverRow[] {
  if (!payload?.data?.generationmix || !Array.isArray(payload.data.generationmix)) {
    throw new InvalidPayloadError("generation payload missing data.generationmix[]");
  }
  return normaliseGenerationMix(payload.data.from, payload.data.generationmix);
}

/** Parses the date-range generation mix endpoint (used for backfill). */
export function transformGenerationRangeToSilver(
  payload: GenerationRangeApiResponse,
): GenerationMixSilverRow[] {
  if (!payload || !Array.isArray(payload.data)) {
    throw new InvalidPayloadError("generation range payload missing data[]");
  }
  return payload.data.flatMap((period) => normaliseGenerationMix(period.from, period.generationmix));
}

function normaliseGenerationMix(
  periodFrom: string,
  mix: Array<{ fuel: string; perc: number }>,
): GenerationMixSilverRow[] {
  if (!periodFrom) {
    throw new InvalidPayloadError("generation mix entry missing period start");
  }
  const total = mix.reduce((sum, m) => sum + m.perc, 0);
  // The API's percentages should sum to ~100 — a wide deviation indicates a
  // malformed or partial payload worth failing loudly on rather than silently
  // ingesting (this doubles as a validity data-quality signal at ingest time).
  if (total < 90 || total > 110) {
    throw new InvalidPayloadError(
      `generation mix percentages sum to ${total.toFixed(1)}, expected ~100`,
    );
  }
  return mix.map((m) => {
    if (typeof m.perc !== "number" || m.perc < 0 || m.perc > 100) {
      throw new InvalidPayloadError(`invalid fuel percentage for ${m.fuel}: ${m.perc}`);
    }
    return { periodFrom, fuelType: m.fuel, percentage: m.perc };
  });
}
