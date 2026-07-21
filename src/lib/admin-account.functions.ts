import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@admin.dialen.local`;
}

export const createAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(32)
          .regex(USERNAME_RE, "Solo letras, números, punto, guion o guion bajo"),
        password: z.string().min(8).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.trim().toLowerCase();
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
