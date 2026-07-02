import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


// ---------- Analyze conversation with the Sales+Analysis agents ----------
export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { conversation_id: string }) =>
    z.object({ conversation_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runSalesAnalysis } = await import("@/lib/ai-agents.server");
    return runSalesAnalysis(context.supabase, context.userId, data.conversation_id);
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
    const dismissed = suggestions.filter((s) => s.status === "discarded").length;
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
