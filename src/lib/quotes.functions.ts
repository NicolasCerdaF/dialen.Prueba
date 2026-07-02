import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------
export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";

export type QuoteItem = {
  id: string;
  quote_id: string;
  product_id: string | null;
  recommendation_id: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  margin: number;
  position: number;
  ai_suggested: boolean;
  created_at: string;
};

export type Quote = {
  id: string;
  company_id: string;
  customer_id: string;
  conversation_id: string | null;
  stage: string | null;
  number: string;
  title: string | null;
  status: QuoteStatus;
  currency: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  margin_total: number;
  notes: string | null;
  terms: string | null;
  valid_until: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  expired_at: string | null;
  ai_generated: boolean;
  ai_context: any;
  share_token: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: {
    id: string;
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    stage: string | null;
    assignee_id: string | null;
  } | null;
  items?: QuoteItem[];
};

// ---------- Helpers ----------
async function getCompanyId(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!data?.company_id) throw new Error("Sin empresa");
  return data.company_id as string;
}

function computeLine(item: {
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_pct: number;
  tax_pct: number;
}) {
  const gross = item.quantity * item.unit_price;
  const afterDisc = gross * (1 - (item.discount_pct ?? 0) / 100);
  const tax = afterDisc * ((item.tax_pct ?? 0) / 100);
  const line_total = Number((afterDisc + tax).toFixed(2));
  const margin = Number((afterDisc - item.quantity * (item.unit_cost ?? 0)).toFixed(2));
  return { line_total, margin };
}

function computeTotals(items: Array<Parameters<typeof computeLine>[0] & { line_total?: number; margin?: number }>) {
  let subtotal = 0;
  let discount_total = 0;
  let tax_total = 0;
  let margin_total = 0;
  for (const it of items) {
    const gross = it.quantity * it.unit_price;
    const disc = gross * ((it.discount_pct ?? 0) / 100);
    const afterDisc = gross - disc;
    const tax = afterDisc * ((it.tax_pct ?? 0) / 100);
    subtotal += gross;
    discount_total += disc;
    tax_total += tax;
    margin_total += afterDisc - it.quantity * (it.unit_cost ?? 0);
  }
  const total = subtotal - discount_total + tax_total;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount_total: Number(discount_total.toFixed(2)),
    tax_total: Number(tax_total.toFixed(2)),
    total: Number(total.toFixed(2)),
    margin_total: Number(margin_total.toFixed(2)),
  };
}

async function nextQuoteNumber(supabase: any, company_id: string) {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company_id);
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `Q-${year}-${seq}`;
}

// ---------- Schemas ----------
const ItemInput = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  recommendation_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  sku: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantity: z.number().min(0).default(1),
  unit_price: z.number().min(0).default(0),
  unit_cost: z.number().min(0).default(0),
  discount_pct: z.number().min(0).max(100).default(0),
  tax_pct: z.number().min(0).max(100).default(0),
  position: z.number().int().default(0),
  ai_suggested: z.boolean().default(false),
});

const CreateInput = z.object({
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  currency: z.string().length(3).default("USD"),
  valid_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  items: z.array(ItemInput).default([]),
  ai_generated: z.boolean().default(false),
  ai_context: z.record(z.string(), z.any()).default({}),
});

// ---------- List ----------
export const listQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.string().optional(),
        customer_id: z.string().uuid().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("quotes")
      .select("*, customer:customers(id, name, company, email, phone, stage, assignee_id)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.customer_id) q = q.eq("customer_id", data.customer_id);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(`number.ilike.%${s}%,title.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Quote[];
  });

// ---------- Get ----------
export const getQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: quote, error }, { data: items }] = await Promise.all([
      supabase
        .from("quotes")
        .select("*, customer:customers(id, name, company, email, phone, stage, assignee_id)")
        .eq("id", data.id)
        .maybeSingle(),
      supabase.from("quote_items").select("*").eq("quote_id", data.id).order("position", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    if (!quote) return null;
    return { ...(quote as Quote), items: (items ?? []) as QuoteItem[] };
  });

// ---------- Create ----------
export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);

    const { data: customer } = await supabase
      .from("customers")
      .select("id, stage, estimated_value")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (!customer) throw new Error("Cliente no encontrado");

    const number = await nextQuoteNumber(supabase, company_id);
    const totals = computeTotals(data.items);
    const share_token = crypto.randomUUID().replace(/-/g, "");

    const { data: quote, error } = await supabase
      .from("quotes")
      .insert({
        company_id,
        customer_id: data.customer_id,
        conversation_id: data.conversation_id ?? null,
        stage: customer.stage ?? null,
        number,
        title: data.title ?? null,
        status: "draft" as QuoteStatus,
        currency: data.currency,
        valid_until: data.valid_until ?? null,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        ai_generated: data.ai_generated,
        ai_context: data.ai_context,
        share_token,
        created_by: userId,
        ...totals,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.items.length > 0) {
      const rows = data.items.map((it, idx) => {
        const { line_total, margin } = computeLine(it);
        return {
          quote_id: quote.id,
          product_id: it.product_id ?? null,
          recommendation_id: it.recommendation_id ?? null,
          name: it.name,
          sku: it.sku ?? null,
          description: it.description ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost,
          discount_pct: it.discount_pct,
          tax_pct: it.tax_pct,
          line_total,
          margin,
          position: it.position ?? idx,
          ai_suggested: it.ai_suggested,
        };
      });
      const { error: itemsErr } = await supabase.from("quote_items").insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);
    }

    // Audit events (CRM timeline + quote timeline)
    await Promise.all([
      supabase.from("quote_events").insert({
        quote_id: quote.id,
        company_id,
        actor_id: userId,
        event_type: data.ai_generated ? "ai_draft" : "created",
        payload: { number, total: totals.total, currency: data.currency, items: data.items.length },
      }),
      supabase.from("customer_events").insert({
        customer_id: data.customer_id,
        company_id,
        actor_id: userId,
        event_type: "quote_created",
        payload: {
          quote_id: quote.id,
          number,
          total: totals.total,
          currency: data.currency,
          ai_generated: data.ai_generated,
        },
      }),
    ]);

    return quote.id as string;
  });

// ---------- Update (edit draft or metadata) ----------
const UpdateInput = z.object({
  id: z.string().uuid(),
  title: z.string().nullable().optional(),
  currency: z.string().length(3).optional(),
  valid_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  items: z.array(ItemInput).optional(),
});

export const updateQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    for (const k of ["title", "currency", "valid_until", "notes", "terms"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.items) {
      const totals = computeTotals(data.items);
      Object.assign(patch, totals);
      await supabase.from("quote_items").delete().eq("quote_id", data.id);
      const rows = data.items.map((it, idx) => {
        const { line_total, margin } = computeLine(it);
        return {
          quote_id: data.id,
          product_id: it.product_id ?? null,
          recommendation_id: it.recommendation_id ?? null,
          name: it.name,
          sku: it.sku ?? null,
          description: it.description ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost,
          discount_pct: it.discount_pct,
          tax_pct: it.tax_pct,
          line_total,
          margin,
          position: it.position ?? idx,
          ai_suggested: it.ai_suggested,
        };
      });
      if (rows.length > 0) {
        const { error } = await supabase.from("quote_items").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("quotes").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    const { data: q } = await supabase
      .from("quotes")
      .select("company_id")
      .eq("id", data.id)
      .maybeSingle();
    if (q) {
      await supabase.from("quote_events").insert({
        quote_id: data.id,
        company_id: q.company_id,
        actor_id: userId,
        event_type: "updated",
        payload: { fields: Object.keys(patch) },
      });
    }
    return { ok: true };
  });

// ---------- Change status ----------
const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "sent", "viewed", "accepted", "rejected", "expired"]),
});

export const setQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const patch: any = { status: data.status };
    if (data.status === "sent") patch.sent_at = now;
    if (data.status === "viewed") patch.viewed_at = now;
    if (data.status === "accepted") patch.accepted_at = now;
    if (data.status === "rejected") patch.rejected_at = now;
    if (data.status === "expired") patch.expired_at = now;

    const { data: quote, error } = await supabase
      .from("quotes")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Log events
    await Promise.all([
      supabase.from("quote_events").insert({
        quote_id: data.id,
        company_id: quote.company_id,
        actor_id: userId,
        event_type: data.status,
        payload: { total: quote.total, number: quote.number },
      }),
      supabase.from("customer_events").insert({
        customer_id: quote.customer_id,
        company_id: quote.company_id,
        actor_id: userId,
        event_type: `quote_${data.status}`,
        payload: { quote_id: data.id, number: quote.number, total: quote.total },
      }),
    ]);

    // Side-effects on customer stage when accepted / rejected
    if (data.status === "accepted") {
      await supabase.from("customers").update({ stage: "venta_ganada" }).eq("id", quote.customer_id);
    } else if (data.status === "rejected") {
      await supabase.from("customers").update({ stage: "venta_perdida" }).eq("id", quote.customer_id);
    }

    // Fire automations trigger (best-effort)
    try {
      const { runAutomationForCustomer } = await import("@/lib/automations.functions");
      const triggerMap: Record<string, string> = {
        sent: "quote_sent",
        viewed: "quote_viewed",
        accepted: "quote_accepted",
        rejected: "quote_rejected",
        expired: "quote_expired",
      };
      const trig = triggerMap[data.status];
      if (trig) {
        // fire-and-forget
        (runAutomationForCustomer as any).handler?.({
          data: { customer_id: quote.customer_id, trigger: trig, payload: { quote_id: data.id } },
          context: { supabase, userId },
        });
      }
    } catch {
      /* ignore */
    }

    return { ok: true };
  });

// ---------- Delete ----------
export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("quotes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- AI: build draft from active recommendations ----------
export const generateQuoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customer_id: z.string().uuid(),
        conversation_id: z.string().uuid().nullable().optional(),
        max_items: z.number().int().min(1).max(10).default(4),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);

    // Pull active recommendations w/ product info, sorted by score
    const { data: recos } = await supabase
      .from("product_recommendations")
      .select(
        "id, product_id, score, probability, reason_code, reason, product:products(id, name, sku, price, cost, currency)",
      )
      .eq("customer_id", data.customer_id)
      .eq("status", "active")
      .order("score", { ascending: false })
      .limit(data.max_items);

    const list = (recos ?? []).filter((r: any) => r.product);
    if (list.length === 0) {
      throw new Error("No hay recomendaciones activas de IA para este cliente. Genera recomendaciones primero.");
    }

    const currency = (list[0] as any).product?.currency ?? "USD";
    const items = list.map((r: any, idx: number) => ({
      product_id: r.product_id,
      recommendation_id: r.id,
      name: r.product.name,
      sku: r.product.sku ?? null,
      description: r.reason ?? null,
      quantity: 1,
      unit_price: Number(r.product.price ?? 0),
      unit_cost: Number(r.product.cost ?? 0),
      discount_pct: 0,
      tax_pct: 0,
      position: idx,
      ai_suggested: true,
    }));

    const totals = computeTotals(items);
    const number = await nextQuoteNumber(supabase, company_id);
    const { data: customer } = await supabase
      .from("customers")
      .select("stage")
      .eq("id", data.customer_id)
      .maybeSingle();

    const share_token = crypto.randomUUID().replace(/-/g, "");
    const { data: quote, error } = await supabase
      .from("quotes")
      .insert({
        company_id,
        customer_id: data.customer_id,
        conversation_id: data.conversation_id ?? null,
        stage: customer?.stage ?? null,
        number,
        title: "Propuesta sugerida por IA",
        status: "draft" as QuoteStatus,
        currency,
        ai_generated: true,
        ai_context: {
          source: "recommender",
          reasons: list.map((r: any) => ({ id: r.id, reason_code: r.reason_code, score: r.score })),
        },
        share_token,
        created_by: userId,
        ...totals,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const rows = items.map((it) => {
      const { line_total, margin } = computeLine(it);
      return { ...it, quote_id: quote.id, line_total, margin };
    });
    const { error: itemsErr } = await supabase.from("quote_items").insert(rows);
    if (itemsErr) throw new Error(itemsErr.message);

    await Promise.all([
      supabase.from("quote_events").insert({
        quote_id: quote.id,
        company_id,
        actor_id: userId,
        event_type: "ai_draft",
        payload: { items: items.length, total: totals.total, currency },
      }),
      supabase.from("customer_events").insert({
        customer_id: data.customer_id,
        company_id,
        actor_id: userId,
        event_type: "quote_created",
        payload: { quote_id: quote.id, number, total: totals.total, ai_generated: true },
      }),
    ]);

    return { id: quote.id as string, number, total: totals.total, items: items.length };
  });

// ---------- Timeline ----------
export const listQuoteEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quote_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("quote_events")
      .select("*")
      .eq("quote_id", data.quote_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Overview / KPIs for Dashboard ----------
export const getQuotesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("quotes")
      .select("id, status, total, currency, created_at, accepted_at, sent_at");
    const list = (rows ?? []) as any[];
    const byStatus: Record<string, number> = {};
    let pipeline = 0;
    let won = 0;
    let wonCount = 0;
    let sentCount = 0;
    for (const q of list) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      if (q.status !== "rejected" && q.status !== "expired") pipeline += Number(q.total ?? 0);
      if (q.status === "accepted") {
        won += Number(q.total ?? 0);
        wonCount += 1;
      }
      if (["sent", "viewed", "accepted", "rejected"].includes(q.status)) sentCount += 1;
    }
    const conversion = sentCount > 0 ? wonCount / sentCount : 0;
    const avgTicket = wonCount > 0 ? won / wonCount : 0;
    return {
      total: list.length,
      byStatus,
      pipelineValue: Number(pipeline.toFixed(2)),
      wonValue: Number(won.toFixed(2)),
      wonCount,
      sentCount,
      conversion,
    };
  });

// ---------- Format WhatsApp message body for a quote ----------
function formatQuoteMessage(args: {
  quote: {
    number: string;
    title: string | null;
    currency: string;
    subtotal: number;
    discount_total: number;
    tax_total: number;
    total: number;
    valid_until: string | null;
    notes: string | null;
    share_token: string | null;
    id: string;
  };
  items: Array<Pick<QuoteItem, "name" | "quantity" | "unit_price" | "line_total">>;
  customer_name: string | null;
  origin: string;
}) {
  const { quote, items, customer_name, origin } = args;
  const fmt = (n: number) =>
    `${quote.currency} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines: string[] = [];
  lines.push(`*Cotización ${quote.number}*`);
  if (quote.title) lines.push(`_${quote.title}_`);
  lines.push("");
  lines.push(`Hola${customer_name ? ` ${customer_name}` : ""}, aquí tienes tu propuesta:`);
  lines.push("");
  const shown = items.slice(0, 8);
  for (const it of shown) {
    const qty = Number(it.quantity ?? 1);
    lines.push(`• ${it.name} — ${qty} × ${fmt(Number(it.unit_price ?? 0))} = ${fmt(Number(it.line_total ?? 0))}`);
  }
  if (items.length > shown.length) {
    lines.push(`… y ${items.length - shown.length} producto(s) más`);
  }
  lines.push("");
  if (quote.discount_total > 0) lines.push(`Descuento: -${fmt(quote.discount_total)}`);
  if (quote.tax_total > 0) lines.push(`Impuestos: ${fmt(quote.tax_total)}`);
  lines.push(`*Total: ${fmt(quote.total)}*`);
  if (quote.valid_until) {
    lines.push(`Válida hasta: ${new Date(quote.valid_until).toLocaleDateString()}`);
  }
  if (quote.notes) {
    lines.push("");
    lines.push(quote.notes);
  }
  if (quote.share_token && origin) {
    lines.push("");
    lines.push(`Ver y aceptar: ${origin}/cotizaciones/${quote.id}?t=${quote.share_token}`);
  }
  return lines.join("\n");
}

// ---------- Send a quote from the Unified Inbox ----------
const SendFromConvInput = z.object({
  conversation_id: z.string().uuid(),
  quote_id: z.string().uuid().optional(),
  auto_draft: z.boolean().default(false), // if true and no quote_id, build via AI recommendations
  origin: z.string().url().optional(), // browser origin for share link
});

export const sendQuoteFromConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SendFromConvInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const company_id = await getCompanyId(supabase, userId);

    // 1) Load conversation + customer + channel
    const { data: convo } = await supabase
      .from("conversations")
      .select("id, company_id, customer_id, channel_id, is_demo")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!convo) throw new Error("Conversación no encontrada");

    // 2) Resolve quote_id — reuse existing or build a fresh AI draft
    let quoteId = data.quote_id;
    if (!quoteId && data.auto_draft) {
      const draftFn: any = (await import("./quotes.functions")).generateQuoteDraft;
      const res = await draftFn.handler({
        data: { customer_id: convo.customer_id, conversation_id: convo.id, max_items: 4 },
        context,
      });
      quoteId = res.id;
    }
    if (!quoteId) throw new Error("Debes indicar una cotización o activar el borrador automático");

    // 3) Load quote + items + customer
    const [{ data: quote }, { data: items }, { data: customer }] = await Promise.all([
      supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle(),
      supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("position", { ascending: true }),
      supabase.from("customers").select("id, name, phone").eq("id", convo.customer_id).maybeSingle(),
    ]);
    if (!quote) throw new Error("Cotización no encontrada");
    if (quote.company_id !== company_id) throw new Error("Cotización de otra empresa");

    // 4) Build message body
    const body = formatQuoteMessage({
      quote: quote as any,
      items: (items ?? []) as any,
      customer_name: customer?.name ?? null,
      origin: data.origin ?? "",
    });

    // 5) Deliver via WhatsApp (or persist in demo)
    let wa_message_id: string | null = null;
    if (convo.is_demo) {
      await supabase.from("messages").insert({
        conversation_id: convo.id,
        company_id,
        direction: "outbound",
        body,
        status: "sent",
        sender_id: userId,
      });
    } else {
      if (!customer?.phone) throw new Error("Cliente sin teléfono");
      const { data: channel } = await supabase
        .from("whatsapp_channels")
        .select("phone_number_id, access_token, status")
        .eq("id", convo.channel_id ?? "")
        .maybeSingle();
      if (!channel?.access_token || !channel.phone_number_id || channel.status !== "connected") {
        throw new Error("Canal de WhatsApp no conectado");
      }
      const graph = `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v21.0"}`;
      const res = await fetch(`${graph}/${channel.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: customer.phone.replace(/^\+/, ""),
          type: "text",
          text: { body, preview_url: true },
        }),
      });
      const payload: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error?.message ?? `Error ${res.status}`);
      wa_message_id = payload?.messages?.[0]?.id ?? null;
      await supabase.from("messages").insert({
        conversation_id: convo.id,
        company_id,
        direction: "outbound",
        body,
        status: "sent",
        wa_message_id,
        sender_id: userId,
      });
    }

    const now = new Date().toISOString();
    await supabase
      .from("conversations")
      .update({ last_message_at: now, updated_at: now })
      .eq("id", convo.id);

    // 6) Mark quote as sent + link to conversation
    const wasDraft = (quote as any).status === "draft";
    const patch: any = { conversation_id: convo.id };
    if (wasDraft) {
      patch.status = "sent";
      patch.sent_at = now;
    }
    await supabase.from("quotes").update(patch).eq("id", quoteId);

    // 7) Structured events across CRM, Conversation, Quote timelines
    await Promise.all([
      supabase.from("quote_events").insert({
        quote_id: quoteId,
        company_id,
        actor_id: userId,
        event_type: "sent_from_conversation",
        payload: {
          conversation_id: convo.id,
          customer_id: convo.customer_id,
          wa_message_id,
          total: (quote as any).total,
          number: (quote as any).number,
        },
      }),
      supabase.from("conversation_events").insert({
        conversation_id: convo.id,
        company_id,
        actor_id: userId,
        event_type: "quote_sent",
        payload: {
          quote_id: quoteId,
          number: (quote as any).number,
          total: (quote as any).total,
          currency: (quote as any).currency,
        },
      }),
      supabase.from("customer_events").insert({
        customer_id: convo.customer_id,
        company_id,
        actor_id: userId,
        event_type: "quote_sent_from_conversation",
        payload: {
          quote_id: quoteId,
          conversation_id: convo.id,
          number: (quote as any).number,
          total: (quote as any).total,
        },
      }),
    ]);

    // 8) Bump probability signal + fire automations
    try {
      const { data: insight } = await supabase
        .from("ai_insights")
        .select("id, probability")
        .eq("customer_id", convo.customer_id)
        .maybeSingle();
      const nextProb = Math.min(0.95, Math.max(Number(insight?.probability ?? 0.4), 0.65));
      if (insight?.id) {
        await supabase.from("ai_insights").update({ probability: nextProb }).eq("id", insight.id);
      }
    } catch {
      /* non-critical */
    }

    try {
      const { runAutomationForCustomer } = await import("@/lib/automations.functions");
      const triggers = wasDraft
        ? ["quote_sent", "quote_sent_from_conversation"]
        : ["quote_sent_from_conversation"];
      for (const trig of triggers) {
        (runAutomationForCustomer as any).handler?.({
          data: {
            customer_id: convo.customer_id,
            trigger: trig,
            payload: { quote_id: quoteId, conversation_id: convo.id },
          },
          context: { supabase, userId },
        });
      }
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      quote_id: quoteId,
      wa_message_id,
      status: wasDraft ? "sent" : (quote as any).status,
    };
  });

// ---------- Convert an arbitrary chat message into a quote draft ----------
export const draftQuoteFromMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        message_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: convo } = await supabase
      .from("conversations")
      .select("id, customer_id")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!convo) throw new Error("Conversación no encontrada");

    let seed = "";
    if (data.message_id) {
      const { data: m } = await supabase
        .from("messages")
        .select("body")
        .eq("id", data.message_id)
        .maybeSingle();
      seed = m?.body ?? "";
    }

    // Reuse the AI draft engine which sources from active recommendations.
    const draftFn: any = (await import("./quotes.functions")).generateQuoteDraft;
    const res = await draftFn.handler({
      data: { customer_id: convo.customer_id, conversation_id: convo.id, max_items: 4 },
      context,
    });

    if (seed) {
      await supabase
        .from("quotes")
        .update({ notes: seed.slice(0, 800) })
        .eq("id", res.id);
    }
    return res;
  });

