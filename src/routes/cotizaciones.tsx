import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listQuotes,
  getQuotesOverview,
  setQuoteStatus,
  deleteQuote,
  type Quote,
  type QuoteStatus,
} from "@/lib/quotes.functions";

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

const STATUS_META: Record<QuoteStatus, { label: string; color: string; icon: any }> = {
  draft: { label: "Borrador", color: "bg-muted text-muted-foreground", icon: FileText },
  sent: { label: "Enviada", color: "bg-blue-500/15 text-blue-500", icon: Send },
  viewed: { label: "Vista", color: "bg-purple-500/15 text-purple-400", icon: Eye },
  accepted: { label: "Aceptada", color: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 },
  rejected: { label: "Rechazada", color: "bg-red-500/15 text-red-500", icon: XCircle },
  expired: { label: "Expirada", color: "bg-orange-500/15 text-orange-400", icon: Clock },
};

function QuotesPage() {
  const list = useServerFn(listQuotes);
  const overview = useServerFn(getQuotesOverview);
  const changeStatus = useServerFn(setQuoteStatus);
  const del = useServerFn(deleteQuote);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "">("");

  const params = useMemo(() => {
    const p: any = {};
    if (search.trim()) p.search = search.trim();
    if (status) p.status = status;
    return p;
  }, [search, status]);

  const { data: quotes = [], refetch } = useQuery<Quote[]>({
    queryKey: ["quotes", params],
    queryFn: () => list({ data: params }),
  });
  const { data: kpis, refetch: refetchKpis } = useQuery({
    queryKey: ["quotes-overview"],
    queryFn: () => overview(),
  });

  async function onStatus(id: string, next: QuoteStatus) {
    await changeStatus({ data: { id, status: next } });
    refetch();
    refetchKpis();
  }
  async function onDelete(id: string) {
    if (!confirm("¿Eliminar esta cotización?")) return;
    await del({ data: { id } });
    refetch();
    refetchKpis();
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b border-border/60 bg-card/40 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">Cotizaciones</h1>
              <p className="text-sm text-muted-foreground">
                Propuestas comerciales trazables. IA + CRM + Catálogo → ingresos reales.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Pipeline" value={money(kpis?.pipelineValue ?? 0)} icon={<FileText className="h-4 w-4" />} />
            <Kpi label="Ganado" value={money(kpis?.wonValue ?? 0)} icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} />
            <Kpi label="Ticket promedio" value={money(kpis?.avgTicket ?? 0)} />
            <Kpi label="Tasa cierre" value={`${Math.round((kpis?.conversion ?? 0) * 100)}%`} />
            <Kpi label="Total" value={String(kpis?.total ?? 0)} />
          </div>
        </header>

        <div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-6 py-3">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número o título…"
              className="pl-8"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QuoteStatus | "")}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos los estados</option>
            {(Object.keys(STATUS_META) as QuoteStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">
            {quotes.length} cotización{quotes.length === 1 ? "" : "es"}
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {quotes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <div>
                <div className="font-medium">No hay cotizaciones aún</div>
                <div className="text-sm text-muted-foreground">
                  Crea una desde la ficha del cliente o la Bandeja Unificada.
                </div>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card/60 backdrop-blur">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Número</th>
                  <th className="py-3 font-medium">Cliente</th>
                  <th className="py-3 font-medium">Título</th>
                  <th className="py-3 font-medium">Estado</th>
                  <th className="py-3 text-right font-medium">Total</th>
                  <th className="py-3 font-medium">Creado</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const meta = STATUS_META[q.status];
                  const Icon = meta.icon;
                  return (
                    <tr key={q.id} className="border-t border-border/40 hover:bg-secondary/30">
                      <td className="px-6 py-3 font-mono text-xs">{q.number}</td>
                      <td className="py-3">
                        <div className="font-medium">{q.customer?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{q.customer?.company ?? ""}</div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {q.ai_generated && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                          <span>{q.title ?? "Sin título"}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", meta.color)}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 text-right font-medium">{money(q.total, q.currency)}</td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {new Date(q.created_at).toLocaleDateString("es-ES")}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link to="/cotizaciones/$id" params={{ id: q.id }}>
                            <Button size="sm" variant="ghost">Abrir</Button>
                          </Link>
                          {q.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => onStatus(q.id, "sent")}>
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {q.status === "sent" && (
                            <Button size="sm" variant="outline" onClick={() => onStatus(q.id, "accepted")}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => onDelete(q.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
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
