import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import dialenLogo from "@/assets/dialen-isotipo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { createAdminAccount, usernameToEmail } from "@/lib/admin-account.functions";
import { useAuth } from "@/lib/auth-context";
import { isPlatformAdmin } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/login-administrador")({
  head: () => ({ meta: [{ title: "Ingreso administrador — Dialen" }] }),
  component: AdminLoginPage,
});

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/i;

const AUTH_ERROR_ES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "Usuario o contraseña incorrectos."],
  [/email not confirmed/i, "Debes confirmar tu cuenta antes de iniciar sesión."],
  [/network|failed to fetch/i, "Error de conexión. Verifica tu internet e inténtalo de nuevo."],
];

function translateAuthError(message: string): string {
  for (const [re, es] of AUTH_ERROR_ES) if (re.test(message)) return es;
  return message;
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const checkAdmin = useServerFn(isPlatformAdmin);
  const createAccount = useServerFn(createAdminAccount);

  const [mode, setMode] = useState<"login" | "create">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session) return;
    (async () => {
      try {
        const res = await checkAdmin();
        if (cancelled) return;
        if (res?.isAdmin) {
          navigate({ to: "/administrador", replace: true });
          return;
        }
        await supabase.auth.signOut();
        if (!cancelled) toast.error("Esta sesión no pertenece a un administrador.");
      } catch {
        await supabase.auth.signOut();
        if (!cancelled) toast.error("No se pudo verificar el acceso administrador.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, checkAdmin, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const clean = username.trim().toLowerCase();
      if (!USERNAME_RE.test(clean)) {
        throw new Error("Nombre de usuario inválido.");
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(clean),
        password,
      });
      if (error) throw error;
    } catch (err) {
      toast.error(translateAuthError(err instanceof Error ? err.message : "Error"));
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = newUsername.trim().toLowerCase();
    if (!USERNAME_RE.test(clean)) {
      toast.error("Usuario: 3-32 caracteres (letras, números, . _ -).");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setCreating(true);
    try {
      await createAccount({ data: { username: clean, password: newPassword } });
      toast.success("Cuenta creada. Iniciando sesión…");
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(clean),
        password: newPassword,
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#070a12] px-6 py-10 selection:bg-amber-400/30">
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-amber-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-28 bottom-0 h-[460px] w-[460px] rounded-full bg-emerald-500/10 blur-[140px]" />

      <Link
        to="/"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio
      </Link>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div className="absolute -inset-4 rounded-[34px] bg-amber-400/20 blur-2xl" />
            <img
              src={dialenLogo.url}
              alt="Dialen"
              className="relative h-32 w-32 object-contain drop-shadow-[0_0_28px_rgba(251,191,36,0.35)]"
            />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Acceso NovaCorp
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-white">
            Panel administrador
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Ingresa solo con una cuenta autorizada para administrar clientes, créditos y métricas.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-amber-400/15 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />

          {mode === "login" ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <label className="ml-1 block text-xs font-semibold text-slate-300">
                  Nombre de usuario
                </label>
                <input
                  required
                  type="text"
                  autoComplete="username"
                  placeholder="admin"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <div className="space-y-2">
                <label className="ml-1 block text-xs font-semibold text-slate-300">Contraseña</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-display font-semibold text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
              >
                <span>{busy ? "Verificando acceso..." : "Entrar como administrador"}</span>
                {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#0d1019] px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Primera vez
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewUsername(username);
                  setMode("create");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-400/15"
              >
                <UserPlus className="h-4 w-4" />
                Crear cuenta
              </button>
            </form>
          ) : (
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-amber-300/20 p-2 text-amber-200">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-semibold text-white">
                      Crear cuenta administradora
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Elige un nombre de usuario y una contraseña. No se requiere correo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 block text-xs font-semibold text-slate-300">
                  Nombre de usuario
                </label>
                <input
                  required
                  type="text"
                  autoComplete="username"
                  placeholder="ej. nicolas"
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
                <p className="ml-1 text-[11px] text-slate-500">
                  3–32 caracteres · letras, números, punto, guion o guion bajo
                </p>
              </div>

              <div className="space-y-2">
                <label className="ml-1 block text-xs font-semibold text-slate-300">Contraseña</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <div className="space-y-2">
                <label className="ml-1 block text-xs font-semibold text-slate-300">
                  Confirmar contraseña
                </label>
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-display font-semibold text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
              >
                <span>{creating ? "Creando cuenta..." : "Crear cuenta"}</span>
                {!creating && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </button>

              <button
                type="button"
                onClick={() => setMode("login")}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10"
              >
                Ya tengo cuenta, iniciar sesión
              </button>
            </form>
          )}

          <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-center text-xs text-slate-400">
            Si necesitas entrar a una cuenta cliente, usa el inicio de sesión normal.
          </div>
        </div>
      </div>
    </div>
  );
}
