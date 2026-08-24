import { describe, it, expect } from "vitest";
import {
  checkFreshness,
  checkCompleteness,
  checkValidity,
  checkUniqueness,
  checkReferential,
} from "@worker/quality/checks";

describe("checkFreshness", () => {
  it("passes when the last ingest is within the threshold", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const last = new Date("2026-01-01T11:45:00Z"); // 15 minutes ago
    const result = checkFreshness(last, now, 30);
    expect(result.status).toBe("pass");
  });

  it("fails when the last ingest is older than the threshold", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const last = new Date("2026-01-01T10:00:00Z"); // 2 hours ago
    const result = checkFreshness(last, now, 30);
    expect(result.status).toBe("fail");
  });

  it("fails when there has never been a successful ingest", () => {
    const result = checkFreshness(null, new Date(), 30);
    expect(result.status).toBe("fail");
    expect(result.observedValue).toBe("never");
  });
});

describe("checkCompleteness", () => {
  it("passes when actual count meets the expected count exactly", () => {
    expect(checkCompleteness(48, 48).status).toBe("pass");
  });

  it("fails when actual count falls short of expected", () => {
    expect(checkCompleteness(30, 48).status).toBe("fail");
  });

  it("passes within tolerance", () => {
    expect(checkCompleteness(45, 48, 0.1).status).toBe("pass"); // 45 >= 43.2
  });

  it("passes when actual exceeds expected", () => {
    expect(checkCompleteness(50, 48).status).toBe("pass");
  });
});

describe("checkValidity", () => {
  it("passes when every value is within bounds", () => {
    const result = checkValidity([10, 50, 90], { min: 0, max: 100 });
    expect(result.status).toBe("pass");
  });

  it("fails when a value is out of range", () => {
    const result = checkValidity([10, 500, 90], { min: 0, max: 100 });
    expect(result.status).toBe("fail");
    expect(result.observedValue).toContain("1 invalid");
  });

  it("fails on unexpected null by default", () => {
    const result = checkValidity([10, null, 90], { min: 0, max: 100 });
    expect(result.status).toBe("fail");
  });

  it("passes with null when allowNull is set", () => {
    const result = checkValidity([10, null, 90], { min: 0, max: 100 }, { allowNull: true });
    expect(result.status).toBe("pass");
  });

  it("fails on NaN", () => {
    const result = checkValidity([Number.NaN], { min: 0, max: 100 });
    expect(result.status).toBe("fail");
  });
});

describe("checkUniqueness", () => {
  it("passes when all keys are distinct", () => {
    expect(checkUniqueness(["a", "b", "c"]).status).toBe("pass");
  });

  it("fails and reports duplicate keys", () => {
    const result = checkUniqueness(["a", "b", "a", "c", "b"]);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("a");
    expect(result.detail).toContain("b");
  });

  it("passes for an empty list", () => {
    expect(checkUniqueness([]).status).toBe("pass");
  });
});

describe("checkReferential", () => {
  it("passes when silver row count matches the bronze-derived expectation", () => {
    expect(checkReferential(48, 48).status).toBe("pass");
  });

  it("fails when counts diverge", () => {
    expect(checkReferential(40, 48).status).toBe("fail");
  });
});
