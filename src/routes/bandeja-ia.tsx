import { createFileRoute } from "@tanstack/react-router";
import {
  Inbox,
  UserCheck,
  FileClock,
  Package,
  MessageCircleOff,
  Flame,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useState } from "react";

export const Route = createFileRoute("/bandeja-ia")({
  head: () => ({ meta: [{ title: "Bandeja IA — Dialen" }] }),
  component: BandejaIA,
});

type Category = {
  id: string;
  label: string;
  icon: typeof Inbox;
  tone: "primary" | "success" | "warn" | "danger" | "accent";
  description: string;
};

const categories: Category[] = [
  {
    id: "seguimiento",
    label: "Clientes por seguir",
    icon: UserCheck,
    tone: "primary",
    description: "Clientes sin contacto reciente que la IA sugiere retomar",
  },
  {
    id: "cotizaciones",
    label: "Cotizaciones por vencer",
    icon: FileClock,
    tone: "warn",
    description: "Cotizaciones enviadas pendientes de respuesta",
  },
  {
    id: "productos",
    label: "Productos más consultados",
    icon: Package,
    tone: "accent",
    description: "Productos con mayor demanda en conversaciones activas",
  },
  {
    id: "abandonadas",
    label: "Conversaciones abandonadas",
    icon: MessageCircleOff,
    tone: "warn",
    description: "Chats sin respuesta hace más de 24 horas",
  },
  {
    id: "hot-leads",
    label: "Alta probabilidad de compra",
    icon: Flame,
    tone: "danger",
    description: "Leads calientes según análisis semántico de la IA",
  },
  {
    id: "errores",
    label: "Errores detectados",
    icon: AlertTriangle,
    tone: "danger",
    description: "Fallos de sincronización, envío o integración",
  },
  {
    id: "automatizaciones",
    label: "Automatizaciones sugeridas",
    icon: Zap,
    tone: "success",
    description: "Recetas que la IA recomienda activar según tus patrones",
  },
];

function BandejaIA() {
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("all");

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <Inbox className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Bandeja IA
                </h1>
                <p className="text-sm text-muted-foreground">
                  Todas las recomendaciones que tu vendedor virtual detecta en tiempo real
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
                Todas
              </FilterPill>
              <FilterPill active={filter === "pending"} onClick={() => setFilter("pending")}>
                Pendientes
              </FilterPill>
              <FilterPill active={filter === "reviewed"} onClick={() => setFilter("reviewed")}>
                Revisadas
              </FilterPill>
            </div>
          </header>

          {/* Resumen */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Pendientes" value="—" tone="primary" />
            <SummaryStat label="Revisadas hoy" value="—" tone="success" />
            <SummaryStat label="Alta prioridad" value="—" tone="danger" />
            <SummaryStat label="Sugerencias activas" value="—" tone="accent" />
          </div>

          {/* Categorías */}
          <div className="grid gap-4 md:grid-cols-2">
            {categories.map((c) => (
              <CategoryCard key={c.id} category={c} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function CategoryCard({ category }: { category: Category }) {
  const Icon = category.icon;
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-500",
    warn: "bg-amber-500/10 text-amber-500",
    danger: "bg-rose-500/10 text-rose-500",
    accent: "bg-sky-500/10 text-sky-500",
  } as const;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneMap[category.tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{category.label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{category.description}</p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          0
        </span>
      </div>
      <div className="p-4 text-center text-xs text-muted-foreground">
        <Filter className="mx-auto mb-2 h-4 w-4 opacity-40" />
        Sin recomendaciones por ahora
      </div>
      <div className="flex items-center justify-between border-t border-border bg-secondary/30 px-4 py-2 text-xs">
        <button className="text-muted-foreground hover:text-foreground">Ver historial</button>
        <button className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <CheckCircle2 className="h-3.5 w-3.5" /> Marcar todo como revisado
        </button>
      </div>
    </div>
  );
}

function FilterPill({
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

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "danger" | "accent";
}) {
  const toneMap = {
    primary: "text-primary",
    success: "text-emerald-500",
    danger: "text-rose-500",
    accent: "text-sky-500",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", toneMap[tone])}>{value}</div>
    </div>
  );
}
