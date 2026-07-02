import { createFileRoute } from "@tanstack/react-router";
import { Settings, MessageSquare, Sparkles, Users, Check, Loader2, Send, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { disconnectWhatsAppChannel, sendTestWhatsAppMessage } from "@/lib/whatsapp.functions";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { getAiSettings, saveAiSettings, previewAiReply } from "@/lib/ai.functions";
import { AI_STYLES, type AiStyle } from "@/lib/ai-styles";

export const Route = createFileRoute("/configuracion")({
  head: () => ({ meta: [{ title: "Configuración — Dialen" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const { profile, companyName, role } = useAuth();
  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <Settings className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl font-semibold tracking-tight">Configuración</h1>
          </div>

          <Section icon={<Users className="h-4 w-4" />} title="Cuenta">
            <Row label="Empresa" value={companyName ?? "—"} />
            <Row label="Tu nombre" value={profile?.full_name ?? "—"} />
            <Row label="Email" value={profile?.email ?? "—"} />
            <Row label="Rol" value={role ?? "—"} />
          </Section>

          <WhatsAppSection isAdmin={role === "admin"} />

          <AiStyleSection isAdmin={role === "admin"} />
        </div>
      </div>
    </AppShell>
  );
}

function AiStyleSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAiSettings);
  const saveFn = useServerFn(saveAiSettings);
  const previewFn = useServerFn(previewAiReply);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => fetchSettings(),
  });

  const [style, setStyle] = useState<AiStyle>("cercano");
  const [autoReply, setAutoReply] = useState(false);
  const [preview, setPreview] = useState<string>(AI_STYLES.cercano.example);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setStyle(settings.style);
      setAutoReply(settings.autoReply);
      setPreview(AI_STYLES[settings.style].example);
    }
  }, [settings]);

  async function selectStyle(next: AiStyle) {
    setStyle(next);
    setPreview(AI_STYLES[next].example);
    setLoadingPreview(true);
    try {
      const res = await previewFn({ data: { style: next } });
      if (res?.text) setPreview(res.text);
    } catch {
      // ejemplo estático ya está visible
    } finally {
      setLoadingPreview(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: { style, autoReply, customPrompt: null } });
      toast.success("Estilo guardado");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={<Sparkles className="h-4 w-4" />} title="Estilo de la IA">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : !isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Solo un administrador puede cambiar el estilo de respuesta.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Elige cómo quieres que la IA hable con tus clientes. Un solo clic.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(AI_STYLES) as AiStyle[]).map((s) => {
              const def = AI_STYLES[s];
              const active = style === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectStyle(s)}
                  className={`group relative rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-2xl">{def.emoji}</div>
                    {active && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="mt-2 font-display text-base font-semibold">{def.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{def.description}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Ejemplo de respuesta a “Hola, ¿tienen disponibilidad mañana?”</span>
              {loadingPreview && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <div className="rounded-lg bg-background p-3 text-sm leading-relaxed">{preview}</div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4">
            <div>
              <div className="font-medium">IA responde automáticamente</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Cuando alguien escriba, la IA responderá al instante en tu nombre.
              </div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={autoReply}
                onChange={(e) => setAutoReply(e.target.checked)}
              />
              <div className="h-6 w-11 rounded-full bg-secondary peer-checked:bg-primary" />
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition peer-checked:translate-x-5" />
            </div>
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      )}
    </Section>
  );
}

function WhatsAppSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const disconnectFn = useServerFn(disconnectWhatsAppChannel);
  const sendTestFn = useServerFn(sendTestWhatsAppMessage);

  const { data: channel, isLoading } = useQuery({
    queryKey: ["wa-channel"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_channels")
        .select("id, phone_number_id, display_phone, status, connected_at")
        .maybeSingle();
      return data;
    },
  });

  const connected = channel?.status === "connected";

  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("Hola 👋 Este es un mensaje de prueba desde Dialen.");
  const [testing, setTesting] = useState(false);

  async function disconnect() {
    if (!confirm("¿Desconectar este número?")) return;
    try {
      await disconnectFn({});
      toast.success("Desconectado");
      qc.invalidateQueries({ queryKey: ["wa-channel"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function sendTest() {
    if (!testTo.trim()) {
      toast.error("Indica un número de destino");
      return;
    }
    setTesting(true);
    try {
      await sendTestFn({ data: { to: testTo, text: testMsg } });
      toast.success("Mensaje enviado");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo enviar");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section icon={<MessageSquare className="h-4 w-4" />} title="WhatsApp Business">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            <Check className="h-4 w-4" />
            <span className="font-medium">Conectado</span>
            <span className="text-primary/80">· {channel?.display_phone}</span>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 text-sm font-medium">Enviar prueba</div>
            <div className="space-y-2">
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+34 600 000 000"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <textarea
                value={testMsg}
                onChange={(e) => setTestMsg(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={sendTest}
                disabled={testing}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar prueba
              </button>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={disconnect}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              Desconectar
            </button>
          )}
        </div>
      ) : !isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Solo un administrador puede conectar el canal de WhatsApp.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Conecta tu cuenta de WhatsApp Business con un solo clic.
          </p>
          <EmbeddedSignupButton
            onConnected={() => qc.invalidateQueries({ queryKey: ["wa-channel"] })}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1877F2] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          />
        </div>
      )}
    </Section>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
