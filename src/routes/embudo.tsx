import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  TrendingUp,
  DollarSign,
  Trophy,
  XCircle,
  Percent,
  Target,
  AlertTriangle,
  MessageSquare,
  Sparkles,
  Star,
  Clock,
  User,
  Search,
  Filter,
  LayoutGrid,
  List as ListIcon,
  BarChart3,
  Upload,
  Download,
  CheckSquare,
  Square,
  FileText,
  MoreHorizontal,
  UserPlus,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  listCustomers,
  listTeamMembers,
  bulkUpdateCustomers,
  bulkImportCustomers,
  deleteCustomers,
  type CrmCustomer,
} from "@/lib/crm.functions";
import { getPipelineAggregates, type PipelineAggregate } from "@/lib/pipeline.functions";
import {
  STAGES,
  normalizeStage,
  stageStyle,
  getStage,
  STAGNANT_DAYS_BY_STAGE,
} from "@/lib/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { cn } from "@/lib/utils";
import { useMyPlan } from "@/lib/use-plan";

import { CustomerQuickPanel } from "@/components/embudo/quick-panel";

export const Route = createFileRoute("/embudo")({
  head: () => ({
    meta: [
      { title: "Embudo de Ventas — Dialen" },
      {
        name: "description",
        content:
          "Pipeline comercial multi-vista con IA, cotizaciones, filtros avanzados y operaciones masivas.",
      },
    ],
  }),
  component: EmbudoPage,
});

type View = "kanban" | "list" | "forecast";

type Filters = {
  q: string;
  assignee: string; // "" any, "none" unassigned, or user id
  priority: string; // "" any
  vip: boolean;
  stagnant: boolean;
  hasReco: boolean;
  hasQuote: boolean;
  minValue: string;
  view: View;
};

const DEFAULT_FILTERS: Filters = {
  q: "",
  assignee: "",
  priority: "",
  vip: false,
  stagnant: false,
  hasReco: false,
  hasQuote: false,
  minValue: "",
  view: "kanban",
};

function EmbudoPage() {
  const qc = useQueryClient();
  const { has: hasPlanFeature } = useMyPlan();
  const canReco = hasPlanFeature("recommendador");
  const listFn = useServerFn(listCustomers);
  const teamFn = useServerFn(listTeamMembers);
  const aggFn = useServerFn(getPipelineAggregates);

  const { data: customers = [] } = useQuery({
    queryKey: ["pipeline-customers"],
    queryFn: () => listFn({ data: { limit: 500, sort: "last_interaction" } }),
  });
  const { data: team = [] } = useQuery({
    queryKey: ["pipeline-team"],
    queryFn: () => teamFn(),
  });
  const { data: aggregates = [] } = useQuery<PipelineAggregate[]>({
    queryKey: ["pipeline-aggregates"],
    queryFn: () => aggFn(),
  });

  useRealtimeInvalidate({
    channel: "pipeline-root",
    tables: [
      "customers",
      "conversations",
      "ai_insights",
      "product_recommendations",
      "quotes",
    ],
    invalidate: [["pipeline-customers"], ["pipeline-aggregates"]],
  });

  const aggMap = useMemo(() => {
    const m = new Map<string, PipelineAggregate>();
    aggregates.forEach((a) => m.set(a.customer_id, a));
    return m;
  }, [aggregates]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const min = filters.minValue ? Number(filters.minValue) : 0;
    return customers.filter((c) => {
      if (q) {
        const hay = `${c.name ?? ""} ${c.phone ?? ""} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.assignee === "none" && c.assignee_id) return false;
      if (filters.assignee && filters.assignee !== "none" && c.assignee_id !== filters.assignee) return false;
      if (filters.priority && (c.priority ?? "normal") !== filters.priority) return false;
      if (filters.vip && !(c.tags ?? []).includes("vip")) return false;
      if (min && Number(c.estimated_value ?? 0) < min) return false;
      const k = normalizeStage(c.stage);
      const threshold = STAGNANT_DAYS_BY_STAGE[k];
      if (filters.stagnant && !(threshold && daysSince(c.updated_at) > threshold)) return false;
      const agg = aggMap.get(c.id);
      if (filters.hasReco && canReco && !agg?.top_reco) return false;
      if (filters.hasQuote && !(agg?.quotes.active_count ?? 0)) return false;
      return true;
    });
  }, [customers, filters, aggMap, canReco]);

  const grouped = useMemo(() => {
    const g: Record<string, CrmCustomer[]> = {};
    for (const s of STAGES) g[s.key] = [];
    for (const c of filtered) {
      const k = normalizeStage(c.stage);
      (g[k] ??= []).push(c);
    }
    return g;
  }, [filtered]);

  const kpis = useMemo(() => {
    const open = filtered.filter((c) => getStage(normalizeStage(c.stage))?.kind === "open");
    const won = filtered.filter((c) => normalizeStage(c.stage) === "ganado");
    const lost = filtered.filter((c) => normalizeStage(c.stage) === "perdido");
    const pipelineValue = open.reduce((s, c) => s + Number(c.estimated_value ?? 0), 0);
    const wonValue = won.reduce((s, c) => s + Number(c.estimated_value ?? 0), 0);
    const decided = won.length + lost.length;
    const conversion = decided ? (won.length / decided) * 100 : 0;
    const avgTicket = won.length ? wonValue / won.length : 0;
    // Ponderado IA: sólo abiertos CON probabilidad IA real. Sin probabilidad no contribuye.
    let weighted = 0;
    let weightedCovered = 0;
    for (const c of open) {
      const p = aggMap.get(c.id)?.insight?.probability;
      if (p == null) continue;
      weighted += Number(c.estimated_value ?? 0) * Number(p);
      weightedCovered++;
    }
    return {
      open: open.length,
      won: won.length,
      lost: lost.length,
      pipelineValue,
      wonValue,
      conversion,
      avgTicket,
      weighted,
      weightedCovered,
    };
  }, [filtered, aggMap]);

  const alerts = useMemo(() => {
    let stagnant = 0;
    let unassigned = 0;
    let hot = 0;
    let risk = 0;
    const now = Date.now();
    let followupToday = 0;
    for (const c of filtered) {
      const k = normalizeStage(c.stage);
      const th = STAGNANT_DAYS_BY_STAGE[k];
      if (th && daysSince(c.updated_at) > th) stagnant++;
      if (!c.assignee_id && getStage(k)?.kind === "open") unassigned++;
      const ins = aggMap.get(c.id)?.insight;
      if (ins?.probability != null && Number(ins.probability) >= 0.7) hot++;
      if (ins?.churn_risk != null && Number(ins.churn_risk) >= 0.6) risk++;
      const na = c.next_activity_at;
      if (na) {
        const d = new Date(na).getTime();
        // Cuenta seguimientos vencidos o dentro de las próximas 24 h.
        if (d <= now + 86_400_000) followupToday++;
      }
    }
    return { stagnant, unassigned, hot, risk, followupToday };
  }, [filtered, aggMap]);

  const anyFilterActive =
    filters.q ||
    filters.assignee ||
    filters.priority ||
    filters.vip ||
    filters.stagnant ||
    filters.hasReco ||
    filters.hasQuote ||
    filters.minValue;

  const allSelected = selection.size > 0 && selection.size >= filtered.length;
  function toggleAll() {
    if (allSelected) setSelection(new Set());
    else setSelection(new Set(filtered.map((c) => c.id)));
  }
  function toggle(id: string) {
    setSelection((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkUpdate = useServerFn(bulkUpdateCustomers);
  const bulkDelete = useServerFn(deleteCustomers);

  async function applyBulk(patch: {
    stage?: string;
    priority?: string;
    status?: string;
    assignee_id?: string | null;
    tags_add?: string[];
    tags_remove?: string[];
  }) {
    if (selection.size === 0) return;
    try {
      const res = await bulkUpdate({ data: { ids: Array.from(selection), ...patch } });
      toast.success(`${res.updated} cliente${res.updated === 1 ? "" : "s"} actualizado${res.updated === 1 ? "" : "s"}`);
      setSelection(new Set());
      qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
      qc.invalidateQueries({ queryKey: ["pipeline-aggregates"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false);
  async function doBulkDelete() {
    try {
      const res = await bulkDelete({ data: { ids: Array.from(selection) } });
      toast.success(`${res.deleted} eliminado${res.deleted === 1 ? "" : "s"}`);
      setSelection(new Set());
      qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
      qc.invalidateQueries({ queryKey: ["pipeline-aggregates"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportCsv() {
    const target = selection.size ? filtered.filter((c) => selection.has(c.id)) : filtered;
    const header = [
      "phone",
      "name",
      "email",
      "company",
      "stage",
      "priority",
      "status",
      "estimated_value",
      "tags",
      "assignee",
      "days_in_stage",
      "unread",
      "probability",
      "intent",
      "active_quote",
      "next_activity_at",
    ];
    const rows = target.map((c) => {
      const a = aggMap.get(c.id);
      const owner = team.find((t) => t.id === c.assignee_id);
      return [
        c.phone,
        c.name ?? "",
        c.email ?? "",
        c.company ?? "",
        normalizeStage(c.stage),
        c.priority ?? "",
        c.status ?? "",
        c.estimated_value ?? "",
        (c.tags ?? []).join("|"),
        owner?.full_name ?? owner?.email ?? "",
        daysSince(c.updated_at),
        a?.unread ?? 0,
        a?.insight?.probability ?? "",
        a?.insight?.intent ?? "",
        a?.quotes.active_number ?? "",
        c.next_activity_at ?? "",
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `embudo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} filas exportadas`);
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b bg-background/80 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold sm:text-xl">Embudo de Ventas</h1>
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                {filtered.length} de {customers.length} clientes · Vista comercial con IA
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ViewSwitcher value={filters.view} onChange={(v) => setFilters((f) => ({ ...f, view: v }))} />
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Upload className="h-3.5 w-3.5" /> Importar
                  </Button>
                </DialogTrigger>
                <ImportDialog onClose={() => setImportOpen(false)} />
              </Dialog>
              <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1">
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-7">
            <Kpi icon={DollarSign} label="Pipeline" value={fmtMoney(kpis.pipelineValue)} accent="text-emerald-400" />
            <Kpi
              icon={Sparkles}
              label="Ponderado IA"
              value={fmtMoney(kpis.weighted)}
              accent="text-primary"
              hint={
                kpis.weightedCovered === 0
                  ? "Sin señal IA aún"
                  : `${kpis.weightedCovered} con probabilidad IA`
              }
            />
            <Kpi icon={Target} label="Oportunidades" value={String(kpis.open)} />
            <Kpi icon={Trophy} label="Ganadas" value={String(kpis.won)} accent="text-emerald-400" />
            <Kpi icon={XCircle} label="Perdidas" value={String(kpis.lost)} accent="text-rose-400" />
            <Kpi
              icon={Percent}
              label="Conversión"
              value={kpis.won + kpis.lost === 0 ? "—" : `${kpis.conversion.toFixed(1)}%`}
              hint={kpis.won + kpis.lost === 0 ? "Sin decisiones aún" : `${kpis.won + kpis.lost} decididas`}
            />
            <Kpi
              icon={TrendingUp}
              label="Ticket prom."
              value={kpis.won === 0 ? "—" : fmtMoney(kpis.avgTicket)}
              hint={kpis.won === 0 ? "Sin ganadas aún" : undefined}
            />
          </div>

          {/* Alerts strip */}
          <AlertsStrip
            alerts={alerts}
            onStagnant={() => setFilters((f) => ({ ...f, stagnant: true }))}
            onUnassigned={() => setFilters((f) => ({ ...f, assignee: "none" }))}
          />

          {/* Filters + bulk bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="Buscar por nombre, teléfono, empresa o email…"
                className="h-9 pl-8"
              />
            </div>
            <FiltersPopover filters={filters} setFilters={setFilters} team={team} canReco={canReco} />
            {anyFilterActive && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)} className="gap-1">
                <XCircle className="h-3.5 w-3.5" /> Limpiar
              </Button>
            )}
            {selection.size > 0 && (
              <div className="ml-auto flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1">
                <span className="text-xs font-medium">{selection.size} seleccionados</span>
                <BulkMenu
                  team={team}
                  onAssign={(id) => applyBulk({ assignee_id: id })}
                  onStage={(s) => applyBulk({ stage: s })}
                  onPriority={(p) => applyBulk({ priority: p })}
                  onArchive={() => applyBulk({ status: "archived" })}
                  onDelete={() => setConfirmDelete(true)}
                  onExport={exportCsv}
                />
                <Button variant="ghost" size="sm" onClick={() => setSelection(new Set())} className="h-7">
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Views */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {filters.view === "kanban" && (
            <KanbanView
              grouped={grouped}
              team={team}
              aggMap={aggMap}
              selection={selection}
              onToggle={toggle}
              onOpen={setOpenCustomerId}
              canReco={canReco}
            />
          )}
          {filters.view === "list" && (
            <ListView
              customers={filtered}
              team={team}
              aggMap={aggMap}
              selection={selection}
              onToggle={toggle}
              onToggleAll={toggleAll}
              allSelected={allSelected}
              onOpen={setOpenCustomerId}
            />
          )}
          {filters.view === "forecast" && (
            <ForecastView customers={filtered} aggMap={aggMap} onOpen={setOpenCustomerId} />
          )}
        </div>
      </div>

      {openCustomerId && (
        <CustomerQuickPanel
          customerId={openCustomerId}
          team={team}
          onClose={() => setOpenCustomerId(null)}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selection.size} clientes?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción borrará clientes junto con su historial. Los que tengan cotizaciones o conversaciones activas deberían archivarse en lugar de eliminarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmDelete(false);
                await doBulkDelete();
              }}
            >
              Eliminar {selection.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ============================================================================
// View switcher
// ============================================================================
function ViewSwitcher({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const items: { value: View; label: string; icon: typeof LayoutGrid }[] = [
    { value: "kanban", label: "Kanban", icon: LayoutGrid },
    { value: "list", label: "Lista", icon: ListIcon },
    { value: "forecast", label: "Pronóstico", icon: BarChart3 },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors",
            value === it.value
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted",
          )}
        >
          <it.icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Alerts strip
// ============================================================================
function AlertsStrip({
  alerts,
  onStagnant,
  onUnassigned,
}: {
  alerts: { stagnant: number; unassigned: number; hot: number; risk: number; followupToday: number };
  onStagnant: () => void;
  onUnassigned: () => void;
}) {
  type Item = { key: string; label: string; count: number; tone: "amber" | "rose" | "emerald" | "primary"; onClick?: () => void; icon: typeof AlertTriangle };
  const items: Item[] = ([
    { key: "hot", label: "Alta probabilidad", count: alerts.hot, tone: "emerald", icon: Sparkles },
    { key: "followup", label: "Seguimientos hoy", count: alerts.followupToday, tone: "primary", icon: Clock },
    { key: "stagnant", label: "Estancados", count: alerts.stagnant, tone: "amber", icon: AlertTriangle, onClick: onStagnant },
    { key: "unassigned", label: "Sin responsable", count: alerts.unassigned, tone: "amber", icon: UserPlus, onClick: onUnassigned },
    { key: "risk", label: "Riesgo de pérdida", count: alerts.risk, tone: "rose", icon: AlertTriangle },
  ] as Item[]).filter((i) => i.count > 0);
  if (!items.length) return null;
  const toneClasses = {
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/15",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15",
    primary: "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
  } as const;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          key={i.key}
          onClick={i.onClick}
          disabled={!i.onClick}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            toneClasses[i.tone],
            !i.onClick && "cursor-default",
          )}
        >
          <i.icon className="h-3 w-3" />
          {i.label}
          <span className="rounded-full bg-background/60 px-1.5 py-0.5 tabular-nums">{i.count}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Filters popover
// ============================================================================
function FiltersPopover({
  filters,
  setFilters,
  team,
  canReco,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  team: { id: string; full_name: string | null; email: string | null }[];
  canReco: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <Label>Responsable</Label>
            <select
              value={filters.assignee}
              onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="none">Sin responsable</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Prioridad</Label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Cualquiera</option>
              {["low", "normal", "high", "urgent"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Valor mínimo</Label>
            <Input
              type="number"
              value={filters.minValue}
              onChange={(e) => setFilters((f) => ({ ...f, minValue: e.target.value }))}
              placeholder="0"
              className="h-9"
            />
          </div>
          <div className="space-y-2 rounded-md border p-2">
            <Toggle checked={filters.vip} onChange={(v) => setFilters((f) => ({ ...f, vip: v }))} label="Sólo VIP" />
            <Toggle checked={filters.stagnant} onChange={(v) => setFilters((f) => ({ ...f, stagnant: v }))} label="Sólo estancados" />
            {canReco && (
              <Toggle checked={filters.hasReco} onChange={(v) => setFilters((f) => ({ ...f, hasReco: v }))} label="Con recomendación IA" />
            )}
            <Toggle checked={filters.hasQuote} onChange={(v) => setFilters((f) => ({ ...f, hasQuote: v }))} label="Con cotización activa" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{children}</div>;
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 text-left text-sm"
    >
      {checked ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
      <span>{label}</span>
    </button>
  );
}

// ============================================================================
// Bulk actions menu
// ============================================================================
function BulkMenu({
  team,
  onAssign,
  onStage,
  onPriority,
  onArchive,
  onDelete,
  onExport,
}: {
  team: { id: string; full_name: string | null; email: string | null }[];
  onAssign: (id: string | null) => void;
  onStage: (s: string) => void;
  onPriority: (p: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm" className="h-7 gap-1">
          Acciones <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Cambiar</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Responsable</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onAssign(null)}>Sin responsable</DropdownMenuItem>
            {team.map((m) => (
              <DropdownMenuItem key={m.id} onClick={() => onAssign(m.id)}>
                {m.full_name ?? m.email}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Etapa</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {STAGES.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => onStage(s.key)}>{s.label}</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Prioridad</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {["low", "normal", "high", "urgent"].map((p) => (
              <DropdownMenuItem key={p} onClick={() => onPriority(p)}>{p}</DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onExport}>Exportar seleccionados</DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive}>Archivar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-rose-500 focus:text-rose-500">
          Eliminar…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Kanban view
// ============================================================================
function KanbanView({
  grouped,
  team,
  aggMap,
  selection,
  onToggle,
  onOpen,
  canReco,
}: {
  grouped: Record<string, CrmCustomer[]>;
  team: { id: string; full_name: string | null; email: string | null }[];
  aggMap: Map<string, PipelineAggregate>;
  selection: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  canReco: boolean;
}) {
  return (
    <div className="h-full overflow-x-auto overflow-y-hidden px-4 py-4 sm:px-6 sm:py-5">
      <div className="grid h-full min-h-0 auto-cols-[78vw] grid-flow-col gap-3 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((stage, idx) => {
          const items = grouped[stage.key] ?? [];
          const style = stageStyle(stage.key);
          const total = items.reduce((s, c) => s + Number(c.estimated_value ?? 0), 0);
          const nextStage = STAGES[idx + 1];
          const nextCount = nextStage ? (grouped[nextStage.key]?.length ?? 0) : 0;
          const convRate =
            stage.kind === "open" && nextStage && items.length + nextCount > 0
              ? (nextCount / (items.length + nextCount)) * 100
              : null;
          const stagnantThreshold = STAGNANT_DAYS_BY_STAGE[stage.key];
          const stagnantCount = stagnantThreshold
            ? items.filter((c) => daysSince(c.updated_at) > stagnantThreshold).length
            : 0;
          return (
            <div
              key={stage.key}
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/30 shadow-sm backdrop-blur-sm"
            >
              <div className={cn("h-[3px]", style.bar)} />
              <div className="border-b border-border/50 bg-gradient-to-b from-card/60 to-transparent px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", style.bar)} />
                    <span className="truncate text-sm font-semibold tracking-tight">{stage.label}</span>
                    <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", style.badge)}>
                      {items.length}
                    </span>
                  </div>
                  {stagnantCount > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400" title={`${stagnantCount} > ${stagnantThreshold}d`}>
                      <AlertTriangle className="h-3 w-3" /> {stagnantCount}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-medium tabular-nums">{fmtMoney(total)}</span>
                  {convRate !== null && (
                    <span title="Conversión a siguiente etapa" className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5">
                      → {convRate.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-2.5 py-2.5">
                {items.length === 0 ? (
                  <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground/70">
                    Sin clientes
                  </div>
                ) : (
                  items.map((c) => (
                    <CustomerCard
                      key={c.id}
                      customer={c}
                      team={team}
                      agg={aggMap.get(c.id)}
                      selected={selection.has(c.id)}
                      onToggle={() => onToggle(c.id)}
                      onOpen={() => onOpen(c.id)}
                      stagnantThreshold={stagnantThreshold}
                      canReco={canReco}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Customer card (Kanban)
// ============================================================================
function CustomerCard({
  customer,
  team,
  agg,
  selected,
  onToggle,
  onOpen,
  stagnantThreshold,
  canReco,
}: {
  customer: CrmCustomer;
  team: { id: string; full_name: string | null; email: string | null }[];
  agg?: PipelineAggregate;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  stagnantThreshold?: number;
  canReco: boolean;
}) {
  const initials = (customer.name ?? customer.phone).slice(0, 2).toUpperCase();
  const owner = team.find((t) => t.id === customer.assignee_id);
  const daysInStage = daysSince(customer.updated_at);
  const stagnant = stagnantThreshold ? daysInStage > stagnantThreshold : false;
  const priority = customer.priority ?? "normal";
  const isVip = (customer.tags ?? []).includes("vip");
  const insight = agg?.insight;
  const hot =
    insight &&
    (insight.intent === "high_intent" ||
      insight.intent === "ready_to_close" ||
      (insight.probability != null && Number(insight.probability) >= 0.7));
  const atRisk = insight && insight.churn_risk != null && Number(insight.churn_risk) >= 0.6;
  const activeQuote = agg?.quotes.active_id;
  const unread = agg?.unread ?? 0;
  const topReco = agg?.top_reco;
  const conversationId = agg?.conversation_id;

  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md",
        stagnant && "border-amber-500/40",
        selected && "border-primary ring-1 ring-primary",
      )}
      onClick={onOpen}
    >
      <div
        className="absolute left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ opacity: selected ? 1 : undefined }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>

      <div className={cn("flex items-start justify-between gap-2", "pl-6")}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-[10px] font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-1 truncate text-sm font-medium">
              <span className="truncate">{customer.name ?? customer.phone}</span>
              {isVip && <Star className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />}
              {hot && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600" title={`IA: ${insight?.intent ?? "hot"}`}>
                  <Sparkles className="h-2.5 w-2.5" /> Hot
                </span>
              )}
              {atRisk && !hot && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600">
                  <AlertTriangle className="h-2.5 w-2.5" /> Riesgo
                </span>
              )}
            </div>
            {customer.company && (
              <div className="truncate text-[11px] text-muted-foreground">{customer.company}</div>
            )}
          </div>
        </div>
        {priority && priority !== "normal" && (
          <span className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] capitalize",
            priority === "urgent" && "bg-rose-500/10 text-rose-300",
            priority === "high" && "bg-orange-500/10 text-orange-300",
            priority === "low" && "bg-muted text-muted-foreground",
          )}>
            {priority}
          </span>
        )}
      </div>

      {(customer.tags ?? []).filter((t) => t !== "vip").slice(0, 3).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(customer.tags ?? []).filter((t) => t !== "vip").slice(0, 3).map((t) => (
            <span key={t} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]">{t}</span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          {customer.estimated_value ? fmtMoney(Number(customer.estimated_value)) : "—"}
          {insight?.probability != null && (
            <span className="ml-1 rounded bg-primary/10 px-1 text-[9px] text-primary">
              {Math.round(Number(insight.probability) * 100)}%
            </span>
          )}
        </span>
        <span className={cn("inline-flex items-center gap-1", stagnant && "text-amber-400")}>
          <Clock className="h-3 w-3" /> {daysInStage}d
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 truncate">
          <User className="h-3 w-3" />
          <span className="truncate">{owner ? (owner.full_name ?? owner.email) : "Sin responsable"}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          {activeQuote && (
            <Link
              to="/cotizaciones/$id"
              params={{ id: activeQuote }}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500"
              title={`Cotización ${agg?.quotes.active_number ?? ""}`}
            >
              <FileText className="h-3 w-3" /> {agg?.quotes.active_status}
            </Link>
          )}
          {unread > 0 && conversationId && (
            <Link
              to="/conversaciones"
              hash={`conv=${conversationId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-primary"
            >
              <MessageSquare className="h-3 w-3" /> {unread}
            </Link>
          )}
        </span>
      </div>

      {canReco ? (
        topReco ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10px]" title={topReco.reason_code ?? undefined}>
            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate font-medium text-foreground">{topReco.name}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">
              {topReco.currency} {topReco.price.toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-border/60 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>Sin recomendación IA aún</span>
          </div>
        )
      ) : (
        <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Recomendador IA · Plan Business
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// List view
// ============================================================================
function ListView({
  customers,
  team,
  aggMap,
  selection,
  onToggle,
  onToggleAll,
  allSelected,
  onOpen,
}: {
  customers: CrmCustomer[];
  team: { id: string; full_name: string | null; email: string | null }[];
  aggMap: Map<string, PipelineAggregate>;
  selection: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-auto px-4 py-4 sm:px-6">
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2 text-left">
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
              </th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Etapa</th>
              <th className="px-3 py-2 text-left">Responsable</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Prob. IA</th>
              <th className="px-3 py-2 text-right">Días</th>
              <th className="px-3 py-2 text-left">Cotización</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground">
                  No hay clientes que coincidan con los filtros
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const owner = team.find((t) => t.id === c.assignee_id);
                const agg = aggMap.get(c.id);
                const st = stageStyle(normalizeStage(c.stage));
                const days = daysSince(c.updated_at);
                const th = STAGNANT_DAYS_BY_STAGE[normalizeStage(c.stage)];
                const stagnant = th && days > th;
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "cursor-pointer border-t transition-colors hover:bg-muted/30",
                      selection.has(c.id) && "bg-primary/5",
                    )}
                    onClick={() => onOpen(c.id)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selection.has(c.id)} onCheckedChange={() => onToggle(c.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{c.name ?? c.phone}</span>
                        {(c.tags ?? []).includes("vip") && (
                          <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {c.company ?? c.phone}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", st.badge)}>
                        {getStage(normalizeStage(c.stage))?.label ?? c.stage}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {owner ? (owner.full_name ?? owner.email) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.estimated_value ? fmtMoney(Number(c.estimated_value)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {agg?.insight?.probability != null ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {Math.round(Number(agg.insight.probability) * 100)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", stagnant && "text-amber-500")}>{days}d</td>
                    <td className="px-3 py-2">
                      {agg?.quotes.active_id ? (
                        <Link
                          to="/cotizaciones/$id"
                          params={{ id: agg.quotes.active_id }}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-500"
                        >
                          <FileText className="h-3 w-3" /> {agg.quotes.active_number ?? agg.quotes.active_status}
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 text-right">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Forecast view — Σ value × probability grouped by month based on next_activity
// or updated_at fallback.
// ============================================================================
function ForecastView({
  customers,
  aggMap,
  onOpen,
}: {
  customers: CrmCustomer[];
  aggMap: Map<string, PipelineAggregate>;
  onOpen: (id: string) => void;
}) {
  const buckets = useMemo(() => {
    const b: Record<string, { key: string; label: string; items: CrmCustomer[]; total: number; weighted: number }> = {};
    for (const c of customers) {
      const k = normalizeStage(c.stage);
      const kind = getStage(k)?.kind;
      if (kind !== "open") continue;
      const dateStr = c.next_activity_at ?? c.updated_at;
      const d = dateStr ? new Date(dateStr) : new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const prob = Number(aggMap.get(c.id)?.insight?.probability ?? 0);
      const val = Number(c.estimated_value ?? 0);
      const bucket = (b[key] ??= { key, label, items: [], total: 0, weighted: 0 });
      bucket.items.push(c);
      bucket.total += val;
      bucket.weighted += val * prob;
    }
    return Object.values(b).sort((a, b) => a.key.localeCompare(b.key));
  }, [customers, aggMap]);

  if (buckets.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No hay oportunidades abiertas para pronosticar.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {buckets.map((b) => (
          <div key={b.key} className="rounded-2xl border bg-card/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold capitalize">{b.label}</h3>
              <span className="text-[11px] text-muted-foreground">{b.items.length} oport.</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border bg-background p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Valor total</div>
                <div className="font-semibold tabular-nums">{fmtMoney(b.total)}</div>
              </div>
              <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
                <div className="text-[10px] uppercase text-primary">Ponderado IA</div>
                <div className="font-semibold text-primary tabular-nums">{fmtMoney(b.weighted)}</div>
              </div>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {b.items
                .sort((a, b) => Number(b.estimated_value ?? 0) - Number(a.estimated_value ?? 0))
                .map((c) => {
                  const prob = Number(aggMap.get(c.id)?.insight?.probability ?? 0);
                  const val = Number(c.estimated_value ?? 0);
                  return (
                    <li
                      key={c.id}
                      onClick={() => onOpen(c.id)}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted/60"
                    >
                      <span className="truncate">{c.name ?? c.phone}</span>
                      <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                        <span>{fmtMoney(val)}</span>
                        {prob > 0 && <span className="rounded bg-primary/10 px-1 text-[9px] text-primary">{Math.round(prob * 100)}%</span>}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Import dialog
// ============================================================================
function ImportDialog({ onClose }: { onClose: () => void }) {
  const importFn = useServerFn(bulkImportCustomers);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("No se detectaron filas válidas (se requiere teléfono)");
      return;
    }
    setLoading(true);
    try {
      const res = await importFn({ data: { rows } });
      toast.success(`${res.created} creados · ${res.skipped} duplicados omitidos`);
      qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
      qc.invalidateQueries({ queryKey: ["pipeline-aggregates"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Importar clientes (CSV)</DialogTitle>
        <DialogDescription>
          Pega tu CSV con encabezados. Columnas soportadas: <code>phone</code> (obligatorio), name, email, company, stage, priority, tags, estimated_value, notes. Se ignoran teléfonos duplicados.
        </DialogDescription>
      </DialogHeader>
      <Textarea
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="phone,name,email,company,stage,priority,tags,estimated_value&#10;+5215551234567,Juan Pérez,juan@ex.com,ACME,nuevo_lead,high,vip|mayorista,25000"
        className="font-mono text-xs"
      />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={loading || !text.trim()}>
          {loading ? "Importando…" : "Importar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function parseCsv(text: string): Array<{
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  stage?: string;
  priority?: string;
  tags?: string[];
  estimated_value?: number;
  notes?: string;
}> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => (rec[h] = (cols[idx] ?? "").trim()));
    if (!rec.phone) continue;
    rows.push({
      phone: rec.phone,
      name: rec.name || undefined,
      email: rec.email || undefined,
      company: rec.company || undefined,
      stage: rec.stage || undefined,
      priority: rec.priority || undefined,
      tags: rec.tags ? rec.tags.split(/[|;]/).map((t) => t.trim()).filter(Boolean) : undefined,
      estimated_value: rec.estimated_value ? Number(rec.estimated_value) : undefined,
      notes: rec.notes || undefined,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// ============================================================================
// KPI card
// ============================================================================
function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-0.5 truncate font-display text-lg font-semibold tabular-nums", accent)} title={value}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function daysSince(iso: string | null | undefined) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function fmtMoney(n: number) {
  if (!n) return "$0";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}
