import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------
export type CrmCustomer = {
  id: string;
  company_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  stage: string | null;
  tags: string[] | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  assignee_id: string | null;
  last_interaction_at: string | null;
  next_activity_at: string | null;
  estimated_value: number | null;
  custom_fields: any;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- List customers with filters ----------
const ListInput = z.object({
  search: z.string().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  channel: z.string().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  unassigned: z.boolean().optional(),
  vip: z.boolean().optional(),
  tag: z.string().optional(),
  sort: z
    .enum(["last_interaction", "created", "name", "value"])
    .default("last_interaction"),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("customers").select("*");
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`);
    }
    if (data.stage) q = q.eq("stage", data.stage);
    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.unassigned) q = q.is("assignee_id", null);
    else if (data.assignee_id) q = q.eq("assignee_id", data.assignee_id);
    if (data.vip) q = q.contains("tags", ["vip"]);
    if (data.tag) q = q.contains("tags", [data.tag]);

    switch (data.sort) {
      case "created":
        q = q.order("created_at", { ascending: false });
        break;
      case "name":
        q = q.order("name", { ascending: true });
        break;
      case "value":
        q = q.order("estimated_value", { ascending: false, nullsFirst: false });
        break;
      default:
        q = q.order("last_interaction_at", { ascending: false, nullsFirst: false });
    }
    q = q.limit(data.limit);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as CrmCustomer[];
  });

// ---------- Get one customer ----------
export const getCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as CrmCustomer | null;
  });

// ---------- Update customer (full) ----------
const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
  stage: z.string().max(60).nullable().optional(),
  status: z.string().max(40).nullable().optional(),
  priority: z.string().max(20).nullable().optional(),
  channel: z.string().max(40).nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(40)).max(50).optional(),
  notes: z.string().max(8000).nullable().optional(),
  estimated_value: z.number().nullable().optional(),
  next_activity_at: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

export const updateCrmCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: before } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Cliente no encontrado");

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of [
      "name",
      "email",
      "company",
      "position",
      "stage",
      "status",
      "priority",
      "channel",
      "assignee_id",
      "tags",
      "notes",
      "estimated_value",
      "next_activity_at",
      "custom_fields",
    ] as const) {
      if (data[k] !== undefined) patch[k] = data[k] as unknown;
    }

    const { error } = await supabase.from("customers").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Log a customer_event for the diff
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(patch)) {
      if (k === "updated_at") continue;
      const b = (before as Record<string, unknown>)[k];
      const a = patch[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) changed[k] = { from: b, to: a };
    }
    if (Object.keys(changed).length > 0) {
      await supabase.from("customer_events").insert({
        customer_id: data.id,
        company_id: before.company_id,
        actor_id: userId,
        event_type: "updated",
        payload: { changes: changed } as any,
      });
    }
    return { ok: true };
  });

// ---------- Add customer note ----------
export const addCustomerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ customer_id: z.string().uuid(), body: z.string().min(1).max(4000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c } = await supabase
      .from("customers")
      .select("company_id")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (!c) throw new Error("Cliente no encontrado");
    const { error } = await supabase.from("customer_notes").insert({
      customer_id: data.customer_id,
      company_id: c.company_id,
      author_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    await supabase.from("customer_events").insert({
      customer_id: data.customer_id,
      company_id: c.company_id,
      actor_id: userId,
      event_type: "note_added",
      payload: { preview: data.body.slice(0, 120) },
    });
    return { ok: true };
  });

// ---------- Delete customer note ----------
export const deleteCustomerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("customer_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Fetch unified timeline ----------
export type TimelineItem = {
  id: string;
  kind:
    | "customer_event"
    | "customer_note"
    | "conversation_event"
    | "conversation_note"
    | "created";
  event_type?: string;
  body?: string;
  payload?: any;
  actor_id?: string | null;
  conversation_id?: string | null;
  created_at: string;
};

export const getCustomerTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string; limit?: number }) =>
    z
      .object({
        customer_id: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: customer } = await supabase
      .from("customers")
      .select("id, created_at")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (!customer) return [] as TimelineItem[];

    const { data: convos } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", data.customer_id);
    const convoIds = (convos ?? []).map((c) => c.id);

    const [ceRes, cnRes, convEvRes, convNoRes] = await Promise.all([
      supabase
        .from("customer_events")
        .select("id, event_type, payload, actor_id, created_at")
        .eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      supabase
        .from("customer_notes")
        .select("id, body, author_id, created_at")
        .eq("customer_id", data.customer_id)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      convoIds.length
        ? supabase
            .from("conversation_events")
            .select("id, event_type, payload, actor_id, conversation_id, created_at")
            .in("conversation_id", convoIds)
            .order("created_at", { ascending: false })
            .limit(data.limit)
        : Promise.resolve({ data: [] as unknown[] } as { data: unknown[] }),
      convoIds.length
        ? supabase
            .from("conversation_notes")
            .select("id, body, author_id, conversation_id, created_at")
            .in("conversation_id", convoIds)
            .order("created_at", { ascending: false })
            .limit(data.limit)
        : Promise.resolve({ data: [] as unknown[] } as { data: unknown[] }),
    ]);

    const items: TimelineItem[] = [];
    for (const e of (ceRes.data ?? []) as Array<{
      id: string;
      event_type: string;
      payload: Record<string, unknown> | null;
      actor_id: string | null;
      created_at: string;
    }>) {
      items.push({
        id: `ce-${e.id}`,
        kind: "customer_event",
        event_type: e.event_type,
        payload: e.payload,
        actor_id: e.actor_id,
        created_at: e.created_at,
      });
    }
    for (const n of (cnRes.data ?? []) as Array<{
      id: string;
      body: string;
      author_id: string | null;
      created_at: string;
    }>) {
      items.push({
        id: `cn-${n.id}`,
        kind: "customer_note",
        body: n.body,
        actor_id: n.author_id,
        created_at: n.created_at,
      });
    }
    for (const e of (convEvRes.data ?? []) as Array<{
      id: string;
      event_type: string;
      payload: Record<string, unknown> | null;
      actor_id: string | null;
      conversation_id: string;
      created_at: string;
    }>) {
      items.push({
        id: `xe-${e.id}`,
        kind: "conversation_event",
        event_type: e.event_type,
        payload: e.payload,
        actor_id: e.actor_id,
        conversation_id: e.conversation_id,
        created_at: e.created_at,
      });
    }
    for (const n of (convNoRes.data ?? []) as Array<{
      id: string;
      body: string;
      author_id: string | null;
      conversation_id: string;
      created_at: string;
    }>) {
      items.push({
        id: `xn-${n.id}`,
        kind: "conversation_note",
        body: n.body,
        actor_id: n.author_id,
        conversation_id: n.conversation_id,
        created_at: n.created_at,
      });
    }
    items.push({
      id: `created-${customer.id}`,
      kind: "created",
      event_type: "customer_created",
      created_at: customer.created_at,
    });

    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return items.slice(0, data.limit) as unknown as TimelineItem[];
  });

// ---------- Team members (for assignment dropdown) ----------
export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
  });

// ============================================================================
// Bulk / import / delete — used by Embudo Comercial and CRM.
// ============================================================================

const BulkPatch = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    stage: z.string().max(60).nullable().optional(),
    priority: z.string().max(20).nullable().optional(),
    status: z.string().max(40).nullable().optional(),
    assignee_id: z.string().uuid().nullable().optional(),
    // tags_add / tags_remove operate additively without overwriting existing.
    tags_add: z.array(z.string().max(40)).max(30).optional(),
    tags_remove: z.array(z.string().max(40)).max(30).optional(),
    tags_set: z.array(z.string().max(40)).max(30).optional(),
    next_activity_at: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "ids"), {
    message: "Nothing to update",
  });

export const bulkUpdateCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BulkPatch.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error: readErr } = await supabase
      .from("customers")
      .select("id, company_id, stage, priority, status, assignee_id, tags, next_activity_at")
      .in("id", data.ids);
    if (readErr) throw new Error(readErr.message);
    if (!rows || rows.length === 0) return { updated: 0 };

    let updated = 0;
    for (const before of rows) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["stage", "priority", "status", "assignee_id", "next_activity_at"] as const) {
        if (data[k] !== undefined) patch[k] = data[k];
      }
      const current = new Set<string>(((before as any).tags ?? []) as string[]);
      if (data.tags_set) {
        patch.tags = Array.from(new Set(data.tags_set));
      } else {
        (data.tags_add ?? []).forEach((t) => current.add(t));
        (data.tags_remove ?? []).forEach((t) => current.delete(t));
        if (data.tags_add || data.tags_remove) patch.tags = Array.from(current);
      }

      const { error } = await supabase
        .from("customers")
        .update(patch as any)
        .eq("id", (before as any).id);
      if (error) continue;

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of Object.keys(patch)) {
        if (k === "updated_at") continue;
        const b = (before as Record<string, unknown>)[k];
        const a = patch[k];
        if (JSON.stringify(b) !== JSON.stringify(a)) changes[k] = { from: b, to: a };
      }
      if (Object.keys(changes).length > 0) {
        await supabase.from("customer_events").insert({
          customer_id: (before as any).id,
          company_id: (before as any).company_id,
          actor_id: userId,
          event_type: "bulk_updated",
          payload: { changes } as any,
        });
      }
      updated++;
    }
    return { updated };
  });

// ---------- Delete customers (used by Embudo bulk archive/eliminación) ----------
export const deleteCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("customers")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

// ---------- Bulk import from CSV (used by Embudo import dialog) ----------
const ImportRow = z.object({
  phone: z.string().min(4).max(40),
  name: z.string().max(200).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  stage: z.string().max(60).optional().nullable(),
  priority: z.string().max(20).optional().nullable(),
  tags: z.array(z.string().max(40)).optional().nullable(),
  estimated_value: z.number().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const bulkImportCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ rows: z.array(ImportRow).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) throw new Error("Sin empresa activa");

    // Dedupe against existing phones for this company.
    const phones = data.rows.map((r) => r.phone.trim()).filter(Boolean);
    const { data: existing } = await supabase
      .from("customers")
      .select("phone")
      .eq("company_id", companyId)
      .in("phone", phones);
    const seen = new Set<string>(((existing ?? []) as any[]).map((r) => r.phone));

    const inserts: any[] = [];
    let skipped = 0;
    for (const r of data.rows) {
      const phone = r.phone.trim();
      if (!phone || seen.has(phone)) {
        skipped++;
        continue;
      }
      seen.add(phone);
      inserts.push({
        company_id: companyId,
        phone,
        name: r.name ?? null,
        email: r.email ?? null,
        company: r.company ?? null,
        stage: r.stage ?? "nuevo_lead",
        priority: r.priority ?? "normal",
        status: "active",
        assignee_id: r.assignee_id ?? null,
        tags: r.tags ?? [],
        estimated_value: r.estimated_value ?? null,
        notes: r.notes ?? null,
        channel: "import",
      });
    }
    if (inserts.length === 0) return { created: 0, skipped };
    const { error } = await supabase.from("customers").insert(inserts as any);
    if (error) throw new Error(error.message);
    return { created: inserts.length, skipped };
  });

