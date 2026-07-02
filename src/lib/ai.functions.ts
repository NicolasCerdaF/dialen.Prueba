import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_STYLES, buildSystemPrompt, type AiStyle } from "@/lib/ai-styles";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

async function callAi(opts: {
  system: string;
  user: string;
  model?: string;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("La IA no está configurada en el servidor");
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("La IA está saturada. Intenta de nuevo en 1 minuto.");
    if (res.status === 402) throw new Error("Sin créditos de IA. Recarga en Configuración.");
    throw new Error(`IA falló (${res.status}): ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  return json?.choices?.[0]?.message?.content?.trim() ?? "";
}

// ---------- Read AI settings ----------
export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("No se encontró la empresa");
    const { data } = await supabase
      .from("companies")
      .select("ai_response_style, ai_auto_reply, ai_custom_prompt, name, follow_up_enabled, follow_up_hours")
      .eq("id", profile.company_id)
      .maybeSingle();
    return {
      style: (data?.ai_response_style ?? "cercano") as AiStyle,
      autoReply: Boolean(data?.ai_auto_reply),
      customPrompt: data?.ai_custom_prompt ?? "",
      companyName: data?.name ?? null,
      followUpEnabled: Boolean((data as any)?.follow_up_enabled),
      followUpHours: Number((data as any)?.follow_up_hours ?? 24),
    };
  });

// ---------- Save AI settings ----------
const SaveInput = z.object({
  style: z.enum(["formal", "cercano", "vendedor", "soporte"]),
  autoReply: z.boolean(),
  customPrompt: z.string().max(2000).optional().nullable(),
});

export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("No se encontró la empresa");
    const { error } = await supabase
      .from("companies")
      .update({
        ai_response_style: data.style,
        ai_auto_reply: data.autoReply,
        ai_custom_prompt: data.customPrompt ?? null,
      })
      .eq("id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Preview a reply in the chosen style ----------
const PreviewInput = z.object({
  style: z.enum(["formal", "cercano", "vendedor", "soporte"]),
  message: z.string().min(1).max(500).optional(),
});

export const previewAiReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => PreviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    const { data: company } = profile?.company_id
      ? await supabase
          .from("companies")
          .select("name, ai_custom_prompt")
          .eq("id", profile.company_id)
          .maybeSingle()
      : { data: null as any };

    const system = buildSystemPrompt({
      style: data.style,
      companyName: company?.name ?? null,
      customPrompt: company?.ai_custom_prompt ?? null,
    });
    const userMsg = data.message?.trim() || "Hola, ¿tienen disponibilidad mañana por la tarde?";
    try {
      const text = await callAi({ system, user: userMsg });
      return { text };
    } catch (e: any) {
      // Fallback al ejemplo estático si falla la IA
      return { text: AI_STYLES[data.style].example, error: e?.message ?? null };
    }
  });
