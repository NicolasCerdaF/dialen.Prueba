import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION || "v21.0"}`;

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Public Meta config for the browser (App ID + Graph version) ----------
export const getMetaPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  const app_id = process.env.META_APP_ID;
  if (!app_id) throw new Error("Meta App ID no configurado");
  return {
    app_id,
    graph_version: process.env.META_GRAPH_API_VERSION || "v21.0",
  };
});

// ---------- Manual connect (kept as fallback) ----------
const ConnectInput = z.object({
  phone_number_id: z.string().min(1).max(64).regex(/^[0-9]+$/),
  business_account_id: z.string().min(1).max(64).regex(/^[0-9]+$/),
  access_token: z.string().min(20).max(4096),
  display_phone: z.string().min(3).max(32),
});

export const connectWhatsAppChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ConnectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("No se encontró la empresa");

    const meta = await fetch(
      `${GRAPH()}/${data.phone_number_id}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${data.access_token}` } },
    );
    if (!meta.ok) throw new Error(`Meta rechazó las credenciales (${meta.status})`);

    const verify_token = randomToken(24);
    const { error } = await supabase.from("whatsapp_channels").upsert(
      {
        company_id: profile.company_id,
        phone_number_id: data.phone_number_id,
        business_account_id: data.business_account_id,
        access_token: data.access_token,
        display_phone: data.display_phone,
        webhook_verify_token: verify_token,
        status: "connected",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "phone_number_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, verify_token };
  });

// ---------- Embedded Signup: exchange OAuth code & auto-wire everything ----------
const EmbeddedInput = z.object({
  code: z.string().min(10).max(2048),
  phone_number_id: z.string().min(1).max(64).regex(/^[0-9]+$/).optional(),
  waba_id: z.string().min(1).max(64).regex(/^[0-9]+$/).optional(),
});

export const connectWhatsAppEmbedded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EmbeddedInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new Error("Meta App no configurado en el servidor");

    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("No se encontró la empresa");

    // 1) Exchange code → user access_token
    const tokenRes = await fetch(
      `${GRAPH()}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(data.code)}`,
    );
    const tokenJson: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson?.access_token) {
      throw new Error(`No pudimos completar el login con Meta: ${tokenJson?.error?.message ?? tokenRes.status}`);
    }
    const accessToken: string = tokenJson.access_token;

    // 2) Resolve WABA + phone_number_id (use values from session_info_callback if provided)
    let wabaId = data.waba_id;
    let phoneNumberId = data.phone_number_id;

    if (!wabaId) {
      const wabasRes = await fetch(
        `${GRAPH()}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${appId}|${appSecret}`,
      );
      const wabasJson: any = await wabasRes.json().catch(() => ({}));
      const granular = wabasJson?.data?.granular_scopes ?? [];
      const wabaScope = granular.find((s: any) => s.scope === "whatsapp_business_management");
      wabaId = wabaScope?.target_ids?.[0];
    }
    if (!wabaId) throw new Error("No encontramos tu cuenta de WhatsApp Business en Meta");

    if (!phoneNumberId) {
      const phonesRes = await fetch(
        `${GRAPH()}/${wabaId}/phone_numbers`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const phonesJson: any = await phonesRes.json().catch(() => ({}));
      phoneNumberId = phonesJson?.data?.[0]?.id;
    }
    if (!phoneNumberId) throw new Error("No encontramos un número de WhatsApp en tu cuenta");

    // 3) Get display info for the phone
    const phoneRes = await fetch(
      `${GRAPH()}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const phoneJson: any = await phoneRes.json().catch(() => ({}));
    const displayPhone: string = phoneJson?.display_phone_number ?? "";

    // 4) Subscribe our app to the WABA so we receive webhooks
    await fetch(`${GRAPH()}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});

    // 5) Best-effort: register the phone for Cloud API
    await fetch(`${GRAPH()}/${phoneNumberId}/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin: "000000" }),
    }).catch(() => {});

    const verify_token = randomToken(24);
    const { error } = await supabase.from("whatsapp_channels").upsert(
      {
        company_id: profile.company_id,
        phone_number_id: phoneNumberId,
        business_account_id: wabaId,
        access_token: accessToken,
        display_phone: displayPhone || "WhatsApp Business",
        webhook_verify_token: verify_token,
        status: "connected",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "phone_number_id" },
    );
    if (error) throw new Error(error.message);

    return { ok: true, display_phone: displayPhone };
  });

// ---------- Disconnect ----------
export const disconnectWhatsAppChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("No se encontró la empresa");
    const { error } = await supabase
      .from("whatsapp_channels")
      .update({ status: "disconnected", access_token: null })
      .eq("company_id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Status ----------
export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) return { connected: false, display_phone: null as string | null };
    const { data: ch } = await supabase
      .from("whatsapp_channels")
      .select("status, display_phone")
      .eq("company_id", profile.company_id)
      .maybeSingle();
    return {
      connected: ch?.status === "connected",
      display_phone: ch?.display_phone ?? null,
    };
  });

// ---------- Send test message (no conversation needed) ----------
const TestInput = z.object({
  to: z.string().min(6).max(20).regex(/^\+?[0-9\s-]+$/),
  text: z.string().min(1).max(1000),
});

export const sendTestWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", userId).maybeSingle();
    if (!profile?.company_id) throw new Error("No se encontró la empresa");

    const { data: ch } = await supabase
      .from("whatsapp_channels")
      .select("phone_number_id, access_token, status")
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!ch?.access_token || ch.status !== "connected") {
      throw new Error("WhatsApp no está conectado");
    }

    const cleanTo = data.to.replace(/[^0-9]/g, "");
    const res = await fetch(`${GRAPH()}/${ch.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ch.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "text",
        text: { body: data.text, preview_url: false },
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `Error ${res.status}`);
    return { ok: true, wa_message_id: body?.messages?.[0]?.id ?? null };
  });

// ---------- Send message in an existing conversation ----------
const SendInput = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().min(1).max(4096),
});

export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: convo } = await supabase
      .from("conversations")
      .select("id, company_id, channel_id, customer_id, is_demo")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!convo) throw new Error("Conversación no encontrada");

    // Demo: solo persistir el mensaje, no llamar a Meta.
    if (convo.is_demo) {
      await supabase.from("messages").insert({
        conversation_id: convo.id,
        company_id: convo.company_id,
        direction: "outbound",
        body: data.text,
        status: "sent",
        sender_id: userId,
      });
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", convo.id);
      return { ok: true, wa_message_id: null, demo: true };
    }

    const [{ data: customer }, { data: channel }] = await Promise.all([
      supabase.from("customers").select("phone").eq("id", convo.customer_id).maybeSingle(),
      supabase
        .from("whatsapp_channels")
        .select("phone_number_id, access_token, status")
        .eq("id", convo.channel_id ?? "")
        .maybeSingle(),
    ]);

    if (!customer?.phone) throw new Error("Cliente sin teléfono");
    if (!channel?.access_token || !channel.phone_number_id || channel.status !== "connected") {
      throw new Error("Canal de WhatsApp no conectado");
    }

    const res = await fetch(`${GRAPH()}/${channel.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: customer.phone.replace(/^\+/, ""),
        type: "text",
        text: { body: data.text, preview_url: false },
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `Error ${res.status}`);

    const waId: string | undefined = body?.messages?.[0]?.id;
    await supabase.from("messages").insert({
      conversation_id: convo.id,
      company_id: convo.company_id,
      direction: "outbound",
      body: data.text,
      status: "sent",
      wa_message_id: waId ?? null,
      sender_id: userId,
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", convo.id);

    return { ok: true, wa_message_id: waId ?? null };
  });

// ---------- Pause / resume AI on a conversation ----------
const TogglePauseInput = z.object({
  conversation_id: z.string().uuid(),
  paused: z.boolean(),
});

export const toggleConversationAiPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TogglePauseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("conversations")
      .update({ ai_paused: data.paused })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true, paused: data.paused };
  });

// ============================================================
// PRODUCTION MODULE — Channel management, templates, metrics
// ============================================================

async function getCompanyChannel(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!profile?.company_id) throw new Error("No se encontró la empresa");
  const { data: ch } = await supabase
    .from("whatsapp_channels")
    .select("*")
    .eq("company_id", profile.company_id)
    .maybeSingle();
  return { company_id: profile.company_id as string, channel: ch };
}

// Full channel info (token redacted)
export const getWhatsAppChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel) return null;
    return {
      id: channel.id,
      status: channel.status,
      display_phone: channel.display_phone,
      phone_number_id: channel.phone_number_id,
      business_account_id: channel.business_account_id,
      webhook_verify_token: channel.webhook_verify_token,
      connected_at: channel.connected_at,
      updated_at: channel.updated_at,
      has_token: !!channel.access_token,
    };
  });

// Business profile from Meta Graph API
export const getWhatsAppBusinessProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.phone_number_id) return null;
    const res = await fetch(
      `${GRAPH()}/${channel.phone_number_id}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      { headers: { Authorization: `Bearer ${channel.access_token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Error ${res.status}`);
    return json?.data?.[0] ?? null;
  });

const ProfileInput = z.object({
  about: z.string().max(139).optional(),
  description: z.string().max(512).optional(),
  email: z.string().email().max(128).optional().or(z.literal("")),
  address: z.string().max(256).optional(),
  vertical: z.string().max(64).optional(),
  websites: z.array(z.string().url().max(256)).max(2).optional(),
});

export const updateWhatsAppBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.phone_number_id) throw new Error("Canal no conectado");
    const payload: any = { messaging_product: "whatsapp" };
    for (const k of Object.keys(data) as (keyof typeof data)[]) {
      const v = (data as any)[k];
      if (v !== undefined && v !== "") payload[k] = v;
    }
    const res = await fetch(`${GRAPH()}/${channel.phone_number_id}/whatsapp_business_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Error ${res.status}`);
    return { ok: true };
  });

// Phone number quality + status
export const getWhatsAppPhoneHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.phone_number_id) return null;
    const res = await fetch(
      `${GRAPH()}/${channel.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status,platform_type,throughput`,
      { headers: { Authorization: `Bearer ${channel.access_token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Error ${res.status}`);
    return json;
  });

// List message templates
export const listWhatsAppTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.business_account_id) return [];
    const res = await fetch(
      `${GRAPH()}/${channel.business_account_id}/message_templates?limit=100&fields=name,status,language,category,components,quality_score,id`,
      { headers: { Authorization: `Bearer ${channel.access_token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Error ${res.status}`);
    return (json?.data ?? []) as any[];
  });

const CreateTemplateInput = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo"),
  language: z.string().min(2).max(10),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  body: z.string().min(1).max(1024),
  footer: z.string().max(60).optional(),
});

export const createWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateTemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.business_account_id) throw new Error("Canal no conectado");
    const components: any[] = [{ type: "BODY", text: data.body }];
    if (data.footer) components.push({ type: "FOOTER", text: data.footer });
    const res = await fetch(`${GRAPH()}/${channel.business_account_id}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.name, language: data.language, category: data.category, components }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Error ${res.status}`);
    return { ok: true, id: json?.id };
  });

const DeleteTemplateInput = z.object({ name: z.string().min(1).max(64) });

export const deleteWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DeleteTemplateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.business_account_id) throw new Error("Canal no conectado");
    const res = await fetch(
      `${GRAPH()}/${channel.business_account_id}/message_templates?name=${encodeURIComponent(data.name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${channel.access_token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `Error ${res.status}`);
    return { ok: true };
  });

// Metrics — from local messages table (source of truth)
export const getWhatsAppMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { company_id } = await getCompanyChannel(context.supabase, context.userId);
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows } = await context.supabase
      .from("messages")
      .select("direction, status, created_at")
      .eq("company_id", company_id)
      .gte("created_at", since30)
      .limit(50000);
    const list = rows ?? [];
    const buckets = { d1: { in: 0, out: 0 }, d7: { in: 0, out: 0 }, d30: { in: 0, out: 0 } };
    const statusCount: Record<string, number> = {};
    const daily = new Map<string, { in: number; out: number }>();
    for (const m of list) {
      const t = m.created_at as string;
      const dir = m.direction as string;
      if (t >= since24h) buckets.d1[dir === "inbound" ? "in" : "out"]++;
      if (t >= since7) buckets.d7[dir === "inbound" ? "in" : "out"]++;
      buckets.d30[dir === "inbound" ? "in" : "out"]++;
      if (m.status) statusCount[m.status] = (statusCount[m.status] ?? 0) + 1;
      const day = t.slice(0, 10);
      const cur = daily.get(day) ?? { in: 0, out: 0 };
      cur[dir === "inbound" ? "in" : "out"]++;
      daily.set(day, cur);
    }
    const series = Array.from(daily.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, ...v }));
    return { buckets, statusCount, series, total30: list.length };
  });

// Recent messages activity feed
export const getRecentWhatsAppActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { company_id } = await getCompanyChannel(context.supabase, context.userId);
    const { data: msgs } = await context.supabase
      .from("messages")
      .select("id, direction, body, status, created_at, conversation_id, wa_message_id")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(30);
    return msgs ?? [];
  });

// Refresh channel info from Meta (re-fetch display phone etc.)
export const refreshWhatsAppChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel?.access_token || !channel.phone_number_id) throw new Error("Canal no conectado");
    const res = await fetch(
      `${GRAPH()}/${channel.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${channel.access_token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Token likely expired
      await context.supabase.from("whatsapp_channels").update({ status: "error" }).eq("id", channel.id);
      throw new Error(json?.error?.message ?? `Error ${res.status}`);
    }
    await context.supabase
      .from("whatsapp_channels")
      .update({
        display_phone: json?.display_phone_number ?? channel.display_phone,
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel.id);
    return { ok: true, meta: json };
  });

// Rotate webhook verify token
export const rotateWhatsAppVerifyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { channel } = await getCompanyChannel(context.supabase, context.userId);
    if (!channel) throw new Error("No hay canal");
    const verify_token = randomToken(24);
    const { error } = await context.supabase
      .from("whatsapp_channels")
      .update({ webhook_verify_token: verify_token })
      .eq("id", channel.id);
    if (error) throw new Error(error.message);
    return { ok: true, verify_token };
  });
