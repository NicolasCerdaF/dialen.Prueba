// Server-only credit accounting and enforcement.
// Monthly allowance from plan + bonus_credits (purchased, non-expiring).
// Usage proxy: ai_suggestions + automation_runs (non-skipped) + director_insights + ai_credit_events.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBillingPeriod, type CompanyBillingRow } from "@/lib/billing-period.server";
import { PLAN_CATALOG, type PlanId } from "@/lib/plans.functions";
import { normalizePlanId } from "@/lib/plans.server";

export const CREDITS_EXHAUSTED_MSG =
  "Sin créditos IA este mes. Compra más en Comprar créditos o espera la recarga mensual de tu plan.";

/** Scopes where usage is already counted via ai_suggestions insert — skip ai_credit_events. */
const PROXY_LLM_SCOPES = new Set(["ai-agents"]);

export { getMonthPeriod } from "@/lib/billing-period.server";

export type CreditBreakdown = {
  suggestions: number;
  automations: number;
  insights: number;
  llmEvents: number;
};

export type CreditSnapshot = {
  plan: PlanId;
  monthlyAllowance: number;
  bonusCredits: number;
  included: number;
  used: number;
  remaining: number;
  pct: number;
  breakdown: CreditBreakdown;
  period_start: string;
  period_end: string;
  inTrial: boolean;
  nextBillingAt: string | null;
};

function isMissingRelationError(message: string | undefined, relation: string): boolean {
  if (!message) return false;
  return message.includes(relation) || message.includes("does not exist");
}

export async function getCompanyBillingRow(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyBillingRow | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("trial_ends_at, billing_cycle_anchor, credit_period_started_at")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    if (
      isMissingRelationError(error.message, "billing_cycle_anchor") ||
      isMissingRelationError(error.message, "trial_ends_at")
    ) {
      return null;
    }
    throw new Error(error.message);
  }
  return (data as CompanyBillingRow | null) ?? null;
}

export async function getCompanyBonusCredits(
  supabase: SupabaseClient,
  companyId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("companies")
    .select("bonus_credits")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message, "bonus_credits")) return 0;
    throw new Error(error.message);
  }
  return Math.max(0, Number((data as { bonus_credits?: number } | null)?.bonus_credits ?? 0));
}

export async function getPlanForCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<PlanId> {
  const { data, error } = await supabase
    .from("companies")
    .select("plan")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizePlanId(data?.plan as string | undefined);
}

export async function countCompanyCreditUsage(
  supabase: SupabaseClient,
  companyId: string,
  periodStart: string,
): Promise<CreditBreakdown> {
  const [sugg, runs, insights, llmRows] = await Promise.all([
    supabase
      .from("ai_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", periodStart),
    supabase
      .from("automation_runs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", periodStart)
      .neq("status", "skipped"),
    supabase
      .from("director_insights")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", periodStart),
    supabase
      .from("ai_credit_events")
      .select("cost")
      .eq("company_id", companyId)
      .gte("created_at", periodStart),
  ]);

  if (sugg.error) throw new Error(sugg.error.message);
  if (runs.error) throw new Error(runs.error.message);
  if (insights.error) throw new Error(insights.error.message);

  let llmEvents = 0;
  if (llmRows.error) {
    if (!isMissingRelationError(llmRows.error.message, "ai_credit_events")) {
      throw new Error(llmRows.error.message);
    }
  } else {
    llmEvents = (llmRows.data ?? []).reduce(
      (sum, row) => sum + Math.max(1, Number(row.cost ?? 1)),
      0,
    );
  }

  return {
    suggestions: sugg.count ?? 0,
    automations: runs.count ?? 0,
    insights: insights.count ?? 0,
    llmEvents,
  };
}

export async function getCreditSnapshot(
  supabase: SupabaseClient,
  companyId: string,
  plan: PlanId,
): Promise<CreditSnapshot> {
  const billingRow = await getCompanyBillingRow(supabase, companyId);
  const { periodStart, periodEnd, inTrial, nextBillingAt } = resolveBillingPeriod(billingRow);
  const monthlyAllowance = PLAN_CATALOG[plan]?.monthlyCredits ?? 0;
  const bonusCredits = await getCompanyBonusCredits(supabase, companyId);
  const breakdown = await countCompanyCreditUsage(supabase, companyId, periodStart);
  const used =
    breakdown.suggestions + breakdown.automations + breakdown.insights + breakdown.llmEvents;
  const included = monthlyAllowance + bonusCredits;
  const remaining = Math.max(included - used, 0);
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;

  return {
    plan,
    monthlyAllowance,
    bonusCredits,
    included,
    used,
    remaining,
    pct,
    breakdown,
    period_start: periodStart,
    period_end: periodEnd,
    inTrial,
    nextBillingAt,
  };
}

export async function assertHasCredits(
  supabase: SupabaseClient,
  companyId: string,
  plan: PlanId,
  cost = 1,
): Promise<CreditSnapshot> {
  const snapshot = await getCreditSnapshot(supabase, companyId, plan);
  if (snapshot.remaining < cost) {
    throw new Error(CREDITS_EXHAUSTED_MSG);
  }
  return snapshot;
}

export async function recordLlmCreditEvent(
  supabase: SupabaseClient,
  companyId: string,
  scope: string,
  cost = 1,
): Promise<void> {
  if (PROXY_LLM_SCOPES.has(scope)) return;
  const { error } = await supabase.from("ai_credit_events").insert({
    company_id: companyId,
    scope,
    cost: Math.max(1, cost),
  });
  if (error && !isMissingRelationError(error.message, "ai_credit_events")) {
    throw new Error(error.message);
  }
}

export async function addBonusCredits(
  supabase: SupabaseClient,
  companyId: string,
  amount: number,
): Promise<number> {
  const delta = Math.max(0, Math.floor(amount));
  if (delta === 0) return await getCompanyBonusCredits(supabase, companyId);

  const current = await getCompanyBonusCredits(supabase, companyId);
  const next = current + delta;
  const { error } = await supabase
    .from("companies")
    .update({ bonus_credits: next, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) {
    if (isMissingRelationError(error.message, "bonus_credits")) {
      throw new Error(
        "La columna bonus_credits aún no existe. Ejecuta la migración supabase/migrations/20260826000000_ai_credits.sql",
      );
    }
    throw new Error(error.message);
  }
  return next;
}

export function shouldRecordLlmCreditEvent(scope: string | undefined): boolean {
  if (!scope) return true;
  return !PROXY_LLM_SCOPES.has(scope);
}
