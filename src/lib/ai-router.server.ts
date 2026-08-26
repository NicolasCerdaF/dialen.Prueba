// Tiered AI router — routes chat completions to Gemini / OpenAI / Anthropic
// based on task complexity. Keeps the OpenAI-compatible response shape so
// callers just read the returned string.
//
// Tiers:
//  - "fast"   → Gemini  (default; simple chat, sugerencias, resúmenes cortos)
//  - "medium" → OpenAI  (análisis multi-turno, briefings ejecutivos)
//  - "hard"   → Claude  (Director Comercial IA, decisiones críticas)

import { aiFetch } from "@/lib/ai-fetch";

export type AiTier = "fast" | "medium" | "hard";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ProviderCfg = {
  name: "gemini" | "openai" | "anthropic";
  url: string;
  model: string;
  keyEnv: "GEMINI_API_KEY" | "OPENAI_API_KEY" | "ANTHROPIC_API_KEY";
};

const PROVIDERS: Record<AiTier, ProviderCfg> = {
  fast: {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
    keyEnv: "GEMINI_API_KEY",
  },
  medium: {
    name: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    keyEnv: "OPENAI_API_KEY",
  },
  hard: {
    name: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-sonnet-latest",
    keyEnv: "ANTHROPIC_API_KEY",
  },
};

function pickProvider(tier: AiTier): { cfg: ProviderCfg; key: string } {
  const order: AiTier[] = tier === "hard"
    ? ["hard", "medium", "fast"]
    : tier === "medium"
      ? ["medium", "fast"]
      : ["fast"];
  for (const t of order) {
    const cfg = PROVIDERS[t];
    const key = process.env[cfg.keyEnv];
    if (key) return { cfg, key };
  }
  const cfg = PROVIDERS[tier];
  throw new Error(`${cfg.keyEnv} no configurada`);
}

export async function callChat(opts: {
  tier?: AiTier;
  messages: ChatMessage[];
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  companyId?: string | null;
  scope?: string;
  timeoutMs?: number;
  /** Skip credit enforcement (internal/platform only). */
  skipCreditCheck?: boolean;
}): Promise<string> {
  const tier: AiTier = opts.tier ?? "fast";
  const { cfg, key } = pickProvider(tier);
  const scope = opts.scope ?? `ai-${cfg.name}`;

  if (opts.companyId && !opts.skipCreditCheck) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertHasCredits, getPlanForCompany, recordLlmCreditEvent, shouldRecordLlmCreditEvent } =
      await import("@/lib/credits.server");
    const plan = await getPlanForCompany(supabaseAdmin, opts.companyId);
    await assertHasCredits(supabaseAdmin, opts.companyId, plan, 1);
  }

  let headers: Record<string, string> = { "Content-Type": "application/json" };
  let body: unknown;

  if (cfg.name === "anthropic") {
    const sys = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: cfg.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.5,
      ...(sys ? { system: sys } : {}),
      messages: rest.length ? rest : [{ role: "user", content: " " }],
    };
  } else {
    headers["Authorization"] = `Bearer ${key}`;
    body = {
      model: cfg.model,
      messages: opts.messages,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    };
  }

  const res = await aiFetch(
    cfg.url,
    { method: "POST", headers, body: JSON.stringify(body) },
    { scope, companyId: opts.companyId ?? null, timeoutMs: opts.timeoutMs },
  );
  const json: any = await res.json();

  if (cfg.name === "anthropic") {
    const parts = Array.isArray(json?.content) ? json.content : [];
    const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
    await maybeRecordLlmCredit(opts.companyId, scope, opts.skipCreditCheck);
    return text;
  }
  const text = json?.choices?.[0]?.message?.content?.trim() ?? "";
  await maybeRecordLlmCredit(opts.companyId, scope, opts.skipCreditCheck);
  return text;
}

async function maybeRecordLlmCredit(
  companyId: string | null | undefined,
  scope: string,
  skip?: boolean,
): Promise<void> {
  if (!companyId || skip) return;
  const { shouldRecordLlmCreditEvent, recordLlmCreditEvent } = await import("@/lib/credits.server");
  if (!shouldRecordLlmCreditEvent(scope)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await recordLlmCreditEvent(supabaseAdmin, companyId, scope, 1);
}

// ---------- Embeddings (siempre OpenAI, 1536 dims para pgvector) ----------

const EMBED_URL = "https://api.openai.com/v1/embeddings";
const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMS = 1536;

export async function embedTexts(
  inputs: string[],
  opts: { scope?: string; companyId?: string | null; timeoutMs?: number; skipCreditCheck?: boolean } = {},
): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada");

  if (opts.companyId && !opts.skipCreditCheck) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertHasCredits, getPlanForCompany } = await import("@/lib/credits.server");
    const plan = await getPlanForCompany(supabaseAdmin, opts.companyId);
    await assertHasCredits(supabaseAdmin, opts.companyId, plan, 1);
  }

  const scope = opts.scope ?? "embed-openai";
  const res = await aiFetch(
    EMBED_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
    },
    {
      scope: opts.scope ?? "embed-openai",
      companyId: opts.companyId ?? null,
      timeoutMs: opts.timeoutMs ?? 15_000,
    },
  );
  const json: any = await res.json();
  const data: any[] = json?.data ?? [];
  if (opts.companyId && !opts.skipCreditCheck) {
    const { recordLlmCreditEvent } = await import("@/lib/credits.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await recordLlmCreditEvent(supabaseAdmin, opts.companyId, scope, 1);
  }
  return data.map((d) => d.embedding as number[]);
}
