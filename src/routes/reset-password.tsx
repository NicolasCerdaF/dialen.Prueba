import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import dialenLogo from "@/assets/dialen-isotipo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nueva contraseña — Dialen" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and emits PASSWORD_RECOVERY / SIGNED_IN.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada. Inicia sesión de nuevo.");
      await supabase.auth.signOut();
      navigate({ to: "/login-administrador", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#070a12] px-6 py-10">
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-amber-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -right-28 bottom-0 h-[460px] w-[460px] rounded-full bg-emerald-500/10 blur-[140px]" />

      <Link
        to="/login-administrador"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio de sesión
      </Link>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={dialenLogo.url} alt="Dialen" className="mb-5 h-24 w-24 object-contain" />
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            <KeyRound className="h-3.5 w-3.5" />
            Nueva contraseña
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-white">
            Crea tu contraseña
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Ingresa una contraseña nueva para tu cuenta administrador.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-amber-400/15 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          {!ready ? (
            <p className="text-center text-sm text-slate-400">
              Abre este enlace desde el correo de recuperación que te enviamos. Si ya lo abriste, espera unos segundos...
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <label className="ml-1 block text-xs font-semibold text-slate-300">
                  Nueva contraseña
                </label>
                <input
                  required
                  type="password"
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
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
                  placeholder="Repite la contraseña"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 font-display font-semibold text-slate-950 transition hover:bg-amber-200 disabled:opacity-60"
              >
                <span>{busy ? "Guardando..." : "Guardar contraseña"}</span>
                {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
