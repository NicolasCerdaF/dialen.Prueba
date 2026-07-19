import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Save,
  X as XIcon,
  ExternalLink,
  Sparkles,
  FileText,
  MessageSquare,
  Trash2,
  Send,
  Loader2,
  Calendar,
  AlertTriangle,
  History,
  StickyNote,
  Activity,
  RotateCw,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { cn } from "@/lib/utils";

import {
  getCustomer,
  updateCrmCustomer,
  addCustomerNote,
  getCustomerTimeline,
  deleteCustomers,
} from "@/lib/crm.functions";
import { orchestrateCustomer } from "@/lib/ai-orchestrator.functions";
import { listQuotes } from "@/lib/quotes.functions";
import { STAGES, normalizeStage } from "@/lib/pipeline";

type TeamMember = { id: string; full_name: string | null; email: string | null };

export function CustomerQuickPanel({
  customerId,
  team,
  onClose,
}: {
  customerId: string;
  team: TeamMember[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const get = useServerFn(getCustomer);
  const update = useServerFn(updateCrmCustomer);
  const del = useServerFn(deleteCustomers);
  const orchestrate = useServerFn(orchestrateCustomer);

  const { data: customer, refetch } = useQuery({
    queryKey: ["pipeline-customer", customerId],
    queryFn: () => get({ data: { id: customerId } }),
  });

  useRealtimeInvalidate({
    channel: `pipeline-panel-${customerId}`,
    tables: ["customers", "customer_events", "customer_notes", "quotes", "ai_insights"],
    invalidate: [
      ["pipeline-customer", customerId],
      ["pipeline-timeline", customerId],
      ["pipeline-quotes", customerId],
    ],
    filter: undefined,
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
    next_activity_at: "",
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
      next_activity_at: customer.next_activity_at
        ? new Date(customer.next_activity_at).toISOString().slice(0, 16)
        : "",
    });
  }, [customer]);

  const stageChanged =
    !!customer && form.stage !== normalizeStage(customer.stage);
  const [confirmStageOpen, setConfirmStageOpen] = useState(false);

  async function doSave() {
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
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
          next_activity_at: form.next_activity_at
            ? new Date(form.next_activity_at).toISOString()
            : null,
        },
      });
      toast.success("Cliente actualizado");
      qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
      qc.invalidateQueries({ queryKey: ["pipeline-aggregates"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function save() {
    if (stageChanged) {
      setConfirmStageOpen(true);
      return;
    }
    await doSave();
  }

  const [running, setRunning] = useState(false);
  async function rerunAI() {
    setRunning(true);
    try {
      await orchestrate({
        data: { customer_id: customerId, trigger: "stage_changed" },
      });
      toast.success("IA re-analizando cliente");
      setTimeout(() => refetch(), 800);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-5 py-4">
          <div className="min-w-0">
            <SheetTitle className="truncate text-base">
              {customer?.name ?? customer?.phone ?? "Ficha rápida"}
            </SheetTitle>
            {customer && (
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{customer.phone}</span>
                {customer.company && <span>· {customer.company}</span>}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </SheetHeader>

        {!customer ? (
          <div className="p-6 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <Tabs defaultValue="ficha" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mt-3 grid grid-cols-4">
              <TabsTrigger value="ficha">Ficha</TabsTrigger>
              <TabsTrigger value="quotes">
                <FileText className="mr-1 h-3.5 w-3.5" /> Cotizaciones
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity className="mr-1 h-3.5 w-3.5" /> Actividad
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles className="mr-1 h-3.5 w-3.5" /> IA
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ficha" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre">
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Empresa">
                  <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
                </Field>
                <Field label="Email">
                  <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
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
                      <option key={p} value={p}>{p}</option>
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
                      <option key={p} value={p}>{p}</option>
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
                      <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
                    ))}
                  </select>
                </Field>
                <Field label={<span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Próxima actividad</span>}>
                  <Input
                    type="datetime-local"
                    value={form.next_activity_at}
                    onChange={(e) => setForm((f) => ({ ...f, next_activity_at: e.target.value }))}
                  />
                </Field>
                <Field label="Etiquetas (coma)">
                  <Input
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="vip, mayorista"
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Notas comerciales">
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </Field>
              </div>

              {stageChanged && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Cambio manual de etapa: se registrará en el historial.
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <Button onClick={save} size="sm" className="gap-1">
                  <Save className="h-3.5 w-3.5" /> Guardar
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <Link to="/clientes/$id" params={{ id: customerId }}>
                    <ExternalLink className="h-3.5 w-3.5" /> Ficha completa
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="ml-auto gap-1 text-rose-500 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará el cliente y su historial. Si tiene cotizaciones o conversaciones asociadas, considera archivar en su lugar.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            await del({ data: { ids: [customerId] } });
                            toast.success("Cliente eliminado");
                            qc.invalidateQueries({ queryKey: ["pipeline-customers"] });
                            qc.invalidateQueries({ queryKey: ["pipeline-aggregates"] });
                            onClose();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TabsContent>

            <TabsContent value="quotes" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <QuotesTab customerId={customerId} />
            </TabsContent>

            <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ActivityTab customerId={customerId} team={team} />
            </TabsContent>

            <TabsContent value="ai" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <AITab customerId={customerId} running={running} onRerun={rerunAI} />
            </TabsContent>
          </Tabs>
        )}

        <AlertDialog open={confirmStageOpen} onOpenChange={setConfirmStageOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar cambio de etapa</AlertDialogTitle>
              <AlertDialogDescription>
                El Embudo suele mover etapas automáticamente. Un cambio manual quedará registrado en el historial y puede ser sobreescrito por la IA en el siguiente ciclo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  setConfirmStageOpen(false);
                  await doSave();
                }}
              >
                Sí, mover etapa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Sub-tabs
// ============================================================================

function QuotesTab({ customerId }: { customerId: string }) {
  const listFn = useServerFn(listQuotes);
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["pipeline-quotes", customerId],
    queryFn: () => listFn({ data: { customer_id: customerId, limit: 50 } }),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando cotizaciones…</div>;
  }
  if (!quotes.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm">Sin cotizaciones aún</p>
        <p className="text-xs text-muted-foreground">
          La IA sugerirá cotizaciones automáticamente cuando la conversación alcance suficiente intención de compra.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {quotes.map((q) => (
        <Link
          key={q.id}
          to="/cotizaciones/$id"
          params={{ id: q.id }}
          className="flex items-center gap-3 rounded-lg border bg-card/40 p-3 transition-colors hover:bg-card"
        >
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{q.number ?? "Sin número"}</span>
              <QuoteStatus status={q.status} />
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {q.title ?? "—"} · {q.currency} {Number(q.total ?? 0).toLocaleString()}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function QuoteStatus({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-blue-500/15 text-blue-500",
    viewed: "bg-indigo-500/15 text-indigo-500",
    negotiating: "bg-amber-500/15 text-amber-500",
    accepted: "bg-emerald-500/15 text-emerald-500",
    won: "bg-emerald-500/15 text-emerald-500",
    rejected: "bg-rose-500/15 text-rose-500",
    expired: "bg-rose-500/15 text-rose-500",
  };
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase",
        map[status ?? "draft"] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status ?? "draft"}
    </span>
  );
}

function ActivityTab({ customerId, team }: { customerId: string; team: TeamMember[] }) {
  const qc = useQueryClient();
  const tlFn = useServerFn(getCustomerTimeline);
  const noteFn = useServerFn(addCustomerNote);

  const { data: timeline = [], isLoading } = useQuery({
    queryKey: ["pipeline-timeline", customerId],
    queryFn: () => tlFn({ data: { customer_id: customerId, limit: 60 } }),
  });

  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: async () => noteFn({ data: { customer_id: customerId, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      toast.success("Nota agregada");
      qc.invalidateQueries({ queryKey: ["pipeline-timeline", customerId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const teamMap = useMemo(() => {
    const m: Record<string, string> = {};
    team.forEach((t) => (m[t.id] = t.full_name ?? t.email ?? ""));
    return m;
  }, [team]);

  return (
    <div className="space-y-4">
      <div>
        <Field label="Agregar nota interna">
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Le interesa el modelo X, va a decidir esta semana…"
            />
            <Button
              size="sm"
              onClick={() => addNote.mutate()}
              disabled={!note.trim() || addNote.isPending}
              className="self-end gap-1"
            >
              {addNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
        </Field>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando actividad…</div>
      ) : timeline.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sin actividad registrada aún.
        </div>
      ) : (
        <ol className="space-y-3">
          {timeline.map((t: any) => (
            <TimelineItem key={t.id} entry={t} teamMap={teamMap} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineItem({
  entry,
  teamMap,
}: {
  entry: {
    id: string;
    kind: string;
    event_type?: string;
    body?: string | null;
    payload?: any;
    actor_id?: string | null;
    created_at: string;
  };
  teamMap: Record<string, string>;
}) {
  const date = new Date(entry.created_at);
  const iconByKind: Record<string, React.ReactNode> = {
    customer_note: <StickyNote className="h-3.5 w-3.5" />,
    conversation_note: <StickyNote className="h-3.5 w-3.5" />,
    customer_event: <History className="h-3.5 w-3.5" />,
    conversation_event: <MessageSquare className="h-3.5 w-3.5" />,
  };
  const icon = iconByKind[entry.kind] ?? <History className="h-3.5 w-3.5" />;
  const title = entry.event_type ?? entry.kind.replace("_", " ");
  const changes = entry?.payload?.changes as
    | Record<string, { from: unknown; to: unknown }>
    | undefined;

  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="rounded-lg border bg-card/40 p-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium capitalize">{title}</span>
          <time>{date.toLocaleString()}</time>
        </div>
        {entry.body && <p className="mt-1 text-sm">{entry.body}</p>}
        {changes && (
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {Object.entries(changes).map(([k, v]) => (
              <div key={k}>
                <span className="font-medium text-foreground">{k}:</span>{" "}
                <span className="line-through opacity-60">{String(v.from ?? "—")}</span>
                {" → "}
                <span>{String(v.to ?? "—")}</span>
              </div>
            ))}
          </div>
        )}
        {entry.actor_id && teamMap[entry.actor_id] && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            por {teamMap[entry.actor_id]}
          </div>
        )}
      </div>
    </li>
  );
}

function AITab({
  customerId,
  running,
  onRerun,
}: {
  customerId: string;
  running: boolean;
  onRerun: () => void;
}) {
  const { data: insight, isLoading } = useQuery({
    queryKey: ["pipeline-ai-insight", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_insights")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();
      return data;
    },
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ["pipeline-ai-suggestions", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_suggestions")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const prob = insight?.probability != null ? Math.round(Number(insight.probability) * 100) : null;
  const churn = insight?.churn_risk != null ? Math.round(Number(insight.churn_risk) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Diagnóstico comercial IA</div>
        <Button size="sm" variant="outline" onClick={onRerun} disabled={running} className="gap-1">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
          Re-analizar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando análisis…</div>
      ) : !insight ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm">La IA aún no analizó este cliente</p>
          <p className="text-xs text-muted-foreground">
            Presiona «Re-analizar» o espera al próximo mensaje entrante.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Probabilidad de cierre" value={prob != null ? `${prob}%` : "—"} tone={prob && prob >= 70 ? "hot" : prob && prob >= 40 ? "warm" : "cold"} />
            <Metric label="Riesgo de pérdida" value={churn != null ? `${churn}%` : "—"} tone={churn && churn >= 60 ? "risk" : "cold"} />
            <Metric label="Intención" value={insight.intent ?? "—"} tone="neutral" />
            <Metric label="Sentimiento" value={insight.sentiment ?? "—"} tone="neutral" />
          </div>
          {insight.next_best_action && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Próxima mejor acción
              </div>
              <p className="text-sm">{insight.next_best_action}</p>
            </div>
          )}
        </>
      )}

      {suggestions.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Sugerencias recientes
          </div>
          <div className="space-y-2">
            {suggestions.map((s: any) => (
              <div key={s.id} className="rounded-md border bg-card/40 p-2.5 text-sm">
                <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[9px]">
                    {s.suggestion_type ?? "reply"}
                  </Badge>
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap">{s.text ?? s.body ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "hot" | "warm" | "cold" | "risk" | "neutral";
}) {
  const styles = {
    hot: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
    warm: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    cold: "border-border bg-muted/30 text-foreground",
    risk: "border-rose-500/40 bg-rose-500/10 text-rose-500",
    neutral: "border-border bg-muted/30 text-foreground",
  } as const;
  return (
    <div className={cn("rounded-md border px-3 py-2", styles[tone])}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums capitalize">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
