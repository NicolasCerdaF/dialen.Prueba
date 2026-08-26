import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withPremiumFeature } from "@/lib/plan-middleware";

const metricasMiddleware = withPremiumFeature("metricas-ia");

// ---------- Types ----------

export type AnalyticsRange = 7 | 14 | 30 | 60 | 90;

export type AiAnalytics = {
  range: AnalyticsRange;
  from: string; // ISO
  to: string; // ISO

  // Overview
  totals: {
    outbound: number;
    outboundAi: number;
    outboundHuman: number;
    inbound: number;
    aiShare: number; // %
    aiSuggestions: number;
    aiAccepted: number;
    acceptRate: number; // %
    avgConfidence: number; // 0-100
    avgResponseSeconds: number;
    automationRuns: number;
    automationErrors: number;
    automationErrorRate: number; // %
    knowledgeCitations: number;
    activeConversations: number;
    aiPaused: number;
    waitingTooLong: number;
    hotLeads: number;
  };

  // vs previous period (%)
  deltas: {
    outbound: number;
    aiShare: number;
    acceptRate: number;
    avgResponseSeconds: number;
    automationErrorRate: number;
  };

  // Daily series (length = range)
  series: {
    date: string;
    inbound: number;
    outbound: number;
    outboundAi: number;
    suggestions: number;
    accepted: number;
    citations: number;
    runs: number;
    errors: number;
  }[];

  // Agent-type breakdown from ai_suggestions
  agents: {
    agent_type: string;
    suggestions: number;
    accepted: number;
    discarded: number;
    pending: number;
    accept_rate: number;
    avg_confidence: number;
    avg_probability: number;
  }[];

  // Intent + sentiment distributions
  intents: { intent: string; count: number }[];
  sentiments: { sentiment: string; count: number }[];

  // Confidence buckets (0-25, 25-50, 50-75, 75-100)
  confidenceBuckets: { label: string; count: number; accepted: number }[];

  // Response-time buckets in seconds
  latencyBuckets: { label: string; count: number }[];

  // Top automations by runs
  topAutomations: {
    id: string;
    name: string;
    runs: number;
    errors: number;
    successRate: number;
    avg_ms: number;
  }[];

  // Top cited docs
  topDocuments: {
    id: string;
    name: string;
    citations: number;
    last_used_at: string | null;
  }[];

  // AI vs human by seller
  sellers: {
    sender_id: string;
    name: string;
    outbound: number;
  }[];

  // Health alerts (drill-downs)
  alerts: {
    id: string;
    kind: "waiting" | "low_confidence" | "automation_errors" | "ai_paused" | "no_knowledge";
    title: string;
    detail: string;
    severity: "info" | "warning" | "critical";
    href?: string | null;
  }[];
};

export type SuggestionRow = {
  id: string;
  created_at: string;
  agent_type: string;
  status: string;
  intent: string | null;
  confidence: number | null;
  probability: number | null;
  text: string;
  conversation_id: string;
  customer_id: string | null;
  customer_name: string | null;
  used_at: string | null;
  model: string | null;
};

// ---------- Helpers ----------

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function bucketLabel(seconds: number): string {
  if (seconds < 30) return "<30s";
  if (seconds < 120) return "30s-2m";
  if (seconds < 600) return "2-10m";
  if (seconds < 3600) return "10-60m";
  if (seconds < 3 * 3600) return "1-3h";
  return ">3h";
}

function confBucket(v: number): number {
  if (v < 0.25) return 0;
  if (v < 0.5) return 1;
  if (v < 0.75) return 2;
  return 3;
}

// ---------- Main analytics fn ----------

export const getAiAnalytics = createServerFn({ method: "POST" })
  .middleware(metricasMiddleware)
  .inputValidator((input: unknown) =>
    z
      .object({
        range: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]).default(30),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<AiAnalytics> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    const companyId = profile?.company_id;
    const range = data.range as AnalyticsRange;
    const to = new Date();
    const from = new Date(to.getTime() - range * 86400_000);
    const prevFrom = new Date(from.getTime() - range * 86400_000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const prevFromIso = prevFrom.toISOString();

    const empty: AiAnalytics = {
      range,
      from: fromIso,
      to: toIso,
      totals: {
        outbound: 0,
        outboundAi: 0,
        outboundHuman: 0,
        inbound: 0,
        aiShare: 0,
        aiSuggestions: 0,
        aiAccepted: 0,
        acceptRate: 0,
        avgConfidence: 0,
        avgResponseSeconds: 0,
        automationRuns: 0,
        automationErrors: 0,
        automationErrorRate: 0,
        knowledgeCitations: 0,
        activeConversations: 0,
        aiPaused: 0,
        waitingTooLong: 0,
        hotLeads: 0,
      },
      deltas: {
        outbound: 0,
        aiShare: 0,
        acceptRate: 0,
        avgResponseSeconds: 0,
        automationErrorRate: 0,
      },
      series: [],
      agents: [],
      intents: [],
      sentiments: [],
      confidenceBuckets: [
        { label: "0-25%", count: 0, accepted: 0 },
        { label: "25-50%", count: 0, accepted: 0 },
        { label: "50-75%", count: 0, accepted: 0 },
        { label: "75-100%", count: 0, accepted: 0 },
      ],
      latencyBuckets: [],
      topAutomations: [],
      topDocuments: [],
      sellers: [],
      alerts: [],
    };

    if (!companyId) return empty;

    // -------- Parallel loads --------
    const [
      msgsRes,
      msgsPrevRes,
      sugsRes,
      sugsPrevRes,
      runsRes,
      runsPrevRes,
      usageRes,
      convsRes,
      insightsRes,
      topDocsRes,
      topAutosRes,
    ] = await Promise.all([
      supabase
        .from("messages")
        .select("id, direction, sender_id, created_at, conversation_id")
        .eq("company_id", companyId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true })
        .limit(50000),
      supabase
        .from("messages")
        .select("id, direction, sender_id", { count: "exact", head: false })
        .eq("company_id", companyId)
        .gte("created_at", prevFromIso)
        .lt("created_at", fromIso)
        .limit(50000),
      supabase
        .from("ai_suggestions")
        .select(
          "id, created_at, agent_type, status, intent, confidence, probability, text, conversation_id, customer_id, used_at, model",
        )
        .eq("company_id", companyId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("ai_suggestions")
        .select("id, status", { count: "exact", head: false })
        .eq("company_id", companyId)
        .gte("created_at", prevFromIso)
        .lt("created_at", fromIso)
        .limit(5000),
      supabase
        .from("automation_runs")
        .select("id, automation_id, status, duration_ms, started_at, error")
        .eq("company_id", companyId)
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .order("started_at", { ascending: true })
        .limit(20000),
      supabase
        .from("automation_runs")
        .select("id, status", { count: "exact", head: false })
        .eq("company_id", companyId)
        .gte("started_at", prevFromIso)
        .lt("started_at", fromIso)
        .limit(20000),
      supabase
        .from("knowledge_usage")
        .select("id, document_id, created_at, similarity")
        .eq("company_id", companyId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(20000),
      supabase
        .from("conversations")
        .select("id, status, ai_paused, last_message_at, assignee_id")
        .eq("company_id", companyId)
        .eq("status", "open")
        .limit(2000),
      supabase
        .from("ai_insights")
        .select("customer_id, probability, intent, sentiment, churn_risk")
        .eq("company_id", companyId)
        .limit(5000),
      supabase
        .from("knowledge_documents")
        .select("id, title, name, last_used_at")
        .eq("company_id", companyId)
        .not("last_used_at", "is", null)
        .order("last_used_at", { ascending: false })
        .limit(50),
      supabase
        .from("automations")
        .select("id, name")
        .eq("company_id", companyId)
        .limit(200),
    ]);

    const msgs = (msgsRes.data ?? []) as any[];
    const sugs = (sugsRes.data ?? []) as any[];
    const runs = (runsRes.data ?? []) as any[];
    const usage = (usageRes.data ?? []) as any[];
    const convs = (convsRes.data ?? []) as any[];
    const insights = (insightsRes.data ?? []) as any[];
    const docsRows = (topDocsRes.data ?? []) as any[];
    const autoRows = (topAutosRes.data ?? []) as any[];

    // -------- Series --------
    const seriesMap = new Map<string, AiAnalytics["series"][number]>();
    const days: string[] = [];
    for (let i = 0; i < range; i++) {
      const d = new Date(from.getTime() + i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
      seriesMap.set(key, {
        date: key,
        inbound: 0,
        outbound: 0,
        outboundAi: 0,
        suggestions: 0,
        accepted: 0,
        citations: 0,
        runs: 0,
        errors: 0,
      });
    }

    let inbound = 0;
    let outbound = 0;
    let outboundAi = 0;
    for (const m of msgs) {
      const k = dayKey(m.created_at);
      const row = seriesMap.get(k);
      if (m.direction === "inbound") {
        inbound++;
        if (row) row.inbound++;
      } else if (m.direction === "outbound") {
        outbound++;
        const ai = !m.sender_id;
        if (ai) outboundAi++;
        if (row) {
          row.outbound++;
          if (ai) row.outboundAi++;
        }
      }
    }
    const outboundHuman = outbound - outboundAi;

    // Avg response time: first inbound followed by outbound in same conv
    const convFirst = new Map<string, { in: number | null; out: number | null }>();
    for (const m of msgs) {
      const c = convFirst.get(m.conversation_id) ?? { in: null, out: null };
      const t = new Date(m.created_at).getTime();
      if (m.direction === "inbound" && c.in === null) c.in = t;
      if (m.direction === "outbound" && c.in !== null && c.out === null) c.out = t;
      convFirst.set(m.conversation_id, c);
    }
    const diffs: number[] = [];
    for (const v of convFirst.values()) {
      if (v.in && v.out && v.out > v.in) diffs.push((v.out - v.in) / 1000);
    }
    const avgResponseSeconds = diffs.length
      ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length)
      : 0;

    // Latency buckets
    const latencyMap = new Map<string, number>();
    const bucketOrder = ["<30s", "30s-2m", "2-10m", "10-60m", "1-3h", ">3h"];
    for (const l of bucketOrder) latencyMap.set(l, 0);
    for (const s of diffs) latencyMap.set(bucketLabel(s), (latencyMap.get(bucketLabel(s)) ?? 0) + 1);
    const latencyBuckets = bucketOrder.map((label) => ({ label, count: latencyMap.get(label) ?? 0 }));

    // -------- Suggestions --------
    let aiSuggestions = 0;
    let aiAccepted = 0;
    const agentMap = new Map<
      string,
      { s: number; a: number; d: number; p: number; conf: number[]; prob: number[] }
    >();
    const intentMap = new Map<string, number>();
    const confBucketsAcc: { label: string; count: number; accepted: number }[] = [
      { label: "0-25%", count: 0, accepted: 0 },
      { label: "25-50%", count: 0, accepted: 0 },
      { label: "50-75%", count: 0, accepted: 0 },
      { label: "75-100%", count: 0, accepted: 0 },
    ];
    let confSum = 0;
    let confN = 0;

    for (const s of sugs) {
      aiSuggestions++;
      const dk = dayKey(s.created_at);
      const row = seriesMap.get(dk);
      if (row) row.suggestions++;
      const isAccepted = s.status === "used" || !!s.used_at;
      if (isAccepted) {
        aiAccepted++;
        if (row) row.accepted++;
      }
      const agent = s.agent_type || "sales";
      const a =
        agentMap.get(agent) ?? { s: 0, a: 0, d: 0, p: 0, conf: [], prob: [] };
      a.s++;
      if (isAccepted) a.a++;
      else if (s.status === "discarded") a.d++;
      else a.p++;
      if (typeof s.confidence === "number") a.conf.push(s.confidence);
      if (typeof s.probability === "number") a.prob.push(s.probability);
      agentMap.set(agent, a);

      if (s.intent) intentMap.set(s.intent, (intentMap.get(s.intent) ?? 0) + 1);
      if (typeof s.confidence === "number") {
        confSum += s.confidence;
        confN++;
        const b = confBucket(s.confidence);
        confBucketsAcc[b].count++;
        if (isAccepted) confBucketsAcc[b].accepted++;
      }
    }
    const acceptRate = aiSuggestions ? Math.round((aiAccepted / aiSuggestions) * 100) : 0;
    const avgConfidence = confN ? Math.round((confSum / confN) * 100) : 0;

    const agents = Array.from(agentMap.entries())
      .map(([agent_type, v]) => ({
        agent_type,
        suggestions: v.s,
        accepted: v.a,
        discarded: v.d,
        pending: v.p,
        accept_rate: v.s ? Math.round((v.a / v.s) * 100) : 0,
        avg_confidence: v.conf.length
          ? Math.round((v.conf.reduce((a, b) => a + b, 0) / v.conf.length) * 100)
          : 0,
        avg_probability: v.prob.length
          ? Math.round((v.prob.reduce((a, b) => a + b, 0) / v.prob.length) * 100)
          : 0,
      }))
      .sort((a, b) => b.suggestions - a.suggestions);

    const intents = Array.from(intentMap.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // -------- Automations --------
    const autoNameMap = new Map<string, string>();
    for (const a of autoRows) autoNameMap.set(a.id, a.name);
    const runMap = new Map<
      string,
      { runs: number; errors: number; ok: number; ms: number[] }
    >();
    let totalRuns = 0;
    let totalErrors = 0;
    for (const r of runs) {
      totalRuns++;
      const err = r.status === "error" || !!r.error;
      if (err) totalErrors++;
      const dk = dayKey(r.started_at);
      const row = seriesMap.get(dk);
      if (row) {
        row.runs++;
        if (err) row.errors++;
      }
      const m =
        runMap.get(r.automation_id) ?? { runs: 0, errors: 0, ok: 0, ms: [] };
      m.runs++;
      if (err) m.errors++;
      else m.ok++;
      if (typeof r.duration_ms === "number") m.ms.push(r.duration_ms);
      runMap.set(r.automation_id, m);
    }
    const automationErrorRate = totalRuns
      ? Math.round((totalErrors / totalRuns) * 100)
      : 0;

    const topAutomations = Array.from(runMap.entries())
      .map(([id, v]) => ({
        id,
        name: autoNameMap.get(id) ?? "Sin nombre",
        runs: v.runs,
        errors: v.errors,
        successRate: v.runs ? Math.round((v.ok / v.runs) * 100) : 0,
        avg_ms: v.ms.length ? Math.round(v.ms.reduce((a, b) => a + b, 0) / v.ms.length) : 0,
      }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 8);

    // -------- Knowledge --------
    const knowledgeCitations = usage.length;
    const docCount = new Map<string, number>();
    for (const u of usage) {
      if (!u.document_id) continue;
      docCount.set(u.document_id, (docCount.get(u.document_id) ?? 0) + 1);
      const dk = dayKey(u.created_at);
      const row = seriesMap.get(dk);
      if (row) row.citations++;
    }
    const docMeta = new Map<string, { name: string; last_used_at: string | null }>();
    for (const d of docsRows)
      docMeta.set(d.id, { name: d.title || d.name, last_used_at: d.last_used_at });
    const topDocuments = Array.from(docCount.entries())
      .map(([id, citations]) => ({
        id,
        name: docMeta.get(id)?.name ?? "Documento",
        citations,
        last_used_at: docMeta.get(id)?.last_used_at ?? null,
      }))
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 8);

    // -------- Conversations / operational --------
    const now = Date.now();
    let waitingTooLong = 0;
    let aiPaused = 0;
    for (const c of convs) {
      if (c.ai_paused) aiPaused++;
      if (c.last_message_at) {
        const age = (now - new Date(c.last_message_at).getTime()) / 3600_000;
        if (age > 1) waitingTooLong++;
      }
    }

    // -------- Insights: sentiment + hot leads --------
    const sentMap = new Map<string, number>();
    let hotLeads = 0;
    for (const i of insights) {
      if (i.sentiment)
        sentMap.set(i.sentiment, (sentMap.get(i.sentiment) ?? 0) + 1);
      if (typeof i.probability === "number" && i.probability >= 0.7) hotLeads++;
    }
    const sentiments = Array.from(sentMap.entries())
      .map(([sentiment, count]) => ({ sentiment, count }))
      .sort((a, b) => b.count - a.count);

    // -------- Sellers --------
    const senderMap = new Map<string, number>();
    for (const m of msgs)
      if (m.direction === "outbound" && m.sender_id)
        senderMap.set(m.sender_id, (senderMap.get(m.sender_id) ?? 0) + 1);
    const senderIds = Array.from(senderMap.keys());
    let sellers: AiAnalytics["sellers"] = [];
    if (senderIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", senderIds);
      const nameMap = new Map<string, string>();
      for (const p of profs ?? [])
        nameMap.set(p.id, (p.full_name as string) || (p.email as string) || "Miembro");
      sellers = Array.from(senderMap.entries())
        .map(([sender_id, out]) => ({
          sender_id,
          name: nameMap.get(sender_id) ?? "Miembro",
          outbound: out,
        }))
        .sort((a, b) => b.outbound - a.outbound)
        .slice(0, 8);
    }

    // -------- Deltas vs previous --------
    const prevMsgs = (msgsPrevRes.data ?? []) as any[];
    let prevOutbound = 0;
    let prevOutboundAi = 0;
    for (const m of prevMsgs) {
      if (m.direction === "outbound") {
        prevOutbound++;
        if (!m.sender_id) prevOutboundAi++;
      }
    }
    const prevAiShare = prevOutbound ? Math.round((prevOutboundAi / prevOutbound) * 100) : 0;
    const prevSugs = (sugsPrevRes.data ?? []) as any[];
    const prevAccepted = prevSugs.filter((s) => s.status === "used").length;
    const prevAcceptRate = prevSugs.length ? Math.round((prevAccepted / prevSugs.length) * 100) : 0;
    const prevRuns = (runsPrevRes.data ?? []) as any[];
    const prevErrs = prevRuns.filter((r) => r.status === "error").length;
    const prevErrRate = prevRuns.length ? Math.round((prevErrs / prevRuns.length) * 100) : 0;

    const pct = (cur: number, prev: number) =>
      prev === 0 ? (cur === 0 ? 0 : 100) : Math.round(((cur - prev) / prev) * 100);
    const diff = (cur: number, prev: number) => cur - prev;

    // -------- Alerts --------
    const alerts: AiAnalytics["alerts"] = [];
    if (waitingTooLong > 0)
      alerts.push({
        id: "waiting",
        kind: "waiting",
        title: `${waitingTooLong} conversación${waitingTooLong === 1 ? "" : "es"} sin respuesta >1h`,
        detail: "Requieren atención humana o revisión de IA",
        severity: waitingTooLong > 5 ? "critical" : "warning",
        href: "/conversaciones",
      });
    if (aiPaused > 0)
      alerts.push({
        id: "paused",
        kind: "ai_paused",
        title: `${aiPaused} conversación${aiPaused === 1 ? "" : "es"} con IA pausada`,
        detail: "Intervención manual activa — revisa si puede retomarse",
        severity: "info",
        href: "/conversaciones",
      });
    if (totalRuns > 0 && automationErrorRate >= 10)
      alerts.push({
        id: "auto-err",
        kind: "automation_errors",
        title: `Tasa de error de automatizaciones ${automationErrorRate}%`,
        detail: `${totalErrors} de ${totalRuns} ejecuciones fallaron`,
        severity: automationErrorRate >= 25 ? "critical" : "warning",
        href: "/automatizaciones",
      });
    if (aiSuggestions > 20 && avgConfidence < 55)
      alerts.push({
        id: "low-conf",
        kind: "low_confidence",
        title: `Confianza promedio ${avgConfidence}%`,
        detail: "La IA está dudando. Añade contexto en Conocimiento",
        severity: "warning",
        href: "/conocimiento",
      });
    if (aiSuggestions > 30 && knowledgeCitations === 0)
      alerts.push({
        id: "no-know",
        kind: "no_knowledge",
        title: "La IA no está citando documentos",
        detail: "Sube manuales o FAQ para respuestas más precisas",
        severity: "warning",
        href: "/conocimiento",
      });

    return {
      range,
      from: fromIso,
      to: toIso,
      totals: {
        outbound,
        outboundAi,
        outboundHuman,
        inbound,
        aiShare: outbound ? Math.round((outboundAi / outbound) * 100) : 0,
        aiSuggestions,
        aiAccepted,
        acceptRate,
        avgConfidence,
        avgResponseSeconds,
        automationRuns: totalRuns,
        automationErrors: totalErrors,
        automationErrorRate,
        knowledgeCitations,
        activeConversations: convs.length,
        aiPaused,
        waitingTooLong,
        hotLeads,
      },
      deltas: {
        outbound: pct(outbound, prevOutbound),
        aiShare: diff(
          outbound ? Math.round((outboundAi / outbound) * 100) : 0,
          prevAiShare,
        ),
        acceptRate: diff(acceptRate, prevAcceptRate),
        avgResponseSeconds: 0,
        automationErrorRate: diff(automationErrorRate, prevErrRate),
      },
      series: days.map((d) => seriesMap.get(d)!),
      agents,
      intents,
      sentiments,
      confidenceBuckets: confBucketsAcc,
      latencyBuckets,
      topAutomations,
      topDocuments,
      sellers,
      alerts,
    };
  });

// ---------- Suggestions feed for the module ----------

export const listAnalyticsSuggestions = createServerFn({ method: "POST" })
  .middleware(metricasMiddleware)
  .inputValidator((input: unknown) =>
    z
      .object({
        range: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]).default(30),
        agent_type: z.string().nullable().optional(),
        status: z.enum(["pending", "used", "discarded"]).nullable().optional(),
        search: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<SuggestionRow[]> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = profile?.company_id;
    if (!companyId) return [];

    const from = new Date(Date.now() - data.range * 86400_000).toISOString();
    let q = supabase
      .from("ai_suggestions")
      .select(
        "id, created_at, agent_type, status, intent, confidence, probability, text, conversation_id, customer_id, used_at, model",
      )
      .eq("company_id", companyId)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.agent_type) q = q.eq("agent_type", data.agent_type);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("text", `%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const custIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.customer_id).filter(Boolean)),
    ) as string[];
    const nameMap = new Map<string, string>();
    if (custIds.length) {
      const { data: custs } = await supabase
        .from("customers")
        .select("id, name, phone")
        .in("id", custIds);
      for (const c of custs ?? [])
        nameMap.set(c.id, (c.name as string) || (c.phone as string) || "Cliente");
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      agent_type: r.agent_type,
      status: r.status,
      intent: r.intent,
      confidence: r.confidence,
      probability: r.probability,
      text: r.text,
      conversation_id: r.conversation_id,
      customer_id: r.customer_id,
      customer_name: r.customer_id ? nameMap.get(r.customer_id) ?? null : null,
      used_at: r.used_at,
      model: r.model,
    }));
  });

// ---------- Feedback: mark suggestion outcome ----------

export const setSuggestionFeedback = createServerFn({ method: "POST" })
  .middleware(metricasMiddleware)
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        outcome: z.enum(["used", "discarded", "pending"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { status: data.outcome };
    if (data.outcome === "used") patch.used_at = new Date().toISOString();
    if (data.outcome !== "used") patch.used_at = null;
    const { error } = await supabase
      .from("ai_suggestions")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
