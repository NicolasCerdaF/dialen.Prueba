// Server-only. Shared handler for the NovaCorp provisioning endpoint.
// Exposed via two routes: /functions/v1/public-admin-provision (canonical)
// and /api/public/admin-provision (alias).

import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log } from "@/lib/logger";
import { applySevenDayTrialToCompany } from "@/lib/billing-period.server";
import { setUserPlanUnified, type PlanId } from "@/lib/plans.server";

const VALID_PLANS = new Set(["basico", "premium"]);
const LOGIN_REDIRECT = "https://dialen.novacorp.app";
const LOGIN_URL = "https://dialen.novacorp.app/login";

// activate_client accepts external plan names and maps to internal IDs.
const EXTERNAL_PLAN_MAP: Record<string, "basico" | "premium"> = {
  start: "basico",
  business: "premium",
};
const ALLOWED_ACTIVATOR_ROLES = new Set([
  "ceo",
  "admin",
  "operaciones",
  "ops_implementacion_onboarding",
]);

async function syncProvisionedPlan(
  userId: string,
  plan: PlanId,
  opts?: { externalRef?: string | null },
) {
  await setUserPlanUnified(supabaseAdmin, userId, plan, {
    profileStatus: "active",
    externalRef: opts?.externalRef ?? undefined,
  });
}

async function maybeApplySevenDayTrial(userId: string, enabled: boolean) {
  if (!enabled) return null;
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (!prof?.company_id) return null;
  return applySevenDayTrialToCompany(supabaseAdmin, prof.company_id);
}

// Simple in-memory rate limiter (per worker instance): 10 req / 60s per key.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateBuckets = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (bucket.length >= RATE_MAX) {
    rateBuckets.set(key, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return false;
}

function generateTempPassword(): string {
  // 14 chars, guarantees upper + lower + digit + symbol.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i] % set.length];
  const chars = [
    pick(upper, 0),
    pick(lower, 1),
    pick(digits, 2),
    pick(symbols, 3),
    ...Array.from({ length: 10 }, (_, i) => pick(all, i + 4)),
  ];
  // Fisher-Yates shuffle with fresh entropy
  const shuf = new Uint8Array(chars.length);
  crypto.getRandomValues(shuf);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuf[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

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
      payload: (fields.payload ?? null) as never,
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
  phone?: string;
  metadata?: Record<string, unknown>;
  requested_by?: { email?: string; role?: string };
  /** When true: 7 days free with full plan credits, then monthly billing from trial end. */
  seven_day_trial?: boolean;
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
            await syncProvisionedPlan(existingByRef.id, plan as PlanId, { externalRef });
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

      // handle_new_user trigger populated profiles on insert. Sync plan across company + team.
      await syncProvisionedPlan(user.id, plan as PlanId, { externalRef: externalRef ?? null });
      const trial =
        body.seven_day_trial === true || body.metadata?.seven_day_trial === true
          ? await maybeApplySevenDayTrial(user.id, true)
          : null;

      const loginUrl = await generateMagicLink(email);
      await logCall({ action, email, plan, external_ref: externalRef, ip, ok: true, status_code: 200, message: "activated", payload: body });
      return json(200, {
        ok: true,
        status: "activated",
        user_id: user.id,
        plan,
        login_url: loginUrl,
        trial_ends_at: trial?.trialEndsAt ?? null,
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
      await syncProvisionedPlan(user.id, plan as PlanId, { externalRef: externalRef ?? null });
      await logCall({ action, email, plan, external_ref: externalRef, ip, ok: true, status_code: 200, message: "plan_changed", payload: body });
      return json(200, { ok: true, status: "plan_changed", user_id: user.id, plan });
    }

    if (action === "activate_client") {
      const ua = request.headers.get("user-agent") ?? null;
      const requesterEmail = body.requested_by?.email?.trim().toLowerCase() ?? null;
      const requesterRole = body.requested_by?.role?.trim() ?? null;
      const rawPlan = body.plan?.trim().toLowerCase();
      const auditPayload = { ...body, _ip: ip, _ua: ua };

      if (!email) return badField("user_email", action, ip, auditPayload);
      if (!rawPlan) return badField("plan", action, ip, auditPayload);

      const mappedPlan = EXTERNAL_PLAN_MAP[rawPlan];
      if (!mappedPlan) {
        await logCall({ action, email, plan: rawPlan, external_ref: externalRef, ip, ok: false, status_code: 400, message: "invalid_plan", payload: auditPayload });
        return json(400, { ok: false, error: "invalid_plan", detail: "plan must be 'start' or 'business'" });
      }

      if (!requesterRole || !ALLOWED_ACTIVATOR_ROLES.has(requesterRole)) {
        await logCall({ action, email, plan: mappedPlan, external_ref: externalRef, ip, ok: false, status_code: 403, message: "forbidden_role", payload: auditPayload });
        return json(403, { ok: false, error: "forbidden_role" });
      }

      const rateKey = `activate_client:${ip ?? "noip"}:${requesterEmail ?? "noemail"}`;
      if (rateLimited(rateKey)) {
        await logCall({ action, email, plan: mappedPlan, external_ref: externalRef, ip, ok: false, status_code: 429, message: "rate_limited", payload: auditPayload });
        return json(429, { ok: false, error: "rate_limited" });
      }

      // Idempotency by external_ref: reactivate & switch plan, do NOT reissue password.
      if (externalRef) {
        const existingByRef = await findProfileByExternalRef(externalRef);
        if (existingByRef) {
          await syncProvisionedPlan(existingByRef.id, mappedPlan, { externalRef });
          await logCall({ action, email: existingByRef.email ?? email, plan: mappedPlan, external_ref: externalRef, ip, ok: true, status_code: 200, message: "idempotent", payload: auditPayload });
          return json(200, {
            ok: true,
            created: false,
            user_email: existingByRef.email ?? email,
            plan: rawPlan,
            login_url: LOGIN_URL,
            external_ref: externalRef,
            activated_at: new Date().toISOString(),
          });
        }
      }

      const tempPassword = generateTempPassword();
      const existing = await findUserByEmail(email);
      let created = false;
      let userId: string;

      if (!existing) {
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: body.user_name ?? email.split("@")[0],
            phone: body.phone ?? null,
          },
        });
        if (createErr || !newUser.user) {
          await logCall({ action, email, plan: mappedPlan, external_ref: externalRef, ip, ok: false, status_code: 500, message: createErr?.message ?? "create_failed", payload: auditPayload });
          return json(500, { ok: false, error: "internal_error", detail: createErr?.message ?? "create_failed" });
        }
        userId = newUser.user.id;
        created = true;
      } else {
        const { error: updUserErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: tempPassword,
          email_confirm: true,
          ban_duration: "none",
        });
        if (updUserErr) {
          await logCall({ action, email, plan: mappedPlan, external_ref: externalRef, ip, ok: false, status_code: 500, message: updUserErr.message, payload: auditPayload });
          return json(500, { ok: false, error: "internal_error", detail: updUserErr.message });
        }
        userId = existing.id;
      }

      await syncProvisionedPlan(userId, mappedPlan, { externalRef: externalRef ?? null });
      const trial =
        body.seven_day_trial === true || body.metadata?.seven_day_trial === true
          ? await maybeApplySevenDayTrial(userId, true)
          : null;

      const activatedAt = new Date().toISOString();
      // NOTE: temp_password is intentionally NOT included in payload/message.
      await logCall({ action, email, plan: mappedPlan, external_ref: externalRef, ip, ok: true, status_code: 200, message: created ? "created" : "reactivated", payload: auditPayload });

      return json(200, {
        ok: true,
        created,
        user_email: email,
        plan: rawPlan,
        temp_password: tempPassword,
        login_url: LOGIN_URL,
        external_ref: externalRef ?? null,
        activated_at: activatedAt,
        trial_ends_at: trial?.trialEndsAt ?? null,
      });
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
