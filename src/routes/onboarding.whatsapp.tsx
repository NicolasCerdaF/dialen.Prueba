import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, MessageSquare, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";

export const Route = createFileRoute("/onboarding/whatsapp")({
  head: () => ({
    meta: [
      { title: "Conecta tu WhatsApp — Dialen" },
      { name: "description", content: "Conecta tu número de WhatsApp Business a Dialen en menos de un minuto." },
    ],
  }),
  component: OnboardingPage,
  errorComponent: ({ error, reset }) => (
    <div className="grid min-h-screen place-items-center p-8 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-muted-foreground">
          No pudimos cargar el asistente: {error.message}
        </p>
        <button
          onClick={() => reset()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Reintentar
        </button>
      </div>
    </div>
  ),
});

function OnboardingPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: channel, isLoading } = useQuery({
    queryKey: ["wa-channel-onboarding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_channels")
        .select("status, display_phone")
        .maybeSingle();
      return data;
    },
  });

  const connected = channel?.status === "connected";

  useEffect(() => {
    if (connected) {
      const t = setTimeout(() => navigate({ to: "/" }), 1800);
      return () => clearTimeout(t);
    }
  }, [connected, navigate]);

  function goBack() {
    // Prefer real browser back when there is history; otherwise land on home.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/" });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              aria-label="Volver"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="font-display text-base font-semibold">Dialen</span>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/" })}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Omitir por ahora
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12 sm:py-20">
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <div className="mx-auto h-6 w-40 animate-pulse rounded bg-secondary" />
            <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded bg-secondary" />
          </div>
        ) : connected ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center sm:p-14">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              ¡Conectado!
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {channel?.display_phone ?? "Tu WhatsApp ya está activo"}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">Redirigiendo…</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
              <MessageSquare className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Conecta tu WhatsApp en un clic
            </h1>
            <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
              Inicia sesión con Meta y listo. Sin códigos, sin pegar nada.
            </p>

            <div className="mt-8 flex justify-center">
              <EmbeddedSignupButton
                onConnected={() =>
                  qc.invalidateQueries({ queryKey: ["wa-channel-onboarding"] })
                }
              />
            </div>

            <div className="mt-8 grid gap-3 text-left text-sm sm:grid-cols-3">
              <Bullet icon={<Zap className="h-4 w-4" />} text="Menos de 1 minuto" />
              <Bullet icon={<ShieldCheck className="h-4 w-4" />} text="Conexión oficial Meta" />
              <Bullet icon={<Check className="h-4 w-4" />} text="Desconectas cuando quieras" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Bullet({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {text}
    </div>
  );
}
