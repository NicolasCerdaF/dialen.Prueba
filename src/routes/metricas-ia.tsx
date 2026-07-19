import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  MessageSquare,
  Bot,
  UserCheck,
  Timer,
  TrendingUp,
  Zap,
  CheckCircle2,
  Pause,
  ThumbsUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getDashboardMetrics } from "@/lib/metrics.functions";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const Route = createFileRoute("/metricas-ia")({
  head: () => ({ meta: [{ title: "Métricas de IA — Dialen" }] }),
  component: MetricasIA,
});

function MetricasIA() {
  const fetchMetrics = useServerFn(getDashboardMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["metrics-ia"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const m = data;
  const aiShare =
    m && m.outbound > 0 ? Math.round((m.outboundAi / m.outbound) * 100) : 0;
  const acceptRate =
    m && m.aiSuggestions > 0
      ? Math.round((m.aiAccepted / m.aiSuggestions) * 100)
      : 0;
  const avgResp = m ? formatDuration(m.avgResponseSeconds) : "—";

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Métricas de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Rendimiento del vendedor virtual en los últimos 30 días
              </p>
            </div>
          </header>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-border bg-card/50"
                />
              ))}
            </div>
          ) : !m ? (
            <p className="text-sm text-muted-foreground">
              Sin datos aún. Cuando la IA empiece a conversar, sus métricas aparecerán aquí.
            </p>
          ) : (
            <>
              {/* Row 1: participación IA */}
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Participación
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiCard
                    icon={<Bot className="h-4 w-4" />}
                    label="Respuestas de IA"
                    value={m.outboundAi.toLocaleString()}
                    hint={`${aiShare}% de todos los mensajes salientes`}
                    accent="primary"
                  />
                  <KpiCard
                    icon={<UserCheck className="h-4 w-4" />}
                    label="Respuestas humanas"
                    value={m.outboundHuman.toLocaleString()}
                    hint={`${100 - aiShare}% de mensajes salientes`}
                  />
                  <KpiCard
                    icon={<MessageSquare className="h-4 w-4" />}
                    label="Mensajes entrantes"
                    value={m.inbound.toLocaleString()}
                    hint="Últimos 30 días"
                  />
                  <KpiCard
                    icon={<Timer className="h-4 w-4" />}
                    label="Tiempo medio de respuesta"
                    value={avgResp}
                    hint="Cliente → primera respuesta"
                    accent={m.avgResponseSeconds < 120 ? "success" : "warning"}
                  />
                </div>
              </section>

              {/* Row 2: calidad IA */}
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Calidad de la IA
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiCard
                    icon={<Zap className="h-4 w-4" />}
                    label="Sugerencias generadas"
                    value={m.aiSuggestions.toLocaleString()}
                    hint="Análisis + recomendaciones"
                  />
                  <KpiCard
                    icon={<ThumbsUp className="h-4 w-4" />}
                    label="Sugerencias aceptadas"
                    value={m.aiAccepted.toLocaleString()}
                    hint={`${acceptRate}% aceptación humana`}
                    accent={acceptRate >= 40 ? "success" : "warning"}
                  />
                  <KpiCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="Confianza promedio"
                    value={`${m.aiAvgConfidence}%`}
                    hint="Certeza del modelo"
                  />
                  <KpiCard
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Tasa de respuesta"
                    value={`${m.responseRate}%`}
                    hint="Saliente ÷ entrante"
                  />
                </div>
              </section>

              {/* Row 3: estado operativo */}
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estado operativo
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiCard
                    icon={<MessageSquare className="h-4 w-4" />}
                    label="Chats abiertos"
                    value={m.activeConversations.toLocaleString()}
                  />
                  <KpiCard
                    icon={<Bot className="h-4 w-4" />}
                    label="IA activa"
                    value={m.aiActiveConversations.toLocaleString()}
                    hint={`${m.aiPausedConversations} en pausa manual`}
                    accent="primary"
                  />
                  <KpiCard
                    icon={<Pause className="h-4 w-4" />}
                    label="IA pausada"
                    value={m.aiPausedConversations.toLocaleString()}
                    hint="Intervención humana"
                    accent={m.aiPausedConversations > 0 ? "warning" : undefined}
                  />
                  <KpiCard
                    icon={<Timer className="h-4 w-4" />}
                    label="Esperando > 1h"
                    value={m.waitingTooLong.toLocaleString()}
                    hint="Sin respuesta prolongada"
                    accent={m.waitingTooLong > 0 ? "destructive" : "success"}
                  />
                </div>
              </section>

              {/* Serie mensajes */}
              <section className="mb-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Volumen diario (30 días)
                </h2>
                <MessagesChart series={m.series} />
              </section>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "destructive";
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary"
      : accent === "success"
        ? "text-emerald-500"
        : accent === "warning"
          ? "text-amber-500"
          : accent === "destructive"
            ? "text-red-500"
            : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-panel">
      <div className={cn("flex items-center gap-2 text-xs font-medium", accentClass)}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function MessagesChart({
  series,
}: {
  series: { date: string; inbound: number; outbound: number }[];
}) {
  const max = Math.max(
    1,
    ...series.map((d) => Math.max(d.inbound, d.outbound)),
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Salientes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" />
          Entrantes
        </span>
      </div>
      <div className="flex h-32 items-end gap-1">
        {series.map((d) => (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col items-center justify-end gap-0.5"
            title={`${d.date} · ${d.inbound} in / ${d.outbound} out`}
          >
            <div
              className="w-full rounded-t bg-primary/80"
              style={{ height: `${(d.outbound / max) * 100}%` }}
            />
            <div
              className="w-full rounded-t bg-muted-foreground/40"
              style={{ height: `${(d.inbound / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
