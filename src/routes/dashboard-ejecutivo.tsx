import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  DollarSign,
  Percent,
  Users,
  Timer,
  TrendingUp,
  Sparkles,
  Trophy,
  Download,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useState } from "react";

export const Route = createFileRoute("/dashboard-ejecutivo")({
  head: () => ({ meta: [{ title: "Dashboard Ejecutivo — Dialen" }] }),
  component: DashboardEjecutivo,
});

function DashboardEjecutivo() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <BarChart3 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Dashboard Ejecutivo
                </h1>
                <p className="text-sm text-muted-foreground">
                  Visión completa del negocio para dueños y gerentes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                <RangePill active={range === "7d"} onClick={() => setRange("7d")}>
                  7 días
                </RangePill>
                <RangePill active={range === "30d"} onClick={() => setRange("30d")}>
                  30 días
                </RangePill>
                <RangePill active={range === "90d"} onClick={() => setRange("90d")}>
                  90 días
                </RangePill>
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
                <Download className="h-4 w-4" />
                Exportar
              </button>
            </div>
          </header>

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Ventas" value="—" icon={DollarSign} tone="success" />
            <Kpi label="Conversión" value="—" icon={Percent} tone="primary" />
            <Kpi label="Clientes nuevos" value="—" icon={Users} tone="accent" />
            <Kpi label="Tiempo de respuesta" value="—" icon={Timer} tone="warn" />
            <Kpi label="Cotizaciones" value="—" icon={TrendingUp} tone="primary" />
            <Kpi label="Actividad IA" value="—" icon={Sparkles} tone="accent" />
          </div>

          {/* Charts grid */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Ventas en el tiempo" icon={TrendingUp} className="lg:col-span-2">
              <ChartPlaceholder label="Gráfico de ventas" />
            </Panel>
            <Panel title="Estado del embudo" icon={BarChart3}>
              <FunnelPlaceholder />
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Rendimiento por vendedor" icon={Trophy}>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Vendedor</th>
                    <th className="px-4 py-2 text-right">Chats</th>
                    <th className="px-4 py-2 text-right">Cierres</th>
                    <th className="px-4 py-2 text-right">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-xs text-muted-foreground">
                      Aparecerá el ranking del equipo cuando haya actividad.
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>

            <Panel title="Actividad de la IA" icon={Sparkles}>
              <ul className="space-y-3 px-5 py-4 text-sm">
                <MetricRow label="Respuestas automáticas" value="—" />
                <MetricRow label="Sugerencias aceptadas" value="—" />
                <MetricRow label="Cotizaciones auto-generadas" value="—" />
                <MetricRow label="Recomendaciones producidas" value="—" />
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof BarChart3;
  tone: "primary" | "success" | "accent" | "warn";
}) {
  const toneMap = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    accent: "text-sky-500 bg-sky-500/10",
    warn: "text-amber-500 bg-amber-500/10",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneMap[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-display text-xl font-semibold">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        vs. periodo anterior
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: typeof BarChart3;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ChartPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-56 items-end gap-2 px-5 py-4">
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-gradient-to-t from-primary/30 to-primary/5"
          style={{ height: `${20 + ((i * 37) % 80)}%` }}
        />
      ))}
    </div>
  );
}

function FunnelPlaceholder() {
  const stages = [
    { label: "Nuevo", width: "w-full" },
    { label: "Interesado", width: "w-4/5" },
    { label: "Cotizado", width: "w-3/5" },
    { label: "Negociando", width: "w-2/5" },
    { label: "Ganado", width: "w-1/4" },
  ];
  return (
    <div className="space-y-2 px-5 py-4">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">{s.label}</span>
          <div className={cn("h-6 rounded bg-gradient-to-r from-primary to-primary/60", s.width)} />
          <span className="text-xs text-muted-foreground">—</span>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  );
}

function RangePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
