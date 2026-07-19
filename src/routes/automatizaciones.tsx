import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap, Play, Pause, Copy, Trash2, Plus, Download, Upload, Save,
  AlertCircle, CheckCircle2, Clock, Activity, X as XIcon,
  Sparkles, ArrowRight, Settings2, History, ChevronRight,
  Search, Filter, ArrowUpDown, ListChecks, Beaker, MessagesSquare,
  ExternalLink, RotateCcw, FileText, TrendingUp, RefreshCw, PackageSearch,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  listAutomationsAdvanced, getAutomation, createAutomation, saveAutomation,
  setAutomationStatus, duplicateAutomation, deleteAutomation,
  importAutomation, listAutomationRuns, runAutomationForCustomer,
  bulkAutomationAction, exportAutomationsBundle,
  getAutomationsAggregate, listAllRuns,
  listAutomationVersions, restoreAutomationVersion,
  pickTestCustomers, getRecipeSuggestions,
  type Automation, type AutomationRun, type GlobalRun, type AutomationVersion,
} from "@/lib/automations.functions";
import {
  TRIGGERS, CONDITIONS, ACTIONS,
  TRIGGER_BY_TYPE, CONDITION_BY_TYPE, ACTION_BY_TYPE,
  type FlowDefinition, type FlowCondition, type FlowAction, type FieldSpec,
} from "@/lib/automations/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/automatizaciones")({
  head: () => ({
    meta: [
      { title: "Automatizaciones — Dialen" },
      { name: "description", content: "Motor de flujos que orquesta CRM, Bandeja, Embudo, Cotizaciones e IA." },
    ],
  }),
  component: AutomationsPage,
});

type MainTab = "list" | "recipes" | "runs" | "insights";
type StatusFilter = "all" | "draft" | "active" | "paused" | "error";
type SortMode = "recent" | "name" | "runs" | "errors" | "last_run";

const TRIGGER_CATEGORIES = ["all", "Bandeja", "CRM", "Embudo", "Ventas", "IA", "Catálogo", "Tiempo", "Manual"] as const;

function AutomationsPage() {
  const qc = useQueryClient();
  const listAdvFn = useServerFn(listAutomationsAdvanced);
  const create = useServerFn(createAutomation);
  const setStatus = useServerFn(setAutomationStatus);
  const duplicate = useServerFn(duplicateAutomation);
  const del = useServerFn(deleteAutomation);
  const imp = useServerFn(importAutomation);
  const bulk = useServerFn(bulkAutomationAction);
  const exportFn = useServerFn(exportAutomationsBundle);
  const aggFn = useServerFn(getAutomationsAggregate);

  const [tab, setTab] = useState<MainTab>("list");
  const [search, setSearch] = useState("");
  const [status, setStatusF] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null);
  const [pendingBulk, setPendingBulk] = useState<null | "delete">(null);

  const listQ = useQuery({
    queryKey: ["automations-adv", { search, status, category, sort }],
    queryFn: () => listAdvFn({ data: {
      search: search.trim() || null,
      status,
      triggerCategory: category === "all" ? null : category,
      sort,
      page: 1,
      pageSize: 200,
    } }),
  });
  const automations = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? 0;

  const aggQ = useQuery({
    queryKey: ["automations-agg"],
    queryFn: () => aggFn(),
  });
  const agg = aggQ.data;

  useRealtimeInvalidate({
    channel: "automations-page",
    tables: ["automations", "automation_runs"],
    invalidate: [["automations-adv"], ["automations-agg"], ["automations-runs-global"]],
  });

  // Keep selection consistent with visible rows.
  useEffect(() => {
    if (selected.size === 0) return;
    const visible = new Set(automations.map((a) => a.id));
    const kept = [...selected].filter((id) => visible.has(id));
    if (kept.length !== selected.size) setSelected(new Set(kept));
  }, [automations]); // eslint-disable-line

  const kpis = useMemo(() => ({
    count: agg?.total ?? total,
    active: agg?.active ?? 0,
    paused: agg?.paused ?? 0,
    runs7d: agg?.runsLast7d ?? 0,
    errors7d: agg?.errorsLast7d ?? 0,
  }), [agg, total]);

  async function handleCreate() {
    setCreating(true);
    try {
      const a = await create({ data: { name: "Nueva automatización" } });
      qc.invalidateQueries({ queryKey: ["automations-adv"] });
      setOpenId(a.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  async function handleImport() {
    const raw = window.prompt("Pega el JSON exportado de una automatización o bundle:");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.automations) ? parsed.automations
        : Array.isArray(parsed) ? parsed
        : [parsed];
      let ok = 0, fail = 0;
      for (const item of list) {
        try {
          await imp({ data: {
            name: item.name ?? "Importada",
            description: item.description ?? null,
            flow: {
              trigger: item.trigger ?? { type: "manual" },
              conditions: item.conditions ?? [],
              actions: item.actions ?? [],
            },
          } });
          ok += 1;
        } catch { fail += 1; }
      }
      toast.success(`${ok} importadas${fail ? ` · ${fail} fallaron` : ""}`);
      qc.invalidateQueries({ queryKey: ["automations-adv"] });
    } catch (e) {
      toast.error("JSON inválido: " + (e as Error).message);
    }
  }
  async function handleExportAll() {
    try {
      const ids = selected.size > 0 ? [...selected] : undefined;
      const bundle = await exportFn({ data: ids ? { ids } : {} });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `automatizaciones-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportadas ${bundle.count} automatizaciones`);
    } catch (e) { toast.error((e as Error).message); }
  }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleSelectAll() {
    if (selected.size === automations.length) setSelected(new Set());
    else setSelected(new Set(automations.map((a) => a.id)));
  }
  async function doBulk(action: "activate" | "pause" | "delete" | "duplicate") {
    if (selected.size === 0) return;
    try {
      const r = await bulk({ data: { ids: [...selected], action } });
      qc.invalidateQueries({ queryKey: ["automations-adv"] });
      setSelected(new Set());
      setPendingBulk(null);
      toast.success(`${r.count} actualizadas`);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" /> Motor de Automatizaciones
              </h1>
              <p className="text-xs text-muted-foreground">
                Orquestador central · CRM + Bandeja + Embudo + Cotizaciones + IA · Sin datos duplicados
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleImport} className="gap-1">
                <Upload className="h-3.5 w-3.5" /> Importar
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportAll} className="gap-1">
                <Download className="h-3.5 w-3.5" /> Exportar {selected.size > 0 ? `(${selected.size})` : "todo"}
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={creating} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Nuevo flujo
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi icon={Zap} label="Flujos" value={String(kpis.count)} />
            <Kpi icon={Play} label="Activos" value={String(kpis.active)} accent="text-emerald-400" />
            <Kpi icon={Pause} label="Pausados" value={String(kpis.paused)} accent="text-amber-400" />
            <Kpi icon={Activity} label="Runs 7d" value={String(kpis.runs7d)} />
            <Kpi icon={AlertCircle} label="Errores 7d" value={String(kpis.errors7d)}
              accent={kpis.errors7d > 0 ? "text-rose-400" : undefined} />
          </div>
          <div className="mt-3 flex items-center gap-1 border-b border-transparent overflow-x-auto">
            {([
              { id: "list", label: "Flujos", icon: Zap },
              { id: "recipes", label: "Recetas de venta", icon: Sparkles },
              { id: "runs", label: "Historial global", icon: History },
              { id: "insights", label: "Métricas", icon: Activity },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition",
                  tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {tab === "recipes" && (
            <RecipesTab
              onCreated={(id) => {
                qc.invalidateQueries({ queryKey: ["automations-adv"] });
                setOpenId(id);
                setTab("list");
              }}
            />
          )}

          {tab === "runs" && <RunsGlobalTab onOpenAutomation={setOpenId} />}

          {tab === "insights" && <InsightsTab agg={agg} loading={aggQ.isLoading} onOpen={setOpenId} />}

          {tab === "list" && (
            <>
              {/* Toolbar */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o descripción…"
                    className="h-8 w-56 pl-7"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Filter className="h-3.5 w-3.5" />
                      {status === "all" ? "Estado" : statusLabel(status)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Estado</DropdownMenuLabel>
                    {(["all", "active", "paused", "draft", "error"] as const).map((s) => (
                      <DropdownMenuItem key={s} onSelect={() => setStatusF(s)}>
                        {s === "all" ? "Todos" : statusLabel(s)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <PackageSearch className="h-3.5 w-3.5" />
                      {category === "all" ? "Categoría" : `Categoría: ${category}`}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Categoría del disparador</DropdownMenuLabel>
                    {TRIGGER_CATEGORIES.map((c) => (
                      <DropdownMenuItem key={c} onSelect={() => setCategory(c)}>
                        {c === "all" ? "Todas" : c}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      {sortLabel(sort)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                    {(["recent", "name", "runs", "errors", "last_run"] as const).map((s) => (
                      <DropdownMenuItem key={s} onSelect={() => setSort(s)}>{sortLabel(s)}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="ghost" onClick={() => listQ.refetch()} className="gap-1 text-muted-foreground">
                  <RefreshCw className={cn("h-3.5 w-3.5", listQ.isFetching && "animate-spin")} />
                </Button>
                {automations.length > 0 && (
                  <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === automations.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    Seleccionar todo
                  </label>
                )}
              </div>

              {/* Bulk toolbar */}
              {selected.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <span className="font-medium">{selected.size} seleccionadas</span>
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => doBulk("activate")}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Activar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doBulk("pause")}>
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doBulk("duplicate")}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExportAll}>
                      <Download className="mr-1 h-3.5 w-3.5" /> Exportar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingBulk("delete")}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancelar</Button>
                  </div>
                </div>
              )}

              {listQ.isLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Cargando…</div>
              ) : automations.length === 0 ? (
                <EmptyState onCreate={handleCreate} filtered={!!search || status !== "all" || category !== "all"} />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {automations.map((a) => (
                    <AutomationCard
                      key={a.id}
                      automation={a}
                      selected={selected.has(a.id)}
                      onSelect={() => toggleSelect(a.id)}
                      onOpen={() => setOpenId(a.id)}
                      onToggle={async () => {
                        const next = a.status === "active" ? "paused" : "active";
                        await setStatus({ data: { id: a.id, status: next } });
                        qc.invalidateQueries({ queryKey: ["automations-adv"] });
                      }}
                      onDuplicate={async () => {
                        await duplicate({ data: { id: a.id } });
                        qc.invalidateQueries({ queryKey: ["automations-adv"] });
                        toast.success("Flujo duplicado");
                      }}
                      onDelete={() => setPendingDelete(a)}
                    />
                  ))}
                </div>
              )}

              <ArchitectureNote />
            </>
          )}
        </div>
      </div>

      {openId && (
        <AutomationEditor
          key={openId}
          automationId={openId}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Confirm single delete */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar automatización</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar <b>{pendingDelete?.name}</b>. Se conservan sus ejecuciones históricas, pero el flujo
              dejará de dispararse. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const a = pendingDelete!;
                setPendingDelete(null);
                await del({ data: { id: a.id } });
                qc.invalidateQueries({ queryKey: ["automations-adv"] });
                toast.success("Automatización eliminada");
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm bulk delete */}
      <AlertDialog open={pendingBulk === "delete"} onOpenChange={(o) => !o && setPendingBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {selected.size} automatizaciones</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar <b>{selected.size}</b> flujos. Su historial de ejecuciones se conserva, pero dejarán
              de dispararse. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => doBulk("delete")}
            >
              Eliminar {selected.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ============ Card ============
function AutomationCard({
  automation, selected, onSelect, onOpen, onToggle, onDuplicate, onDelete,
}: {
  automation: Automation;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const trigger = TRIGGER_BY_TYPE[automation.trigger?.type ?? ""];
  const errRate = automation.run_count ? (automation.error_count / automation.run_count) * 100 : 0;
  return (
    <div className={cn(
      "group rounded-xl border bg-card p-4 shadow-sm transition-colors",
      selected ? "border-primary/60 ring-1 ring-primary/40" : "hover:border-primary/40",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Checkbox checked={selected} onCheckedChange={onSelect} className="mt-1" />
          <button onClick={onOpen} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <StatusPill status={automation.status} />
              <span className="text-[10px] text-muted-foreground">v{automation.version}</span>
            </div>
            <h3 className="mt-1 font-medium truncate">{automation.name}</h3>
            {automation.description && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{automation.description}</p>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={onToggle} title={automation.status === "active" ? "Pausar" : "Activar"}>
            {automation.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn onClick={onDuplicate} title="Duplicar"><Copy className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={onDelete} title="Eliminar"><Trash2 className="h-3.5 w-3.5 text-rose-400" /></IconBtn>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <span className="rounded-md bg-secondary px-1.5 py-0.5">
          {trigger?.label ?? automation.trigger?.type ?? "—"}
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded-md bg-secondary px-1.5 py-0.5">
          {(automation.conditions?.length ?? 0)} cond.
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded-md bg-secondary px-1.5 py-0.5">
          {(automation.actions?.length ?? 0)} acc.
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-[11px]">
        <Stat label="Ejecuciones" value={String(automation.run_count ?? 0)} />
        <Stat label="Errores" value={`${(automation.error_count ?? 0)} (${errRate.toFixed(0)}%)`}
          accent={errRate > 0 ? "text-rose-400" : undefined} />
        <Stat label="Última" value={automation.last_run_at ? new Date(automation.last_run_at).toLocaleString() : "—"} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Automation["status"] }) {
  return (
    <span className={cn(
      "inline-flex h-6 items-center rounded-md px-2 text-[10px] uppercase tracking-wider",
      status === "active" && "bg-emerald-500/15 text-emerald-300",
      status === "paused" && "bg-amber-500/15 text-amber-300",
      status === "draft" && "bg-muted text-muted-foreground",
      status === "error" && "bg-rose-500/15 text-rose-300",
    )}>{status}</span>
  );
}
function IconBtn({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40">
      {children}
    </button>
  );
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("truncate font-medium", accent)}>{value}</div>
    </div>
  );
}
function Kpi({ icon: Icon, label, value, accent }: { icon: typeof Zap; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn("mt-0.5 font-display text-lg font-semibold", accent)}>{value}</div>
    </div>
  );
}

function statusLabel(s: StatusFilter) {
  return s === "active" ? "Activos"
    : s === "paused" ? "Pausados"
    : s === "draft" ? "Borradores"
    : s === "error" ? "Con errores"
    : "Todos";
}
function sortLabel(s: SortMode) {
  return s === "recent" ? "Recientes"
    : s === "name" ? "Nombre A-Z"
    : s === "runs" ? "Más ejecutadas"
    : s === "errors" ? "Con más errores"
    : "Última ejecución";
}

// ============ Editor Sheet ============
type EditorTab = "builder" | "history" | "versions";
function AutomationEditor({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getAutomation);
  const save = useServerFn(saveAutomation);
  const runsFn = useServerFn(listAutomationRuns);
  const setStatus = useServerFn(setAutomationStatus);
  const versionsFn = useServerFn(listAutomationVersions);
  const restoreFn = useServerFn(restoreAutomationVersion);

  const { data: automation, refetch } = useQuery({
    queryKey: ["automation", automationId],
    queryFn: () => get({ data: { id: automationId } }),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["automation-runs", automationId],
    queryFn: () => runsFn({ data: { automation_id: automationId } }),
  });
  const [tab, setTab] = useState<EditorTab>("builder");
  const { data: versions = [] } = useQuery({
    queryKey: ["automation-versions", automationId],
    queryFn: () => versionsFn({ data: { automation_id: automationId } }),
    enabled: tab === "versions",
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [flow, setFlow] = useState<FlowDefinition>({
    trigger: { type: "manual" }, conditions: [], actions: [],
  });
  const [dirty, setDirty] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<number | null>(null);

  useEffect(() => {
    if (!automation) return;
    setName(automation.name);
    setDescription(automation.description ?? "");
    setFlow({
      trigger: automation.trigger ?? { type: "manual" },
      conditions: (automation.conditions ?? []) as FlowCondition[],
      actions: (automation.actions ?? []) as FlowAction[],
    });
    setDirty(false);
  }, [automation?.id]); // eslint-disable-line

  useRealtimeInvalidate({
    channel: `automation-detail-${automationId}`,
    tables: ["automation_runs", "automation_versions"],
    invalidate: [
      ["automation-runs", automationId],
      ["automation-versions", automationId],
    ],
    filter: `automation_id=eq.${automationId}`,
  });

  async function handleSave() {
    try {
      await save({ data: { id: automationId, name, description, flow } });
      toast.success("Flujo guardado");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["automations-adv"] });
      qc.invalidateQueries({ queryKey: ["automation-versions", automationId] });
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  }
  function handleExport() {
    const payload = { name, description, ...flow };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("JSON copiado al portapapeles");
  }
  async function handleRestore(version: number) {
    try {
      await restoreFn({ data: { automation_id: automationId, version } });
      toast.success(`Restaurada la versión ${version} (guardada como nueva)`);
      setPendingRestore(null);
      qc.invalidateQueries({ queryKey: ["automation", automationId] });
      qc.invalidateQueries({ queryKey: ["automation-versions", automationId] });
      qc.invalidateQueries({ queryKey: ["automations-adv"] });
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-2xl">
          <SheetHeader className="border-b px-5 py-3">
            <div className="flex items-center gap-2">
              <SheetTitle className="flex-1 truncate">
                <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }}
                  className="border-none bg-transparent px-0 text-base font-semibold focus-visible:ring-0" />
              </SheetTitle>
              {automation && <StatusPill status={automation.status} />}
            </div>
            <Textarea rows={1} value={description} placeholder="Descripción breve del flujo…"
              onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
              className="resize-none border-none bg-transparent px-0 text-xs focus-visible:ring-0" />
            <div className="flex items-center gap-2 flex-wrap">
              {(["builder","history","versions"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn("rounded-md px-2 py-1 text-xs",
                    tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted")}>
                  {t === "builder" ? "Constructor"
                    : t === "history" ? `Historial (${runs.length})`
                    : `Versiones (${automation?.version ?? 1})`}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1">
                <IconBtn onClick={() => setTestOpen(true)} title="Probar flujo con un cliente">
                  <Beaker className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={handleExport} title="Exportar JSON"><Download className="h-3.5 w-3.5" /></IconBtn>
                {automation && (
                  <IconBtn
                    onClick={async () => {
                      const next = automation.status === "active" ? "paused" : "active";
                      await setStatus({ data: { id: automationId, status: next } });
                      refetch();
                      qc.invalidateQueries({ queryKey: ["automations-adv"] });
                    }}
                    title={automation.status === "active" ? "Pausar" : "Activar"}
                  >
                    {automation.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </IconBtn>
                )}
                <Button size="sm" onClick={handleSave} disabled={!dirty} className="gap-1">
                  <Save className="h-3.5 w-3.5" /> Guardar
                </Button>
                <IconBtn onClick={onClose} title="Cerrar"><XIcon className="h-3.5 w-3.5" /></IconBtn>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "builder" && <FlowBuilder flow={flow} onChange={(f) => { setFlow(f); setDirty(true); }} />}
            {tab === "history" && <RunHistory runs={runs} />}
            {tab === "versions" && (
              <VersionsList
                versions={versions}
                currentVersion={automation?.version ?? 1}
                onRestore={(v) => setPendingRestore(v)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {testOpen && (
        <TestRunDialog
          automationId={automationId}
          onClose={() => setTestOpen(false)}
        />
      )}

      <AlertDialog open={pendingRestore !== null} onOpenChange={(o) => !o && setPendingRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar versión {pendingRestore}</AlertDialogTitle>
            <AlertDialogDescription>
              La configuración actual se conservará como historial y esta versión pasará a ser la activa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingRestore !== null && handleRestore(pendingRestore)}>
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============ Test run dialog ============
function TestRunDialog({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const pickFn = useServerFn(pickTestCustomers);
  const runFn = useServerFn(runAutomationForCustomer);
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["automation-test-candidates"],
    queryFn: () => pickFn(),
  });
  const [customerId, setCustomerId] = useState<string>("");
  const [messageBody, setMessageBody] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; status: string; note?: string; results?: any[] }>(null);

  async function handleRun() {
    if (!customerId) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await runFn({ data: {
        automation_id: automationId,
        customer_id: customerId,
        message_body: messageBody || undefined,
        triggered_by: "test",
      } });
      setResult(r as any);
      qc.invalidateQueries({ queryKey: ["automation-runs", automationId] });
      qc.invalidateQueries({ queryKey: ["automations-adv"] });
      if ((r as any).ok) toast.success("Ejecución completada");
      else if ((r as any).status === "skipped") toast.info("Ejecución omitida: " + ((r as any).reason ?? "condiciones no cumplidas"));
      else toast.error("Ejecución con errores");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" /> Probar automatización
          </DialogTitle>
          <DialogDescription>
            Selecciona un cliente real. Se ejecutarán las acciones tal como en producción — usa clientes de prueba
            si quieres evitar cambios reales.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Cliente</span>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">{isLoading ? "Cargando…" : "— Selecciona un cliente —"}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.phone ?? "Sin nombre"} · {c.stage ?? "sin etapa"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Mensaje simulado (opcional)</span>
            <Textarea rows={2} value={messageBody} onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Se usa por condiciones tipo &quot;palabra clave en mensaje&quot;" />
          </label>
          {result && (
            <div className={cn(
              "rounded-md border p-3 text-xs",
              result.ok ? "border-emerald-500/40 bg-emerald-500/5"
                : result.status === "skipped" ? "border-muted bg-muted/30"
                : "border-rose-500/40 bg-rose-500/5",
            )}>
              <div className="font-medium capitalize">{result.status}</div>
              {result.note && <div className="mt-1 text-muted-foreground">{result.note}</div>}
              {Array.isArray(result.results) && (
                <ul className="mt-2 space-y-0.5">
                  {result.results.map((a: any, i: number) => (
                    <li key={i}>
                      <span className={cn(
                        "rounded px-1",
                        a.status === "ok" && "bg-emerald-500/10 text-emerald-300",
                        a.status === "skipped" && "bg-muted text-muted-foreground",
                        a.status === "error" && "bg-rose-500/10 text-rose-300",
                      )}>{a.status}</span> {a.type}{a.note ? ` · ${a.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={handleRun} disabled={!customerId || busy} className="gap-1">
            <Play className="h-3.5 w-3.5" /> {busy ? "Ejecutando…" : "Ejecutar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Versions ============
function VersionsList({
  versions, currentVersion, onRestore,
}: { versions: AutomationVersion[]; currentVersion: number; onRestore: (v: number) => void }) {
  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
        <History className="mx-auto mb-2 h-6 w-6" />
        Aún no hay versiones guardadas. Cada vez que edites y guardes el flujo, se registrará una nueva versión.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {versions.map((v) => {
        const s = v.snapshot ?? {};
        const isCurrent = v.version === currentVersion;
        return (
          <div key={v.id} className="rounded-lg border bg-card p-3 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant={isCurrent ? "default" : "outline"}>v{v.version}{isCurrent && " · actual"}</Badge>
              <span className="text-muted-foreground">
                {new Date(v.created_at).toLocaleString()}
              </span>
              {!isCurrent && (
                <Button size="sm" variant="ghost" onClick={() => onRestore(v.version)} className="ml-auto h-7 gap-1">
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </Button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <div>Nombre: <span className="text-foreground">{s.name ?? "—"}</span></div>
              <div>Trigger: <span className="text-foreground">{TRIGGER_BY_TYPE[s.trigger?.type]?.label ?? s.trigger?.type ?? "—"}</span></div>
              <div>Acciones: <span className="text-foreground">{(s.actions ?? []).length}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ Flow builder ============
function FlowBuilder({ flow, onChange }: { flow: FlowDefinition; onChange: (f: FlowDefinition) => void }) {
  return (
    <div className="space-y-6">
      <Section title="Disparador" subtitle="El evento que inicia el flujo" color="border-l-sky-500">
        <TriggerPicker value={flow.trigger} onChange={(t) => onChange({ ...flow, trigger: t })} />
      </Section>

      <Section title="Condiciones" subtitle="Filtros opcionales (todas deben cumplirse)" color="border-l-amber-500">
        {flow.conditions.map((c, i) => (
          <ConditionRow
            key={i}
            condition={c}
            onChange={(next) => {
              const arr = [...flow.conditions]; arr[i] = next;
              onChange({ ...flow, conditions: arr });
            }}
            onRemove={() => onChange({ ...flow, conditions: flow.conditions.filter((_, j) => j !== i) })}
          />
        ))}
        <AddPicker
          label="Agregar condición"
          catalog={CONDITIONS}
          onPick={(type) => onChange({ ...flow, conditions: [...flow.conditions, { type, op: CONDITION_BY_TYPE[type].ops?.[0]?.value, config: {} }] })}
        />
      </Section>

      <Section title="Acciones" subtitle="Se ejecutan en orden si todas las condiciones se cumplen" color="border-l-emerald-500">
        {flow.actions.map((a, i) => (
          <ActionRow
            key={i}
            action={a}
            index={i}
            onChange={(next) => {
              const arr = [...flow.actions]; arr[i] = next;
              onChange({ ...flow, actions: arr });
            }}
            onRemove={() => onChange({ ...flow, actions: flow.actions.filter((_, j) => j !== i) })}
            onMove={(dir) => {
              const arr = [...flow.actions];
              const j = i + dir;
              if (j < 0 || j >= arr.length) return;
              [arr[i], arr[j]] = [arr[j], arr[i]];
              onChange({ ...flow, actions: arr });
            }}
          />
        ))}
        <AddPicker
          label="Agregar acción"
          catalog={ACTIONS}
          onPick={(type) => onChange({ ...flow, actions: [...flow.actions, { type, config: {} }] })}
        />
      </Section>

      <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
        <div className="mb-1 flex items-center gap-2 text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Ejecución conectada al sistema
        </div>
        El motor expone <code>dispatchAutomationEvent</code>: cualquier módulo (Bandeja, CRM, Embudo, Cotizaciones,
        IA) puede disparar los flujos activos para un cliente. Usa <b>Probar</b> arriba para ejecutar el flujo contra
        un cliente real de tu cuenta y validar cada acción antes de activarlo.
      </div>
    </div>
  );
}

function Section({ title, subtitle, color, children }: { title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border-l-4 bg-card/40 pl-4", color)}>
      <div className="mb-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function TriggerPicker({ value, onChange }: { value: { type: string; config?: any }; onChange: (v: any) => void }) {
  const meta = TRIGGER_BY_TYPE[value.type];
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <select
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value, config: {} })}
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        >
          {TRIGGERS.map((t) => (
            <option key={t.type} value={t.type} disabled={t.soon}>
              {t.label} {t.soon ? "· Próximamente" : `· ${t.category}`}
            </option>
          ))}
        </select>
      </div>
      {meta?.description && <p className="text-[11px] text-muted-foreground">{meta.description}</p>}
      {meta?.fields && meta.fields.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {meta.fields.map((f) => (
            <FieldEditor key={f.key} field={f}
              value={value.config?.[f.key]}
              onChange={(v) => onChange({ ...value, config: { ...(value.config ?? {}), [f.key]: v } })} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConditionRow({ condition, onChange, onRemove }: {
  condition: FlowCondition;
  onChange: (c: FlowCondition) => void;
  onRemove: () => void;
}) {
  const meta = CONDITION_BY_TYPE[condition.type];
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium">{meta?.label ?? condition.type}</span>
        {meta?.ops && (
          <select value={condition.op ?? meta.ops[0].value}
            onChange={(e) => onChange({ ...condition, op: e.target.value })}
            className="h-7 rounded-md border bg-background px-2 text-xs">
            {meta.ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <button onClick={onRemove} className="ml-auto text-muted-foreground hover:text-rose-400">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {meta?.fields && meta.fields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {meta.fields.map((f) => (
            <FieldEditor key={f.key} field={f}
              value={condition.config?.[f.key]}
              onChange={(v) => onChange({ ...condition, config: { ...(condition.config ?? {}), [f.key]: v } })} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionRow({ action, index, onChange, onRemove, onMove }: {
  action: FlowAction; index: number;
  onChange: (a: FlowAction) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const meta = ACTION_BY_TYPE[action.type];
  const soon = meta?.soon;
  return (
    <div className={cn("rounded-lg border bg-card p-3", soon && "border-dashed opacity-90")}>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]">{index + 1}</span>
        <span className="text-xs font-medium">{meta?.label ?? action.type}</span>
        {soon && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Próximamente</span>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onMove(-1)} className="text-muted-foreground hover:text-foreground text-xs">↑</button>
          <button onClick={() => onMove(1)} className="text-muted-foreground hover:text-foreground text-xs">↓</button>
          <button onClick={onRemove} className="text-muted-foreground hover:text-rose-400"><XIcon className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {meta?.description && <p className="mb-2 text-[11px] text-muted-foreground">{meta.description}</p>}
      {meta?.fields && meta.fields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {meta.fields.map((f) => (
            <FieldEditor key={f.key} field={f}
              value={action.config?.[f.key]}
              onChange={(v) => onChange({ ...action, config: { ...(action.config ?? {}), [f.key]: v } })} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldEditor({ field, value, onChange }: { field: FieldSpec; value: any; onChange: (v: any) => void }) {
  const label = (
    <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
      {field.label}{field.optional && " (opcional)"}
    </span>
  );
  const common = "h-8 w-full rounded-md border bg-background px-2 text-xs";
  if (field.type === "textarea") {
    return (
      <label className="col-span-2 block">
        {label}
        <Textarea rows={2} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder} className="min-h-[60px] text-xs" />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        {label}
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={common}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="block">
      {label}
      <input type={field.type === "number" ? "number" : "text"}
        value={value ?? ""} onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        placeholder={field.placeholder} className={common} />
      {field.help && <span className="mt-0.5 block text-[10px] text-muted-foreground">{field.help}</span>}
    </label>
  );
}

function AddPicker<T extends { type: string; label: string; category: string; soon?: boolean }>({
  catalog, onPick, label,
}: { catalog: T[]; onPick: (type: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const g: Record<string, T[]> = {};
    const s = q.trim().toLowerCase();
    for (const c of catalog) {
      if (s && !c.label.toLowerCase().includes(s) && !c.type.toLowerCase().includes(s)) continue;
      (g[c.category] ??= []).push(c);
    }
    return g;
  }, [catalog, q]);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border bg-card p-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="mb-2 h-7 text-xs" />
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(groups).map(([cat, items]) => (
              <div key={cat} className="mb-2">
                <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</div>
                <div className="space-y-0.5">
                  {items.map((i) => (
                    <button key={i.type}
                      onClick={() => { onPick(i.type); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-secondary">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className="flex-1">{i.label}</span>
                      {i.soon && <span className="text-[9px] uppercase text-primary">Pronto</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Detail Run History ============
function RunHistory({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
        <History className="mx-auto mb-2 h-6 w-6" />
        Sin ejecuciones registradas. Usa <b>Probar</b> para ejecutar el flujo manualmente.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {runs.map((r) => (
        <RunRow key={r.id} r={r} showAutomation={false} />
      ))}
    </div>
  );
}

function RunRow({ r, showAutomation }: { r: AutomationRun | GlobalRun; showAutomation: boolean }) {
  const gr = r as GlobalRun;
  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        {r.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
        {r.status === "skipped" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
        {r.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
        <span className="font-medium capitalize">{r.status}</span>
        <span className="text-muted-foreground">· {r.triggered_by}</span>
        {showAutomation && gr.automation_name && (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]">{gr.automation_name}</span>
        )}
        <span className="ml-auto text-muted-foreground">
          {new Date(r.started_at).toLocaleString()} · {r.duration_ms ?? 0}ms
        </span>
      </div>
      {r.skip_reason && <div className="mt-1 text-muted-foreground">{r.skip_reason}</div>}
      {r.error && <div className="mt-1 text-rose-400">{r.error}</div>}
      {Array.isArray(r.actions_result) && r.actions_result.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {(r.actions_result as any[]).map((a, i) => (
            <div key={i} className="flex items-center gap-1 text-[11px]">
              <span className={cn(
                "rounded px-1",
                a.status === "ok" && "bg-emerald-500/10 text-emerald-300",
                a.status === "skipped" && "bg-muted text-muted-foreground",
                a.status === "error" && "bg-rose-500/10 text-rose-300",
              )}>{a.status}</span>
              <span className="text-muted-foreground">{a.type}</span>
              {a.note && <span className="text-muted-foreground">· {a.note}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {r.customer_id && (
          <Link to="/clientes/$id" params={{ id: r.customer_id }} className="inline-flex items-center gap-0.5 text-primary hover:underline">
            {gr.customer_name ?? gr.customer_phone ?? "Ver cliente"} <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {r.conversation_id && (
          <Link to="/conversaciones" search={{ id: r.conversation_id } as any} className="inline-flex items-center gap-0.5 text-primary hover:underline">
            <MessagesSquare className="h-3 w-3" /> Conversación
          </Link>
        )}
      </div>
    </div>
  );
}

// ============ Global runs tab ============
function RunsGlobalTab({ onOpenAutomation }: { onOpenAutomation: (id: string) => void }) {
  const runsFn = useServerFn(listAllRuns);
  const [statusF, setStatusF] = useState<"all" | "success" | "skipped" | "error">("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["automations-runs-global", { statusF, search }],
    queryFn: () => runsFn({ data: { status: statusF, search: search.trim() || null, limit: 200 } }),
  });
  const rows = data?.rows ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por automatización, cliente o error…"
            className="h-8 w-72 pl-7" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="h-3.5 w-3.5" /> {statusF === "all" ? "Estado" : statusF}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(["all", "success", "skipped", "error"] as const).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setStatusF(s)}>{s}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} ejecuciones</span>
      </div>
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/10 p-8 text-center text-sm text-muted-foreground">
          <History className="mx-auto mb-2 h-6 w-6" />
          Sin ejecuciones que coincidan con los filtros.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="group">
              <RunRow r={r} showAutomation />
              <button
                onClick={() => onOpenAutomation(r.automation_id)}
                className="mt-1 ml-2 text-[11px] text-muted-foreground hover:text-primary hover:underline"
              >
                Abrir automatización →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Insights / analytics ============
function InsightsTab({
  agg, loading, onOpen,
}: { agg?: Awaited<ReturnType<typeof getAutomationsAggregate>>; loading: boolean; onOpen: (id: string) => void }) {
  if (loading || !agg) return <div className="py-16 text-center text-sm text-muted-foreground">Calculando métricas…</div>;
  const max = Math.max(1, ...agg.recentActivity.map((d) => d.total));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl border bg-card p-4 lg:col-span-2">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Actividad últimos 7 días</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {agg.runsLast7d} ejecuciones · {agg.errorsLast7d} errores · promedio {agg.avgDurationMs}ms
          </span>
        </div>
        <div className="flex items-end gap-2 h-40">
          {agg.recentActivity.map((d) => {
            const h = (d.total / max) * 100;
            const eh = d.total ? (d.errors / d.total) * 100 : 0;
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end">
                  <div className="w-full rounded-t bg-primary/70 relative" style={{ height: `${h}%` }}>
                    {d.errors > 0 && (
                      <div className="absolute inset-x-0 bottom-0 rounded-t bg-rose-500"
                        style={{ height: `${eh}%` }} />
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(d.day).toLocaleDateString(undefined, { weekday: "short" })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">Más ejecutadas</h3>
        </div>
        {agg.topByRuns.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin ejecuciones aún.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {agg.topByRuns.map((a) => (
              <li key={a.id}>
                <button onClick={() => onOpen(a.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-secondary">
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-muted-foreground">{a.run_count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 lg:col-span-3">
        <div className="mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-500" />
          <h3 className="text-sm font-semibold">Automatizaciones con más errores</h3>
        </div>
        {agg.topByErrors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin errores registrados en las automatizaciones. 🎉</p>
        ) : (
          <ul className="divide-y">
            {agg.topByErrors.map((a) => (
              <li key={a.id}>
                <button onClick={() => onOpen(a.id)} className="flex w-full items-center gap-2 py-2 text-sm hover:bg-secondary/40">
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.error_count} errores</span>
                  <span className="w-14 text-right text-xs text-rose-400">{a.error_rate.toFixed(0)}%</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============ Empty state ============
function EmptyState({ onCreate, filtered }: { onCreate: () => void; filtered?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/10 p-10 text-center">
      <Zap className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h2 className="font-display text-lg font-semibold">
        {filtered ? "Sin resultados" : "Aún no tienes automatizaciones"}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Ajusta los filtros de búsqueda o crea un nuevo flujo desde cero."
          : "Crea flujos que reaccionen a los eventos del CRM, la Bandeja y el Embudo. Sin código, sin duplicar datos."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={onCreate} size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> Nuevo flujo</Button>
      </div>
    </div>
  );
}

function ArchitectureNote() {
  return (
    <div className="mt-6 rounded-xl border border-dashed bg-muted/10 p-4 text-xs text-muted-foreground">
      <div className="mb-1 flex items-center gap-2 text-foreground">
        <Settings2 className="h-4 w-4 text-primary" /> Arquitectura del motor
      </div>
      <p>
        Los disparadores, condiciones y acciones viven en un <b>registro central</b> (<code>src/lib/automations/registry.ts</code>).
        Cualquier módulo (Bandeja, CRM, Embudo, Cotizaciones, Catálogo, IA) puede llamar <code>dispatchAutomationEvent</code>{" "}
        para lanzar los flujos activos que correspondan; los flujos referencian clientes y conversaciones <b>por id</b>,
        manteniendo el CRM como única fuente de verdad.
      </p>
    </div>
  );
}

// ============ Recipes Tab (con sugerencias IA) ============
type Recipe = {
  id: string;
  name: string;
  description: string;
  icon: any;
  flow: FlowDefinition;
};

const SALES_RECIPES: Recipe[] = [
  {
    id: "followup-no-response",
    name: "Seguimiento sin respuesta",
    description: "Deja un follow-up sugerido en bandeja cuando un cliente lleva 60 minutos sin responder. El envío siempre es humano.",
    icon: Clock,
    flow: {
      trigger: { type: "no_response_for", config: { minutes: 60 } },
      conditions: [],
      actions: [
        { type: "create_note", config: {
          body: "📌 Follow-up sugerido — Hola {{customer.name}} 👋 ¿Podemos ayudarte a avanzar con tu compra?",
        } },
      ],
    },
  },
  {
    id: "hot-lead",
    name: "Lead caliente (IA)",
    description: "Cuando la IA detecta alta intención de compra: prioridad alta y nota interna.",
    icon: Sparkles,
    flow: {
      trigger: { type: "ai_high_intent" },
      conditions: [],
      actions: [
        { type: "set_priority", config: { priority: "high" } },
        { type: "add_tag", config: { tag: "hot-lead" } },
        { type: "create_note", config: {
          body: "🔥 Lead caliente detectado por IA. Contactar cuanto antes.",
        } },
      ],
    },
  },
  {
    id: "cold-reengage",
    name: "Reenganche frío",
    description: "Deja un mensaje sugerido en bandeja para reactivar clientes sin interacción hace más de 14 días.",
    icon: Activity,
    flow: {
      trigger: { type: "manual" },
      conditions: [
        { type: "last_interaction_days", op: "gt", config: { value: 14 } },
      ],
      actions: [
        { type: "create_note", config: {
          body: "📌 Reenganche sugerido — Hola {{customer.name}}, hace tiempo no hablamos. ¿Sigue en pie tu interés?",
        } },
        { type: "add_tag", config: { tag: "reenganche" } },
      ],
    },
  },
  {
    id: "post-sale",
    name: "Post-venta (agradecimiento)",
    description: "Envía un mensaje de agradecimiento al aceptar una cotización.",
    icon: CheckCircle2,
    flow: {
      trigger: { type: "quote_accepted" },
      conditions: [],
      actions: [
        { type: "send_whatsapp_message", config: {
          body: "¡Gracias por confiar en nosotros, {{customer.name}}! Coordinamos los siguientes pasos.",
        } },
        { type: "add_tag", config: { tag: "cliente-activo" } },
      ],
    },
  },
  {
    id: "quote-unopened",
    name: "Cotización sin abrir",
    description: "Si el cliente no abre la cotización, deja un follow-up sugerido en bandeja listo para enviar en 1 click.",
    icon: FileText,
    flow: {
      trigger: { type: "quote_sent" },
      conditions: [
        { type: "wait_days", op: "gt", config: { value: 2 } },
      ],
      actions: [
        { type: "create_note", config: {
          body: "📌 Follow-up sugerido — Hola {{customer.name}}, ¿pudiste revisar la cotización que te enviamos?",
        } },
      ],
    },
  },
  {
    id: "cross-sell-ai",
    name: "Cross-sell con IA",
    description: "Cuando la IA recomienda un producto, deja nota y sugiere al agente ofrecerlo.",
    icon: Sparkles,
    flow: {
      trigger: { type: "ai_recommendation_created", config: { min_score: 0.5 } },
      conditions: [],
      actions: [
        { type: "create_note", config: {
          body: "💡 IA recomienda un producto. Considera ofrecerlo en la próxima interacción.",
        } },
      ],
    },
  },
];

function RecipesTab({ onCreated }: { onCreated: (id: string) => void }) {
  const imp = useServerFn(importAutomation);
  const suggestFn = useServerFn(getRecipeSuggestions);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: suggestion } = useQuery({
    queryKey: ["automation-recipe-suggestions"],
    queryFn: () => suggestFn(),
  });

  async function useRecipe(r: Recipe) {
    setBusy(r.id);
    try {
      const a = await imp({
        data: { name: r.name, description: r.description, flow: r.flow },
      });
      toast.success(`"${r.name}" creada como borrador. Ajusta y activa cuando quieras.`);
      onCreated(a.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const suggestionsById = useMemo(() => {
    const m = new Map<string, { reason: string; score: number }>();
    (suggestion?.suggestions ?? []).forEach((s) => m.set(s.recipe_id, { reason: s.reason, score: s.score }));
    return m;
  }, [suggestion]);

  return (
    <div>
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <div className="font-medium">Recetas listas para vender más por WhatsApp</div>
          <p className="text-xs text-muted-foreground">
            Plantillas pre-configuradas que usan el mismo motor de automatización. Elige una, ajústala y actívala.
            Las recomendadas por la IA aparecen destacadas según los datos actuales de tu empresa.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SALES_RECIPES.map((r) => {
          const Icon = r.icon;
          const isBusy = busy === r.id;
          const sug = suggestionsById.get(r.id);
          return (
            <div key={r.id} className={cn(
              "group flex flex-col rounded-xl border bg-card p-4 shadow-sm transition",
              sug ? "border-primary/50 ring-1 ring-primary/20 hover:border-primary/70" : "hover:border-primary/40",
            )}>
              <div className="mb-2 flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                {sug && (
                  <Badge className="bg-primary/15 text-primary hover:bg-primary/20">Recomendada IA</Badge>
                )}
              </div>
              <h3 className="font-medium">{r.name}</h3>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">{r.description}</p>
              {sug && (
                <p className="mt-2 rounded-md bg-primary/5 px-2 py-1.5 text-[11px] text-primary">
                  {sug.reason}
                </p>
              )}
              <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
                <span className="rounded bg-secondary px-1.5 py-0.5">
                  {TRIGGER_BY_TYPE[r.flow.trigger.type]?.label ?? r.flow.trigger.type}
                </span>
                <ChevronRight className="h-3 w-3" />
                <span className="rounded bg-secondary px-1.5 py-0.5">{r.flow.actions.length} acc.</span>
              </div>
              <Button
                size="sm"
                className="mt-3 w-full gap-1"
                disabled={isBusy}
                onClick={() => useRecipe(r)}
              >
                <Plus className="h-3.5 w-3.5" />
                {isBusy ? "Creando…" : "Usar receta"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
