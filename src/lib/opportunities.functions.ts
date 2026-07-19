import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Oportunidades = vistas derivadas — nunca crea tablas nuevas.
 * Se calcula desde:
 *  - ai_suggestions con probability alta (intención detectada)
 *  - quotes en estado draft/sent/viewed (propuesta activa)
 *  - conversations con customers en stages comerciales
 */

export type OpportunityStage = "detected" | "qualified" | "negotiation";

export type Opportunity = {
  id: string;                       // opportunity synthetic id (conversation_id o quote_id)
  source: "ai_suggestion" | "quote" | "stage";
  stage: OpportunityStage;
  conversation_id: string | null;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_company: string | null;
  is_client: boolean;               // ya compró antes
  detected_at: string;
  last_interaction_at: string | null;
  days_since_interaction: number | null;
  intent: string | null;            // frase IA (solo si existe)
  next_step: string | null;         // solo si existe
  probability: number | null;       // 0..100 — null cuando no hay señal IA
  estimated_value: number | null;
  currency: string;
  products: string[];
  quote_id: string | null;
  quote_status: string | null;
  stalled: boolean;                 // sin interacción > 3 días
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

export const listOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [
      { data: suggestions },
      { data: quotes },
      { data: customersRaw },
    ] = await Promise.all([
      supabase
        .from("ai_suggestions")
        .select("id, conversation_id, customer_id, intent, next_step, probability, payload, created_at, used_at, agent_type")
        .gte("probability", 0.5)
        .is("used_at", null)
        .order("probability", { ascending: false })
        .limit(200),
      supabase
        .from("quotes")
        .select("id, customer_id, conversation_id, status, total, currency, sent_at, viewed_at, created_at, ai_context")
        .in("status", ["draft", "sent", "viewed"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("customers")
        .select("id, name, phone, company, last_interaction_at, tags")
        .limit(1000),
    ]);

    const custMap = new Map<string, any>();
    (customersRaw ?? []).forEach((c: any) => custMap.set(c.id, c));

    // ¿quiénes son ya clientes? -> tienen quote 'accepted'
    const { data: acceptedQuotes } = await supabase
      .from("quotes")
      .select("customer_id")
      .eq("status", "accepted");
    const clientSet = new Set<string>();
    (acceptedQuotes ?? []).forEach((q: any) => q.customer_id && clientSet.add(q.customer_id));

    const opportunities = new Map<string, Opportunity>();
    const maxProb = (a: number | null, b: number | null): number | null => {
      if (a === null) return b;
      if (b === null) return a;
      return Math.max(a, b);
    };
    const addOrMerge = (key: string, opp: Opportunity) => {
      const existing = opportunities.get(key);
      if (!existing) { opportunities.set(key, opp); return; }
      const stageRank: Record<OpportunityStage, number> = { detected: 0, qualified: 1, negotiation: 2 };
      const winner = stageRank[opp.stage] > stageRank[existing.stage] ? opp : existing;
      winner.probability = maxProb(existing.probability, opp.probability);
      winner.estimated_value = winner.estimated_value ?? opp.estimated_value ?? existing.estimated_value;
      winner.products = Array.from(new Set([...existing.products, ...opp.products])).slice(0, 6);
      winner.intent = winner.intent ?? opp.intent ?? existing.intent;
      winner.next_step = winner.next_step ?? opp.next_step ?? existing.next_step;
      opportunities.set(key, winner);
    };

    // 1) Cotizaciones activas => Negociación. Sin fabricar intent/probabilidad.
    for (const q of quotes ?? []) {
      const cust = custMap.get(q.customer_id);
      if (!cust) continue;
      const products = extractProducts(q.ai_context);
      const lastAt = (q.viewed_at ?? q.sent_at ?? q.created_at) as string;
      const opp: Opportunity = {
        id: `quote:${q.id}`,
        source: "quote",
        stage: "negotiation",
        conversation_id: q.conversation_id,
        customer_id: q.customer_id,
        customer_name: cust.name,
        customer_phone: cust.phone,
        customer_company: cust.company,
        is_client: clientSet.has(q.customer_id),
        detected_at: q.created_at,
        last_interaction_at: cust.last_interaction_at ?? lastAt,
        days_since_interaction: daysSince(cust.last_interaction_at ?? lastAt),
        intent: null,
        next_step: null,
        probability: null,
        estimated_value: Number(q.total ?? 0) || null,
        currency: q.currency || "MXN",
        products,
        quote_id: q.id,
        quote_status: q.status,
        stalled: (daysSince(lastAt) ?? 0) > 3,
      };
      const key = q.conversation_id ? `conv:${q.conversation_id}` : `cust:${q.customer_id}`;
      addOrMerge(key, opp);
    }

    // 2) Sugerencias IA => Calificada / Detectada
    for (const s of suggestions ?? []) {
      if (!s.customer_id) continue;
      const cust = custMap.get(s.customer_id);
      if (!cust) continue;
      const prob = Math.round(Number(s.probability ?? 0) * 100);
      const stage: OpportunityStage = prob >= 70 ? "qualified" : "detected";
      const payload = (s.payload ?? {}) as any;
      const products = Array.isArray(payload?.products) ? payload.products.slice(0, 6) : [];
      const value = typeof payload?.estimated_value === "number" ? payload.estimated_value : null;
      const opp: Opportunity = {
        id: `sug:${s.id}`,
        source: "ai_suggestion",
        stage,
        conversation_id: s.conversation_id,
        customer_id: s.customer_id,
        customer_name: cust.name,
        customer_phone: cust.phone,
        customer_company: cust.company,
        is_client: clientSet.has(s.customer_id),
        detected_at: s.created_at,
        last_interaction_at: cust.last_interaction_at,
        days_since_interaction: daysSince(cust.last_interaction_at),
        intent: s.intent,
        next_step: s.next_step,
        probability: prob,
        estimated_value: value,
        currency: "MXN",
        products,
        quote_id: null,
        quote_status: null,
        stalled: (daysSince(cust.last_interaction_at) ?? 0) > 3,
      };
      const key = s.conversation_id ? `conv:${s.conversation_id}` : `cust:${s.customer_id}`;
      addOrMerge(key, opp);
    }

    const list = Array.from(opportunities.values());
    // Orden: negociación primero, luego probabilidad, luego más reciente
    const rank: Record<OpportunityStage, number> = { negotiation: 0, qualified: 1, detected: 2 };
    list.sort((a, b) =>
      rank[a.stage] - rank[b.stage] ||
      (b.probability ?? -1) - (a.probability ?? -1) ||
      new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime(),
    );

    return list;
  });

function extractProducts(ctx: unknown): string[] {
  if (!ctx || typeof ctx !== "object") return [];
  const c = ctx as any;
  const arr = c.products || c.items || c.line_items;
  if (Array.isArray(arr)) {
    return arr
      .map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.product ?? null))
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}
