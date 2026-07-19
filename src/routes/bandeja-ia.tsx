import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getBandejaIA, type BandejaItem, type BandejaCategory } from "@/lib/bandeja-ia.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bandeja-ia")({
  head: () => ({
    meta: [
      { title: "Bandeja IA — Dialen" },
      { name: "description", content: "Recomendaciones IA sobre tus conversaciones activas" },
    ],
  }),
  component: BandejaIAPage,
});

type Tab = "all" | BandejaCategory;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "high", label: "Prioridad alta" },
  { id: "follow", label: "Seguimiento" },
  { id: "opportunity", label: "Oportunidades" },
];

function BandejaIAPage() {
  const fetchFn = useServerFn(getBandejaIA);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["bandeja-ia"],
    queryFn: () => fetchFn({}),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const [tab, setTab] = useState<Tab>("all");

  const items = useMemo(() => {
    if (!data) return [];
    if (tab === "all")
      return [...data.groups.high, ...data.groups.follow, ...data.groups.opportunity];
    return data.groups[tab];
  }, [data, tab]);

  const counts = data?.counts ?? { high: 0, follow: 0, opportunity: 0, total: 0 };

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
                  Menos mensajes, más decisiones. La IA prioriza tus conversaciones.
                </p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Actualizar
            </button>
          </header>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total recomendaciones" value={counts.total} tone="primary" />
            <StatCard label="Prioridad alta" value={counts.high} tone="danger" />
            <StatCard label="Seguimiento" value={counts.follow} tone="warn" />
            <StatCard label="Oportunidades" value={counts.opportunity} tone="success" />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
            {TABS.map((t) => {
              const c =
                t.id === "all"
                  ? counts.total
                  : t.id === "high"
                    ? counts.high
                    : t.id === "follow"
                      ? counts.follow
                      : counts.opportunity;
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
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px]",
                      tab === t.id
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {c}
                  </span>
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-3">
              {items.map((item) => (
                <RecommendationCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
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
      label: "Prioridad alta",
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
  const openOpportunity = () => {
    navigate({ to: "/clientes/$id", params: { id: item.customerId } });
  };

  const primaryAction =
    item.suggestedAction.kind === "quote"
      ? { label: item.suggestedAction.label, icon: FileText, onClick: openQuote }
      : item.suggestedAction.kind === "opportunity"
        ? { label: item.suggestedAction.label, icon: UserPlus, onClick: openOpportunity }
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
                <div className="text-muted-foreground">{item.reasonDetail}</div>
              </div>
            </div>
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
          <Metric label="Intención" value={`${item.intent}`} tone={item.intent >= 70 ? "high" : item.intent >= 40 ? "mid" : "low"} />
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
              Abrir conversación
            </button>
          )}
          <button
            onClick={openOpportunity}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Ver cliente <ArrowRight className="h-3 w-3" />
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
