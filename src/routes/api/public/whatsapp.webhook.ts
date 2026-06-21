import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { maybeAutoReply } from "@/lib/ai-reply.server";

const GRAPH_BASE = () =>
  `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v21.0"}`;

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Supabase env missing");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type WaMessage = {
  from: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string };
  document?: { id?: string; filename?: string };
};

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta verification handshake
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token) {
          return new Response("forbidden", { status: 403 });
        }
        const supabase = admin();
        const { data } = await supabase
          .from("whatsapp_channels")
          .select("id")
          .eq("webhook_verify_token", token)
          .maybeSingle();
        if (!data) return new Response("forbidden", { status: 403 });
        return new Response(challenge ?? "", { status: 200 });
      },

      POST: async ({ request }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const supabase = admin();

        try {
          for (const entry of payload?.entry ?? []) {
            for (const change of entry?.changes ?? []) {
              const value = change?.value ?? {};
              const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
              if (!phoneNumberId) continue;

              const { data: channel } = await supabase
                .from("whatsapp_channels")
                .select("id, company_id")
                .eq("phone_number_id", phoneNumberId)
                .maybeSingle();
              if (!channel) continue;

              const contacts: Array<{ wa_id: string; profile?: { name?: string } }> =
                value?.contacts ?? [];
              const contactByPhone = new Map(contacts.map((c) => [c.wa_id, c]));

              const messages: WaMessage[] = value?.messages ?? [];
              for (const m of messages) {
                const phone = `+${m.from}`;
                const contact = contactByPhone.get(m.from);
                const name = contact?.profile?.name ?? null;

                // Upsert customer
                const { data: customer } = await supabase
                  .from("customers")
                  .upsert(
                    { company_id: channel.company_id, phone, name },
                    { onConflict: "company_id,phone" },
                  )
                  .select("id")
                  .single();
                if (!customer) continue;

                // Find or create conversation
                let convoId: string | undefined;
                const { data: existing } = await supabase
                  .from("conversations")
                  .select("id")
                  .eq("company_id", channel.company_id)
                  .eq("customer_id", customer.id)
                  .eq("status", "open")
                  .maybeSingle();
                if (existing) {
                  convoId = existing.id;
                } else {
                  const { data: newConvo } = await supabase
                    .from("conversations")
                    .insert({
                      company_id: channel.company_id,
                      customer_id: customer.id,
                      channel_id: channel.id,
                      status: "open",
                    })
                    .select("id")
                    .single();
                  convoId = newConvo?.id;
                }
                if (!convoId) continue;

                const body =
                  m.type === "text"
                    ? m.text?.body ?? ""
                    : m.type === "image"
                      ? m.image?.caption ?? "[imagen]"
                      : m.type === "audio"
                        ? "[audio]"
                        : m.type === "document"
                          ? `[documento] ${m.document?.filename ?? ""}`
                          : `[${m.type}]`;

                const { error: msgErr } = await supabase.from("messages").insert({
                  conversation_id: convoId,
                  company_id: channel.company_id,
                  direction: "inbound",
                  body,
                  status: "delivered",
                  wa_message_id: m.id,
                });
                // Ignore duplicate inserts (unique on wa_message_id)
                if (msgErr && !msgErr.message?.includes("duplicate")) {
                  console.error("[wa] insert message error", msgErr);
                }

                await supabase
                  .from("conversations")
                  .update({
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", convoId);

                // Trigger AI auto-reply (no bloquea el webhook si falla)
                await maybeAutoReply({
                  supabase,
                  conversationId: convoId,
                  companyId: channel.company_id,
                  channelId: channel.id,
                  customerPhone: phone,
                  graphBase: GRAPH_BASE(),
                });
              }

              // Status updates (delivered/read) — best effort
              const statuses: Array<{ id: string; status: string }> = value?.statuses ?? [];
              for (const s of statuses) {
                if (!s?.id) continue;
                const status =
                  s.status === "read"
                    ? "read"
                    : s.status === "delivered"
                      ? "delivered"
                      : s.status === "sent"
                        ? "sent"
                        : s.status === "failed"
                          ? "failed"
                          : null;
                if (!status) continue;
                await supabase
                  .from("messages")
                  .update({ status: status as any })
                  .eq("wa_message_id", s.id);
              }
            }
          }
          return new Response("ok", { status: 200 });
        } catch (e) {
          console.error("[wa webhook] error", e);
          // Always 200 to prevent Meta retries storm; we logged the error
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});
