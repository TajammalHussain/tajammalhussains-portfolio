import { describe, it, expect } from "vitest";
import {
  transformIntensityToSilver,
  transformGenerationToSilver,
  transformGenerationRangeToSilver,
  InvalidPayloadError,
} from "@worker/pipelines/carbon/transform";
import intensityCurrent from "../fixtures/carbon-intensity-current.json";
import intensityDay from "../fixtures/carbon-intensity-day.json";
import generationCurrent from "../fixtures/generation-current.json";

describe("transformIntensityToSilver", () => {
  it("parses a single-period response into one silver row", () => {
    const rows = transformIntensityToSilver(intensityCurrent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      periodFrom: "2026-01-01T12:00Z",
      periodTo: "2026-01-01T12:30Z",
      actualIntensity: 61,
      forecastIntensity: 52,
      indexBand: "low",
    });
  });

  it("parses a full day (5 periods) and preserves a null actual for an unelapsed period", () => {
    const rows = transformIntensityToSilver(intensityDay);
    expect(rows).toHaveLength(5);
    expect(rows[4].actualIntensity).toBeNull();
    expect(rows[4].forecastIntensity).toBe(90);
  });

  it("rejects a payload with no data array", () => {
    expect(() => transformIntensityToSilver({} as never)).toThrow(InvalidPayloadError);
  });

  it("rejects an entry missing 'from'/'to'", () => {
    const malformed = { data: [{ to: "2026-01-01T00:30Z", intensity: { forecast: 50, actual: 40, index: "low" } }] };
    expect(() => transformIntensityToSilver(malformed as never)).toThrow(InvalidPayloadError);
  });

  it("rejects an entry with a non-numeric forecast", () => {
    const malformed = {
      data: [{ from: "a", to: "b", intensity: { forecast: "oops", actual: 40, index: "low" } }],
    };
    expect(() => transformIntensityToSilver(malformed as never)).toThrow(InvalidPayloadError);
  });

  it("rejects an entry with an unrecognised index band", () => {
    const malformed = {
      data: [{ from: "a", to: "b", intensity: { forecast: 50, actual: 40, index: "extreme" } }],
    };
    expect(() => transformIntensityToSilver(malformed as never)).toThrow(InvalidPayloadError);
  });
});

describe("transformGenerationToSilver", () => {
  it("parses the current generation mix into silver rows, one per fuel type", () => {
    const rows = transformGenerationToSilver(generationCurrent);
    expect(rows).toHaveLength(9);
    expect(rows[0]).toEqual({ periodFrom: "2026-01-01T12:00Z", fuelType: "wind", percentage: 26.6 });
  });

  it("rejects a payload missing generationmix", () => {
    expect(() => transformGenerationToSilver({ data: {} } as never)).toThrow(InvalidPayloadError);
  });

  it("rejects a payload whose percentages don't sum to ~100", () => {
    const malformed = {
      data: {
        from: "2026-01-01T12:00Z",
        to: "2026-01-01T12:30Z",
        generationmix: [
          { fuel: "wind", perc: 10 },
          { fuel: "solar", perc: 10 },
        ],
      },
    };
    expect(() => transformGenerationToSilver(malformed)).toThrow(InvalidPayloadError);
  });

  it("rejects a fuel entry with an out-of-range percentage", () => {
    const malformed = {
      data: {
        from: "2026-01-01T12:00Z",
        to: "2026-01-01T12:30Z",
        generationmix: [
          { fuel: "wind", perc: 150 },
          { fuel: "solar", perc: -50 },
        ],
      },
    };
    expect(() => transformGenerationToSilver(malformed)).toThrow(InvalidPayloadError);
  });
});

describe("transformGenerationRangeToSilver", () => {
  it("flattens multiple periods into one silver row list", () => {
    const range = {
      data: [
        { from: "2026-01-01T00:00Z", to: "2026-01-01T00:30Z", generationmix: [{ fuel: "wind", perc: 100 }] },
        { from: "2026-01-01T00:30Z", to: "2026-01-01T01:00Z", generationmix: [{ fuel: "gas", perc: 100 }] },
      ],
    };
    const rows = transformGenerationRangeToSilver(range);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.periodFrom)).toEqual(["2026-01-01T00:00Z", "2026-01-01T00:30Z"]);
  });

  it("rejects a payload without a data array", () => {
    expect(() => transformGenerationRangeToSilver({} as never)).toThrow(InvalidPayloadError);
  });
});
