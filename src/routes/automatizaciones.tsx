import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap, Play, Pause, Copy, Trash2, Plus, Download, Upload, Save,
  AlertCircle, CheckCircle2, Clock, Activity, X as XIcon,
  Sparkles, ArrowRight, Settings2, History, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  listAutomations, getAutomation, createAutomation, saveAutomation,
  setAutomationStatus, duplicateAutomation, deleteAutomation,
  importAutomation, listAutomationRuns, runAutomationForCustomer,
  type Automation, type AutomationRun,
} from "@/lib/automations.functions";
import {
  TRIGGERS, CONDITIONS, ACTIONS,
  TRIGGER_BY_TYPE, CONDITION_BY_TYPE, ACTION_BY_TYPE,
  type FlowDefinition, type FlowCondition, type FlowAction, type FieldSpec,
} from "@/lib/automations/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/automatizaciones")({
  head: () => ({
    meta: [
      { title: "Automatizaciones — Dialen" },
      { name: "description", content: "Motor de flujos que orquesta CRM, Bandeja, Embudo e IA." },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAutomations);
  const create = useServerFn(createAutomation);
  const setStatus = useServerFn(setAutomationStatus);
  const duplicate = useServerFn(duplicateAutomation);
  const del = useServerFn(deleteAutomation);
  const imp = useServerFn(importAutomation);

  const { data: automations = [], refetch } = useQuery({
    queryKey: ["automations"],
    queryFn: () => listFn(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("automations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "automations" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"recipes" | "builder">("recipes");


  const kpis = useMemo(() => {
    const active = automations.filter((a) => a.status === "active").length;
    const paused = automations.filter((a) => a.status === "paused").length;
    const totalRuns = automations.reduce((s, a) => s + (a.run_count ?? 0), 0);
    const totalErrors = automations.reduce((s, a) => s + (a.error_count ?? 0), 0);
    return { active, paused, totalRuns, totalErrors, count: automations.length };
  }, [automations]);

  async function handleCreate() {
    setCreating(true);
    try {
      const a = await create({ data: { name: "Nueva automatización" } });
      qc.invalidateQueries({ queryKey: ["automations"] });
      setOpenId(a.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleImport() {
    const raw = window.prompt("Pega el JSON exportado de la automatización:");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      await imp({
        data: {
          name: parsed.name ?? "Importada",
          description: parsed.description ?? null,
          flow: {
            trigger: parsed.trigger ?? { type: "manual" },
            conditions: parsed.conditions ?? [],
            actions: parsed.actions ?? [],
          },
        },
      });
      toast.success("Flujo importado");
      qc.invalidateQueries({ queryKey: ["automations"] });
    } catch (e) {
      toast.error("JSON inválido: " + (e as Error).message);
    }
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
                Orquestador central · CRM + Bandeja + Embudo + IA · Sin datos duplicados
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleImport} className="gap-1">
                <Upload className="h-3.5 w-3.5" /> Importar
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
            <Kpi icon={Activity} label="Ejecuciones" value={String(kpis.totalRuns)} />
            <Kpi icon={AlertCircle} label="Errores" value={String(kpis.totalErrors)} accent="text-rose-400" />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {automations.length === 0 ? (
            <EmptyState onCreate={handleCreate} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {automations.map((a) => (
                <AutomationCard
                  key={a.id}
                  automation={a}
                  onOpen={() => setOpenId(a.id)}
                  onToggle={async () => {
                    const next = a.status === "active" ? "paused" : "active";
                    await setStatus({ data: { id: a.id, status: next } });
                    qc.invalidateQueries({ queryKey: ["automations"] });
                  }}
                  onDuplicate={async () => {
                    await duplicate({ data: { id: a.id } });
                    qc.invalidateQueries({ queryKey: ["automations"] });
                    toast.success("Flujo duplicado");
                  }}
                  onDelete={async () => {
                    if (!window.confirm("¿Eliminar este flujo?")) return;
                    await del({ data: { id: a.id } });
                    qc.invalidateQueries({ queryKey: ["automations"] });
                  }}
                />
              ))}
            </div>
          )}

          <ArchitectureNote />
        </div>
      </div>

      {openId && (
        <AutomationEditor
          key={openId}
          automationId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </AppShell>
  );
}

// ============ Card ============
function AutomationCard({
  automation, onOpen, onToggle, onDuplicate, onDelete,
}: {
  automation: Automation;
  onOpen: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const trigger = TRIGGER_BY_TYPE[automation.trigger?.type ?? ""];
  const errRate = automation.run_count ? (automation.error_count / automation.run_count) * 100 : 0;
  return (
    <div className="group rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex h-6 items-center rounded-md px-2 text-[10px] uppercase tracking-wider",
              automation.status === "active" && "bg-emerald-500/15 text-emerald-300",
              automation.status === "paused" && "bg-amber-500/15 text-amber-300",
              automation.status === "draft" && "bg-muted text-muted-foreground",
              automation.status === "error" && "bg-rose-500/15 text-rose-300",
            )}>{automation.status}</span>
            <span className="text-[10px] text-muted-foreground">v{automation.version}</span>
          </div>
          <h3 className="mt-1 font-medium">{automation.name}</h3>
          {automation.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{automation.description}</p>
          )}
        </button>
        <div className="flex items-center gap-1">
          <IconBtn onClick={onToggle} title={automation.status === "active" ? "Pausar" : "Activar"}>
            {automation.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn onClick={onDuplicate} title="Duplicar"><Copy className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn onClick={onDelete} title="Eliminar"><Trash2 className="h-3.5 w-3.5 text-rose-400" /></IconBtn>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <span className="rounded-md bg-secondary px-1.5 py-0.5">
          Trigger: {trigger?.label ?? automation.trigger?.type ?? "—"}
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
        <Stat label="Errores" value={`${(automation.error_count ?? 0)} (${errRate.toFixed(0)}%)`} accent={errRate > 0 ? "text-rose-400" : undefined} />
        <Stat label="Última" value={automation.last_run_at ? new Date(automation.last_run_at).toLocaleString() : "—"} />
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
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

// ============ Editor Sheet ============
function AutomationEditor({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getAutomation);
  const save = useServerFn(saveAutomation);
  const runsFn = useServerFn(listAutomationRuns);
  const setStatus = useServerFn(setAutomationStatus);

  const { data: automation, refetch } = useQuery({
    queryKey: ["automation", automationId],
    queryFn: () => get({ data: { id: automationId } }),
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["automation-runs", automationId],
    queryFn: () => runsFn({ data: { automation_id: automationId } }),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [flow, setFlow] = useState<FlowDefinition>({
    trigger: { type: "manual" }, conditions: [], actions: [],
  });
  const [dirty, setDirty] = useState(false);

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

  useEffect(() => {
    const ch = supabase
      .channel(`automation-runs-${automationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_runs", filter: `automation_id=eq.${automationId}` },
        () => qc.invalidateQueries({ queryKey: ["automation-runs", automationId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [automationId, qc]);

  async function handleSave() {
    try {
      await save({ data: { id: automationId, name, description, flow } });
      toast.success("Flujo guardado");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["automations"] });
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  }

  function handleExport() {
    const payload = { name, description, ...flow };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("JSON copiado al portapapeles");
  }

  const [tab, setTab] = useState<"builder" | "history">("builder");

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <SheetTitle className="flex-1 truncate">
              <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }}
                className="border-none bg-transparent px-0 text-base font-semibold focus-visible:ring-0" />
            </SheetTitle>
            {automation && (
              <span className={cn(
                "rounded-md px-2 py-0.5 text-[10px] uppercase",
                automation.status === "active" && "bg-emerald-500/15 text-emerald-300",
                automation.status === "paused" && "bg-amber-500/15 text-amber-300",
                automation.status === "draft" && "bg-muted text-muted-foreground",
                automation.status === "error" && "bg-rose-500/15 text-rose-300",
              )}>{automation.status}</span>
            )}
          </div>
          <Textarea rows={1} value={description} placeholder="Descripción breve del flujo…"
            onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
            className="resize-none border-none bg-transparent px-0 text-xs focus-visible:ring-0" />
          <div className="flex items-center gap-2">
            {(["builder","history"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("rounded-md px-2 py-1 text-xs",
                  tab === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted")}>
                {t === "builder" ? "Constructor" : `Historial (${runs.length})`}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <IconBtn onClick={handleExport} title="Exportar JSON"><Download className="h-3.5 w-3.5" /></IconBtn>
              {automation && (
                <IconBtn
                  onClick={async () => {
                    const next = automation.status === "active" ? "paused" : "active";
                    await setStatus({ data: { id: automationId, status: next } });
                    refetch();
                    qc.invalidateQueries({ queryKey: ["automations"] });
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
          {tab === "builder" ? (
            <FlowBuilder flow={flow} onChange={(f) => { setFlow(f); setDirty(true); }} />
          ) : (
            <RunHistory runs={runs} />
          )}
        </div>
      </SheetContent>
    </Sheet>
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
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Ejecución automática (event-driven)
          <span className="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Próximamente</span>
        </div>
        Los disparadores del CRM y la Bandeja ya emiten eventos. La cola de ejecución en segundo plano se activará cuando finalicemos el módulo. Mientras tanto, puedes probar cualquier flujo con <b>Ejecución manual</b> desde la ficha del cliente o el panel de historial.
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
  const groups = useMemo(() => {
    const g: Record<string, T[]> = {};
    for (const c of catalog) (g[c.category] ??= []).push(c);
    return g;
  }, [catalog]);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border bg-card p-2">
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
      )}
    </div>
  );
}

// ============ History ============
function RunHistory({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
        <History className="mx-auto mb-2 h-6 w-6" />
        Sin ejecuciones registradas.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {runs.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card p-3 text-xs">
          <div className="flex items-center gap-2">
            {r.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            {r.status === "skipped" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
            {r.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
            <span className="font-medium capitalize">{r.status}</span>
            <span className="text-muted-foreground">· {r.triggered_by}</span>
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
          {r.customer_id && (
            <Link to="/clientes/$id" params={{ id: r.customer_id }} className="mt-1 inline-block text-primary hover:underline">
              Ver cliente →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ Misc ============
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/10 p-10 text-center">
      <Zap className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h2 className="font-display text-lg font-semibold">Aún no tienes automatizaciones</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Crea flujos que reaccionen a los eventos del CRM, la Bandeja y el Embudo. Sin código, sin duplicar datos.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={onCreate} size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" /> Crear primer flujo</Button>
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
        Nuevos módulos (Cotizaciones, Pedidos, Agenda, Campañas, Facturación, Reportes, IA) publicarán sus eventos y acciones ahí sin
        modificar el motor. Los flujos referencian clientes y conversaciones <b>por id</b>: la única fuente de verdad sigue siendo el CRM y sus módulos.
      </p>
    </div>
  );
}
