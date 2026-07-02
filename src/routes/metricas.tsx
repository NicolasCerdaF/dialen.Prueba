import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  MessageSquare,
  Sparkles,
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/metricas")({
  head: () => ({ meta: [{ title: "Dashboard — Dialen" }] }),
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

function MetricasPage() {
  const fetchMetrics = useServerFn(getDashboardMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 30_000,
  });

  const m = data;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Dashboard ejecutivo
              </h1>
              <p className="text-sm text-muted-foreground">
                Últimos 30 días · {isLoading ? "cargando…" : "en tiempo real"}
              </p>
            </div>
          </div>

          {/* Sección: Conversaciones */}
          <SectionTitle>Conversaciones</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="Activas"
              value={m?.activeConversations ?? 0}
              tooltip="Conversaciones abiertas ahora mismo."
            />
            <Kpi
              icon={<AlertCircle className="h-4 w-4" />}
              label="Sin responder"
              value={m?.unrespondedConversations ?? 0}
              tooltip="Conversaciones abiertas cuyo último mensaje es del cliente."
              tone={m && m.unrespondedConversations > 0 ? "warn" : undefined}
            />
            <Kpi
              icon={<Bot className="h-4 w-4" />}
              label="IA trabajando"
              value={m?.aiActiveConversations ?? 0}
              tooltip="Conversaciones abiertas donde la IA responde automáticamente."
              accent
            />
            <Kpi
              icon={<Pause className="h-4 w-4" />}
              label="IA pausada"
              value={m?.aiPausedConversations ?? 0}
              tooltip="Conversaciones donde un humano tomó el control."
            />
          </div>

          {/* Sección: Mensajes */}
          <SectionTitle className="mt-8">Mensajes</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              icon={<TrendingUp className="h-4 w-4" />}
              label="Tasa de respuesta"
              value={`${m?.responseRate ?? 0}%`}
              tooltip="Porcentaje de mensajes entrantes que reciben respuesta."
            />
            <Kpi
              icon={<Clock className="h-4 w-4" />}
              label="Tiempo promedio"
              value={formatDuration(m?.avgResponseSeconds ?? 0)}
              tooltip="Tiempo promedio entre un mensaje del cliente y la respuesta."
            />
          </div>

          {/* Sección: Clientes */}
          <SectionTitle className="mt-8">Clientes</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="Total en CRM"
              value={m?.totalCustomers ?? 0}
              tooltip="Todos los clientes registrados."
            />
            <Kpi
              icon={<UserPlus className="h-4 w-4" />}
              label="Nuevos (30d)"
              value={m?.newCustomers ?? 0}
              tooltip="Clientes creados en los últimos 30 días."
            />
            <Kpi
              icon={<Repeat className="h-4 w-4" />}
              label="Recurrentes"
              value={m?.recurringCustomers ?? 0}
              tooltip="Clientes con 2 o más conversaciones."
            />
            <Kpi
              icon={<UsersRound className="h-4 w-4" />}
              label="Agentes en el equipo"
              value={m?.teamMembers ?? 0}
              tooltip="Miembros de tu empresa en Dialen."
            />
          </div>

          {/* Sección: Ventas (bloqueada hasta que exista módulo de ventas) */}
          <SectionTitle className="mt-8">
            Ventas
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" /> Próximamente
            </span>
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<DollarSign className="h-4 w-4" />}
              label="Ventas hoy"
              value="—"
              tooltip="Se activa cuando conectes el módulo de ventas."
              locked
            />
            <Kpi
              icon={<DollarSign className="h-4 w-4" />}
              label="Ventas del mes"
              value="—"
              tooltip="Se activa cuando conectes el módulo de ventas."
              locked
            />
            <Kpi
              icon={<Target className="h-4 w-4" />}
              label="Tasa de conversión"
              value="—"
              tooltip="Leads que se convirtieron en clientes."
              locked
            />
            <Kpi
              icon={<Receipt className="h-4 w-4" />}
              label="Ticket promedio"
              value="—"
              tooltip="Valor promedio por venta."
              locked
            />
            <Kpi
              icon={<ShoppingCart className="h-4 w-4" />}
              label="Pedidos hoy"
              value="—"
              tooltip="Requiere módulo de pedidos."
              locked
            />
            <Kpi
              icon={<ShoppingCart className="h-4 w-4" />}
              label="Pedidos del mes"
              value="—"
              tooltip="Requiere módulo de pedidos."
              locked
            />
            <Kpi
              icon={<DollarSign className="h-4 w-4" />}
              label="Valor total vendido"
              value="—"
              tooltip="Total vendido en los últimos 30 días."
              locked
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Embudo de ventas"
              value="—"
              tooltip="Requiere módulo de embudo (Kanban)."
              locked
            />
          </div>

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
                          {s.outbound} mensajes
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

          {/* Estado del canal */}
          {m && !m.channelConnected && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4">
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
        </div>
      </div>
    </AppShell>
  );
}

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center", className)}>
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
    </div>
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tooltip: string;
  accent?: boolean;
  tone?: "warn";
  locked?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl border p-5 transition",
        accent && "border-primary/30 bg-primary/5",
        tone === "warn" && "border-amber-500/40 bg-amber-500/5",
        locked && "border-dashed border-border/60 bg-card/40 opacity-70",
        !accent && !tone && !locked && "border-border bg-card",
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
        <div
          title={tooltip}
          className="cursor-help text-muted-foreground transition hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="font-display text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
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
