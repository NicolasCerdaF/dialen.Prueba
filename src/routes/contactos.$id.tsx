import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Sparkles,
  MessageSquare,
  FileText,
  Package,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Tag as TagIcon,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getCustomer, getCustomerTimeline } from "@/lib/crm.functions";
import { getContactAiContext } from "@/lib/contacts.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contactos/$id")({
  head: () => ({ meta: [{ title: "Contacto — Dialen" }] }),
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getC = useServerFn(getCustomer);
  const getCtx = useServerFn(getContactAiContext);
  const getTimeline = useServerFn(getCustomerTimeline);

  const { data: customer, refetch: refetchC } = useQuery({
    queryKey: ["contact-customer", id],
    queryFn: () => getC({ data: { id } }),
  });
  const { data: ctx, refetch: refetchCtx } = useQuery({
    queryKey: ["contact-ai-ctx", id],
    queryFn: () => getCtx({ data: { id } }),
  });
  const { data: timeline = [], refetch: refetchTL } = useQuery({
    queryKey: ["contact-timeline", id],
    queryFn: () => getTimeline({ data: { customer_id: id, limit: 40 } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`contact-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `id=eq.${id}` },
        () => refetchC(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_suggestions" },
        () => refetchCtx(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          refetchCtx();
          refetchTL();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, refetchC, refetchCtx, refetchTL]);

  const isClient = useMemo(
    () => (ctx?.quotes ?? []).some((q) => q.status === "accepted" || q.status === "aceptada" || q.status === "won"),
    [ctx],
  );

  const initials = ((customer?.name ?? customer?.phone ?? "?") as string)
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/contactos" })}
              className="rounded-md p-1.5 hover:bg-secondary"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold",
                isClient ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary",
              )}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-display text-xl font-semibold tracking-tight">
                  {customer?.name ?? customer?.phone ?? "Contacto"}
                </h1>
                {isClient && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                    Cliente
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {customer?.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {customer.phone}
                  </span>
                )}
                {customer?.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {customer.email}
                  </span>
                )}
                {customer?.company && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {customer.company}
                  </span>
                )}
                {customer?.channel && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase">
                    {customer.channel}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ctx?.conversationId ? (
                <Link
                  to="/conversaciones"
                  hash={`conv=${ctx.conversationId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Abrir conversación
                </Link>
              ) : null}
              <Link
                to="/clientes/$id"
                params={{ id }}
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Ficha completa
              </Link>
            </div>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-6 lg:grid-cols-3">
          {/* Left column — AI memory */}
          <div className="space-y-4 lg:col-span-2">
            {/* AI Summary */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-2 flex items-center gap-2">
                <div className="ai-dot h-2 w-2 rounded-full" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ai)]">
                  Resumen IA
                </span>
                {ctx?.intentLabel && (
                  <span className="rounded bg-[color-mix(in_oklab,var(--ai)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-medium capitalize text-[color:var(--ai)]">
                    {ctx.intentLabel}
                  </span>
                )}
                {ctx?.probability != null && (
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    Prob. cierre {Math.round(ctx.probability * (ctx.probability <= 1 ? 100 : 1))}%
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed">
                {ctx?.aiSummary
                  ? ctx.aiSummary
                  : "Todavía no hay suficiente contexto. Cuando la persona interactúe por WhatsApp, la IA generará un resumen automático de intereses, necesidades y siguiente acción."}
              </p>
              {ctx?.nextRecommendedAction && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-[color-mix(in_oklab,var(--ai)_25%,transparent)] bg-[color-mix(in_oklab,var(--ai)_6%,transparent)] p-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-[color:var(--ai)]" />
                  <div className="text-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ai)]">
                      Próxima acción sugerida
                    </div>
                    <div className="mt-0.5">{ctx.nextRecommendedAction}</div>
                  </div>
                </div>
              )}
            </section>

            {/* Products of interest */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Productos de interés</h2>
                <span className="text-xs text-muted-foreground">
                  {ctx?.productsOfInterest.length ?? 0}
                </span>
              </div>
              {ctx && ctx.productsOfInterest.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ctx.productsOfInterest.map((p) => (
                    <li
                      key={(p.productId ?? p.name) + p.source}
                      className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <span className="truncate">{p.name}</span>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 uppercase",
                            p.source === "quote"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-[color-mix(in_oklab,var(--ai)_12%,transparent)] text-[color:var(--ai)]",
                          )}
                        >
                          {p.source === "quote" ? "Cotizado" : "Consultado"}
                        </span>
                        <span>×{p.mentions}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin productos detectados aún. Cuando la conversación mencione productos del catálogo o se genere una cotización, aparecerán aquí.
                </p>
              )}
            </section>

            {/* Timeline */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Historial de interacción</h2>
              </div>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
              ) : (
                <ol className="relative space-y-3 border-l pl-4">
                  {timeline.slice(0, 20).map((t) => (
                    <li key={t.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm">
                        {t.kind === "customer_note" || t.kind === "conversation_note"
                          ? t.body
                          : t.event_type ?? t.kind}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* Right column — signals & activity */}
          <div className="space-y-4">
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold">Señales</h2>
              <dl className="space-y-2 text-sm">
                <Row label="Conversaciones" value={String(ctx?.totalConversations ?? 0)} icon={MessageSquare} />
                <Row label="Mensajes" value={String(ctx?.totalMessages ?? 0)} icon={MessageSquare} />
                <Row label="Cotizaciones" value={String(ctx?.quotes.length ?? 0)} icon={FileText} />
                <Row
                  label="Última interacción"
                  value={
                    customer?.last_interaction_at
                      ? new Date(customer.last_interaction_at).toLocaleDateString()
                      : "—"
                  }
                  icon={Clock}
                />
                <Row
                  label="Valor estimado"
                  value={
                    customer?.estimated_value != null
                      ? new Intl.NumberFormat("es", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        }).format(Number(customer.estimated_value))
                      : "—"
                  }
                  icon={Star}
                />
              </dl>
              {(customer?.tags ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(customer?.tags ?? []).map((t: string) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]"
                    >
                      <TagIcon className="h-2.5 w-2.5" />
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Latest AI suggestions */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[color:var(--ai)]" />
                <h2 className="text-sm font-semibold">Últimas recomendaciones IA</h2>
              </div>
              {ctx && ctx.suggestions.length > 0 ? (
                <ul className="space-y-2">
                  {ctx.suggestions.slice(0, 5).map((s) => (
                    <li key={s.id} className="rounded-lg border bg-background p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="capitalize text-[color:var(--ai)]">
                          {s.intent ?? s.agentType ?? "sugerencia"}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {s.nextStep && <div className="font-medium">{s.nextStep}</div>}
                      {s.text && (
                        <div className="mt-1 line-clamp-3 text-muted-foreground">{s.text}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin recomendaciones aún.</p>
              )}
            </section>

            {/* Quotes */}
            <section className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Cotizaciones</h2>
              </div>
              {ctx && ctx.quotes.length > 0 ? (
                <ul className="space-y-2">
                  {ctx.quotes.slice(0, 6).map((q) => (
                    <li key={q.id}>
                      <Link
                        to="/cotizaciones/$id"
                        params={{ id: q.id }}
                        className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs hover:bg-secondary"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {q.number ?? q.title ?? "Cotización"}
                          </div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            {q.status}
                          </div>
                        </div>
                        {q.total != null && (
                          <span className="font-mono">
                            {new Intl.NumberFormat("es", {
                              style: "currency",
                              currency: q.currency ?? "USD",
                              maximumFractionDigits: 0,
                            }).format(q.total)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Sin cotizaciones aún.</p>
                  {ctx?.conversationId && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/conversaciones" hash={`conv=${ctx.conversationId}`}>
                        Crear desde conversación
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
