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
  UserPlus,
  Repeat,
  ShoppingCart,
  DollarSign,
  Target,
  Receipt,
  Bot,
  Pause,
  UsersRound,
  Lock,
  Send,
  Inbox,
  Trophy,
  Star,
  UserX,
  UserCheck,
  Sparkles,
  Zap,
  Megaphone,
  Package,
  Calendar,
  ShieldCheck,
  CreditCard,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
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

type NavTarget = "/" | "/clientes" | "/conocimiento" | "/configuracion" | "/metricas";

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

          {/* Clientes / CRM */}
          <Section
            title="CRM · Clientes"
            source="/clientes"
            icon={<Users className="h-3.5 w-3.5" />}
          >
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="Total en CRM"
              value={m?.totalCustomers ?? 0}
              tooltip="Todos los clientes registrados."
              to="/clientes"
            />
            <Kpi
              icon={<UserPlus className="h-4 w-4" />}
              label="Nuevos (30d)"
              value={m?.newCustomers ?? 0}
              tooltip="Clientes creados en los últimos 30 días."
              to="/clientes"
            />
            <Kpi
              icon={<UserCheck className="h-4 w-4" />}
              label="Activos (30d)"
              value={
                (m?.totalCustomers ?? 0) - (m?.inactiveCustomers ?? 0)
              }
              tooltip="Clientes con actividad en los últimos 30 días."
              to="/clientes"
            />
            <Kpi
              icon={<UserX className="h-4 w-4" />}
              label="Inactivos"
              value={m?.inactiveCustomers ?? 0}
              tooltip="Clientes sin conversación en los últimos 30 días."
              to="/clientes"
            />
            <Kpi
              icon={<Star className="h-4 w-4" />}
              label="VIP"
              value={m?.vipCustomers ?? 0}
              tooltip="Clientes con etiqueta VIP."
              to="/clientes"
              accent={!!m?.vipCustomers}
            />
            <Kpi
              icon={<Repeat className="h-4 w-4" />}
              label="Recurrentes"
              value={m?.recurringCustomers ?? 0}
              tooltip="Clientes con 2 o más conversaciones."
              to="/clientes"
            />
            <Kpi
              icon={<UsersRound className="h-4 w-4" />}
              label="Agentes del equipo"
              value={m?.teamMembers ?? 0}
              tooltip="Miembros de tu empresa en Dialen."
              to="/configuracion"
            />
            <Kpi
              icon={<UserX className="h-4 w-4" />}
              label="Sin responsable"
              value={m?.unassignedConversations ?? 0}
              tooltip="Conversaciones abiertas sin agente asignado."
              to="/"
              tone={m && m.unassignedConversations > 0 ? "warn" : undefined}
            />
          </Section>

          {/* IA */}
          <Section
            title="Inteligencia artificial"
            source="/conocimiento"
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
            <Kpi
              icon={<Target className="h-4 w-4" />}
              label="Confianza promedio"
              value={m?.aiAvgConfidence ? `${m.aiAvgConfidence}%` : "—"}
              tooltip="Confianza estimada de las respuestas generadas por IA."
            />
            <Kpi
              icon={<DollarSign className="h-4 w-4" />}
              label="Costo IA (30d)"
              value="—"
              tooltip="Se activará cuando conectemos la telemetría de costos."
              locked
            />
          </Section>

          {/* Gráfico + ranking */}
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-display text-sm font-semibold">
                    Actividad diaria
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Mensajes entrantes vs. respuestas enviadas
                  </div>
                </div>
                <Legend />
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={m?.series ?? []}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="hsl(var(--muted-foreground))"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(var(--muted-foreground))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="inbound"
                      name="Recibidos"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#g-in)"
                    />
                    <Area
                      type="monotone"
                      dataKey="outbound"
                      name="Enviados"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={2}
                      fill="url(#g-out)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {m && m.inbound + m.outbound === 0 && (
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Aún no hay datos. Cuando llegue tu primer mensaje, esto se llenará
                  automáticamente.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <div className="font-display text-sm font-semibold">
                  Ranking de vendedores
                </div>
              </div>
              {m && m.sellers.length > 0 ? (
                <ol className="space-y-3">
                  {m.sellers.map((s, i) => (
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
          </div>

          {/* Sección: Ventas (próximamente) */}
          <Section
            title="Ventas · Embudo"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            comingSoon
          >
            <Kpi icon={<DollarSign className="h-4 w-4" />} label="Ventas hoy" value="—" tooltip="Requiere módulo de pedidos." locked />
            <Kpi icon={<DollarSign className="h-4 w-4" />} label="Ventas del mes" value="—" tooltip="Requiere módulo de pedidos." locked />
            <Kpi icon={<Target className="h-4 w-4" />} label="Tasa conversión" value="—" tooltip="Requiere embudo de ventas." locked />
            <Kpi icon={<Receipt className="h-4 w-4" />} label="Ticket promedio" value="—" tooltip="Requiere módulo de pedidos." locked />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Negocios ganados" value="—" tooltip="Requiere embudo de ventas." locked />
            <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Negocios perdidos" value="—" tooltip="Requiere embudo de ventas." locked />
            <Kpi icon={<Clock className="h-4 w-4" />} label="Tiempo por etapa" value="—" tooltip="Requiere embudo de ventas." locked />
            <Kpi icon={<DollarSign className="h-4 w-4" />} label="Valor pipeline" value="—" tooltip="Requiere embudo de ventas." locked />
          </Section>

          {/* Operaciones (próximamente) */}
          <Section
            title="Operaciones"
            icon={<Package className="h-3.5 w-3.5" />}
            comingSoon
          >
            <Kpi icon={<Package className="h-4 w-4" />} label="Productos activos" value="—" tooltip="Requiere catálogo." locked />
            <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Stock bajo" value="—" tooltip="Requiere catálogo." locked />
            <Kpi icon={<ShoppingCart className="h-4 w-4" />} label="Pedidos pendientes" value="—" tooltip="Requiere módulo de pedidos." locked />
            <Kpi icon={<Calendar className="h-4 w-4" />} label="Reuniones hoy" value="—" tooltip="Requiere agenda." locked />
          </Section>

          {/* IA + Automatización + Campañas (próximamente) */}
          <Section
            title="Automatización · Campañas"
            icon={<Zap className="h-3.5 w-3.5" />}
            comingSoon
          >
            <Kpi icon={<Zap className="h-4 w-4" />} label="Flujos activos" value="—" tooltip="Requiere automatizaciones." locked />
            <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Flujos con error" value="—" tooltip="Requiere automatizaciones." locked />
            <Kpi icon={<Megaphone className="h-4 w-4" />} label="Campañas activas" value="—" tooltip="Requiere módulo de campañas." locked />
            <Kpi icon={<Target className="h-4 w-4" />} label="ROI campañas" value="—" tooltip="Requiere módulo de campañas." locked />
          </Section>

          {/* SaaS + Supervisión (próximamente) */}
          <Section
            title="SaaS · Supervisión"
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            comingSoon
          >
            <Kpi icon={<ShieldCheck className="h-4 w-4" />} label="Supervisiones activas" value="—" tooltip="Requiere supervisor en vivo." locked />
            <Kpi icon={<CreditCard className="h-4 w-4" />} label="MRR" value="—" tooltip="Requiere facturación del SaaS." locked />
            <Kpi icon={<Repeat className="h-4 w-4" />} label="Renovaciones próximas" value="—" tooltip="Requiere facturación del SaaS." locked />
            <Kpi icon={<Users className="h-4 w-4" />} label="Suscriptores activos" value="—" tooltip="Requiere facturación del SaaS." locked />
          </Section>

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
  comingSoon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  source?: NavTarget;
  comingSoon?: boolean;
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
          {comingSoon && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" /> Próximamente
            </span>
          )}
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
