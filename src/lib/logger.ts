// Structured logger — one line JSON per event so logs stay grep-able in prod.
// Never logs raw secrets. `err` field is stringified with message + name only.

type Level = "info" | "warn" | "error";

function safeErr(e: unknown) {
  if (!e) return null;
  if (e instanceof Error) return { name: e.name, message: e.message };
  if (typeof e === "string") return { message: e };
  try {
    return { message: JSON.stringify(e).slice(0, 500) };
  } catch {
    return { message: String(e).slice(0, 500) };
  }
}

function emit(level: Level, scope: string, event: string, fields?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    event,
    ...(fields ?? {}),
    ...(fields?.err !== undefined ? { err: safeErr(fields.err) } : {}),
  };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  try {
    out(JSON.stringify(line));
  } catch {
    out(`[${level}] ${scope} ${event}`);
  }
}

export const log = {
  info: (scope: string, event: string, fields?: Record<string, unknown>) =>
    emit("info", scope, event, fields),
  warn: (scope: string, event: string, fields?: Record<string, unknown>) =>
    emit("warn", scope, event, fields),
  error: (scope: string, event: string, fields?: Record<string, unknown>) =>
    emit("error", scope, event, fields),
};
