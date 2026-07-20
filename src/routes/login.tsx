import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Iniciar sesión — Dialen" }] }),
  component: LoginPage,
});

const AUTH_ERROR_ES: Array<[RegExp, string]> = [
  [/password is known to be weak/i, "La contraseña es demasiado débil. Elige una más segura (mezcla mayúsculas, números y símbolos)."],
  [/password should be at least/i, "La contraseña debe tener al menos 6 caracteres."],
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Debes confirmar tu correo antes de iniciar sesión."],
  [/user already registered/i, "Este correo ya está registrado. Inicia sesión."],
  [/email rate limit exceeded/i, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."],
  [/invalid email/i, "El correo ingresado no es válido."],
  [/signup is disabled/i, "El registro está deshabilitado temporalmente."],
  [/network|failed to fetch/i, "Error de conexión. Verifica tu internet e inténtalo de nuevo."],
];

function translateAuthError(message: string): string {
  for (const [re, es] of AUTH_ERROR_ES) if (re.test(message)) return es;
  return message;
}

function LoginPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/", replace: true });
  }, [session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#020617] px-6 py-10 selection:bg-cyan-500/30">
      {/* Ambient aurora glows */}
      <div className="pointer-events-none absolute -top-[10%] -left-[10%] h-[55%] w-[55%] rounded-full bg-cyan-900/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-[10%] -right-[10%] h-[55%] w-[55%] rounded-full bg-indigo-900/25 blur-[120px]" />

      {/* Back link */}
      <Link
        to="/"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio
      </Link>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo header */}
        <div className="mb-10 flex flex-col items-center">
          <div className="group relative mb-4">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 opacity-30 blur transition duration-1000 group-hover:opacity-60" />
            <div className="relative rounded-2xl border border-white/10 bg-[#0F172A] p-4">
              <MessageSquare className="h-10 w-10 text-cyan-400" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white">Dialen</h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-500/80">
            by Nova Corp
          </p>
        </div>

        {/* Login Card */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          {/* Internal top glow */}
          <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" />

          <div className="space-y-6">
            <div className="space-y-1.5 text-center">
              <h2 className="font-display text-xl font-semibold text-white">Bienvenido de vuelta</h2>
              <p className="text-sm text-slate-400">Ingresa a tu panel de ventas con IA</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <label className="ml-1 block text-xs font-medium text-slate-300">
                  Correo corporativo
                </label>
                <input
                  required
                  type="email"
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="block text-xs font-medium text-slate-300">Contraseña</label>
                </div>
                <input
                  required
                  type="password"
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 transition-all focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-cyan-500 px-4 py-3 font-display font-semibold text-slate-950 transition-all hover:bg-cyan-400 disabled:opacity-60"
              >
                <span>{busy ? "Ingresando..." : "Entrar al panel"}</span>
                {!busy && (
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    strokeWidth={2.5}
                  />
                )}
              </button>
            </form>

            <div className="pt-2 text-center">
              <p className="text-xs text-slate-500">
                ¿Necesitas una cuenta?{" "}
                <span className="font-medium text-slate-300">
                  Contacta a tu ejecutivo de NovaCorp.
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer status pill */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
              Impulsado por IA comercial
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
