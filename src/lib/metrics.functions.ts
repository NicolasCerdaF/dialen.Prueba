import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DayPoint = { date: string; inbound: number; outbound: number };
type SellerRank = {
  sender_id: string;
  name: string;
  outbound: number;
};

export type DashboardMetrics = {
  // Conversaciones
  activeConversations: number;
  unrespondedConversations: number;
  aiPausedConversations: number;
  aiActiveConversations: number;
  unassignedConversations: number;
  waitingTooLong: number;
  // Mensajes
  inbound: number;
  outbound: number;
  outboundAi: number;
  outboundHuman: number;
  responseRate: number;
  avgResponseSeconds: number;
  // Clientes
  newCustomers: number;
  recurringCustomers: number;
  totalCustomers: number;
  vipCustomers: number;
  inactiveCustomers: number;
  // Equipo / IA
  teamMembers: number;
  channelConnected: boolean;
  aiSuggestions: number;
  aiAccepted: number;
  aiAvgConfidence: number;
  // Ventas (placeholders — módulo próximo)
  salesToday: number;
  salesMonth: number;
  ordersToday: number;
  ordersMonth: number;
  averageTicket: number;
  conversionRate: number;
  series: DayPoint[];
  sellers: SellerRank[];
};

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardMetrics> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    const empty: DashboardMetrics = {
      activeConversations: 0,
      unrespondedConversations: 0,
      aiPausedConversations: 0,
      aiActiveConversations: 0,
      inbound: 0,
      outbound: 0,
      outboundAi: 0,
      outboundHuman: 0,
      responseRate: 0,
      avgResponseSeconds: 0,
      newCustomers: 0,
      recurringCustomers: 0,
      totalCustomers: 0,
      teamMembers: 0,
      channelConnected: false,
      salesToday: 0,
      salesMonth: 0,
      ordersToday: 0,
      ordersMonth: 0,
      averageTicket: 0,
      conversionRate: 0,
      series: [],
      sellers: [],
    };
    if (!profile?.company_id) return empty;
    const companyId = profile.company_id;

    const since = new Date();
    since.setDate(since.getDate() - 29);
    const sinceIso = since.toISOString().slice(0, 10) + "T00:00:00.000Z";

    const [
      { data: msgs },
      { data: convos },
      { data: customers },
      { count: teamCount },
      { data: channel },
    ] = await Promise.all([
      supabase
        .from("messages")
        .select("direction, sender_id, created_at, conversation_id")
        .eq("company_id", companyId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(10000),
      supabase
        .from("conversations")
        .select("id, status, ai_paused, last_message_at, customer_id"),
      supabase
        .from("customers")
        .select("id, created_at"),
      supabase
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", companyId),
      supabase
        .from("whatsapp_channels")
        .select("status")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    const msgList = msgs ?? [];
    const convoList = convos ?? [];
    const customerList = customers ?? [];

    // Mensajes
    const inbound = msgList.filter((m) => m.direction === "inbound").length;
    const outboundAi = msgList.filter(
      (m) => m.direction === "outbound" && !m.sender_id,
    ).length;
    const outboundHuman = msgList.filter(
      (m) => m.direction === "outbound" && m.sender_id,
    ).length;
    const outbound = outboundAi + outboundHuman;
    const responseRate = inbound > 0 ? Math.round((outbound / inbound) * 100) : 0;

    // Tiempo promedio de respuesta: para cada mensaje inbound, buscar el
    // siguiente outbound de la misma conversación y medir la diferencia.
    const byConv = new Map<string, typeof msgList>();
    for (const m of msgList) {
      const arr = byConv.get(m.conversation_id) ?? [];
      arr.push(m);
      byConv.set(m.conversation_id, arr);
    }
    let totalMs = 0;
    let pairs = 0;
    for (const arr of byConv.values()) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].direction !== "inbound") continue;
        // Buscar próximo outbound
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j].direction === "outbound") {
            const diff =
              new Date(arr[j].created_at).getTime() -
              new Date(arr[i].created_at).getTime();
            if (diff >= 0 && diff < 24 * 60 * 60 * 1000) {
              totalMs += diff;
              pairs += 1;
            }
            break;
          }
        }
      }
    }
    const avgResponseSeconds = pairs > 0 ? Math.round(totalMs / pairs / 1000) : 0;

    // Conversaciones
    const activeConversations = convoList.filter((c) => c.status === "open").length;
    const aiPausedConversations = convoList.filter(
      (c) => c.status === "open" && c.ai_paused,
    ).length;
    const aiActiveConversations = activeConversations - aiPausedConversations;

    // Sin responder: última mensaje entrante en conversaciones abiertas
    const lastByConv = new Map<string, "inbound" | "outbound">();
    for (const m of msgList) {
      lastByConv.set(m.conversation_id, m.direction as "inbound" | "outbound");
    }
    const unrespondedConversations = convoList.filter(
      (c) => c.status === "open" && lastByConv.get(c.id) === "inbound",
    ).length;

    // Clientes
    const totalCustomers = customerList.length;
    const newCustomers = customerList.filter(
      (c) => new Date(c.created_at).getTime() >= since.getTime(),
    ).length;
    const convosPerCustomer = new Map<string, number>();
    for (const c of convoList) {
      convosPerCustomer.set(
        c.customer_id,
        (convosPerCustomer.get(c.customer_id) ?? 0) + 1,
      );
    }
    const recurringCustomers = Array.from(convosPerCustomer.values()).filter(
      (n) => n >= 2,
    ).length;

    // Serie 30 días
    const map = new Map<string, DayPoint>();
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, inbound: 0, outbound: 0 });
    }
    for (const m of msgList) {
      const key = m.created_at.slice(0, 10);
      const p = map.get(key);
      if (!p) continue;
      if (m.direction === "inbound") p.inbound += 1;
      else p.outbound += 1;
    }

    // Ranking vendedores (agentes humanos)
    const senderCount = new Map<string, number>();
    for (const m of msgList) {
      if (m.direction !== "outbound" || !m.sender_id) continue;
      senderCount.set(m.sender_id, (senderCount.get(m.sender_id) ?? 0) + 1);
    }
    let sellers: SellerRank[] = [];
    if (senderCount.size > 0) {
      const ids = Array.from(senderCount.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const nameById = new Map(
        (profiles ?? []).map((p) => [
          p.id,
          p.full_name ?? p.email ?? "Agente",
        ]),
      );
      sellers = Array.from(senderCount.entries())
        .map(([sender_id, outboundN]) => ({
          sender_id,
          name: nameById.get(sender_id) ?? "Agente",
          outbound: outboundN,
        }))
        .sort((a, b) => b.outbound - a.outbound)
        .slice(0, 10);
    }

    return {
      activeConversations,
      unrespondedConversations,
      aiPausedConversations,
      aiActiveConversations,
      inbound,
      outbound,
      outboundAi,
      outboundHuman,
      responseRate,
      avgResponseSeconds,
      newCustomers,
      recurringCustomers,
      totalCustomers,
      teamMembers: teamCount ?? 0,
      channelConnected: channel?.status === "connected",
      salesToday: 0,
      salesMonth: 0,
      ordersToday: 0,
      ordersMonth: 0,
      averageTicket: 0,
      conversionRate: 0,
      series: Array.from(map.values()),
      sellers,
    };
  });
