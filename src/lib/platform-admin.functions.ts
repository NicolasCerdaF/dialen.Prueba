import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: no eres administrador de plataforma");
}

export const isPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const getPlatformMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [companiesRes, profilesRes, convRes, msgRes, quotesRes] = await Promise.all([
      supabaseAdmin.from("companies").select("id, plan, created_at"),
      supabaseAdmin.from("profiles").select("id, created_at"),
      supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("messages").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("quotes").select("total, status, currency"),
    ]);

    const companies = companiesRes.data ?? [];
    const basic = companies.filter((c: any) => (c.plan ?? "basico") === "basico").length;
    const business = companies.filter((c: any) => c.plan === "premium").length;

    const acceptedTotal = (quotesRes.data ?? [])
      .filter((q: any) => q.status === "accepted")
      .reduce((sum: number, q: any) => sum + (Number(q.total) || 0), 0);

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const signups30d = (profilesRes.data ?? []).filter(
      (p: any) => new Date(p.created_at).getTime() >= cutoff,
    ).length;

    return {
      totals: {
        companies: companies.length,
        users: (profilesRes.data ?? []).length,
        conversations: convRes.count ?? 0,
        messages: msgRes.count ?? 0,
        acceptedRevenue: acceptedTotal,
      },
      plans: { basic, business },
      signups30d,
    };
  });

export const listPlatformCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveBillingPeriod } = await import("@/lib/billing-period.server");

    const { data: companies, error } = await supabaseAdmin
      .from("companies")
      .select(
        "id, name, plan, owner_id, created_at, trial_ends_at, billing_cycle_anchor, credit_period_started_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, email, full_name");
    const byCompany = new Map<string, { count: number }>();
    for (const p of profiles ?? []) {
      if (!p.company_id) continue;
      const rec = byCompany.get(p.company_id) ?? { count: 0 };
      rec.count += 1;
      byCompany.set(p.company_id, rec);
    }

    return (companies ?? []).map((c: any) => {
      const owner = (profiles ?? []).find((p: any) => p.id === c.owner_id);
      const billing = resolveBillingPeriod(c);
      return {
        id: c.id,
        name: c.name,
        plan: (c.plan ?? "basico") as "basico" | "premium",
        createdAt: c.created_at,
        userCount: byCompany.get(c.id)?.count ?? 0,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.full_name ?? null,
        inTrial: billing.inTrial,
        trialEndsAt: c.trial_ends_at ?? null,
        nextBillingAt: billing.nextBillingAt,
      };
    });
  });

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCreditSnapshot } = await import("@/lib/credits.server");
    const { normalizePlanId } = await import("@/lib/plans.server");

    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authErr) throw new Error(authErr.message);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, company_id");
    const { data: companies } = await supabaseAdmin
      .from("companies")
      .select(
        "id, name, plan, trial_ends_at, billing_cycle_anchor, credit_period_started_at",
      );
    const compById = new Map((companies ?? []).map((c: any) => [c.id, c]));

    const usageByCompany = new Map<string, Awaited<ReturnType<typeof getCreditSnapshot>>>();
    for (const c of companies ?? []) {
      const plan = normalizePlanId(c.plan as string);
      usageByCompany.set(c.id, await getCreditSnapshot(supabaseAdmin, c.id, plan));
    }

    return (authList?.users ?? []).map((u: any) => {
      const prof = (profiles ?? []).find((p: any) => p.id === u.id);
      const bannedUntil = u.banned_until ? new Date(u.banned_until).getTime() : 0;
      const comp = prof?.company_id ? compById.get(prof.company_id) : null;
      const plan = ((comp as any)?.plan ?? "basico") as string;
      const snap = prof?.company_id ? usageByCompany.get(prof.company_id) : null;
      const included = snap?.included ?? 0;
      const used = snap?.used ?? 0;
      return {
        id: u.id,
        email: u.email ?? prof?.email ?? "",
        fullName: prof?.full_name ?? null,
        companyId: prof?.company_id ?? null,
        companyName: (comp as any)?.name ?? null,
        plan,
        creditsUsed: used,
        creditsIncluded: included,
        creditsPct: included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0,
        inTrial: snap?.inTrial ?? false,
        trialEndsAt: snap?.inTrial ? snap.period_end : null,
        nextBillingAt: snap?.nextBillingAt ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        banned: bannedUntil > Date.now(),
        bannedUntil: u.banned_until ?? null,
      };
    });
  });

export const createPlatformClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        fullName: z.string().min(1).max(120),
        companyName: z.string().min(2).max(120),
        plan: z.enum(["basico", "premium"]),
        sevenDayTrial: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { adminCreateClientAccount } = await import("@/lib/platform-client-create.server");
    return adminCreateClientAccount(supabaseAdmin, data);
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("No puedes bloquearte a ti mismo");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.banned ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ userId: z.string().uuid(), newPassword: z.string().min(8).max(72).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = data.newPassword ?? randomPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password,
    });
    if (error) throw new Error(error.message);
    return { password };
  });

export const setCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyId: z.string().uuid(),
        plan: z.enum(["basico", "premium"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { setCompanyPlanUnified } = await import("@/lib/plans.server");
    await setCompanyPlanUnified(supabaseAdmin, data.companyId, data.plan);
    return { ok: true, plan: data.plan };
  });

export const getFinancialSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const monthsBack = 6;
    const startMonth = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
    const startIso = startMonth.toISOString();

    const [profilesRes, companiesRes, suggRes, runsRes, insightsRes, quotesRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, created_at").gte("created_at", startIso),
      supabaseAdmin.from("companies").select("id, plan, created_at").gte("created_at", startIso),
      supabaseAdmin.from("ai_suggestions").select("created_at").gte("created_at", startIso),
      supabaseAdmin.from("automation_runs").select("created_at").gte("created_at", startIso),
      supabaseAdmin.from("director_insights").select("created_at").gte("created_at", startIso),
      supabaseAdmin.from("quotes").select("total, status, currency, created_at"),
    ]);

    const months: { key: string; label: string; year: number; month: number }[] = [];
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }

    const bucketize = (rows: any[] | null | undefined) => {
      const out = new Map<string, number>();
      for (const r of rows ?? []) {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        out.set(key, (out.get(key) ?? 0) + 1);
      }
      return out;
    };

    const signupsB = bucketize(profilesRes.data);
    const companiesB = bucketize(companiesRes.data);
    const aiB = bucketize([
      ...(suggRes.data ?? []),
      ...(runsRes.data ?? []),
      ...(insightsRes.data ?? []),
    ]);

    const series = months.map((m) => ({
      month: m.label,
      key: m.key,
      signups: signupsB.get(m.key) ?? 0,
      companies: companiesB.get(m.key) ?? 0,
      ai: aiB.get(m.key) ?? 0,
    }));

    const revByCurrency = new Map<string, number>();
    for (const q of quotesRes.data ?? []) {
      if (q.status !== "accepted") continue;
      const cur = (q.currency ?? "CLP").toUpperCase();
      revByCurrency.set(cur, (revByCurrency.get(cur) ?? 0) + (Number(q.total) || 0));
    }
    const revenueByCurrency = Array.from(revByCurrency.entries()).map(([currency, total]) => ({
      currency,
      total,
    }));

    const currentKey = months[months.length - 1].key;
    const currentMonthAi = aiB.get(currentKey) ?? 0;

    return { series, revenueByCurrency, currentMonthAi };
  });
