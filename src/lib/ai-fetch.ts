// Server-side wrapper around Lovable AI gateway HTTP calls.
// - Global timeout (AbortController)
// - Retry with backoff on transient failures (network / 5xx)
// - Structured logging of latency + status
// - Never retries 402/429 (credits / rate limit) — surface them immediately

import { log } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2; // total attempts = MAX_RETRIES + 1

export class AiGatewayError extends Error {
  constructor(
    message: string,
    public status: number,
    public retriable: boolean,
  ) {
    super(message);
    this.name = "AiGatewayError";
  }
}

function backoff(attempt: number) {
  // 300ms, 900ms with ~30% jitter
  const base = 300 * Math.pow(3, attempt);
  const jitter = base * 0.3 * Math.random();
  return base + jitter;
}

export async function aiFetch(
  url: string,
  init: RequestInit,
  opts: { scope: string; companyId?: string | null; timeoutMs?: number } = {
    scope: "ai",
  },
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const scope = opts.scope;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const duration = Date.now() - start;

      if (res.ok) {
        log.info(scope, "ai_call_ok", {
          duration_ms: duration,
          attempt,
          status: res.status,
          company_id: opts.companyId ?? null,
        });
        return res;
      }

      // Non-retriable business errors — surface immediately.
      if (res.status === 402 || res.status === 429 || res.status === 400) {
        log.warn(scope, "ai_call_bad_status", {
          duration_ms: duration,
          attempt,
          status: res.status,
          company_id: opts.companyId ?? null,
        });
        throw new AiGatewayError(`AI gateway ${res.status}`, res.status, false);
      }

      // 5xx — retriable
      const bodyPreview = await res.text().catch(() => "");
      lastErr = new AiGatewayError(
        `AI gateway ${res.status}: ${bodyPreview.slice(0, 200)}`,
        res.status,
        true,
      );
      log.warn(scope, "ai_call_retry", {
        duration_ms: duration,
        attempt,
        status: res.status,
        company_id: opts.companyId ?? null,
      });
    } catch (e: any) {
      const duration = Date.now() - start;
      if (e?.name === "AiGatewayError" && !e.retriable) throw e;
      lastErr = e;
      const isAbort = e?.name === "AbortError";
      log.warn(scope, isAbort ? "ai_call_timeout" : "ai_call_error", {
        duration_ms: duration,
        attempt,
        company_id: opts.companyId ?? null,
        err: e,
      });
    } finally {
      clearTimeout(t);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, backoff(attempt)));
    }
  }

  log.error(scope, "ai_call_exhausted", {
    company_id: opts.companyId ?? null,
    err: lastErr,
  });
  throw lastErr instanceof Error ? lastErr : new Error("AI gateway failed");
}
