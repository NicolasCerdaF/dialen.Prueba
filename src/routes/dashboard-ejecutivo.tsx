import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart3,
  DollarSign,
  Percent,
  Users,
  Timer,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Trophy,
  Download,
  RefreshCw,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Target,
  Package,
  MessageSquare,
  Wallet,
  Wand2,
  CheckCircle2,
  Copy,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  getExecutiveDashboard,
  generateExecutiveBriefing,
  type ExecRange,
  type ExecutiveDashboard,
} from "@/lib/executive.functions";

export const Route = createFileRoute("/dashboard-ejecutivo")({
  head: () => ({
    meta: [
      { title: "Dashboard Ejecutivo · Dialen" },
      {
        name: "description",
        content:
          "Visión completa del negocio: ingresos, embudo, equipo y desempeño de la IA en tiempo real.",
      },
    ],
  }),
  component: DashboardEjecutivo,
});

const RANGE_LABEL: Record<ExecRange, string> = {
  7: "Últimos 7 días",
  30: "Últimos 30 días",
  90: "Últimos 90 días",
};

function DashboardEjecutivo() {
  const qc = useQueryClient();
  const [range, setRange] = useState<ExecRange>(30);
  const [tab, setTab] = useState<"overview" | "sales" | "team" | "products" | "operations">(
    "overview",
  );

  const dashFn = useServerFn(getExecutiveDashboard);
  const briefingFn = useServerFn(generateExecutiveBriefing);

  useRealtimeInvalidate({
    channel: "exec-dashboard",
    tables: [
      "quotes",
      "customers",
      "conversations",
      "messages",
      "automation_runs",
      "ai_suggestions",
    ],
    invalidate: [["exec-dashboard"]],
  });

  const q = useQuery({
    queryKey: ["exec-dashboard", range],
    queryFn: () => dashFn({ data: { range } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const dash = q.data;

  const briefing = useMutation({
    mutationFn: () => briefingFn({ data: { range } }),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  function copyBriefing() {
    if (!briefing.data?.briefing) return;
    navigator.clipboard.writeText(briefing.data.briefing);
    toast.success("Briefing copiado");
  }

  function exportCsv() {
    if (!dash) return;
    exportDashboardCsv(dash);
    toast.success("Exportado a CSV");
  }

  function exportSeries() {
    if (!dash) return;
    const rows = [
      ["Fecha", "Ingresos", "Cotizaciones", "Aceptadas", "Conversaciones", "Nuevos clientes", "IN", "OUT", "IA"],
      ...dash.series.map((r) => [
        r.date,
        r.revenue,
        r.quotesSent,
        r.quotesAccepted,
        r.conversations,
        r.newCustomers,
        r.inbound,
        r.outbound,
        r.outboundAi,
      ]),
    ];
    downloadCsv(rows, `serie-diaria-${dash.range}d.csv`);
    toast.success("Serie diaria exportada");
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b border-border bg-card px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <BarChart3 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Dashboard Ejecutivo
                </h1>
                <p className="text-sm text-muted-foreground">
                  {dash?.header.companyName
                    ? `${dash.header.companyName} · ${RANGE_LABEL[range]}`
                    : `Visión completa del negocio · ${RANGE_LABEL[range]}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as ExecRange)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 días</SelectItem>
                  <SelectItem value="30">Últimos 30 días</SelectItem>
                  <SelectItem value="90">Últimos 90 días</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ["exec-dashboard"] })}
              >
                <RefreshCw className={cn("mr-2 h-3.5 w-3.5", q.isFetching && "animate-spin")} />
                Refrescar
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!dash}>
                <Download className="mr-2 h-3.5 w-3.5" /> Resumen
              </Button>
              <Button size="sm" variant="outline" onClick={exportSeries} disabled={!dash}>
                <Download className="mr-2 h-3.5 w-3.5" /> Serie diaria
              </Button>
            </div>
          </div>

          {dash && dash.alerts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {dash.alerts.map((a) => (
                <AlertChip key={a.id} alert={a} />
              ))}
            </div>
          )}
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-4 justify-start bg-transparent p-0 sm:mx-6 lg:mx-8">
            <TabsTrigger value="overview">
              <BarChart3 className="mr-2 h-3.5 w-3.5" /> Resumen
            </TabsTrigger>
            <TabsTrigger value="sales">
              <DollarSign className="mr-2 h-3.5 w-3.5" /> Ventas
            </TabsTrigger>
            <TabsTrigger value="team">
              <Trophy className="mr-2 h-3.5 w-3.5" /> Equipo
            </TabsTrigger>
            <TabsTrigger value="products">
              <Package className="mr-2 h-3.5 w-3.5" /> Productos
            </TabsTrigger>
            <TabsTrigger value="operations">
              <Bot className="mr-2 h-3.5 w-3.5" /> Operación & IA
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            {q.isLoading || !dash ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card/50" />
                ))}
              </div>
            ) : (
              <>
                <TabsContent value="overview" className="m-0 space-y-6">
                  <OverviewTab
                    dash={dash}
                    briefing={briefing.data?.briefing ?? null}
                    briefingLoading={briefing.isPending}
                    onGenerate={() => briefing.mutate()}
                    onCopy={copyBriefing}
                  />
                </TabsContent>
                <TabsContent value="sales" className="m-0 space-y-6">
                  <SalesTab dash={dash} />
                </TabsContent>
                <TabsContent value="team" className="m-0 space-y-6">
                  <TeamTab dash={dash} />
                </TabsContent>
                <TabsContent value="products" className="m-0 space-y-6">
                  <ProductsTab dash={dash} />
                </TabsContent>
                <TabsContent value="operations" className="m-0 space-y-6">
                  <OperationsTab dash={dash} />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------- Tabs ----------

function OverviewTab({
  dash,
  briefing,
  briefingLoading,
  onGenerate,
  onCopy,
}: {
  dash: ExecutiveDashboard;
  briefing: string | null;
  briefingLoading: boolean;
  onGenerate: () => void;
  onCopy: () => void;
}) {
  const t = dash.totals;
  const d = dash.deltas;
  const cur = t.currency;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ingresos"
          value={t.revenue > 0 ? fmtMoney(t.revenue, cur) : "—"}
          hint={
            t.quotesAccepted > 0
              ? `${t.quotesAccepted} cotizaciones ganadas`
              : "Sin ventas cerradas aún"
          }
          delta={t.revenue > 0 ? d.revenue : undefined}
          icon={DollarSign}
          tone="emerald"
        />
        <Kpi
          label="Conversión"
          value={t.newCustomers > 0 ? `${t.conversionRate}%` : "—"}
          hint={
            t.newCustomers > 0
              ? `${t.wonCustomers}/${t.newCustomers} nuevos clientes`
              : "Sin nuevos clientes en el periodo"
          }
          delta={t.newCustomers > 0 ? d.conversionRate : undefined}
          deltaSuffix=" pts"
          icon={Target}
        />
        <Kpi
          label="Aceptación"
          value={t.quotesSent > 0 ? `${t.acceptRate}%` : "—"}
          hint={
            t.quotesSent > 0
              ? `${t.quotesAccepted} de ${t.quotesSent} enviadas`
              : "Sin cotizaciones enviadas"
          }
          delta={t.quotesSent > 0 ? d.acceptRate : undefined}
          deltaSuffix=" pts"
          icon={Percent}
          tone={t.quotesSent > 0 && t.acceptRate >= 30 ? "emerald" : "amber"}
        />
        <Kpi
          label="Ticket promedio"
          value={t.quotesAccepted > 0 ? fmtMoney(t.avgTicket, cur) : "—"}
          hint={t.quotesAccepted > 0 ? "Valor medio de venta" : "Sin ventas cerradas"}
          delta={t.quotesAccepted > 0 ? d.avgTicket : undefined}
          icon={Wallet}
        />
        <Kpi
          label="Tiempo de respuesta"
          value={fmtDuration(t.avgResponseSeconds)}
          hint={
            t.avgResponseSeconds > 0
              ? `${t.responseUnderSlaPct}% bajo 15 min`
              : "Sin conversaciones respondidas"
          }
          delta={t.avgResponseSeconds > 0 ? -d.avgResponseSeconds : undefined}
          icon={Timer}
          tone={t.avgResponseSeconds > 0 && t.avgResponseSeconds < 900 ? "emerald" : "amber"}
        />
        <Kpi
          label="Clientes nuevos"
          value={t.newCustomers > 0 ? t.newCustomers.toLocaleString() : "—"}
          hint={t.newCustomers > 0 ? "Ingresos al CRM" : "Sin nuevos leads"}
          delta={t.newCustomers > 0 ? d.newCustomers : undefined}
          icon={Users}
        />
        <Kpi
          label="Pipeline abierto"
          value={t.openOpportunities > 0 ? fmtMoney(t.openPipeline, cur) : "—"}
          hint={
            t.openOpportunities > 0
              ? `${t.openOpportunities} oportunidades activas`
              : "Sin oportunidades abiertas"
          }
          icon={TrendingUp}
          tone="violet"
        />
        <Kpi
          label="Forecast ponderado"
          value={t.openOpportunities > 0 ? fmtMoney(t.weightedPipeline, cur) : "—"}
          hint={
            t.openOpportunities > 0
              ? "Ajustado por probabilidad de etapa"
              : "Sin oportunidades para proyectar"
          }
          icon={Sparkles}
          tone="violet"
        />
      </div>


      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-primary" /> Ventas en el tiempo
            </div>
            <div className="text-xs text-muted-foreground">Ingresos por día</div>
          </div>
          <RevenueChart series={dash.series} currency={cur} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wand2 className="h-4 w-4 text-violet-500" /> Briefing IA
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={onGenerate} disabled={briefingLoading}>
                {briefingLoading ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="mr-1 h-3.5 w-3.5" />
                )}
                Generar
              </Button>
              {briefing && (
                <Button size="sm" variant="outline" onClick={onCopy}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {briefing ? (
            <div className="whitespace-pre-wrap rounded-md bg-violet-500/5 p-3 text-sm">
              {briefing}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Genera un resumen ejecutivo con IA basado en el periodo actual.
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-primary" /> Estado del embudo
            </div>
            <Link to="/embudo" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Ver embudo <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <FunnelBar funnel={dash.funnel} currency={cur} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4 text-primary" /> Volumen conversacional
            </div>
            <Link to="/conversaciones" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Abrir bandeja <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <VolumeChart series={dash.series} />
        </Card>
      </div>
    </>
  );
}

function SalesTab({ dash }: { dash: ExecutiveDashboard }) {
  const t = dash.totals;
  const cur = t.currency;
  const totalRevenue = dash.series.reduce((a, r) => a + r.revenue, 0);
  const bestDay = [...dash.series].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi
          label="Ingresos"
          value={t.revenue > 0 ? fmtMoney(t.revenue, cur) : "—"}
          icon={DollarSign}
          tone="emerald"
          delta={t.revenue > 0 ? dash.deltas.revenue : undefined}
        />
        <Kpi
          label="Cotizaciones enviadas"
          value={t.quotesSent > 0 ? t.quotesSent.toLocaleString() : "—"}
          icon={TrendingUp}
          delta={t.quotesSent > 0 ? dash.deltas.quotesSent : undefined}
        />
        <Kpi
          label="Aceptadas"
          value={t.quotesSent > 0 ? t.quotesAccepted.toLocaleString() : "—"}
          hint={t.quotesSent > 0 ? `${t.acceptRate}% aceptación` : "Sin envíos"}
          icon={CheckCircle2}
          tone="emerald"
        />
        <Kpi
          label="Ticket promedio"
          value={t.quotesAccepted > 0 ? fmtMoney(t.avgTicket, cur) : "—"}
          icon={Wallet}
          delta={t.quotesAccepted > 0 ? dash.deltas.avgTicket : undefined}
        />
      </div>


      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between text-sm font-medium">
          <span>Cotizaciones y ventas por día</span>
          <span className="text-xs text-muted-foreground">
            Total periodo: {fmtMoney(totalRevenue, cur)} · Mejor día: {bestDay?.date ?? "—"}
          </span>
        </div>
        <SalesStackedChart series={dash.series} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 text-sm font-medium">Comparativa con periodo anterior</div>
          <ul className="space-y-2 text-sm">
            <CompareRow label="Ingresos" curr={t.revenue} prev={dash.previousTotals.revenue} fmt={(v) => fmtMoney(v, cur)} />
            <CompareRow label="Cotizaciones enviadas" curr={t.quotesSent} prev={dash.previousTotals.quotesSent} />
            <CompareRow label="Cotizaciones aceptadas" curr={t.quotesAccepted} prev={dash.previousTotals.quotesAccepted} />
            <CompareRow label="Ticket promedio" curr={t.avgTicket} prev={dash.previousTotals.avgTicket} fmt={(v) => fmtMoney(v, cur)} />
            <CompareRow label="Aceptación" curr={t.acceptRate} prev={dash.previousTotals.acceptRate} fmt={(v) => `${v}%`} />
          </ul>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between text-sm font-medium">
            <span>Pipeline y forecast</span>
            <Link to="/oportunidades" className="text-xs text-primary hover:underline">
              Ver oportunidades
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Pipeline abierto"
              value={t.openOpportunities > 0 ? fmtMoney(t.openPipeline, cur) : "—"}
              hint={
                t.openOpportunities > 0
                  ? `${t.openOpportunities} oportunidades`
                  : "Sin oportunidades abiertas"
              }
            />
            <MiniStat
              label="Forecast ponderado"
              value={t.openOpportunities > 0 ? fmtMoney(t.weightedPipeline, cur) : "—"}
              hint={t.openOpportunities > 0 ? "Ajustado por etapa" : "Sin datos para proyectar"}
            />
          </div>

          <div className="mt-4 space-y-2">
            {dash.funnel
              .filter((f) => f.kind === "open")
              .map((f) => (
                <div key={f.key} className="text-xs">
                  <div className="mb-1 flex justify-between">
                    <span>{f.label}</span>
                    <span className="text-muted-foreground">
                      {f.count} · {fmtMoney(f.value, cur)}
                    </span>
                  </div>
                  <Progress value={Math.min(100, (f.value / Math.max(t.openPipeline, 1)) * 100)} className="h-1.5" />
                </div>
              ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function TeamTab({ dash }: { dash: ExecutiveDashboard }) {
  const cur = dash.totals.currency;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi
          label="Vendedores activos"
          value={dash.sellers.length > 0 ? dash.sellers.length : "—"}
          icon={Users}
        />
        <Kpi
          label="Respuestas humanas"
          value={
            dash.totals.outbound > 0
              ? (dash.totals.outbound - dash.totals.outboundAi).toLocaleString()
              : "—"
          }
          hint={
            dash.totals.outbound > 0
              ? `${100 - dash.totals.aiShare}% del total saliente`
              : "Sin mensajes salientes"
          }
          icon={MessageSquare}
        />
        <Kpi
          label="Cotizaciones creadas"
          value={dash.totals.quotesSent > 0 ? dash.totals.quotesSent.toLocaleString() : "—"}
          icon={TrendingUp}
        />
      </div>


      <Card className="p-0">
        <div className="border-b border-border px-5 py-3 text-sm font-medium">Ranking de vendedores</div>
        {dash.sellers.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Cuando el equipo tenga actividad verás su desempeño aquí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left">Vendedor</th>
                  <th className="px-4 py-2 text-right">Respuestas</th>
                  <th className="px-4 py-2 text-right">Cotizaciones</th>
                  <th className="px-4 py-2 text-right">Cerradas</th>
                  <th className="px-4 py-2 text-right">Aceptación</th>
                  <th className="px-4 py-2 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {dash.sellers.map((s, i) => (
                  <tr key={s.sender_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {i + 1}
                        </div>
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.outbound.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.quotesSent}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.quotesWon}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded",
                          s.acceptRate >= 30 && "border-emerald-500/30 text-emerald-500",
                          s.acceptRate < 15 && s.quotesSent > 0 && "border-amber-500/30 text-amber-600",
                        )}
                      >
                        {s.acceptRate}%
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney(s.revenue, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ProductsTab({ dash }: { dash: ExecutiveDashboard }) {
  const cur = dash.totals.currency;
  const totalRevenue = dash.topProducts.reduce((a, p) => a + p.revenue, 0);
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Productos vendidos" value={dash.topProducts.reduce((a, p) => a + p.won, 0)} icon={Package} />
        <Kpi label="Unidades" value={dash.topProducts.reduce((a, p) => a + p.units, 0).toLocaleString()} icon={TrendingUp} />
        <Kpi label="Ingresos por producto" value={fmtMoney(totalRevenue, cur)} icon={DollarSign} tone="emerald" />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-3 text-sm">
          <span className="font-medium">Top productos por ingresos</span>
          <Link to="/catalogo" className="text-xs text-primary hover:underline">
            Gestionar catálogo
          </Link>
        </div>
        {dash.topProducts.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Sin ventas de productos en este periodo. Al aceptar cotizaciones verás el ranking aquí.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left">Producto</th>
                  <th className="px-4 py-2 text-right">Cotizado</th>
                  <th className="px-4 py-2 text-right">Ganado</th>
                  <th className="px-4 py-2 text-right">Unidades</th>
                  <th className="px-4 py-2 text-right">Ingresos</th>
                  <th className="px-4 py-2 text-right">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {dash.topProducts.map((p) => {
                  const winRate = p.quoted ? Math.round((p.won / p.quoted) * 100) : 0;
                  return (
                    <tr key={p.productId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.quoted}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.won}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.units.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtMoney(p.revenue, cur)}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="outline" className="rounded">
                          {winRate}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function OperationsTab({ dash }: { dash: ExecutiveDashboard }) {
  const t = dash.totals;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label="Chats abiertos" value={t.activeConversations.toLocaleString()} icon={MessageSquare} />
        <Kpi
          label="% de respuestas IA"
          value={`${t.aiShare}%`}
          hint={`${t.outboundAi} de ${t.outbound}`}
          icon={Bot}
          tone="violet"
        />
        <Kpi
          label="Automatizaciones"
          value={t.automationRuns.toLocaleString()}
          hint={`${t.automationErrors} con error`}
          icon={Sparkles}
          tone={t.automationErrors ? "amber" : "emerald"}
        />
        <Kpi
          label="Tiempo de respuesta"
          value={fmtDuration(t.avgResponseSeconds)}
          hint={`${t.responseUnderSlaPct}% ≤ 15 min`}
          icon={Timer}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 text-sm font-medium">Respuestas: humanas vs IA</div>
          <HumanVsAi series={dash.series} />
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between text-sm font-medium">
            <span>Salud del canal</span>
            <Badge
              variant="outline"
              className={cn(
                "rounded",
                dash.header.whatsappConnected
                  ? "border-emerald-500/30 text-emerald-500"
                  : "border-rose-500/30 text-rose-500",
              )}
            >
              {dash.header.whatsappConnected ? "Conectado" : "Desconectado"}
            </Badge>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Mensajes recibidos</span>
              <span className="font-medium tabular-nums">
                {dash.series.reduce((a, r) => a + r.inbound, 0).toLocaleString()}
              </span>
            </li>
            <li className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Mensajes enviados</span>
              <span className="font-medium tabular-nums">{t.outbound.toLocaleString()}</span>
            </li>
            <li className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Nuevas conversaciones</span>
              <span className="font-medium tabular-nums">
                {dash.series.reduce((a, r) => a + r.conversations, 0).toLocaleString()}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Errores de automatización</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  t.automationErrors > 0 ? "text-rose-500" : "text-emerald-500",
                )}
              >
                {t.automationErrors}
              </span>
            </li>
          </ul>
          <div className="mt-3 flex gap-2">
            <Link to="/automatizaciones" className="text-xs text-primary hover:underline">
              Ver automatizaciones
            </Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link to="/metricas-ia" className="text-xs text-primary hover:underline">
              Análisis IA detallado
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

// ---------- Small building blocks ----------

function Kpi({
  label,
  value,
  hint,
  delta,
  deltaSuffix,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number;
  deltaSuffix?: string;
  icon: any;
  tone?: "emerald" | "amber" | "rose" | "violet";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-500 bg-emerald-500/10"
      : tone === "amber"
        ? "text-amber-500 bg-amber-500/10"
        : tone === "rose"
          ? "text-rose-500 bg-rose-500/10"
          : tone === "violet"
            ? "text-violet-500 bg-violet-500/10"
            : "text-primary bg-primary/10";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", cls)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{hint ?? ""}</span>
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

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function CompareRow({
  label,
  curr,
  prev,
  fmt,
}: {
  label: string;
  curr: number;
  prev: number;
  fmt?: (v: number) => string;
}) {
  const f = fmt ?? ((v: number) => v.toLocaleString());
  const delta = prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
  return (
    <li className="flex items-center justify-between border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">{f(prev)}</span>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="font-medium tabular-nums">{f(curr)}</span>
        {delta !== 0 && (
          <span
            className={cn(
              "inline-flex w-14 justify-end text-xs font-medium",
              delta > 0 ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </div>
    </li>
  );
}

function AlertChip({ alert }: { alert: ExecutiveDashboard["alerts"][number] }) {
  const cls =
    alert.severity === "critical"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-500"
      : alert.severity === "warning"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-600"
        : "border-primary/30 bg-primary/5 text-primary";
  const content = (
    <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${cls}`}>
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>{alert.title}</span>
      <span className="text-muted-foreground">· {alert.detail}</span>
      {alert.href && <ArrowUpRight className="h-3 w-3" />}
    </div>
  );
  return alert.href ? <Link to={alert.href as any}>{content}</Link> : content;
}

// ---------- Charts ----------

function RevenueChart({ series, currency }: { series: ExecutiveDashboard["series"]; currency: string }) {
  const max = Math.max(1, ...series.map((s) => s.revenue));
  return (
    <div className="flex h-48 items-end gap-1">
      {series.map((s) => (
        <div
          key={s.date}
          className="group relative flex-1"
          title={`${s.date} · ${fmtMoney(s.revenue, currency)}`}
        >
          <div
            className="w-full rounded-t bg-gradient-to-t from-emerald-500/60 to-emerald-500/20"
            style={{ height: `${(s.revenue / max) * 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function VolumeChart({ series }: { series: ExecutiveDashboard["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.inbound + s.outbound));
  return (
    <>
      <div className="flex h-40 items-end gap-1">
        {series.map((s) => (
          <div
            key={s.date}
            className="flex flex-1 flex-col items-center justify-end gap-0.5"
            title={`${s.date} · IN ${s.inbound} · OUT ${s.outbound} (IA ${s.outboundAi})`}
          >
            <div
              className="w-full rounded-t bg-violet-500/70"
              style={{ height: `${(s.outboundAi / max) * 100}%` }}
            />
            <div
              className="w-full bg-primary/70"
              style={{ height: `${((s.outbound - s.outboundAi) / max) * 100}%` }}
            />
            <div
              className="w-full rounded-b bg-muted-foreground/30"
              style={{ height: `${(s.inbound / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <LegendDot color="bg-primary/70" label="Humano" />
        <LegendDot color="bg-violet-500/70" label="IA" />
        <LegendDot color="bg-muted-foreground/40" label="Entrantes" />
      </div>
    </>
  );
}

function SalesStackedChart({ series }: { series: ExecutiveDashboard["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.quotesSent));
  return (
    <>
      <div className="flex h-40 items-end gap-1">
        {series.map((s) => (
          <div
            key={s.date}
            className="flex flex-1 flex-col items-center justify-end gap-0.5"
            title={`${s.date} · ${s.quotesSent} enviadas · ${s.quotesAccepted} aceptadas`}
          >
            <div
              className="w-full rounded-t bg-emerald-500/80"
              style={{ height: `${(s.quotesAccepted / max) * 100}%` }}
            />
            <div
              className="w-full bg-primary/60"
              style={{ height: `${((s.quotesSent - s.quotesAccepted) / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <LegendDot color="bg-primary/60" label="Enviadas" />
        <LegendDot color="bg-emerald-500/80" label="Aceptadas" />
      </div>
    </>
  );
}

function HumanVsAi({ series }: { series: ExecutiveDashboard["series"] }) {
  const totals = series.reduce(
    (a, r) => {
      a.human += r.outbound - r.outboundAi;
      a.ai += r.outboundAi;
      return a;
    },
    { human: 0, ai: 0 },
  );
  const total = totals.human + totals.ai || 1;
  const humanPct = Math.round((totals.human / total) * 100);
  const aiPct = 100 - humanPct;
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded bg-muted">
        <div className="bg-primary/70" style={{ width: `${humanPct}%` }} />
        <div className="bg-violet-500/70" style={{ width: `${aiPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground">Humanos</div>
          <div className="font-display text-lg font-semibold">{totals.human.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{humanPct}% del total</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-xs text-muted-foreground">IA</div>
          <div className="font-display text-lg font-semibold">{totals.ai.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">{aiPct}% del total</div>
        </div>
      </div>
    </div>
  );
}

function FunnelBar({ funnel, currency }: { funnel: ExecutiveDashboard["funnel"]; currency: string }) {
  const rows = funnel.filter((f) => f.kind !== "lost");
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.map((s) => (
        <div key={s.key} className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">{s.label}</span>
          <div className="flex-1">
            <div
              className={cn("h-6 rounded", stageBg(s.color))}
              style={{ width: `${Math.max(4, (s.count / maxCount) * 100)}%` }}
            />
          </div>
          <span className="w-14 text-right tabular-nums">{s.count}</span>
          <span className="w-24 text-right text-muted-foreground tabular-nums">
            {fmtMoney(s.value, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

// ---------- Utils ----------

function fmtMoney(n: number, currency: string): string {
  if (!n) return `${currency} 0`;
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

function fmtDuration(seconds: number): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function stageBg(color: string): string {
  const map: Record<string, string> = {
    sky: "bg-sky-500/70",
    indigo: "bg-indigo-500/70",
    amber: "bg-amber-500/70",
    orange: "bg-orange-500/70",
    emerald: "bg-emerald-500/70",
    rose: "bg-rose-500/70",
  };
  return map[color] ?? "bg-primary/70";
}

function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportDashboardCsv(dash: ExecutiveDashboard) {
  const t = dash.totals;
  const rows: (string | number)[][] = [
    ["Sección", "Métrica", "Valor"],
    ["Periodo", "Rango (días)", dash.range],
    ["Periodo", "Desde", dash.periodFrom],
    ["Periodo", "Hasta", dash.periodTo],
    ["Ventas", "Ingresos", t.revenue],
    ["Ventas", "Cotizaciones enviadas", t.quotesSent],
    ["Ventas", "Cotizaciones aceptadas", t.quotesAccepted],
    ["Ventas", "Tasa de aceptación %", t.acceptRate],
    ["Ventas", "Ticket promedio", t.avgTicket],
    ["Ventas", "Moneda", t.currency],
    ["Clientes", "Nuevos", t.newCustomers],
    ["Clientes", "Ganados", t.wonCustomers],
    ["Clientes", "Conversión %", t.conversionRate],
    ["Pipeline", "Oportunidades abiertas", t.openOpportunities],
    ["Pipeline", "Pipeline abierto", t.openPipeline],
    ["Pipeline", "Forecast ponderado", t.weightedPipeline],
    ["Operación", "Conversaciones activas", t.activeConversations],
    ["Operación", "Tiempo de respuesta (s)", t.avgResponseSeconds],
    ["Operación", "% bajo 15 min", t.responseUnderSlaPct],
    ["Operación", "Mensajes salientes", t.outbound],
    ["Operación", "% IA", t.aiShare],
    ["Operación", "Automatizaciones", t.automationRuns],
    ["Operación", "Errores automatización", t.automationErrors],
  ];
  for (const s of dash.sellers) {
    rows.push(["Vendedor", s.name, `${s.quotesWon} cerradas · ${t.currency} ${s.revenue}`]);
  }
  for (const p of dash.topProducts) {
    rows.push(["Producto", p.name, `${p.won}/${p.quoted} · ${t.currency} ${p.revenue}`]);
  }
  downloadCsv(rows, `dashboard-ejecutivo-${dash.range}d-${new Date().toISOString().slice(0, 10)}.csv`);
}
