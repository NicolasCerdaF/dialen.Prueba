import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import {
  BarChart3,
  MessageSquare,
  TrendingUp,
  Users,
  Info,
  AlertCircle,
  Clock,
  Bot,
  Pause,
  UsersRound,
  Send,
  Inbox,
  Trophy,
  UserX,
  UserCheck,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getDashboardMetrics } from "@/lib/metrics.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/metricas")({
  head: () => ({
    meta: [
      { title: "Dashboard ejecutivo — Dialen" },
      {
        name: "description",
        content:
          "Centro de control en tiempo real: conversaciones, ventas, clientes, IA y equipo en una sola pantalla.",
      },
    ],
  }),
  component: MetricasPage,
});

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type NavTarget = "/" | "/clientes" | "/configuracion" | "/metricas";

function MetricasPage() {
  const fetchMetrics = useServerFn(getDashboardMetrics);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 30_000,
  });

  // Realtime: cuando cambian mensajes o conversaciones, refrescar
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const m = data;
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Dashboard ejecutivo
                </h1>
                <p className="text-sm text-muted-foreground">
                  Centro de control · datos consolidados en tiempo real
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isFetching ? "animate-pulse bg-primary" : "bg-emerald-500",
                  )}
                />
                {isLoading
                  ? "cargando…"
                  : isFetching
                    ? "actualizando…"
                    : "en vivo"}
              </span>
              {lastUpdate && (
                <span>
                  {lastUpdate.toLocaleTimeString("es", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
              <button
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })
                }
                className="rounded-md border border-border p-1.5 hover:bg-secondary"
                title="Refrescar ahora"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isFetching && "animate-spin")}
                />
              </button>
            </div>
          </div>

          {/* Estado del canal */}
          {m && !m.channelConnected && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-4 w-4 text-primary" />
                <div className="text-sm">
                  <div className="font-medium">WhatsApp aún no está conectado</div>
                  <div className="text-xs text-muted-foreground">
                    Conecta tu número para empezar a recibir métricas reales.
                  </div>
                </div>
              </div>
              <Link
                to="/onboarding/whatsapp"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Conectar
              </Link>
            </div>
          )}

          {/* Alertas críticas */}
          {m && (m.waitingTooLong > 0 || m.unrespondedConversations > 0) && (
            <button
              onClick={() => navigate({ to: "/" })}
              className="mb-6 flex w-full items-center justify-between rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-left transition hover:bg-amber-500/10"
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <div className="text-sm">
                  <div className="font-medium">
                    {m.waitingTooLong > 0
                      ? `${m.waitingTooLong} cliente${m.waitingTooLong > 1 ? "s" : ""} espera${m.waitingTooLong > 1 ? "n" : ""} hace más de 1 hora`
                      : `${m.unrespondedConversations} conversacion${m.unrespondedConversations > 1 ? "es" : ""} sin responder`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Toca aquí para ir a la Bandeja Unificada.
                  </div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {/* Sección: Bandeja Unificada */}
          <Section
            title="Bandeja unificada"
            source="/"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
          >
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="Activas"
              value={m?.activeConversations ?? 0}
              tooltip="Conversaciones abiertas ahora mismo."
              to="/"
            />
            <Kpi
              icon={<AlertCircle className="h-4 w-4" />}
              label="Sin responder"
              value={m?.unrespondedConversations ?? 0}
              tooltip="Conversaciones cuyo último mensaje es del cliente."
              tone={m && m.unrespondedConversations > 0 ? "warn" : undefined}
              to="/"
            />
            <Kpi
              icon={<Clock className="h-4 w-4" />}
              label="Esperando +1h"
              value={m?.waitingTooLong ?? 0}
              tooltip="Clientes sin respuesta hace más de una hora."
              tone={m && m.waitingTooLong > 0 ? "warn" : undefined}
              to="/"
            />
            <Kpi
              icon={<UserX className="h-4 w-4" />}
              label="Sin asignar"
              value={m?.unassignedConversations ?? 0}
              tooltip="Conversaciones abiertas sin agente responsable."
              to="/"
            />
            <Kpi
              icon={<Bot className="h-4 w-4" />}
              label="IA trabajando"
              value={m?.aiActiveConversations ?? 0}
              tooltip="Conversaciones donde la IA responde automáticamente."
              accent
              to="/"
            />
            <Kpi
              icon={<Pause className="h-4 w-4" />}
              label="IA pausada"
              value={m?.aiPausedConversations ?? 0}
              tooltip="Conversaciones donde un humano tomó el control."
              to="/"
            />
            <Kpi
              icon={<Clock className="h-4 w-4" />}
              label="Tiempo respuesta"
              value={formatDuration(m?.avgResponseSeconds ?? 0)}
              tooltip="Tiempo promedio entre un mensaje del cliente y la respuesta."
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Tasa respuesta"
              value={`${m?.responseRate ?? 0}%`}
              tooltip="Porcentaje de mensajes entrantes que reciben respuesta."
            />
          </Section>

          {/* Mensajes */}
          <Section title="Mensajería (30 días)" icon={<Send className="h-3.5 w-3.5" />}>
            <Kpi
              icon={<Inbox className="h-4 w-4" />}
              label="Recibidos"
              value={m?.inbound ?? 0}
              tooltip="Total de mensajes entrantes de clientes."
            />
            <Kpi
              icon={<Send className="h-4 w-4" />}
              label="Enviados"
              value={m?.outbound ?? 0}
              tooltip="Total de mensajes salientes (IA + humanos)."
            />
            <Kpi
              icon={<Bot className="h-4 w-4" />}
              label="Enviados por IA"
              value={m?.outboundAi ?? 0}
              tooltip="Respuestas automáticas enviadas por la IA."
              accent
            />
            <Kpi
              icon={<UsersRound className="h-4 w-4" />}
              label="Enviados por equipo"
              value={m?.outboundHuman ?? 0}
              tooltip="Respuestas enviadas por agentes humanos."
            />
          </Section>

          {/* IA (compacto, sólo lo que sirve para vender) */}
          <Section
            title="IA vendiendo"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          >
            <Kpi
              icon={<Bot className="h-4 w-4" />}
              label="Atendidas por IA"
              value={m?.aiActiveConversations ?? 0}
              tooltip="Conversaciones activas gestionadas por la IA."
              accent
              to="/"
            />
            <Kpi
              icon={<UsersRound className="h-4 w-4" />}
              label="Derivadas a humanos"
              value={m?.aiPausedConversations ?? 0}
              tooltip="Conversaciones donde un humano tomó el control."
              to="/"
            />
            <Kpi
              icon={<Sparkles className="h-4 w-4" />}
              label="Sugerencias (30d)"
              value={m?.aiSuggestions ?? 0}
              tooltip="Sugerencias generadas por la IA en los últimos 30 días."
            />
            <Kpi
              icon={<UserCheck className="h-4 w-4" />}
              label="Sugerencias usadas"
              value={m?.aiAccepted ?? 0}
              tooltip="Sugerencias que los agentes enviaron al cliente."
            />
          </Section>

          {/* Ranking de vendedores (única vista secundaria que se conserva) */}
          <section className="mt-8">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <div className="font-display text-sm font-semibold">
                  Ranking de vendedores (30d)
                </div>
              </div>
              {m && m.sellers.length > 0 ? (
                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {m.sellers.slice(0, 6).map((s, i) => (
                    <li
                      key={s.sender_id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5"
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          i === 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.outbound} respuestas
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  Aún no hay respuestas humanas registradas. El ranking aparecerá
                  cuando tu equipo empiece a responder.
                </div>
              )}
            </div>
          </section>


          <p className="mt-8 text-center text-xs text-muted-foreground">
            Este panel agrega datos en vivo de todos los módulos. Ninguna métrica se
            almacena aquí — todo proviene del módulo original.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  icon,
  source,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  source?: NavTarget;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-secondary text-muted-foreground">
              {icon}
            </span>
          )}
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
        </div>
        {source && (
          <Link
            to={source}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Abrir módulo <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  tooltip,
  accent,
  tone,
  locked,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tooltip: string;
  accent?: boolean;
  tone?: "warn";
  locked?: boolean;
  to?: NavTarget;
}) {
  const clickable = !!to && !locked;
  const inner = (
    <div
      className={cn(
        "group relative h-full rounded-2xl border p-5 transition",
        accent && "border-primary/30 bg-primary/5",
        tone === "warn" && "border-amber-500/40 bg-amber-500/5",
        locked && "border-dashed border-border/60 bg-card/40 opacity-70",
        !accent && !tone && !locked && "border-border bg-card",
        clickable && "cursor-pointer hover:border-primary/50 hover:shadow-sm",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            accent
              ? "bg-primary text-primary-foreground"
              : tone === "warn"
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : "bg-secondary text-foreground",
          )}
        >
          {icon}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          {clickable && (
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
          )}
          <span title={tooltip} className="cursor-help transition hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
      <div className="font-display text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
  if (clickable) {
    return (
      <Link to={to} className="block h-full">
        {inner}
      </Link>
    );
  }
  return inner;
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-primary" /> Recibidos
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Enviados
      </span>
    </div>
  );
}
