// Pure data-quality check functions — given already-fetched inputs, return a
// pass/fail result. The D1 querying that gathers those inputs lives in
// quality/run.ts; keeping the check logic itself pure makes it directly
// unit-testable with no bindings (spec: freshness, completeness, validity,
// uniqueness, referential).

export interface QualityCheckResult {
  checkName: "freshness" | "completeness" | "validity" | "uniqueness" | "referential";
  status: "pass" | "fail";
  observedValue: string;
  expectedValue: string;
  detail?: string;
}

/** Has data landed within the expected window? */
export function checkFreshness(
  lastIngestedAt: Date | null,
  now: Date,
  thresholdMinutes: number,
): QualityCheckResult {
  if (!lastIngestedAt) {
    return {
      checkName: "freshness",
      status: "fail",
      observedValue: "never",
      expectedValue: `within ${thresholdMinutes}m`,
      detail: "no successful ingestion recorded",
    };
  }
  const ageMinutes = (now.getTime() - lastIngestedAt.getTime()) / 60_000;
  return {
    checkName: "freshness",
    status: ageMinutes <= thresholdMinutes ? "pass" : "fail",
    observedValue: `${ageMinutes.toFixed(1)}m ago`,
    expectedValue: `within ${thresholdMinutes}m`,
  };
}

/** Did we get roughly the number of rows we expected for the period? */
export function checkCompleteness(
  actualCount: number,
  expectedCount: number,
  toleranceRatio = 0,
): QualityCheckResult {
  const lowerBound = expectedCount * (1 - toleranceRatio);
  const pass = actualCount >= lowerBound;
  return {
    checkName: "completeness",
    status: pass ? "pass" : "fail",
    observedValue: String(actualCount),
    expectedValue: `>= ${Math.ceil(lowerBound)} (target ${expectedCount})`,
  };
}

/** Are all values within a valid range, with no unexpected nulls? */
export function checkValidity(
  values: Array<number | null>,
  bounds: { min: number; max: number },
  options: { allowNull?: boolean } = {},
): QualityCheckResult {
  const invalid = values.filter((v) => {
    if (v === null) return !options.allowNull;
    return v < bounds.min || v > bounds.max || Number.isNaN(v);
  });
  return {
    checkName: "validity",
    status: invalid.length === 0 ? "pass" : "fail",
    observedValue: `${invalid.length} invalid of ${values.length}`,
    expectedValue: `all within [${bounds.min}, ${bounds.max}]${options.allowNull ? " or null" : ""}`,
  };
}

/** No duplicate primary keys. */
export function checkUniqueness(keys: string[]): QualityCheckResult {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) duplicates.add(k);
    seen.add(k);
  }
  return {
    checkName: "uniqueness",
    status: duplicates.size === 0 ? "pass" : "fail",
    observedValue: `${duplicates.size} duplicate key(s)`,
    expectedValue: "0 duplicates",
    detail: duplicates.size > 0 ? Array.from(duplicates).slice(0, 5).join(", ") : undefined,
  };
}

/** Do silver row counts reconcile against the bronze payload they were derived from? */
export function checkReferential(
  silverRowCount: number,
  bronzeExpectedCount: number,
): QualityCheckResult {
  return {
    checkName: "referential",
    status: silverRowCount === bronzeExpectedCount ? "pass" : "fail",
    observedValue: String(silverRowCount),
    expectedValue: String(bronzeExpectedCount),
  };
}
