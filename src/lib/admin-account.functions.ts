import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const EMAIL_USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

export function normalizeAdminUsername(username: string): string {
  return username.trim().replace(/\s+/g, " ");
}

export function usernameToSlug(username: string): string {
  return normalizeAdminUsername(username)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/[._-]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);
}

export function isValidAdminUsername(username: string): boolean {
  const clean = normalizeAdminUsername(username);
  const slug = usernameToSlug(clean);
  return clean.length >= 3 && clean.length <= 40 && EMAIL_USERNAME_RE.test(slug);
}

export function usernameToEmail(username: string): string {
  return `${usernameToSlug(username)}@admin.dialen.local`;
}

export const createAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: z
          .string()
          .transform(normalizeAdminUsername)
          .refine(isValidAdminUsername, "Escribe al menos 3 letras o números. Puedes usar espacios."),
        password: z.string().min(8).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = normalizeAdminUsername(data.username);
    const email = usernameToEmail(username);

    // If user already exists, block creation (they should sign in instead).
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      throw new Error("Ese nombre de usuario ya está en uso.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: username, admin_username: username },
    });
    if (error || !created?.user) {
      throw new Error(error?.message ?? "No se pudo crear la cuenta");
    }

    const { error: adminErr } = await supabaseAdmin
      .from("platform_admins")
      .upsert({ user_id: created.user.id, note: `Creado vía login-administrador (${username})` });
    if (adminErr) throw new Error(adminErr.message);

    return { ok: true, username };
  });
