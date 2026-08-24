// ─── api.carbonintensity.org.uk response shapes (bronze) ──────────────────────
// https://api.carbonintensity.org.uk — free, no API key, updates every 30 min.

export interface CarbonIntensityApiEntry {
  from: string; // ISO8601, e.g. "2026-01-01T00:00Z"
  to: string;
  intensity: {
    forecast: number;
    actual: number | null; // null until the period has actually elapsed
    index: "very low" | "low" | "moderate" | "high" | "very high";
  };
}

export interface CarbonIntensityApiResponse {
  data: CarbonIntensityApiEntry[];
}

export interface GenerationMixEntry {
  fuel: string; // "gas" | "coal" | "biomass" | "nuclear" | "hydro" | "imports" | "other" | "wind" | "solar"
  perc: number;
}

export interface GenerationApiResponse {
  data: {
    from: string;
    to: string;
    generationmix: GenerationMixEntry[];
  };
}

// Date-range generation endpoint returns an array of the same shape as `data` above
export interface GenerationRangeApiResponse {
  data: Array<{
    from: string;
    to: string;
    generationmix: GenerationMixEntry[];
  }>;
}

// ─── Silver row shapes ──────────────────────────────────────────────────────────

export interface CarbonReadingSilverRow {
  periodFrom: string;
  periodTo: string;
  actualIntensity: number | null;
  forecastIntensity: number;
  indexBand: string;
}

export interface GenerationMixSilverRow {
  periodFrom: string;
  fuelType: string;
  percentage: number;
}

// ─── Gold row shapes ────────────────────────────────────────────────────────────

export interface CarbonDailyGoldRow {
  date: string; // YYYY-MM-DD
  avgActualIntensity: number | null;
  avgForecastIntensity: number;
  minIntensity: number | null;
  minIntensityPeriod: string | null;
  maxIntensity: number | null;
  maxIntensityPeriod: string | null;
  forecastVariancePct: number | null;
  readingCount: number;
}

export interface FuelMixGoldRow {
  date: string;
  fuelType: string;
  avgShare: number;
}
