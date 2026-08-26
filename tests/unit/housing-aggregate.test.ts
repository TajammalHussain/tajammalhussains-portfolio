import { describe, it, expect } from "vitest";
import {
  computeHousingGoldRow,
  previousMonth,
  previousYear,
} from "@worker/pipelines/housing/aggregate";

describe("previousMonth", () => {
  it("steps back one month within a year", () => {
    expect(previousMonth("2026-06")).toBe("2026-05");
  });

  it("rolls over from January to the previous December", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});

describe("previousYear", () => {
  it("steps back exactly one year, same month", () => {
    expect(previousYear("2026-06")).toBe("2025-06");
  });
});

describe("computeHousingGoldRow", () => {
  it("computes both mom and yoy change when the full history is present", () => {
    const history = new Map([
      ["2025-06", 500_000],
      ["2026-05", 540_000],
      ["2026-06", 550_000],
    ]);
    const row = computeHousingGoldRow("london", "2026-06", history);
    expect(row).not.toBeNull();
    expect(row!.averagePrice).toBe(550_000);
    expect(row!.momChangePct).toBeCloseTo(
      ((550_000 - 540_000) / 540_000) * 100,
      5,
    );
    expect(row!.yoyChangePct).toBeCloseTo(
      ((550_000 - 500_000) / 500_000) * 100,
      5,
    );
  });

  it("returns null (not zero) mom/yoy when a comparison period is missing, rather than fabricating a change", () => {
    const history = new Map([["2026-06", 550_000]]);
    const row = computeHousingGoldRow("london", "2026-06", history);
    expect(row!.momChangePct).toBeNull();
    expect(row!.yoyChangePct).toBeNull();
  });

  it("returns null entirely when the target period itself has no data", () => {
    const history = new Map([["2026-05", 540_000]]);
    const row = computeHousingGoldRow("london", "2026-06", history);
    expect(row).toBeNull();
  });
});
