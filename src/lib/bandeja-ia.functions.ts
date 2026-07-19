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
          .select("conversation_id, direction, created_at")
          .eq("company_id", companyId)
          .gte("created_at", weekAgo)
          .order("created_at", { ascending: false })
          .limit(3000),
      ]);

    const convoList = convos ?? [];
    const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
    const currency = quotes?.[0]?.currency ?? "USD";

    // Latest message direction per conversation
    const lastMsg = new Map<string, { direction: string; created_at: string }>();
    for (const m of msgs ?? []) {
      if (!lastMsg.has(m.conversation_id)) {
        lastMsg.set(m.conversation_id, { direction: m.direction, created_at: m.created_at });
      }
    }

    // Latest quote per conversation
    const quoteByConv = new Map<string, NonNullable<typeof quotes>[number]>();
    for (const q of quotes ?? []) {
      if (q.conversation_id && !quoteByConv.has(q.conversation_id)) {
        quoteByConv.set(q.conversation_id, q);
      }
    }

    const items: BandejaItem[] = [];

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

      // Intent heuristic
      let intent = 30;
      if (stage === "cotizado") intent += 25;
      if (stage === "negociando") intent += 40;
      if (stage === "interesado") intent += 15;
      if (activeQuote) intent += 15;
      if (waitingHours > 0 && waitingHours < 24) intent += 10;
      intent = Math.min(100, intent);

      const probability =
        stage === "negociando" ? 75 : stage === "cotizado" ? 55 : stage === "interesado" ? 35 : 20;

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
          reasonDetail: `Cliente marcado como prioritario esperando ${elapsed(last?.created_at)}.`,
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
          intent: Math.max(intent, 70),
          urgency: "alta",
          probability: Math.max(probability, 60),
          potentialValue: Number(activeQuote?.total ?? value),
          currency: activeQuote?.currency ?? currency,
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
          reasonDetail: `Cliente en negociación esperando hace ${elapsed(last?.created_at)}.`,
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
          reason: "Cliente mostró interés",
          reasonDetail: "El cliente hizo preguntas sobre productos o precios.",
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
          reasonDetail: "Existe un borrador de cotización pendiente de envío.",
          intent,
          urgency: "media",
          probability,
          potentialValue: Number(activeQuote?.total ?? value),
          currency: activeQuote?.currency ?? currency,
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
          reasonDetail: "Lead nuevo con mensajes recientes. Recomendado calificar.",
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

    items.sort((a, b) => b.score - a.score);

    const groups = {
      high: items.filter((i) => i.category === "high").slice(0, 20),
      follow: items.filter((i) => i.category === "follow").slice(0, 20),
      opportunity: items.filter((i) => i.category === "opportunity").slice(0, 20),
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
