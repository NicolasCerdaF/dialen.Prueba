// Server-only. Shared handler for the NovaCorp provisioning endpoint.
// Exposed via two routes: /functions/v1/public-admin-provision (canonical)
// and /api/public/admin-provision (alias).

import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log } from "@/lib/logger";

const VALID_PLANS = new Set(["basico", "premium"]);
const LOGIN_REDIRECT = "https://dialen.novacorp.app";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Novacorp-Signature",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function logCall(fields: {
  action: string;
  email?: string | null;
  plan?: string | null;
  external_ref?: string | null;
  ip?: string | null;
  ok: boolean;
  status_code: number;
  message?: string | null;
  payload?: unknown;
}) {
  try {
    await supabaseAdmin.from("provision_log").insert({
      action: fields.action,
      email: fields.email ?? null,
      plan: fields.plan ?? null,
      external_ref: fields.external_ref ?? null,
      ip: fields.ip ?? null,
      ok: fields.ok,
      status_code: fields.status_code,
      message: fields.message ?? null,
      payload: (fields.payload as object) ?? null,
    });
  } catch (err) {
    log.error("provision", "log_failed", { err });
  }
}

type ProvisionBody = {
  action?: string;
  user_email?: string;
  user_name?: string;
  plan?: string;
  external_ref?: string;
  metadata?: Record<string, unknown>;
};

async function findUserByEmail(email: string) {
  // Search auth users by email (paginated). For low volume this is fine.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const normalized = email.trim().toLowerCase();
  return data.users.find((u) => (u.email ?? "").toLowerCase() === normalized) ?? null;
}

async function findProfileByExternalRef(externalRef: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email, plan, status, external_ref")
    .eq("external_ref", externalRef)
    .maybeSingle();
  return data;
}

async function generateMagicLink(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: LOGIN_REDIRECT },
    });
    if (error) {
      log.warn("provision", "magic_link_failed", { err: error.message });
      return null;
    }
    return data.properties?.action_link ?? null;
  } catch (err) {
    log.warn("provision", "magic_link_error", { err });
    return null;
  }
}

export async function handleProvisionRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const secret = process.env.DIALEN_PROVISION_SECRET;
  if (!secret) {
    log.error("provision", "missing_secret");
    return json(500, { ok: false, error: "internal_error", detail: "missing_secret" });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-novacorp-signature");
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;

  if (!verifySignature(rawBody, signature, secret)) {
    await logCall({ action: "unknown", ip, ok: false, status_code: 401, message: "bad_signature" });
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: ProvisionBody;
  try {
    body = rawBody ? (JSON.parse(rawBody) as ProvisionBody) : {};
  } catch {
    await logCall({ action: "unknown", ip, ok: false, status_code: 400, message: "invalid_json" });
    return json(400, { ok: false, error: "invalid_payload", detail: "invalid_json" });
  }

  const action = body.action;
  const email = body.user_email?.trim().toLowerCase();
  const plan = body.plan?.trim();
  const externalRef = body.external_ref?.trim();

  try {
    if (action === "provision_account") {
      if (!email) return badField("user_email", action, ip, body);
      if (!plan || !VALID_PLANS.has(plan)) {
        await logCall({ action, email, plan, external_ref: externalRef, ip, ok: false, status_code: 400, message: "invalid_plan", payload: body });
        return json(400, { ok: false, error: "invalid_plan", detail: `plan must be one of ${[...VALID_PLANS].join(", ")}` });
      }

      // Idempotency: same external_ref already provisioned
      if (externalRef) {
        const existingByRef = await findProfileByExternalRef(externalRef);
        if (existingByRef) {
          // Ensure plan matches request (no downgrade guard here — just apply)
          if (existingByRef.plan !== plan || existingByRef.status !== "active") {
            await supabaseAdmin
              .from("profiles")
              .update({ plan, status: "active" })
              .eq("id", existingByRef.id);
          }
          const link = await generateMagicLink(existingByRef.email ?? email);
          await logCall({ action, email, plan, external_ref: externalRef, ip, ok: true, status_code: 200, message: "idempotent", payload: body });
          return json(200, {
            ok: true,
            status: "activated",
            user_id: existingByRef.id,
            plan,
            login_url: link,
          });
        }
      }

      let user = await findUserByEmail(email);
      if (!user) {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: body.user_name ?? email.split("@")[0],
            ...(body.metadata ?? {}),
          },
        });
        if (createErr || !created.user) {
          await logCall({ action, email, plan, external_ref: externalRef, ip, ok: false, status_code: 500, message: createErr?.message ?? "create_failed", payload: body });
          return json(500, { ok: false, error: "internal_error", detail: createErr?.message ?? "create_failed" });
        }
        user = created.user;
      }

      // handle_new_user trigger populated profiles on insert. Update plan / ref.
      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({
          plan,
          status: "active",
          external_ref: externalRef ?? null,
        })
        .eq("id", user.id);
      if (updErr) {
        // If profile row doesn't exist yet for some reason, insert minimal one.
        await supabaseAdmin.from("profiles").upsert({
          id: user.id,
          email,
          full_name: body.user_name ?? email.split("@")[0],
          plan,
          status: "active",
          external_ref: externalRef ?? null,
        });
      }

      const loginUrl = await generateMagicLink(email);
      await logCall({ action, email, plan, external_ref: externalRef, ip, ok: true, status_code: 200, message: "activated", payload: body });
      return json(200, {
        ok: true,
        status: "activated",
        user_id: user.id,
        plan,
        login_url: loginUrl,
      });
    }

    if (action === "deactivate_account") {
      if (!email) return badField("user_email", action, ip, body);
      const user = await findUserByEmail(email);
      if (!user) {
        await logCall({ action, email, external_ref: externalRef, ip, ok: false, status_code: 404, message: "user_not_found", payload: body });
        return json(404, { ok: false, error: "user_not_found" });
      }
      await supabaseAdmin
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", user.id);
      await logCall({ action, email, external_ref: externalRef, ip, ok: true, status_code: 200, message: "deactivated", payload: body });
      return json(200, { ok: true, status: "deactivated", user_id: user.id });
    }

    if (action === "change_plan") {
      if (!email) return badField("user_email", action, ip, body);
      if (!plan || !VALID_PLANS.has(plan)) {
        await logCall({ action, email, plan, external_ref: externalRef, ip, ok: false, status_code: 400, message: "invalid_plan", payload: body });
        return json(400, { ok: false, error: "invalid_plan" });
      }
      const user = await findUserByEmail(email);
      if (!user) {
        await logCall({ action, email, plan, external_ref: externalRef, ip, ok: false, status_code: 404, message: "user_not_found", payload: body });
        return json(404, { ok: false, error: "user_not_found" });
      }
      await supabaseAdmin
        .from("profiles")
        .update({ plan, status: "active", external_ref: externalRef ?? undefined })
        .eq("id", user.id);
      await logCall({ action, email, plan, external_ref: externalRef, ip, ok: true, status_code: 200, message: "plan_changed", payload: body });
      return json(200, { ok: true, status: "plan_changed", user_id: user.id, plan });
    }

    await logCall({ action: action ?? "unknown", email, plan, external_ref: externalRef, ip, ok: false, status_code: 400, message: "invalid_action", payload: body });
    return json(400, { ok: false, error: "invalid_payload", detail: "unknown action" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("provision", "handler_error", { err, action });
    await logCall({ action: action ?? "unknown", email, plan, external_ref: externalRef, ip, ok: false, status_code: 500, message, payload: body });
    return json(500, { ok: false, error: "internal_error", detail: message });
  }
}

async function badField(field: string, action: string, ip: string | null, body: unknown) {
  await logCall({ action, ip, ok: false, status_code: 400, message: `missing_${field}`, payload: body });
  return json(400, { ok: false, error: "missing_field", detail: field });
}
