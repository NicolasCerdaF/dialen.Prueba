// Lógica de auto-respuesta de IA usada por el webhook de WhatsApp.
// IMPORTANTE: este archivo se importa SOLO desde rutas/servidor (webhook).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildSystemPrompt, type AiStyle } from "@/lib/ai-styles";
import { log } from "@/lib/logger";
import { fetchKnowledgeContext } from "@/lib/knowledge-rag.server";
import { callChat } from "@/lib/ai-router.server";

const HISTORY_LIMIT = 12;

type AdminClient = ReturnType<typeof createClient<Database>>;

export async function maybeAutoReply(opts: {
  supabase: AdminClient;
  conversationId: string;
  companyId: string;
  channelId: string | null;
  customerPhone: string;
  graphBase: string;
}): Promise<void> {
  try {
    const { supabase, conversationId, companyId, channelId, customerPhone, graphBase } = opts;

    // 0) ¿Conversación pausada?
    const { data: convo } = await supabase
      .from("conversations")
      .select("ai_paused")
      .eq("id", conversationId)
      .maybeSingle();
    if (convo?.ai_paused) return;

    // 1) Settings + channel + recent history en paralelo
    const [companyRes, channelRes, historyRes] = await Promise.all([
      supabase
        .from("companies")
        .select("name, ai_response_style, ai_auto_reply, ai_custom_prompt")
        .eq("id", companyId)
        .maybeSingle(),
      channelId
        ? supabase
            .from("whatsapp_channels")
            .select("phone_number_id, access_token, status")
            .eq("id", channelId)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
      supabase
        .from("messages")
        .select("direction, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);

    const company = companyRes.data;
    if (!company?.ai_auto_reply) return; // auto-reply OFF
    const channel = channelRes.data;
    if (!channel?.access_token || channel.status !== "connected" || !channel.phone_number_id) return;


    const history = (historyRes.data ?? []).slice().reverse();
    if (history.length === 0) return;

    // 2) Construye prompt + mensajes
    let system = buildSystemPrompt({
      style: (company.ai_response_style ?? "cercano") as AiStyle,
      companyName: company.name,
      customPrompt: company.ai_custom_prompt,
    });

    // 2b) RAG: recupera contexto de la base de conocimiento con el último mensaje del cliente
    const lastInbound = [...history].reverse().find((m) => m.direction === "inbound")?.body ?? "";
    if (lastInbound) {
      const context = await fetchKnowledgeContext({
        supabase,
        companyId,
        query: lastInbound,
        limit: 4,
        conversationId,
      });
      if (context) {
        system += `\n\n---\nCONTEXTO DE LA EMPRESA (usa esta información como fuente de verdad si aplica; no la inventes):\n${context}`;
      }
    }

    const messages = [
      { role: "system", content: system },
      ...history.map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.body ?? "",
      })),
    ];

    // 3) Llama al router de IA (Gemini por defecto para auto-reply)
    let reply = "";
    try {
      reply = await callChat({
        tier: "fast",
        scope: "ai-reply",
        companyId,
        messages: messages as any,
      });
    } catch (e) {
      log.error("ai-reply", "ai_gateway_failed", { company_id: companyId, err: e });
      return; // fail-safe: no auto-reply, chat keeps working
    }
    if (!reply) return;

    // 4) Enviar por WhatsApp Cloud API
    const toClean = customerPhone.replace(/^\+/, "").replace(/[^0-9]/g, "");
    let sendRes: Response;
    try {
      sendRes = await fetch(`${graphBase}/${channel.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toClean,
          type: "text",
          text: { body: reply, preview_url: false },
        }),
      });
    } catch (e) {
      log.error("ai-reply", "whatsapp_send_network", { company_id: companyId, err: e });
      return;
    }
    const sendJson: any = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      log.error("ai-reply", "whatsapp_send_error", {
        company_id: companyId,
        status: sendRes.status,
        error_code: sendJson?.error?.code ?? null,
      });
      return;
    }
    const waId: string | undefined = sendJson?.messages?.[0]?.id;

    // 5) Persistir mensaje saliente (sender_id null = IA)
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      company_id: companyId,
      direction: "outbound",
      body: reply,
      status: "sent",
      wa_message_id: waId ?? null,
      sender_id: null,
    });

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  } catch (e) {
    log.error("ai-reply", "uncaught", { err: e });
  }
}
