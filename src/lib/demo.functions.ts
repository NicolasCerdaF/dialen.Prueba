// Modo demo: el usuario simula ser un cliente y la IA responde sin Meta.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSystemPrompt, type AiStyle } from "@/lib/ai-styles";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
const DEMO_PHONE = "+demo";

const Input = z.object({ text: z.string().min(1).max(2000) });

export const simulateInboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("Empresa no encontrada");
    const companyId = profile.company_id;

    // Customer demo (uno por empresa)
    let customerId: string | undefined;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("phone", DEMO_PHONE)
      .maybeSingle();
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newC, error } = await supabase
        .from("customers")
        .insert({ company_id: companyId, phone: DEMO_PHONE, name: "Cliente demo" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      customerId = newC.id;
    }

    // Conversación demo abierta
    let convoId: string | undefined;
    const { data: existingConvo } = await supabase
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .eq("customer_id", customerId!)
      .eq("is_demo", true)
      .eq("status", "open")
      .maybeSingle();
    if (existingConvo) {
      convoId = existingConvo.id;
    } else {
      const { data: newConvo, error } = await supabase
        .from("conversations")
        .insert({
          company_id: companyId,
          customer_id: customerId!,
          is_demo: true,
          status: "open",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convoId = newConvo.id;
    }

    // Insertar mensaje inbound
    await supabase.from("messages").insert({
      conversation_id: convoId!,
      company_id: companyId,
      direction: "inbound",
      body: data.text,
      status: "delivered",
    });

    // Cargar settings + historial
    const [{ data: company }, { data: history }] = await Promise.all([
      supabase
        .from("companies")
        .select("name, ai_response_style, ai_custom_prompt")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("messages")
        .select("direction, body, created_at")
        .eq("conversation_id", convoId!)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const messages = (history ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.body ?? "",
      }));

    const system = buildSystemPrompt({
      style: (company?.ai_response_style ?? "cercano") as AiStyle,
      companyName: company?.name,
      customPrompt: company?.ai_custom_prompt,
    });

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("La IA no está configurada");

    const aiRes = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) throw new Error("La IA está saturada. Reintenta en 1 minuto.");
      if (aiRes.status === 402) throw new Error("Sin créditos de IA. Recarga en Ajustes.");
      throw new Error(`IA falló (${aiRes.status}): ${t.slice(0, 200)}`);
    }
    const aiJson: any = await aiRes.json();
    const reply: string = aiJson?.choices?.[0]?.message?.content?.trim() ?? "(sin respuesta)";

    await supabase.from("messages").insert({
      conversation_id: convoId!,
      company_id: companyId,
      direction: "outbound",
      body: reply,
      status: "sent",
    });

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", convoId!);

    return { conversation_id: convoId!, reply };
  });

export const resetDemoConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { ok: true };

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("company_id", profile.company_id)
      .eq("phone", DEMO_PHONE)
      .maybeSingle();
    if (!customer) return { ok: true };

    const { data: convos } = await supabase
      .from("conversations")
      .select("id")
      .eq("company_id", profile.company_id)
      .eq("customer_id", customer.id)
      .eq("is_demo", true);

    for (const c of convos ?? []) {
      await supabase.from("messages").delete().eq("conversation_id", c.id);
      await supabase.from("conversations").delete().eq("id", c.id);
    }
    return { ok: true };
  });
