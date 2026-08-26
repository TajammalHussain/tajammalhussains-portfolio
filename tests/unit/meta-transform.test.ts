import { describe, it, expect } from "vitest";
import {
  validateEventPayload,
  InvalidEventError,
} from "@worker/pipelines/meta/transform";

describe("validateEventPayload — deploy events", () => {
  it("accepts a minimal valid deploy event", () => {
    const result = validateEventPayload("deploy", { commitSha: "abc123" });
    expect(result).toEqual({
      eventType: "deploy",
      detail: {
        commitSha: "abc123",
        commitMessage: undefined,
        deployedBy: undefined,
        environment: undefined,
      },
    });
  });

  it("accepts a full deploy event", () => {
    const result = validateEventPayload("deploy", {
      commitSha: "abc123",
      commitMessage: "Fix bug",
      deployedBy: "github-actions",
      environment: "production",
    });
    expect(result.detail).toEqual({
      commitSha: "abc123",
      commitMessage: "Fix bug",
      deployedBy: "github-actions",
      environment: "production",
    });
  });

  it("rejects a missing commitSha", () => {
    expect(() => validateEventPayload("deploy", {})).toThrow(InvalidEventError);
  });

  it("rejects a non-string commitMessage", () => {
    expect(() =>
      validateEventPayload("deploy", { commitSha: "abc", commitMessage: 123 }),
    ).toThrow(InvalidEventError);
  });
});

describe("validateEventPayload — build events", () => {
  it("accepts a valid build event", () => {
    const result = validateEventPayload("build", {
      commitSha: "abc",
      status: "success",
      durationSeconds: 42,
    });
    expect(result).toEqual({
      eventType: "build",
      detail: { commitSha: "abc", status: "success", durationSeconds: 42 },
    });
  });

  it("rejects a missing status", () => {
    expect(() => validateEventPayload("build", { commitSha: "abc" })).toThrow(
      InvalidEventError,
    );
  });

  it("rejects an invalid status value", () => {
    expect(() =>
      validateEventPayload("build", { commitSha: "abc", status: "pending" }),
    ).toThrow(InvalidEventError);
  });

  it("rejects a negative duration", () => {
    expect(() =>
      validateEventPayload("build", {
        commitSha: "abc",
        status: "success",
        durationSeconds: -1,
      }),
    ).toThrow(InvalidEventError);
  });
});

describe("validateEventPayload — general validation", () => {
  it("rejects an unsupported event type", () => {
    expect(() =>
      validateEventPayload("analytics_snapshot", { commitSha: "abc" }),
    ).toThrow(InvalidEventError);
  });

  it("rejects a non-object body", () => {
    expect(() => validateEventPayload("deploy", "not an object")).toThrow(
      InvalidEventError,
    );
    expect(() => validateEventPayload("deploy", null)).toThrow(
      InvalidEventError,
    );
  });
});
