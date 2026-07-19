import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Package,
  Plus,
  Search,
  Trash2,
  Pencil,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Boxes,
  ImageIcon,
  Copy,
  Download,
  Upload,
  MoreHorizontal,
  Filter,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  X,
  BarChart3,
  Users,
  FileText,
  History,
  Wand2,
  Power,
  RefreshCcw,
  Tag,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  listProductsAdvanced,
  listProducts,
  upsertProduct,
  deleteProduct,
  duplicateProduct,
  bulkProductAction,
  adjustStock,
  bulkImportProducts,
  getProductDetails,
  getCatalogAlerts,
  getCatalogOverview,
  listCategories,
  aiEnrichProduct,
  type Product,
} from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/catalogo")({
  head: () => ({ meta: [{ title: "Catálogo — Dialen" }] }),
  component: CatalogPage,
});

function money(n: number, cur = "USD") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(n || 0);
}

type SortKey = "updated_at" | "name" | "price" | "margin_pct" | "stock";

function CatalogPage() {
  const list = useServerFn(listProductsAdvanced);
  const overview = useServerFn(getCatalogOverview);
  const alertsFn = useServerFn(getCatalogAlerts);
  const catsFn = useServerFn(listCategories);
  const del = useServerFn(deleteProduct);
  const dup = useServerFn(duplicateProduct);
  const bulk = useServerFn(bulkProductAction);
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [active, setActive] = useState<"all" | "active" | "inactive">("active");
  const [ai, setAi] = useState<"all" | "on" | "off">("all");
  const [stock, setStock] = useState<"all" | "low" | "out" | "tracked">("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("updated_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // Selection & panels
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<null | {
    action: "delete" | "activate" | "deactivate" | "ai_on" | "ai_off";
  }>(null);
  const [stockOpen, setStockOpen] = useState<Product | null>(null);

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      categories: categories.length ? categories : undefined,
      tags: tags.length ? tags : undefined,
      active,
      ai,
      stock,
      price_min: priceMin ? Number(priceMin) : undefined,
      price_max: priceMax ? Number(priceMax) : undefined,
      sort,
      dir,
      limit: 200,
      offset: 0,
    }),
    [search, categories, tags, active, ai, stock, priceMin, priceMax, sort, dir],
  );

  const { data: result, isLoading } = useQuery({
    queryKey: ["catalog-adv", params],
    queryFn: () => list({ data: params }),
  });
  const products = result?.rows ?? [];
  const total = result?.count ?? 0;

  const { data: kpis } = useQuery({
    queryKey: ["catalog-overview"],
    queryFn: () => overview(),
  });
  const { data: alerts } = useQuery({
    queryKey: ["catalog-alerts"],
    queryFn: () => alertsFn(),
  });
  const { data: allCats = [] } = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: () => catsFn(),
  });

  useRealtimeInvalidate({
    channel: "catalog",
    tables: ["products", "product_customers", "product_recommendations", "product_events"],
    invalidate: [
      ["catalog-adv"],
      ["catalog-overview"],
      ["catalog-alerts"],
      ["catalog-categories"],
      ["product-details"],
    ],
  });

  // Tag universe (from currently visible products)
  const tagUniverse = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) for (const t of p.tags ?? []) s.add(t);
    return [...s].sort();
  }, [products]);

  function toggleSort(k: SortKey) {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "name" ? "asc" : "desc");
    }
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(products.map((p) => p.id)) : new Set());
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function runBulk(action: any, value?: string) {
    if (selected.size === 0) return;
    try {
      const res = await bulk({ data: { ids: [...selected], action, value } });
      toast.success(`${res.count} producto(s) actualizados`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["catalog-adv"] });
      qc.invalidateQueries({ queryKey: ["catalog-overview"] });
      qc.invalidateQueries({ queryKey: ["catalog-alerts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error en acción masiva");
    } finally {
      setConfirmBulk(null);
    }
  }

  async function onDelete(p: Product) {
    try {
      await del({ data: { id: p.id } });
      toast.success(`"${p.name}" eliminado`);
      qc.invalidateQueries({ queryKey: ["catalog-adv"] });
      qc.invalidateQueries({ queryKey: ["catalog-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al eliminar");
    } finally {
      setConfirmDelete(null);
    }
  }

  async function onDuplicate(p: Product) {
    try {
      const row = await dup({ data: { id: p.id } });
      toast.success(`Duplicado: ${row.name}`);
      qc.invalidateQueries({ queryKey: ["catalog-adv"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error al duplicar");
    }
  }

  function exportCsv() {
    const header = [
      "sku",
      "name",
      "category",
      "price",
      "cost",
      "currency",
      "stock",
      "track_stock",
      "tags",
      "active",
      "ai_recommendable",
      "description",
    ];
    const rows = products.map((p) => [
      p.sku ?? "",
      p.name,
      p.category ?? "",
      p.price,
      p.cost,
      p.currency,
      p.stock ?? "",
      p.track_stock ? "true" : "false",
      (p.tags ?? []).join("|"),
      p.active ? "true" : "false",
      p.ai_recommendable ? "true" : "false",
      (p.description ?? "").replace(/[\r\n]+/g, " "),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    categories.length +
    tags.length +
    (active !== "active" ? 1 : 0) +
    (ai !== "all" ? 1 : 0) +
    (stock !== "all" ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0);

  return (
    <AppShell>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
              <Package className="h-6 w-6 text-primary" />
              Catálogo comercial
            </h1>
            <p className="text-sm text-muted-foreground">
              Fuente única de productos. Conectado a Bandeja, CRM, Embudo, Cotizaciones, IA y Automatizaciones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={products.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Importar
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuevo producto
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* KPIs */}
          <div className="grid gap-3 md:grid-cols-5">
            <Kpi
              icon={Boxes}
              label="Productos activos"
              value={`${kpis?.totals.active ?? 0}/${kpis?.totals.products ?? 0}`}
            />
            <Kpi icon={TrendingUp} label="Vinculados a clientes" value={String(kpis?.totals.linked ?? 0)} />
            <Kpi icon={DollarSign} label="Pipeline en catálogo" value={money(kpis?.totals.pipelineValue ?? 0)} />
            <Kpi icon={Sparkles} label="Recomendaciones IA" value={String(kpis?.totals.recommendations ?? 0)} />
            <Kpi
              icon={AlertTriangle}
              label="Bajo stock"
              value={String(kpis?.totals.lowStock ?? 0)}
              tone={kpis?.totals.lowStock ? "warn" : "default"}
            />
          </div>

          {/* Alerts */}
          {alerts && <AlertsStrip alerts={alerts} onPick={(id) => setDetailId(id)} />}

          {/* Insights */}
          {kpis && (
            <div className="grid gap-3 md:grid-cols-3">
              <InsightList
                title="Más vendidos"
                icon={TrendingUp}
                rows={kpis.topSelling}
                format={(p: any) => `${p.purchased} vendidos`}
                onPick={(id) => setDetailId(id)}
              />
              <InsightList
                title="Más pipeline"
                icon={DollarSign}
                rows={kpis.topPipeline}
                format={(p: any) => money(p.pipeline_value)}
                onPick={(id) => setDetailId(id)}
              />
              <InsightList
                title="Más recomendados por IA"
                icon={Sparkles}
                rows={kpis.topRecommended}
                format={(p: any) => `${p.reco_count} recos`}
                onPick={(id) => setDetailId(id)}
              />
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU, descripción o categoría…"
                className="pl-9"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-1.5 h-3.5 w-3.5" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[420px] p-4">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Estado</div>
                    <div className="flex gap-1">
                      {(["all", "active", "inactive"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setActive(v)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            active === v ? "border-primary bg-primary/10" : "text-muted-foreground",
                          )}
                        >
                          {v === "all" ? "Todos" : v === "active" ? "Activos" : "Inactivos"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">IA</div>
                    <div className="flex gap-1">
                      {(["all", "on", "off"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setAi(v)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            ai === v ? "border-primary bg-primary/10" : "text-muted-foreground",
                          )}
                        >
                          {v === "all" ? "Todos" : v === "on" ? "Recomendables" : "Pausadas"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Stock</div>
                    <div className="flex flex-wrap gap-1">
                      {(["all", "tracked", "low", "out"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setStock(v)}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            stock === v ? "border-primary bg-primary/10" : "text-muted-foreground",
                          )}
                        >
                          {v === "all"
                            ? "Todos"
                            : v === "tracked"
                              ? "Con seguimiento"
                              : v === "low"
                                ? "Bajo umbral"
                                : "Sin stock"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Categorías</div>
                    <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                      {allCats.length === 0 && (
                        <span className="text-xs text-muted-foreground">Sin categorías aún.</span>
                      )}
                      {allCats.map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            setCategories((prev) =>
                              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                            )
                          }
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-xs",
                            categories.includes(c)
                              ? "border-primary bg-primary/10"
                              : "text-muted-foreground",
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  {tagUniverse.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Etiquetas</div>
                      <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                        {tagUniverse.map((t) => (
                          <button
                            key={t}
                            onClick={() =>
                              setTags((prev) =>
                                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                              )
                            }
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-xs",
                              tags.includes(t) ? "border-primary bg-primary/10" : "text-muted-foreground",
                            )}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Precio</div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="min"
                        value={priceMin}
                        onChange={(e) => setPriceMin(e.target.value)}
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        type="number"
                        placeholder="max"
                        value={priceMax}
                        onChange={(e) => setPriceMax(e.target.value)}
                        className="h-8"
                      />
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setSearch("");
                        setCategories([]);
                        setTags([]);
                        setActive("active");
                        setAi("all");
                        setStock("all");
                        setPriceMin("");
                        setPriceMax("");
                      }}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" /> Limpiar filtros
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <div className="ml-auto text-xs text-muted-foreground">
              {isLoading ? "Cargando…" : `${products.length} de ${total}`}
            </div>
          </div>

          {/* Bulk toolbar */}
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{selected.size} seleccionado(s)</span>
              <div className="ml-auto flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "activate" })}>
                  Activar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "deactivate" })}>
                  Desactivar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "ai_on" })}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> IA activada
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmBulk({ action: "ai_off" })}>
                  IA pausada
                </Button>
                <BulkTagButton onApply={(v) => runBulk("add_tag", v)} />
                <BulkCategoryButton onApply={(v) => runBulk("set_category", v)} suggestions={allCats} />
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmBulk({ action: "delete" })}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={products.length > 0 && selected.size === products.length}
                      onCheckedChange={(v) => toggleSelectAll(!!v)}
                    />
                  </th>
                  <SortTh label="Producto" k="name" sort={sort} dir={dir} onClick={toggleSort} />
                  <th className="px-4 py-2 text-left">Categoría</th>
                  <SortTh label="Precio" k="price" sort={sort} dir={dir} onClick={toggleSort} align="right" />
                  <SortTh label="Margen" k="margin_pct" sort={sort} dir={dir} onClick={toggleSort} align="right" />
                  <SortTh label="Stock" k="stock" sort={sort} dir={dir} onClick={toggleSort} align="right" />
                  <th className="px-4 py-2 text-center">IA</th>
                  <th className="w-10 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && products.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      {activeFilterCount > 0
                        ? "Ningún producto coincide con los filtros."
                        : "Sin productos aún. Crea el primero o importa un CSV."}
                    </td>
                  </tr>
                )}
                {products.map((p) => {
                  const margin = Number(p.price) - Number(p.cost);
                  const pct = p.price > 0 ? (margin / Number(p.price)) * 100 : 0;
                  const low =
                    p.track_stock &&
                    typeof p.stock === "number" &&
                    typeof p.low_stock_threshold === "number" &&
                    p.stock <= p.low_stock_threshold;
                  const isSel = selected.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-t transition-colors hover:bg-muted/30 cursor-pointer",
                        isSel && "bg-primary/5",
                      )}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-stop]")) return;
                        setDetailId(p.id);
                      }}
                    >
                      <td className="px-3 py-3" data-stop>
                        <Checkbox checked={isSel} onCheckedChange={() => toggleOne(p.id)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                            {Array.isArray(p.images) && p.images[0] ? (
                              <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.name}</span>
                              {!p.active && (
                                <span className="rounded bg-muted px-1.5 text-[10px] uppercase text-muted-foreground">
                                  Inactivo
                                </span>
                              )}
                              {(p.tags ?? []).slice(0, 2).map((t) => (
                                <span
                                  key={t}
                                  className="rounded bg-secondary px-1.5 text-[10px] text-muted-foreground"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.sku ?? "sin SKU"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.category ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {money(Number(p.price), p.currency)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-mono",
                          pct >= 30 ? "text-emerald-600" : pct <= 0 ? "text-red-600" : "",
                        )}
                      >
                        {pct.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.track_stock ? (
                          <span className={cn("font-mono", low && "font-semibold text-amber-600")}>
                            {p.stock ?? 0}
                            {low && " ⚠"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.ai_recommendable ? (
                          <Sparkles className="mx-auto h-4 w-4 text-primary" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Pausada</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right" data-stop>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={() => setEditing(p)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDetailId(p.id)}>
                              <BarChart3 className="mr-2 h-3.5 w-3.5" /> Ver detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onDuplicate(p)}>
                              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                            </DropdownMenuItem>
                            {p.track_stock && (
                              <DropdownMenuItem onSelect={() => setStockOpen(p)}>
                                <Boxes className="mr-2 h-3.5 w-3.5" /> Ajustar stock
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setConfirmDelete(p)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(creating || editing) && (
        <ProductDialog
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["catalog-adv"] });
            qc.invalidateQueries({ queryKey: ["catalog-overview"] });
            qc.invalidateQueries({ queryKey: ["catalog-categories"] });
          }}
        />
      )}

      {detailId && (
        <ProductDetailSheet
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(p) => {
            setDetailId(null);
            setEditing(p);
          }}
          onDelete={(p) => {
            setDetailId(null);
            setConfirmDelete(p);
          }}
          onStock={(p) => setStockOpen(p)}
          onDuplicate={onDuplicate}
        />
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["catalog-adv"] });
            qc.invalidateQueries({ queryKey: ["catalog-overview"] });
          }}
        />
      )}

      {stockOpen && (
        <StockDialog
          product={stockOpen}
          onClose={() => setStockOpen(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ["catalog-adv"] })}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <b>{confirmDelete?.name}</b> y sus vínculos con clientes, recomendaciones IA e historial.
              Esta acción no se puede deshacer. Las cotizaciones existentes conservarán el ítem pero perderán el
              enlace al producto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && onDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulk?.action === "delete"
                ? `Eliminar ${selected.size} producto(s)`
                : `Aplicar acción a ${selected.size} producto(s)`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulk?.action === "delete"
                ? "Esta acción no se puede deshacer y removerá todos los vínculos asociados."
                : "El cambio se aplicará a todos los productos seleccionados y se registrará en el historial."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBulk && runBulk(confirmBulk.action)}
              className={
                confirmBulk?.action === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ============================================================
// Sub-components
// ============================================================

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone === "warn" && "border-amber-400/50")}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn("h-4 w-4", tone === "warn" ? "text-amber-500" : "text-primary")} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function InsightList({
  title,
  icon: Icon,
  rows,
  format,
  onPick,
}: {
  title: string;
  icon: any;
  rows: any[];
  format: (row: any) => string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-muted-foreground">Sin datos aún</div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <button
                onClick={() => onPick(r.id)}
                className="truncate pr-2 text-left hover:text-primary hover:underline"
              >
                {r.name}
              </button>
              <span className="text-xs text-muted-foreground">{format(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertsStrip({ alerts, onPick }: { alerts: any; onPick: (id: string) => void }) {
  const items = [
    { key: "outOfStock", label: "Sin stock", tone: "red", rows: alerts.outOfStock },
    { key: "lowStock", label: "Bajo stock", tone: "amber", rows: alerts.lowStock },
    { key: "noMargin", label: "Sin margen", tone: "red", rows: alerts.noMargin },
    { key: "missingPrice", label: "Sin precio", tone: "amber", rows: alerts.missingPrice },
    { key: "aiPaused", label: "IA pausada", tone: "muted", rows: alerts.aiPaused },
    { key: "orphan", label: "Sin actividad", tone: "muted", rows: alerts.orphan },
  ].filter((x) => (x.rows ?? []).length > 0);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3">
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
        Alertas
      </span>
      {items.map((it) => (
        <Popover key={it.key}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                it.tone === "red" && "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-400",
                it.tone === "amber" && "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                it.tone === "muted" && "border-border bg-muted/50 text-muted-foreground",
              )}
            >
              {it.label}
              <span className="ml-1 font-mono">{it.rows.length}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">{it.label}</div>
            <div className="max-h-64 overflow-auto">
              {it.rows.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => onPick(r.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {typeof r.stock === "number" ? `stock ${r.stock}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-4 py-2", align === "right" ? "text-right" : "text-left")}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function BulkTagButton({ onApply }: { onApply: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Tag className="mr-1 h-3.5 w-3.5" /> Etiqueta
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-2 text-xs text-muted-foreground">Agregar etiqueta a los seleccionados</div>
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="ej. destacado" className="h-8" />
          <Button
            size="sm"
            onClick={() => {
              if (v.trim()) {
                onApply(v.trim().toLowerCase());
                setV("");
              }
            }}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BulkCategoryButton({
  onApply,
  suggestions,
}: {
  onApply: (v: string) => void;
  suggestions: string[];
}) {
  const [v, setV] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Layers className="mr-1 h-3.5 w-3.5" /> Categoría
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-2 text-xs text-muted-foreground">Asignar categoría</div>
        <div className="flex gap-2">
          <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Servicios" className="h-8" />
          <Button size="sm" onClick={() => v.trim() && onApply(v.trim())}>
            Aplicar
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onApply(s)}
                className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------- Detail Sheet ----------

function ProductDetailSheet({
  id,
  onClose,
  onEdit,
  onDelete,
  onStock,
  onDuplicate,
}: {
  id: string;
  onClose: () => void;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
  onStock: (p: Product) => void;
  onDuplicate: (p: Product) => void;
}) {
  const fn = useServerFn(getProductDetails);
  const bulk = useServerFn(bulkProductAction);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["product-details", id],
    queryFn: () => fn({ data: { id } }),
  });

  async function toggle(field: "active" | "ai_recommendable") {
    if (!data?.product) return;
    const p = data.product as Product;
    const action = field === "active" ? (p.active ? "deactivate" : "activate") : p.ai_recommendable ? "ai_off" : "ai_on";
    await bulk({ data: { ids: [p.id], action } });
    toast.success("Actualizado");
    qc.invalidateQueries({ queryKey: ["product-details", id] });
    qc.invalidateQueries({ queryKey: ["catalog-adv"] });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {isLoading || !data ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {Array.isArray(data.product.images) && data.product.images[0] ? (
                    <img src={data.product.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{data.product.name}</SheetTitle>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {data.product.sku ?? "sin SKU"}
                    {data.product.category && ` · ${data.product.category}`}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!data.product.active && (
                      <Badge variant="outline" className="text-[10px]">
                        Inactivo
                      </Badge>
                    )}
                    {data.product.ai_recommendable ? (
                      <Badge variant="secondary" className="text-[10px]">
                        <Sparkles className="mr-1 h-3 w-3" /> IA activada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        IA pausada
                      </Badge>
                    )}
                    {(data.product.tags ?? []).map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </SheetHeader>

            {/* Quick actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onEdit(data.product)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDuplicate(data.product)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicar
              </Button>
              {data.product.track_stock && (
                <Button size="sm" variant="outline" onClick={() => onStock(data.product)}>
                  <Boxes className="mr-1.5 h-3.5 w-3.5" /> Ajustar stock
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => toggle("active")}>
                <Power className="mr-1.5 h-3.5 w-3.5" /> {data.product.active ? "Desactivar" : "Activar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => toggle("ai_recommendable")}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {data.product.ai_recommendable ? "Pausar IA" : "Activar IA"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(data.product)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
              </Button>
            </div>

            {/* Metrics */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <MetricCell label="Pipeline" value={money(data.metrics.pipelineValue, data.product.currency)} />
              <MetricCell label="Cotizaciones" value={String(data.metrics.quotesCount)} />
              <MetricCell label="Vendidos" value={String(data.metrics.purchasedCount)} />
              <MetricCell label="Vínculos" value={String(data.metrics.linksCount)} />
              <MetricCell label="Recos IA" value={String(data.metrics.recoCount)} />
              <MetricCell label="Ingresos" value={money(data.metrics.revenue, data.product.currency)} />
            </div>

            <Tabs defaultValue="clientes" className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="clientes" className="flex-1">
                  <Users className="mr-1.5 h-3.5 w-3.5" /> Clientes
                </TabsTrigger>
                <TabsTrigger value="cotizaciones" className="flex-1">
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Cotizaciones
                </TabsTrigger>
                <TabsTrigger value="ia" className="flex-1">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> IA
                </TabsTrigger>
                <TabsTrigger value="historial" className="flex-1">
                  <History className="mr-1.5 h-3.5 w-3.5" /> Historial
                </TabsTrigger>
              </TabsList>

              <TabsContent value="clientes" className="mt-2 space-y-1">
                {data.links.length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Aún nadie está vinculado a este producto.
                  </div>
                )}
                {data.links.map((l: any) => (
                  <Link
                    key={l.id}
                    to="/clientes/$id"
                    params={{ id: l.customer_id }}
                    className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{l.customer?.name ?? "Cliente"}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.context} · {new Date(l.created_at).toLocaleDateString("es-ES")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">
                        {money(Number(l.estimated_value ?? 0), data.product.currency)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {l.quantity} × {money(Number(l.unit_price ?? 0), data.product.currency)}
                      </div>
                    </div>
                  </Link>
                ))}
              </TabsContent>

              <TabsContent value="cotizaciones" className="mt-2 space-y-1">
                {data.quoteItems.length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No aparece en cotizaciones aún.
                  </div>
                )}
                {data.quoteItems.map((qi: any) => (
                  <Link
                    key={qi.id}
                    to="/cotizaciones/$id"
                    params={{ id: qi.quote?.id }}
                    className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{qi.quote?.number}</div>
                      <div className="text-xs text-muted-foreground">
                        {qi.quote?.status} ·{" "}
                        {qi.quote?.created_at && new Date(qi.quote.created_at).toLocaleDateString("es-ES")}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      {qi.quantity} × {money(Number(qi.unit_price ?? 0), data.product.currency)}
                    </div>
                  </Link>
                ))}
              </TabsContent>

              <TabsContent value="ia" className="mt-2 space-y-1">
                {data.recommendations.length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    La IA aún no ha recomendado este producto.
                  </div>
                )}
                {data.recommendations.map((r: any) => (
                  <div key={r.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{r.customer?.name ?? "Contacto"}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {r.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.reason ?? r.reason_code ?? "—"}
                      {typeof r.score === "number" && ` · score ${r.score.toFixed(2)}`}
                      {typeof r.probability === "number" && ` · p ${r.probability}`}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="historial" className="mt-2 space-y-1">
                {data.events.length === 0 && (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Sin eventos registrados.
                  </div>
                )}
                {data.events.map((ev: any) => (
                  <div key={ev.id} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{ev.event_type.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString("es-ES")}
                      </span>
                    </div>
                    {ev.payload && Object.keys(ev.payload).length > 0 && (
                      <div className="mt-1 text-muted-foreground">
                        {ev.event_type === "stock_adjusted"
                          ? `${ev.payload.prev} → ${ev.payload.next}${ev.payload.reason ? ` · ${ev.payload.reason}` : ""}`
                          : JSON.stringify(ev.payload)}
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>
            </Tabs>

            {data.product.description && (
              <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                {data.product.description}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm">{value}</div>
    </div>
  );
}

// ---------- Stock Dialog ----------

function StockDialog({
  product,
  onClose,
  onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const adj = useServerFn(adjustStock);
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [delta, setDelta] = useState<string>("1");
  const [target, setTarget] = useState<string>(String(product.stock ?? 0));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await adj({
        data: {
          id: product.id,
          delta: mode === "delta" ? Number(delta) : undefined,
          set: mode === "set" ? Number(target) : undefined,
          reason: reason || undefined,
        },
      });
      toast.success("Stock actualizado");
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock — {product.name}</DialogTitle>
          <DialogDescription>
            Stock actual: <span className="font-mono">{product.stock ?? 0}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1">
            <button
              onClick={() => setMode("delta")}
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-sm",
                mode === "delta" && "border-primary bg-primary/10",
              )}
            >
              Sumar / restar
            </button>
            <button
              onClick={() => setMode("set")}
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-sm",
                mode === "set" && "border-primary bg-primary/10",
              )}
            >
              Fijar total
            </button>
          </div>
          {mode === "delta" ? (
            <div>
              <label className="text-xs text-muted-foreground">Ajuste (usa negativos para restar)</label>
              <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">Nuevo total</label>
              <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compra, venta, merma…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Import Dialog ----------

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const importFn = useServerFn(bulkImportProducts);
  const [rows, setRows] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; failed: number; errors: any[] } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length === 0) return [];
    const header = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
    const out: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvRow(lines[i]);
      const obj: any = {};
      header.forEach((h, idx) => (obj[h] = cells[idx] ?? ""));
      out.push({
        name: obj.name ?? obj.nombre ?? "",
        sku: obj.sku || null,
        category: obj.category || obj.categoria || null,
        price: Number(obj.price ?? obj.precio ?? 0) || 0,
        cost: Number(obj.cost ?? obj.costo ?? 0) || 0,
        currency: (obj.currency ?? obj.moneda ?? "USD").toString().slice(0, 3).toUpperCase(),
        stock: obj.stock === "" || obj.stock == null ? null : Number(obj.stock),
        track_stock: /true|1|si|sí/i.test(String(obj.track_stock ?? "")),
        tags: (obj.tags ?? "")
          .split(/[|,]/)
          .map((t: string) => t.trim().toLowerCase())
          .filter(Boolean),
        description: obj.description || obj.descripcion || null,
        active: obj.active == null || obj.active === "" ? true : /true|1|si|sí/i.test(String(obj.active)),
      });
    }
    return out.filter((r) => r.name);
  }

  function parseCsvRow(line: string) {
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
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function onFile(f: File) {
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setRows(parseCsv(String(reader.result)));
    reader.readAsText(f);
  }

  async function submit() {
    if (!rows || rows.length === 0) return;
    setRunning(true);
    try {
      const res = await importFn({ data: { rows } });
      setResult(res);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar productos desde CSV</DialogTitle>
          <DialogDescription>
            Columnas soportadas: <code>name, sku, category, price, cost, currency, stock, track_stock, tags, description, active</code>.
            Si el SKU coincide con un producto existente, se actualizará.
          </DialogDescription>
        </DialogHeader>
        {!result ? (
          <>
            <div
              className="cursor-pointer rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-muted/30"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              {fileName ? (
                <div>
                  <div className="font-medium text-foreground">{fileName}</div>
                  <div className="text-xs">{rows?.length ?? 0} filas detectadas</div>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto mb-2 h-6 w-6" />
                  Arrastra un archivo CSV o haz clic para seleccionarlo
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </div>
            {rows && rows.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-md border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left">Nombre</th>
                      <th className="px-2 py-1 text-left">SKU</th>
                      <th className="px-2 py-1 text-right">Precio</th>
                      <th className="px-2 py-1 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 6).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{r.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">{r.sku ?? "—"}</td>
                        <td className="px-2 py-1 text-right font-mono">{r.price}</td>
                        <td className="px-2 py-1 text-right font-mono">{r.stock ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <div>
              ✅ Creados: <b>{result.created}</b> · ✏️ Actualizados: <b>{result.updated}</b> · ❌ Fallidos:{" "}
              <b>{result.failed}</b>
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-auto rounded border p-2 text-xs">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-red-600">
                    Fila {e.row}: {e.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={!rows || rows.length === 0 || running} onClick={submit}>
                {running ? "Importando…" : `Importar ${rows?.length ?? 0}`}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Product Dialog (create/edit) ----------

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertProduct);
  const enrichFn = useServerFn(aiEnrichProduct);
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "",
    tags: (product?.tags ?? []).join(", "),
    price: product?.price ?? 0,
    cost: product?.cost ?? 0,
    currency: product?.currency ?? "USD",
    track_stock: product?.track_stock ?? false,
    stock: product?.stock ?? 0,
    low_stock_threshold: product?.low_stock_threshold ?? 0,
    ai_recommendable: product?.ai_recommendable ?? true,
    active: product?.active ?? true,
    image_url:
      Array.isArray(product?.images) && (product?.images as any)[0] ? String((product?.images as any)[0]) : "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const margin = Number(form.price) - Number(form.cost);
  const marginPct = Number(form.price) > 0 ? (margin / Number(form.price)) * 100 : 0;

  async function enrichWithAi() {
    if (!form.name.trim()) {
      toast.error("Ingresa el nombre primero");
      return;
    }
    setEnriching(true);
    try {
      const res = await enrichFn({
        data: {
          name: form.name,
          category: form.category || null,
          current_description: form.description || null,
        },
      });
      setForm((f) => ({
        ...f,
        description: res.description || f.description,
        tags: [...new Set([...(f.tags ? f.tags.split(",").map((t) => t.trim()) : []), ...res.tags])]
          .filter(Boolean)
          .join(", "),
      }));
      toast.success("Descripción y etiquetas generadas");
    } catch (e: any) {
      toast.error(e?.message ?? "Error IA");
    } finally {
      setEnriching(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await upsert({
        data: {
          id: product?.id,
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          description: form.description.trim() || null,
          category: form.category.trim() || null,
          tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
          price: Number(form.price) || 0,
          cost: Number(form.cost) || 0,
          currency: form.currency.trim().toUpperCase() || "USD",
          track_stock: form.track_stock,
          stock: form.track_stock ? Number(form.stock) || 0 : null,
          low_stock_threshold: form.track_stock ? Number(form.low_stock_threshold) || 0 : null,
          images: form.image_url.trim() ? [form.image_url.trim()] : [],
          variants: [],
          custom_fields: {},
          ai_recommendable: form.ai_recommendable,
          active: form.active,
        } as any,
      });
      toast.success(product ? "Producto actualizado" : "Producto creado");
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          <DialogDescription>
            Los cambios se propagan automáticamente a Bandeja, CRM, Cotizaciones y Recomendaciones IA.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Nombre">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Consultoría premium"
              />
            </Field>
          </div>
          <Field label="Precio">
            <Input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
          <Field label="Etiquetas (coma)">
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="destacado, upsell"
            />
          </Field>
          <div className="md:col-span-2 flex flex-wrap items-center gap-6 rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              Disponible
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.ai_recommendable}
                onCheckedChange={(v) => setForm({ ...form, ai_recommendable: v })}
              />
              <Sparkles className="h-3.5 w-3.5 text-primary" /> IA puede recomendarlo
            </label>
            <div className="ml-auto text-xs text-muted-foreground">
              Margen: <span className={cn("font-mono", marginPct >= 30 ? "text-emerald-600" : marginPct <= 0 ? "text-red-600" : "")}>{marginPct.toFixed(0)}%</span>
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? "− Ocultar" : "+ Más opciones"} (SKU, descripción, costo, stock, imagen)
            </button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={enrichWithAi}
              disabled={enriching}
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              {enriching ? "Generando…" : "Enriquecer con IA"}
            </Button>
          </div>

          {showAdvanced && (
            <>
              <Field label="SKU">
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="SKU-001"
                />
              </Field>
              <Field label="Categoría">
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Servicios"
                />
              </Field>
              <Field label="Costo">
                <Input
                  type="number"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
                />
              </Field>
              <Field label="Moneda">
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  maxLength={3}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="URL de imagen">
                  <Input
                    value={form.image_url}
                    onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Descripción">
                  <Textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-6 rounded-md border bg-muted/30 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.track_stock}
                    onCheckedChange={(v) => setForm({ ...form, track_stock: v })}
                  />
                  Controlar stock
                </label>
                {form.track_stock && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      Stock:
                      <Input
                        type="number"
                        className="h-8 w-24"
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      Umbral bajo:
                      <Input
                        type="number"
                        className="h-8 w-24"
                        value={form.low_stock_threshold}
                        onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {error && <div className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

// Keep `listProducts` referenced so it doesn't get tree-shaken from the module map (used elsewhere).
export const __ensureListProducts = listProducts;
