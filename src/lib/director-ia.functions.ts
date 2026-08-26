import { createServerFn } from "@tanstack/react-start";
import { requireCredits, withPremiumFeature } from "@/lib/plan-middleware";
import { normalizeStage } from "@/lib/pipeline";
import { log } from "@/lib/logger";

/**
 * Director Comercial IA — real backend.
 *
 * Aggregates data across conversations, customers, quotes, products and messages
 * to produce concrete, deep-linkable recommendations grouped by category.
 * Recommendations are persisted in `public.director_insights` so their status
 * (done / snoozed / dismissed) survives page reloads and sessions.
 */

import { callChat } from "@/lib/ai-router.server";

export type InsightCategory =
  | "contactar"
  | "productos"
  | "detenidas"
  | "objeciones"
  | "campanas"
  | "vendedores"
  | "hot"
  | "riesgo";

export type Severity = "info" | "warn" | "high" | "critical";
export type Status = "pending" | "done" | "snoozed" | "dismissed";

export type DirectorInsight = {
  id: string;
  category: InsightCategory;
  title: string;
  reason: string | null;
  benefit: string | null;
  potential_value: number;
  currency: string;
  severity: Severity;
  status: Status;
  ref_type: string | null;
  ref_id: string | null;
  action_to: string | null;
  action_search: Record<string, string>;
  meta: Record<string, any>;
  snooze_until: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectorSummary = {
  totals: {
    pending: number;
    done: number;
    snoozed: number;
    dismissed: number;
    risks: number;
  };
  potentialByCurrency: Record<string, number>;
  byCategory: Record<InsightCategory, number>;
  hasWhatsapp: boolean;
  lastComputedAt: string | null;
};

// -------------------------------- helpers --------------------------------

function fingerprint(category: InsightCategory, ref: string, extra = "") {
  return `${category}:${ref}${extra ? `:${extra}` : ""}`;
}

function elapsedLabel(iso: string | null | undefined): string {
  if (!iso) return "sin actividad";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function money(v: number, c: string) {
  return `${Number(v || 0).toLocaleString("es-ES")} ${c}`;
}

// ---------------------- listing / mutations ----------------------

const directorMiddleware = withPremiumFeature("director-ia");

export const listDirectorInsights = createServerFn({ method: "GET" })
  .middleware([...directorMiddleware])
  .inputValidator(
    (i: {
      status?: Status | "all";
      category?: InsightCategory | "all";
      search?: string | null;
      limit?: number;
    }) => i,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { rows: [] as DirectorInsight[] };

    let q = supabase
      .from("director_insights")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("severity", { ascending: false })
      .order("potential_value", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 300, 500));

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    else q = q.neq("status", "dismissed");

    if (data.category && data.category !== "all") q = q.eq("category", data.category);
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[%_]/g, "");
      q = q.or(`title.ilike.%${s}%,reason.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const now = Date.now();
    const cleaned = (rows ?? []).map((r: any) => {
      if (r.status === "snoozed" && r.snooze_until && new Date(r.snooze_until).getTime() < now) {
        r.status = "pending";
      }
      return r as DirectorInsight;
    });
    return { rows: cleaned };
  });

export const getDirectorSummary = createServerFn({ method: "GET" })
  .middleware([...directorMiddleware])
  .handler(async ({ context }): Promise<DirectorSummary> => {
    const { supabase, userId } = context;
    const empty: DirectorSummary = {
      totals: {
        pending: 0, done: 0, snoozed: 0, dismissed: 0, risks: 0,
      },
      potentialByCurrency: {},
      byCategory: {
        contactar: 0, productos: 0, detenidas: 0, objeciones: 0,
        campanas: 0, vendedores: 0, hot: 0, riesgo: 0,
      },
      hasWhatsapp: false,
      lastComputedAt: null,
    };
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return empty;

    const [{ data: rows }, { data: channel }] = await Promise.all([
      supabase
        .from("director_insights")
        .select("category, status, severity, potential_value, currency, updated_at")
        .eq("company_id", profile.company_id),
      supabase
        .from("whatsapp_channels")
        .select("status").eq("company_id", profile.company_id).maybeSingle(),
    ]);

    const s: DirectorSummary = { ...empty, potentialByCurrency: {}, byCategory: { ...empty.byCategory }, totals: { ...empty.totals } };
    s.hasWhatsapp = channel?.status === "connected";
    let lastAt = 0;
    for (const r of rows ?? []) {
      const st = r.status as Status;
      if (st in s.totals) (s.totals as any)[st] = ((s.totals as any)[st] ?? 0) + 1;
      if (st === "pending") {
        s.byCategory[r.category as InsightCategory] =
          (s.byCategory[r.category as InsightCategory] ?? 0) + 1;
        const val = Number(r.potential_value ?? 0);
        if (val > 0) {
          const cur = r.currency || "USD";
          s.potentialByCurrency[cur] = (s.potentialByCurrency[cur] ?? 0) + val;
        }
        if (r.severity === "high" || r.severity === "critical") s.totals.risks += 1;
      }
      const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      if (t > lastAt) lastAt = t;
    }
    s.lastComputedAt = lastAt ? new Date(lastAt).toISOString() : null;
    return s;
  });

export const updateInsightStatus = createServerFn({ method: "POST" })
  .middleware([...directorMiddleware])
  .inputValidator((i: { id: string; status: Status; snoozeHours?: number }) => i)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: any = { status: data.status };
    if (data.status === "snoozed") {
      const hours = Math.max(1, Math.min(data.snoozeHours ?? 24, 24 * 14));
      patch.snooze_until = new Date(Date.now() + hours * 3600_000).toISOString();
    } else {
      patch.snooze_until = null;
    }
    if (data.status === "done" || data.status === "dismissed") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = userId;
    } else {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }
    const { error } = await supabase.from("director_insights").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const bulkUpdateInsightStatus = createServerFn({ method: "POST" })
  .middleware([...directorMiddleware])
  .inputValidator((i: { ids: string[]; status: Status; snoozeHours?: number }) => i)
  .handler(async ({ context, data }) => {
    if (data.ids.length === 0) return { ok: true, count: 0 };
    const { supabase, userId } = context;
    const patch: any = { status: data.status };
    if (data.status === "snoozed") {
      const hours = Math.max(1, Math.min(data.snoozeHours ?? 24, 24 * 14));
      patch.snooze_until = new Date(Date.now() + hours * 3600_000).toISOString();
    } else patch.snooze_until = null;
    if (data.status === "done" || data.status === "dismissed") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = userId;
    } else {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }
    const { error } = await supabase.from("director_insights").update(patch).in("id", data.ids);
    if (error) throw error;
    return { ok: true, count: data.ids.length };
  });

// -------------------------- compute engine --------------------------

type InsightDraft = {
  category: InsightCategory;
  title: string;
  reason: string;
  benefit: string;
  potential_value?: number;
  currency?: string;
  severity?: Severity;
  ref_type?: string;
  ref_id?: string;
  action_to?: string;
  action_search?: Record<string, string>;
  fingerprintKey: string;
  meta?: Record<string, any>;
};

export const computeDirectorInsights = createServerFn({ method: "POST" })
  .middleware([...withPremiumFeature("director-ia"), requireCredits(1)])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { created: 0, updated: 0, closed: 0 };
    const companyId = profile.company_id;

    const now = Date.now();
    const weekAgo = new Date(now - 7 * 86400_000).toISOString();
    const thirtyAgo = new Date(now - 30 * 86400_000).toISOString();

    const [
      { data: convos },
      { data: customers },
      { data: quotes },
      { data: messages },
      { data: pcRows },
      { data: roles },
    ] = await Promise.all([
      supabase.from("conversations")
        .select("id, customer_id, status, last_message_at, assignee_id, ai_paused")
        .eq("company_id", companyId).eq("status", "open")
        .order("last_message_at", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("customers")
        .select("id, name, phone, stage, estimated_value, last_interaction_at, priority, tags")
        .eq("company_id", companyId).limit(2000),
      supabase.from("quotes")
        .select("id, customer_id, conversation_id, status, total, currency, sent_at, viewed_at, valid_until, created_at, number")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("messages")
        .select("conversation_id, direction, created_at, body")
        .eq("company_id", companyId).gte("created_at", weekAgo)
        .order("created_at", { ascending: false }).limit(4000),
      supabase.from("product_customers")
        .select("product_id, customer_id, context, created_at")
        .eq("company_id", companyId).gte("created_at", thirtyAgo).limit(1000),
      supabase.from("user_roles")
        .select("user_id").eq("company_id", companyId),
    ]);

    const convoList = convos ?? [];
    const customerList = customers ?? [];
    const quoteList = quotes ?? [];
    const msgs = messages ?? [];
    const pcList = pcRows ?? [];

    const customerById = new Map(customerList.map((c) => [c.id, c]));
    const conversationById = new Map(convoList.map((c) => [c.id, c]));

    // Last message per conversation
    const lastByConv = new Map<string, { direction: string; created_at: string; body: string | null }>();
    // All inbound bodies per conversation (last 7d)
    const inboundBodiesByConv = new Map<string, string[]>();
    for (const m of msgs) {
      if (!lastByConv.has(m.conversation_id)) {
        lastByConv.set(m.conversation_id, {
          direction: m.direction, created_at: m.created_at, body: m.body ?? null,
        });
      }
      if (m.direction === "inbound" && m.body) {
        const arr = inboundBodiesByConv.get(m.conversation_id) ?? [];
        arr.push(String(m.body).toLowerCase());
        inboundBodiesByConv.set(m.conversation_id, arr);
      }
    }

    const currency = quoteList[0]?.currency ?? "USD";
    const drafts: InsightDraft[] = [];

    // 1) CONTACTAR — mensajes entrantes sin respuesta
    const oneHour = 60 * 60_000;
    for (const c of convoList) {
      const last = lastByConv.get(c.id);
      if (last?.direction !== "inbound") continue;
      const waited = last.created_at ? now - new Date(last.created_at).getTime() : 0;
      if (waited < 15 * 60_000) continue; // ignora recientes
      const cust = customerById.get(c.customer_id);
      const severity: Severity = waited > 6 * oneHour ? "critical" : waited > 2 * oneHour ? "high" : "warn";
      drafts.push({
        category: "contactar",
        title: `Responde a ${cust?.name ?? cust?.phone ?? "cliente"}`,
        reason: `Mensaje entrante ${elapsedLabel(last.created_at)} sin respuesta. Etapa ${normalizeStage(cust?.stage)}.`,
        benefit: "Contactar en la primera hora aumenta la conversión hasta 3×.",
        potential_value: Number(cust?.estimated_value ?? 0),
        currency,
        severity,
        ref_type: "conversation",
        ref_id: c.id,
        action_to: "/",
        action_search: { conversationId: c.id },
        fingerprintKey: fingerprint("contactar", c.id),
        meta: { customer_id: c.customer_id, last_message_at: last.created_at },
      });
    }

    // 2) HOT — clientes con alta probabilidad (etapa avanzada + señales de compra recientes)
    const buySignal = /(comprar|comprarlo|comprarla|lo llevo|lo compro|listo|si me interesa|hagamos|cerremos|precio final|cu[aá]nto (queda|es)|c[oó]mo pago|dep[oó]sito|transfer|env[íi]o|cotizaci[oó]n)/i;
    for (const c of convoList) {
      const cust = customerById.get(c.customer_id);
      if (!cust) continue;
      const stage = normalizeStage(cust.stage);
      const bodies = inboundBodiesByConv.get(c.id) ?? [];
      const hits = bodies.filter((b) => buySignal.test(b)).length;
      const strong = hits >= 2 || (hits >= 1 && (stage === "cotizado" || stage === "negociando"));
      if (!strong) continue;
      drafts.push({
        category: "hot",
        title: `Cliente listo para cerrar: ${cust.name ?? cust.phone ?? "sin nombre"}`,
        reason: `${hits} señal(es) de intención de compra en los últimos 7 días. Etapa ${stage}.`,
        benefit: "Prioriza este chat para cerrar antes de que se enfríe.",
        potential_value: Number(cust.estimated_value ?? 0),
        currency,
        severity: "high",
        ref_type: "conversation",
        ref_id: c.id,
        action_to: "/",
        action_search: { conversationId: c.id },
        fingerprintKey: fingerprint("hot", c.id),
        meta: { customer_id: c.customer_id, hits },
      });
    }

    // 3) DETENIDAS — abiertas + sin actividad
    const STALL: Record<string, number> = { nuevo_lead: 2, interesado: 4, cotizado: 5, negociando: 7 };
    for (const cust of customerList) {
      const stage = normalizeStage(cust.stage);
      if (stage === "ganado" || stage === "perdido") continue;
      const daysAllowed = STALL[stage] ?? 5;
      const last = cust.last_interaction_at ? new Date(cust.last_interaction_at).getTime() : 0;
      if (!last) continue;
      const daysStalled = Math.floor((now - last) / 86400_000);
      if (daysStalled <= daysAllowed) continue;
      drafts.push({
        category: "detenidas",
        title: `Reactiva a ${cust.name ?? cust.phone ?? "cliente"}`,
        reason: `Sin interacción hace ${daysStalled} días en etapa ${stage}.`,
        benefit: "Un follow-up rápido recupera hasta el 20 % de estos leads.",
        potential_value: Number(cust.estimated_value ?? 0),
        currency,
        severity: daysStalled > daysAllowed * 2 ? "high" : "warn",
        ref_type: "customer",
        ref_id: cust.id,
        action_to: "/clientes/$id",
        action_search: { id: cust.id },
        fingerprintKey: fingerprint("detenidas", cust.id),
        meta: { days: daysStalled, stage },
      });
    }

    // 4) RIESGO — cotizaciones enviadas/vistas + próximas a vencer o sin respuesta
    for (const q of quoteList) {
      if (!["sent", "viewed"].includes(q.status)) continue;
      const sent = q.sent_at ? new Date(q.sent_at).getTime() : 0;
      const validUntil = q.valid_until ? new Date(q.valid_until).getTime() : 0;
      const stale = sent && now - sent > 3 * 86400_000;
      const expiringSoon = validUntil && validUntil - now < 3 * 86400_000 && validUntil > now;
      const expired = validUntil && validUntil <= now;
      if (!stale && !expiringSoon && !expired) continue;
      const cust = customerById.get(q.customer_id);
      const severity: Severity = expired ? "critical" : expiringSoon ? "high" : "warn";
      const label = expired
        ? "vencida"
        : expiringSoon
          ? `vence en ${Math.max(1, Math.round((validUntil - now) / 86400_000))} d`
          : `enviada ${elapsedLabel(q.sent_at)}`;
      drafts.push({
        category: "riesgo",
        title: `Cotización ${q.number ?? ""} en riesgo`.trim(),
        reason: `${cust?.name ?? "Cliente"} · ${label}. Total ${money(Number(q.total), q.currency)}.`,
        benefit: "Un empujón oportuno reactiva ~30 % de las cotizaciones pendientes.",
        potential_value: Number(q.total ?? 0),
        currency: q.currency,
        severity,
        ref_type: "quote",
        ref_id: q.id,
        action_to: "/cotizaciones/$id",
        action_search: { id: q.id },
        fingerprintKey: fingerprint("riesgo", q.id),
        meta: { status: q.status, stale, expired, expiringSoon },
      });
    }

    // 5) PRODUCTOS — top mencionados con conversión < esperada
    const productCounts = new Map<string, number>();
    for (const row of pcList) {
      productCounts.set(row.product_id, (productCounts.get(row.product_id) ?? 0) + 1);
    }
    const topIds = [...productCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    if (topIds.length > 0) {
      const { data: prods } = await supabase
        .from("products").select("id, name, price, currency, active, ai_recommendable, stock, track_stock")
        .in("id", topIds);
      for (const p of prods ?? []) {
        const mentions = productCounts.get(p.id) ?? 0;
        const lowStock = p.track_stock && typeof p.stock === "number" && p.stock <= 3;
        const paused = !p.ai_recommendable || !p.active;
        const reason = paused
          ? `Mencionado ${mentions} veces en 30 días, pero está ${!p.active ? "inactivo" : "pausado para IA"}.`
          : lowStock
            ? `Mencionado ${mentions} veces y solo quedan ${p.stock} unidades.`
            : `Top producto en conversaciones (${mentions} menciones en 30 días).`;
        drafts.push({
          category: "productos",
          title: `Potencia "${p.name}"`,
          reason,
          benefit: paused
            ? "Activarlo lo pone en las recomendaciones automáticas y cotizaciones IA."
            : "Impúlsalo en una campaña o destácalo en el próximo saludo.",
          potential_value: Number(p.price ?? 0) * mentions,
          currency: p.currency ?? currency,
          severity: paused || lowStock ? "warn" : "info",
          ref_type: "product",
          ref_id: p.id,
          action_to: "/catalogo",
          action_search: {},
          fingerprintKey: fingerprint("productos", p.id),
          meta: { mentions, lowStock, paused, price: p.price },
        });
      }
    }

    // 6) OBJECIONES — patrones detectados en mensajes entrantes
    const OBJ_PATTERNS: Record<string, RegExp> = {
      precio: /(caro|precio|descuento|oferta|promo|barato|econ[oó]mico)/i,
      tiempo: /(cu[aá]ndo|demora|tarda|entrega|tiempo de|env[íi]o.*(cu[aá]nto|d[íi]as))/i,
      garantia: /(garant[íi]a|devoluci[oó]n|reembolso|cambiar|garantiza)/i,
      confianza: /(rese[nñ]as?|opiniones?|confiar|estafa|verdad|serio)/i,
      pago: /(cuotas?|financia|tarjeta|plan de pago|transferencia|efectivo)/i,
    };
    const objCounts: Record<string, number> = {};
    for (const bodies of inboundBodiesByConv.values()) {
      for (const b of bodies) {
        for (const [k, rx] of Object.entries(OBJ_PATTERNS)) {
          if (rx.test(b)) objCounts[k] = (objCounts[k] ?? 0) + 1;
        }
      }
    }
    const objTop = Object.entries(objCounts).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
    for (const [k, n] of objTop) {
      const titles: Record<string, string> = {
        precio: "Objeción frecuente: precio",
        tiempo: "Objeción frecuente: tiempos de entrega",
        garantia: "Objeción frecuente: garantía y devoluciones",
        confianza: "Objeción frecuente: confianza / reseñas",
        pago: "Objeción frecuente: métodos de pago",
      };
      const benefits: Record<string, string> = {
        precio: "Prepara respuestas de valor y anclajes de descuento para acortar el cierre.",
        tiempo: "Publica tiempos de entrega estándar en un mensaje rápido reutilizable.",
        garantia: "Documenta la política y agrégala a la base de conocimiento.",
        confianza: "Agrega testimonios / reseñas al saludo inicial y ficha del producto.",
        pago: "Detalla métodos de pago aceptados en el catálogo y auto-respuestas.",
      };
      drafts.push({
        category: "objeciones",
        title: titles[k] ?? `Objeción frecuente: ${k}`,
        reason: `${n} conversaciones incluyeron esta objeción en los últimos 7 días.`,
        benefit: benefits[k] ?? "Prepara una respuesta y súbela a la base de conocimiento.",
        potential_value: 0,
        currency,
        severity: "info",
        ref_type: "campaign",
        ref_id: k,
        action_to: "/conocimiento",
        action_search: {},
        fingerprintKey: fingerprint("objeciones", k),
        meta: { count: n, pattern: k },
      });
    }

    // 7) CAMPAÑAS — segmentos ejecutables
    const wonRecent = customerList.filter((c) => normalizeStage(c.stage) === "ganado");
    if (wonRecent.length >= 3) {
      drafts.push({
        category: "campanas",
        title: `Repite compra: ${wonRecent.length} clientes ganados`,
        reason: "Cross-sell / recompra con base cerrada ya calificada.",
        benefit: "La recompra convierte 4× más que un lead nuevo.",
        potential_value: wonRecent.reduce((a, c) => a + Number(c.estimated_value ?? 0), 0),
        currency,
        severity: "info",
        ref_type: "campaign",
        ref_id: "won-repurchase",
        action_to: "/clientes",
        action_search: { segment: "ganado" },
        fingerprintKey: fingerprint("campanas", "won-repurchase"),
        meta: { count: wonRecent.length },
      });
    }
    const coldInterested = customerList.filter((c) => {
      const st = normalizeStage(c.stage);
      const last = c.last_interaction_at ? new Date(c.last_interaction_at).getTime() : 0;
      return (st === "interesado" || st === "nuevo_lead") && last > 0 && now - last > 21 * 86400_000;
    });
    if (coldInterested.length >= 5) {
      drafts.push({
        category: "campanas",
        title: `Reactivación: ${coldInterested.length} leads dormidos`,
        reason: "Leads calificados sin interacción > 3 semanas.",
        benefit: "Un mensaje segmentado despierta 8-12 % de esta base.",
        potential_value: coldInterested.reduce((a, c) => a + Number(c.estimated_value ?? 0), 0),
        currency,
        severity: "warn",
        ref_type: "campaign",
        ref_id: "cold-leads",
        action_to: "/clientes",
        action_search: {},
        fingerprintKey: fingerprint("campanas", "cold-leads"),
        meta: { count: coldInterested.length },
      });
    }

    // 8) VENDEDORES — assignees con carga alta o rezago
    const perAssignee = new Map<string, { open: number; unresponded: number }>();
    for (const c of convoList) {
      if (!c.assignee_id) continue;
      const rec = perAssignee.get(c.assignee_id) ?? { open: 0, unresponded: 0 };
      rec.open += 1;
      if (lastByConv.get(c.id)?.direction === "inbound") rec.unresponded += 1;
      perAssignee.set(c.assignee_id, rec);
    }
    const teamSize = Math.max(1, (roles ?? []).length);
    const avgOpen = convoList.length / teamSize;
    for (const [uid, rec] of perAssignee.entries()) {
      if (rec.unresponded >= 3 || rec.open > avgOpen * 2) {
        drafts.push({
          category: "vendedores",
          title: "Vendedor con sobrecarga",
          reason: `${rec.open} chats abiertos${rec.unresponded > 0 ? `, ${rec.unresponded} sin responder` : ""}.`,
          benefit: "Reasigna o apoya para que ninguna conversación se enfríe.",
          potential_value: 0,
          currency,
          severity: rec.unresponded >= 5 ? "high" : "warn",
          ref_type: "user",
          ref_id: uid,
          action_to: "/",
          action_search: {},
          fingerprintKey: fingerprint("vendedores", uid),
          meta: { open: rec.open, unresponded: rec.unresponded, avgOpen },
        });
      }
    }

    // -------------- persist (upsert + auto-close obsolete) --------------

    const now2 = new Date().toISOString();
    let created = 0, updated = 0;

    // Load existing pending fingerprints
    const { data: existing } = await supabase
      .from("director_insights")
      .select("id, fingerprint, status")
      .eq("company_id", companyId);
    const byFp = new Map<string, { id: string; status: Status }>();
    for (const r of existing ?? []) byFp.set(r.fingerprint, { id: r.id, status: r.status as Status });

    const seen = new Set<string>();
    for (const d of drafts) {
      const fp = `${companyId}:${d.fingerprintKey}`;
      seen.add(fp);
      const prev = byFp.get(d.fingerprintKey);
      const row = {
        company_id: companyId,
        category: d.category,
        title: d.title,
        reason: d.reason,
        benefit: d.benefit,
        potential_value: d.potential_value ?? 0,
        currency: d.currency ?? currency,
        severity: d.severity ?? "info",
        ref_type: d.ref_type ?? null,
        ref_id: d.ref_id ?? null,
        action_to: d.action_to ?? null,
        action_search: d.action_search ?? {},
        fingerprint: d.fingerprintKey,
        meta: d.meta ?? {},
      };
      if (prev) {
        // don't override user-resolved status; refresh content
        const patch: any = { ...row, updated_at: now2 };
        if (prev.status === "done" || prev.status === "dismissed") {
          // keep resolved
        }
        const { error } = await supabase.from("director_insights").update(patch).eq("id", prev.id);
        if (!error) updated += 1;
      } else {
        const { error } = await supabase.from("director_insights").insert(row);
        if (!error) created += 1;
      }
    }

    // Auto-close obsolete pending insights that no longer surface
    let closed = 0;
    for (const [fp, rec] of byFp.entries()) {
      if (seen.has(fp)) continue;
      if (rec.status !== "pending" && rec.status !== "snoozed") continue;
      const { error } = await supabase
        .from("director_insights")
        .update({ status: "done", resolved_at: now2, resolved_by: userId })
        .eq("id", rec.id);
      if (!error) closed += 1;
    }

    log.info("director-ia", "computed", {
      company_id: companyId, created, updated, closed, drafts: drafts.length,
    });
    return { created, updated, closed, total: drafts.length };
  });

// -------------------------- AI narrative briefing --------------------------

export const generateDirectorBriefing = createServerFn({ method: "POST" })
  .middleware([...withPremiumFeature("director-ia"), requireCredits(1)])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id, full_name").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { text: "" };

    const [{ data: pending }, { data: company }] = await Promise.all([
      supabase.from("director_insights")
        .select("category, title, reason, benefit, potential_value, currency, severity")
        .eq("company_id", profile.company_id).eq("status", "pending")
        .order("severity", { ascending: false })
        .order("potential_value", { ascending: false })
        .limit(20),
      supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle(),
    ]);
    const rows = pending ?? [];
    if (rows.length === 0) {
      return { text: "Sin recomendaciones activas ahora mismo. Tu operación está al día ✅" };
    }

    const hasAny =
      process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!hasAny) {
      // Fallback determinístico si no hay IA disponible
      const top = rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.title} — ${r.reason ?? ""}`).join("\n");
      return {
        text: `Prioridades del día para ${company?.name ?? "tu equipo"}:\n${top}`,
      };
    }

    const messages = [
      {
        role: "system" as const,
        content:
          "Eres el Director Comercial IA de una empresa que vende por WhatsApp. En 4-6 líneas, resume las prioridades del día para el dueño/gerente en español neutro, profesional y accionable. Sin viñetas de asteriscos. Usa emojis mínimos (máx 1 al inicio). Menciona el impacto y termina con la primera acción concreta a tomar hoy.",
      },
      {
        role: "user" as const,
        content:
          `Empresa: ${company?.name ?? "N/D"}. Recomendaciones pendientes:\n` +
          rows.map((r) =>
            `- [${r.severity}] (${r.category}) ${r.title}. Motivo: ${r.reason ?? "-"}. Beneficio: ${r.benefit ?? "-"}. Valor: ${Number(r.potential_value ?? 0).toLocaleString()} ${r.currency}.`,
          ).join("\n"),
      },
    ];

    try {
      const text = await callChat({
        tier: "hard", // Director Comercial IA → Claude (decisión crítica)
        scope: "director-briefing",
        companyId: profile.company_id,
        temperature: 0.5,
        messages,
      });
      return { text: text || "Prioridades listas. Revisa la lista de recomendaciones." };
    } catch (e) {
      log.error("director-ia", "briefing_failed", { err: (e as Error).message });
      return { text: "No pude generar el resumen ahora. Revisa la lista de recomendaciones." };
    }
  });
