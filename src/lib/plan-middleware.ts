import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertHasCredits } from "@/lib/credits.server";
import { planIncludes, type PremiumFeature } from "@/lib/plans.functions";

type AuthContext = {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
  plan?: import("@/lib/plans.functions").PlanId;
};

/** Server-side gate: rejects requests when the company plan does not include the feature. */
export function requirePlanFeature(feature: PremiumFeature) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const ctx = context as AuthContext;
    if (!ctx.supabase || !ctx.userId) {
      throw new Error("Unauthorized: plan check requires authenticated context");
    }
    const { getPlanForUser } = await import("@/lib/plans.server");
    const resolved = await getPlanForUser(ctx.supabase, ctx.userId);
    if (!planIncludes(resolved.plan, feature)) {
      throw new Error(
        "Esta función requiere el Plan Business. Actualiza tu plan en Mi Plan.",
      );
    }
    return next({
      context: {
        ...context,
        plan: resolved.plan,
        companyId: resolved.company_id,
      },
    });
  });
}

/** Server-side gate: rejects when the company has no remaining AI credits this month. */
export function requireCredits(cost = 1) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const ctx = context as AuthContext;
    if (!ctx.supabase || !ctx.userId) {
      throw new Error("Unauthorized: credit check requires authenticated context");
    }
    const { getPlanForUser } = await import("@/lib/plans.server");
    const resolved = await getPlanForUser(ctx.supabase, ctx.userId);
    if (!resolved.company_id) {
      throw new Error("Sin empresa asociada — no se pueden consumir créditos IA.");
    }
    await assertHasCredits(ctx.supabase, resolved.company_id, resolved.plan, cost);
    return next({
      context: {
        ...context,
        plan: resolved.plan,
        companyId: resolved.company_id,
      },
    });
  });
}

/** Convenience: auth middleware + premium feature gate (order matters). */
export function withPremiumFeature(feature: PremiumFeature) {
  return [requireSupabaseAuth, requirePlanFeature(feature)] as const;
}

/** Auth + credit check before IA-consuming server functions. */
export function withCredits(cost = 1) {
  return [requireSupabaseAuth, requireCredits(cost)] as const;
}
