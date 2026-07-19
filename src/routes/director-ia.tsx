import { createFileRoute } from "@tanstack/react-router";
import {
  Sparkles,
  Users,
  Package,
  MessageSquareOff,
  ShieldAlert,
  Megaphone,
  UserCog,
  Flame,
  FileWarning,
  Info,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const Route = createFileRoute("/director-ia")({
  head: () => ({ meta: [{ title: "Director Comercial IA — Dialen" }] }),
  component: DirectorIA,
});

type Insight = {
  id: string;
  icon: typeof Users;
  title: string;
  description: string;
  tone: "primary" | "success" | "warn" | "danger" | "accent";
};

const insights: Insight[] = [
  {
    id: "contactar",
    icon: Users,
    title: "Qué clientes contactar",
    description: "Clientes con señales activas que conviene retomar hoy",
    tone: "primary",
  },
  {
    id: "productos",
    icon: Package,
    title: "Qué productos potenciar",
    description: "Productos con mayor tracción en las conversaciones recientes",
    tone: "accent",
  },
  {
    id: "detenidas",
    icon: MessageSquareOff,
    title: "Conversaciones detenidas",
    description: "Chats que se enfriaron y necesitan una acción humana",
    tone: "warn",
  },
  {
    id: "objeciones",
    icon: ShieldAlert,
    title: "Objeciones frecuentes",
    description: "Patrones de duda detectados por la IA en las últimas semanas",
    tone: "danger",
  },
  {
    id: "campañas",
    icon: Megaphone,
    title: "Campañas recomendadas",
    description: "Segmentos y mensajes que la IA sugiere activar",
    tone: "success",
  },
  {
    id: "vendedores",
    icon: UserCog,
    title: "Vendedores que necesitan apoyo",
    description: "Miembros del equipo con métricas bajo el promedio",
    tone: "warn",
  },
  {
    id: "hot",
    icon: Flame,
    title: "Clientes con alta probabilidad",
    description: "Leads listos para comprar según análisis semántico",
    tone: "danger",
  },
  {
    id: "riesgo",
    icon: FileWarning,
    title: "Cotizaciones en riesgo",
    description: "Cotizaciones enviadas sin respuesta próximas a vencer",
    tone: "warn",
  },
];

function DirectorIA() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Director Comercial <span className="text-gradient-primary">IA</span>
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  El cerebro estratégico de Dialen. Analiza toda tu operación y sugiere qué hacer hoy,
                  con explicación y beneficio esperado en cada recomendación.
                </p>
              </div>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
              <RefreshCw className="h-4 w-4" />
              Volver a analizar
            </button>
          </header>

          {/* Banner explicativo */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-xs text-muted-foreground">
              Este panel <span className="font-medium text-foreground">no es un chat</span>. La IA
              revisa constantemente conversaciones, clientes, cotizaciones y catálogo para producir
              un plan del día basado en datos reales de tu empresa.
            </div>
          </div>

          {/* Resumen ejecutivo */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <ExecStat label="Recomendaciones hoy" value="—" tone="primary" />
            <ExecStat label="Ingresos potenciales" value="—" tone="success" />
            <ExecStat label="Riesgos detectados" value="—" tone="danger" />
          </div>

          {/* Grid de insights */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.icon;
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-500",
    warn: "bg-amber-500/10 text-amber-500",
    danger: "bg-rose-500/10 text-rose-500",
    accent: "bg-sky-500/10 text-sky-500",
  } as const;
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneMap[insight.tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{insight.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{insight.description}</p>
        </div>
      </div>

      {/* Ejemplo de recomendación */}
      <div className="mx-4 mb-4 rounded-lg border border-dashed border-border bg-secondary/40 p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Por qué</div>
        <p className="mt-1 text-xs text-foreground/80">
          La IA explicará aquí el patrón detectado que justifica esta recomendación.
        </p>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
          Beneficio esperado
        </div>
        <p className="mt-1 text-xs text-foreground/80">
          Impacto estimado sobre ventas, conversión o tiempo de cierre.
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border bg-secondary/30 px-4 py-2 text-xs">
        <span className="text-muted-foreground">0 recomendaciones</span>
        <button className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Ver detalles <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ExecStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "danger";
}) {
  const toneMap = {
    primary: "text-primary",
    success: "text-emerald-500",
    danger: "text-rose-500",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", toneMap[tone])}>{value}</div>
    </div>
  );
}
