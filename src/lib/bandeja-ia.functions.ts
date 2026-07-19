import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeStage } from "@/lib/pipeline";

export type BandejaCategory = "high" | "follow" | "opportunity";

export type BandejaItem = {
  id: string;
  category: BandejaCategory;
  score: number;
  customerId: string;
  customerName: string;
  companyName: string | null;
  conversationId: string | null;
  reason: string;
  reasonDetail: string;
  intent: number; // 0-100
  urgency: "alta" | "media" | "baja";
  probability: number; // 0-100 close probability
  potentialValue: number;
  currency: string;
  stage: string | null;
  elapsedLabel: string;
  lastMessagePreview: string | null;
  aiSummary: string | null;
  productMention: string | null;
  suggestedAction:
    | { kind: "open"; label: string }
    | { kind: "quote"; label: string; conversationId: string }
    | { kind: "opportunity"; label: string }
    | { kind: "reply"; label: string };
};

export type BandejaData = {
  groups: {
    high: BandejaItem[];
    follow: BandejaItem[];
    opportunity: BandejaItem[];
  };
  counts: { high: number; follow: number; opportunity: number; total: number };
};

function elapsed(fromIso: string | null | undefined): string {
  if (!fromIso) return "sin actividad";
  const diffMs = Date.now() - new Date(fromIso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function hoursSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export const getBandejaIA = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BandejaData> => {
    const { supabase, userId } = context;
    const empty: BandejaData = {
      groups: { high: [], follow: [], opportunity: [] },
      counts: { high: 0, follow: 0, opportunity: 0, total: 0 },
    };

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) return empty;
    const companyId = profile.company_id;

    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [{ data: convos }, { data: customers }, { data: quotes }, { data: msgs }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select("id, customer_id, status, last_message_at, ai_paused")
          .eq("company_id", companyId)
          .eq("status", "open")
          .limit(500),
        supabase
          .from("customers")
          .select(
            "id, name, company, phone, stage, estimated_value, priority, tags, last_interaction_at",
          )
          .eq("company_id", companyId)
          .limit(1000),
        supabase
          .from("quotes")
          .select(
            "id, customer_id, conversation_id, status, total, currency, sent_at, viewed_at, accepted_at, created_at",
          )
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("messages")
          .select("conversation_id, direction, body, created_at")
          .eq("company_id", companyId)
          .gte("created_at", weekAgo)
          .order("created_at", { ascending: false })
          .limit(3000),
      ]);

    const convoList = convos ?? [];
    const convIds = convoList.map((c) => c.id);
    const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
    const fallbackCurrency = quotes?.find((q) => q.currency)?.currency ?? null;

    // Latest AI suggestion per conversation (real IA signal for intent/probability/summary).
    const { data: suggestions } = convIds.length
      ? await supabase
          .from("ai_suggestions")
          .select("conversation_id, text, intent, probability, next_step, sources, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : { data: [] as any[] };
    const suggByConv = new Map<string, any>();
    for (const s of suggestions ?? []) {
      if (!suggByConv.has(s.conversation_id)) suggByConv.set(s.conversation_id, s);
    }

    // Latest message per conversation (direction + body)
    const lastMsg = new Map<string, { direction: string; created_at: string; body: string | null }>();
    for (const m of msgs ?? []) {
      if (!lastMsg.has(m.conversation_id)) {
        lastMsg.set(m.conversation_id, {
          direction: m.direction,
          created_at: m.created_at,
          body: (m as any).body ?? null,
        });
      }
    }

    // Latest quote per conversation
    const quoteByConv = new Map<string, NonNullable<typeof quotes>[number]>();
    for (const q of quotes ?? []) {
      if (q.conversation_id && !quoteByConv.has(q.conversation_id)) {
        quoteByConv.set(q.conversation_id, q);
      }
    }

    type DraftItem = Omit<BandejaItem, "lastMessagePreview" | "aiSummary" | "productMention">;
    const items: DraftItem[] = [];

    const intentScoreFromLabel = (v: string | null | undefined): number | null => {
      if (!v) return null;
      const s = String(v).toLowerCase();
      if (/(compra|cierre|orden|pago|confirm)/.test(s)) return 90;
      if (/(cotiz|precio|presupuesto|budget)/.test(s)) return 75;
      if (/(interes|consulta|info)/.test(s)) return 55;
      if (/(duda|objec)/.test(s)) return 40;
      return null;
    };

    for (const conv of convoList) {
      const cust = customerById.get(conv.customer_id);
      if (!cust) continue;
      const last = lastMsg.get(conv.id);
      const stage = normalizeStage(cust.stage);
      if (stage === "ganado" || stage === "perdido") continue;

      const isVip = (cust.priority ?? "").toLowerCase() === "alta" ||
        (cust.tags ?? []).some((t: string) => /vip/i.test(t));
      const waitingHours = last?.direction === "inbound" ? hoursSince(last.created_at) : 0;
      const activeQuote = quoteByConv.get(conv.id);
      const quoteSent = activeQuote && ["sent", "viewed"].includes(activeQuote.status);
      const quoteHours = quoteSent ? hoursSince(activeQuote?.sent_at ?? activeQuote?.created_at) : 0;
      const value = Number(cust.estimated_value ?? 0);
      const sugg = suggByConv.get(conv.id);
      const currency = activeQuote?.currency ?? fallbackCurrency ?? "USD";

      // Prefer real AI-derived intent/probability from latest ai_suggestion.
      const aiProbability = sugg?.probability != null ? Math.round(Number(sugg.probability) * 100) : null;
      const aiIntentScore = intentScoreFromLabel(sugg?.intent);

      // Stage-based heuristic fallback (only used when no AI signal exists).
      let heuristicIntent = 30;
      if (stage === "cotizado") heuristicIntent += 25;
      if (stage === "negociando") heuristicIntent += 40;
      if (stage === "interesado") heuristicIntent += 15;
      if (activeQuote) heuristicIntent += 15;
      if (waitingHours > 0 && waitingHours < 24) heuristicIntent += 10;
      heuristicIntent = Math.min(100, heuristicIntent);

      const heuristicProb =
        stage === "negociando" ? 75 : stage === "cotizado" ? 55 : stage === "interesado" ? 35 : 20;

      const intent = aiIntentScore ?? heuristicIntent;
      const probability = aiProbability ?? heuristicProb;

      // ------- HIGH PRIORITY -------
      if (isVip && waitingHours >= 0.25) {
        items.push({
          id: `high-vip-${conv.id}`,
          category: "high",
          score: 100 + value / 1000,
          customerId: cust.id,
          customerName: cust.name ?? cust.phone,
          companyName: cust.company ?? null,
          conversationId: conv.id,
          reason: "Cliente VIP sin respuesta",
          reasonDetail: `Prioridad alta · esperando ${elapsed(last?.created_at)}.`,
          intent,
          urgency: "alta",
          probability,
          potentialValue: value,
          currency,
          stage: cust.stage,
          elapsedLabel: elapsed(last?.created_at),
          suggestedAction: { kind: "reply", label: "Responder ahora" },
        });
        continue;
      }
      if (quoteSent && quoteHours >= 24) {
        items.push({
          id: `high-quote-${conv.id}`,
          category: "high",
          score: 90 + value / 1000,
          customerId: cust.id,
          customerName: cust.name ?? cust.phone,
          companyName: cust.company ?? null,
          conversationId: conv.id,
          reason: "Cotización sin seguimiento",
          reasonDetail: `Cotización enviada ${elapsed(activeQuote?.sent_at ?? activeQuote?.created_at)} sin respuesta.`,
          intent,
          urgency: "alta",
          probability,
          potentialValue: Number(activeQuote?.total ?? value),
          currency,
          stage: cust.stage,
          elapsedLabel: elapsed(activeQuote?.sent_at ?? activeQuote?.created_at),
          suggestedAction: { kind: "reply", label: "Retomar cotización" },
        });
        continue;
      }
      if (stage === "negociando" && waitingHours >= 2) {
        items.push({
          id: `high-neg-${conv.id}`,
          category: "high",
          score: 85 + value / 1000,
          customerId: cust.id,
          customerName: cust.name ?? cust.phone,
          companyName: cust.company ?? null,
          conversationId: conv.id,
          reason: "Negociación esperando respuesta",
          reasonDetail: `En negociación · esperando hace ${elapsed(last?.created_at)}.`,
          intent,
          urgency: "alta",
          probability,
          potentialValue: value,
          currency,
          stage: cust.stage,
          elapsedLabel: elapsed(last?.created_at),
          suggestedAction: { kind: "reply", label: "Cerrar negociación" },
        });
        continue;
      }

      // ------- FOLLOW UP -------
      if (stage === "interesado" && (waitingHours >= 1 || last?.direction === "inbound")) {
        items.push({
          id: `follow-int-${conv.id}`,
          category: "follow",
          score: 60 + value / 2000,
          customerId: cust.id,
          customerName: cust.name ?? cust.phone,
          companyName: cust.company ?? null,
          conversationId: conv.id,
          reason: "Interés detectado",
          reasonDetail: `Etapa: interesado · último mensaje ${elapsed(last?.created_at)}.`,
          intent,
          urgency: "media",
          probability,
          potentialValue: value,
          currency,
          stage: cust.stage,
          elapsedLabel: elapsed(last?.created_at),
          suggestedAction: { kind: "quote", label: "Generar cotización", conversationId: conv.id },
        });
        continue;
      }
      if (stage === "cotizado" && !quoteSent) {
        items.push({
          id: `follow-quo-${conv.id}`,
          category: "follow",
          score: 55 + value / 2000,
          customerId: cust.id,
          customerName: cust.name ?? cust.phone,
          companyName: cust.company ?? null,
          conversationId: conv.id,
          reason: "Cotización sin enviar",
          reasonDetail: activeQuote
            ? `Borrador creado ${elapsed(activeQuote?.created_at)}.`
            : "Etapa cotizado sin cotización registrada.",
          intent,
          urgency: "media",
          probability,
          potentialValue: Number(activeQuote?.total ?? value),
          currency,
          stage: cust.stage,
          elapsedLabel: elapsed(activeQuote?.created_at ?? last?.created_at),
          suggestedAction: { kind: "quote", label: "Revisar y enviar", conversationId: conv.id },
        });
        continue;
      }

      // ------- OPPORTUNITY -------
      if (stage === "nuevo_lead" && last?.direction === "inbound") {
        items.push({
          id: `opp-new-${conv.id}`,
          category: "opportunity",
          score: 40 + value / 3000,
          customerId: cust.id,
          customerName: cust.name ?? cust.phone,
          companyName: cust.company ?? null,
          conversationId: conv.id,
          reason: "Lead nuevo activo",
          reasonDetail: `Mensaje entrante ${elapsed(last?.created_at)} · sin calificar.`,
          intent,
          urgency: "baja",
          probability,
          potentialValue: value,
          currency,
          stage: cust.stage,
          elapsedLabel: elapsed(last?.created_at),
          suggestedAction: { kind: "opportunity", label: "Calificar oportunidad" },
        });
      }
    }

    // Enrich with preview / AI summary / product mention
    const enriched: BandejaItem[] = items.map((it) => {
      const last = it.conversationId ? lastMsg.get(it.conversationId) : null;
      const sugg = it.conversationId ? suggByConv.get(it.conversationId) : null;
      let productMention: string | null = null;
      const src = sugg?.sources;
      if (Array.isArray(src) && src.length) {
        const first = src[0];
        productMention =
          typeof first === "string" ? first : first?.name ?? first?.title ?? null;
      }
      return {
        ...it,
        lastMessagePreview: last?.body ? last.body.slice(0, 140) : null,
        aiSummary: sugg?.text ? String(sugg.text).slice(0, 200) : null,
        productMention,
      };
    });

    enriched.sort((a, b) => b.score - a.score);

    const groups = {
      high: enriched.filter((i) => i.category === "high").slice(0, 20),
      follow: enriched.filter((i) => i.category === "follow").slice(0, 20),
      opportunity: enriched.filter((i) => i.category === "opportunity").slice(0, 20),
    };
    return {
      groups,
      counts: {
        high: groups.high.length,
        follow: groups.follow.length,
        opportunity: groups.opportunity.length,
        total: groups.high.length + groups.follow.length + groups.opportunity.length,
      },
    };
  });

// ============================================================
// 🤖 Acciones IA pendientes  — sugerencias de IA por aprobar
// ============================================================
export type PendingAction = {
  id: string;
  conversationId: string | null;
  customerId: string | null;
  customerName: string;
  agentType: string | null;
  intent: string | null;
  text: string;
  nextStep: string | null;
  confidence: number;
  probability: number;
  createdAt: string;
  elapsedLabel: string;
};

export const getPendingAIActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingAction[]> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) return [];

    const { data: rows } = await supabase
      .from("ai_suggestions")
      .select(
        "id, conversation_id, customer_id, agent_type, intent, text, next_step, confidence, probability, created_at",
      )
      .eq("company_id", profile.company_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(30);

    const items = rows ?? [];
    const custIds = Array.from(
      new Set(items.map((r: any) => r.customer_id).filter(Boolean)),
    );
    const { data: custs } = custIds.length
      ? await supabase
          .from("customers")
          .select("id, name, phone")
          .in("id", custIds)
      : { data: [] as any[] };
    const byId = new Map((custs ?? []).map((c: any) => [c.id, c]));

    return items.map((r: any) => {
      const c = r.customer_id ? byId.get(r.customer_id) : null;
      return {
        id: r.id,
        conversationId: r.conversation_id,
        customerId: r.customer_id,
        customerName: c?.name ?? c?.phone ?? "Sin contacto",
        agentType: r.agent_type,
        intent: r.intent,
        text: r.text ?? "",
        nextStep: r.next_step,
        confidence: Math.round(Number(r.confidence ?? 0) * 100) / 100,
        probability: Math.round(Number(r.probability ?? 0)),
        createdAt: r.created_at,
        elapsedLabel: elapsed(r.created_at),
      } satisfies PendingAction;
    });
  });

export const resolvePendingAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; action: "used" | "edited" | "discarded" }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("ai_suggestions")
      .update({
        status: data.action,
        used_at: data.action !== "discarded" ? new Date().toISOString() : null,
        actor_id: userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// 📊 Análisis de conversaciones — agregados IA
// ============================================================
export type ConversationAnalysis = {
  window: "30d";
  totals: {
    conversations: number;
    suggestions: number;
    avgConfidence: number;
    avgProbability: number;
  };
  topIntents: { key: string; count: number }[];
  topObjections: { key: string; count: number }[];
  topProducts: { key: string; count: number }[];
};

export const getConversationAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConversationAnalysis> => {
    const { supabase, userId } = context;
    const empty: ConversationAnalysis = {
      window: "30d",
      totals: { conversations: 0, suggestions: 0, avgConfidence: 0, avgProbability: 0 },
      topIntents: [],
      topObjections: [],
      topProducts: [],
    };
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) return empty;

    const since = new Date(Date.now() - 30 * 86400_000).toISOString();

    const [{ data: suggs }, { count: convCount }] = await Promise.all([
      supabase
        .from("ai_suggestions")
        .select("intent, objections, sources, confidence, probability")
        .eq("company_id", profile.company_id)
        .gte("created_at", since)
        .limit(2000),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .gte("last_message_at", since),
    ]);

    const rows = suggs ?? [];
    const intents = new Map<string, number>();
    const objections = new Map<string, number>();
    const products = new Map<string, number>();
    let sumConf = 0;
    let sumProb = 0;
    let n = 0;

    for (const r of rows) {
      const rr = r as any;
      if (rr.intent) intents.set(rr.intent, (intents.get(rr.intent) ?? 0) + 1);
      if (Array.isArray(rr.objections)) {
        for (const o of rr.objections) {
          const k = typeof o === "string" ? o : o?.text ?? o?.reason;
          if (k) objections.set(k, (objections.get(k) ?? 0) + 1);
        }
      }
      if (Array.isArray(rr.sources)) {
        for (const s of rr.sources) {
          const k = typeof s === "string" ? s : s?.name ?? s?.title;
          if (k) products.set(k, (products.get(k) ?? 0) + 1);
        }
      }
      if (rr.confidence != null) sumConf += Number(rr.confidence);
      if (rr.probability != null) sumProb += Number(rr.probability);
      n += 1;
    }

    const top = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

    return {
      window: "30d",
      totals: {
        conversations: convCount ?? 0,
        suggestions: n,
        avgConfidence: n ? Math.round((sumConf / n) * 100) / 100 : 0,
        avgProbability: n ? Math.round(sumProb / n) : 0,
      },
      topIntents: top(intents),
      topObjections: top(objections),
      topProducts: top(products),
    };
  });
