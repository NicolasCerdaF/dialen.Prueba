import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, UserPlus, ArrowRightLeft, Search, Filter, Phone, Mail, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contactos")({
  head: () => ({ meta: [{ title: "Contactos — Dialen" }] }),
  component: ContactosPage,
});

function ContactosPage() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <Users className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Contactos
                </h1>
                <p className="text-sm text-muted-foreground">
                  Personas que se han comunicado con tu empresa pero aún no compran
                </p>
              </div>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <UserPlus className="h-4 w-4" />
              Nuevo contacto
            </button>
          </header>

          {/* Diferenciador */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <InfoCard
              label="Contactos"
              value="—"
              helper="Aún no realizan una compra"
              icon={Users}
              tone="primary"
              active
            />
            <Link to="/clientes" className="block">
              <InfoCard
                label="Clientes"
                value="—"
                helper="Al menos una compra registrada"
                icon={Users}
                tone="success"
              />
            </Link>
          </div>

          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Buscar contacto por nombre, teléfono o correo"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>

          {/* Tabla */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">Nombre</th>
                  <th className="px-4 py-2.5 text-left">Contacto</th>
                  <th className="px-4 py-2.5 text-left">Origen</th>
                  <th className="px-4 py-2.5 text-left">Última interacción</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-xs text-muted-foreground">
                    <Users className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    Aún no tienes contactos.
                    <br />
                    Los nuevos números que escriban por WhatsApp aparecerán aquí automáticamente.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Explicación conversión */}
          <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ArrowRightLeft className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Convertir contacto en cliente</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cuando un contacto acepta una cotización o registra una compra, podrás convertirlo
                  en cliente con un solo clic. Toda su historia de mensajes, cotizaciones y notas se
                  mantiene intacta.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function InfoCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  active,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Users;
  tone: "primary" | "success";
  active?: boolean;
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-500",
  } as const;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        active ? "border-primary/50" : "border-border hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-display text-xl font-semibold">{value}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
