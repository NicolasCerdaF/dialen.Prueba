import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { connectWhatsAppEmbedded, getMetaPublicConfig } from "@/lib/whatsapp.functions";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
    __wa_debug?: (msg: string, data?: any) => void;
  }
}

const DEBUG = import.meta.env.DEV;

function log(msg: string, data?: any) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`[WA-Signup] ${msg}`, data ?? "");
  }
  try {
    window.__wa_debug?.(msg, data);
  } catch {
    // ignore
  }
}


function loadFbSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      log("FB SDK ya estaba cargado");
      resolve();
      return;
    }
    log("Cargando FB SDK", { appId, version });
    window.fbAsyncInit = () => {
      try {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
        log("FB.init() OK");
        resolve();
      } catch (e) {
        log("FB.init() ERROR", e);
        reject(e);
      }
    };
    const id = "facebook-jssdk";
    if (document.getElementById(id)) {
      log("Script tag ya existía, esperando init…");
      return;
    }
    const js = document.createElement("script");
    js.id = id;
    js.async = true;
    js.defer = true;
    js.crossOrigin = "anonymous";
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.onerror = (e) => {
      log("ERROR cargando script Facebook SDK", e);
      reject(new Error("No se pudo cargar el SDK de Facebook (¿bloqueado por adblock?)"));
    };
    document.body.appendChild(js);
  });
}

export function EmbeddedSignupButton({
  onConnected,
  label = "Conectar WhatsApp Business",
  className,
}: {
  onConnected?: () => void;
  label?: string;
  className?: string;
}) {
  const connectFn = useServerFn(connectWhatsAppEmbedded);
  const configFn = useServerFn(getMetaPublicConfig);
  const [busy, setBusy] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const { data: cfg, error: cfgError, isLoading: cfgLoading } = useQuery({
    queryKey: ["meta-public-config"],
    queryFn: () => configFn(),
    retry: false,
  });

  useEffect(() => {
    if (cfgError) log("getMetaPublicConfig ERROR", cfgError);
    if (cfg) log("getMetaPublicConfig OK", cfg);
  }, [cfg, cfgError]);

  useEffect(() => {
    if (!cfg?.app_id) return;
    loadFbSdk(cfg.app_id, cfg.graph_version)
      .then(() => setSdkReady(true))
      .catch((e) => setSdkError(e?.message ?? "Error desconocido cargando SDK"));

    function handleMessage(event: MessageEvent) {
      if (!event.origin.includes("facebook.com")) return;
      log("postMessage desde Facebook", { origin: event.origin, data: event.data });
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          log("Evento WA_EMBEDDED_SIGNUP", data);
          if (data?.event === "FINISH") {
            (window as any).__wa_session = data.data;
            log("session_info guardado", data.data);
          }
        }
      } catch (e) {
        log("Error parseando postMessage", e);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [cfg?.app_id, cfg?.graph_version]);

  async function handleClick() {
    log("Click Conectar WhatsApp");
    if (!window.FB) {
      const msg = "Facebook SDK no está disponible (window.FB undefined)";
      log(msg);
      toast.error(msg);
      return;
    }
    setBusy(true);
    (window as any).__wa_session = undefined;
    log("Llamando FB.login()…", {
      app_id: cfg?.app_id,
      origin: window.location.origin,
    });

    try {
      window.FB.login(
        async (response: any) => {
          log("FB.login() callback", response);
          try {
            const code: string | undefined = response?.authResponse?.code;
            if (!code) {
              if (response?.status === "not_authorized") {
                toast.error("Rechazaste los permisos en Meta.");
              } else if (response?.status === "unknown") {
                toast.info("Cancelaste la conexión.");
              } else {
                toast.error(`No recibimos código de Meta (status: ${response?.status ?? "?"}).`);
              }
              setBusy(false);
              return;
            }
            log("Código OAuth recibido", { codeLen: code.length });
            const session = (window as any).__wa_session ?? {};
            log("Llamando connectWhatsAppEmbedded en el servidor…", session);
            const result = await connectFn({
              data: {
                code,
                phone_number_id: session.phone_number_id,
                waba_id: session.waba_id,
              },
            });
            log("Servidor respondió OK", result);
            toast.success(`¡Listo! Conectado ${result.display_phone || ""}`.trim());
            onConnected?.();
          } catch (e: any) {
            log("ERROR en servidor", e);
            toast.error(e?.message ?? "No pudimos conectar tu WhatsApp.");
          } finally {
            setBusy(false);
          }
        },
        {
          scope:
            "whatsapp_business_management,whatsapp_business_messaging,business_management",
          response_type: "code",
          override_default_response_type: true,
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: "3",
          },
        },
      );
    } catch (e: any) {
      log("Excepción al llamar FB.login()", e);
      toast.error(e?.message ?? "Error al abrir login de Meta");
      setBusy(false);
    }
  }

  if (cfgError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-left text-sm">
        <p className="font-medium text-destructive">No pudimos cargar la configuración de Meta</p>
        <p className="mt-1 text-muted-foreground">{(cfgError as Error).message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Verifica que <code>META_APP_ID</code> esté configurado en Secrets.
        </p>
      </div>
    );
  }

  if (sdkError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-left text-sm">
        <p className="font-medium text-destructive">No pudimos cargar Facebook SDK</p>
        <p className="mt-1 text-muted-foreground">{sdkError}</p>
      </div>
    );
  }

  const disabled = busy || !sdkReady || !cfg?.app_id;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={
          className ??
          "inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-8 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        }
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
        {busy
          ? "Conectando…"
          : !cfg?.app_id && cfgLoading
            ? "Cargando configuración…"
            : !sdkReady
              ? "Cargando Meta…"
              : label}
      </button>
      {!sdkReady && cfg?.app_id && (
        <p className="text-xs text-muted-foreground">Esperando que Facebook responda…</p>
      )}
    </div>
  );
}
