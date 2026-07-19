import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Sparkles,
  Phone,
  Mail,
  Building2,
  Tag as TagIcon,
  MessageSquare,
  FileText,
  ArrowUpRight,
  Star,
  Clock,
  TrendingUp,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listContacts,
  createContact,
  type ContactRow,
  type ContactSegment,
  type ContactSignal,
} from "@/lib/contacts.functions";
import { toast } from "sonner";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { RouteError } from "@/components/route-error";

export const Route = createFileRoute("/contactos")({
  head: () => ({ meta: [{ title: "Contactos — Dialen" }] }),
  component: ContactosPage,
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
});


type SortKey = "last_interaction" | "created" | "name";

const SEGMENTS: { k: ContactSegment; label: string; icon: typeof Users; hint: string }[] = [
  { k: "all", label: "Todos", icon: Users, hint: "Toda tu base" },
  { k: "contactos", label: "Contactos", icon: Users, hint: "Aún no compran" },
  { k: "clientes", label: "Clientes", icon: Star, hint: "Con compra registrada" },
  { k: "new", label: "Nuevos (7d)", icon: Sparkles, hint: "Recién ingresados" },
  { k: "high_intent", label: "Alta intención", icon: TrendingUp, hint: "IA detectó interés" },
  { k: "no_followup", label: "Sin seguimiento", icon: Clock, hint: "+7d sin contacto" },
  { k: "inactive", label: "Inactivos", icon: Clock, hint: "+30d sin interacción" },
];

function ContactosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listContacts);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<ContactSegment>("all");
  const [origin, setOrigin] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("last_interaction");
  const [showNew, setShowNew] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { segment, sort };
    if (search.trim()) p.search = search.trim();
    if (origin) p.origin = origin;
    return p;
  }, [search, segment, origin, sort]);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts", params],
    queryFn: () => list({ data: params as any }),
    staleTime: 30_000,
  });

  useRealtimeInvalidate({
    channel: "contacts-live",
    tables: ["customers", "messages", "quotes"],
    invalidate: [["contacts"]],
  });


  const origins = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) if (c.channel) set.add(c.channel);
    return Array.from(set);
  }, [contacts]);

  const totals = useMemo(() => {
    const clientes = contacts.filter((c) => c.is_client).length;
    return { total: contacts.length, clientes, contactos: contacts.length - clientes };
  }, [contacts]);

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <Users className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Contactos
                </h1>
                <p className="text-sm text-muted-foreground">
                  {totals.total} visibles · {totals.clientes} clientes · {totals.contactos} contactos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nombre, teléfono, correo, empresa…"
                  className="w-72 pl-8"
                />
              </div>
              <Button onClick={() => setShowNew(true)} size="sm">
                <UserPlus className="mr-1.5 h-4 w-4" />
                Nuevo contacto
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {SEGMENTS.map(({ k, label, icon: Icon, hint }) => (
              <button
                key={k}
                onClick={() => setSegment(k)}
                title={hint}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  segment === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-secondary",
                )}
              >
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
            <div className="mx-2 h-4 w-px bg-border" />
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">Todos los orígenes</option>
              {origins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="last_interaction">Última interacción</option>
              <option value="created">Fecha de creación</option>
              <option value="name">Nombre</option>
            </select>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : contacts.length === 0 ? (
            <EmptyState onNew={() => setShowNew(true)} />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr className="border-b">
                  <th className="px-6 py-2 text-left font-medium">Contacto</th>
                  <th className="px-3 py-2 text-left font-medium">Empresa</th>
                  <th className="px-3 py-2 text-left font-medium">Origen</th>
                  <th className="px-3 py-2 text-left font-medium">Señales IA</th>
                  <th className="px-3 py-2 text-right font-medium">Actividad</th>
                  <th className="px-3 py-2 text-left font-medium">Última interacción</th>
                  <th className="px-6 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <ContactTableRow
                    key={c.id}
                    c={c}
                    onOpen={() => navigate({ to: "/contactos/$id", params: { id: c.id } })}
                    onMessage={() => {
                      if (c.conversation_id) {
                        navigate({ to: "/conversaciones", hash: `conv=${c.conversation_id}` });
                      } else {
                        toast.info("Este contacto aún no tiene una conversación asociada");
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <NewContactDialog
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["contacts"] });
            navigate({ to: "/contactos/$id", params: { id } });
          }}
        />
      )}
    </AppShell>
  );
}

function ContactTableRow({
  c,
  onOpen,
  onMessage,
}: {
  c: ContactRow;
  onOpen: () => void;
  onMessage: () => void;
}) {
  return (
    <tr className="cursor-pointer border-b transition-colors hover:bg-secondary/40" onClick={onOpen}>
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
              c.is_client ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary",
            )}
          >
            {(c.name ?? c.phone).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <span className="truncate">{c.name ?? c.phone}</span>
              {c.is_client && (
                <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                  Cliente
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {c.phone}
              {c.email && (
                <>
                  <span className="text-border">·</span>
                  <Mail className="h-3 w-3" /> <span className="truncate">{c.email}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {c.company ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            {c.company}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="rounded bg-secondary px-2 py-0.5 text-[11px] capitalize">
          {c.channel ?? "manual"}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {c.signals.slice(0, 3).map((s) => (
            <SignalBadge key={s.key} s={s} />
          ))}
          {(c.tags ?? []).slice(0, 2).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px]"
            >
              <TagIcon className="h-2.5 w-2.5" />
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex justify-end gap-3 font-mono text-[11px] text-muted-foreground">
          <span title="Conversaciones">
            <MessageSquare className="mr-0.5 inline h-3 w-3" />
            {c.message_count}
          </span>
          <span title="Cotizaciones">
            <FileText className="mr-0.5 inline h-3 w-3" />
            {c.quote_count}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {c.last_interaction_at
          ? new Date(c.last_interaction_at).toLocaleDateString()
          : "Sin interacción"}
      </td>
      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            title="Abrir conversación"
            onClick={onMessage}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <button
            title="Ver ficha"
            onClick={onOpen}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SignalBadge({ s }: { s: ContactSignal }) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600",
    warning: "bg-amber-500/15 text-amber-600",
    muted: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
        toneMap[s.tone],
      )}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {s.label}
    </span>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-display text-xl font-semibold">Aún no hay contactos</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Los números que escriban a tu WhatsApp aparecerán aquí automáticamente. También puedes
          crearlos manualmente o desde <Link className="underline" to="/conversaciones">Conversaciones</Link>.
        </p>
        <Button onClick={onNew} className="mt-4">
          <UserPlus className="mr-2 h-4 w-4" /> Crear el primer contacto
        </Button>
      </div>
    </div>
  );
}

function NewContactDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useServerFn(createContact);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSaving(true);
    try {
      const res = await create({
        data: {
          phone: phone.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          company: company.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          channel: "manual",
        },
      });
      if (res.duplicate) toast.info("Ya existía un contacto con ese teléfono");
      else toast.success("Contacto creado");
      onCreated(res.id);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo crear el contacto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Nuevo contacto</h2>
            <p className="text-xs text-muted-foreground">
              Se agrega a tu base comercial. Si el teléfono ya existe, no se duplica.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs font-medium">
            Teléfono <span className="text-destructive">*</span>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+56 9 …"
              className="mt-1"
              required
            />
          </label>
          <label className="block text-xs font-medium">
            Nombre
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium">
            Correo
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium">
            Empresa
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-xs font-medium">
            Etiquetas <span className="text-muted-foreground">(separadas por coma)</span>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="vip, mayorista"
              className="mt-1"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !phone.trim()}>
            {saving ? "Creando…" : "Crear contacto"}
          </Button>
        </div>
      </form>
    </div>
  );
}
