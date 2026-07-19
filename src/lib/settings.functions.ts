import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "manager" | "vendedor";

async function ensureOwnerAdminRole(supabase: any, userId: string, companyId: string) {
  const { data: company } = await supabase
    .from("companies")
    .select("owner_id")
    .eq("id", companyId)
    .maybeSingle();
  if (company?.owner_id !== userId) return;

  const { error } = await supabase.from("user_roles").upsert(
    {
      user_id: userId,
      company_id: companyId,
      role: "admin",
    },
    { onConflict: "user_id,company_id,role", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

async function getCompanyId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("company_id, email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (data?.company_id) {
    const companyId = data.company_id as string;
    await ensureOwnerAdminRole(supabase, userId, companyId);
    return companyId;
  }

  // Bootstrap para cuentas existentes en proyectos remixados: si el trigger de
  // alta no creó empresa/perfil/rol, lo resolvemos antes de cargar Configuración.
  const { data: authUser } = await supabase.auth.getUser();
  const email: string | null = data?.email ?? authUser?.user?.email ?? null;
  const fullName: string =
    data?.full_name ??
    (authUser?.user?.user_metadata as any)?.full_name ??
    (email ? email.split("@")[0] : "Mi empresa");

  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const companyId = existingCompany?.id
    ? existingCompany.id
    : (await supabase
        .from("companies")
        .insert({ name: `${fullName} Workspace`, owner_id: userId })
        .select("id")
        .single()).data?.id;

  if (!companyId) {
    throw new Error("No se pudo crear la empresa");
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError || !company?.id) {
    throw new Error(companyError?.message || "No se pudo cargar la empresa");
  }

  const resolvedCompanyId = company.id as string;

  if (data) {
    const { error } = await supabase
      .from("profiles")
      .update({ company_id: resolvedCompanyId })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("profiles").insert({
      id: userId,
      full_name: fullName,
      email,
      company_id: resolvedCompanyId,
    });
    if (error) throw new Error(error.message);
  }

  await ensureOwnerAdminRole(supabase, userId, resolvedCompanyId);

  return resolvedCompanyId;
}

async function assertAdmin(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase.rpc("has_role", {
    _user_id: userId,
    _company_id: companyId,
    _role: "admin",
  });
  if (!data) throw new Error("Solo un administrador puede realizar esta acción");
}

// ---------- COMPANY PROFILE ----------
export const getCompanyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    const { data: c } = await supabase
      .from("companies")
      .select(
        "id, name, language, demo_mode, ai_confidence_threshold, created_at, updated_at, owner_id"
      )
      .eq("id", companyId)
      .maybeSingle();
    return c;
  });

const UpdateCompanyInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  language: z.string().trim().min(2).max(5).optional(),
  demoMode: z.boolean().optional(),
  aiConfidenceThreshold: z.number().min(0).max(1).optional(),
});

export const updateCompanyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateCompanyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await assertAdmin(supabase, userId, companyId);
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.language !== undefined) update.language = data.language;
    if (data.demoMode !== undefined) update.demo_mode = data.demoMode;
    if (data.aiConfidenceThreshold !== undefined)
      update.ai_confidence_threshold = data.aiConfidenceThreshold;
    if (Object.keys(update).length === 0) return { ok: true };
    const { error } = await supabase.from("companies").update(update as any).eq("id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- PERSONAL PROFILE ----------
const UpdateProfileInput = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  avatarUrl: z.string().url().max(500).optional().nullable(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const update: Record<string, unknown> = {};
    if (data.fullName !== undefined) update.full_name = data.fullName;
    if (data.avatarUrl !== undefined) update.avatar_url = data.avatarUrl;
    if (Object.keys(update).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(update as any).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- TEAM ----------
export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at")
      .eq("company_id", companyId);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return { members: [], companyId };
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", ids);
    const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const members = (roles ?? []).map((r: any) => {
      const p: any = map.get(r.user_id) ?? {};
      return {
        userId: r.user_id,
        role: r.role as Role,
        joinedAt: r.created_at,
        fullName: p.full_name ?? null,
        email: p.email ?? null,
        avatarUrl: p.avatar_url ?? null,
      };
    });
    return { members, companyId };
  });

const UpdateRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "manager", "vendedor"]),
});

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateRoleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await assertAdmin(supabase, userId, companyId);
    // Prevent removing last admin
    if (data.userId === userId && data.role !== "admin") {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("role", "admin");
      if (!admins || admins.length <= 1) {
        throw new Error("Debe existir al menos un administrador");
      }
    }
    const { error } = await supabase
      .from("user_roles")
      .update({ role: data.role })
      .eq("company_id", companyId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RemoveMemberInput = z.object({ userId: z.string().uuid() });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RemoveMemberInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await assertAdmin(supabase, userId, companyId);
    if (data.userId === userId) throw new Error("No puedes eliminarte a ti mismo");
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("company_id", companyId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- AUDIT TRAIL ----------
export const getAuditTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number } | undefined) => ({
    limit: Math.min(200, Math.max(10, d?.limit ?? 50)),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    const tables = [
      { table: "customer_events", entity: "Cliente" },
      { table: "product_events", entity: "Producto" },
      { table: "quote_events", entity: "Cotización" },
      { table: "conversation_events", entity: "Conversación" },
      { table: "knowledge_document_events", entity: "Conocimiento" },
    ] as const;
    const limit = data.limit;
    const results = await Promise.all(
      tables.map(async ({ table, entity }) => {
        const { data: rows } = await (supabase as any)
          .from(table)
          .select("id, event_type, created_at, actor_id, payload")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return (rows ?? []).map((row: any) => ({
          id: `${table}:${row.id}`,
          entity,
          eventType: row.event_type,
          createdAt: row.created_at as string,
          actorId: row.actor_id ?? null,
          payload: row.payload ?? null,
        }));
      })
    );
    const merged = results
      .flat()
      .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
    const actorIds = Array.from(new Set(merged.map((e) => e.actorId).filter(Boolean))) as string[];
    let names = new Map<string, string>();
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      names = new Map(
        (profiles ?? []).map((p: any) => [p.id, p.full_name || p.email || "Usuario"])
      );
    }
    return merged.map((e) => ({
      ...e,
      actorName: e.actorId ? names.get(e.actorId) ?? "Usuario" : "Sistema",
    }));
  });

// ---------- DATA EXPORT ----------
const ExportInput = z.object({
  entity: z.enum(["customers", "quotes", "products", "conversations"]),
});

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => escape(row[c])).join(","));
  return lines.join("\n");
}

export const exportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ExportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    const map: Record<string, { table: string; cols: string }> = {
      customers: {
        table: "customers",
        cols:
          "id, full_name, phone, email, stage, tags, notes, last_interaction_at, created_at",
      },
      quotes: {
        table: "quotes",
        cols:
          "id, code, status, customer_id, subtotal, tax_amount, total, currency, valid_until, created_at",
      },
      products: {
        table: "products",
        cols: "id, name, sku, price, stock, currency, active, category, created_at",
      },
      conversations: {
        table: "conversations",
        cols:
          "id, customer_id, channel, stage, unread_count, last_message_at, created_at",
      },
    };
    const cfg = map[data.entity];
    const { data: rows, error } = await (supabase as any)
      .from(cfg.table)
      .select(cfg.cols)
      .eq("company_id", companyId)
      .limit(10000);
    if (error) throw new Error(error.message);
    return {
      filename: `${data.entity}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows ?? []),
      count: rows?.length ?? 0,
    };
  });

// ---------- STATS SUMMARY ----------
export const getSettingsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    const [members, wa, customers, products, quotes, automations] = await Promise.all([
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("whatsapp_channels").select("status, display_phone").eq("company_id", companyId).maybeSingle(),
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase.from("automations").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    ]);
    return {
      members: members.count ?? 0,
      whatsapp: wa.data ?? null,
      customers: customers.count ?? 0,
      products: products.count ?? 0,
      quotes: quotes.count ?? 0,
      automations: automations.count ?? 0,
    };
  });
