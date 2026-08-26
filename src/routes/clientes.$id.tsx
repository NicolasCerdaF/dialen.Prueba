import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Briefcase,
  Star,
  Tag as TagIcon,
  X,
  Plus,
  Save,
  MessageSquare,
  StickyNote,
  History,
  Paperclip,
  Sliders,
  Lock,
  User,
  Send,
  Trash2,
  Package,
  Sparkles,
} from "lucide-react";

import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  getCustomer,
  updateCrmCustomer,
  addCustomerNote,
  deleteCustomerNote,
  getCustomerTimeline,
  listTeamMembers,
  type CrmCustomer,
  type TimelineItem,
} from "@/lib/crm.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { listQuotes as listQuotesForTab, generateQuoteDraft as generateQuoteDraftFn } from "@/lib/quotes.functions";
import { cn } from "@/lib/utils";

import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { RouteError } from "@/components/route-error";
import { InlinePremiumGate } from "@/components/premium-gate";

export const Route = createFileRoute("/clientes/$id")({
  head: () => ({ meta: [{ title: "Ficha de cliente — Dialen" }] }),
  component: CustomerDetailPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});

function CustomerDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const get = useServerFn(getCustomer);
  const timelineFn = useServerFn(getCustomerTimeline);
  const teamFn = useServerFn(listTeamMembers);

  const { data: customer, refetch } = useQuery({
    queryKey: ["crm-customer", id],
    queryFn: () => get({ data: { id } }),
    staleTime: 20_000,
  });

  const { data: timeline = [], refetch: refetchTimeline } = useQuery({
    queryKey: ["crm-timeline", id],
    queryFn: () => timelineFn({ data: { customer_id: id } }),
    staleTime: 20_000,
  });

  const { data: team = [] } = useQuery({
    queryKey: ["crm-team"],
    queryFn: () => teamFn(),
    staleTime: 5 * 60_000,
  });

  // Realtime: shared helper — customer row + related timeline events/notes.
  useRealtimeInvalidate({
    channel: `crm-detail-${id}`,
    tables: ["customers"],
    filter: `id=eq.${id}`,
    invalidate: [["crm-customer", id]],
  });
  useRealtimeInvalidate({
    channel: `crm-detail-tl-${id}`,
    tables: ["customer_events", "customer_notes"],
    filter: `customer_id=eq.${id}`,
    invalidate: [["crm-timeline", id]],
  });


  if (!customer) {
    return (
      <AppShell>
        <div className="p-10 text-sm text-muted-foreground">Cargando ficha…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate({ to: "/clientes" })}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> CRM · Clientes
              </button>
              <span>/</span>
              <span className="text-foreground">{customer.name ?? customer.phone}</span>
            </div>
            <Link
              to="/contactos/$id"
              params={{ id }}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium text-violet-600 hover:bg-secondary dark:text-violet-400"
              title="Volver a la memoria comercial IA"
            >
              <Sparkles className="h-3 w-3" />
              Memoria comercial IA
            </Link>
          </div>

          <CustomerHeader
            customer={customer}
            team={team}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ["crm-customer", id] });
              qc.invalidateQueries({ queryKey: ["crm-timeline", id] });
            }}
          />
        </header>

        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="summary" className="flex h-full flex-col">
            <div className="border-b px-6">
              <TabsList className="h-10">
                <TabsTrigger value="summary">Resumen</TabsTrigger>
                <TabsTrigger value="products">Productos</TabsTrigger>
                <TabsTrigger value="quotes">Cotizaciones</TabsTrigger>
                <TabsTrigger value="conversations">Conversaciones</TabsTrigger>
                <TabsTrigger value="activity">Actividad</TabsTrigger>
                <TabsTrigger value="notes">Notas</TabsTrigger>
                <TabsTrigger value="tags">Etiquetas</TabsTrigger>
                <TabsTrigger value="files">Archivos</TabsTrigger>
                <TabsTrigger value="custom">Campos</TabsTrigger>
                <TabsTrigger value="soon">Próximamente</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <TabsContent value="summary" className="mt-0">
                <SummaryTab customer={customer} team={team} onChanged={() => qc.invalidateQueries({ queryKey: ["crm-customer", id] })} />
              </TabsContent>
              <TabsContent value="products" className="mt-0">
                <ProductsTab customerId={customer.id} onChanged={() => qc.invalidateQueries({ queryKey: ["crm-customer", id] })} />
              </TabsContent>
              <TabsContent value="quotes" className="mt-0">
                <QuotesTab customerId={customer.id} />
              </TabsContent>
              <TabsContent value="conversations" className="mt-0">
                <ConversationsTab customerId={customer.id} />
              </TabsContent>
              <TabsContent value="activity" className="mt-0">
                <TimelineList items={timeline} team={team} />
              </TabsContent>
              <TabsContent value="notes" className="mt-0">
                <NotesTab customerId={customer.id} />
              </TabsContent>
              <TabsContent value="tags" className="mt-0">
                <TagsTab customer={customer} />
              </TabsContent>
              <TabsContent value="files" className="mt-0">
                <SoonPlaceholder icon={Paperclip} title="Archivos" description="Adjuntos, documentos y contratos por cliente." />
              </TabsContent>
              <TabsContent value="custom" className="mt-0">
                <CustomFieldsTab customer={customer} />
              </TabsContent>
              <TabsContent value="soon" className="mt-0">
                <SoonGrid />
              </TabsContent>
            </div>

          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- Header with quick edit ----------
function CustomerHeader({
  customer,
  team,
  onChanged,
}: {
  customer: CrmCustomer;
  team: { id: string; full_name: string | null; email: string | null }[];
  onChanged: () => void;
}) {
  const update = useServerFn(updateCrmCustomer);
  const [stage, setStage] = useState(customer.stage ?? "");
  const [priority, setPriority] = useState(customer.priority ?? "normal");
  const [status, setStatus] = useState(customer.status ?? "active");
  const [assignee, setAssignee] = useState(customer.assignee_id ?? "");
  useEffect(() => {
    setStage(customer.stage ?? "");
    setPriority(customer.priority ?? "normal");
    setStatus(customer.status ?? "active");
    setAssignee(customer.assignee_id ?? "");
  }, [customer.id, customer.stage, customer.priority, customer.status, customer.assignee_id]);

  const commit = async (patch: Record<string, unknown>) => {
    try {
      await update({ data: { id: customer.id, ...patch } as any });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-primary text-lg font-semibold text-primary-foreground">
          {(customer.name ?? customer.phone).slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">
            {customer.name ?? customer.phone}
            {(customer.tags ?? []).includes("vip") && (
              <Star className="ml-2 inline h-4 w-4 fill-yellow-500 text-yellow-500" />
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
            {customer.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</span>}
            {customer.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{customer.company}</span>}
            <span>Creado {new Date(customer.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MiniSelect
          label="Etapa"
          value={stage}
          onChange={(v) => {
            setStage(v);
            commit({ stage: v || null });
          }}
          options={["lead", "contactado", "propuesta", "negociacion", "ganado", "perdido"]}
          allowEmpty
        />
        <MiniSelect
          label="Prioridad"
          value={priority}
          onChange={(v) => {
            setPriority(v);
            commit({ priority: v });
          }}
          options={["low", "normal", "high", "urgent"]}
        />
        <MiniSelect
          label="Estado"
          value={status}
          onChange={(v) => {
            setStatus(v);
            commit({ status: v });
          }}
          options={["active", "inactive", "archived"]}
        />
        <div className="flex items-center gap-1 text-xs">
          <User className="h-3 w-3 text-muted-foreground" />
          <select
            value={assignee}
            onChange={(e) => {
              setAssignee(e.target.value);
              commit({ assignee_id: e.target.value || null });
            }}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="">Sin responsable</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name ?? m.email}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function MiniSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------- Summary tab (editable form) ----------
function SummaryTab({
  customer,
  team,
  onChanged,
}: {
  customer: CrmCustomer;
  team: { id: string; full_name: string | null; email: string | null }[];
  onChanged: () => void;
}) {
  const update = useServerFn(updateCrmCustomer);
  const [form, setForm] = useState({
    name: customer.name ?? "",
    email: customer.email ?? "",
    company: customer.company ?? "",
    position: customer.position ?? "",
    channel: customer.channel ?? "whatsapp",
    estimated_value: customer.estimated_value ?? 0,
    next_activity_at: customer.next_activity_at ? customer.next_activity_at.slice(0, 16) : "",
    notes: customer.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: customer.name ?? "",
      email: customer.email ?? "",
      company: customer.company ?? "",
      position: customer.position ?? "",
      channel: customer.channel ?? "whatsapp",
      estimated_value: customer.estimated_value ?? 0,
      next_activity_at: customer.next_activity_at ? customer.next_activity_at.slice(0, 16) : "",
      notes: customer.notes ?? "",
    });
  }, [customer.id]);

  const save = async () => {
    setSaving(true);
    try {
      await update({
        data: {
          id: customer.id,
          name: form.name || null,
          email: form.email || null,
          company: form.company || null,
          position: form.position || null,
          channel: form.channel || null,
          estimated_value: Number(form.estimated_value) || 0,
          next_activity_at: form.next_activity_at ? new Date(form.next_activity_at).toISOString() : null,
          notes: form.notes || null,
        } as any,
      });
      toast.success("Ficha actualizada");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const responsible = team.find((t) => t.id === customer.assignee_id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Section title="Datos de contacto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Correo">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Empresa">
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Cargo">
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </Field>
            <Field label="Teléfono">
              <Input value={customer.phone} disabled />
            </Field>
            <Field label="Canal de origen">
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {["whatsapp", "instagram", "messenger", "telegram", "email", "web", "manual"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Comercial">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor estimado (USD)">
              <Input
                type="number"
                value={form.estimated_value}
                onChange={(e) => setForm({ ...form, estimated_value: Number(e.target.value) })}
              />
            </Field>
            <Field label="Próxima actividad">
              <Input
                type="datetime-local"
                value={form.next_activity_at}
                onChange={(e) => setForm({ ...form, next_activity_at: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <Section title="Notas comerciales">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Contexto general del cliente…"
            className="min-h-[100px]"
          />
        </Section>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> Guardar cambios
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Section title="Meta">
          <dl className="space-y-2 text-sm">
            <MetaRow label="Etapa" value={customer.stage ?? "—"} />
            <MetaRow label="Estado" value={customer.status ?? "—"} />
            <MetaRow label="Prioridad" value={customer.priority ?? "—"} />
            <MetaRow
              label="Responsable"
              value={responsible ? responsible.full_name ?? responsible.email ?? "—" : "Sin asignar"}
            />
            <MetaRow
              label="Última interacción"
              value={
                customer.last_interaction_at
                  ? new Date(customer.last_interaction_at).toLocaleString()
                  : "Sin interacción"
              }
            />
            <MetaRow
              label="Creado"
              value={new Date(customer.created_at).toLocaleString()}
            />
          </dl>
        </Section>
        <Section title="Etiquetas rápidas">
          <div className="flex flex-wrap gap-1">
            {(customer.tags ?? []).length === 0 ? (
              <span className="text-xs text-muted-foreground">Sin etiquetas</span>
            ) : (
              (customer.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                  <TagIcon className="h-3 w-3" /> {t}
                </span>
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </div>
  );
}

// ---------- Conversations tab ----------
function ConversationsTab({ customerId }: { customerId: string }) {
  const { data: convos = [] } = useQuery({
    queryKey: ["crm-convos", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status, last_message_at, unread_count, ai_paused")
        .eq("customer_id", customerId)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (convos.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Este cliente aún no tiene conversaciones. Cuando reciba un mensaje aparecerá aquí.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {convos.map((c) => (
        <Link
          key={c.id}
          to="/"
          className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm hover:bg-secondary/40"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">
                Conversación · <span className="capitalize">{c.status}</span>
                {c.unread_count > 0 && (
                  <span className="ml-2 rounded-sm bg-primary/10 px-1.5 text-[10px] text-primary">
                    {c.unread_count} sin leer
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Último mensaje:{" "}
                {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Abrir en Bandeja →</span>
        </Link>
      ))}
    </div>
  );
}

// ---------- Notes tab ----------
function NotesTab({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addCustomerNote);
  const delFn = useServerFn(deleteCustomerNote);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data: notes = [] } = useQuery({
    queryKey: ["crm-notes", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_notes")
        .select("id, body, author_id, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`notes-${customerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_notes", filter: `customer_id=eq.${customerId}` },
        () => qc.invalidateQueries({ queryKey: ["crm-notes", customerId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [customerId, qc]);

  const submit = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await addFn({ data: { customer_id: customerId, body: body.trim() } });
      setBody("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe una nota interna (solo visible para tu equipo)…"
          className="min-h-[80px]"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={submit} disabled={sending || !body.trim()}>
            <Send className="h-4 w-4" /> Guardar nota
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {notes.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
            Sin notas todavía.
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="group rounded-lg border bg-card p-3 text-sm">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <StickyNote className="h-3 w-3" />
                  {new Date(n.created_at).toLocaleString()}
                </span>
                <button
                  onClick={async () => {
                    await delFn({ data: { id: n.id } });
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
              <div className="whitespace-pre-wrap">{n.body}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------- Tags tab ----------
function TagsTab({ customer }: { customer: CrmCustomer }) {
  const update = useServerFn(updateCrmCustomer);
  const [tags, setTags] = useState<string[]>(customer.tags ?? []);
  const [input, setInput] = useState("");
  useEffect(() => {
    setTags(customer.tags ?? []);
  }, [customer.id, customer.tags]);

  const commit = async (next: string[]) => {
    setTags(next);
    try {
      await update({ data: { id: customer.id, tags: next } as any });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const add = () => {
    const v = input.trim().toLowerCase();
    if (!v || tags.includes(v)) return;
    commit([...tags, v]);
    setInput("");
  };
  const remove = (t: string) => commit(tags.filter((x) => x !== t));

  const suggestions = ["vip", "lead", "cliente", "prospecto", "recurrente", "urgente"].filter(
    (s) => !tags.includes(s),
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-xs text-muted-foreground">Sin etiquetas</span>}
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"
            >
              <TagIcon className="h-3 w-3" />
              {t}
              <button onClick={() => remove(t)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nueva etiqueta…"
          />
          <Button onClick={add} variant="outline">
            <Plus className="h-4 w-4" /> Añadir
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground">Sugeridas:</span>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => commit([...tags, s])}
                className="rounded-md border px-2 py-0.5 text-xs hover:bg-secondary"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Custom fields tab ----------
function CustomFieldsTab({ customer }: { customer: CrmCustomer }) {
  const update = useServerFn(updateCrmCustomer);
  const initial = (customer.custom_fields as Record<string, string>) ?? {};
  const [rows, setRows] = useState<{ k: string; v: string }[]>(
    Object.entries(initial).map(([k, v]) => ({ k, v: String(v) })),
  );

  useEffect(() => {
    const init = (customer.custom_fields as Record<string, string>) ?? {};
    setRows(Object.entries(init).map(([k, v]) => ({ k, v: String(v) })));
  }, [customer.id]);

  const save = async () => {
    const obj: Record<string, string> = {};
    for (const r of rows) if (r.k.trim()) obj[r.k.trim()] = r.v;
    try {
      await update({ data: { id: customer.id, custom_fields: obj } as any });
      toast.success("Campos guardados");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Sliders className="h-4 w-4" />
          Campos personalizados clave–valor
        </div>
        {rows.length === 0 && (
          <div className="mb-3 text-xs text-muted-foreground">Sin campos definidos.</div>
        )}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={r.k}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
                placeholder="clave"
                className="w-40"
              />
              <Input
                value={r.v}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
                placeholder="valor"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" onClick={() => setRows([...rows, { k: "", v: "" }])}>
            <Plus className="h-4 w-4" /> Añadir campo
          </Button>
          <Button onClick={save}>
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- Timeline ----------
function TimelineList({
  items,
  team,
}: {
  items: TimelineItem[];
  team: { id: string; full_name: string | null; email: string | null }[];
}) {
  const actorName = (id?: string | null) => {
    if (!id) return "Sistema";
    const m = team.find((t) => t.id === id);
    return m?.full_name ?? m?.email ?? "Usuario";
  };
  if (items.length === 0) {
    return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Sin actividad todavía.</div>;
  }
  return (
    <ol className="relative space-y-3 border-l pl-6">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className={cn(
            "absolute -left-[27px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background",
            it.kind === "customer_note" || it.kind === "conversation_note" ? "bg-amber-500" :
            it.kind === "created" ? "bg-emerald-500" : "bg-primary",
          )} />
          <div className="rounded-lg border bg-card p-3 text-sm">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <History className="h-3 w-3" />
                {new Date(it.created_at).toLocaleString()} · {actorName(it.actor_id)}
              </span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase">
                {labelFor(it)}
              </span>
            </div>
            <TimelineBody item={it} />
          </div>
        </li>
      ))}
    </ol>
  );
}
function labelFor(it: TimelineItem) {
  if (it.kind === "customer_note") return "Nota CRM";
  if (it.kind === "conversation_note") return "Nota en chat";
  if (it.kind === "created") return "Creado";
  return it.event_type ?? it.kind;
}
function TimelineBody({ item }: { item: TimelineItem }) {
  if (item.kind === "customer_note" || item.kind === "conversation_note") {
    return <div className="whitespace-pre-wrap">{item.body}</div>;
  }
  if (item.kind === "created") return <div>Contacto añadido al CRM.</div>;
  if (item.event_type === "updated" && item.payload) {
    const changes = (item.payload as { changes?: Record<string, { from: unknown; to: unknown }> }).changes ?? {};
    const keys = Object.keys(changes);
    if (keys.length === 0) return <div>Actualizado.</div>;
    return (
      <ul className="space-y-0.5 text-xs">
        {keys.map((k) => (
          <li key={k}>
            <span className="font-medium">{k}:</span>{" "}
            <span className="text-muted-foreground">{String(changes[k].from ?? "—")}</span>
            {" → "}
            <span>{String(changes[k].to ?? "—")}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <div className="text-xs text-muted-foreground">{JSON.stringify(item.payload ?? {})}</div>;
}

// ---------- Placeholders ----------
function SoonPlaceholder({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Lock;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <div className="font-semibold">{title}</div>
      <div className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</div>
      <span className="mt-3 inline-block rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
        Próximamente
      </span>
    </div>
  );
}
function SoonGrid() {
  const items: { title: string; description: string }[] = [
    { title: "Pedidos", description: "Historial y estado de pedidos del cliente." },
    { title: "Cotizaciones", description: "Propuestas comerciales enviadas y aceptadas." },
    { title: "Facturación", description: "Facturas emitidas y estado de pagos." },
    { title: "Campañas", description: "Campañas de marketing en las que participa." },
    { title: "Agenda", description: "Reuniones y actividades programadas." },
    { title: "Automatizaciones", description: "Flujos activos y pasos ejecutados." },
    { title: "Historial de compras", description: "Productos adquiridos por el cliente." },
    { title: "Analíticas individuales", description: "Métricas específicas de este cliente." },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <SoonPlaceholder key={i.title} icon={Lock} title={i.title} description={i.description} />
      ))}
    </div>
  );
}

// ------------------- ProductsTab -------------------
import {
  listProducts as listProductsFn,
  listCustomerProducts,
  linkProductToCustomer,
  unlinkProductFromCustomer,
  type Product as CatalogProduct,
  type ProductLink,
} from "@/lib/catalog.functions";
import {
  generateRecommendations,
  listRecommendations,
  setRecommendationStatus,
  REASON_CODES,
  type ReasonCode,
} from "@/lib/recommender.functions";
import { RefreshCw } from "lucide-react";

function ProductsTab({ customerId, onChanged }: { customerId: string; onChanged: () => void }) {
  const listCustomerP = useServerFn(listCustomerProducts);
  const listAll = useServerFn(listProductsFn);
  const link = useServerFn(linkProductToCustomer);
  const unlink = useServerFn(unlinkProductFromCustomer);
  const qc = useQueryClient();

  const { data: links = [] } = useQuery({
    queryKey: ["customer-products", customerId],
    queryFn: () => listCustomerP({ data: { customer_id: customerId } }),
  });

  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const { data: available = [] } = useQuery({
    queryKey: ["catalog-pick", search],
    queryFn: () => listAll({ data: { search: search || undefined, active: true } }),
    enabled: picking,
  });

  async function onLink(p: CatalogProduct, ctx: "interested" | "quoted" | "purchased") {
    await link({
      data: {
        product_id: p.id,
        customer_id: customerId,
        context: ctx,
        quantity: 1,
      },
    });
    qc.invalidateQueries({ queryKey: ["customer-products", customerId] });
    qc.invalidateQueries({ queryKey: ["crm-customer", customerId] });
    onChanged();
    setPicking(false);
  }

  async function onUnlink(l: ProductLink) {
    if (!confirm("¿Quitar este producto del cliente?")) return;
    await unlink({ data: { id: l.id } });
    qc.invalidateQueries({ queryKey: ["customer-products", customerId] });
    qc.invalidateQueries({ queryKey: ["crm-customer", customerId] });
    onChanged();
  }

  const total = links.reduce((s, l) => s + Number(l.estimated_value ?? 0), 0);
  const money = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="space-y-4">
      <InlinePremiumGate feature="recommendador" title="Recomendador IA">
        <ActiveRecommendations customerId={customerId} onChanged={onChanged} />
      </InlinePremiumGate>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Productos vinculados</div>
          <div className="text-xs text-muted-foreground">
            {links.length} vinculados · valor estimado {money(total)}
          </div>
        </div>
        <Button size="sm" onClick={() => setPicking((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> Vincular producto
        </Button>
      </div>

      {picking && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en catálogo…" />
          <div className="max-h-72 space-y-1 overflow-auto">
            {available.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">Sin resultados</div>}
            {available.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded border p-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.sku ?? "—"} · {money(Number(p.price))}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => onLink(p, "interested")}>
                    Interés
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onLink(p, "quoted")}>
                    Cotizado
                  </Button>
                  <Button size="sm" onClick={() => onLink(p, "purchased")}>
                    Comprado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {links.length === 0 && !picking && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-6 w-6 opacity-40" />
          Aún no hay productos vinculados a este cliente. Vincula productos del catálogo para reflejar valor en el embudo.
        </div>
      )}

      {links.map((l) => (
        <div key={l.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-medium">{l.product?.name ?? "Producto"}</span>
              <span className={cn(
                "rounded px-1.5 py-0.5 text-[10px] uppercase",
                l.context === "purchased" && "bg-emerald-500/15 text-emerald-600",
                l.context === "quoted" && "bg-blue-500/15 text-blue-600",
                l.context === "interested" && "bg-amber-500/15 text-amber-600",
                l.context === "recommended" && "bg-primary/15 text-primary",
              )}>
                {l.context}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {l.quantity} × {money(Number(l.unit_price ?? 0))} = <b>{money(Number(l.estimated_value ?? 0))}</b>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => onUnlink(l)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// ------------------- ActiveRecommendations -------------------
const RECO_STYLES: Record<ReasonCode, string> = {
  high_intent: "bg-emerald-500/15 text-emerald-600",
  churn_rescue: "bg-rose-500/15 text-rose-600",
  purchase_history: "bg-indigo-500/15 text-indigo-600",
  category_affinity: "bg-violet-500/15 text-violet-600",
  bestseller: "bg-sky-500/15 text-sky-600",
  high_margin: "bg-amber-500/15 text-amber-600",
  stagnant_recovery: "bg-orange-500/15 text-orange-600",
  stage_fit: "bg-teal-500/15 text-teal-600",
};

function ActiveRecommendations({
  customerId,
  onChanged,
}: {
  customerId: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const gen = useServerFn(generateRecommendations);
  const list = useServerFn(listRecommendations);
  const setStatus = useServerFn(setRecommendationStatus);
  const link = useServerFn(linkProductToCustomer);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: recos = [] } = useQuery({
    queryKey: ["reco-list", customerId],
    queryFn: () => list({ data: { customer_id: customerId, limit: 50 } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`reco-list-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "product_recommendations",
          filter: `customer_id=eq.${customerId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["reco-list", customerId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [customerId, qc]);

  const active = recos.filter((r) => r.status === "pending");
  const history = recos.filter((r) => r.status !== "pending").slice(0, 12);
  const money = (n: number, cur = "USD") =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n || 0);

  async function refresh() {
    setBusy(true);
    try {
      await gen({ data: { customer_id: customerId, limit: 4 } });
      toast.success("Recomendaciones actualizadas");
      qc.invalidateQueries({ queryKey: ["reco-list", customerId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  async function accept(r: any) {
    try {
      await link({
        data: {
          product_id: r.product_id,
          customer_id: customerId,
          context: "recommended",
        },
      });
      await setStatus({ data: { id: r.id, status: "accepted" } });
      toast.success("Recomendación aceptada");
      qc.invalidateQueries({ queryKey: ["reco-list", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-products", customerId] });
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    }
  }

  async function ignore(id: string) {
    await setStatus({ data: { id, status: "ignored" } });
    qc.invalidateQueries({ queryKey: ["reco-list", customerId] });
  }

  return (
    <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">Recomendaciones activas</div>
            <div className="text-[11px] text-muted-foreground">
              Motor IA · contexto comercial en tiempo real
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
          <RefreshCw className={cn("mr-1 h-3 w-3", busy && "animate-spin")} />
          Recalcular
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Sin recomendaciones activas. Recalcula para generarlas.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {active.map((r) => (
            <div key={r.id} className="rounded-md border bg-card p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {r.product?.name ?? "Producto"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {money(Number(r.product?.price ?? 0), r.product?.currency ?? "USD")}
                  </div>
                </div>
                {r.score != null && (
                  <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                    {Math.round(Number(r.score) * 100)}%
                  </span>
                )}
              </div>
              {r.reason_code && (
                <span
                  className={cn(
                    "mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    RECO_STYLES[r.reason_code as ReasonCode] ?? "bg-muted",
                  )}
                >
                  {REASON_CODES[r.reason_code as ReasonCode]}
                </span>
              )}
              <div className="mt-2 flex gap-1">
                <Button size="sm" className="flex-1" onClick={() => accept(r)}>
                  Aceptar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title="Próximamente: crear cotización"
                >
                  Cotizar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => ignore(r.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showHistory ? "Ocultar historial" : `Ver historial (${history.length})`}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1">
              {history.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded border border-border/60 bg-background px-2 py-1 text-[11px]"
                >
                  <span className="truncate">{r.product?.name ?? "Producto"}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase",
                      r.status === "accepted" && "bg-emerald-500/15 text-emerald-600",
                      r.status === "converted" && "bg-primary/15 text-primary",
                      r.status === "ignored" && "bg-muted text-muted-foreground",
                      r.status === "expired" && "bg-muted text-muted-foreground opacity-70",
                    )}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



// ------------------- QuotesTab -------------------
function QuotesTab({ customerId }: { customerId: string }) {
  const list = useServerFn(listQuotesForTab);
  const draft = useServerFn(generateQuoteDraftFn);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: quotes = [], refetch, isFetching } = useQuery({
    queryKey: ["customer-quotes", customerId],
    queryFn: () => list({ data: { customer_id: customerId, limit: 50 } }),
  });

  async function onGenerate() {
    try {
      const res = await draft({ data: { customer_id: customerId } });
      toast.success(`Borrador ${res.number} creado`);
      navigate({ to: "/cotizaciones/$id", params: { id: res.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Error generando cotización");
    }
    refetch();
    qc.invalidateQueries({ queryKey: ["crm-customer", customerId] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Cotizaciones</h2>
          <p className="text-sm text-muted-foreground">
            Propuestas comerciales de este cliente. La IA puede generar un borrador.
          </p>
        </div>
        <Button onClick={onGenerate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nueva por IA
        </Button>
      </div>

      {isFetching && quotes.length === 0 ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : quotes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          Sin cotizaciones aún.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 divide-y divide-border/60">
          {quotes.map((q: any) => (
            <button
              key={q.id}
              onClick={() => navigate({ to: "/cotizaciones/$id", params: { id: q.id } })}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-secondary/40"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {q.ai_generated && <span className="text-primary">✨</span>}
                  {q.number}
                  <span className="text-xs text-muted-foreground">· {q.title ?? "Sin título"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(q.created_at).toLocaleDateString("es-ES")} · {q.status}
                </div>
              </div>
              <div className="text-sm font-semibold">
                {new Intl.NumberFormat("es-ES", { style: "currency", currency: q.currency ?? "USD", maximumFractionDigits: 0 }).format(q.total ?? 0)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
