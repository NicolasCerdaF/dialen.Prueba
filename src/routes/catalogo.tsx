import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  X,
  ImageIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  listProducts,
  upsertProduct,
  deleteProduct,
  getCatalogOverview,
  type Product,
} from "@/lib/catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/catalogo")({
  head: () => ({ meta: [{ title: "Catálogo — Dialen" }] }),
  component: CatalogPage,
});

function money(n: number, cur = "USD") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n || 0);
}

function CatalogPage() {
  const list = useServerFn(listProducts);
  const overview = useServerFn(getCatalogOverview);
  const del = useServerFn(deleteProduct);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const params = useMemo(() => {
    const p: any = {};
    if (search.trim()) p.search = search.trim();
    if (category) p.category = category;
    if (activeOnly) p.active = true;
    return p;
  }, [search, category, activeOnly]);

  const { data: products = [], refetch } = useQuery({
    queryKey: ["catalog-products", params],
    queryFn: () => list({ data: params }),
  });

  const { data: kpis, refetch: refetchKpis } = useQuery({
    queryKey: ["catalog-overview"],
    queryFn: () => overview(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("catalog-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        refetch();
        refetchKpis();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_customers" }, () => refetchKpis())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_recommendations" }, () => refetchKpis())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refetch, refetchKpis]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return [...set].sort();
  }, [products]);

  async function onDelete(p: Product) {
    if (!confirm(`Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    await del({ data: { id: p.id } });
    qc.invalidateQueries({ queryKey: ["catalog-products"] });
    qc.invalidateQueries({ queryKey: ["catalog-overview"] });
  }

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
              Fuente única de productos. Conectado con Bandeja, CRM, Embudo, IA y Automatizaciones.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo producto
          </Button>
        </header>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* KPIs */}
          <div className="grid gap-3 md:grid-cols-5">
            <Kpi icon={Boxes} label="Productos activos" value={`${kpis?.totals.active ?? 0}/${kpis?.totals.products ?? 0}`} />
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

          {/* Insights */}
          {kpis && (
            <div className="grid gap-3 md:grid-cols-3">
              <InsightList title="Más vendidos" icon={TrendingUp} rows={kpis.topSelling} format={(p: any) => `${p.purchased} vendidos`} />
              <InsightList title="Más pipeline" icon={DollarSign} rows={kpis.topPipeline} format={(p: any) => money(p.pipeline_value)} />
              <InsightList title="Más recomendados por IA" icon={Sparkles} rows={kpis.topRecommended} format={(p: any) => `${p.reco_count} recos`} />
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU o descripción…"
                className="pl-9"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
              Solo activos
            </label>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Producto</th>
                  <th className="px-4 py-2 text-left">Categoría</th>
                  <th className="px-4 py-2 text-right">Precio</th>
                  <th className="px-4 py-2 text-right">Margen</th>
                  <th className="px-4 py-2 text-right">Stock</th>
                  <th className="px-4 py-2 text-center">IA</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      Sin productos aún. Crea el primero para empezar a conectar el catálogo con conversaciones y ventas.
                    </td>
                  </tr>
                )}
                {products.map((p) => {
                  const margin = Number(p.price) - Number(p.cost);
                  const pct = p.price > 0 ? (margin / Number(p.price)) * 100 : 0;
                  const low = p.track_stock && typeof p.stock === "number" && typeof p.low_stock_threshold === "number" && p.stock <= p.low_stock_threshold;
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.name}</span>
                              {!p.active && <span className="rounded bg-muted px-1.5 text-[10px] uppercase text-muted-foreground">Inactivo</span>}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.sku ?? "sin SKU"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.category ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">{money(Number(p.price), p.currency)}</td>
                      <td className={cn("px-4 py-3 text-right font-mono", pct >= 30 ? "text-emerald-600" : pct <= 0 ? "text-red-600" : "")}>
                        {pct.toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.track_stock ? (
                          <span className={cn("font-mono", low && "text-amber-600 font-semibold")}>
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
                          <span className="text-muted-foreground text-xs">Pausada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditing(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => onDelete(p)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
              qc.invalidateQueries({ queryKey: ["catalog-products"] });
              qc.invalidateQueries({ queryKey: ["catalog-overview"] });
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

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
}: {
  title: string;
  icon: any;
  rows: any[];
  format: (row: any) => string;
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
              <span className="truncate pr-2">{r.name}</span>
              <span className="text-xs text-muted-foreground">{format(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          price: Number(form.price) || 0,
          cost: Number(form.cost) || 0,
          currency: form.currency.trim().toUpperCase() || "USD",
          track_stock: form.track_stock,
          stock: form.track_stock ? Number(form.stock) || 0 : null,
          low_stock_threshold: form.track_stock ? Number(form.low_stock_threshold) || 0 : null,
          images: [],
          variants: [],
          custom_fields: {},
          ai_recommendable: form.ai_recommendable,
          active: form.active,
        } as any,
      });
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
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Consultoría premium" />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-001" />
          </Field>
          <Field label="Categoría">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Servicios" />
          </Field>
          <Field label="Etiquetas (separadas por coma)">
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="destacado, upsell" />
          </Field>
          <Field label="Precio">
            <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
          </Field>
          <Field label="Costo">
            <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
          </Field>
          <Field label="Moneda">
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Descripción">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-6 rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.track_stock} onCheckedChange={(v) => setForm({ ...form, track_stock: v })} />
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
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.ai_recommendable} onCheckedChange={(v) => setForm({ ...form, ai_recommendable: v })} />
            IA puede recomendarlo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            Activo
          </label>
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
