import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
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
  ExternalLink,
  FileText,
  ShoppingCart,
  Calendar,
  Zap,
  Megaphone,
  BarChart3,
  Save,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  listCustomers,
  getCustomer,
  updateCrmCustomer,
  listTeamMembers,
  type CrmCustomer,
} from "@/lib/crm.functions";
import { orchestrateCustomer } from "@/lib/ai-orchestrator.functions";
import { STAGES, normalizeStage, stageStyle, getStage, STAGNANT_DAYS_BY_STAGE } from "@/lib/pipeline";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embudo")({
  head: () => ({
    meta: [
      { title: "Embudo de Ventas — Dialen" },
      { name: "description", content: "Pipeline comercial Kanban conectado al CRM en tiempo real." },
    ],
  }),
  component: EmbudoPage,
});

// ============ Types ============
type UnreadMap = Record<string, number>;

function EmbudoPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCustomers);
  const teamFn = useServerFn(listTeamMembers);
  const update = useServerFn(updateCrmCustomer);
  const orchestrate = useServerFn(orchestrateCustomer);

  const { data: customers = [], refetch } = useQuery({
    queryKey: ["pipeline-customers"],
    queryFn: () => listFn({ data: { limit: 500, sort: "last_interaction" } }),
  });

  const { data: team = [] } = useQuery({
    queryKey: ["pipeline-team"],
    queryFn: () => teamFn(),
  });

  // Unread + conversation aggregate per customer, subscribed to realtime.
  const [unread, setUnread] = useState<UnreadMap>({});
  const [insights, setInsights] = useState<Record<string, { probability: number | null; intent: string | null; churn_risk: number | null }>>({});
  const [topReco, setTopReco] = useState<Record<string, { name: string; price: number; currency: string; reason_code: string | null } | undefined>>({});
  useEffect(() => {
    let cancel = false;
    async function load() {
      const [convosRes, insRes, recoRes] = await Promise.all([
        supabase.from("conversations").select("customer_id, unread_count"),
        supabase.from("ai_insights").select("customer_id, probability, intent, churn_risk"),
        supabase
          .from("product_recommendations")
          .select("customer_id, score, reason_code, product:products(name, price, currency)")
          .eq("status", "pending")
          .order("score", { ascending: false })
          .limit(500),
      ]);
      if (cancel) return;
      const map: UnreadMap = {};
      for (const c of (convosRes.data ?? []) as { customer_id: string | null; unread_count: number | null }[]) {
        if (!c.customer_id) continue;
        map[c.customer_id] = (map[c.customer_id] ?? 0) + (c.unread_count ?? 0);
      }
      setUnread(map);
      const imap: typeof insights = {};
      for (const i of (insRes.data ?? []) as any[]) {
        imap[i.customer_id] = { probability: i.probability, intent: i.intent, churn_risk: i.churn_risk };
      }
      setInsights(imap);
      const rmap: typeof topReco = {};
      for (const r of (recoRes.data ?? []) as any[]) {
        if (!r.customer_id || rmap[r.customer_id] || !r.product) continue;
        rmap[r.customer_id] = {
          name: r.product.name,
          price: Number(r.product.price ?? 0),
          currency: r.product.currency ?? "USD",
          reason_code: r.reason_code ?? null,
        };
      }
      setTopReco(rmap);
    }
    load();
    const ch = supabase
      .channel("pipeline-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_insights" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_recommendations" }, () => load())
      .subscribe();
    return () => {
      cancel = true;
      supabase.removeChannel(ch);
    };
  }, [refetch]);

  // Group customers by normalized stage
  const grouped = useMemo(() => {
    const g: Record<string, CrmCustomer[]> = {};
    for (const s of STAGES) g[s.key] = [];
    for (const c of customers) {
      const k = normalizeStage(c.stage);
      (g[k] ??= []).push(c);
    }
    return g;
  }, [customers]);

  // Top KPIs
  const kpis = useMemo(() => {
    const open = customers.filter((c) => {
      const k = normalizeStage(c.stage);
      const s = getStage(k);
      return s?.kind === "open";
    });
    const won = customers.filter((c) => normalizeStage(c.stage) === "ganado");
    const lost = customers.filter((c) => normalizeStage(c.stage) === "perdido");
    const pipelineValue = open.reduce((sum, c) => sum + Number(c.estimated_value ?? 0), 0);
    const wonValue = won.reduce((sum, c) => sum + Number(c.estimated_value ?? 0), 0);
    const decided = won.length + lost.length;
    const conversion = decided ? (won.length / decided) * 100 : 0;
    const avgTicket = won.length ? wonValue / won.length : 0;
    return { open: open.length, won: won.length, lost: lost.length, pipelineValue, wonValue, conversion, avgTicket };
  }, [customers]);

  // Embudo = espejo del CRM. El stage se mueve solo por eventos comerciales
  // (cotización aceptada, mensajes, orquestador). Sin drag & drop.


  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-semibold">Embudo de Ventas</h1>
              <p className="text-xs text-muted-foreground">
                Vista comercial del CRM · Arrastra tarjetas para actualizar la etapa en tiempo real
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-500">
              <Sparkles className="h-3.5 w-3.5" />
              <span>IA en modo automático · Recomendaciones vivas por etapa</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Kpi icon={DollarSign} label="Pipeline activo" value={fmtMoney(kpis.pipelineValue)} accent="text-emerald-400" />
            <Kpi icon={Target} label="Oportunidades" value={String(kpis.open)} />
            <Kpi icon={Trophy} label="Ganadas" value={String(kpis.won)} accent="text-emerald-400" />
            <Kpi icon={XCircle} label="Perdidas" value={String(kpis.lost)} accent="text-rose-400" />
            <Kpi icon={Percent} label="Conversión" value={`${kpis.conversion.toFixed(1)}%`} />
            <Kpi icon={TrendingUp} label="Ticket prom." value={fmtMoney(kpis.avgTicket)} />
          </div>
        </header>

        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-3 p-4" style={{ minWidth: STAGES.length * 300 }}>
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
                  className={cn(
                    "flex h-full w-[290px] shrink-0 flex-col rounded-xl border bg-card/40 transition-colors",
                    dragOver === stage.key && "ring-2 ring-primary/60 bg-primary/5",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(stage.key);
                  }}
                  onDragLeave={() => setDragOver((v) => (v === stage.key ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    if (dragId) moveTo(dragId, stage.key);
                    setDragId(null);
                  }}
                >
                  <div className={cn("h-1 rounded-t-xl", style.bar)} />
                  <div className="border-b p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{stage.label}</span>
                        <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px]", style.badge)}>
                          {items.length}
                        </span>
                      </div>
                      {stagnantCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
                          title={`${stagnantCount} estancadas > ${stagnantThreshold}d`}
                        >
                          <AlertTriangle className="h-3 w-3" /> {stagnantCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{fmtMoney(total)}</span>
                      {convRate !== null && (
                        <span title="Conversión a la siguiente etapa">→ {convRate.toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {items.length === 0 ? (
                      <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                        Sin clientes en esta etapa
                      </div>
                    ) : (
                      items.map((c) => (
                        <CustomerCard
                          key={c.id}
                          customer={c}
                          team={team}
                          unread={unread[c.id] ?? 0}
                          insight={insights[c.id]}
                          topReco={topReco[c.id]}
                          onOpen={() => setOpenCustomerId(c.id)}
                          onDragStart={() => setDragId(c.id)}
                          onDragEnd={() => setDragId(null)}
                          stagnantThreshold={stagnantThreshold}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {openCustomerId && (
        <CustomerQuickPanel
          customerId={openCustomerId}
          team={team}
          onClose={() => setOpenCustomerId(null)}
        />
      )}
    </AppShell>
  );
}

// ============ Card ============
function CustomerCard({
  customer,
  team,
  unread,
  insight,
  topReco,
  onOpen,
  onDragStart,
  onDragEnd,
  stagnantThreshold,
}: {
  customer: CrmCustomer;
  team: { id: string; full_name: string | null; email: string | null }[];
  unread: number;
  insight?: { probability: number | null; intent: string | null; churn_risk: number | null };
  topReco?: { name: string; price: number; currency: string; reason_code: string | null };
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  stagnantThreshold?: number;
}) {
  const initials = (customer.name ?? customer.phone).slice(0, 2).toUpperCase();
  const owner = team.find((t) => t.id === customer.assignee_id);
  const daysInStage = daysSince(customer.updated_at);
  const stagnant = stagnantThreshold ? daysInStage > stagnantThreshold : false;
  const priority = customer.priority ?? "normal";
  const isVip = (customer.tags ?? []).includes("vip");
  const hot =
    insight &&
    (insight.intent === "high_intent" ||
      insight.intent === "ready_to_close" ||
      (insight.probability != null && Number(insight.probability) >= 0.7));
  const atRisk = insight && insight.churn_risk != null && Number(insight.churn_risk) >= 0.6;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "group mb-2 cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md",
        stagnant && "border-amber-500/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-[10px] font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-1 truncate text-sm font-medium">
              <span className="truncate">{customer.name ?? customer.phone}</span>
              {isVip && <Star className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />}
              {hot && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600"
                  title={`IA: ${insight?.intent ?? "hot"}${insight?.probability != null ? ` · ${Math.round(Number(insight.probability) * 100)}%` : ""}`}
                >
                  <Sparkles className="h-2.5 w-2.5" /> Hot
                </span>
              )}
              {atRisk && !hot && (
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600"
                  title={`IA: riesgo ${Math.round(Number(insight?.churn_risk) * 100)}%`}
                >
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
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] capitalize",
              priority === "urgent" && "bg-rose-500/10 text-rose-300",
              priority === "high" && "bg-orange-500/10 text-orange-300",
              priority === "low" && "bg-muted text-muted-foreground",
            )}
          >
            {priority}
          </span>
        )}
      </div>

      {(customer.tags ?? []).filter((t) => t !== "vip").slice(0, 3).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(customer.tags ?? [])
            .filter((t) => t !== "vip")
            .slice(0, 3)
            .map((t) => (
              <span key={t} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]">
                {t}
              </span>
            ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          {customer.estimated_value ? fmtMoney(Number(customer.estimated_value)) : "—"}
        </span>
        <span className={cn("inline-flex items-center gap-1", stagnant && "text-amber-400")}>
          <Clock className="h-3 w-3" /> {daysInStage}d
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 truncate">
          <User className="h-3 w-3" />
          <span className="truncate">
            {owner ? owner.full_name ?? owner.email : "Sin responsable"}
          </span>
        </span>
        {unread > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-primary">
            <MessageSquare className="h-3 w-3" /> {unread}
          </span>
        )}
      </div>

      {topReco ? (
        <div
          className="mt-2 flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10px]"
          title={topReco.reason_code ?? undefined}
        >
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
      )}
    </div>
  );
}

// ============ KPI ============
function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={cn("mt-0.5 font-display text-lg font-semibold", accent)}>{value}</div>
    </div>
  );
}

// ============ Quick side panel ============
function CustomerQuickPanel({
  customerId,
  team,
  onClose,
}: {
  customerId: string;
  team: { id: string; full_name: string | null; email: string | null }[];
  onClose: () => void;
}) {
  const get = useServerFn(getCustomer);
  const update = useServerFn(updateCrmCustomer);
  const qc = useQueryClient();

  const { data: customer, refetch } = useQuery({
    queryKey: ["pipeline-customer", customerId],
    queryFn: () => get({ data: { id: customerId } }),
  });

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    stage: "nuevo_lead",
    priority: "normal",
    status: "active",
    assignee_id: "",
    estimated_value: "",
    tags: "",
    notes: "",
  });
  const initRef = useRef<string | null>(null);
  useEffect(() => {
    if (!customer) return;
    if (initRef.current === customer.id) return;
    initRef.current = customer.id;
    setForm({
      name: customer.name ?? "",
      company: customer.company ?? "",
      email: customer.email ?? "",
      stage: normalizeStage(customer.stage),
      priority: customer.priority ?? "normal",
      status: customer.status ?? "active",
      assignee_id: customer.assignee_id ?? "",
      estimated_value: customer.estimated_value?.toString() ?? "",
      tags: (customer.tags ?? []).join(", "),
      notes: customer.notes ?? "",
    });
  }, [customer]);

  // Realtime for this specific customer
  useEffect(() => {
    const ch = supabase
      .channel(`pipeline-panel-${customerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [customerId, refetch]);

  async function save() {
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await update({
        data: {
          id: customerId,
          name: form.name || null,
          company: form.company || null,
          email: form.email || null,
          stage: form.stage,
          priority: form.priority,
          status: form.status,
          assignee_id: form.assignee_id || null,
          estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
          tags,
          notes: form.notes || null,
        },
      });
      toast.success("Cliente actualizado");
      qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader className="flex-row items-center justify-between space-y-0">
          <SheetTitle className="truncate">
            {customer?.name ?? customer?.phone ?? "Ficha rápida"}
          </SheetTitle>
        </SheetHeader>

        {!customer ? (
          <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <Field label="Empresa">
                <Input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Field>
              <Field label="Valor estimado">
                <Input
                  type="number"
                  value={form.estimated_value}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))}
                />
              </Field>
              <Field label="Etapa">
                <select
                  value={form.stage}
                  onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridad">
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {["active", "inactive", "archived"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Responsable">
                <select
                  value={form.assignee_id}
                  onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Sin responsable</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name ?? m.email}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Etiquetas (separadas por coma)">
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="vip, mayorista, seguimiento"
              />
            </Field>
            <Field label="Notas comerciales">
              <Textarea
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button onClick={save} size="sm" className="gap-1">
                <Save className="h-3.5 w-3.5" /> Guardar cambios
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1">
                <Link to="/clientes/$id" params={{ id: customerId }}>
                  <ExternalLink className="h-3.5 w-3.5" /> Ficha completa
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto gap-1">
                <XIcon className="h-3.5 w-3.5" /> Cerrar
              </Button>
            </div>

            {/* AI section — próximamente */}
            <SoonBlock
              icon={Sparkles}
              title="IA comercial"
              items={[
                "Sugerencia automática de siguiente etapa",
                "Probabilidad de cierre estimada",
                "Detección de riesgos y objeciones",
                "Recomendación de próximo paso al vendedor",
              ]}
            />

            {/* Integrations placeholders */}
            <div className="grid grid-cols-2 gap-2">
              <SoonPill icon={FileText} label="Cotizaciones" />
              <SoonPill icon={ShoppingCart} label="Pedidos" />
              <SoonPill icon={Calendar} label="Agenda" />
              <SoonPill icon={Zap} label="Automatizaciones" />
              <SoonPill icon={Megaphone} label="Campañas" />
              <SoonPill icon={BarChart3} label="Reportes" />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function SoonBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Sparkles;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" /> {title}
        <span className="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
          Próximamente
        </span>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {items.map((t) => (
          <li key={t}>· {t}</li>
        ))}
      </ul>
    </div>
  );
}

function SoonPill({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span className="flex-1">{label}</span>
      <span className="text-[9px] uppercase tracking-wider">Pronto</span>
    </div>
  );
}

// ============ Helpers ============
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
