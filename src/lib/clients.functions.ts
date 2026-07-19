import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * "Clientes" = customers with at least one accepted quote (real buyers).
 * Aggregates commercial intelligence: recency, frequency, segment, next action.
 */

export type ClientSegment =
  | "vip"
  | "recurrent"
  | "at_risk"
  | "opportunity"
  | "dormant"
  | "new";

export type ClientRow = {
  customer_id: string;
  name: string | null;
  phone: string;
  company: string | null;
  tags: string[] | null;
  channel: string | null;
  assignee_id: string | null;
  last_interaction_at: string | null;
  first_purchase_at: string;
  last_purchase_at: string;
  purchase_count: number;
  total_spent: number;
  currency: string;
  avg_days_between: number | null;
  days_since_last: number;
  expected_next_days: number | null;
  segment: ClientSegment;
  recommended_action: string;
  products: string[];
};

function classify(row: {
  purchase_count: number;
  total_spent: number;
  days_since_last: number;
  avg_days_between: number | null;
  is_vip: boolean;
  first_purchase_days: number;
}): { segment: ClientSegment; action: string; expected_next_days: number | null } {
  const { purchase_count, total_spent, days_since_last, avg_days_between, is_vip, first_purchase_days } = row;
  const expected_next_days = avg_days_between ? Math.max(0, Math.round(avg_days_between - days_since_last)) : null;

  if (is_vip || (purchase_count >= 4 && total_spent >= 5000)) {
    return { segment: "vip", action: "Enviar mensaje VIP o renovación premium", expected_next_days };
  }
  if (avg_days_between && days_since_last > avg_days_between * 2) {
    return { segment: "at_risk", action: "Reactivar: no compra hace más del doble de lo habitual", expected_next_days };
  }
  if (days_since_last > 120) {
    return { segment: "dormant", action: "Campaña de reactivación o descuento personalizado", expected_next_days };
  }
  if (avg_days_between && days_since_last >= avg_days_between * 0.85) {
    return { segment: "opportunity", action: "Sugerir recompra ahora — está en ventana de renovación", expected_next_days };
  }
  if (purchase_count >= 2) {
    return { segment: "recurrent", action: "Ofrecer producto complementario", expected_next_days };
  }
  if (first_purchase_days <= 30) {
    return { segment: "new", action: "Solicitar opinión y sugerir segunda compra", expected_next_days };
  }
  return { segment: "recurrent", action: "Mantener contacto y ofrecer novedades", expected_next_days };
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // 1. accepted quotes = compras
    const { data: quotes, error: qErr } = await supabase
      .from("quotes")
      .select("id, customer_id, status, total, currency, accepted_at, created_at")
      .eq("status", "accepted")
      .not("customer_id", "is", null)
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .limit(2000);
    if (qErr) throw new Error(qErr.message);
    if (!quotes || quotes.length === 0) return [] as ClientRow[];

    const customerIds = Array.from(new Set(quotes.map((q) => q.customer_id as string)));

    const [{ data: customers }, { data: items }] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone, company, tags, channel, assignee_id, last_interaction_at")
        .in("id", customerIds),
      supabase
        .from("quote_items")
        .select("quote_id, name")
        .in("quote_id", quotes.map((q) => q.id)),
    ]);

    const itemsByQuote = new Map<string, string[]>();
    (items ?? []).forEach((it: any) => {
      const arr = itemsByQuote.get(it.quote_id) ?? [];
      if (it.name) arr.push(it.name);
      itemsByQuote.set(it.quote_id, arr);
    });

    // Group quotes by customer
    const byCustomer = new Map<string, typeof quotes>();
    for (const q of quotes) {
      const cid = q.customer_id as string;
      if (!byCustomer.has(cid)) byCustomer.set(cid, []);
      byCustomer.get(cid)!.push(q);
    }

    const custMap = new Map<string, any>();
    (customers ?? []).forEach((c: any) => custMap.set(c.id, c));

    const now = Date.now();
    const rows: ClientRow[] = [];

    for (const [cid, cQuotes] of byCustomer) {
      const cust = custMap.get(cid);
      if (!cust) continue;

      const sorted = [...cQuotes].sort((a, b) => {
        const ta = new Date((a.accepted_at ?? a.created_at) as string).getTime();
        const tb = new Date((b.accepted_at ?? b.created_at) as string).getTime();
        return ta - tb;
      });
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstDate = new Date((first.accepted_at ?? first.created_at) as string);
      const lastDate = new Date((last.accepted_at ?? last.created_at) as string);

      let avg_days_between: number | null = null;
      if (sorted.length >= 2) {
        const diffs: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const a = new Date((sorted[i - 1].accepted_at ?? sorted[i - 1].created_at) as string).getTime();
          const b = new Date((sorted[i].accepted_at ?? sorted[i].created_at) as string).getTime();
          diffs.push((b - a) / 86400_000);
        }
        avg_days_between = Math.round(diffs.reduce((s, x) => s + x, 0) / diffs.length);
      }

      const days_since_last = Math.floor((now - lastDate.getTime()) / 86400_000);
      const first_purchase_days = Math.floor((now - firstDate.getTime()) / 86400_000);
      const total_spent = sorted.reduce((s, q) => s + Number(q.total ?? 0), 0);
      const currency = (last.currency as string) || "MXN";
      const tags = (cust.tags as string[] | null) ?? [];
      const is_vip = tags.includes("vip");

      const productSet = new Set<string>();
      for (const q of sorted) {
        (itemsByQuote.get(q.id) ?? []).forEach((n) => productSet.add(n));
      }

      const { segment, action, expected_next_days } = classify({
        purchase_count: sorted.length,
        total_spent,
        days_since_last,
        avg_days_between,
        is_vip,
        first_purchase_days,
      });

      rows.push({
        customer_id: cid,
        name: cust.name,
        phone: cust.phone,
        company: cust.company,
        tags,
        channel: cust.channel,
        assignee_id: cust.assignee_id,
        last_interaction_at: cust.last_interaction_at,
        first_purchase_at: firstDate.toISOString(),
        last_purchase_at: lastDate.toISOString(),
        purchase_count: sorted.length,
        total_spent,
        currency,
        avg_days_between,
        days_since_last,
        expected_next_days,
        segment,
        recommended_action: action,
        products: Array.from(productSet).slice(0, 8),
      });
    }

    // Sort: at_risk & opportunity first, then vip, then by recency
    const rank: Record<ClientSegment, number> = {
      opportunity: 0,
      at_risk: 1,
      vip: 2,
      new: 3,
      recurrent: 4,
      dormant: 5,
    };
    rows.sort((a, b) => rank[a.segment] - rank[b.segment] || a.days_since_last - b.days_since_last);
    return rows;
  });

export const getClientsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    void context;
    return { ok: true };
  });
