import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Sparkles,
  MessageSquare,
  Bot,
  UserCheck,
  Timer,
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle2,
  Pause,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  RefreshCw,
  Download,
  BookOpen,
  Workflow,
  BarChart3,
  Users,
  Flame,
  Brain,
  ArrowUpRight,
  Loader2,
  Filter,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  getAiAnalytics,
  listAnalyticsSuggestions,
  setSuggestionFeedback,
  type AiAnalytics,
  type AnalyticsRange,
  type SuggestionRow,
} from "@/lib/ai-analytics.functions";

export const Route = createFileRoute("/metricas-ia")({
  head: () => ({
    meta: [
      { title: "Análisis IA · Dialen" },
      {
        name: "description",
        content:
          "Panel de análisis del rendimiento de la IA comercial: sugerencias, agentes, automatizaciones y conocimiento.",
      },
    ],
  }),
  component: AnalisisIA,
});

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: 7, label: "Últimos 7 días" },
  { value: 14, label: "Últimos 14 días" },
  { value: 30, label: "Últimos 30 días" },
  { value: 60, label: "Últimos 60 días" },
  { value: 90, label: "Últimos 90 días" },
];

function AnalisisIA() {
  const qc = useQueryClient();
  const analyticsFn = useServerFn(getAiAnalytics);
  const [range, setRange] = useState<AnalyticsRange>(30);
  const [tab, setTab] = useState<"overview" | "suggestions" | "agents" | "automation" | "knowledge">(
    "overview",
  );

  useRealtimeInvalidate({
    channel: "ai-analytics",
    tables: [
      "ai_suggestions",
      "ai_insights",
      "automation_runs",
      "knowledge_usage",
      "messages",
      "conversations",
    ],
    invalidate: [["ai-analytics"]],
  });

  const q = useQuery({
    queryKey: ["ai-analytics", range],
    queryFn: () => analyticsFn({ data: { range } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const a = q.data;

  function doExport() {
    if (!a) return;
    const rows = [
      ["Métrica", "Valor"],
      ["Rango", `${a.range} días`],
      ["Mensajes salientes", a.totals.outbound],
      ["Respuestas IA", a.totals.outboundAi],
      ["Respuestas humanas", a.totals.outboundHuman],
      ["Mensajes entrantes", a.totals.inbound],
      ["% IA", a.totals.aiShare],
      ["Sugerencias generadas", a.totals.aiSuggestions],
      ["Sugerencias aceptadas", a.totals.aiAccepted],
      ["% Aceptación", a.totals.acceptRate],
      ["Confianza promedio", a.totals.avgConfidence],
      ["Tiempo respuesta prom. (s)", a.totals.avgResponseSeconds],
      ["Ejecuciones automatización", a.totals.automationRuns],
      ["Errores automatización", a.totals.automationErrors],
      ["Citas conocimiento", a.totals.knowledgeCitations],
      ["Conversaciones abiertas", a.totals.activeConversations],
      ["IA pausada", a.totals.aiPaused],
      ["Esperando >1h", a.totals.waitingTooLong],
      ["Leads calientes", a.totals.hotLeads],
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analisis-ia-${a.range}d-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Exportado a CSV");
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-8 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
                <Brain className="h-5 w-5 text-violet-500" />
                Análisis IA
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Cómo está trabajando tu vendedor virtual. Datos en tiempo real de sugerencias,
                automatizaciones y conocimiento.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as AnalyticsRange)}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ["ai-analytics"] })}
              >
                <RefreshCw className={cn("mr-2 h-3.5 w-3.5", q.isFetching && "animate-spin")} />
                Refrescar
              </Button>
              <Button size="sm" variant="outline" onClick={doExport} disabled={!a}>
                <Download className="mr-2 h-3.5 w-3.5" /> Exportar CSV
              </Button>
            </div>
          </div>

          {/* Alerts */}
          {a && a.alerts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {a.alerts.map((al) => (
                <AlertPill key={al.id} alert={al} />
              ))}
            </div>
          )}
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-8 mt-4 justify-start bg-transparent p-0">
            <TabsTrigger value="overview">
              <BarChart3 className="mr-2 h-3.5 w-3.5" /> Resumen
            </TabsTrigger>
            <TabsTrigger value="suggestions">
              <Sparkles className="mr-2 h-3.5 w-3.5" /> Sugerencias
            </TabsTrigger>
            <TabsTrigger value="agents">
              <Bot className="mr-2 h-3.5 w-3.5" /> Agentes
            </TabsTrigger>
            <TabsTrigger value="automation">
              <Workflow className="mr-2 h-3.5 w-3.5" /> Automatización
            </TabsTrigger>
            <TabsTrigger value="knowledge">
              <BookOpen className="mr-2 h-3.5 w-3.5" /> Conocimiento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex-1 overflow-y-auto p-8 pt-4">
            {q.isLoading || !a ? (
              <SkeletonGrid />
            ) : (
              <OverviewTab a={a} />
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="flex-1 overflow-y-auto p-8 pt-4">
            <SuggestionsTab range={range} />
          </TabsContent>

          <TabsContent value="agents" className="flex-1 overflow-y-auto p-8 pt-4">
            {q.isLoading || !a ? <SkeletonGrid /> : <AgentsTab a={a} />}
          </TabsContent>

          <TabsContent value="automation" className="flex-1 overflow-y-auto p-8 pt-4">
            {q.isLoading || !a ? <SkeletonGrid /> : <AutomationTab a={a} />}
          </TabsContent>

          <TabsContent value="knowledge" className="flex-1 overflow-y-auto p-8 pt-4">
            {q.isLoading || !a ? <SkeletonGrid /> : <KnowledgeTab a={a} />}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// -------- OVERVIEW --------

function OverviewTab({ a }: { a: AiAnalytics }) {
  const t = a.totals;
  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Respuestas de IA"
          value={t.outboundAi.toLocaleString()}
          hint={`${t.aiShare}% del total saliente`}
          delta={a.deltas.aiShare}
          deltaSuffix=" pts"
          icon={Bot}
          tone="violet"
        />
        <Kpi
          label="Sugerencias aceptadas"
          value={`${t.acceptRate}%`}
          hint={`${t.aiAccepted} de ${t.aiSuggestions}`}
          delta={a.deltas.acceptRate}
          deltaSuffix=" pts"
          icon={ThumbsUp}
          tone={t.acceptRate >= 40 ? "emerald" : "amber"}
        />
        <Kpi
          label="Confianza promedio"
          value={`${t.avgConfidence}%`}
          hint="Certeza del modelo"
          icon={TrendingUp}
          tone={t.avgConfidence >= 65 ? "emerald" : t.avgConfidence >= 45 ? "amber" : "rose"}
        />
        <Kpi
          label="Tiempo de respuesta"
          value={formatDuration(t.avgResponseSeconds)}
          hint="Primera respuesta al cliente"
          icon={Timer}
          tone={t.avgResponseSeconds < 120 ? "emerald" : t.avgResponseSeconds < 600 ? "amber" : "rose"}
        />
        <Kpi
          label="Automatizaciones"
          value={t.automationRuns.toLocaleString()}
          hint={`${t.automationErrorRate}% con error`}
          delta={-a.deltas.automationErrorRate}
          deltaSuffix=" pts"
          icon={Workflow}
          tone={t.automationErrorRate < 10 ? "emerald" : "amber"}
        />
        <Kpi
          label="Citas de conocimiento"
          value={t.knowledgeCitations.toLocaleString()}
          hint="La IA usó tu base"
          icon={BookOpen}
          tone="violet"
        />
        <Kpi
          label="Leads calientes"
          value={t.hotLeads.toLocaleString()}
          hint="Prob. de cierre ≥70%"
          icon={Flame}
          tone="rose"
        />
        <Kpi
          label="Chats abiertos"
          value={t.activeConversations.toLocaleString()}
          hint={`${t.aiPaused} con IA pausada`}
          icon={MessageSquare}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-primary" /> Actividad diaria
            </div>
            <Legend />
          </div>
          <ActivityChart series={a.series} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4 text-primary" /> Latencia de respuesta
          </div>
          <LatencyBars data={a.latencyBuckets} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-violet-500" /> Confianza vs Aceptación
          </div>
          <ConfidenceChart data={a.confidenceBuckets} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" /> Actividad humana
          </div>
          <SellerList sellers={a.sellers} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-amber-500" /> Intenciones detectadas
          </div>
          <DistList items={a.intents.map((i) => ({ label: i.intent, value: i.count }))} tone="amber" />
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4 text-violet-500" /> Sentimiento del cliente
          </div>
          <DistList
            items={a.sentiments.map((s) => ({ label: s.sentiment, value: s.count }))}
            tone="violet"
          />
        </Card>
      </div>
    </div>
  );
}

// -------- SUGGESTIONS --------

function SuggestionsTab({ range }: { range: AnalyticsRange }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAnalyticsSuggestions);
  const feedbackFn = useServerFn(setSuggestionFeedback);
  const [agent, setAgent] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["ai-suggestions", range, agent, status, search],
    queryFn: () =>
      listFn({
        data: {
          range,
          agent_type: agent === "all" ? null : agent,
          status: (status === "all" ? null : (status as any)) as any,
          search: search || null,
          limit: 100,
        },
      }),
    staleTime: 15_000,
  });

  const mut = useMutation({
    mutationFn: (v: { id: string; outcome: "used" | "discarded" | "pending" }) =>
      feedbackFn({ data: v }),
    onSuccess: () => {
      toast.success("Feedback registrado");
      qc.invalidateQueries({ queryKey: ["ai-suggestions"] });
      qc.invalidateQueries({ queryKey: ["ai-analytics"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const rows = q.data ?? [];
  const acceptRate = useMemo(() => {
    if (!rows.length) return 0;
    const acc = rows.filter((r) => r.status === "used").length;
    return Math.round((acc / rows.length) * 100);
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en el texto de la sugerencia…"
              className="pl-8"
            />
          </div>
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los agentes</SelectItem>
              <SelectItem value="sales">Ventas</SelectItem>
              <SelectItem value="support">Soporte</SelectItem>
              <SelectItem value="post_sale">Post-venta</SelectItem>
              <SelectItem value="analysis">Análisis</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="used">Aceptadas</SelectItem>
              <SelectItem value="discarded">Descartadas</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-muted-foreground">
            {rows.length} sugerencias · {acceptRate}% aceptación
          </div>
        </div>
      </Card>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <div className="text-sm font-medium">Sin sugerencias en este rango</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuando la IA analice conversaciones, sus sugerencias aparecerán aquí.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <SuggestionCard
              key={r.id}
              row={r}
              onFeedback={(outcome) => mut.mutate({ id: r.id, outcome })}
              busy={mut.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionCard({
  row,
  onFeedback,
  busy,
}: {
  row: SuggestionRow;
  onFeedback: (o: "used" | "discarded" | "pending") => void;
  busy: boolean;
}) {
  const statusColor =
    row.status === "used"
      ? "bg-emerald-500/10 text-emerald-500"
      : row.status === "discarded"
        ? "bg-rose-500/10 text-rose-500"
        : "bg-amber-500/10 text-amber-500";
  const statusLabel =
    row.status === "used" ? "Aceptada" : row.status === "discarded" ? "Descartada" : "Pendiente";

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded uppercase">
          {row.agent_type}
        </Badge>
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
        {row.intent && (
          <Badge variant="outline" className="rounded">
            {row.intent}
          </Badge>
        )}
        {typeof row.confidence === "number" && (
          <Badge variant="outline" className="rounded">
            Conf. {Math.round(row.confidence * 100)}%
          </Badge>
        )}
        {typeof row.probability === "number" && (
          <Badge variant="outline" className="rounded">
            Prob. cierre {Math.round(row.probability * 100)}%
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{relTime(row.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground/90">{row.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {row.customer_id && (
          <Link
            to="/clientes/$id"
            params={{ id: row.customer_id }}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"
          >
            <UserCheck className="h-3 w-3" /> {row.customer_name ?? "Cliente"}
          </Link>
        )}
        <Link
          to="/conversaciones"
          hash={`conv=${row.conversation_id}`}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted"
        >
          <MessageSquare className="h-3 w-3" /> Abrir chat
          <ArrowUpRight className="h-3 w-3" />
        </Link>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant={row.status === "used" ? "default" : "outline"}
            className="h-7"
            disabled={busy}
            onClick={() => onFeedback("used")}
          >
            <ThumbsUp className="mr-1 h-3 w-3" /> Aceptar
          </Button>
          <Button
            size="sm"
            variant={row.status === "discarded" ? "default" : "outline"}
            className="h-7"
            disabled={busy}
            onClick={() => onFeedback("discarded")}
          >
            <ThumbsDown className="mr-1 h-3 w-3" /> Descartar
          </Button>
        </div>
      </div>
    </li>
  );
}

// -------- AGENTS --------

function AgentsTab({ a }: { a: AiAnalytics }) {
  const agentLabels: Record<string, string> = {
    sales: "Ventas",
    support: "Soporte",
    post_sale: "Post-venta",
    analysis: "Análisis",
  };
  if (a.agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-14 text-center">
        <Bot className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <div className="text-sm font-medium">Sin actividad de agentes</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Cuando la IA genere sugerencias verás el desempeño por especialista.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {a.agents.map((ag) => (
        <Card key={ag.agent_type} className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium">{agentLabels[ag.agent_type] ?? ag.agent_type}</div>
                <div className="text-xs text-muted-foreground">
                  {ag.suggestions} sugerencias generadas
                </div>
              </div>
            </div>
            <Badge
              variant={ag.accept_rate >= 40 ? "default" : "outline"}
              className="rounded"
            >
              {ag.accept_rate}% aceptación
            </Badge>
          </div>
          <div className="space-y-2 text-xs">
            <MiniBar label="Aceptadas" value={ag.accepted} total={ag.suggestions} tone="emerald" />
            <MiniBar label="Descartadas" value={ag.discarded} total={ag.suggestions} tone="rose" />
            <MiniBar label="Pendientes" value={ag.pending} total={ag.suggestions} tone="amber" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border p-2">
              <div className="text-muted-foreground">Confianza prom.</div>
              <div className="font-display text-lg font-semibold">{ag.avg_confidence}%</div>
            </div>
            <div className="rounded-md border border-border p-2">
              <div className="text-muted-foreground">Prob. cierre prom.</div>
              <div className="font-display text-lg font-semibold">{ag.avg_probability}%</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// -------- AUTOMATION --------

function AutomationTab({ a }: { a: AiAnalytics }) {
  const t = a.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ejecuciones" value={t.automationRuns.toLocaleString()} icon={Workflow} />
        <Kpi
          label="Errores"
          value={t.automationErrors.toLocaleString()}
          hint={t.automationRuns > 0 ? `${t.automationErrorRate}% del total` : "—"}
          icon={AlertTriangle}
          tone={t.automationRuns === 0 ? undefined : t.automationErrorRate > 10 ? "rose" : "emerald"}
        />
        <Kpi
          label="Tasa de éxito"
          value={t.automationRuns > 0 ? `${Math.max(0, 100 - t.automationErrorRate)}%` : "—"}
          hint={t.automationRuns > 0 ? undefined : "Sin ejecuciones en el rango"}
          icon={CheckCircle2}
          tone={t.automationRuns > 0 ? "emerald" : undefined}
        />
        <Kpi
          label="Flujos con actividad"
          value={a.topAutomations.length.toLocaleString()}
          hint={a.topAutomations.length ? "En el rango seleccionado" : "—"}
          icon={Zap}
        />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Flujos con más actividad</div>
          <Link to="/automatizaciones" className="text-xs text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        {a.topAutomations.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Sin ejecuciones en este rango
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {a.topAutomations.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Workflow className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.runs} ejecuciones · {f.errors} con error · {(f.avg_ms / 1000).toFixed(1)}s prom.
                  </div>
                </div>
                <Badge
                  variant={f.successRate >= 90 ? "default" : "outline"}
                  className={cn(
                    "rounded",
                    f.successRate < 70 && "border-rose-500/30 text-rose-500",
                  )}
                >
                  {f.successRate}% éxito
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 text-sm font-medium">Ejecuciones diarias</div>
        <AutomationChart series={a.series} />
      </Card>
    </div>
  );
}

// -------- KNOWLEDGE --------

function KnowledgeTab({ a }: { a: AiAnalytics }) {
  const t = a.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi
          label="Citas totales"
          value={t.knowledgeCitations.toLocaleString()}
          hint="La IA usó tu base"
          icon={BookOpen}
          tone="violet"
        />
        <Kpi
          label="Cobertura de IA"
          value={
            t.aiSuggestions > 0
              ? `${Math.min(100, Math.round((t.knowledgeCitations / t.aiSuggestions) * 100))}%`
              : "—"
          }
          hint="Citas ÷ sugerencias"
          icon={ThumbsUp}
        />
        <Kpi
          label="Documentos activos"
          value={a.topDocuments.length}
          hint="Con al menos 1 cita"
          icon={Sparkles}
        />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Documentos más citados</div>
          <Link to="/conocimiento" className="text-xs text-primary hover:underline">
            Gestionar base
          </Link>
        </div>
        {a.topDocuments.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            La IA no ha citado documentos aún. Sube manuales, FAQ o catálogos.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {a.topDocuments.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {d.last_used_at ? relTime(d.last_used_at) : "—"}
                </span>
                <Badge variant="secondary" className="rounded">
                  {d.citations} citas
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 text-sm font-medium">Citas por día</div>
        <CitationsChart series={a.series} />
      </Card>
    </div>
  );
}

// -------- Shared building blocks --------

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  delta,
  deltaSuffix,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: any;
  tone?: "emerald" | "amber" | "rose" | "violet";
  delta?: number;
  deltaSuffix?: string;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : tone === "rose"
          ? "text-rose-500"
          : tone === "violet"
            ? "text-violet-500"
            : "text-primary";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{hint}</span>
        {typeof delta === "number" && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              delta > 0 ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaSuffix ?? "%"}
          </span>
        )}
      </div>
    </Card>
  );
}

function AlertPill({
  alert,
}: {
  alert: AiAnalytics["alerts"][number];
}) {
  const tone =
    alert.severity === "critical"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-500"
      : alert.severity === "warning"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-600"
        : "border-primary/30 bg-primary/5 text-primary";
  const content = (
    <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${tone}`}>
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>{alert.title}</span>
      <span className="text-muted-foreground">· {alert.detail}</span>
      {alert.href && <ArrowUpRight className="h-3 w-3" />}
    </div>
  );
  return alert.href ? (
    <Link to={alert.href as any}>{content}</Link>
  ) : (
    content
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" /> Salientes
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-violet-500" /> IA
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" /> Entrantes
      </span>
    </div>
  );
}

function ActivityChart({ series }: { series: AiAnalytics["series"] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.inbound, d.outbound)));
  return (
    <div className="flex h-40 items-end gap-1">
      {series.map((d) => (
        <div key={d.date} className="group flex flex-1 flex-col items-center justify-end gap-0.5"
          title={`${d.date} · IN ${d.inbound} · OUT ${d.outbound} (IA ${d.outboundAi})`}>
          <div
            className="w-full rounded-t bg-violet-500/80"
            style={{ height: `${(d.outboundAi / max) * 100}%` }}
          />
          <div
            className="w-full bg-primary/70"
            style={{ height: `${((d.outbound - d.outboundAi) / max) * 100}%` }}
          />
          <div
            className="w-full rounded-b bg-muted-foreground/30"
            style={{ height: `${(d.inbound / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function AutomationChart({ series }: { series: AiAnalytics["series"] }) {
  const max = Math.max(1, ...series.map((d) => d.runs));
  return (
    <div className="flex h-32 items-end gap-1">
      {series.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-0.5"
          title={`${d.date} · ${d.runs} exec · ${d.errors} err`}>
          <div className="w-full rounded-t bg-rose-500/70" style={{ height: `${(d.errors / max) * 100}%` }} />
          <div className="w-full bg-primary/70" style={{ height: `${((d.runs - d.errors) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function CitationsChart({ series }: { series: AiAnalytics["series"] }) {
  const max = Math.max(1, ...series.map((d) => d.citations));
  return (
    <div className="flex h-28 items-end gap-1">
      {series.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-end" title={`${d.date} · ${d.citations} citas`}>
          <div className="w-full rounded-t bg-violet-500/70" style={{ height: `${(d.citations / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function LatencyBars({ data }: { data: AiAnalytics["latencyBuckets"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="text-xs">
          <div className="mb-1 flex justify-between">
            <span className="text-muted-foreground">{d.label}</span>
            <span className="font-medium">{d.count}</span>
          </div>
          <Progress value={(d.count / max) * 100} className="h-1.5" />
        </li>
      ))}
    </ul>
  );
}

function ConfidenceChart({ data }: { data: AiAnalytics["confidenceBuckets"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const rate = d.count ? Math.round((d.accepted / d.count) * 100) : 0;
        return (
          <div key={d.label} className="text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-medium">
                {d.count} · {rate}% aceptadas
              </span>
            </div>
            <div className="relative h-2 rounded bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded bg-violet-500/60"
                style={{ width: `${(d.count / max) * 100}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded bg-emerald-500"
                style={{ width: `${((d.accepted || 0) / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-2 text-[10px] text-muted-foreground">
        Barra clara: total. Barra sólida: aceptadas.
      </div>
    </div>
  );
}

function DistList({
  items,
  tone,
}: {
  items: { label: string; value: number }[];
  tone: "amber" | "violet";
}) {
  if (items.length === 0)
    return <div className="text-sm text-muted-foreground">Sin datos aún.</div>;
  const total = items.reduce((a, b) => a + b.value, 0);
  const barCls = tone === "amber" ? "bg-amber-500/70" : "bg-violet-500/70";
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const pct = total ? Math.round((i.value / total) * 100) : 0;
        return (
          <li key={i.label} className="text-xs">
            <div className="mb-1 flex justify-between">
              <span className="capitalize">{i.label}</span>
              <span className="text-muted-foreground">
                {i.value} · {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded bg-muted">
              <div className={`h-full rounded ${barCls}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SellerList({ sellers }: { sellers: AiAnalytics["sellers"] }) {
  if (sellers.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        Aún no hay mensajes salientes de miembros del equipo en este periodo.
      </div>
    );
  const max = Math.max(1, ...sellers.map((s) => s.outbound));
  return (
    <ul className="space-y-2">
      {sellers.map((s) => (
        <li key={s.sender_id} className="text-xs">
          <div className="mb-1 flex justify-between">
            <span className="font-medium">{s.name}</span>
            <span className="text-muted-foreground">{s.outbound} respuestas</span>
          </div>
          <Progress value={(s.outbound / max) * 100} className="h-1.5" />
        </li>
      ))}
    </ul>
  );
}

function MiniBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "emerald" | "rose" | "amber";
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const cls =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "rose"
        ? "bg-rose-500"
        : "bg-amber-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value} · {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded bg-muted">
        <div className={`h-full rounded ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card/50" />
      ))}
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

function relTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace segs";
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString();
}
