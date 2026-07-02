import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SALES_AGENT_PROMPT, type AgentType } from "@/lib/ai-agents/registry";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const HISTORY_LIMIT = 20;

type SalesAnalysis = {
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
    // Strip common code fences
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

// ---------- Analyze conversation with the Sales+Analysis agents ----------
export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: convo, error: cErr } = await supabase
      .from("conversations")
      .select("id, customer_id, company_id, customers(name, stage, phone)")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!convo) throw new Error("Conversación no encontrada");

    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, body, created_at, sender_id")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const history = (msgs ?? []).slice().reverse();
    if (history.length === 0) throw new Error("Sin mensajes para analizar");

    const transcript = history
      .map((m) => {
        const who =
          m.direction === "inbound"
            ? "CLIENTE"
            : m.sender_id
              ? "VENDEDOR"
              : "IA";
        return `${who}: ${(m.body ?? "").slice(0, 500)}`;
      })
      .join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("La IA no está configurada en el servidor");

    const res = await fetch(AI_GATEWAY, {
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
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("La IA está saturada. Reintenta en 1 minuto.");
      if (res.status === 402) throw new Error("Sin créditos de IA. Recarga en Configuración.");
      throw new Error(`IA falló (${res.status}): ${t.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(raw);
    if (!parsed) throw new Error("La IA devolvió un formato inesperado");

    // Persist as ai_suggestion (Sales agent)
    // last message id (required by schema)
    const { data: lastMsg } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const insertSuggestion = supabase.from("ai_suggestions").insert({
      message_id: lastMsg?.id ?? data.conversation_id, // fallback for legacy schema
      conversation_id: data.conversation_id,
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

    // Upsert ai_insights (Analysis engine)
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

    // Log a customer_event so the timeline reflects the AI activity
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
  });

// ---------- List latest AI suggestions for a conversation ----------
export const listSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("ai_suggestions")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Mark a suggestion as used / discarded ----------
export const setSuggestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "used" | "discarded" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["used", "discarded"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "used") patch.used_at = new Date().toISOString();
    const { error } = await supabase.from("ai_suggestions").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Get AI insight for a customer ----------
export const getInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string }) =>
    z.object({ customer_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("ai_insights")
      .select("*")
      .eq("customer_id", data.customer_id)
      .maybeSingle();
    return row ?? null;
  });

// ---------- Dashboard summary: agents + recent activity ----------
export const getAiOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [suggestionsRes, insightsRes, hotRes] = await Promise.all([
      supabase
        .from("ai_suggestions")
        .select("id, agent_type, status, created_at, used_at, intent, probability, customer_id, conversation_id, text")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("ai_insights").select("customer_id, probability, churn_risk, intent, sentiment"),
      supabase
        .from("ai_insights")
        .select("customer_id, probability, intent, next_best_action, customers(name, phone, stage)")
        .order("probability", { ascending: false, nullsFirst: false })
        .limit(10),
    ]);

    const suggestions = suggestionsRes.data ?? [];
    const insights = insightsRes.data ?? [];
    const hot = hotRes.data ?? [];

    const total = suggestions.length;
    const used = suggestions.filter((s) => s.status === "used").length;
    const pending = suggestions.filter((s) => s.status === "pending").length;
    const dismissed = suggestions.filter((s) => s.status === "dismissed").length;
    const avgProbability =
      insights.length > 0
        ? insights.reduce((acc, r) => acc + (Number(r.probability) || 0), 0) / insights.length
        : 0;
    const highRisk = insights.filter((r) => (Number(r.churn_risk) || 0) >= 0.6).length;
    const highIntent = insights.filter(
      (r) => r.intent === "high_intent" || r.intent === "ready_to_close",
    ).length;

    return {
      totals: { total, used, pending, dismissed, avgProbability, highRisk, highIntent },
      recent: suggestions.slice(0, 15),
      hot,
    };
  });
