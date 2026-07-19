import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Users,
  Package,
  MessageSquareOff,
  ShieldAlert,
  Megaphone,
  UserCog,
  Flame,
  FileWarning,
  Info,
  ArrowRight,
  RefreshCw,
  Check,
  Clock,
  X,
  CheckSquare,
  Filter,
  Wand2,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  listDirectorInsights,
  getDirectorSummary,
  updateInsightStatus,
  bulkUpdateInsightStatus,
  computeDirectorInsights,
  generateDirectorBriefing,
  type DirectorInsight,
  type InsightCategory,
  type Status,
} from "@/lib/director-ia.functions";

export const Route = createFileRoute("/director-ia")({
  head: () => ({
    meta: [
      { title: "Director Comercial IA — Dialen" },
      {
        name: "description",
        content:
          "El cerebro estratégico de Dialen: analiza tu operación y sugiere qué hacer hoy con explicación y beneficio.",
      },
    ],
  }),
  component: DirectorIA,
});

// -------------------- Catálogo de categorías --------------------
const CATEGORIES: {
  id: InsightCategory;
  icon: typeof Users;
  title: string;
  description: string;
  tone: "primary" | "success" | "warn" | "danger" | "accent";
}[] = [
  {
    id: "contactar",
    icon: Users,
    title: "Qué clientes contactar",
    description: "Chats entrantes que aún esperan respuesta.",
    tone: "primary",
  },
  {
    id: "hot",
    icon: Flame,
    title: "Alta probabilidad de compra",
    description: "Leads con señales fuertes detectadas por IA.",
    tone: "danger",
  },
  {
    id: "riesgo",
    icon: FileWarning,
    title: "Cotizaciones en riesgo",
    description: "Enviadas sin respuesta o cerca de vencer.",
    tone: "warn",
  },
  {
    id: "detenidas",
    icon: MessageSquareOff,
    title: "Conversaciones detenidas",
    description: "Se enfriaron y necesitan reactivarse.",
    tone: "warn",
  },
  {
    id: "productos",
    icon: Package,
    title: "Productos a potenciar",
    description: "Los más tracción vs. su estado en catálogo.",
    tone: "accent",
  },
  {
    id: "objeciones",
    icon: ShieldAlert,
    title: "Objeciones frecuentes",
    description: "Patrones detectados en la última semana.",
    tone: "danger",
  },
  {
    id: "campanas",
    icon: Megaphone,
    title: "Campañas recomendadas",
    description: "Segmentos con potencial listo para activar.",
    tone: "success",
  },
  {
    id: "vendedores",
    icon: UserCog,
    title: "Vendedores que necesitan apoyo",
    description: "Sobrecarga o rezago en el equipo.",
    tone: "warn",
  },
];

const CAT_META: Record<InsightCategory, { icon: typeof Users; title: string; tone: string }> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, { icon: c.icon, title: c.title, tone: c.tone }]),
) as any;

// -------------------- Component principal --------------------

function DirectorIA() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const summaryFn = useServerFn(getDirectorSummary);
  const listFn = useServerFn(listDirectorInsights);
  const computeFn = useServerFn(computeDirectorInsights);
  const briefFn = useServerFn(generateDirectorBriefing);
  const updFn = useServerFn(updateInsightStatus);
  const bulkFn = useServerFn(bulkUpdateInsightStatus);

  const [statusFilter, setStatusFilter] = useState<Status | "all">("pending");
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [openCategory, setOpenCategory] = useState<InsightCategory | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDismiss, setConfirmDismiss] = useState<null | { id?: string; bulk?: boolean }>(null);

  const summaryQ = useQuery({
    queryKey: ["director-summary"],
    queryFn: () => summaryFn(),
  });
  const listQ = useQuery({
    queryKey: ["director-list", { statusFilter, categoryFilter, search }],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter,
          category: categoryFilter,
          search: search.trim() || null,
          limit: 300,
        },
      }),
  });
  const briefingQ = useQuery({
    queryKey: ["director-briefing"],
    queryFn: () => briefFn(),
    staleTime: 5 * 60_000,
  });

  useRealtimeInvalidate({
    channel: "director-ia",
    tables: ["director_insights", "quotes", "customers", "messages", "conversations"],
    invalidate: [["director-summary"], ["director-list"]],
  });

  const compute = useMutation({
    mutationFn: async () => computeFn(),
    onSuccess: (r: any) => {
      toast.success(
        `IA actualizada: ${r.created} nuevas · ${r.updated} refrescadas · ${r.closed} resueltas`,
      );
      qc.invalidateQueries({ queryKey: ["director-summary"] });
      qc.invalidateQueries({ queryKey: ["director-list"] });
      qc.invalidateQueries({ queryKey: ["director-briefing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No pude ejecutar el análisis"),
  });

  const rows = listQ.data?.rows ?? [];
  const summary = summaryQ.data;
  const filteredRows = rows;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }
  function selectAllVisible() {
    setSelected(new Set(filteredRows.map((r) => r.id)));
  }
  async function doUpdate(id: string, status: Status, snoozeHours?: number) {
    try {
      await updFn({ data: { id, status, snoozeHours } });
      toast.success(
        status === "done"
          ? "Marcada como hecha"
          : status === "snoozed"
            ? `Aplazada ${snoozeHours ?? 24}h`
            : status === "dismissed"
              ? "Descartada"
              : "Reactivada",
      );
      qc.invalidateQueries({ queryKey: ["director-summary"] });
      qc.invalidateQueries({ queryKey: ["director-list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }
  async function doBulk(status: Status, snoozeHours?: number) {
    if (selected.size === 0) return;
    try {
      const r = await bulkFn({ data: { ids: [...selected], status, snoozeHours } });
      toast.success(`${r.count} recomendaciones actualizadas`);
      setSelected(new Set());
      setConfirmDismiss(null);
      qc.invalidateQueries({ queryKey: ["director-summary"] });
      qc.invalidateQueries({ queryKey: ["director-list"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  function goToAction(r: DirectorInsight) {
    if (!r.action_to) return;
    navigate({ to: r.action_to as any, search: (r.action_search ?? {}) as any });
  }

  const anyData = (summary?.totals.pending ?? 0) + rows.length > 0;

  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* ---------- Header ---------- */}
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Director Comercial <span className="text-gradient-primary">IA</span>
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  El cerebro estratégico de Dialen. Analiza toda tu operación y sugiere qué hacer hoy, con
                  explicación y beneficio esperado en cada recomendación.
                </p>
                {summary?.lastComputedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Última actualización · {new Date(summary.lastComputedAt).toLocaleString("es-ES")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => briefingQ.refetch()}
                disabled={briefingQ.isFetching}
              >
                <Wand2 className={cn("mr-1.5 h-3.5 w-3.5", briefingQ.isFetching && "animate-pulse")} />
                Rearmar resumen
              </Button>
              <Button
                size="sm"
                onClick={() => compute.mutate()}
                disabled={compute.isPending}
              >
                {compute.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Volver a analizar
              </Button>
            </div>
          </header>

          {/* ---------- Estado WhatsApp ---------- */}
          {summary && !summary.hasWhatsapp && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <div className="font-medium">WhatsApp aún no está conectado.</div>
                <div className="text-muted-foreground">
                  Las recomendaciones se enriquecerán en cuanto lleguen conversaciones reales.
                </div>
              </div>
              <Link to="/whatsapp">
                <Button size="sm" variant="outline">Conectar</Button>
              </Link>
            </div>
          )}

          {/* ---------- Banner ---------- */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="flex-1 text-xs text-muted-foreground">
              Este panel <span className="font-medium text-foreground">no es un chat</span>. La IA revisa
              constantemente conversaciones, clientes, cotizaciones y catálogo para producir un plan del día
              basado en datos reales de tu empresa.
            </div>
          </div>

          {/* ---------- Resumen ejecutivo IA ---------- */}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <ExecStat
              label="Recomendaciones activas"
              value={summary ? String(summary.totals.pending) : "—"}
              tone="primary"
            />
            {(() => {
              const entries = Object.entries(summary?.potentialByCurrency ?? {})
                .filter(([, v]) => v > 0)
                .sort((a, b) => b[1] - a[1]);
              if (!summary || entries.length === 0) {
                return (
                  <ExecStat
                    label="Ingresos potenciales"
                    value="—"
                    tone="success"
                    hint={summary ? "Sin valor estimado en pendientes" : undefined}
                  />
                );
              }
              const [cur, val] = entries[0];
              const rest = entries.length - 1;
              const full = entries.map(([c, v]) => `${Number(v).toLocaleString("es-ES")} ${c}`).join(" · ");
              return (
                <ExecStat
                  label="Ingresos potenciales"
                  value={`${Number(val).toLocaleString("es-ES")} ${cur}`}
                  tone="success"
                  hint={rest > 0 ? `+${rest} moneda${rest === 1 ? "" : "s"} más` : undefined}
                  title={full}
                />
              );
            })()}
            <ExecStat
              label="Riesgos detectados"
              value={summary ? String(summary.totals.risks) : "—"}
              tone="danger"
            />
          </div>

          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Briefing del día
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {briefingQ.isLoading || briefingQ.isFetching
                ? "Generando resumen…"
                : briefingQ.data?.text || "Sin datos suficientes para un resumen aún."}
            </p>
          </div>

          {/* ---------- Grid de categorías ---------- */}
          <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {CATEGORIES.map((c) => {
              const count = summary?.byCategory[c.id] ?? 0;
              return (
                <CategoryCard
                  key={c.id}
                  category={c}
                  count={count}
                  onOpen={() => setOpenCategory(c.id)}
                />
              );
            })}
          </div>

          {/* ---------- Toolbar recomendaciones ---------- */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Recomendaciones</h2>
            <Badge variant="outline" className="ml-1">
              {rows.length}
            </Badge>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Input
                placeholder="Buscar por título o motivo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-56"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-1.5 h-3.5 w-3.5" />
                    {statusFilter === "pending"
                      ? "Pendientes"
                      : statusFilter === "done"
                        ? "Hechas"
                        : statusFilter === "snoozed"
                          ? "Aplazadas"
                          : statusFilter === "dismissed"
                            ? "Descartadas"
                            : "Todas"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Estado</DropdownMenuLabel>
                  {(["pending", "snoozed", "done", "dismissed", "all"] as const).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => setStatusFilter(s)}>
                      {s === "pending"
                        ? "Pendientes"
                        : s === "done"
                          ? "Hechas"
                          : s === "snoozed"
                            ? "Aplazadas"
                            : s === "dismissed"
                              ? "Descartadas"
                              : "Todas"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Categoría:{" "}
                    {categoryFilter === "all" ? "todas" : CAT_META[categoryFilter].title}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setCategoryFilter("all")}>Todas</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {CATEGORIES.map((c) => (
                    <DropdownMenuItem key={c.id} onSelect={() => setCategoryFilter(c.id)}>
                      {c.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ---------- Bulk toolbar ---------- */}
          {selected.size > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{selected.size} seleccionadas</span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" onClick={() => doBulk("done")}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Marcar hechas
                </Button>
                <Button size="sm" variant="outline" onClick={() => doBulk("snoozed", 24)}>
                  <Clock className="mr-1 h-3.5 w-3.5" /> Aplazar 24h
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDismiss({ bulk: true })}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Descartar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* ---------- Lista ---------- */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs uppercase text-muted-foreground">
              <Checkbox
                checked={filteredRows.length > 0 && selected.size === filteredRows.length}
                onCheckedChange={(v) => (v ? selectAllVisible() : setSelected(new Set()))}
              />
              <span className="flex-1">Recomendación</span>
              <span className="hidden w-24 text-right sm:block">Valor</span>
              <span className="hidden w-20 text-right sm:block">Estado</span>
              <span className="w-8" />
            </div>

            {listQ.isLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando recomendaciones…</div>
            )}
            {!listQ.isLoading && filteredRows.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {anyData
                  ? "No hay recomendaciones con estos filtros."
                  : "Ejecuta “Volver a analizar” para generar tu primer plan del día."}
              </div>
            )}

            <ul className="divide-y">
              {filteredRows.map((r) => (
                <InsightRow
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  onToggle={() => toggleOne(r.id)}
                  onOpen={() => goToAction(r)}
                  onDone={() => doUpdate(r.id, "done")}
                  onSnooze={(h) => doUpdate(r.id, "snoozed", h)}
                  onDismiss={() => setConfirmDismiss({ id: r.id })}
                  onReopen={() => doUpdate(r.id, "pending")}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ---------- Category detail sheet ---------- */}
      {openCategory && (
        <CategorySheet
          category={openCategory}
          onClose={() => setOpenCategory(null)}
          onFilter={() => {
            setCategoryFilter(openCategory);
            setOpenCategory(null);
          }}
        />
      )}

      {/* ---------- Confirm dismiss ---------- */}
      <AlertDialog open={!!confirmDismiss} onOpenChange={(o) => !o && setConfirmDismiss(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar recomendación</AlertDialogTitle>
            <AlertDialogDescription>
              La recomendación desaparecerá del panel. Si la situación persiste, la IA la volverá a proponer en el
              próximo análisis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDismiss?.bulk) doBulk("dismissed");
                else if (confirmDismiss?.id) doUpdate(confirmDismiss.id, "dismissed");
                setConfirmDismiss(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// -------------------- Category detail sheet --------------------
function CategorySheet({
  category,
  onClose,
  onFilter,
}: {
  category: InsightCategory;
  onClose: () => void;
  onFilter: () => void;
}) {
  const meta = CATEGORIES.find((c) => c.id === category)!;
  const listFn = useServerFn(listDirectorInsights);
  const { data, isLoading } = useQuery({
    queryKey: ["director-sheet", category],
    queryFn: () => listFn({ data: { category, status: "pending", limit: 30 } }),
  });
  const rows = data?.rows ?? [];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneClass(meta.tone))}>
              <meta.icon className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle>{meta.title}</SheetTitle>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Cargando…" : `${rows.length} recomendaciones activas`}
          </span>
          <Button size="sm" variant="outline" onClick={onFilter}>
            <Filter className="mr-1.5 h-3.5 w-3.5" /> Filtrar lista
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {rows.length === 0 && !isLoading && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nada por hacer aquí. La IA lo mantiene bajo control 🎯
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{r.title}</div>
                  {r.reason && <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p>}
                </div>
                <SeverityBadge severity={r.severity} />
              </div>
              {r.benefit && (
                <div className="mt-2 rounded bg-secondary/40 px-2 py-1.5 text-xs">
                  <span className="text-muted-foreground">Beneficio · </span>
                  {r.benefit}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-xs">
                {r.potential_value > 0 ? (
                  <span className="font-mono text-foreground/90">
                    {Number(r.potential_value).toLocaleString("es-ES")} {r.currency}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {r.action_to && (
                  <Link
                    to={r.action_to as any}
                    search={r.action_search as any}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    onClick={onClose}
                  >
                    Ir <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// -------------------- Category card --------------------
function CategoryCard({
  category,
  count,
  onOpen,
}: {
  category: (typeof CATEGORIES)[number];
  count: number;
  onOpen: () => void;
}) {
  const Icon = category.icon;
  return (
    <button
      onClick={onOpen}
      className="group flex h-full flex-col items-start overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex w-full items-start gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneClass(category.tone))}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{category.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{category.description}</p>
        </div>
      </div>
      <div className="mt-auto flex w-full items-center justify-between border-t bg-secondary/30 px-4 py-2 text-xs">
        <span className={cn("font-mono text-sm", count > 0 ? "text-foreground" : "text-muted-foreground")}>
          {count} activa{count === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Ver detalles <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

// -------------------- Row --------------------
function InsightRow({
  row,
  selected,
  onToggle,
  onOpen,
  onDone,
  onSnooze,
  onDismiss,
  onReopen,
}: {
  row: DirectorInsight;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDone: () => void;
  onSnooze: (hours: number) => void;
  onDismiss: () => void;
  onReopen: () => void;
}) {
  const meta = CAT_META[row.category];
  const Icon = meta.icon;
  const isActive = row.status === "pending" || row.status === "snoozed";
  return (
    <li className={cn("flex items-start gap-3 px-3 py-3 hover:bg-muted/40", selected && "bg-primary/5")}>
      <div className="mt-0.5">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>
      <div
        className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneClass(meta.tone))}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{row.title}</span>
          <SeverityBadge severity={row.severity} />
          <StatusBadge status={row.status} />
        </div>
        {row.reason && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.reason}</p>
        )}
        {row.benefit && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
            <Sparkles className="mr-1 inline h-3 w-3 text-primary/70" />
            {row.benefit}
          </p>
        )}
      </div>
      <div className="hidden w-24 text-right sm:block">
        {row.potential_value > 0 ? (
          <span className="font-mono text-sm">
            {Number(row.potential_value).toLocaleString("es-ES")}{" "}
            <span className="text-xs text-muted-foreground">{row.currency}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="hidden w-20 text-right sm:block">
        <span className="text-xs text-muted-foreground capitalize">
          {row.status === "pending" ? "activa" : row.status}
        </span>
      </div>
      <div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <CheckSquare className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {row.action_to && (
              <>
                <DropdownMenuItem onSelect={onOpen}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Ir a la acción
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {isActive ? (
              <>
                <DropdownMenuItem onSelect={onDone}>
                  <Check className="mr-2 h-3.5 w-3.5" /> Marcar hecha
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSnooze(3)}>
                  <Clock className="mr-2 h-3.5 w-3.5" /> Aplazar 3 h
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSnooze(24)}>
                  <Clock className="mr-2 h-3.5 w-3.5" /> Aplazar 24 h
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSnooze(24 * 3)}>
                  <Clock className="mr-2 h-3.5 w-3.5" /> Aplazar 3 días
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={onDismiss}
                >
                  <X className="mr-2 h-3.5 w-3.5" /> Descartar
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={onReopen}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reactivar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

// -------------------- Badges / helpers --------------------
function SeverityBadge({ severity }: { severity: DirectorInsight["severity"] }) {
  const map: Record<string, string> = {
    info: "bg-muted text-muted-foreground",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    critical: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  };
  const label: Record<string, string> = {
    info: "info",
    warn: "media",
    high: "alta",
    critical: "urgente",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide", map[severity])}>
      {label[severity] ?? severity}
    </span>
  );
}
function StatusBadge({ status }: { status: DirectorInsight["status"] }) {
  if (status === "pending") return null;
  const map: Record<string, string> = {
    done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    snoozed: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    dismissed: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    done: "hecha",
    snoozed: "aplazada",
    dismissed: "descartada",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide", map[status])}>
      {label[status]}
    </span>
  );
}

function ExecStat({
  label,
  value,
  tone,
  hint,
  title,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "danger";
  hint?: string;
  title?: string;
}) {
  const toneMap = {
    primary: "text-primary",
    success: "text-emerald-500",
    danger: "text-rose-500",
  } as const;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div
        className={cn("mt-1 truncate font-display text-2xl font-semibold tabular-nums", toneMap[tone])}
        title={title ?? value}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function toneClass(tone: string) {
  switch (tone) {
    case "primary":
      return "bg-primary/10 text-primary";
    case "success":
      return "bg-emerald-500/10 text-emerald-500";
    case "warn":
      return "bg-amber-500/10 text-amber-500";
    case "danger":
      return "bg-rose-500/10 text-rose-500";
    case "accent":
      return "bg-sky-500/10 text-sky-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}
