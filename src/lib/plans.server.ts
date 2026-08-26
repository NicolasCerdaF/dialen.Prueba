// Server-only plan helpers. Canonical source of truth: companies.plan.
// profiles.plan is kept in sync for backwards compatibility and provisioning metadata.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "@/lib/plans.functions";

export function normalizePlanId(raw: string | null | undefined): PlanId {
  return raw === "premium" ? "premium" : "basico";
}

type PlanSyncOptions = {
  profileStatus?: string;
  externalRef?: string | null;
};

/** Updates companies.plan and all profiles belonging to that company. */
export async function setCompanyPlanUnified(
  supabase: SupabaseClient,
  companyId: string,
  plan: PlanId,
  opts?: PlanSyncOptions,
): Promise<void> {
  const normalized = normalizePlanId(plan);

  const { error: companyErr } = await supabase
    .from("companies")
    .update({ plan: normalized, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (companyErr) throw new Error(companyErr.message);

  const profilePatch: Record<string, unknown> = { plan: normalized };
  if (opts?.profileStatus) profilePatch.status = opts.profileStatus;
  if (opts?.externalRef !== undefined) profilePatch.external_ref = opts.externalRef;

  const { error: profilesErr } = await supabase
    .from("profiles")
    .update(profilePatch)
    .eq("company_id", companyId);
  if (profilesErr) throw new Error(profilesErr.message);
}

/** Sets plan for a user; syncs company + all team profiles when company_id exists. */
export async function setUserPlanUnified(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanId,
  opts?: PlanSyncOptions,
): Promise<void> {
  const normalized = normalizePlanId(plan);

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  if (prof?.company_id) {
    await setCompanyPlanUnified(supabase, prof.company_id, normalized, opts);
    return;
  }

  const profilePatch: Record<string, unknown> = { plan: normalized };
  if (opts?.profileStatus) profilePatch.status = opts.profileStatus;
  if (opts?.externalRef !== undefined) profilePatch.external_ref = opts.externalRef;

  const { error } = await supabase.from("profiles").update(profilePatch).eq("id", userId);
  if (error) throw new Error(error.message);
}

export type ResolvedUserPlan = {
  plan: PlanId;
  status: string;
  external_ref: string | null;
  updated_at: string | null;
  company_id: string | null;
};

/** Reads plan from companies.plan (canonical). Heals profile/company desync when detected. */
export async function getPlanForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResolvedUserPlan> {
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("plan, status, external_ref, updated_at, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  let plan = normalizePlanId(prof?.plan as string | undefined);

  if (prof?.company_id) {
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("plan")
      .eq("id", prof.company_id)
      .maybeSingle();
    if (companyErr) throw new Error(companyErr.message);

    if (company?.plan) {
      plan = normalizePlanId(company.plan as string);
      if (prof.plan !== plan) {
        await supabase.from("profiles").update({ plan }).eq("id", userId);
      }
    } else {
      await supabase.from("companies").update({ plan }).eq("id", prof.company_id);
    }
  }

  return {
    plan,
    status: prof?.status ?? "active",
    external_ref: prof?.external_ref ?? null,
    updated_at: prof?.updated_at ?? null,
    company_id: prof?.company_id ?? null,
  };
}

/** Ensures a newly created company inherits the owner's profile plan (default: basico). */
export async function bootstrapCompanyPlan(
  supabase: SupabaseClient,
  companyId: string,
  ownerUserId: string,
): Promise<PlanId> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", ownerUserId)
    .maybeSingle();

  const plan = normalizePlanId(prof?.plan as string | undefined);
  await setCompanyPlanUnified(supabase, companyId, plan);
  return plan;
}
