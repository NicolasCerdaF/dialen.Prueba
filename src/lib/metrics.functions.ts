import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DayPoint = { date: string; inbound: number; outbound: number };

export const getDashboardMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const empty = {
      inbound: 0,
      outboundAi: 0,
      outboundHuman: 0,
      responseRate: 0,
      activeConversations: 0,
      series: [] as DayPoint[],
    };
    if (!profile?.company_id) return empty;

    const since = new Date();
    since.setDate(since.getDate() - 29);
    const sinceIso = since.toISOString().slice(0, 10) + "T00:00:00.000Z";

    const [{ data: msgs }, { count: activeConvos }] = await Promise.all([
      supabase
        .from("messages")
        .select("direction, sender_id, created_at")
        .eq("company_id", profile.company_id)
        .gte("created_at", sinceIso)
        .limit(5000),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("status", "open"),
    ]);

    const list = msgs ?? [];
    const inbound = list.filter((m) => m.direction === "inbound").length;
    const outboundAi = list.filter((m) => m.direction === "outbound" && !m.sender_id).length;
    const outboundHuman = list.filter((m) => m.direction === "outbound" && m.sender_id).length;
    const outboundTotal = outboundAi + outboundHuman;
    const responseRate = inbound > 0 ? Math.round((outboundTotal / inbound) * 100) : 0;

    // Serie 30 días
    const map = new Map<string, DayPoint>();
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, inbound: 0, outbound: 0 });
    }
    for (const m of list) {
      const key = m.created_at.slice(0, 10);
      const p = map.get(key);
      if (!p) continue;
      if (m.direction === "inbound") p.inbound += 1;
      else p.outbound += 1;
    }

    return {
      inbound,
      outboundAi,
      outboundHuman,
      responseRate,
      activeConversations: activeConvos ?? 0,
      series: Array.from(map.values()),
    };
  });
