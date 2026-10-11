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
    name: "Plan Start",
    tagline: "IA operativa que te ayuda a vender en cada conversación de WhatsApp.",
    monthlyCredits: 1400,
    features: [
      "Bandeja unificada de WhatsApp",
      "CRM de contactos y clientes",
      "Embudo comercial (5 etapas)",
      "Sugerencias IA en cada conversación",
      "Resumen automático de conversaciones",
      "Auto-borrador de cotizaciones con IA",
      "Scoring IA de leads (Bandeja IA)",
      "Base de conocimiento con búsqueda IA (RAG)",
      "Catálogo de productos",
      "Cotizaciones básicas",
      "Soporte por correo",
    ],
  },
  premium: {
    id: "premium",
    name: "Plan Business",
    tagline: "IA que además dirige tu operación: prioriza, automatiza y proyecta ingresos.",
    monthlyCredits: 4600,
    features: [
      "Todo lo del Plan Start",
      "Director Comercial IA (priorización 24/7 de tu día)",
      "Motor de Automatizaciones con recetas y flujos",
      "Análisis IA avanzado (rendimiento del motor IA)",
      "Dashboard ejecutivo con forecast de ingresos",
      "Cotizaciones con IA + versionado + firma",
      "Recomendador inteligente en Kanban e Inbox",
      "Soporte prioritario 24/7 + onboarding dedicado",
    ],
  },
};


export const getMyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getPlanForUser } = await import("@/lib/plans.server");
    const resolved = await getPlanForUser(context.supabase, context.userId);
    const plan = PLAN_CATALOG[resolved.plan] ? resolved.plan : ("basico" as PlanId);
    return {
      plan,
      status: resolved.status,
      external_ref: resolved.external_ref,
      updated_at: resolved.updated_at,
    };
  });

// Feature keys gated by plan. Premium-only routes/features live here.
// Start incluye la IA operativa (Bandeja IA + Conocimiento). Business desbloquea
// la IA de gestión/dirección (Director IA, Automatizaciones, Métricas, Ejecutivo).
export const PREMIUM_FEATURES = [
  "director-ia",
  "automatizaciones",
  "metricas-ia",
  "dashboard-ejecutivo",
  "recommendador",
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

export function planIncludes(plan: PlanId, feature: PremiumFeature): boolean {
  if (plan === "premium") return true;
  return false;
}

// AI-credit usage for the current calendar month.
export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getPlanForUser } = await import("@/lib/plans.server");
    const { getCreditSnapshot } = await import("@/lib/credits.server");
    const resolved = await getPlanForUser(supabase, userId);
    const plan = PLAN_CATALOG[resolved.plan] ? resolved.plan : ("basico" as PlanId);

    if (!resolved.company_id) {
      const monthlyAllowance = PLAN_CATALOG[plan]?.monthlyCredits ?? 0;
      return {
        plan,
        monthlyAllowance,
        bonusCredits: 0,
        included: monthlyAllowance,
        used: 0,
        remaining: monthlyAllowance,
        pct: 0,
        breakdown: { suggestions: 0, automations: 0, insights: 0, llmEvents: 0 },
        period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        inTrial: false,
        nextBillingAt: null,
      };
    }

    const snapshot = await getCreditSnapshot(supabase, resolved.company_id, plan);
    return {
      plan: snapshot.plan,
      monthlyAllowance: snapshot.monthlyAllowance,
      bonusCredits: snapshot.bonusCredits,
      included: snapshot.included,
      used: snapshot.used,
      remaining: snapshot.remaining,
      pct: snapshot.pct,
      breakdown: snapshot.breakdown,
      period_start: snapshot.period_start,
      period_end: snapshot.period_end,
      inTrial: snapshot.inTrial,
      nextBillingAt: snapshot.nextBillingAt,
    };
  });

const PurchasePackSchema = z.object({
  pack_id: z.enum(["starter", "growth", "scale", "enterprise"]),
});

/** Dev/mock purchase — adds bonus credits (no Stripe yet). */
export const purchaseCreditPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PurchasePackSchema.parse(d))
  .handler(async ({ data, context }) => {
    const PACK_CREDITS: Record<string, number> = {
      starter: 1500,
      growth: 5000,
      scale: 12000,
      enterprise: 38000,
    };
    const credits = PACK_CREDITS[data.pack_id];
    if (!credits) throw new Error("Paquete no válido");

    const { getPlanForUser } = await import("@/lib/plans.server");
    const { addBonusCredits } = await import("@/lib/credits.server");
    const resolved = await getPlanForUser(context.supabase, context.userId);
    if (!resolved.company_id) throw new Error("Sin empresa asociada");

    const bonusCredits = await addBonusCredits(context.supabase, resolved.company_id, credits);
    return { ok: true, added: credits, bonusCredits };
  });

export const changeMyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ plan: z.enum(["basico", "premium"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getPlanForUser, setCompanyPlanUnified, setUserPlanUnified } = await import(
      "@/lib/plans.server"
    );
    const resolved = await getPlanForUser(context.supabase, context.userId);
    if (resolved.company_id) {
      await setCompanyPlanUnified(context.supabase, resolved.company_id, data.plan, {
        profileStatus: "active",
      });
    } else {
      await setUserPlanUnified(context.supabase, context.userId, data.plan, {
        profileStatus: "active",
      });
    }
    return { ok: true, plan: data.plan };
  });

/** Ensures companies.plan matches owner profile after client-side workspace bootstrap. */
export const syncMyCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getPlanForUser, bootstrapCompanyPlan } = await import("@/lib/plans.server");
    const resolved = await getPlanForUser(context.supabase, context.userId);
    if (resolved.company_id) {
      await bootstrapCompanyPlan(context.supabase, resolved.company_id, context.userId);
    }
    return { ok: true, plan: resolved.plan };
  });
