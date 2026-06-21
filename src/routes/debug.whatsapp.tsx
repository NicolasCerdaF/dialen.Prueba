import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { getMetaPublicConfig, getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { getWhatsAppDiagnostics } from "@/lib/whatsapp-debug.functions";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";

export const Route = createFileRoute("/debug/whatsapp")({
  head: () => ({ meta: [{ title: "Diagnóstico WhatsApp" }] }),
  component: DebugPage,
});

type Status = "ok" | "fail" | "warn" | "pending";

function Row({ label, status, value }: { label: string; status: Status; value?: React.ReactNode }) {
  const Icon =
    status === "ok" ? CheckCircle2 : status === "fail" ? XCircle : status === "warn" ? AlertCircle : Loader2;
  const color =
    status === "ok"
      ? "text-emerald-600"
      : status === "fail"
        ? "text-red-600"
        : status === "warn"
          ? "text-amber-600"
          : "text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 text-sm last:border-b-0">
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 ${color} ${status === "pending" ? "animate-spin" : ""}`} />
        <span>{label}</span>
      </div>
      {value !== undefined && (
        <span className="text-right font-mono text-xs text-muted-foreground break-all max-w-[55%]">
          {value}
        </span>
      )}
    </div>
  );
}

function DebugPage() {
  const diagFn = useServerFn(getWhatsAppDiagnostics);
  const cfgFn = useServerFn(getMetaPublicConfig);
  const statusFn = useServerFn(getWhatsAppStatus);

  const diag = useQuery({ queryKey: ["wa-diag"], queryFn: () => diagFn(), retry: false });
  const cfg = useQuery({ queryKey: ["wa-cfg-debug"], queryFn: () => cfgFn(), retry: false });
  const status = useQuery({ queryKey: ["wa-status-debug"], queryFn: () => statusFn(), retry: false });

  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [fbReady, setFbReady] = useState(false);
  const [logs, setLogs] = useState<{ t: number; msg: string; data?: any }[]>([]);

  useEffect(() => {
    (window as any).__wa_debug = (msg: string, data?: any) =>
      setLogs((l) => [...l.slice(-99), { t: Date.now(), msg, data }]);
    const i = setInterval(() => {
      setSdkLoaded(!!document.getElementById("facebook-jssdk"));
      setFbReady(!!(window as any).FB);
    }, 500);
    return () => clearInterval(i);
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri = `${origin}/api/public/whatsapp/webhook`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-2xl font-semibold">Diagnóstico WhatsApp</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Esta página verifica cada paso del flujo de conexión. Abre la consola (F12) para ver logs en tiempo real.
      </p>

      <section className="mt-8">
        <h2 className="font-semibold">1. Servidor (Secrets)</h2>
        <div className="mt-2 rounded-xl border border-border bg-card px-4">
          {diag.isLoading ? (
            <Row label="Consultando servidor…" status="pending" />
          ) : diag.error ? (
            <Row label="Error consultando servidor" status="fail" value={(diag.error as Error).message} />
          ) : (
            <>
              <Row
                label="META_APP_ID configurado"
                status={diag.data?.server.meta_app_id_set ? "ok" : "fail"}
                value={diag.data?.server.meta_app_id_preview ?? "FALTA"}
              />
              <Row
                label="META_APP_SECRET configurado"
                status={diag.data?.server.meta_app_secret_set ? "ok" : "fail"}
                value={diag.data?.server.meta_app_secret_set ? "✓ presente" : "FALTA"}
              />
              <Row
                label="Graph API version"
                status="ok"
                value={diag.data?.server.graph_version}
              />
              <Row
                label="Meta App accesible (app token)"
                status={
                  diag.data?.server.meta_app_reachable === null
                    ? "warn"
                    : diag.data?.server.meta_app_reachable
                      ? "ok"
                      : "fail"
                }
                value={diag.data?.server.meta_app_error ?? (diag.data?.server.meta_app_reachable ? "OK" : "—")}
              />
            </>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">2. Navegador (SDK + dominio)</h2>
        <div className="mt-2 rounded-xl border border-border bg-card px-4">
          <Row
            label="App ID expuesto al navegador"
            status={cfg.data?.app_id ? "ok" : cfg.isLoading ? "pending" : "fail"}
            value={cfg.data?.app_id ?? (cfg.error as Error)?.message}
          />
          <Row label="Script Facebook SDK inyectado" status={sdkLoaded ? "ok" : "pending"} />
          <Row label="window.FB disponible" status={fbReady ? "ok" : "pending"} />
          <Row label="Origen actual" status="ok" value={origin} />
          <Row label="Redirect URI (webhook)" status="ok" value={redirectUri} />
          <Row
            label="¿Estás en iframe de preview?"
            status={
              typeof window !== "undefined" && window.self !== window.top ? "warn" : "ok"
            }
            value={
              typeof window !== "undefined" && window.self !== window.top
                ? "Sí — abre en pestaña nueva si Meta bloquea popups"
                : "No"
            }
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">3. Conexión actual</h2>
        <div className="mt-2 rounded-xl border border-border bg-card px-4">
          <Row
            label="WhatsApp conectado"
            status={status.isLoading ? "pending" : status.data?.connected ? "ok" : "warn"}
            value={status.data?.display_phone ?? (status.data?.connected ? "✓" : "no conectado")}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">4. Probar conexión</h2>
        <div className="mt-2 rounded-xl border border-border bg-card p-4">
          <EmbeddedSignupButton />
          <p className="mt-3 text-xs text-muted-foreground">
            Los pasos se imprimirán en consola con prefijo <code>[WA-Signup]</code> y también abajo.
          </p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">5. Logs en vivo</h2>
        <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-border bg-black/90 p-3 font-mono text-[11px] text-emerald-300">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">Sin eventos todavía. Haz clic en el botón de arriba.</p>
          ) : (
            logs.map((l, i) => (
              <div key={i} className="border-b border-white/5 py-1">
                <span className="text-white/40">{new Date(l.t).toLocaleTimeString()}</span>{" "}
                <span>{l.msg}</span>
                {l.data !== undefined && l.data !== "" && (
                  <pre className="whitespace-pre-wrap text-emerald-200/80">
                    {(() => {
                      try {
                        return JSON.stringify(l.data, null, 2);
                      } catch {
                        return String(l.data);
                      }
                    })()}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-amber-400/30 bg-amber-50/40 p-4 text-sm dark:bg-amber-950/20">
        <p className="font-semibold">Checklist en developers.facebook.com</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>App type = <b>Business</b>, productos <b>WhatsApp</b> + <b>Facebook Login for Business</b> añadidos.</li>
          <li>App Settings → Basic → <b>App Domains</b>: <code>{origin.replace(/^https?:\/\//, "")}</code></li>
          <li>Facebook Login for Business → Settings → <b>Valid OAuth Redirect URIs</b>: <code>{origin}/</code></li>
          <li>App en modo <b>Live</b> (no Development) o tu cuenta agregada como tester.</li>
        </ul>
      </section>
    </div>
  );
}
