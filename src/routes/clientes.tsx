import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  Search,
  Filter,
  Star,
  UserX,
  Clock,
  Sparkles,
  ArrowUpRight,
  Phone,
  Building2,
  Tag as TagIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { listCustomers, type CrmCustomer } from "@/lib/crm.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clientes")({
  head: () => ({ meta: [{ title: "CRM · Clientes — Dialen" }] }),
  component: CustomersPage,
});

type QuickFilter = "all" | "mine" | "unassigned" | "vip" | "new" | "inactive";
type SortKey = "last_interaction" | "created" | "name" | "value";

function CustomersPage() {
  const navigate = useNavigate();
  const list = useServerFn(listCustomers);
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [stage, setStage] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("last_interaction");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { sort };
    if (search.trim()) p.search = search.trim();
    if (stage) p.stage = stage;
    if (quick === "mine" && me) p.assignee_id = me;
    if (quick === "unassigned") p.unassigned = true;
    if (quick === "vip") p.vip = true;
    return p;
  }, [search, quick, stage, sort, me]);

  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ["crm-customers", params],
    queryFn: () => list({ data: params as any }),
  });

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("crm-customers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refetch]);

  const filtered = useMemo(() => {
    if (quick === "new") {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      return customers.filter((c) => new Date(c.created_at).getTime() >= cutoff);
    }
    if (quick === "inactive") {
      const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      return customers.filter(
        (c) => !c.last_interaction_at || new Date(c.last_interaction_at).getTime() < cutoff,
      );
    }
    return customers;
  }, [customers, quick]);

  const stages = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) if (c.stage) set.add(c.stage);
    return Array.from(set);
  }, [customers]);

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                CRM · Clientes
              </h1>
              <p className="text-sm text-muted-foreground">
                Fuente única de verdad de cada contacto. {filtered.length} de {customers.length}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nombre, teléfono, empresa…"
                  className="w-72 pl-8"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(
              [
                { k: "all", label: "Todos", icon: Users },
                { k: "mine", label: "Míos", icon: Sparkles },
                { k: "unassigned", label: "Sin responsable", icon: UserX },
                { k: "vip", label: "VIP", icon: Star },
                { k: "new", label: "Nuevos (7d)", icon: Clock },
                { k: "inactive", label: "Inactivos (30d+)", icon: Clock },
              ] as { k: QuickFilter; label: string; icon: typeof Users }[]
            ).map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                onClick={() => setQuick(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  quick === k
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
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">Todas las etapas</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
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
              <option value="value">Valor estimado</option>
            </select>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background/95 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr className="border-b">
                  <th className="px-6 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium">Empresa</th>
                  <th className="px-3 py-2 text-left font-medium">Etapa</th>
                  <th className="px-3 py-2 text-left font-medium">Etiquetas</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-left font-medium">Última interacción</th>
                  <th className="px-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CustomerRow key={c.id} c={c} onOpen={() => navigate({ to: "/clientes/$id", params: { id: c.id } })} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CustomerRow({ c, onOpen }: { c: CrmCustomer; onOpen: () => void }) {
  const isNew = Date.now() - new Date(c.created_at).getTime() < 3 * 24 * 3600 * 1000;
  return (
    <tr className="cursor-pointer border-b transition-colors hover:bg-secondary/40" onClick={onOpen}>
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
            {(c.name ?? c.phone).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 font-medium">
              {c.name ?? c.phone}
              {isNew && (
                <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                  Nuevo
                </span>
              )}
              {(c.tags ?? []).includes("vip") && (
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {c.phone}
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
        {c.stage ? (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs">{c.stage}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {(c.tags ?? []).slice(0, 3).map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px]">
              <TagIcon className="h-2.5 w-2.5" />
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 text-right font-mono text-xs">
        {c.estimated_value ? `$${Number(c.estimated_value).toLocaleString()}` : "—"}
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {c.last_interaction_at
          ? new Date(c.last_interaction_at).toLocaleDateString()
          : "Sin interacción"}
      </td>
      <td className="px-6 py-3 text-right">
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
      </td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-display text-xl font-semibold">Sin clientes que coincidan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Los clientes se crean automáticamente cuando reciben un mensaje en tu WhatsApp o
          desde <Link className="underline" to="/">la Bandeja Unificada</Link>.
        </p>
      </div>
    </div>
  );
}
