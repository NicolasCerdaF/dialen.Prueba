import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Plug, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  getWhatsAppStatus,
  getWhatsAppMetrics,
  refreshWhatsAppChannel,
} from "@/lib/whatsapp.functions";
import { toast } from "sonner";

type Health = "connected" | "disconnected" | "error";

export function SidebarSystemStatus() {
  const statusFn = useServerFn(getWhatsAppStatus);
  const metricsFn = useServerFn(getWhatsAppMetrics);
  const refreshFn = useServerFn(refreshWhatsAppChannel);
  const [refreshing, setRefreshing] = useState(false);

  const statusQ = useQuery({
    queryKey: ["sidebar", "wa-status"],
    queryFn: () => statusFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const metricsQ = useQuery({
    queryKey: ["sidebar", "wa-metrics"],
    queryFn: () => metricsFn(),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled: statusQ.data?.connected === true,
  });

  const connected = statusQ.data?.connected === true;
  const phone = statusQ.data?.display_phone ?? null;
  const health: Health = statusQ.isError
    ? "error"
    : connected
      ? "connected"
      : "disconnected";

  const in24 = metricsQ.data?.buckets.d1.in ?? 0;
  const out24 = metricsQ.data?.buckets.d1.out ?? 0;

  const dotColor =
    health === "connected"
      ? "bg-emerald-500"
      : health === "error"
        ? "bg-red-500"
        : "bg-amber-500";
  const pingColor =
    health === "connected"
      ? "bg-emerald-400"
      : health === "error"
        ? "bg-red-400"
        : "bg-amber-400";

  const to = connected ? "/whatsapp" : "/onboarding/whatsapp";

  const handleRefresh = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRefreshing(true);
    try {
      await refreshFn();
      await Promise.all([statusQ.refetch(), metricsQ.refetch()]);
      toast.success("Canal actualizado");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo actualizar");
    } finally {
      setRefreshing(false);
    }
  };

  const Icon = statusQ.isLoading
    ? Loader2
    : connected
      ? CheckCircle2
      : health === "error"
        ? AlertTriangle
        : Plug;

  const title = statusQ.isLoading
    ? "Comprobando canal…"
    : connected
      ? phone ?? "WhatsApp conectado"
      : "WhatsApp no conectado";

  const subtitle = statusQ.isLoading
    ? "Consultando estado"
    : connected
      ? `Últ. 24 h · ↓${in24} ↑${out24}`
      : "Conectar en ajustes";

  return (
    <Link
      to={to}
      title={
        connected
          ? `Canal activo${phone ? ` (${phone})` : ""} — clic para abrir consola WhatsApp`
          : "Configurar canal WhatsApp Business"
      }
      className={cn(
        "group flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 transition-smooth hover:bg-secondary/70",
        !connected && "hover:border-amber-500/40",
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            pingColor,
          )}
        />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
      </span>
      <div className="min-w-0 flex-1 text-xs leading-tight">
        <div className="flex items-center gap-1.5 truncate font-medium">
          <Icon
            className={cn(
              "h-3 w-3 shrink-0",
              statusQ.isLoading && "animate-spin",
              connected
                ? "text-emerald-500"
                : health === "error"
                  ? "text-red-500"
                  : "text-amber-500",
            )}
            strokeWidth={2}
          />
          <span className="truncate">{title}</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
      {connected && (
        <button
          type="button"
          onClick={handleRefresh}
          title="Actualizar estado desde Meta"
          className="rounded-md p-1 text-muted-foreground opacity-0 transition-smooth hover:bg-secondary hover:text-foreground group-hover:opacity-100"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
        </button>
      )}
    </Link>
  );
}
