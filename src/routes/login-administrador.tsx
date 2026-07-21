import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import dialenLogo from "@/assets/dialen-isotipo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isPlatformAdmin } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/login-administrador")({
  head: () => ({ meta: [{ title: "Ingreso administrador — Dialen" }] }),
  component: AdminLoginPage,
});

const AUTH_ERROR_ES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Debes confirmar tu correo antes de iniciar sesión."],
  [/invalid email/i, "El correo ingresado no es válido."],
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const requestReset = async () => {
    if (!email) {
      toast.error("Escribe tu correo administrador para enviarte el enlace.");
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Te enviamos un correo con el enlace para crear tu contraseña.");
    } catch (err) {
      toast.error(translateAuthError(err instanceof Error ? err.message : "Error"));
    } finally {
      setSendingReset(false);
    }
  };

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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      toast.error(translateAuthError(err instanceof Error ? err.message : "Error"));
    } finally {
      setBusy(false);
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

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="ml-1 block text-xs font-semibold text-slate-300">
                Correo administrador
              </label>
              <input
                required
                type="email"
                placeholder="admin@novacorp.app"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 block text-xs font-semibold text-slate-300">Contraseña</label>
              <input
                required
                type="password"
                minLength={6}
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
                <span className="bg-transparent px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Crear cuenta
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={requestReset}
              disabled={sendingReset}
              className="w-full rounded-xl border border-amber-300/30 bg-amber-400/5 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-400/10 disabled:opacity-60"
            >
              {sendingReset ? "Enviando enlace..." : "Crear contraseña de administrador"}
            </button>
            <p className="text-center text-[11px] text-slate-500">
              Te enviaremos un enlace al correo para definir una contraseña nueva.
            </p>
          </form>


          <div className="mt-6 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-center text-xs text-slate-400">
            Si necesitas entrar a una cuenta cliente, usa el inicio de sesión normal.
          </div>
        </div>
      </div>
    </div>
  );
}