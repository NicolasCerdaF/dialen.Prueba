import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanId = "basico" | "premium";

export const PLAN_CATALOG: Record<PlanId, {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyCredits: number;
  features: string[];
}> = {
  basico: {
    id: "basico",
    name: "Plan Básico",
    tagline: "Ideal para equipos pequeños que están arrancando con WhatsApp comercial.",
    monthlyCredits: 500,
    features: [
      "Bandeja unificada de WhatsApp",
      "CRM de contactos y clientes",
      "Embudo comercial (5 etapas)",
      "Cotizaciones básicas",
      "Catálogo de productos",
      "Sugerencias IA en conversaciones",
      "Soporte por correo",
    ],
  },
  premium: {
    id: "premium",
    name: "Plan Premium",
    tagline: "Para equipos comerciales que quieren escalar con IA avanzada y automatización total.",
    monthlyCredits: 3000,
    features: [
      "Todo lo del Plan Básico",
      "Director Comercial IA (priorización 24/7)",
      "Análisis IA avanzado con KPIs y forecast",
      "Dashboard ejecutivo con proyección de ingresos",
      "Automatizaciones con recetas",
      "Cotizaciones con IA + versionado + firma",
      "Recomendador inteligente en Kanban e Inbox",
      "Bandeja IA con scoring heurístico",
      "Conocimiento empresarial con RAG semántico",
      "Soporte prioritario 24/7 + onboarding dedicado",
    ],
  },
};


export const getMyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("plan, status, external_ref, updated_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const plan = ((data?.plan as PlanId) ?? "basico") as PlanId;
    return {
      plan: PLAN_CATALOG[plan] ? plan : ("basico" as PlanId),
      status: data?.status ?? "active",
      external_ref: data?.external_ref ?? null,
      updated_at: data?.updated_at ?? null,
    };
  });

// Feature keys gated by plan. Premium-only routes/features live here.
export const PREMIUM_FEATURES = [
  "director-ia",
  "bandeja-ia",
  "automatizaciones",
  "conocimiento",
  "metricas-ia",
  "dashboard-ejecutivo",
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export function planIncludes(plan: PlanId, feature: PremiumFeature): boolean {
  if (plan === "premium") return true;
  return false;
}

// AI-credit usage for the current calendar month, using activity as a proxy:
// ai_suggestions + automation_runs + director_insights created this period.
export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("plan, company_id")
      .eq("id", userId)
      .maybeSingle();
    const plan = ((prof?.plan as PlanId) ?? "basico") as PlanId;
    const included = PLAN_CATALOG[plan]?.monthlyCredits ?? 0;
    const company_id = prof?.company_id as string | undefined;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    let used = 0;
    let breakdown = { suggestions: 0, automations: 0, insights: 0 };
    if (company_id) {
      const [sugg, runs, insights] = await Promise.all([
        supabase
          .from("ai_suggestions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company_id)
          .gte("created_at", periodStart),
        supabase
          .from("automation_runs")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company_id)
          .gte("created_at", periodStart),
        supabase
          .from("director_insights")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company_id)
          .gte("created_at", periodStart),
      ]);
      breakdown = {
        suggestions: sugg.count ?? 0,
        automations: runs.count ?? 0,
        insights: insights.count ?? 0,
      };
      used = breakdown.suggestions + breakdown.automations + breakdown.insights;
    }
    const remaining = Math.max(included - used, 0);
    const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
    return {
      plan,
      included,
      used,
      remaining,
      pct,
      breakdown,
      period_start: periodStart,
      period_end: periodEnd,
    };
  });

export const changeMyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan: z.enum(["basico", "premium"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ plan: data.plan, status: "active" })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, plan: data.plan };
  });
