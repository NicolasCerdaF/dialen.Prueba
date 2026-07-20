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
      supabaseAdmin.from("quotes").select("total_amount, status, currency"),
    ]);

    const companies = companiesRes.data ?? [];
    const basic = companies.filter((c: any) => (c.plan ?? "basico") === "basico").length;
    const business = companies.filter((c: any) => c.plan === "premium").length;

    const acceptedTotal = (quotesRes.data ?? [])
      .filter((q: any) => q.status === "accepted")
      .reduce((sum: number, q: any) => sum + (Number(q.total_amount) || 0), 0);

    // Signups last 30 days
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

    const { data: companies, error } = await supabaseAdmin
      .from("companies")
      .select("id, name, plan, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Users per company
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
      return {
        id: c.id,
        name: c.name,
        plan: (c.plan ?? "basico") as "basico" | "premium",
        createdAt: c.created_at,
        userCount: byCompany.get(c.id)?.count ?? 0,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.full_name ?? null,
      };
    });
  });

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Auth users (source of truth for banned status + last sign in)
    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authErr) throw new Error(authErr.message);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, company_id");
    const { data: companies } = await supabaseAdmin.from("companies").select("id, name");
    const compById = new Map((companies ?? []).map((c: any) => [c.id, c.name]));

    return (authList?.users ?? []).map((u: any) => {
      const prof = (profiles ?? []).find((p: any) => p.id === u.id);
      const bannedUntil = u.banned_until ? new Date(u.banned_until).getTime() : 0;
      return {
        id: u.id,
        email: u.email ?? prof?.email ?? "",
        fullName: prof?.full_name ?? null,
        companyId: prof?.company_id ?? null,
        companyName: prof?.company_id ? compById.get(prof.company_id) ?? null : null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        banned: bannedUntil > Date.now(),
        bannedUntil: u.banned_until ?? null,
      };
    });
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
