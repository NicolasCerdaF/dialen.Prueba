// Company-specific billing / credit periods (7-day trial + monthly anchor).

export const TRIAL_DAYS = 7;

export type CompanyBillingRow = {
  trial_ends_at?: string | null;
  billing_cycle_anchor?: string | null;
  credit_period_started_at?: string | null;
};

export function getMonthPeriod(now = new Date()) {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { periodStart, periodEnd };
}

function addOneCalendarMonth(d: Date): Date {
  const next = new Date(d.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}

export type ResolvedBillingPeriod = {
  periodStart: string;
  periodEnd: string;
  inTrial: boolean;
  nextBillingAt: string | null;
};

/** Trial = full plan credits for 7 days; paid cycles renew monthly from billing_cycle_anchor. */
export function resolveBillingPeriod(
  company: CompanyBillingRow | null | undefined,
  now = new Date(),
): ResolvedBillingPeriod {
  if (!company?.billing_cycle_anchor) {
    const { periodStart, periodEnd } = getMonthPeriod(now);
    return { periodStart, periodEnd, inTrial: false, nextBillingAt: periodEnd };
  }

  const anchor = new Date(company.billing_cycle_anchor);
  const trialEnds = company.trial_ends_at ? new Date(company.trial_ends_at) : null;
  const trialStart = company.credit_period_started_at
    ? new Date(company.credit_period_started_at)
    : anchor;

  if (trialEnds && now < trialEnds) {
    return {
      periodStart: trialStart.toISOString(),
      periodEnd: trialEnds.toISOString(),
      inTrial: true,
      nextBillingAt: trialEnds.toISOString(),
    };
  }

  let periodStart = anchor;
  while (addOneCalendarMonth(periodStart) <= now) {
    periodStart = addOneCalendarMonth(periodStart);
  }
  const periodEnd = addOneCalendarMonth(periodStart);
  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    inTrial: false,
    nextBillingAt: periodEnd.toISOString(),
  };
}

export function buildSevenDayTrialPatch(startedAt = new Date()) {
  const start = new Date(startedAt);
  const trialEnds = new Date(start);
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);
  return {
    credit_period_started_at: start.toISOString(),
    trial_ends_at: trialEnds.toISOString(),
    billing_cycle_anchor: trialEnds.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function applySevenDayTrialToCompany(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  companyId: string,
  startedAt = new Date(),
): Promise<{ trialEndsAt: string; billingAnchorAt: string }> {
  const patch = buildSevenDayTrialPatch(startedAt);
  const { error } = await supabase.from("companies").update(patch).eq("id", companyId);
  if (error) {
    if (
      error.message.includes("billing_cycle_anchor") ||
      error.message.includes("trial_ends_at") ||
      error.message.includes("does not exist")
    ) {
      throw new Error(
        "Faltan columnas de facturación. Ejecuta supabase/migrations/20261011000000_company_billing_trial.sql en Lovable Cloud.",
      );
    }
    throw new Error(error.message);
  }
  return {
    trialEndsAt: patch.trial_ends_at,
    billingAnchorAt: patch.billing_cycle_anchor,
  };
}
