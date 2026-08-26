import type {
  SiteEventType,
  DeployEventDetail,
  BuildEventDetail,
} from "./types";

export class InvalidEventError extends Error {}

/**
 * Validates and narrows an untrusted POST body from the deploy-event webhook
 * (see routes/meta.ts) into a typed detail object for one event type. Pure
 * and side-effect free — the actual bronze/silver writes happen in run.ts.
 */
export function validateEventPayload(
  eventType: string,
  body: unknown,
): {
  eventType: Extract<SiteEventType, "deploy" | "build">;
  detail: DeployEventDetail | BuildEventDetail;
} {
  if (eventType !== "deploy" && eventType !== "build") {
    throw new InvalidEventError(`unsupported event type: ${eventType}`);
  }
  if (typeof body !== "object" || body === null) {
    throw new InvalidEventError("event body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.commitSha !== "string" || b.commitSha.length === 0) {
    throw new InvalidEventError(
      "event body must include a non-empty 'commitSha' string",
    );
  }

  if (eventType === "deploy") {
    if (b.commitMessage !== undefined && typeof b.commitMessage !== "string") {
      throw new InvalidEventError(
        "'commitMessage' must be a string if present",
      );
    }
    if (b.deployedBy !== undefined && typeof b.deployedBy !== "string") {
      throw new InvalidEventError("'deployedBy' must be a string if present");
    }
    if (b.environment !== undefined && typeof b.environment !== "string") {
      throw new InvalidEventError("'environment' must be a string if present");
    }
    return {
      eventType: "deploy",
      detail: {
        commitSha: b.commitSha,
        commitMessage: b.commitMessage as string | undefined,
        deployedBy: b.deployedBy as string | undefined,
        environment: b.environment as string | undefined,
      },
    };
  }

  if (b.status !== "success" && b.status !== "failed") {
    throw new InvalidEventError(
      "build event must include status: 'success' | 'failed'",
    );
  }
  if (
    b.durationSeconds !== undefined &&
    (typeof b.durationSeconds !== "number" || b.durationSeconds < 0)
  ) {
    throw new InvalidEventError(
      "'durationSeconds' must be a non-negative number if present",
    );
  }
  return {
    eventType: "build",
    detail: {
      commitSha: b.commitSha,
      status: b.status,
      durationSeconds: b.durationSeconds as number | undefined,
    },
  };
}
