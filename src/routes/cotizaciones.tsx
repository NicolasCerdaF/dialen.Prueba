import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  Plus,
  Search,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Trash2,
  Filter,
  Download,
  Copy,
  MoreHorizontal,
  LayoutGrid,
  Rows,
  AlertTriangle,
  Flame,
  ArrowUpDown,
  RefreshCw,
  UserRound,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  listQuotesAdvanced,
  getQuotesAdvancedKpis,
  getQuoteAlerts,
  setQuoteStatus,
  deleteQuote,
  bulkQuoteAction,
  duplicateQuote,
  expireOverdueQuotes,
  createDraftForCustomer,
  sendQuoteById,
  type Quote,
  type QuoteStatus,
} from "@/lib/quotes.functions";
import { listCustomers } from "@/lib/crm.functions";

export const Route = createFileRoute("/cotizaciones")({
  head: () => ({
    meta: [
      { title: "Cotizaciones — Dialen" },
      { name: "description", content: "Convierte oportunidades en propuestas comerciales trazables con IA." },
    ],
  }),
  component: QuotesPage,
});

function money(n: number, cur = "USD") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n || 0);
}
function moneyFull(n: number, cur = "USD") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n || 0);
}

const STATUS_META: Record<QuoteStatus, { label: string; color: string; icon: any }> = {
  draft: { label: "Borrador", color: "bg-muted text-muted-foreground", icon: FileText },
  sent: { label: "Enviada", color: "bg-blue-500/15 text-blue-500", icon: Send },
  viewed: { label: "Vista", color: "bg-purple-500/15 text-purple-400", icon: Eye },
  accepted: { label: "Aceptada", color: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 },
  rejected: { label: "Rechazada", color: "bg-red-500/15 text-red-500", icon: XCircle },
  expired: { label: "Expirada", color: "bg-orange-500/15 text-orange-400", icon: Clock },
};
const STATUS_ORDER: QuoteStatus[] = ["draft", "sent", "viewed", "accepted", "rejected", "expired"];

type SortBy = "created_at" | "updated_at" | "total" | "valid_until" | "status" | "number";
type ViewMode = "table" | "kanban";

function QuotesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listQuotesAdvanced);
  const kpisAdv = useServerFn(getQuotesAdvancedKpis);
  const alerts = useServerFn(getQuoteAlerts);
  const changeStatus = useServerFn(setQuoteStatus);
  const del = useServerFn(deleteQuote);
  const bulk = useServerFn(bulkQuoteAction);
  const dup = useServerFn(duplicateQuote);
  const expire = useServerFn(expireOverdueQuotes);
  const createDraft = useServerFn(createDraftForCustomer);
  const sendById = useServerFn(sendQuoteById);
  const listCust = useServerFn(listCustomers);

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<QuoteStatus[]>([]);
  const [aiOnly, setAiOnly] = useState(false);
  const [expiringDays, setExpiringDays] = useState<number | undefined>(undefined);
  const [minTotal, setMinTotal] = useState<string>("");
  const [maxTotal, setMaxTotal] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newDlgOpen, setNewDlgOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [confirmBulk, setConfirmBulk] = useState<null | {
    action: "delete" | "send" | "accept" | "reject" | "expire";
    label: string;
    danger?: boolean;
  }>(null);

  const params = useMemo(() => {
    const p: any = { sort_by: sortBy, sort_dir: sortDir, limit: 200 };
    if (search.trim()) p.search = search.trim();
    if (statuses.length > 0) p.statuses = statuses;
    if (aiOnly) p.ai_only = true;
    if (expiringDays !== undefined) p.expiring_within_days = expiringDays;
    if (minTotal) p.min_total = Number(minTotal);
    if (maxTotal) p.max_total = Number(maxTotal);
    return p;
  }, [search, statuses, aiOnly, expiringDays, minTotal, maxTotal, sortBy, sortDir]);

  const { data: quotesResp, refetch, isFetching } = useQuery({
    queryKey: ["quotes-adv", params],
    queryFn: () => list({ data: params }),
  });
  const quotes: Quote[] = quotesResp?.rows ?? [];

  const { data: adv } = useQuery({ queryKey: ["quotes-kpis-adv"], queryFn: () => kpisAdv({ data: { days: 30 } }) });
  const { data: alertsData } = useQuery({ queryKey: ["quotes-alerts"], queryFn: () => alerts() });

  useRealtimeInvalidate({
    channel: "quotes-index",
    tables: ["quotes", "quote_events"],
    invalidate: [["quotes-adv"], ["quotes-kpis-adv"], ["quotes-alerts"]],
  });

  const { data: customerPickerData } = useQuery({
    queryKey: ["customers-picker", customerSearch],
    queryFn: () => listCust({ data: { search: customerSearch || undefined, limit: 40 } as any }),
    enabled: newDlgOpen,
  });

  const allSelected = quotes.length > 0 && quotes.every((q) => selected.has(q.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(quotes.map((q) => q.id)));
  }
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function onStatus(id: string, next: QuoteStatus) {
    try {
      await changeStatus({ data: { id, status: next } });
      toast.success(`Cotización marcada como ${STATUS_META[next].label.toLowerCase()}`);
      refetch();
      qc.invalidateQueries({ queryKey: ["quotes-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al actualizar estado");
    }
  }
  async function onDelete(id: string) {
    try {
      await del({ data: { id } });
      toast.success("Cotización eliminada");
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al eliminar");
    }
  }
  async function onDuplicate(id: string) {
    try {
      const res = await dup({ data: { id, reset_conversation: true } });
      toast.success(`Duplicada como ${res.number}`);
      refetch();
      navigate({ to: "/cotizaciones/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al duplicar");
    }
  }
  async function onSendById(id: string) {
    try {
      const res = await sendById({ data: { id, origin: window.location.origin } });
      toast.success(`Cotización enviada (${res.status})`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar");
    }
  }
  async function runBulk() {
    if (!confirmBulk) return;
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const res = await bulk({ data: { ids, action: confirmBulk.action } });
      toast.success(`${res.affected} cotización(es) actualizadas`);
      setSelected(new Set());
      setConfirmBulk(null);
      refetch();
      qc.invalidateQueries({ queryKey: ["quotes-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error en acción masiva");
    }
  }
  async function onExpireSweep() {
    try {
      const res = await expire();
      if (res.affected === 0) toast.info("No hay cotizaciones vencidas");
      else toast.success(`${res.affected} cotización(es) marcadas como expiradas`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al procesar");
    }
  }
  async function onCreateDraft(customer_id: string) {
    try {
      const res = await createDraft({ data: { customer_id } });
      toast.success(`Borrador ${res.number} creado`);
      setNewDlgOpen(false);
      navigate({ to: "/cotizaciones/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear");
    }
  }
  function exportCsv() {
    if (quotes.length === 0) {
      toast.info("Nada para exportar");
      return;
    }
    const headers = [
      "numero",
      "cliente",
      "empresa",
      "estado",
      "moneda",
      "total",
      "ai",
      "valido_hasta",
      "creado",
      "actualizado",
    ];
    const rows = quotes.map((q) => [
      q.number,
      q.customer?.name ?? "",
      q.customer?.company ?? "",
      q.status,
      q.currency,
      String(q.total ?? 0),
      q.ai_generated ? "sí" : "",
      q.valid_until ?? "",
      q.created_at,
      q.updated_at,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cotizaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function toggleSort(col: SortBy) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  }
  function toggleStatus(s: QuoteStatus) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function clearFilters() {
    setSearch("");
    setStatuses([]);
    setAiOnly(false);
    setExpiringDays(undefined);
    setMinTotal("");
    setMaxTotal("");
  }

  const activeFilters =
    (search ? 1 : 0) +
    (statuses.length > 0 ? 1 : 0) +
    (aiOnly ? 1 : 0) +
    (expiringDays !== undefined ? 1 : 0) +
    (minTotal ? 1 : 0) +
    (maxTotal ? 1 : 0);

  const alertsCount =
    (alertsData?.expiringSoon?.length ?? 0) +
    (alertsData?.viewedStale?.length ?? 0) +
    (alertsData?.unopened?.length ?? 0);

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b border-border/60 bg-card/40 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">Cotizaciones</h1>
              <p className="text-sm text-muted-foreground">
                Propuestas comerciales trazables. IA + CRM + Catálogo → ingresos reales.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onExpireSweep} title="Marcar vencidas como expiradas">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Barrer vencidas
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar CSV
              </Button>
              <Button size="sm" onClick={() => setNewDlgOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nueva cotización
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi
              label="Pipeline (30d)"
              value={multiCurrency(adv?.byCurrency, "pipeline").value}
              hint={multiCurrency(adv?.byCurrency, "pipeline").hint}
              icon={<FileText className="h-4 w-4" />}
            />
            <Kpi
              label="Ganado (30d)"
              value={multiCurrency(adv?.byCurrency, "won").value}
              hint={multiCurrency(adv?.byCurrency, "won").hint}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            />
            <Kpi
              label="Tasa cierre"
              value={
                adv && adv.sentCount > 0
                  ? `${Math.round(adv.conversion * 100)}%`
                  : "—"
              }
              hint={adv && adv.sentCount > 0 ? `${adv.wonCount}/${adv.sentCount} aceptadas` : "Sin envíos aún"}
            />
            <Kpi
              label="Ticket promedio"
              value={multiCurrency(adv?.byCurrency, "ticket").value}
              hint={multiCurrency(adv?.byCurrency, "ticket").hint}
            />
            <Kpi
              label="Tiempo a aceptar"
              value={
                adv && adv.acceptedWithSent > 0 ? `${adv.avgTimeToAcceptHours} h` : "—"
              }
              hint={adv && adv.acceptedWithSent > 0 ? `${adv.acceptedWithSent} aceptadas` : "Sin aceptadas aún"}
              icon={<Clock className="h-4 w-4" />}
            />
            <Kpi
              label="Conversión IA"
              value={adv && adv.aiCount > 0 ? `${Math.round(adv.aiConversion * 100)}%` : "—"}
              hint={adv && adv.aiCount > 0 ? `${adv.aiWon}/${adv.aiCount} con IA` : "Sin propuestas IA"}
              icon={<Sparkles className="h-4 w-4 text-primary" />}
            />
          </div>

          {alertsCount > 0 && (
            <AlertsStrip
              expiringSoon={alertsData?.expiringSoon ?? []}
              viewedStale={alertsData?.viewedStale ?? []}
              unopened={alertsData?.unopened ?? []}
              onGoTo={(id) => navigate({ to: "/cotizaciones/$id", params: { id } })}
              onQuickFilter={(days) => {
                setExpiringDays(days);
                setStatuses(["sent", "viewed"]);
              }}
            />
          )}
        </header>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/60 px-6 py-3">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar N° o título…"
              className="pl-8"
            />
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_ORDER.map((s) => {
              const on = statuses.includes(s);
              const M = STATUS_META[s];
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                    on
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <M.icon className="h-3 w-3" />
                  {M.label}
                </button>
              );
            })}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Filtros
                {activeFilters > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3" align="end">
              <div className="text-sm font-medium">Filtros avanzados</div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={aiOnly} onCheckedChange={(v) => setAiOnly(!!v)} />
                Solo generadas por IA
              </label>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Vencen en</label>
                <select
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={expiringDays ?? ""}
                  onChange={(e) => setExpiringDays(e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">— cualquier fecha —</option>
                  <option value={1}>1 día</option>
                  <option value={3}>3 días</option>
                  <option value={7}>7 días</option>
                  <option value={15}>15 días</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Total mínimo</label>
                  <Input type="number" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Total máximo</label>
                  <Input type="number" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} />
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                Limpiar filtros
              </Button>
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-1">
            <div className="flex overflow-hidden rounded-md border border-border/60">
              <button
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs",
                  viewMode === "table" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                <Rows className="h-3.5 w-3.5" /> Tabla
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs",
                  viewMode === "kanban" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
            </div>
            <p className="ml-2 text-xs text-muted-foreground">
              {isFetching ? "Actualizando…" : `${quotesResp?.total ?? quotes.length} resultado(s)`}
            </p>
          </div>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 border-b border-border/60 bg-primary/5 px-6 py-2 text-sm">
            <span className="font-medium">{selected.size} seleccionada(s)</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "send", label: "marcar como enviadas" })}>
              <Send className="mr-1 h-3.5 w-3.5" />
              Enviar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "accept", label: "aceptar" })}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Aceptar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "reject", label: "rechazar" })}>
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Rechazar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "expire", label: "expirar" })}>
              <Clock className="mr-1 h-3.5 w-3.5" />
              Expirar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmBulk({ action: "delete", label: "eliminar", danger: true })}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Eliminar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Cancelar
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {quotes.length === 0 ? (
            <EmptyState onNew={() => setNewDlgOpen(true)} />
          ) : viewMode === "kanban" ? (
            <KanbanView
              quotes={quotes}
              onOpen={(id) => navigate({ to: "/cotizaciones/$id", params: { id } })}
              onStatus={onStatus}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onSend={onSendById}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card/80 backdrop-blur">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <SortableTh label="N° / Cliente" col="number" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Total" col="total" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <SortableTh label="Estado" col="status" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Válida hasta" col="valid_until" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Creada" col="created_at" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <QuoteRow
                    key={q.id}
                    q={q}
                    selected={selected.has(q.id)}
                    onToggle={() => toggleOne(q.id)}
                    onStatus={onStatus}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onSend={onSendById}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={!!confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar acción masiva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas <strong>{confirmBulk?.label}</strong> {selected.size} cotización(es)?
              {confirmBulk?.danger && " Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulk}
              className={confirmBulk?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nueva cotización dialog */}
      <Dialog open={newDlgOpen} onOpenChange={setNewDlgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva cotización</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cliente</label>
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Buscar por nombre, empresa o teléfono…"
              />
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-border/60">
              {(customerPickerData ?? []).length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">Sin resultados</div>
              ) : (
                (customerPickerData as any[]).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onCreateDraft(c.id)}
                    className="flex w-full items-center gap-3 border-b border-border/40 p-2 text-left text-sm last:border-0 hover:bg-secondary/40"
                  >
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium">{c.name ?? "Sin nombre"}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.company ?? c.phone ?? c.email ?? "—"} · {c.stage ?? "sin etapa"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewDlgOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ---------- Row ----------
function QuoteRow({
  q,
  selected,
  onToggle,
  onStatus,
  onDelete,
  onDuplicate,
  onSend,
}: {
  q: Quote;
  selected: boolean;
  onToggle: () => void;
  onStatus: (id: string, next: QuoteStatus) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSend: (id: string) => void;
}) {
  const meta = STATUS_META[q.status];
  const Icon = meta.icon;
  const isExpiringSoon =
    q.valid_until && ["sent", "viewed"].includes(q.status)
      ? new Date(q.valid_until).getTime() - Date.now() < 3 * 86400000
      : false;

  return (
    <tr className={cn("border-t border-border/40 hover:bg-secondary/30", selected && "bg-primary/5")}>
      <td className="px-4 py-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </td>
      <td className="py-3">
        <Link to="/cotizaciones/$id" params={{ id: q.id }} className="block">
          <div className="flex items-center gap-2 font-medium">
            {q.ai_generated && <Sparkles className="h-3.5 w-3.5 text-primary" />}
            {q.customer?.name ?? "—"}
            {q.customer?.company && <span className="text-xs text-muted-foreground">· {q.customer.company}</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{q.number}</span>
            {q.title && <span className="truncate">· {q.title}</span>}
            {q.conversation_id && <MessageCircle className="h-3 w-3" />}
          </div>
        </Link>
      </td>
      <td className="py-3 text-right font-medium tabular-nums">{moneyFull(q.total, q.currency)}</td>
      <td className="py-3">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", meta.color)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </td>
      <td className="py-3 text-xs">
        {q.valid_until ? (
          <span className={cn(isExpiringSoon && "font-semibold text-amber-500")}>
            {new Date(q.valid_until).toLocaleDateString("es-ES")}
            {isExpiringSoon && " · pronto"}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString("es-ES")}</td>
      <td className="px-6 py-3">
        <div className="flex items-center justify-end gap-1">
          {q.status === "draft" && (
            <Button size="sm" variant="outline" onClick={() => onSend(q.id)} title="Enviar por WhatsApp">
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
          {q.status === "sent" && (
            <Button size="sm" variant="outline" onClick={() => onStatus(q.id, "accepted")} title="Marcar aceptada">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link to="/cotizaciones/$id" params={{ id: q.id }}>
                  <FileText className="mr-2 h-3.5 w-3.5" /> Abrir
                </Link>
              </DropdownMenuItem>
              {q.customer_id && (
                <DropdownMenuItem asChild>
                  <Link to="/clientes/$id" params={{ id: q.customer_id }}>
                    <UserRound className="mr-2 h-3.5 w-3.5" /> Ver cliente
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onDuplicate(q.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
              </DropdownMenuItem>
              {q.status === "sent" && (
                <DropdownMenuItem onSelect={() => onStatus(q.id, "viewed")}>
                  <Eye className="mr-2 h-3.5 w-3.5" /> Marcar vista
                </DropdownMenuItem>
              )}
              {["sent", "viewed"].includes(q.status) && (
                <>
                  <DropdownMenuItem onSelect={() => onStatus(q.id, "accepted")}>
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-500" /> Aceptar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onStatus(q.id, "rejected")}>
                    <XCircle className="mr-2 h-3.5 w-3.5" /> Rechazar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onStatus(q.id, "expired")}>
                    <Clock className="mr-2 h-3.5 w-3.5" /> Expirar
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(q.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

function SortableTh({
  label,
  col,
  sortBy,
  sortDir,
  onClick,
  align,
}: {
  label: string;
  col: SortBy;
  sortBy: SortBy;
  sortDir: "asc" | "desc";
  onClick: (c: SortBy) => void;
  align?: "right";
}) {
  const active = sortBy === col;
  return (
    <th className={cn("py-3 text-left font-medium", align === "right" && "text-right")}>
      <button
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
        onClick={() => onClick(col)}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-40")} />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function KanbanView({
  quotes,
  onOpen,
  onStatus,
  onDelete,
  onDuplicate,
  onSend,
}: {
  quotes: Quote[];
  onOpen: (id: string) => void;
  onStatus: (id: string, next: QuoteStatus) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSend: (id: string) => void;
}) {
  const byStatus = useMemo(() => {
    const m: Record<QuoteStatus, Quote[]> = {
      draft: [],
      sent: [],
      viewed: [],
      accepted: [],
      rejected: [],
      expired: [],
    };
    for (const q of quotes) m[q.status].push(q);
    return m;
  }, [quotes]);

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {STATUS_ORDER.map((s) => {
        const M = STATUS_META[s];
        const list = byStatus[s];
        const sum = list.reduce((a, q) => a + Number(q.total ?? 0), 0);
        return (
          <div key={s} className="flex w-72 flex-none flex-col rounded-lg border border-border/60 bg-card/30">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <M.icon className="h-3.5 w-3.5" />
                <span className="text-sm font-medium">{M.label}</span>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
              <span className="text-xs font-medium">{money(sum)}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {list.length === 0 && (
                <div className="rounded border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                  Vacío
                </div>
              )}
              {list.map((q) => (
                <div
                  key={q.id}
                  className="cursor-pointer rounded-md border border-border/60 bg-background/60 p-2 hover:border-primary/50"
                  onClick={() => onOpen(q.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 truncate text-sm font-medium">
                      {q.ai_generated && <Sparkles className="h-3 w-3 text-primary" />}
                      <span className="truncate">{q.customer?.name ?? "—"}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{q.number}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold">{moneyFull(q.total, q.currency)}</div>
                  {q.valid_until && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      Válida hasta {new Date(q.valid_until).toLocaleDateString("es-ES")}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {q.status === "draft" && (
                      <button
                        onClick={() => onSend(q.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Enviar"
                      >
                        <Send className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onDuplicate(q.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="Duplicar"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {["sent", "viewed"].includes(q.status) && (
                      <button
                        onClick={() => onStatus(q.id, "accepted")}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-emerald-500"
                        title="Aceptar"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(q.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertsStrip({
  expiringSoon,
  viewedStale,
  unopened,
  onGoTo,
  onQuickFilter,
}: {
  expiringSoon: any[];
  viewedStale: any[];
  unopened: any[];
  onGoTo: (id: string) => void;
  onQuickFilter: (days: number) => void;
}) {
  const items: { key: string; label: string; count: number; icon: any; tone: string; list: any[]; onFilter?: () => void }[] = [];
  if (expiringSoon.length > 0)
    items.push({
      key: "exp",
      label: "Vencen en 3 días",
      count: expiringSoon.length,
      icon: AlertTriangle,
      tone: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      list: expiringSoon,
      onFilter: () => onQuickFilter(3),
    });
  if (viewedStale.length > 0)
    items.push({
      key: "stale",
      label: "Vistas sin respuesta",
      count: viewedStale.length,
      icon: Flame,
      tone: "text-rose-500 bg-rose-500/10 border-rose-500/30",
      list: viewedStale,
    });
  if (unopened.length > 0)
    items.push({
      key: "unop",
      label: "Enviadas hace +3 días",
      count: unopened.length,
      icon: Clock,
      tone: "text-orange-400 bg-orange-500/10 border-orange-500/30",
      list: unopened,
    });
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Popover key={it.key}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition hover:opacity-90",
                  it.tone,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="font-medium">{it.label}</span>
                <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-semibold">{it.count}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">{it.label}</div>
              <div className="max-h-64 space-y-1 overflow-auto">
                {it.list.slice(0, 12).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => onGoTo(q.id)}
                    className="flex w-full items-center justify-between rounded p-2 text-left text-xs hover:bg-secondary/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{q.customer?.name ?? "—"}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{q.number}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{money(q.total, q.currency)}</div>
                      {q.valid_until && (
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(q.valid_until).toLocaleDateString("es-ES")}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {it.onFilter && (
                <Button size="sm" variant="outline" className="mt-2 w-full" onClick={it.onFilter}>
                  Filtrar en la lista
                </Button>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <FileText className="h-10 w-10 text-muted-foreground/50" />
      <div>
        <div className="font-medium">No hay cotizaciones con estos filtros</div>
        <div className="text-sm text-muted-foreground">
          Crea una manualmente, desde la ficha del cliente o directamente desde la Bandeja Unificada con IA.
        </div>
      </div>
      <Button onClick={onNew}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Nueva cotización
      </Button>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
