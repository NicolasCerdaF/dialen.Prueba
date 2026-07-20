import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>
        <div className="mb-8 flex flex-col items-center justify-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary">
            <Sparkles className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="text-center leading-tight">
            <div className="font-display text-2xl font-semibold">
              <span className="text-gradient-primary">Dialen</span>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">by Nova Corp</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7">
          <h1 className="mb-6 text-center font-display text-lg font-semibold">Iniciar sesión</h1>

          <form onSubmit={submit} className="space-y-3">
            <input
              required
              type="email"
              placeholder="email@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              required
              type="password"
              minLength={6}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              disabled={busy}
              className="w-full rounded-lg bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "..." : "Entrar"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            ¿Necesitas una cuenta? Contacta a tu ejecutivo de NovaCorp.
          </p>
        </div>
      </div>
    </div>
  );
}

