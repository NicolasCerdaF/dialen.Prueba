import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
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
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/", replace: true });
  }, [session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name, company_name: company },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisa tu email para verificar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(translateAuthError(err instanceof Error ? err.message : "Error"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) toast.error(translateAuthError(r.error.message ?? "Error con Google"));
    setBusy(false);
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
          <div className="mb-6 flex gap-1 rounded-lg bg-secondary/50 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  mode === m ? "bg-background text-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <input
                  required
                  placeholder="Tu nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <input
                  required
                  placeholder="Nombre de tu empresa"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </>
            )}
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
              placeholder="Contraseña (mín. 6)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              disabled={busy}
              className="w-full rounded-lg bg-gradient-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "..." : mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="w-full rounded-lg border border-input bg-background py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
          >
            Continuar con Google
          </button>
        </div>
      </div>
    </div>
  );
}
