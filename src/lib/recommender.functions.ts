import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { REASON_CODES, type ReasonCode } from "@/lib/recommender.shared";

// Re-export for backwards compatibility (routes import from this file).
export { REASON_CODES };
export type { ReasonCode };

export type Recommendation = {
  id: string;
  product_id: string;
  customer_id: string;
  conversation_id: string | null;
  agent_type: string | null;
  reason: string | null;
  reason_code: ReasonCode | null;
  score: number | null;
  probability: number | null;
  stage: string | null;
  status: string;
  context: any;
  signals: any;
  created_at: string;
  resolved_at: string | null;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    currency: string;
    images: any;
    category: string | null;
    tags: string[];
  } | null;
};

const GenerateInput = z.object({
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(10).default(4),
});

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { runGenerateRecommendations } = await import("@/lib/recommender.server");
    return runGenerateRecommendations(context.supabase, context.userId, data);
  });

// ---------- List active + historical recommendations for a customer ----------
export const listRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string; limit?: number }) =>
    z
      .object({ customer_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("product_recommendations")
      .select(
        "*, product:products(id, name, sku, price, currency, images, category, tags)",
      )
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Recommendation[];
  });

// ---------- Update recommendation status ----------
const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "ignored", "converted", "expired"]),
});

export const setRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: reco } = await supabase
      .from("product_recommendations")
      .select("customer_id, product_id, company_id, reason_code")
      .eq("id", data.id)
      .maybeSingle();
    const patch: Record<string, unknown> = {
      status: data.status,
      resolved_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("product_recommendations")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (reco && reco.customer_id && reco.company_id) {
      await supabase.from("customer_events").insert({
        customer_id: reco.customer_id,
        company_id: reco.company_id,
        actor_id: userId,
        event_type: `recommendation_${data.status}`,
        payload: {
          product_id: reco.product_id,
          reason_code: reco.reason_code,
        } as any,
      });
    }
    return { ok: true };
  });

// ---------- Top recommendation per customer (for Kanban) ----------
export const getTopRecommendationsForCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_ids: string[] }) =>
    z.object({ customer_ids: z.array(z.string().uuid()).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.customer_ids.length === 0) return {} as Record<string, any>;
    const { data: rows } = await supabase
      .from("product_recommendations")
      .select(
        "customer_id, score, reason_code, product:products(id, name, price, currency)",
      )
      .in("customer_id", data.customer_ids)
      .eq("status", "pending")
      .order("score", { ascending: false });
    const map: Record<string, any> = {};
    for (const r of rows ?? []) {
      if (r.customer_id && !map[r.customer_id]) map[r.customer_id] = r;
    }
    return map;
  });
