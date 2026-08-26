import { describe, it, expect } from "vitest";
import { transformRegionToSilverRows } from "@worker/pipelines/housing/transform";
import type { UkHpiApiResponse } from "@worker/pipelines/housing/types";
import ukhpiRegion from "../fixtures/housing-ukhpi-region.json";
import ukhpiMissing from "../fixtures/housing-ukhpi-missing.json";

describe("transformRegionToSilverRows", () => {
  it("emits one row per property type that has a published average price", () => {
    const rows = transformRegionToSilverRows(
      "london",
      ukhpiRegion as UkHpiApiResponse,
    );
    // fixture has: all, detached, existing-property, flat-maisonette, new-build, semi-detached, terraced = 7
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.propertyType).sort()).toEqual(
      [
        "all",
        "detached",
        "existing-property",
        "flat-maisonette",
        "new-build",
        "semi-detached",
        "terraced",
      ].sort(),
    );
  });

  it("carries the real period, region, and average price through unchanged", () => {
    const rows = transformRegionToSilverRows(
      "london",
      ukhpiRegion as UkHpiApiResponse,
    );
    const all = rows.find((r) => r.propertyType === "all")!;
    expect(all).toEqual({
      period: "2024-06",
      region: "london",
      propertyType: "all",
      averagePrice: 556853,
      salesVolume: 6287,
    });
  });

  it("only attaches a sales volume for property types the source actually publishes one for", () => {
    const rows = transformRegionToSilverRows(
      "london",
      ukhpiRegion as UkHpiApiResponse,
    );
    const detached = rows.find((r) => r.propertyType === "detached")!;
    const newBuild = rows.find((r) => r.propertyType === "new-build")!;
    expect(detached.salesVolume).toBeNull();
    expect(newBuild.salesVolume).toBe(410);
  });

  it("returns no rows for a month the source hasn't published yet", () => {
    const rows = transformRegionToSilverRows(
      "united-kingdom",
      ukhpiMissing as UkHpiApiResponse,
    );
    expect(rows).toEqual([]);
  });

  it("skips a property type whose price field is absent rather than fabricating a value", () => {
    const partial: UkHpiApiResponse = {
      result: { primaryTopic: { averagePrice: 250000, refMonth: "2024-01" } },
    };
    const rows = transformRegionToSilverRows("wales", partial);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.propertyType).toBe("all");
  });
});
