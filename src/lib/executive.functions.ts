import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeStage, STAGES } from "@/lib/pipeline";
import { callChat } from "@/lib/ai-router.server";

export type ExecRange = 7 | 30 | 90;

export type ExecTotals = {
  revenue: number;
  currency: string;
  quotesSent: number;
  quotesAccepted: number;
  acceptRate: number;
  avgTicket: number;
  activeConversations: number;
  newCustomers: number;
  wonCustomers: number;
  conversionRate: number;
  avgResponseSeconds: number;
  responseUnderSlaPct: number;
  outbound: number;
  outboundAi: number;
  aiShare: number;
  automationRuns: number;
  automationErrors: number;
  weightedPipeline: number;
  openPipeline: number;
  openOpportunities: number;
};

export type ExecDeltas = {
  revenue: number;
  quotesSent: number;
  acceptRate: number;
  avgTicket: number;
  newCustomers: number;
  conversionRate: number;
  avgResponseSeconds: number;
};

export type ExecDaily = {
  date: string;
  revenue: number;
  quotesSent: number;
  quotesAccepted: number;
  conversations: number;
  inbound: number;
  outbound: number;
  outboundAi: number;
  newCustomers: number;
};

export type SellerRow = {
  sender_id: string;
  name: string;
  outbound: number;
  quotesSent: number;
  quotesWon: number;
  revenue: number;
  conversions: number;
  acceptRate: number;
};

export type FunnelSlice = {
  key: string;
  label: string;
  color: string;
  kind: "open" | "won" | "lost";
  count: number;
  value: number;
};

export type ProductPerf = {
  productId: string;
  name: string;
  units: number;
  quoted: number;
  won: number;
  revenue: number;
};

export type ExecAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  href?: string;
};

export type ExecutiveDashboard = {
  range: ExecRange;
  periodFrom: string;
  periodTo: string;
  totals: ExecTotals;
  previousTotals: ExecTotals;
  deltas: ExecDeltas;
  series: ExecDaily[];
  funnel: FunnelSlice[];
  sellers: SellerRow[];
  topProducts: ProductPerf[];
  alerts: ExecAlert[];
  aiBriefing: string | null;
  header: {
    userName: string;
    companyName: string | null;
    whatsappConnected: boolean;
  };
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pctDelta(curr: number, prev: number): number {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function normalizeInterval(seconds: number): number {
  return Math.max(0, Math.round(seconds));
}

async function computeTotalsBlock(supabase: any, companyId: string, from: string, to: string) {
  const [
    { data: quotes },
    { data: convos },
    { data: customers },
    { data: messages },
    { data: sugs },
    { data: runs },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, total, currency, sent_at, accepted_at, created_at, created_by, customer_id")
      .eq("company_id", companyId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(5000),
    supabase
      .from("conversations")
      .select("id, status, assignee_id, last_message_at, created_at, customer_id")
      .eq("company_id", companyId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(5000),
    supabase
      .from("customers")
      .select("id, name, phone, stage, estimated_value, created_at")
      .eq("company_id", companyId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(5000),
    supabase
      .from("messages")
      .select("id, conversation_id, direction, sender_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(20000),
    supabase
      .from("ai_suggestions")
      .select("id, status, used_at")
      .eq("company_id", companyId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(5000),
    supabase
      .from("automation_runs")
      .select("id, status, error, started_at")
      .eq("company_id", companyId)
      .gte("started_at", from)
      .lt("started_at", to)
      .limit(5000),
  ]);

  const qs = quotes ?? [];
  const cvs = convos ?? [];
  const cus = customers ?? [];
  const msgs = messages ?? [];
  const sg = sugs ?? [];
  const rs = runs ?? [];

  // Pick dominant currency by total invoiced amount to avoid mixing currencies
  const currencyTotals = new Map<string, number>();
  for (const q of qs as any[]) {
    const c = q.currency ?? "USD";
    currencyTotals.set(c, (currencyTotals.get(c) ?? 0) + Number(q.total ?? 0));
  }
  const currency =
    Array.from(currencyTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const qsCur = (qs as any[]).filter((q) => (q.currency ?? "USD") === currency);
  const sentStatuses = new Set(["sent", "viewed", "accepted"]);
  const quotesSent = qsCur.filter((q: any) => sentStatuses.has(q.status)).length;
  const quotesAccepted = qsCur.filter((q: any) => q.status === "accepted").length;
  const revenue = qsCur
    .filter((q: any) => q.status === "accepted")
    .reduce((a: number, q: any) => a + Number(q.total ?? 0), 0);
  const acceptRate = quotesSent ? Math.round((quotesAccepted / quotesSent) * 100) : 0;
  const avgTicket = quotesAccepted ? Math.round(revenue / quotesAccepted) : 0;

  const newCustomers = cus.length;
  const wonCustomers = cus.filter((c: any) => normalizeStage(c.stage) === "ganado").length;
  const conversionRate = newCustomers ? Math.round((wonCustomers / newCustomers) * 100) : 0;

  // Response time: per conversation, first inbound -> first outbound after it
  const byConv = new Map<string, { in: number | null; out: number | null }>();
  for (const m of msgs) {
    const t = new Date(m.created_at).getTime();
    let c = byConv.get(m.conversation_id);
    if (!c) {
      c = { in: null, out: null };
      byConv.set(m.conversation_id, c);
    }
    if (m.direction === "inbound" && c.in === null) c.in = t;
    if (m.direction === "outbound" && c.in !== null && c.out === null && t >= c.in) c.out = t;
  }
  const deltas: number[] = [];
  for (const c of byConv.values()) {
    if (c.in !== null && c.out !== null) deltas.push((c.out - c.in) / 1000);
  }
  const avgResponseSeconds = deltas.length
    ? normalizeInterval(deltas.reduce((a, b) => a + b, 0) / deltas.length)
    : 0;
  const responseUnderSlaPct = deltas.length
    ? Math.round((deltas.filter((s) => s < 900).length / deltas.length) * 100)
    : 0;

  const outbound = msgs.filter((m: any) => m.direction === "outbound").length;
  const outboundAi = msgs.filter((m: any) => m.direction === "outbound" && !m.sender_id).length;
  const aiShare = outbound ? Math.round((outboundAi / outbound) * 100) : 0;

  const automationRuns = rs.length;
  const automationErrors = rs.filter((r: any) => r.status === "error" || !!r.error).length;

  const activeConversations = cvs.filter((c: any) => c.status === "open").length;

  const totals: ExecTotals = {
    revenue,
    currency,
    quotesSent,
    quotesAccepted,
    acceptRate,
    avgTicket,
    activeConversations,
    newCustomers,
    wonCustomers,
    conversionRate,
    avgResponseSeconds,
    responseUnderSlaPct,
    outbound,
    outboundAi,
    aiShare,
    automationRuns,
    automationErrors,
    weightedPipeline: 0,
    openPipeline: 0,
    openOpportunities: 0,
  };

  return { totals, quotes: qsCur, conversations: cvs, customers: cus, messages: msgs, sugs: sg };

}

export const getExecutiveDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ range: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<ExecutiveDashboard> => {
    const { supabase, userId } = context;
    const range = data.range;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, full_name, email")
      .eq("id", userId)
      .maybeSingle();

    const now = new Date();
    const to = now.toISOString();
    const from = new Date(now.getTime() - range * 86400_000).toISOString();
    const prevTo = from;
    const prevFrom = new Date(now.getTime() - 2 * range * 86400_000).toISOString();

    const zeroTotals: ExecTotals = {
      revenue: 0,
      currency: "USD",
      quotesSent: 0,
      quotesAccepted: 0,
      acceptRate: 0,
      avgTicket: 0,
      activeConversations: 0,
      newCustomers: 0,
      wonCustomers: 0,
      conversionRate: 0,
      avgResponseSeconds: 0,
      responseUnderSlaPct: 0,
      outbound: 0,
      outboundAi: 0,
      aiShare: 0,
      automationRuns: 0,
      automationErrors: 0,
      weightedPipeline: 0,
      openPipeline: 0,
      openOpportunities: 0,
    };

    if (!profile?.company_id) {
      return {
        range,
        periodFrom: from,
        periodTo: to,
        totals: zeroTotals,
        previousTotals: zeroTotals,
        deltas: {
          revenue: 0,
          quotesSent: 0,
          acceptRate: 0,
          avgTicket: 0,
          newCustomers: 0,
          conversionRate: 0,
          avgResponseSeconds: 0,
        },
        series: [],
        funnel: STAGES.map((s) => ({
          key: s.key,
          label: s.label,
          color: s.color,
          kind: s.kind,
          count: 0,
          value: 0,
        })),
        sellers: [],
        topProducts: [],
        alerts: [],
        aiBriefing: null,
        header: {
          userName: profile?.full_name ?? profile?.email?.split("@")[0] ?? "Bienvenido",
          companyName: null,
          whatsappConnected: false,
        },
      };
    }

    const companyId = profile.company_id;

    const [curr, prev, { data: allCustomers }, { data: channel }, { data: company }] = await Promise.all([
      computeTotalsBlock(supabase, companyId, from, to),
      computeTotalsBlock(supabase, companyId, prevFrom, prevTo),
      supabase
        .from("customers")
        .select("id, stage, estimated_value")
        .eq("company_id", companyId)
        .limit(5000),
      supabase
        .from("whatsapp_channels")
        .select("status")
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    ]);

    // Open pipeline & weighted forecast — probability heuristic per stage
    const STAGE_WEIGHT: Record<string, number> = {
      nuevo_lead: 0.1,
      interesado: 0.25,
      cotizado: 0.5,
      negociando: 0.75,
      ganado: 1,
      perdido: 0,
    };
    let openPipeline = 0;
    let weightedPipeline = 0;
    let openOpportunities = 0;
    for (const c of allCustomers ?? []) {
      const st = normalizeStage(c.stage);
      const w = STAGE_WEIGHT[st] ?? 0;
      const v = Number(c.estimated_value ?? 0);
      if (st !== "ganado" && st !== "perdido") {
        openPipeline += v;
        weightedPipeline += v * w;
        openOpportunities += 1;
      }
    }
    curr.totals.openPipeline = openPipeline;
    curr.totals.weightedPipeline = Math.round(weightedPipeline);
    curr.totals.openOpportunities = openOpportunities;

    // Time series
    const days = range;
    const dayMap = new Map<string, ExecDaily>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000);
      const key = ymd(d);
      dayMap.set(key, {
        date: key,
        revenue: 0,
        quotesSent: 0,
        quotesAccepted: 0,
        conversations: 0,
        inbound: 0,
        outbound: 0,
        outboundAi: 0,
        newCustomers: 0,
      });
    }
    const sentStatuses = new Set(["sent", "viewed", "accepted"]);
    for (const q of curr.quotes) {
      if (sentStatuses.has(q.status) && q.sent_at) {
        const k = ymd(new Date(q.sent_at));
        const row = dayMap.get(k);
        if (row) row.quotesSent += 1;
      }
      if (q.status === "accepted" && q.accepted_at) {
        const k = ymd(new Date(q.accepted_at));
        const row = dayMap.get(k);
        if (row) {
          row.quotesAccepted += 1;
          row.revenue += Number(q.total ?? 0);
        }
      }
    }
    for (const c of curr.conversations) {
      const k = ymd(new Date(c.created_at));
      const row = dayMap.get(k);
      if (row) row.conversations += 1;
    }
    for (const c of curr.customers) {
      const k = ymd(new Date(c.created_at));
      const row = dayMap.get(k);
      if (row) row.newCustomers += 1;
    }
    for (const m of curr.messages) {
      const k = ymd(new Date(m.created_at));
      const row = dayMap.get(k);
      if (!row) continue;
      if (m.direction === "inbound") row.inbound += 1;
      else if (m.direction === "outbound") {
        row.outbound += 1;
        if (!m.sender_id) row.outboundAi += 1;
      }
    }
    const series = Array.from(dayMap.values());

    // Funnel
    const funnel: FunnelSlice[] = STAGES.map((s) => {
      const rows = (allCustomers ?? []).filter((c: any) => normalizeStage(c.stage) === s.key);
      return {
        key: s.key,
        label: s.label,
        color: s.color,
        kind: s.kind,
        count: rows.length,
        value: rows.reduce((a: number, c: any) => a + Number(c.estimated_value ?? 0), 0),
      };
    });

    // Sellers ranking
    const outboundBySender = new Map<string, number>();
    for (const m of curr.messages) {
      if (m.direction === "outbound" && m.sender_id) {
        outboundBySender.set(m.sender_id, (outboundBySender.get(m.sender_id) ?? 0) + 1);
      }
    }
    const quoteSentBySender = new Map<string, number>();
    const quoteWonBySender = new Map<string, number>();
    const revenueBySender = new Map<string, number>();
    for (const q of curr.quotes) {
      if (!q.created_by) continue;
      if (sentStatuses.has(q.status)) {
        quoteSentBySender.set(q.created_by, (quoteSentBySender.get(q.created_by) ?? 0) + 1);
      }
      if (q.status === "accepted") {
        quoteWonBySender.set(q.created_by, (quoteWonBySender.get(q.created_by) ?? 0) + 1);
        revenueBySender.set(
          q.created_by,
          (revenueBySender.get(q.created_by) ?? 0) + Number(q.total ?? 0),
        );
      }
    }
    const senderIds = Array.from(
      new Set([
        ...outboundBySender.keys(),
        ...quoteSentBySender.keys(),
        ...quoteWonBySender.keys(),
      ]),
    );
    const nameById = new Map<string, string>();
    if (senderIds.length) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", senderIds);
      for (const p of prof ?? []) {
        nameById.set(p.id, p.full_name ?? p.email?.split("@")[0] ?? "Miembro");
      }
    }
    const sellers: SellerRow[] = senderIds
      .map((id) => {
        const qs = quoteSentBySender.get(id) ?? 0;
        const qw = quoteWonBySender.get(id) ?? 0;
        return {
          sender_id: id,
          name: nameById.get(id) ?? "Miembro",
          outbound: outboundBySender.get(id) ?? 0,
          quotesSent: qs,
          quotesWon: qw,
          revenue: Math.round(revenueBySender.get(id) ?? 0),
          conversions: qw,
          acceptRate: qs ? Math.round((qw / qs) * 100) : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.quotesWon - a.quotesWon || b.outbound - a.outbound);

    // Top products — from quote_items on accepted quotes in period
    const acceptedQuoteIds = curr.quotes
      .filter((q: any) => q.status === "accepted")
      .map((q: any) => q.id);
    const sentQuoteIds = curr.quotes
      .filter((q: any) => sentStatuses.has(q.status))
      .map((q: any) => q.id);
    const productAgg = new Map<
      string,
      { name: string; units: number; quoted: number; won: number; revenue: number }
    >();
    if (sentQuoteIds.length) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("product_id, name, quantity, line_total, quote_id")
        .in("quote_id", sentQuoteIds);
      const acceptedSet = new Set(acceptedQuoteIds);
      for (const it of items ?? []) {
        const key = it.product_id ?? `custom:${it.name}`;
        const agg = productAgg.get(key) ?? {
          name: it.name,
          units: 0,
          quoted: 0,
          won: 0,
          revenue: 0,
        };
        agg.quoted += 1;
        if (acceptedSet.has(it.quote_id)) {
          agg.won += 1;
          agg.units += Number(it.quantity ?? 0);
          agg.revenue += Number(it.line_total ?? 0);
        }
        productAgg.set(key, agg);
      }
    }
    const topProducts: ProductPerf[] = Array.from(productAgg.entries())
      .map(([id, v]) => ({
        productId: id,
        name: v.name,
        units: v.units,
        quoted: v.quoted,
        won: v.won,
        revenue: Math.round(v.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue || b.won - a.won)
      .slice(0, 10);

    // Deltas
    const deltas: ExecDeltas = {
      revenue: pctDelta(curr.totals.revenue, prev.totals.revenue),
      quotesSent: pctDelta(curr.totals.quotesSent, prev.totals.quotesSent),
      acceptRate: curr.totals.acceptRate - prev.totals.acceptRate,
      avgTicket: pctDelta(curr.totals.avgTicket, prev.totals.avgTicket),
      newCustomers: pctDelta(curr.totals.newCustomers, prev.totals.newCustomers),
      conversionRate: curr.totals.conversionRate - prev.totals.conversionRate,
      avgResponseSeconds:
        prev.totals.avgResponseSeconds === 0
          ? 0
          : Math.round(
              ((curr.totals.avgResponseSeconds - prev.totals.avgResponseSeconds) /
                prev.totals.avgResponseSeconds) *
                100,
            ),
    };

    // Alerts
    const alerts: ExecAlert[] = [];
    if (deltas.revenue <= -20 && curr.totals.revenue > 0) {
      alerts.push({
        id: "revenue-drop",
        severity: "critical",
        title: `Ingresos ${deltas.revenue}%`,
        detail: "Caída significativa vs. periodo anterior",
      });
    }
    if (curr.totals.acceptRate < 20 && curr.totals.quotesSent >= 5) {
      alerts.push({
        id: "low-accept",
        severity: "warning",
        title: `${curr.totals.acceptRate}% de aceptación`,
        detail: "Ajustar precios, seguimientos o discovery",
        href: "/cotizaciones",
      });
    }
    if (curr.totals.avgResponseSeconds > 900 && curr.totals.outbound > 0) {
      alerts.push({
        id: "slow-response",
        severity: "warning",
        title: "Respuesta > 15 min",
        detail: `Tiempo promedio ${Math.round(curr.totals.avgResponseSeconds / 60)}m`,
        href: "/conversaciones",
      });
    }
    if (curr.totals.automationErrors > 0 && curr.totals.automationRuns > 0) {
      const rate = Math.round((curr.totals.automationErrors / curr.totals.automationRuns) * 100);
      if (rate >= 10) {
        alerts.push({
          id: "automation-errors",
          severity: "warning",
          title: `${rate}% de errores en automatización`,
          detail: `${curr.totals.automationErrors} ejecuciones con error`,
          href: "/automatizaciones",
        });
      }
    }
    if (openOpportunities > 0 && weightedPipeline === 0) {
      alerts.push({
        id: "no-forecast",
        severity: "info",
        title: "Falta valor estimado en oportunidades",
        detail: "Añade valor a los clientes para calcular el forecast",
        href: "/oportunidades",
      });
    }

    return {
      range,
      periodFrom: from,
      periodTo: to,
      totals: curr.totals,
      previousTotals: prev.totals,
      deltas,
      series,
      funnel,
      sellers,
      topProducts,
      alerts,
      aiBriefing: null,
      header: {
        userName: profile.full_name ?? profile.email?.split("@")[0] ?? "Bienvenido",
        companyName: company?.name ?? null,
        whatsappConnected: channel?.status === "connected",
      },
    };
  });

// ---------- AI narrative briefing ----------

export const generateExecutiveBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ range: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<{ briefing: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY no configurada");
    const dash = await getExecutiveDashboard({ data: { range: data.range } });
    void context; // ensure auth

    const currency = dash.totals.currency;
    const summary = {
      range_days: dash.range,
      revenue: dash.totals.revenue,
      revenue_delta_pct: dash.deltas.revenue,
      quotes_sent: dash.totals.quotesSent,
      quotes_accepted: dash.totals.quotesAccepted,
      accept_rate: dash.totals.acceptRate,
      accept_rate_delta_pts: dash.deltas.acceptRate,
      avg_ticket: dash.totals.avgTicket,
      new_customers: dash.totals.newCustomers,
      conversion_rate: dash.totals.conversionRate,
      avg_response_seconds: dash.totals.avgResponseSeconds,
      ai_share: dash.totals.aiShare,
      open_opportunities: dash.totals.openOpportunities,
      weighted_pipeline: dash.totals.weightedPipeline,
      open_pipeline: dash.totals.openPipeline,
      top_sellers: dash.sellers.slice(0, 3).map((s) => ({
        name: s.name,
        revenue: s.revenue,
        won: s.quotesWon,
      })),
      top_products: dash.topProducts.slice(0, 3).map((p) => ({
        name: p.name,
        revenue: p.revenue,
        won: p.won,
      })),
      alerts: dash.alerts.map((a) => a.title),
    };

    const prompt = `Eres el asesor comercial ejecutivo. Analiza estas métricas de los últimos ${dash.range} días (moneda ${currency}) y entrega un briefing en español, máximo 6 líneas, con:
1) Titular del periodo,
2) 2 fortalezas concretas,
3) 2 riesgos u oportunidades,
4) 1 acción prioritaria para el gerente.
Sé específico, sin cifras redundantes. Datos: ${JSON.stringify(summary)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Eres analista comercial senior. Directo, ejecutivo, español." },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 400,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`AI ${resp.status}: ${t.slice(0, 160)}`);
      }
      const json = (await resp.json()) as any;
      const briefing = json?.choices?.[0]?.message?.content?.trim() ?? "Sin briefing disponible.";
      return { briefing };
    } finally {
      clearTimeout(timeout);
    }
  });
