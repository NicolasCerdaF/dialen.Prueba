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
  limits: { conversaciones: string; usuarios: string; automatizaciones: string; conocimiento: string };
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
      "1 número de WhatsApp",
      "Soporte por correo",
    ],
    limits: {
      conversaciones: "Hasta 1.000 conversaciones/mes",
      usuarios: "Hasta 3 usuarios",
      automatizaciones: "3 automatizaciones activas",
      conocimiento: "Base de conocimiento hasta 20 documentos",
    },
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
      "Automatizaciones ilimitadas con recetas",
      "Cotizaciones con IA + versionado + firma",
      "Recomendador inteligente en Kanban e Inbox",
      "Bandeja IA con scoring heurístico",
      "Conocimiento empresarial con RAG semántico",
      "Múltiples números de WhatsApp",
      "Soporte prioritario 24/7 + onboarding dedicado",
    ],
    limits: {
      conversaciones: "Conversaciones ilimitadas",
      usuarios: "Usuarios ilimitados",
      automatizaciones: "Automatizaciones ilimitadas",
      conocimiento: "Base de conocimiento ilimitada",
    },
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
