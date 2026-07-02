// Server-only internals for the Sales/Analysis agent.
// Extracted from ai-agents.functions.ts so the orchestrator can chain the
// same logic without going through the client RPC boundary.

import { SALES_AGENT_PROMPT, type AgentType } from "@/lib/ai-agents/registry";
import { aiFetch, AiGatewayError } from "@/lib/ai-fetch";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const HISTORY_LIMIT = 20;

export type SalesAnalysis = {
  intent: string;
  sentiment: string;
  urgency: string;
  probability: number;
  churn_risk: number;
  quality_score: number;
  suggested_reply: string;
  next_best_action: string;
  suggested_stage: string | null;
  objections: string[];
  summary: string;
};

function safeParseJson(s: string): SalesAnalysis | null {
  try {
    const clean = s
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const obj = JSON.parse(clean);
    if (typeof obj !== "object" || obj === null) return null;
    return obj as SalesAnalysis;
  } catch {
    return null;
  }
}

export async function runSalesAnalysis(
  supabase: any,
  userId: string,
  conversation_id: string,
): Promise<SalesAnalysis> {
  const { data: convo, error: cErr } = await supabase
    .from("conversations")
    .select("id, customer_id, company_id, customers(name, stage, phone)")
    .eq("id", conversation_id)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!convo) throw new Error("Conversación no encontrada");

  const { data: msgs } = await supabase
    .from("messages")
    .select("direction, body, created_at, sender_id")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (msgs ?? []).slice().reverse();
  if (history.length === 0) throw new Error("Sin mensajes para analizar");

  const transcript = history
    .map((m: any) => {
      const who =
        m.direction === "inbound" ? "CLIENTE" : m.sender_id ? "VENDEDOR" : "IA";
      return `${who}: ${(m.body ?? "").slice(0, 500)}`;
    })
    .join("\n");

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("La IA no está configurada en el servidor");

  let res: Response;
  try {
    res = await aiFetch(
      AI_GATEWAY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SALES_AGENT_PROMPT },
            {
              role: "user",
              content: `Cliente: ${convo.customers?.name ?? "sin nombre"} · etapa actual: ${convo.customers?.stage ?? "—"}\n\nConversación:\n${transcript}`,
            },
          ],
        }),
      },
      { scope: "ai-agents", companyId: convo.company_id },
    );
  } catch (e: any) {
    if (e instanceof AiGatewayError) {
      if (e.status === 429) throw new Error("La IA está saturada. Reintenta en 1 minuto.");
      if (e.status === 402) throw new Error("Sin créditos de IA. Recarga en Configuración.");
    }
    throw new Error(e?.message ?? "IA no disponible");
  }
  const json: any = await res.json();
  const raw: string = json?.choices?.[0]?.message?.content ?? "";
  const parsed = safeParseJson(raw);
  if (!parsed) throw new Error("La IA devolvió un formato inesperado");

  const { data: lastMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const insertSuggestion = supabase.from("ai_suggestions").insert({
    message_id: lastMsg?.id ?? conversation_id,
    conversation_id,
    customer_id: convo.customer_id,
    company_id: convo.company_id,
    agent_type: "sales" as AgentType,
    text: parsed.suggested_reply ?? "",
    intent: parsed.intent ?? null,
    next_step: parsed.next_best_action ?? null,
    confidence: parsed.quality_score ?? null,
    probability: parsed.probability ?? null,
    objections: (parsed.objections ?? []) as any,
    model: MODEL,
    status: "pending" as any,
    payload: parsed as any,
    actor_id: userId,
  } as any);

  const upsertInsight = supabase.from("ai_insights").upsert(
    {
      customer_id: convo.customer_id,
      company_id: convo.company_id,
      probability: parsed.probability ?? null,
      intent: parsed.intent ?? null,
      sentiment: parsed.sentiment ?? null,
      churn_risk: parsed.churn_risk ?? null,
      quality_score: parsed.quality_score ?? null,
      next_best_action: parsed.next_best_action ?? null,
      signals: {
        urgency: parsed.urgency,
        objections: parsed.objections,
        suggested_stage: parsed.suggested_stage,
        summary: parsed.summary,
      } as any,
      last_analysis_at: new Date().toISOString(),
    },
    { onConflict: "customer_id" },
  );

  const insertEvent = supabase.from("customer_events").insert({
    customer_id: convo.customer_id,
    company_id: convo.company_id,
    actor_id: userId,
    event_type: "ai_analysis",
    payload: {
      agent: "sales",
      intent: parsed.intent,
      probability: parsed.probability,
      churn_risk: parsed.churn_risk,
      summary: parsed.summary,
    } as any,
  });

  await Promise.all([insertSuggestion, upsertInsight, insertEvent]);
  return parsed;
}
