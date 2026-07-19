import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Sparkles,
  Flame,
  Clock3,
  Target,
  ArrowRight,
  MessageSquare,
  FileText,
  UserPlus,
  Building2,
  Loader2,
  Inbox,
  RefreshCw,
  Bot,
  BarChart3,
  Check,
  Pencil,
  X,
  Package,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  getBandejaIA,
  getPendingAIActions,
  getConversationAnalysis,
  resolvePendingAction,
  type BandejaItem,
  type BandejaCategory,
  type PendingAction,
} from "@/lib/bandeja-ia.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/bandeja-ia")({
  head: () => ({
    meta: [
      { title: "Bandeja IA — Dialen" },
      { name: "description", content: "Capa de inteligencia sobre tus conversaciones de WhatsApp" },
    ],
  }),
  component: BandejaIAPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

type Tab = "high" | "follow" | "actions" | "analysis";

const TABS: { id: Tab; label: string; icon: typeof Flame }[] = [
  { id: "high", label: "Atención inmediata", icon: Flame },
  { id: "follow", label: "Seguimiento", icon: Clock3 },
  { id: "actions", label: "Acciones IA", icon: Bot },
  { id: "analysis", label: "Análisis", icon: BarChart3 },
];

const BANDEJA_KEY = ["bandeja-ia"] as const;
const BANDEJA_ACTIONS_KEY = ["bandeja-ia", "actions"] as const;
const BANDEJA_ANALYSIS_KEY = ["bandeja-ia", "analysis"] as const;

const bandejaQueryOptions = (fetcher: () => Promise<Awaited<ReturnType<typeof getBandejaIA>>>) =>
  queryOptions({
    queryKey: BANDEJA_KEY,
    queryFn: fetcher,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

function BandejaIAPage() {
  const [tab, setTab] = useState<Tab>("high");
  const fetchBandeja = useServerFn(getBandejaIA);
  const fetchActions = useServerFn(getPendingAIActions);
  const fetchAnalysis = useServerFn(getConversationAnalysis);

  const bandejaQ = useSuspenseQuery(bandejaQueryOptions(() => fetchBandeja({})));
  const actionsQ = useQuery({
    queryKey: BANDEJA_ACTIONS_KEY,
    queryFn: () => fetchActions({}),
    staleTime: 30_000,
    enabled: tab === "actions",
  });
  const analysisQ = useQuery({
    queryKey: BANDEJA_ANALYSIS_KEY,
    queryFn: () => fetchAnalysis({}),
    staleTime: 60_000,
    enabled: tab === "analysis",
  });

  // Realtime: refresh on any commercial event.
  useRealtimeInvalidate({
    channel: "bandeja-ia-live",
    tables: ["messages", "ai_suggestions", "quotes", "conversations"],
    invalidate: [BANDEJA_KEY, BANDEJA_ACTIONS_KEY, BANDEJA_ANALYSIS_KEY],
  });

  const counts = bandejaQ.data?.counts ?? { high: 0, follow: 0, opportunity: 0, total: 0 };
  const opportunityItems = bandejaQ.data?.groups.opportunity ?? [];
  const highItems = [...(bandejaQ.data?.groups.high ?? []), ...opportunityItems];
  const followItems = bandejaQ.data?.groups.follow ?? [];

  const tabCounts: Record<Tab, number> = {
    high: highItems.length,
    follow: followItems.length,
    actions: actionsQ.data?.length ?? 0,
    analysis: analysisQ.data?.totals.suggestions ?? 0,
  };

  const refreshAll = () => {
    bandejaQ.refetch();
    if (tab === "actions") actionsQ.refetch();
    if (tab === "analysis") analysisQ.refetch();
  };



  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="ai-glow flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Bandeja IA
                </h1>
                <p className="text-sm text-muted-foreground">
                  Qué conversaciones importan hoy y qué hacer con ellas.
                </p>
              </div>
            </div>
            <button
              onClick={refreshAll}
              disabled={bandejaQ.isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", bandejaQ.isFetching && "animate-spin")}
              />
              Actualizar
            </button>
          </header>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Atención inmediata" value={counts.high} tone="danger" />
            <StatCard label="Seguimiento" value={counts.follow} tone="warn" />
            <StatCard label="Acciones IA" value={tabCounts.actions} tone="primary" />
            <StatCard label="Oportunidades" value={counts.opportunity} tone="success" />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px]",
                      tab === t.id
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {tabCounts[t.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {tab === "high" && (
            <ItemsList items={highItems} isLoading={bandejaQ.isLoading} />
          )}
          {tab === "follow" && (
            <ItemsList items={followItems} isLoading={bandejaQ.isLoading} />
          )}
          {tab === "actions" && (
            <ActionsList
              items={actionsQ.data ?? []}
              isLoading={actionsQ.isLoading}
            />
          )}
          {tab === "analysis" && (
            <AnalysisPanel
              data={analysisQ.data}
              isLoading={analysisQ.isLoading}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ItemsList({ items, isLoading }: { items: BandejaItem[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (items.length === 0) return <EmptyState />;
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <RecommendationCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "danger" | "warn" | "success";
}) {
  const tones = {
    primary: "text-primary",
    danger: "text-rose-500",
    warn: "text-amber-500",
    success: "text-emerald-500",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", tones[tone])}>{value}</div>
    </div>
  );
}

function RecommendationCard({ item }: { item: BandejaItem }) {
  const navigate = useNavigate();

  const catStyle = {
    high: {
      badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      border: "border-l-rose-500",
      icon: Flame,
      label: "Atención inmediata",
    },
    follow: {
      badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      border: "border-l-amber-500",
      icon: Clock3,
      label: "Seguimiento",
    },
    opportunity: {
      badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      border: "border-l-emerald-500",
      icon: Target,
      label: "Oportunidad",
    },
  }[item.category];
  const Icon = catStyle.icon;

  const openConversation = () => {
    if (!item.conversationId) return;
    navigate({ to: "/conversaciones", hash: `conv=${item.conversationId}` });
  };
  const openQuote = () => {
    if (!item.conversationId) return;
    navigate({ to: "/conversaciones", hash: `conv=${item.conversationId}` });
  };
  const openCustomer = () => {
    navigate({ to: "/clientes/$id", params: { id: item.customerId } });
  };

  const primaryAction =
    item.suggestedAction.kind === "quote"
      ? { label: item.suggestedAction.label, icon: FileText, onClick: openQuote }
      : item.suggestedAction.kind === "opportunity"
        ? { label: item.suggestedAction.label, icon: UserPlus, onClick: openCustomer }
        : { label: item.suggestedAction.label, icon: MessageSquare, onClick: openConversation };

  const PrimaryIcon = primaryAction.icon;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-l-4 border-border bg-card transition-shadow hover:shadow-md",
        catStyle.border,
      )}
    >
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  catStyle.badge,
                )}
              >
                <Icon className="h-3 w-3" />
                {catStyle.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{item.elapsedLabel}</span>
              {item.productMention && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                  <Package className="h-3 w-3" />
                  {item.productMention}
                </span>
              )}
            </div>
            <h3 className="truncate text-sm font-semibold">{item.customerName}</h3>
            {item.companyName && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span className="truncate">{item.companyName}</span>
              </div>
            )}

            <div className="mt-2 flex items-start gap-1.5 text-xs">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
              <div>
                <div className="font-medium text-foreground">{item.reason}</div>
                <div className="text-muted-foreground">
                  {item.aiSummary ?? item.reasonDetail}
                </div>
              </div>
            </div>

            {item.lastMessagePreview && (
              <div className="mt-2 rounded-md bg-secondary/40 px-2.5 py-1.5 text-[11px] italic text-muted-foreground">
                "{item.lastMessagePreview}"
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            {item.potentialValue > 0 && (
              <div className="text-sm font-semibold">
                {new Intl.NumberFormat("es-CL", {
                  style: "currency",
                  currency: item.currency,
                  maximumFractionDigits: 0,
                }).format(item.potentialValue)}
              </div>
            )}
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              valor estimado
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-secondary/40 p-2">
          <Metric
            label="Intención"
            value={`${item.intent}`}
            tone={item.intent >= 70 ? "high" : item.intent >= 40 ? "mid" : "low"}
          />
          <Metric
            label="Urgencia"
            value={item.urgency}
            tone={item.urgency === "alta" ? "high" : item.urgency === "media" ? "mid" : "low"}
          />
          <Metric
            label="Prob. cierre"
            value={`${item.probability}%`}
            tone={item.probability >= 60 ? "high" : item.probability >= 35 ? "mid" : "low"}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={primaryAction.onClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <PrimaryIcon className="h-3.5 w-3.5" />
            {primaryAction.label}
          </button>
          {item.conversationId && item.suggestedAction.kind !== "reply" && (
            <button
              onClick={openConversation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Responder con IA
            </button>
          )}
          <button
            onClick={openCustomer}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Ver contacto <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "high" | "mid" | "low";
}) {
  const tones = {
    high: "text-emerald-600 dark:text-emerald-400",
    mid: "text-amber-600 dark:text-amber-400",
    low: "text-muted-foreground",
  } as const;
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold capitalize", tones[tone])}>{value}</div>
    </div>
  );
}

function ActionsList({
  items,
  isLoading,
}: {
  items: PendingAction[];
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const resolve = useServerFn(resolvePendingAction);

  const doResolve = async (id: string, action: "used" | "edited" | "discarded") => {
    try {
      await resolve({ data: { id, action } });
      qc.invalidateQueries({ queryKey: ["bandeja-ia", "actions"] });
      toast.success(
        action === "used"
          ? "Acción aprobada"
          : action === "edited"
            ? "Marcada para editar"
            : "Descartada",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
          <Bot className="h-6 w-6 text-violet-500" />
        </div>
        <h3 className="text-sm font-semibold">Nada pendiente de aprobación</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Cuando la IA genere respuestas, cotizaciones o seguimientos, aparecerán aquí.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {items.map((a) => (
        <div
          key={a.id}
          className="overflow-hidden rounded-xl border border-l-4 border-border border-l-violet-500 bg-card p-4"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
              <Bot className="h-3 w-3" />
              {a.agentType ?? "IA"}
            </span>
            {a.intent && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {a.intent}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">{a.elapsedLabel}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Confianza {Math.round(a.confidence * 100)}% · Prob. {a.probability}%
            </span>
          </div>
          <div className="text-sm font-semibold">{a.customerName}</div>
          <div className="mt-2 rounded-md bg-secondary/40 p-2.5 text-xs">
            {a.text || <span className="italic text-muted-foreground">Sin texto</span>}
          </div>
          {a.nextStep && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{a.nextStep}</span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => doResolve(a.id, "used")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-3.5 w-3.5" />
              Aprobar
            </button>
            <button
              onClick={() => doResolve(a.id, "edited")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" />
              Revisión humana
            </button>
            <button
              onClick={() => doResolve(a.id, "discarded")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5" />
              Descartar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalysisPanel({
  data,
  isLoading,
}: {
  data:
    | {
        totals: {
          conversations: number;
          suggestions: number;
          avgConfidence: number;
          avgProbability: number;
        };
        topIntents: { key: string; count: number }[];
        topObjections: { key: string; count: number }[];
        topProducts: { key: string; count: number }[];
      }
    | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!data || data.totals.suggestions === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-semibold">Aún no hay datos suficientes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Cuando la IA analice más conversaciones, aparecerán aquí los patrones detectados.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Conversaciones (30d)" value={data.totals.conversations} tone="primary" />
        <StatCard label="Análisis IA" value={data.totals.suggestions} tone="primary" />
        <StatCard
          label="Confianza IA"
          value={Math.round(data.totals.avgConfidence * 100)}
          tone="success"
        />
        <StatCard label="Prob. cierre media" value={data.totals.avgProbability} tone="warn" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <TopList title="Intenciones frecuentes" items={data.topIntents} icon={TrendingUp} tone="primary" />
        <TopList title="Productos más consultados" items={data.topProducts} icon={Package} tone="success" />
        <TopList title="Objeciones detectadas" items={data.topObjections} icon={ShieldAlert} tone="warn" />
      </div>
    </div>
  );
}

function TopList({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: { key: string; count: number }[];
  icon: typeof TrendingUp;
  tone: "primary" | "success" | "warn";
}) {
  const toneMap = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warn: "text-amber-500 bg-amber-500/10",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", toneMap[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos aún</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{it.key}</span>
              <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px]">
                {it.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Inbox className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-sm font-semibold">Todo bajo control</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        La IA no detecta acciones urgentes en tus conversaciones activas.
      </p>
    </div>
  );
}
