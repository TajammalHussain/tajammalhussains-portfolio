import type { Env } from "./env";

/**
 * Records one row to admin_audit_log. The table has no update/delete path
 * anywhere in the codebase — by design, once written a row is permanent, so
 * this is the only function that ever touches it.
 */
export async function recordAudit(
  env: Env,
  entry: {
    actorEmail: string;
    action: string;
    target?: string;
    params?: unknown;
    result: "success" | "error";
    detail?: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit_log (actor_email, action, target, params_json, result, detail)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(
      entry.actorEmail,
      entry.action,
      entry.target ?? null,
      entry.params !== undefined ? JSON.stringify(entry.params) : null,
      entry.result,
      entry.detail ?? null,
    )
    .run();
}
