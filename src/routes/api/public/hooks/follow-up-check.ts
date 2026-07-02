import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/follow-up-check")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return Response.json({ error: "server_not_configured" }, { status: 500 });
        }

        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Companies with follow-up enabled
        const { data: companies } = await admin
          .from("companies")
          .select("id, follow_up_hours")
          .eq("follow_up_enabled", true);

        if (!companies?.length) return Response.json({ ok: true, checked: 0, created: 0 });

        let created = 0;
        let checked = 0;

        for (const company of companies) {
          const hours = Number((company as any).follow_up_hours ?? 24);
          const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
          const noteWindow = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

          // Conversations for this company with last inbound activity older than threshold
          const { data: convos } = await admin
            .from("conversations")
            .select("id, company_id, customer_id, last_message_at, status")
            .eq("company_id", (company as any).id)
            .neq("status", "closed")
            .lt("last_message_at", threshold)
            .limit(200);

          if (!convos?.length) continue;

          for (const convo of convos) {
            checked++;
            // Skip if last message was outbound (we already replied)
            const { data: lastMsg } = await admin
              .from("messages")
              .select("direction")
              .eq("conversation_id", (convo as any).id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (!lastMsg || (lastMsg as any).direction !== "inbound") continue;

            // Skip if a follow-up note was already created in this window
            const { data: existing } = await admin
              .from("conversation_notes")
              .select("id")
              .eq("conversation_id", (convo as any).id)
              .gte("created_at", noteWindow)
              .ilike("body", "%recontactar%")
              .limit(1)
              .maybeSingle();
            if (existing) continue;

            const { error } = await admin.from("conversation_notes").insert({
              conversation_id: (convo as any).id,
              company_id: (convo as any).company_id,
              author_id: null,
              body: `⏰ Sugerencia IA: el cliente lleva más de ${hours}h sin responder. Considera recontactar.`,
            });
            if (!error) created++;
          }
        }

        return Response.json({ ok: true, checked, created });
      },
    },
  },
});
