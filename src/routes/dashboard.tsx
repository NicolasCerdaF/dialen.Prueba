import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  DollarSign,
  FileText,
  Sparkles,
  ArrowRight,
  Plus,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Target,
  Package,
  BookOpen,
  Zap,
  Flame,
  UserPlus,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { getDashboardData, type AiPriority, type AttentionBucket, type AttentionItem, type FunnelStageMini } from "@/lib/dashboard.functions";
import { STAGE_STYLES } from "@/lib/pipeline";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

const dashboardQueryOptions = (fetcher: () => Promise<unknown>) =>
  queryOptions({
    queryKey: ["dashboard", "overview"],
    queryFn: fetcher as () => Promise<Awaited<ReturnType<typeof getDashboardData>>>,
    staleTime: 15_000,
  });

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Dialen" },
      { name: "description", content: "Centro de control comercial con IA" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetcher = useServerFn(getDashboardData);
  const { data } = useSuspenseQuery(dashboardQueryOptions(fetcher));

  useRealtimeInvalidate({
    channel: "dashboard-live",
    tables: ["messages", "quotes", "conversations", "customers", "ai_suggestions"],
    invalidate: [["dashboard", "overview"]],
  });

  return (
    <AppShell>
      <div className="h-full overflow-y-auto bg-gradient-to-b from-background via-background to-secondary/20">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <DashboardHeader header={data.header} />

          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Director Comercial IA · Enfoque de hoy
              </h2>
              <span className="ai-dot h-1.5 w-1.5 rounded-full bg-violet-500" />
            </div>
            <AiDirectorPanel priorities={data.priorities} />
          </section>

          <section className="mt-6">
            <PulseGrid pulse={data.pulse} />
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <AttentionInbox buckets={data.attention} />
            </div>
            <LiveFunnel funnel={data.funnel} />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <QuickActions />
            <MarketSignals data={data.market} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- Header ---------- */

function DashboardHeader({
  header,
}: {
  header: {
    userName: string;
    whatsappConnected: boolean;
    priorityCount: number;
    pulseStatus: "normal" | "warning" | "critical";
  };
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const pulse = {
    normal: { label: "Todo bajo control", tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
    warning: { label: "Requiere atención", tone: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
    critical: { label: "Situación crítica", tone: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  }[header.pulseStatus];

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
          <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}, {header.userName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {header.priorityCount > 0
              ? `Tienes ${header.priorityCount} ${header.priorityCount === 1 ? "prioridad" : "prioridades"} para hoy`
              : "La IA está monitoreando tu operación"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
            pulse.tone,
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
          {pulse.label}
        </span>
        <Link
          to={header.whatsappConnected ? "/configuracion" : "/onboarding/whatsapp"}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
            header.whatsappConnected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
              : "border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
          )}
        >
          <span className="relative flex h-2 w-2">
            <span className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              header.whatsappConnected ? "bg-emerald-500" : "bg-amber-500",
            )} />
          </span>
          WhatsApp {header.whatsappConnected ? "conectado" : "no conectado"}
          <ArrowRight className="h-3 w-3 opacity-60" />
        </Link>
      </div>
    </header>
  );
}

/* ---------- Director IA ---------- */

function AiDirectorPanel({ priorities }: { priorities: AiPriority[] }) {
  if (priorities.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-card to-card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10">
          <Sparkles className="h-6 w-6 text-violet-500" />
        </div>
        <h3 className="font-display text-lg font-semibold">Todo bajo control</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          La IA está monitoreando tu operación. Aparecerán prioridades aquí cuando haya acciones críticas.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {priorities.map((p, i) => (
        <PriorityCard key={p.id} priority={p} rank={i + 1} />
      ))}
    </div>
  );
}

const TYPE_META: Record<AiPriority["type"], { label: string; icon: typeof Flame; tone: string }> = {
  rescue: { label: "Rescatar", icon: Flame, tone: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  close: { label: "Cerrar", icon: Target, tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  quote: { label: "Cotizar", icon: FileText, tone: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  follow: { label: "Reactivar", icon: Clock, tone: "text-sky-500 bg-sky-500/10 border-sky-500/20" },
};

function PriorityCard({ priority, rank }: { priority: AiPriority; rank: number }) {
  const navigate = useNavigate();
  const meta = TYPE_META[priority.type];
  const Icon = meta.icon;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-violet-500/20 bg-card p-4 shadow-sm transition-all hover:border-violet-500/40 hover:shadow-md">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.tone)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground">#{rank}</span>
      </div>
      <h3 className="mt-3 font-display text-base font-semibold leading-tight">{priority.headline}</h3>
      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{priority.reason}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5">
          <Users className="h-3 w-3" />
          {priority.customerName}
        </span>
        {priority.potentialValue > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5">
            <DollarSign className="h-3 w-3" />
            {priority.potentialValue.toLocaleString()} {priority.currency}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5">
          <Clock className="h-3 w-3" />
          {priority.elapsedLabel}
        </span>
      </div>
      <button
        onClick={() =>
          navigate({
            to: priority.action.to as string,
            params: (priority.action.params ?? {}) as never,
            search: (priority.action.search ?? {}) as never,
            hash: priority.action.hash,
          })
        }
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-600"
      >
        {priority.action.label}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------- Pulse ---------- */

function PulseGrid({
  pulse,
}: {
  pulse: {
    activeConversations: number;
    openOpportunities: number;
    openOpportunitiesValue: number;
    quotesSent7d: number;
    quotesSent7dDelta: number | null;
    salesMonth: number;
    salesMonthCurrency: string | null;
  };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        label="Conversaciones activas"
        value={String(pulse.activeConversations)}
        icon={MessageSquare}
        tone="primary"
        to="/"
      />
      <KpiTile
        label="Oportunidades abiertas"
        value={String(pulse.openOpportunities)}
        sub={pulse.openOpportunitiesValue > 0 ? `${pulse.openOpportunitiesValue.toLocaleString()} en pipeline` : undefined}
        icon={Target}
        tone="accent"
        to="/embudo"
      />
      <KpiTile
        label="Cotizaciones enviadas (7d)"
        value={String(pulse.quotesSent7d)}
        delta={pulse.quotesSent7dDelta}
        icon={FileText}
        tone="warn"
        to="/cotizaciones"
      />
      <KpiTile
        label="Ventas del mes"
        value={
          pulse.salesMonth > 0 && pulse.salesMonthCurrency
            ? `${pulse.salesMonth.toLocaleString()} ${pulse.salesMonthCurrency}`
            : "—"
        }
        icon={DollarSign}
        tone="success"
        to="/dashboard-ejecutivo"
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  delta,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  icon: typeof MessageSquare;
  tone: "primary" | "success" | "accent" | "warn";
  to: string;
}) {
  const toneMap = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    accent: "text-sky-500 bg-sky-500/10",
    warn: "text-amber-500 bg-amber-500/10",
  } as const;
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneMap[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {typeof delta === "number" && delta !== 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              delta > 0 ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        ) : null}
        {sub ? <span>{sub}</span> : null}
      </div>
    </Link>
  );
}

/* ---------- Attention Inbox ---------- */

const BUCKET_ICON: Record<AttentionBucket["id"], typeof MessageSquare> = {
  unresponded: MessageSquare,
  awaitingQuote: FileText,
  quotePending: Clock,
  stalled: AlertCircle,
};
const BUCKET_TONE: Record<AttentionBucket["id"], string> = {
  unresponded: "text-primary bg-primary/10",
  awaitingQuote: "text-amber-500 bg-amber-500/10",
  quotePending: "text-sky-500 bg-sky-500/10",
  stalled: "text-rose-500 bg-rose-500/10",
};

function AttentionInbox({ buckets }: { buckets: AttentionBucket[] }) {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return (
    <Card>
      <CardHeader
        title="Bandeja de atención"
        icon={AlertCircle}
        action={
          <span className="text-xs text-muted-foreground">
            {total} {total === 1 ? "pendiente" : "pendientes"}
          </span>
        }
      />
      <div className="divide-y divide-border">
        {buckets.map((bucket) => {
          const Icon = BUCKET_ICON[bucket.id];
          if (bucket.count === 0) {
            return (
              <div key={bucket.id} className="flex items-center gap-3 px-5 py-3 text-xs text-muted-foreground">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg opacity-50", BUCKET_TONE[bucket.id])}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="flex-1">{bucket.label}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </div>
            );
          }
          return (
            <div key={bucket.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", BUCKET_TONE[bucket.id])}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <h4 className="text-sm font-semibold">{bucket.label}</h4>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {bucket.count}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {bucket.items.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const navigate = useNavigate();
  return (
    <li>
      <button
        onClick={() =>
          navigate({
            to: item.to as string,
            params: (item.params ?? {}) as never,
            search: (item.search ?? {}) as never,
            hash: item.hash,
          })
        }
        className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary/60"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold uppercase text-muted-foreground">
          {item.customerName.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.customerName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{item.detail}</div>
        </div>
        <span className="text-[10px] text-muted-foreground">{item.elapsedLabel}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </li>
  );
}

/* ---------- Live Funnel ---------- */

function LiveFunnel({ funnel }: { funnel: FunnelStageMini[] }) {
  const maxCount = Math.max(1, ...funnel.map((s) => s.count));
  return (
    <Card>
      <CardHeader
        title="Embudo en vivo"
        icon={Target}
        action={
          <Link to="/embudo" className="text-xs font-medium text-primary hover:underline">
            Ver embudo
          </Link>
        }
      />
      <div className="space-y-2 px-5 pb-5 pt-3">
        {funnel.map((stage) => {
          const style = STAGE_STYLES[stage.color] ?? STAGE_STYLES.sky;
          const width = Math.round((stage.count / maxCount) * 100);
          return (
            <Link
              key={stage.key}
              to="/embudo"
              className="group block rounded-lg p-2 transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{stage.label}</span>
                <span className="text-muted-foreground">
                  {stage.count} · {stage.value > 0 ? stage.value.toLocaleString() : "—"}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full transition-all", style.bar)}
                  style={{ width: `${Math.max(4, width)}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- Quick actions + market ---------- */

function QuickActions() {
  const actions: { to: string; icon: typeof MessageSquare; label: string; desc: string }[] = [
    { to: "/", icon: MessageSquare, label: "Abrir bandeja", desc: "Ver conversaciones" },
    { to: "/contactos", icon: UserPlus, label: "Contactos", desc: "Directorio de personas" },
    { to: "/cotizaciones", icon: FileText, label: "Cotizaciones", desc: "Crear y enviar" },
    { to: "/conocimiento", icon: BookOpen, label: "Conocimiento", desc: "Base para la IA" },
  ];
  return (
    <Card className="md:col-span-2">
      <CardHeader title="Acciones rápidas" icon={Zap} />
      <div className="grid grid-cols-2 gap-2 px-5 pb-5 pt-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <a.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{a.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{a.desc}</div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

function MarketSignals({ data }: { data: { topProducts: { productId: string; name: string; mentions: number }[]; hasData: boolean } }) {
  return (
    <Card>
      <CardHeader
        title="Señales del mercado"
        icon={Package}
        action={
          <Link to="/catalogo" className="text-xs font-medium text-primary hover:underline">
            Catálogo
          </Link>
        }
      />
      {data.hasData ? (
        <ul className="space-y-2 px-5 pb-5 pt-3">
          {data.topProducts.map((p, i) => (
            <li key={p.productId} className="flex items-center gap-2 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.mentions}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          <Plus className="mx-auto mb-2 h-4 w-4 opacity-40" />
          La IA mostrará aquí productos consultados, objeciones y tendencias cuando existan datos suficientes.
        </div>
      )}
    </Card>
  );
}

/* ---------- shared ---------- */

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {children}
    </div>
  );
}

function CardHeader({ title, icon: Icon, action }: { title: string; icon: typeof MessageSquare; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="ml-auto">{action}</div>
    </div>
  );
}
