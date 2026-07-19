import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Target,
  Sparkles,
  TrendingUp,
  Search,
  MessageSquare,
  FileText,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  Package,
  Crown,
  Phone,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listOpportunities,
  type Opportunity,
  type OpportunityStage,
} from "@/lib/opportunities.functions";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/oportunidades")({
  head: () => ({
    meta: [
      { title: "Oportunidades — Dialen" },
      { name: "description", content: "Ventas potenciales detectadas por la IA desde tus conversaciones." },
    ],
  }),
  component: OpportunitiesPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

const OPPORTUNITIES_KEY = ["opportunities"] as const;

const oppsQueryOptions = (fetcher: () => Promise<Opportunity[]>) =>
  queryOptions({
    queryKey: OPPORTUNITIES_KEY,
    queryFn: fetcher,
    staleTime: 20_000,
  });

const STAGE_META: Record<OpportunityStage, { label: string; hint: string; color: string; ring: string; dot: string }> = {
  detected: {
    label: "Detectada",
    hint: "Interés inicial identificado por la IA",
    color: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/20",
    dot: "bg-sky-500",
  },
  qualified: {
    label: "Calificada",
    hint: "Alta intención de compra — lista para cotizar",
    color: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/20",
    dot: "bg-violet-500",
  },
  negotiation: {
    label: "En negociación",
    hint: "Cotización enviada o vista por el cliente",
    color: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
};

function OpportunitiesPage() {
  const list = useServerFn(listOpportunities);
  const { data: opps } = useSuspenseQuery(oppsQueryOptions(() => list()));

  // Realtime: refresh when suggestions, quotes or customers change.
  useRealtimeInvalidate({
    channel: "opportunities-live",
    tables: ["ai_suggestions", "quotes", "customers"],
    invalidate: [OPPORTUNITIES_KEY],
  });


  const [search, setSearch] = useState("");
  const [onlyStalled, setOnlyStalled] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return opps.filter((o) => {
      if (onlyStalled && !o.stalled) return false;
      if (!s) return true;
      return (
        (o.customer_name ?? "").toLowerCase().includes(s) ||
        (o.customer_company ?? "").toLowerCase().includes(s) ||
        o.customer_phone.includes(s) ||
        o.products.some((p) => p.toLowerCase().includes(s))
      );
    });
  }, [opps, search, onlyStalled]);

  const groups = useMemo(() => {
    const g: Record<OpportunityStage, Opportunity[]> = { detected: [], qualified: [], negotiation: [] };
    filtered.forEach((o) => g[o.stage].push(o));
    return g;
  }, [filtered]);

  const totalValue = opps.reduce((s, o) => s + (o.estimated_value ?? 0), 0);
  const avgProb = opps.length
    ? Math.round(opps.reduce((s, o) => s + o.probability, 0) / opps.length)
    : 0;
  const stalledCount = opps.filter((o) => o.stalled).length;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              Inteligencia comercial
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Oportunidades</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ventas potenciales detectadas por la IA. Pasa de conversación a cotización sin perder foco.
            </p>
          </div>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente o producto…"
                className="pl-9"
              />
            </div>
            <Button
              variant={onlyStalled ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyStalled((v) => !v)}
              className="whitespace-nowrap"
            >
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
              Detenidas
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Abiertas" value={opps.length} icon={Target} tone="default" />
          <Kpi label="Valor pipeline" value={formatMoney(totalValue)} icon={TrendingUp} tone="emerald" />
          <Kpi label="Prob. media" value={`${avgProb}%`} icon={Sparkles} tone="violet" />
          <Kpi label="Detenidas" value={stalledCount} icon={AlertTriangle} tone="amber" />
        </section>

        {filtered.length === 0 ? (
          <EmptyState hasAny={opps.length > 0} />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(Object.keys(STAGE_META) as OpportunityStage[]).map((stage) => (
              <StageColumn key={stage} stage={stage} items={groups[stage]} />
            ))}
          </div>
        )}

      </div>
    </AppShell>
  );
}

function StageColumn({ stage, items }: { stage: OpportunityStage; items: Opportunity[] }) {
  const meta = STAGE_META[stage];
  const value = items.reduce((s, o) => s + (o.estimated_value ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          <span className={cn("text-sm font-semibold", meta.color)}>{meta.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </div>
        {value > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">{formatMoney(value)}</span>
        )}
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">{meta.hint}</p>

      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/40 py-6 text-center text-xs text-muted-foreground">
            Sin oportunidades en esta etapa
          </div>
        ) : (
          items.map((o) => <OppCard key={o.id} o={o} />)
        )}
      </div>
    </div>
  );
}

function OppCard({ o }: { o: Opportunity }) {
  const navigate = useNavigate();
  const meta = STAGE_META[o.stage];

  const openConversation = () => {
    if (o.conversation_id) navigate({ to: "/", hash: o.conversation_id });
  };

  return (
    <article
      className={cn(
        "group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 ring-1 ring-transparent transition-all hover:shadow-md",
        meta.ring,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-semibold">{o.customer_name ?? o.customer_phone}</div>
            {o.is_client && (
              <Crown className="h-3 w-3 shrink-0 text-violet-500" aria-label="Ya es cliente" />
            )}
          </div>
          {o.customer_company && (
            <div className="truncate text-[11px] text-muted-foreground">{o.customer_company}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={cn("text-sm font-bold tabular-nums", meta.color)}>{o.probability}%</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">prob.</span>
        </div>
      </div>

      {/* Prob bar */}
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", meta.dot)} style={{ width: `${o.probability}%` }} />
      </div>

      {/* Intent / next step */}
      {(o.intent || o.next_step) && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2">
          {o.intent && (
            <div className="flex items-start gap-1.5">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
              <div className="text-[11px] leading-snug text-foreground">{o.intent}</div>
            </div>
          )}
          {o.next_step && (
            <div className="mt-1 pl-4 text-[11px] font-medium text-violet-600 dark:text-violet-400">
              → {o.next_step}
            </div>
          )}
        </div>
      )}

      {/* Products */}
      {o.products.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <Package className="h-3 w-3 text-muted-foreground" />
          {o.products.slice(0, 3).map((p) => (
            <span key={p} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {p}
            </span>
          ))}
          {o.products.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{o.products.length - 3}</span>
          )}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {o.days_since_interaction === null
            ? "sin interacción"
            : o.days_since_interaction === 0
            ? "hoy"
            : `hace ${o.days_since_interaction}d`}
          {o.stalled && (
            <span className="ml-1 rounded-sm bg-amber-500/15 px-1 text-[9px] font-semibold uppercase text-amber-600 dark:text-amber-400">
              detenida
            </span>
          )}
        </span>
        {o.estimated_value ? (
          <span className="font-semibold tabular-nums text-foreground">
            {formatMoney(o.estimated_value, o.currency)}
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-border pt-2">
        {o.conversation_id && (
          <Button
            size="sm"
            variant="ghost"
            onClick={openConversation}
            className="h-7 flex-1 justify-start text-[11px]"
          >
            <MessageSquare className="mr-1 h-3 w-3" />
            Conversación
          </Button>
        )}
        {o.quote_id ? (
          <Button asChild size="sm" variant="ghost" className="h-7 flex-1 justify-start text-[11px]">
            <Link to="/cotizaciones/$id" params={{ id: o.quote_id }}>
              <FileText className="mr-1 h-3 w-3" />
              Cotización
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost" className="h-7 flex-1 justify-start text-[11px]">
            <a href={`https://wa.me/${o.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
              <Phone className="mr-1 h-3 w-3" />
              WhatsApp
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="h-7 px-2">
          <Link to="/contactos/$id" params={{ id: o.customer_id }}>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>

      </div>
    </article>
  );
}

function Kpi({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Target;
  tone: "default" | "emerald" | "violet" | "amber";
}) {
  const t = {
    default: "text-muted-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    violet: "text-violet-600 dark:text-violet-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", t)} />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <Target className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">
        {hasAny ? "Sin oportunidades con esos filtros" : "Aún no hay oportunidades detectadas"}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasAny
          ? "Ajusta la búsqueda o desactiva el filtro de detenidas."
          : "La IA analizará las conversaciones de WhatsApp y detectará automáticamente intenciones de compra aquí."}
      </p>
    </div>
  );
}

function formatMoney(v: number, currency = "MXN") {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${Math.round(v).toLocaleString()}`;
  }
}
