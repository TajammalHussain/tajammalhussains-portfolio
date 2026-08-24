/**
 * Structured JSON logging — every line is a single JSON object, so
 * `wrangler tail` / Cloudflare's log viewer can be filtered/queried instead
 * of grepped.
 */
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  pipeline?: string;
  runId?: number | string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};
