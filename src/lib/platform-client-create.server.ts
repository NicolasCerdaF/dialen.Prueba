import type { SupabaseClient } from "@supabase/supabase-js";
import { applySevenDayTrialToCompany } from "@/lib/billing-period.server";
import { setCompanyPlanUnified, type PlanId } from "@/lib/plans.server";

export type AdminCreateClientInput = {
  email: string;
  fullName: string;
  companyName: string;
  plan: PlanId;
  sevenDayTrial: boolean;
};

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!";
}

async function findUserByEmail(supabase: SupabaseClient, email: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const normalized = email.trim().toLowerCase();
  return data.users.find((u) => (u.email ?? "").toLowerCase() === normalized) ?? null;
}

async function ensureCompanyForUser(
  supabase: SupabaseClient,
  userId: string,
  input: AdminCreateClientInput,
): Promise<string> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("company_id, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (prof?.company_id) {
    await supabase.from("companies").update({ name: input.companyName }).eq("id", prof.company_id);
    await setCompanyPlanUnified(supabase, prof.company_id, input.plan, { profileStatus: "active" });
    return prof.company_id;
  }

  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let companyId = existingCompany?.id as string | undefined;
  if (!companyId) {
    const { data: created, error } = await supabase
      .from("companies")
      .insert({ name: input.companyName, owner_id: userId, plan: input.plan })
      .select("id")
      .single();
    if (error || !created?.id) throw new Error(error?.message ?? "No se pudo crear la empresa");
    companyId = created.id;
  }

  if (prof) {
    await supabase
      .from("profiles")
      .update({
        company_id: companyId,
        full_name: input.fullName,
        plan: input.plan,
        status: "active",
      })
      .eq("id", userId);
  } else {
    await supabase.from("profiles").insert({
      id: userId,
      email: input.email,
      full_name: input.fullName,
      company_id: companyId,
      plan: input.plan,
      status: "active",
    });
  }

  const { error: roleErr } = await supabase.from("user_roles").insert({
    user_id: userId,
    company_id: companyId,
    role: "admin",
  });
  if (roleErr && roleErr.code !== "23505") throw new Error(roleErr.message);

  await setCompanyPlanUnified(supabase, companyId, input.plan, { profileStatus: "active" });
  return companyId;
}

export async function adminCreateClientAccount(
  supabase: SupabaseClient,
  input: AdminCreateClientInput,
) {
  const email = input.email.trim().toLowerCase();
  if (await findUserByEmail(supabase, email)) {
    throw new Error("Ya existe un usuario con ese correo");
  }

  const password = randomPassword();
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? "No se pudo crear el usuario");
  }

  const userId = created.user.id;
  const companyId = await ensureCompanyForUser(supabase, userId, input);

  let trialEndsAt: string | null = null;
  let billingAnchorAt: string | null = null;
  if (input.sevenDayTrial) {
    const trial = await applySevenDayTrialToCompany(supabase, companyId);
    trialEndsAt = trial.trialEndsAt;
    billingAnchorAt = trial.billingAnchorAt;
  }

  return {
    ok: true as const,
    userId,
    companyId,
    email,
    password,
    plan: input.plan,
    sevenDayTrial: input.sevenDayTrial,
    trialEndsAt,
    billingAnchorAt,
  };
}
