import { createFileRoute } from "@tanstack/react-router";
import { Target, Plus, Search, Filter, TrendingUp, DollarSign, Percent, Calendar } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/oportunidades")({
  head: () => ({ meta: [{ title: "Oportunidades — Dialen" }] }),
  component: OportunidadesPage,
});

function OportunidadesPage() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <Target className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Oportunidades
                </h1>
                <p className="text-sm text-muted-foreground">
                  El paso previo a una cotización: intenciones detectadas por la IA o creadas por tu equipo
                </p>
              </div>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" />
              Nueva oportunidad
            </button>
          </header>

          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Abiertas" value="—" icon={Target} tone="primary" />
            <Stat label="Monto esperado" value="—" icon={DollarSign} tone="success" />
            <Stat label="Prob. media" value="—" icon={Percent} tone="accent" />
            <Stat label="Cierre este mes" value="—" icon={TrendingUp} tone="warn" />
          </div>

          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Buscar oportunidad, cliente o producto"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>

          {/* Tabla */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">Oportunidad</th>
                  <th className="px-4 py-2.5 text-left">Cliente</th>
                  <th className="px-4 py-2.5 text-left">Estado</th>
                  <th className="px-4 py-2.5 text-right">Monto esperado</th>
                  <th className="px-4 py-2.5 text-right">Prob.</th>
                  <th className="px-4 py-2.5 text-left">Responsable</th>
                  <th className="px-4 py-2.5 text-left">Próxima acción</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-xs text-muted-foreground">
                    <Target className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    No hay oportunidades registradas.
                    <br />
                    La IA detectará intenciones de compra automáticamente y las mostrará aquí antes de cotizar.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Estados */}
          <div className="mt-6 grid gap-2 sm:grid-cols-5">
            <StateChip label="Detectada" tone="muted" />
            <StateChip label="Calificada" tone="primary" />
            <StateChip label="En negociación" tone="warn" />
            <StateChip label="Ganada" tone="success" />
            <StateChip label="Perdida" tone="danger" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Target;
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
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StateChip({
  label,
  tone,
}: {
  label: string;
  tone: "muted" | "primary" | "warn" | "success" | "danger";
}) {
  const toneMap = {
    muted: "bg-secondary text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warn: "bg-amber-500/10 text-amber-500",
    success: "bg-emerald-500/10 text-emerald-500",
    danger: "bg-rose-500/10 text-rose-500",
  } as const;
  return (
    <div className={cn("rounded-lg px-3 py-2 text-center text-xs font-medium", toneMap[tone])}>
      {label}
    </div>
  );
}
