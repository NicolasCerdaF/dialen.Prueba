import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeStage } from "@/lib/pipeline";

// ---------- Reason codes ----------
// Structured, human-readable motives for a recommendation. Persisted verbatim
// on product_recommendations.reason_code so future analytics / model training
// can group and evaluate outcomes per motive.
export const REASON_CODES = {
  high_intent: "Alta intención de compra detectada por IA",
  stage_fit: "Encaja con la etapa actual del embudo",
  category_affinity: "Categoría afín a los productos que ya vio",
  purchase_history: "Similar a lo que ya compró",
  bestseller: "Producto con mayor tracción comercial",
  high_margin: "Alto margen y buena aceptación",
  stagnant_recovery: "Oferta para reactivar cliente estancado",
  churn_rescue: "Oferta para retener cliente en riesgo",
} as const;
export type ReasonCode = keyof typeof REASON_CODES;

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

// ---------- Generate recommendations for a customer ----------
const GenerateInput = z.object({
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(10).default(4),
});

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Build "commercial context" for the customer.
    const [{ data: customer }, { data: insight }, { data: links }] = await Promise.all([
      supabase
        .from("customers")
        .select("id, company_id, name, stage, tags, estimated_value, last_interaction_at")
        .eq("id", data.customer_id)
        .maybeSingle(),
      supabase
        .from("ai_insights")
        .select("probability, intent, sentiment, churn_risk, quality_score, next_best_action")
        .eq("customer_id", data.customer_id)
        .maybeSingle(),
      supabase
        .from("product_customers")
        .select("product_id, context, product:products(id, category, tags)")
        .eq("customer_id", data.customer_id),
    ]);
    if (!customer) throw new Error("Cliente no encontrado");

    const stage = normalizeStage(customer.stage);
    const customerTags = new Set<string>((customer.tags ?? []) as string[]);
    const linkedProductIds = new Set<string>((links ?? []).map((l: any) => l.product_id));
    const purchasedIds = new Set<string>(
      (links ?? []).filter((l: any) => l.context === "purchased").map((l: any) => l.product_id),
    );
    const affinityCategories = new Set<string>(
      (links ?? []).map((l: any) => l.product?.category).filter(Boolean),
    );
    const affinityTags = new Set<string>();
    for (const l of links ?? []) for (const t of (l.product?.tags ?? []) as string[]) affinityTags.add(t);

    // 2. Load recommendable catalog for the company.
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, price, cost, currency, category, tags, stock, track_stock, low_stock_threshold, ai_recommendable, active")
      .eq("company_id", customer.company_id)
      .eq("active", true)
      .eq("ai_recommendable", true);

    // 3. Popularity across company for "bestseller" signal.
    const { data: popRows } = await supabase
      .from("product_customers")
      .select("product_id, context")
      .eq("company_id", customer.company_id);
    const popularity = new Map<string, number>();
    for (const r of popRows ?? []) {
      const w = r.context === "purchased" ? 3 : r.context === "quoted" ? 2 : 1;
      popularity.set(r.product_id, (popularity.get(r.product_id) ?? 0) + w);
    }
    const maxPop = Math.max(1, ...Array.from(popularity.values()));

    // 4. Score each candidate.
    const probability = Number(insight?.probability ?? 0);
    const churnRisk = Number(insight?.churn_risk ?? 0);
    const intent = String(insight?.intent ?? "");

    type Scored = {
      product: any;
      score: number;
      reason_code: ReasonCode;
      signals: Record<string, unknown>;
    };
    const scored: Scored[] = [];

    for (const p of products ?? []) {
      if (purchasedIds.has(p.id)) continue; // don't re-recommend what they bought
      // Out of stock filter.
      if (
        p.track_stock &&
        typeof p.stock === "number" &&
        p.stock <= 0
      )
        continue;

      const pTags = new Set<string>((p.tags ?? []) as string[]);
      const catAffinity = p.category && affinityCategories.has(p.category) ? 1 : 0;
      const tagOverlap =
        [...pTags].filter((t) => customerTags.has(t) || affinityTags.has(t)).length /
        Math.max(1, pTags.size);
      const pop = (popularity.get(p.id) ?? 0) / maxPop;
      const margin =
        Number(p.price) > 0 ? Math.max(0, (Number(p.price) - Number(p.cost)) / Number(p.price)) : 0;
      const alreadyInterest = linkedProductIds.has(p.id) ? 0.15 : 0;

      // Stage weighting profile.
      let stageWeight = 0.5;
      if (stage === "nuevo_lead" || stage === "primer_contacto") stageWeight = 0.4; // introduce best-known
      else if (stage === "calificado") stageWeight = 0.6;
      else if (stage === "propuesta" || stage === "negociacion") stageWeight = 0.8; // fit + margin matter more

      // Base score.
      let score =
        0.35 * probability +
        0.25 * (catAffinity ? 1 : tagOverlap) +
        0.15 * pop +
        0.15 * margin +
        alreadyInterest +
        0.05 * stageWeight;

      // Reason detection (priority order).
      let reason_code: ReasonCode = "bestseller";
      const signals: Record<string, unknown> = {
        probability,
        churn_risk: churnRisk,
        intent,
        stage,
        tagOverlap: Number(tagOverlap.toFixed(2)),
        popularity: Number(pop.toFixed(2)),
        margin: Number(margin.toFixed(2)),
        already_interested: alreadyInterest > 0,
      };

      if (churnRisk >= 0.6) {
        reason_code = "churn_rescue";
        score += 0.1 * churnRisk;
      } else if (probability >= 0.7 || intent === "high_intent" || intent === "ready_to_close") {
        reason_code = "high_intent";
      } else if (purchasedIds.size > 0 && catAffinity) {
        reason_code = "purchase_history";
      } else if (catAffinity || tagOverlap > 0.3) {
        reason_code = "category_affinity";
      } else if (
        (stage === "propuesta" || stage === "negociacion") &&
        margin >= 0.4
      ) {
        reason_code = "high_margin";
      } else if (
        customer.last_interaction_at &&
        Date.now() - new Date(customer.last_interaction_at).getTime() > 7 * 86400 * 1000
      ) {
        reason_code = "stagnant_recovery";
      } else if ((stage === "primer_contacto" || stage === "calificado") && pop > 0.3) {
        reason_code = "stage_fit";
      }

      scored.push({ product: p, score, reason_code, signals });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, data.limit);

    // 5. Expire previous pending recommendations that we're not re-picking.
    const keepIds = new Set(top.map((t) => t.product.id));
    const { data: existingPending } = await supabase
      .from("product_recommendations")
      .select("id, product_id")
      .eq("customer_id", data.customer_id)
      .eq("status", "pending");
    const toExpire = (existingPending ?? []).filter((r: any) => !keepIds.has(r.product_id));
    if (toExpire.length > 0) {
      await supabase
        .from("product_recommendations")
        .update({ status: "expired", resolved_at: new Date().toISOString() })
        .in(
          "id",
          toExpire.map((r: any) => r.id),
        );
    }

    // 6. Insert new pending recommendations (skip if we already have a pending one for that product).
    const stillPendingProductIds = new Set(
      (existingPending ?? [])
        .filter((r: any) => keepIds.has(r.product_id))
        .map((r: any) => r.product_id),
    );
    const inserts = top
      .filter((t) => !stillPendingProductIds.has(t.product.id))
      .map((t) => ({
        company_id: customer.company_id,
        customer_id: data.customer_id,
        conversation_id: data.conversation_id ?? null,
        product_id: t.product.id,
        agent_type: "sales",
        reason: REASON_CODES[t.reason_code],
        reason_code: t.reason_code,
        score: Number(t.score.toFixed(4)),
        probability: probability || null,
        stage,
        status: "pending",
        signals: t.signals as any,
        context: {
          customer_tags: [...customerTags],
          affinity_categories: [...affinityCategories],
          intent,
          churn_risk: churnRisk,
        } as any,
      }));
    if (inserts.length > 0) {
      await supabase.from("product_recommendations").insert(inserts);
    }

    // 7. Emit a single customer_event so the CRM timeline shows the batch.
    if (top.length > 0) {
      await supabase.from("customer_events").insert({
        customer_id: data.customer_id,
        company_id: customer.company_id,
        actor_id: userId,
        event_type: "ai_recommendation",
        payload: {
          count: top.length,
          products: top.map((t) => ({
            id: t.product.id,
            name: t.product.name,
            reason_code: t.reason_code,
            score: Number(t.score.toFixed(3)),
          })),
        } as any,
      });
    }

    return {
      stage,
      insight: insight ?? null,
      recommendations: top.map((t) => ({
        product: t.product,
        score: Number(t.score.toFixed(3)),
        reason_code: t.reason_code,
        reason: REASON_CODES[t.reason_code],
        signals: t.signals,
      })),
    };
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

    if (reco) {
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
      if (!map[r.customer_id]) map[r.customer_id] = r;
    }
    return map;
  });
