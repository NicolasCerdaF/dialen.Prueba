import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeStage, STAGES } from "@/lib/pipeline";

export type AiPriority = {
  id: string;
  type: "rescue" | "close" | "quote" | "follow";
  headline: string;
  reason: string;
  customerId: string | null;
  customerName: string;
  potentialValue: number;
  currency: string;
  elapsedLabel: string;
  action: {
    label: string;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    hash?: string;
  };
};

export type AttentionItem = {
  id: string;
  customerId: string;
  customerName: string;
  detail: string;
  elapsedLabel: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
  hash?: string;
};

export type AttentionBucket = {
  id: "unresponded" | "awaitingQuote" | "quotePending" | "stalled";
  label: string;
  count: number;
  items: AttentionItem[];
};

export type FunnelStageMini = {
  key: string;
  label: string;
  color: string;
  count: number;
  value: number;
};

export type MarketProduct = {
  productId: string;
  name: string;
  mentions: number;
};

export type DashboardData = {
  header: {
    userName: string;
    whatsappConnected: boolean;
    priorityCount: number;
    pulseStatus: "normal" | "warning" | "critical";
  };
  priorities: AiPriority[];
  pulse: {
    activeConversations: number;
    openOpportunities: number;
    openOpportunitiesValue: number;
    quotesSent7d: number;
    quotesSent7dDelta: number | null;
    salesMonth: number;
    salesMonthCurrency: string | null;
  };
  attention: AttentionBucket[];
  funnel: FunnelStageMini[];
  market: {
    topProducts: MarketProduct[];
    hasData: boolean;
  };
};

function elapsedLabel(fromIso: string | null | undefined): string {
  if (!fromIso) return "sin actividad";
  const diffMs = Date.now() - new Date(fromIso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const empty: DashboardData = {
      header: {
        userName: profile?.full_name ?? profile?.email?.split("@")[0] ?? "Bienvenido",
        whatsappConnected: false,
        priorityCount: 0,
        pulseStatus: "normal",
      },
      priorities: [],
      pulse: {
        activeConversations: 0,
        openOpportunities: 0,
        openOpportunitiesValue: 0,
        quotesSent7d: 0,
        quotesSent7dDelta: null,
        salesMonth: 0,
        salesMonthCurrency: null,
      },
      attention: [
        { id: "unresponded", label: "Sin responder", count: 0, items: [] },
        { id: "awaitingQuote", label: "Esperando cotización", count: 0, items: [] },
        { id: "quotePending", label: "Cotización pendiente", count: 0, items: [] },
        { id: "stalled", label: "Oportunidad estancada", count: 0, items: [] },
      ],
      funnel: STAGES.filter((s) => s.kind !== "lost").map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        count: 0,
        value: 0,
      })),
      market: { topProducts: [], hasData: false },
    };

    if (!profile?.company_id) return empty;
    const companyId = profile.company_id;

    const now = Date.now();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now - 7 * 86400_000).toISOString();
    const twoWeeksAgo = new Date(now - 14 * 86400_000).toISOString();

    const [
      { data: channel },
      { data: convos },
      { data: customers },
      { data: quotes },
      { data: recentMessages },
      { data: quoteIntents },
    ] = await Promise.all([
      supabase
        .from("whatsapp_channels")
        .select("status")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("id, customer_id, status, last_message_at, assignee_id, ai_paused, updated_at")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id, name, phone, stage, estimated_value, last_interaction_at, priority, tags")
        .eq("company_id", companyId)
        .limit(1000),
      supabase
        .from("quotes")
        .select("id, customer_id, conversation_id, status, total, currency, sent_at, viewed_at, accepted_at, valid_until, created_at")
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
      supabase
        .from("ai_suggestions")
        .select("conversation_id, probability, created_at")
        .eq("company_id", companyId)
        .is("used_at", null)
        .gte("probability", 0.5)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const convoList = convos ?? [];
    const customerList = customers ?? [];
    const quoteList = quotes ?? [];
    const msgs = recentMessages ?? [];

    const customerById = new Map(customerList.map((c) => [c.id, c]));

    // Last direction per conversation (from recent messages)
    const lastDirByConv = new Map<string, { direction: string; created_at: string }>();
    for (const m of msgs) {
      if (!lastDirByConv.has(m.conversation_id)) {
        lastDirByConv.set(m.conversation_id, {
          direction: m.direction,
          created_at: m.created_at,
        });
      }
    }

    // ---- Pulse
    const activeConversations = convoList.length;

    const openCustomers = customerList.filter((c) => {
      const st = normalizeStage(c.stage);
      return st !== "ganado" && st !== "perdido";
    });
    const openOpportunities = openCustomers.length;
    const openOpportunitiesValue = openCustomers.reduce(
      (a, c) => a + Number(c.estimated_value ?? 0),
      0,
    );

    const sentStatuses = new Set(["sent", "viewed", "accepted"]);
    const quotesSent7d = quoteList.filter(
      (q) => sentStatuses.has(q.status) && q.sent_at && q.sent_at >= weekAgo,
    ).length;
    const quotesSent7to14 = quoteList.filter(
      (q) =>
        sentStatuses.has(q.status) &&
        q.sent_at &&
        q.sent_at >= twoWeeksAgo &&
        q.sent_at < weekAgo,
    ).length;
    const quotesSent7dDelta: number | null =
      quotesSent7to14 === 0
        ? null
        : Math.round(((quotesSent7d - quotesSent7to14) / quotesSent7to14) * 100);

    const acceptedThisMonth = quoteList.filter(
      (q) => q.status === "accepted" && q.accepted_at && new Date(q.accepted_at) >= monthStart,
    );
    const salesMonth = acceptedThisMonth.reduce((a, q) => a + Number(q.total ?? 0), 0);
    const currency: string | null =
      acceptedThisMonth[0]?.currency ??
      quoteList.find((q) => q.status === "accepted")?.currency ??
      null;

    // ---- Funnel mini
    const funnel: FunnelStageMini[] = STAGES.filter((s) => s.kind !== "lost").map((s) => {
      const inStage = customerList.filter((c) => normalizeStage(c.stage) === s.key);
      return {
        key: s.key,
        label: s.label,
        color: s.color,
        count: inStage.length,
        value: inStage.reduce((a, c) => a + Number(c.estimated_value ?? 0), 0),
      };
    });

    // ---- Attention buckets
    const oneHourAgo = now - 60 * 60_000;
    const unrespondedConvos = convoList
      .filter((c) => {
        const last = lastDirByConv.get(c.id);
        // Consider inbound (customer waiting) OR no outbound response after last inbound.
        return last?.direction === "inbound";
      })
      .slice(0, 20);

    const unrespondedItems: AttentionItem[] = unrespondedConvos.slice(0, 5).map((c) => {
      const cust = customerById.get(c.customer_id);
      return {
        id: c.id,
        customerId: c.customer_id,
        customerName: cust?.name ?? cust?.phone ?? "Cliente",
        detail: c.last_message_at
          ? new Date(c.last_message_at).getTime() < oneHourAgo
            ? "Esperando > 1 h"
            : "Nuevo mensaje"
          : "Sin actividad",
        elapsedLabel: elapsedLabel(c.last_message_at),
        to: "/",
        hash: `conv=${c.id}`,
      };
    });

    // Esperando cotización: conversaciones con intención IA (probabilidad alta) sin cotización activa
    const conversationsWithActiveQuote = new Set(
      quoteList
        .filter((q) => q.conversation_id && ["draft", "sent", "viewed"].includes(q.status))
        .map((q) => q.conversation_id as string),
    );
    const intentByConv = new Map<string, { probability: number; created_at: string }>();
    for (const s of quoteIntents ?? []) {
      if (!s.conversation_id) continue;
      if (!intentByConv.has(s.conversation_id)) {
        intentByConv.set(s.conversation_id, {
          probability: Number(s.probability ?? 0),
          created_at: s.created_at,
        });
      }
    }
    const awaitingQuote = convoList
      .filter(
        (c) =>
          !conversationsWithActiveQuote.has(c.id) &&
          intentByConv.has(c.id),
      )
      .slice(0, 20);
    const awaitingQuoteItems: AttentionItem[] = awaitingQuote.slice(0, 5).map((c) => {
      const cust = customerById.get(c.customer_id);
      const intent = intentByConv.get(c.id)!;
      return {
        id: c.id,
        customerId: c.customer_id,
        customerName: cust?.name ?? cust?.phone ?? "Cliente",
        detail: `Intención IA ${Math.round(intent.probability * 100)}% · sin cotización`,
        elapsedLabel: elapsedLabel(intent.created_at),
        to: "/",
        hash: `conv=${c.id}`,
      };
    });

    // Cotización pendiente: enviada / vista sin aceptar
    const pendingQuotes = quoteList
      .filter((q) => q.status === "sent" || q.status === "viewed")
      .slice(0, 20);
    const quotePendingItems: AttentionItem[] = pendingQuotes.slice(0, 5).map((q) => {
      const cust = customerById.get(q.customer_id);
      return {
        id: q.id,
        customerId: q.customer_id,
        customerName: cust?.name ?? cust?.phone ?? "Cliente",
        detail: `${q.status === "viewed" ? "Vista" : "Enviada"} · ${Number(q.total).toLocaleString()} ${q.currency}`,
        elapsedLabel: elapsedLabel(q.sent_at ?? q.created_at),
        to: "/cotizaciones/$id",
        params: { id: q.id },
      };
    });

    // Oportunidad estancada: cliente en etapa open sin interacción por N días
    const STALL_DAYS: Record<string, number> = {
      nuevo_lead: 2,
      interesado: 4,
      cotizado: 5,
      negociando: 7,
    };
    const stalled = openCustomers
      .filter((c) => {
        const st = normalizeStage(c.stage);
        const days = STALL_DAYS[st] ?? 5;
        const last = c.last_interaction_at ? new Date(c.last_interaction_at).getTime() : 0;
        return last > 0 && now - last > days * 86400_000;
      })
      .slice(0, 5);
    const stalledItems: AttentionItem[] = stalled.map((c) => ({
      id: c.id,
      customerId: c.id,
      customerName: c.name ?? c.phone ?? "Cliente",
      detail: `Etapa: ${normalizeStage(c.stage)}`,
      elapsedLabel: elapsedLabel(c.last_interaction_at),
      to: "/clientes/$id",
      params: { id: c.id },
    }));

    const attention: AttentionBucket[] = [
      { id: "unresponded", label: "Sin responder", count: unrespondedConvos.length, items: unrespondedItems },
      { id: "awaitingQuote", label: "Esperando cotización", count: awaitingQuote.length, items: awaitingQuoteItems },
      { id: "quotePending", label: "Cotización pendiente", count: pendingQuotes.length, items: quotePendingItems },
      { id: "stalled", label: "Oportunidad estancada", count: stalled.length, items: stalledItems },
    ];

    // ---- AI Priorities (heurística inicial)
    const priorities: AiPriority[] = [];

    // 1) Cotizaciones pendientes de alto valor
    const rankedPending = [...pendingQuotes].sort(
      (a, b) => Number(b.total ?? 0) - Number(a.total ?? 0),
    );
    for (const q of rankedPending) {
      if (priorities.length >= 3) break;
      const cust = customerById.get(q.customer_id);
      priorities.push({
        id: `quote-${q.id}`,
        type: "close",
        headline: `Cierra a ${cust?.name ?? "cliente"}`,
        reason: `Cotización ${q.status === "viewed" ? "vista" : "enviada"} de ${Number(q.total).toLocaleString()} ${q.currency} ${elapsedLabel(q.sent_at)}.`,
        customerId: q.customer_id,
        customerName: cust?.name ?? cust?.phone ?? "Cliente",
        potentialValue: Number(q.total ?? 0),
        currency: q.currency,
        elapsedLabel: elapsedLabel(q.sent_at),
        action: {
          label: "Abrir cotización",
          to: "/cotizaciones/$id",
          params: { id: q.id },
        },
      });
    }

    // 2) Conversaciones sin responder con cliente conocido
    for (const c of unrespondedConvos) {
      if (priorities.length >= 3) break;
      if (priorities.some((p) => p.customerId === c.customer_id)) continue;
      const cust = customerById.get(c.customer_id);
      priorities.push({
        id: `conv-${c.id}`,
        type: "rescue",
        headline: `Responde a ${cust?.name ?? "cliente"}`,
        reason: `Mensaje entrante ${elapsedLabel(c.last_message_at)} sin respuesta.`,
        customerId: c.customer_id,
        customerName: cust?.name ?? cust?.phone ?? "Cliente",
        potentialValue: Number(cust?.estimated_value ?? 0),
        currency: currency ?? "",
        elapsedLabel: elapsedLabel(c.last_message_at),
        action: {
          label: "Abrir conversación",
          to: "/",
          hash: `conv=${c.id}`,
        },
      });
    }

    // 3) Oportunidades estancadas de mayor valor
    const rankedStalled = [...stalled].sort(
      (a, b) => Number(b.estimated_value ?? 0) - Number(a.estimated_value ?? 0),
    );
    for (const c of rankedStalled) {
      if (priorities.length >= 3) break;
      if (priorities.some((p) => p.customerId === c.id)) continue;
      priorities.push({
        id: `stall-${c.id}`,
        type: "follow",
        headline: `Reactiva a ${c.name ?? "cliente"}`,
        reason: `Sin actividad ${elapsedLabel(c.last_interaction_at)} en etapa ${normalizeStage(c.stage)}.`,
        customerId: c.id,
        customerName: c.name ?? c.phone ?? "Cliente",
        potentialValue: Number(c.estimated_value ?? 0),
        currency,
        elapsedLabel: elapsedLabel(c.last_interaction_at),
        action: {
          label: "Ver cliente",
          to: "/clientes/$id",
          params: { id: c.id },
        },
      });
    }

    // ---- Market signals (top products by product_customers if any)
    let topProducts: MarketProduct[] = [];
    try {
      const { data: pcRows } = await supabase
        .from("product_customers")
        .select("product_id")
        .eq("company_id", companyId)
        .gte("created_at", new Date(now - 30 * 86400_000).toISOString())
        .limit(500);
      const counts = new Map<string, number>();
      for (const row of pcRows ?? []) {
        counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
      }
      if (counts.size > 0) {
        const ids = Array.from(counts.keys());
        const { data: prods } = await supabase
          .from("products")
          .select("id, name")
          .in("id", ids);
        topProducts = (prods ?? [])
          .map((p) => ({ productId: p.id, name: p.name, mentions: counts.get(p.id) ?? 0 }))
          .sort((a, b) => b.mentions - a.mentions)
          .slice(0, 5);
      }
    } catch {
      topProducts = [];
    }

    // ---- Pulse status
    const criticalPending = pendingQuotes.filter((q) => {
      const t = q.sent_at ? new Date(q.sent_at).getTime() : 0;
      return t > 0 && now - t > 3 * 86400_000;
    }).length;
    let pulseStatus: "normal" | "warning" | "critical" = "normal";
    if (
      criticalPending > 0 ||
      unrespondedConvos.filter((c) => {
        const last = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        return last > 0 && now - last > 60 * 60_000;
      }).length >= 3
    ) {
      pulseStatus = "critical";
    } else if (unrespondedConvos.length > 0 || stalled.length > 0) {
      pulseStatus = "warning";
    }

    return {
      header: {
        userName: profile.full_name ?? profile.email?.split("@")[0] ?? "Bienvenido",
        whatsappConnected: channel?.status === "connected",
        priorityCount: priorities.length,
        pulseStatus,
      },
      priorities,
      pulse: {
        activeConversations,
        openOpportunities,
        openOpportunitiesValue,
        quotesSent7d,
        quotesSent7dDelta,
        salesMonth,
        salesMonthCurrency: currency,
      },
      attention,
      funnel,
      market: { topProducts, hasData: topProducts.length > 0 },
    };
  });
