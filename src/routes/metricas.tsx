import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Users,
  Info,
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

export const Route = createFileRoute("/metricas")({
  head: () => ({ meta: [{ title: "Métricas — Dialen" }] }),
  component: MetricasPage,
});

function MetricasPage() {
  const fetchMetrics = useServerFn(getDashboardMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 30_000,
  });

  const m = data ?? {
    inbound: 0,
    outboundAi: 0,
    outboundHuman: 0,
    responseRate: 0,
    activeConversations: 0,
    series: [] as Array<{ date: string; inbound: number; outbound: number }>,
  };

  return (
    <AppShell>
      <div className="h-full overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Métricas</h1>
              <p className="text-sm text-muted-foreground">
                Últimos 30 días · {isLoading ? "cargando…" : "en tiempo real"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={<MessageSquare className="h-4 w-4" />}
              label="Mensajes recibidos"
              value={m.inbound}
              tooltip="Total de mensajes entrantes de tus clientes en WhatsApp."
            />
            <Kpi
              icon={<Sparkles className="h-4 w-4" />}
              label="Respondidos por IA"
              value={m.outboundAi}
              tooltip="Mensajes que la IA contestó automáticamente sin intervención humana."
              accent
            />
            <Kpi
              icon={<TrendingUp className="h-4 w-4" />}
              label="Tasa de respuesta"
              value={`${m.responseRate}%`}
              tooltip="Porcentaje de mensajes entrantes que han recibido respuesta."
            />
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="Conversaciones activas"
              value={m.activeConversations}
              tooltip="Conversaciones abiertas en este momento."
            />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-display text-sm font-semibold">Actividad diaria</div>
                <div className="text-xs text-muted-foreground">
                  Mensajes entrantes vs. respuestas enviadas
                </div>
              </div>
              <Legend />
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={m.series}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
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
            {m.inbound + m.outboundAi + m.outboundHuman === 0 && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Aún no hay datos. Cuando llegue tu primer mensaje, esto se llenará automáticamente.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({
  icon,
  label,
  value,
  tooltip,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tooltip: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`group relative rounded-2xl border p-5 transition ${
        accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            accent ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
          }`}
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
