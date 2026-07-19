import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  Search,
  Sparkles,
  Crown,
  AlertTriangle,
  TrendingUp,
  Moon,
  UserPlus,
  Repeat,
  Phone,
  Building2,
  ArrowUpRight,
  Package,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listClients, type ClientRow, type ClientSegment } from "@/lib/clients.functions";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Dialen" },
      { name: "description", content: "Memoria comercial inteligente de tus clientes actuales." },
    ],
  }),
  component: ClientsPage,
});

const SEGMENT_META: Record<
  ClientSegment,
  { label: string; icon: typeof Crown; tint: string; ring: string; text: string }
> = {
  opportunity: {
    label: "Oportunidad",
    icon: TrendingUp,
    tint: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  at_risk: {
    label: "En riesgo",
    icon: AlertTriangle,
    tint: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  vip: {
    label: "VIP",
    icon: Crown,
    tint: "bg-violet-500/10",
    ring: "ring-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
  },
  recurrent: {
    label: "Recurrente",
    icon: Repeat,
    tint: "bg-blue-500/10",
    ring: "ring-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
  },
  new: {
    label: "Nuevo",
    icon: UserPlus,
    tint: "bg-sky-500/10",
    ring: "ring-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
  },
  dormant: {
    label: "Dormido",
    icon: Moon,
    tint: "bg-muted",
    ring: "ring-border",
    text: "text-muted-foreground",
  },
};

type Filter = "all" | ClientSegment;

function ClientsPage() {
  const list = useServerFn(listClients);
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => list(),
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Record<ClientSegment, number> = {
      opportunity: 0, at_risk: 0, vip: 0, recurrent: 0, new: 0, dormant: 0,
    };
    clients.forEach((r) => { c[r.segment]++; });
    return c;
  }, [clients]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter !== "all" && c.segment !== filter) return false;
      if (!s) return true;
      return (
        (c.name ?? "").toLowerCase().includes(s) ||
        (c.company ?? "").toLowerCase().includes(s) ||
        c.phone.includes(s)
      );
    });
  }, [clients, filter, search]);

  const totalSpent = clients.reduce((s, c) => s + c.total_spent, 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              Memoria comercial
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Clientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Los que ya compraron. La IA los agrupa por oportunidad, riesgo y valor.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, empresa, teléfono…"
              className="pl-9"
            />
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Clientes activos"
            value={clients.length.toString()}
            icon={Users}
            tone="default"
          />
          <KpiCard
            label="Oportunidad ahora"
            value={counts.opportunity.toString()}
            icon={TrendingUp}
            tone="emerald"
          />
          <KpiCard
            label="En riesgo"
            value={counts.at_risk.toString()}
            icon={AlertTriangle}
            tone="amber"
          />
          <KpiCard
            label="Valor total"
            value={formatMoney(totalSpent, clients[0]?.currency ?? "MXN")}
            icon={Sparkles}
            tone="violet"
          />
        </section>

        {/* Segment tabs */}
        <div className="flex flex-wrap gap-2">
          <SegTab active={filter === "all"} onClick={() => setFilter("all")} label="Todos" count={clients.length} />
          {(Object.keys(SEGMENT_META) as ClientSegment[]).map((seg) => (
            <SegTab
              key={seg}
              active={filter === seg}
              onClick={() => setFilter(seg)}
              label={SEGMENT_META[seg].label}
              count={counts[seg]}
              tint={SEGMENT_META[seg].text}
            />
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-card/50" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasClients={clients.length > 0} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((c) => (
              <ClientCard key={c.customer_id} c={c} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ClientCard({ c }: { c: ClientRow }) {
  const meta = SEGMENT_META[c.segment];
  const Icon = meta.icon;
  const whatsappHref = `https://wa.me/${c.phone.replace(/\D/g, "")}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 ring-1 ring-transparent transition-all hover:shadow-md",
        meta.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/clientes/$id"
          params={{ id: c.customer_id }}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-2">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold", meta.tint, meta.text)}>
              {(c.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{c.name ?? c.phone}</div>
              {c.company && (
                <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {c.company}
                </div>
              )}
            </div>
          </div>
        </Link>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            meta.tint,
            meta.text,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
        <Stat label="Compras" value={c.purchase_count.toString()} />
        <Stat label="Valor" value={formatMoney(c.total_spent, c.currency)} />
        <Stat
          label="Última"
          value={c.days_since_last === 0 ? "hoy" : `${c.days_since_last}d`}
        />
      </div>

      {/* AI recommendation */}
      <div className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
        <div className="min-w-0 space-y-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            Acción sugerida
          </div>
          <div className="text-xs leading-snug text-foreground">{c.recommended_action}</div>
          {c.expected_next_days !== null && c.avg_days_between && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {c.expected_next_days === 0
                ? `Ventana de recompra abierta (compra c/${c.avg_days_between}d)`
                : c.expected_next_days > 0
                ? `Recompra estimada en ${c.expected_next_days}d`
                : `Vencida hace ${Math.abs(c.expected_next_days)}d`}
            </div>
          )}
        </div>
      </div>

      {/* Products */}
      {c.products.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <Package className="h-3 w-3 text-muted-foreground" />
          {c.products.slice(0, 3).map((p) => (
            <span key={p} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {p}
            </span>
          ))}
          {c.products.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{c.products.length - 3}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button asChild size="sm" variant="outline" className="h-8 flex-1">
          <a href={whatsappHref} target="_blank" rel="noreferrer">
            <Phone className="mr-1.5 h-3.5 w-3.5" />
            WhatsApp
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-8">
          <Link to="/clientes/$id" params={{ id: c.customer_id }}>
            Ver ficha
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  tone: "default" | "emerald" | "amber" | "violet";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    violet: "text-violet-600 dark:text-violet-400",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", toneClass)} />
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SegTab({
  active, onClick, label, count, tint,
}: {
  active: boolean; onClick: () => void; label: string; count: number; tint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={!active ? tint : undefined}>{label}</span>
      <span className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
        active ? "bg-background/20" : "bg-muted",
      )}>{count}</span>
    </button>
  );
}

function EmptyState({ hasClients }: { hasClients: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <Users className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">
        {hasClients ? "Sin resultados en este segmento" : "Aún no hay clientes"}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasClients
          ? "Prueba con otro filtro o búsqueda."
          : "Cuando una cotización se marca como aceptada, el contacto pasa a Clientes automáticamente."}
      </p>
    </div>
  );
}

function formatMoney(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${Math.round(v).toLocaleString()}`;
  }
}
