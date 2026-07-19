import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ContactSignal = {
  key: "high_intent" | "recurring" | "inactive" | "new" | "no_followup" | "vip";
  label: string;
  tone: "primary" | "success" | "warning" | "muted";
};

export type ContactRow = {
  id: string;
  company_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  stage: string | null;
  tags: string[] | null;
  channel: string | null;
  assignee_id: string | null;
  last_interaction_at: string | null;
  estimated_value: number | null;
  created_at: string;
  // aggregates
  conversation_id: string | null;
  message_count: number;
  quote_count: number;
  accepted_quote_count: number;
  is_client: boolean;
  signals: ContactSignal[];
};

const Segment = z.enum([
  "all",
  "contactos",
  "clientes",
  "new",
  "inactive",
  "high_intent",
  "no_followup",
  "unassigned",
  "vip",
]);
export type ContactSegment = z.infer<typeof Segment>;

const ListInput = z.object({
  search: z.string().optional(),
  segment: Segment.default("all"),
  origin: z.string().optional(),
  tag: z.string().optional(),
  sort: z.enum(["last_interaction", "created", "name", "value"]).default("last_interaction"),
  limit: z.number().int().min(1).max(500).default(200),
});

const DAY = 24 * 3600 * 1000;

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q = supabase.from("customers").select("*");
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`,
      );
    }
    if (data.origin) q = q.eq("channel", data.origin);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.segment === "unassigned") q = q.is("assignee_id", null);
    if (data.segment === "vip") q = q.contains("tags", ["vip"]);

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
    const customers = rows ?? [];
    if (customers.length === 0) return [] as ContactRow[];

    const ids = customers.map((c: any) => c.id);

    // Aggregate quotes & conversations in parallel
    const [quotesRes, convsRes] = await Promise.all([
      supabase
        .from("quotes")
        .select("customer_id, status")
        .in("customer_id", ids),
      supabase
        .from("conversations")
        .select("id, customer_id, last_message_at")
        .in("customer_id", ids),
    ]);
    if (quotesRes.error) throw new Error(quotesRes.error.message);
    if (convsRes.error) throw new Error(convsRes.error.message);

    const quoteMap = new Map<string, { total: number; accepted: number }>();
    for (const q of quotesRes.data ?? []) {
      const e = quoteMap.get((q as any).customer_id) ?? { total: 0, accepted: 0 };
      e.total += 1;
      if (["accepted", "aceptada", "won"].includes((q as any).status)) e.accepted += 1;
      quoteMap.set((q as any).customer_id, e);
    }

    const convMap = new Map<string, string>();
    const convCount = new Map<string, number>();
    for (const c of convsRes.data ?? []) {
      const cid = (c as any).customer_id as string;
      if (!convMap.has(cid)) convMap.set(cid, (c as any).id);
      convCount.set(cid, (convCount.get(cid) ?? 0) + 1);
    }

    const now = Date.now();

    let enriched: ContactRow[] = customers.map((c: any) => {
      const qm = quoteMap.get(c.id) ?? { total: 0, accepted: 0 };
      const msgs = convCount.get(c.id) ?? 0;
      const lastMs = c.last_interaction_at ? new Date(c.last_interaction_at).getTime() : 0;
      const ageDays = c.created_at ? (now - new Date(c.created_at).getTime()) / DAY : 999;
      const inactiveDays = lastMs ? (now - lastMs) / DAY : 999;
      const isClient = qm.accepted > 0;

      const signals: ContactSignal[] = [];
      if ((c.tags ?? []).includes("vip")) signals.push({ key: "vip", label: "VIP", tone: "warning" });
      if (ageDays <= 7) signals.push({ key: "new", label: "Nuevo", tone: "primary" });
      if (qm.accepted >= 2) signals.push({ key: "recurring", label: "Recurrente", tone: "success" });
      if (qm.total >= 1 && !isClient && inactiveDays < 14)
        signals.push({ key: "high_intent", label: "Alta intención", tone: "primary" });
      if (inactiveDays > 30) signals.push({ key: "inactive", label: "Inactivo", tone: "muted" });
      else if (inactiveDays > 7) signals.push({ key: "no_followup", label: "Sin seguimiento", tone: "warning" });

      return {
        id: c.id,
        company_id: c.company_id,
        phone: c.phone,
        name: c.name,
        email: c.email,
        company: c.company,
        stage: c.stage,
        tags: c.tags,
        channel: c.channel,
        assignee_id: c.assignee_id,
        last_interaction_at: c.last_interaction_at,
        estimated_value: c.estimated_value,
        created_at: c.created_at,
        conversation_id: convMap.get(c.id) ?? null,
        message_count: msgs,
        quote_count: qm.total,
        accepted_quote_count: qm.accepted,
        is_client: isClient,
        signals,
      };
    });

    // Segment filters that need aggregates
    switch (data.segment) {
      case "contactos":
        enriched = enriched.filter((c) => !c.is_client);
        break;
      case "clientes":
        enriched = enriched.filter((c) => c.is_client);
        break;
      case "new":
        enriched = enriched.filter((c) => c.signals.some((s) => s.key === "new"));
        break;
      case "inactive":
        enriched = enriched.filter((c) => c.signals.some((s) => s.key === "inactive"));
        break;
      case "high_intent":
        enriched = enriched.filter((c) => c.signals.some((s) => s.key === "high_intent"));
        break;
      case "no_followup":
        enriched = enriched.filter((c) => c.signals.some((s) => s.key === "no_followup"));
        break;
      default:
        break;
    }

    return enriched;
  });

// ---------- Create contact ----------
const CreateInput = z.object({
  phone: z.string().trim().min(4).max(30),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  company: z.string().trim().max(120).optional(),
  channel: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // resolve company_id via profile
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    const company_id = (prof as any)?.company_id;
    if (!company_id) throw new Error("No company found for user");

    // Dedupe by phone within company
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", company_id)
      .eq("phone", data.phone)
      .maybeSingle();
    if (existing) return { id: (existing as any).id, duplicate: true };

    const insert = {
      company_id,
      phone: data.phone,
      name: data.name ?? null,
      email: data.email ? data.email : null,
      company: data.company ?? null,
      channel: data.channel ?? "manual",
      tags: data.tags ?? [],
      notes: data.notes ?? null,
    };
    const { data: row, error } = await supabase
      .from("customers")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id, duplicate: false };
  });
