import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================================
// Pipeline aggregates — un único round-trip para el módulo Embudo.
// Devuelve por cliente: unread, insights IA, top recomendación, y snapshot de
// cotizaciones (activa + total ganado). Todo respeta RLS (company_id).
// ============================================================================

export type CustomerInsight = {
  probability: number | null;
  intent: string | null;
  sentiment: string | null;
  churn_risk: number | null;
  next_best_action: string | null;
  updated_at: string | null;
};

export type CustomerReco = {
  product_id: string;
  name: string;
  price: number;
  currency: string;
  score: number;
  reason_code: string | null;
};

export type CustomerQuoteSummary = {
  active_id: string | null;
  active_number: string | null;
  active_status: string | null;
  active_total: number | null;
  active_currency: string | null;
  active_count: number;
  won_total: number;
};

export type PipelineAggregate = {
  customer_id: string;
  unread: number;
  last_message_at: string | null;
  conversation_id: string | null;
  insight: CustomerInsight | null;
  top_reco: CustomerReco | null;
  quotes: CustomerQuoteSummary;
};

const ACTIVE_QUOTE_STATUSES = ["draft", "sent", "viewed", "negotiating"];

export const getPipelineAggregates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [convosRes, insightsRes, recosRes, quotesRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, customer_id, unread_count, last_message_at")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1000),
      supabase
        .from("ai_insights")
        .select(
          "customer_id, probability, intent, sentiment, churn_risk, next_best_action, updated_at",
        )
        .limit(1000),
      supabase
        .from("product_recommendations")
        .select(
          "customer_id, score, reason_code, product:products(id, name, price, currency)",
        )
        .in("status", ["active", "pending"])
        .order("score", { ascending: false })
        .limit(1000),
      supabase
        .from("quotes")
        .select("id, customer_id, status, number, total, currency, updated_at")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1500),
    ]);

    const unread: Record<string, number> = {};
    const conv: Record<string, { id: string; last: string | null }> = {};
    for (const c of (convosRes.data ?? []) as any[]) {
      if (!c.customer_id) continue;
      unread[c.customer_id] = (unread[c.customer_id] ?? 0) + (c.unread_count ?? 0);
      // Track the most recent conversation id per customer (list is ordered).
      if (!conv[c.customer_id]) {
        conv[c.customer_id] = { id: c.id, last: c.last_message_at ?? null };
      }
    }

    const insights: Record<string, CustomerInsight> = {};
    for (const i of (insightsRes.data ?? []) as any[]) {
      insights[i.customer_id] = {
        probability: i.probability != null ? Number(i.probability) : null,
        intent: i.intent ?? null,
        sentiment: i.sentiment ?? null,
        churn_risk: i.churn_risk != null ? Number(i.churn_risk) : null,
        next_best_action: i.next_best_action ?? null,
        updated_at: i.updated_at ?? null,
      };
    }

    const recos: Record<string, CustomerReco> = {};
    for (const r of (recosRes.data ?? []) as any[]) {
      if (!r.customer_id || !r.product || recos[r.customer_id]) continue;
      recos[r.customer_id] = {
        product_id: r.product.id,
        name: r.product.name,
        price: Number(r.product.price ?? 0),
        currency: r.product.currency ?? "USD",
        score: Number(r.score ?? 0),
        reason_code: r.reason_code ?? null,
      };
    }

    const quotes: Record<string, CustomerQuoteSummary> = {};
    for (const q of (quotesRes.data ?? []) as any[]) {
      const key = q.customer_id as string | null;
      if (!key) continue;
      const bucket = (quotes[key] ??= {
        active_id: null,
        active_number: null,
        active_status: null,
        active_total: null,
        active_currency: null,
        active_count: 0,
        won_total: 0,
      });
      if (ACTIVE_QUOTE_STATUSES.includes(q.status)) {
        bucket.active_count += 1;
        if (!bucket.active_id) {
          bucket.active_id = q.id;
          bucket.active_number = q.number ?? null;
          bucket.active_status = q.status ?? null;
          bucket.active_total = q.total != null ? Number(q.total) : null;
          bucket.active_currency = q.currency ?? null;
        }
      }
      if (q.status === "accepted" || q.status === "won") {
        bucket.won_total += Number(q.total ?? 0);
      }
    }

    // Merge into a single array keyed by every customer we saw anywhere.
    const ids = new Set<string>([
      ...Object.keys(unread),
      ...Object.keys(insights),
      ...Object.keys(recos),
      ...Object.keys(quotes),
    ]);
    const out: PipelineAggregate[] = [];
    ids.forEach((cid) => {
      out.push({
        customer_id: cid,
        unread: unread[cid] ?? 0,
        last_message_at: conv[cid]?.last ?? null,
        conversation_id: conv[cid]?.id ?? null,
        insight: insights[cid] ?? null,
        top_reco: recos[cid] ?? null,
        quotes:
          quotes[cid] ??
          ({
            active_id: null,
            active_number: null,
            active_status: null,
            active_total: null,
            active_currency: null,
            active_count: 0,
            won_total: 0,
          } as CustomerQuoteSummary),
      });
    });
    return out;
  });

// ============================================================================
// Stage transitions history (audit tab in Quick Panel).
// ============================================================================

export const getCustomerStageHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: events } = await supabase
      .from("customer_events")
      .select("id, event_type, payload, actor_id, created_at")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false })
      .limit(80);
    const out: {
      id: string;
      from: string | null;
      to: string | null;
      actor_id: string | null;
      created_at: string;
    }[] = [];
    for (const e of (events ?? []) as any[]) {
      const changes = e?.payload?.changes as
        | Record<string, { from: unknown; to: unknown }>
        | undefined;
      if (changes && changes.stage) {
        out.push({
          id: e.id,
          from: (changes.stage.from as string | null) ?? null,
          to: (changes.stage.to as string | null) ?? null,
          actor_id: e.actor_id,
          created_at: e.created_at,
        });
      }
    }
    return out;
  });
