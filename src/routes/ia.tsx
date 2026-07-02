import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Target,
  BarChart3,
  LifeBuoy,
  HeartHandshake,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Lock,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { getAiOverview } from "@/lib/ai-agents.functions";
import { AGENTS } from "@/lib/ai-agents/registry";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ia")({
  head: () => ({ meta: [{ title: "Panel de IA — Dialen" }] }),
  component: IaPage,
});

const AGENT_ICONS = { Target, BarChart3, LifeBuoy, HeartHandshake } as const;

function IaPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getAiOverview);
  const { data } = useQuery({
    queryKey: ["ai-overview"],
    queryFn: () => overviewFn(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("ia-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_suggestions" }, () =>
        qc.invalidateQueries({ queryKey: ["ai-overview"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_insights" }, () =>
        qc.invalidateQueries({ queryKey: ["ai-overview"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const t = data?.totals;
  const recent = data?.recent ?? [];
  const hot = data?.hot ?? [];

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6 lg:p-8">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Panel de IA</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Sistema nervioso del SaaS: agentes especializados que observan el CRM, la Bandeja y el Embudo
                y sugieren la mejor acción en cada momento.
              </p>
            </div>
          </header>

          {/* KPIs */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={Sparkles} label="Sugerencias" value={t?.total ?? 0} />
            <Kpi
              icon={CheckCircle2}
              label="Aplicadas"
              value={t?.used ?? 0}
              hint={t?.total ? `${Math.round(((t.used ?? 0) / t.total) * 100)}% adopción` : undefined}
              tone="emerald"
            />
            <Kpi
              icon={Flame}
              label="Leads calientes"
              value={t?.highIntent ?? 0}
              tone="amber"
            />
            <Kpi
              icon={AlertTriangle}
              label="En riesgo"
              value={t?.highRisk ?? 0}
              tone="rose"
            />
          </section>

          {/* Agents */}
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Agentes
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {AGENTS.map((a) => {
                const Icon = AGENT_ICONS[a.icon as keyof typeof AGENT_ICONS] ?? Sparkles;
                const soon = a.status === "soon";
                return (
                  <div
                    key={a.type}
                    className={cn(
                      "rounded-xl border p-4",
                      soon ? "border-dashed border-border/50 bg-muted/20" : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            soon ? "bg-muted text-muted-foreground" : `bg-${a.color}-500/10 text-${a.color}-600`,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{a.label}</div>
                            {soon ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <Lock className="h-2.5 w-2.5" /> Próximamente
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                                Activo
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                        </div>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1">
                      {a.capabilities.map((c) => (
                        <li key={c} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Hot leads */}
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Leads más calientes
                </h2>
                <Link
                  to="/embudo"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Ver embudo <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {hot.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Aún no hay clientes analizados. Abre una conversación y pulsa "Analizar con IA".
                </p>
              ) : (
                <ul className="space-y-2">
                  {hot.map((h: any) => (
                    <li
                      key={h.customer_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/clientes/$id"
                          params={{ id: h.customer_id }}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {h.customers?.name ?? h.customers?.phone ?? "Sin nombre"}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">
                          {h.next_best_action ?? "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-emerald-600">
                          {Math.round((Number(h.probability) || 0) * 100)}%
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {h.intent ?? "—"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recent activity */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Actividad reciente de IA
              </h2>
              {recent.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Sin actividad todavía.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recent.map((r: any) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border/60 bg-background p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              r.status === "used"
                                ? "bg-emerald-500/15 text-emerald-600"
                                : r.status === "discarded"
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-primary/10 text-primary",
                            )}
                          >
                            {r.status === "used" ? "usada" : r.status === "discarded" ? "descartada" : "pendiente"}
                          </span>
                          <span className="text-muted-foreground">
                            {r.agent_type} · {r.intent ?? "—"}
                          </span>
                        </div>
                        {r.probability != null && (
                          <span className="text-muted-foreground">
                            {Math.round(Number(r.probability) * 100)}%
                          </span>
                        )}
                      </div>
                      {r.text && (
                        <p className="mt-1 line-clamp-2 text-foreground/80">{r.text}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Integration map */}
          <section className="mt-6 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Integraciones activas
            </h2>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <IntegrationChip icon={Sparkles} label="Bandeja" ok />
              <IntegrationChip icon={TrendingUp} label="Embudo" ok />
              <IntegrationChip icon={CheckCircle2} label="CRM · Timeline" ok />
              <IntegrationChip icon={Lock} label="Automatizaciones · disparadores IA (próx.)" />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: typeof Sparkles;
  label: string;
  value: number;
  hint?: string;
  tone?: "primary" | "emerald" | "amber" | "rose";
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", toneMap[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">
        {typeof value === "number" ? value.toLocaleString("es") : value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function IntegrationChip({
  icon: Icon,
  label,
  ok = false,
}: {
  icon: typeof Sparkles;
  label: string;
  ok?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", ok ? "text-emerald-600" : "text-muted-foreground")} />
      <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </div>
  );
}
