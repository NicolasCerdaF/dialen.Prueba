import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Send,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  FileText,
  User as UserIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getQuote,
  updateQuote,
  setQuoteStatus,
  listQuoteEvents,
  type Quote,
  type QuoteItem,
  type QuoteStatus,
} from "@/lib/quotes.functions";
import { listProducts, type Product } from "@/lib/catalog.functions";

export const Route = createFileRoute("/cotizaciones/$id")({
  head: () => ({ meta: [{ title: "Cotización — Dialen" }] }),
  component: QuoteDetailPage,
});

type EditableItem = Pick<
  QuoteItem,
  | "id"
  | "product_id"
  | "recommendation_id"
  | "name"
  | "sku"
  | "description"
  | "quantity"
  | "unit_price"
  | "unit_cost"
  | "discount_pct"
  | "tax_pct"
  | "position"
  | "ai_suggested"
>;

function money(n: number, cur = "USD") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n || 0);
}

function computeLine(it: EditableItem) {
  const gross = (it.quantity || 0) * (it.unit_price || 0);
  const afterDisc = gross * (1 - (it.discount_pct || 0) / 100);
  const tax = afterDisc * ((it.tax_pct || 0) / 100);
  return { line: afterDisc + tax, margin: afterDisc - (it.quantity || 0) * (it.unit_cost || 0) };
}

const STATUS_META: Record<QuoteStatus, { label: string; color: string; icon: any }> = {
  draft: { label: "Borrador", color: "bg-muted text-muted-foreground", icon: FileText },
  sent: { label: "Enviada", color: "bg-blue-500/15 text-blue-500", icon: Send },
  viewed: { label: "Vista", color: "bg-purple-500/15 text-purple-400", icon: Eye },
  accepted: { label: "Aceptada", color: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 },
  rejected: { label: "Rechazada", color: "bg-red-500/15 text-red-500", icon: XCircle },
  expired: { label: "Expirada", color: "bg-orange-500/15 text-orange-400", icon: Clock },
};

function QuoteDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getQuote);
  const update = useServerFn(updateQuote);
  const changeStatus = useServerFn(setQuoteStatus);
  const listEvents = useServerFn(listQuoteEvents);
  const listProds = useServerFn(listProducts);

  const { data: quote, refetch } = useQuery<Quote | null>({
    queryKey: ["quote", id],
    queryFn: () => get({ data: { id } }),
  });
  const { data: events = [] } = useQuery({
    queryKey: ["quote-events", id],
    queryFn: () => listEvents({ data: { quote_id: id } }),
    enabled: !!quote,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products-picker"],
    queryFn: () => listProds({ data: { active: true, limit: 500 } }),
  });

  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [globalTaxPct, setGlobalTaxPct] = useState<number>(0);

  useEffect(() => {
    if (!quote) return;
    setTitle(quote.title ?? "");
    setValidUntil(quote.valid_until ?? "");
    setNotes(quote.notes ?? "");
    setTerms(quote.terms ?? "");
    const qItems = quote.items ?? [];
    setGlobalTaxPct(Number(qItems[0]?.tax_pct ?? 0));
    setItems(
      qItems.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        recommendation_id: it.recommendation_id,
        name: it.name,
        sku: it.sku,
        description: it.description,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        unit_cost: Number(it.unit_cost),
        discount_pct: Number(it.discount_pct),
        tax_pct: Number(it.tax_pct),
        position: it.position,
        ai_suggested: it.ai_suggested,
      })),
    );
  }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let margin = 0;
    for (const it of items) {
      const gross = (it.quantity || 0) * (it.unit_price || 0);
      const disc = gross * ((it.discount_pct || 0) / 100);
      const afterDisc = gross - disc;
      subtotal += gross;
      discount += disc;
      margin += afterDisc - (it.quantity || 0) * (it.unit_cost || 0);
    }
    const taxable = subtotal - discount;
    const tax = taxable * ((globalTaxPct || 0) / 100);
    return { subtotal, discount, tax, margin, total: taxable + tax };
  }, [items, globalTaxPct]);


  const readonly = quote && quote.status !== "draft";

  function updateItem(idx: number, patch: Partial<EditableItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: "" as any,
        product_id: null,
        recommendation_id: null,
        name: "",
        sku: null,
        description: null,
        quantity: 1,
        unit_price: 0,
        unit_cost: 0,
        discount_pct: 0,
        tax_pct: 0,
        position: prev.length,
        ai_suggested: false,
      },
    ]);
  }
  function pickProduct(idx: number, productId: string) {
    const p = (products as Product[]).find((x) => x.id === productId);
    if (!p) return;
    updateItem(idx, {
      product_id: p.id,
      name: p.name,
      sku: p.sku,
      unit_price: Number(p.price ?? 0),
      unit_cost: Number(p.cost ?? 0),
    });
  }

  async function onSave() {
    if (!quote) return;
    setSaving(true);
    try {
      await update({
        data: {
          id: quote.id,
          title,
          valid_until: validUntil || null,
          notes: notes || null,
          terms: terms || null,
          items: items.map((it, i) => ({
            product_id: it.product_id ?? null,
            recommendation_id: it.recommendation_id ?? null,
            name: it.name,
            sku: it.sku ?? null,
            description: it.description ?? null,
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            unit_cost: Number(it.unit_cost) || 0,
            discount_pct: Number(it.discount_pct) || 0,
            tax_pct: Number(globalTaxPct) || 0,
            position: i,
            ai_suggested: it.ai_suggested,
          })),
        },
      });
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  async function onStatus(next: QuoteStatus) {
    if (!quote) return;
    await changeStatus({ data: { id: quote.id, status: next } });
    refetch();
  }

  if (!quote) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-muted-foreground">Cargando…</div>
      </AppShell>
    );
  }

  const meta = STATUS_META[quote.status];
  const StatusIcon = meta.icon;
  const shareUrl =
    typeof window !== "undefined" && quote.share_token
      ? `${window.location.origin}/cotizaciones/${quote.id}?t=${quote.share_token}`
      : "";

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b border-border/60 bg-card/40 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                onClick={() => navigate({ to: "/cotizaciones" })}
                className="mt-1 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-xl font-semibold tracking-tight">
                    {quote.number}
                  </h1>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", meta.color)}>
                    <StatusIcon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  {quote.ai_generated && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      <Sparkles className="h-3 w-3" />
                      IA
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <UserIcon className="h-3.5 w-3.5" />
                  <Link
                    to="/clientes/$id"
                    params={{ id: quote.customer_id }}
                    className="hover:text-foreground hover:underline"
                  >
                    {quote.customer?.name ?? "Cliente"}
                  </Link>
                  {quote.customer?.company && <span>· {quote.customer.company}</span>}
                  {quote.stage && <span>· etapa {quote.stage}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {quote.status === "draft" && (
                <>
                  <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {saving ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button size="sm" onClick={() => onStatus("sent")}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Enviar
                  </Button>
                </>
              )}
              {quote.status === "sent" && (
                <>
                  <Button variant="outline" size="sm" onClick={() => onStatus("viewed")}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Marcar vista
                  </Button>
                  <Button size="sm" onClick={() => onStatus("accepted")}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Aceptar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onStatus("rejected")}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Rechazar
                  </Button>
                </>
              )}
              {quote.status === "viewed" && (
                <>
                  <Button size="sm" onClick={() => onStatus("accepted")}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Aceptar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onStatus("rejected")}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Rechazar
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-[1fr_320px] overflow-hidden">
          <div className="overflow-auto p-6">
            <div className="mx-auto max-w-3xl space-y-6">
              {/* Meta fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Título</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Propuesta comercial"
                    disabled={!!readonly}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Válido hasta</label>
                  <Input
                    type="date"
                    value={validUntil ?? ""}
                    onChange={(e) => setValidUntil(e.target.value)}
                    disabled={!!readonly}
                  />
                </div>
              </div>

              {/* Line items */}
              <div className="rounded-lg border border-border/60 bg-card/30">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
                  <div className="text-sm font-medium">Líneas ({items.length})</div>
                  {!readonly && (
                    <Button size="sm" variant="outline" onClick={addItem}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Agregar
                    </Button>
                  )}
                </div>
                <div className="divide-y divide-border/60">
                  {items.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      Sin líneas. Agrega productos del catálogo.
                    </div>
                  )}
                  {items.map((it, idx) => {
                    const { line, margin } = computeLine(it);
                    return (
                      <div key={idx} className="p-3">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-6">
                            {!readonly ? (
                              <>
                                <select
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                  value={it.product_id ?? ""}
                                  onChange={(e) => pickProduct(idx, e.target.value)}
                                >
                                  <option value="">— Producto libre —</option>
                                  {(products as Product[]).map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} {p.sku ? `(${p.sku})` : ""}
                                    </option>
                                  ))}
                                </select>
                                <Input
                                  className="mt-1 h-8"
                                  value={it.name}
                                  onChange={(e) => updateItem(idx, { name: e.target.value })}
                                  placeholder="Nombre del ítem"
                                />
                              </>
                            ) : (
                              <div>
                                <div className="flex items-center gap-1 text-sm font-medium">
                                  {it.ai_suggested && <Sparkles className="h-3 w-3 text-primary" />}
                                  {it.name}
                                </div>
                                {it.sku && <div className="text-xs text-muted-foreground">SKU {it.sku}</div>}
                              </div>
                            )}
                          </div>
                          <div className="col-span-1">
                            <label className="text-[10px] text-muted-foreground">Cant.</label>
                            <Input
                              type="number"
                              className="h-8"
                              value={it.quantity}
                              disabled={!!readonly}
                              onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-muted-foreground">Precio</label>
                            <Input
                              type="number"
                              className="h-8"
                              value={it.unit_price}
                              disabled={!!readonly}
                              onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                            />
                          </div>
                          <div className="col-span-1">
                            <label className="text-[10px] text-muted-foreground">Desc %</label>
                            <Input
                              type="number"
                              className="h-8"
                              value={it.discount_pct}
                              disabled={!!readonly}
                              onChange={(e) => updateItem(idx, { discount_pct: Number(e.target.value) })}
                            />
                          </div>
                          <div className="col-span-2 flex items-end justify-end gap-2 pb-1">
                            <div className="text-right text-sm">
                              <div className="font-medium">{money(line, quote.currency)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                margen {money(margin, quote.currency)}
                              </div>
                            </div>
                            {!readonly && (
                              <button
                                onClick={() => removeItem(idx)}
                                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Totals */}
                <div className="border-t border-border/60 bg-secondary/20 p-4">
                  <div className="ml-auto max-w-xs space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-muted-foreground">IVA global %</label>
                      <Input
                        type="number"
                        className="h-8 w-24 text-right"
                        value={globalTaxPct}
                        disabled={!!readonly}
                        onChange={(e) => setGlobalTaxPct(Number(e.target.value))}
                      />
                    </div>
                    <Row label="Subtotal" value={money(totals.subtotal, quote.currency)} />
                    <Row label="Descuento" value={`- ${money(totals.discount, quote.currency)}`} />
                    <Row label={`IVA (${globalTaxPct || 0}%)`} value={money(totals.tax, quote.currency)} />
                    <Row label="Margen" value={money(totals.margin, quote.currency)} muted />
                    <div className="mt-2 flex justify-between border-t border-border/60 pt-2 text-base font-semibold">
                      <span>Total</span>
                      <span>{money(totals.total, quote.currency)}</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Notes / Terms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Notas para el cliente</label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!!readonly}
                    rows={4}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Términos y condiciones</label>
                  <Textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    disabled={!!readonly}
                    rows={4}
                  />
                </div>
              </div>

              {shareUrl && (
                <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs">
                  <div className="font-medium">Enlace público de la cotización</div>
                  <div className="mt-1 font-mono text-muted-foreground">{shareUrl}</div>
                  <button
                    className="mt-2 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                    onClick={() => navigator.clipboard.writeText(shareUrl)}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: timeline */}
          <aside className="overflow-auto border-l border-border/60 bg-card/20 p-4">
            <h3 className="text-sm font-semibold">Actividad</h3>
            <div className="mt-3 space-y-3">
              {(events as any[]).map((ev) => (
                <div key={ev.id} className="rounded-md border border-border/40 bg-background/50 p-2 text-xs">
                  <div className="font-medium capitalize">{ev.event_type.replace(/_/g, " ")}</div>
                  <div className="text-muted-foreground">
                    {new Date(ev.created_at).toLocaleString("es-ES")}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-xs text-muted-foreground">Sin actividad aún.</div>
              )}
            </div>

            {quote.ai_context?.reasons && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Contexto IA</h3>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {(quote.ai_context.reasons as any[]).map((r, i) => (
                    <div key={i} className="rounded bg-secondary/40 p-2">
                      <span className="text-primary">{r.reason_code ?? "—"}</span>
                      {" · score "}
                      {r.score?.toFixed?.(2) ?? "—"}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
