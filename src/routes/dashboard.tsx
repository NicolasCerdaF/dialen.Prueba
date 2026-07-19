import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  DollarSign,
  Activity,
  Zap,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Plus,
  Package,
  FileText,
  Sparkles,
  Target,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Dialen" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary">
                <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Dashboard
                </h1>
                <p className="text-sm text-muted-foreground">
                  El centro de operación de tu equipo comercial
                </p>
              </div>
            </div>
            <WhatsappStatusBadge />
          </header>

          {/* Actividad del día */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Conversaciones hoy" value="—" icon={MessageSquare} tone="primary" />
            <KpiCard label="Clientes nuevos" value="—" icon={Users} tone="success" />
            <KpiCard label="Ventas del día" value="—" icon={DollarSign} tone="accent" />
            <KpiCard label="Cotizaciones enviadas" value="—" icon={FileText} tone="warn" />
          </section>

          {/* Accesos rápidos */}
          <section className="mt-6">
            <SectionTitle>Accesos rápidos</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <QuickAction to="/" icon={MessageSquare} label="Abrir bandeja" />
              <QuickAction to="/clientes" icon={Users} label="Ver clientes" />
              <QuickAction to="/embudo" icon={Activity} label="Embudo" />
              <QuickAction to="/cotizaciones" icon={FileText} label="Cotizaciones" />
              <QuickAction to="/catalogo" icon={Package} label="Catálogo" />
              <QuickAction to="/automatizaciones" icon={Zap} label="Automatizar" />
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* Conversaciones recientes */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="Conversaciones recientes"
                icon={MessageSquare}
                action={
                  <Link
                    to="/"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver todas
                  </Link>
                }
              />
              <EmptyRow message="Aún no hay conversaciones recientes" />
            </Card>

            {/* Estado de la IA */}
            <Card>
              <CardHeader title="Estado del sistema" icon={Sparkles} />
              <ul className="space-y-3 px-5 pb-5">
                <StatusRow icon={CheckCircle2} label="Vendedor IA" value="Activo" tone="success" />
                <StatusRow icon={Activity} label="Automatizaciones" value="—" tone="muted" />
                <StatusRow icon={AlertCircle} label="Errores detectados" value="0" tone="muted" />
              </ul>
            </Card>
          </div>

          {/* Clientes nuevos y ventas */}
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader
                title="Clientes nuevos"
                icon={Users}
                action={
                  <Link
                    to="/clientes"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver todos
                  </Link>
                }
              />
              <EmptyRow message="Aparecerán aquí los clientes creados hoy" />
            </Card>
            <Card>
              <CardHeader
                title="Ventas generadas"
                icon={DollarSign}
                action={
                  <Link
                    to="/cotizaciones"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver cotizaciones
                  </Link>
                }
              />
              <EmptyRow message="Aparecerán aquí las cotizaciones aceptadas" />
            </Card>
          </div>

          {/* Actividad reciente */}
          <section className="mt-6">
            <ActivityTimeline />
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/* ---------- Activity timeline ---------- */

type ActivityKind =
  | "conversation"
  | "quote"
  | "sale"
  | "opportunity"
  | "automation"
  | "ai";

function ActivityTimeline() {
  // Placeholder — empty state shell. Cuando el sistema registre eventos
  // (conversaciones respondidas, cotizaciones, ventas, oportunidades,
  // automatizaciones y recomendaciones IA) aparecerán aquí como línea de tiempo.
  const legend: { kind: ActivityKind; label: string; icon: typeof MessageSquare; tone: string }[] = [
    { kind: "conversation", label: "Conversaciones", icon: MessageSquare, tone: "text-primary bg-primary/10" },
    { kind: "opportunity", label: "Oportunidades", icon: Target, tone: "text-sky-500 bg-sky-500/10" },
    { kind: "quote", label: "Cotizaciones", icon: FileText, tone: "text-amber-500 bg-amber-500/10" },
    { kind: "sale", label: "Ventas", icon: DollarSign, tone: "text-emerald-500 bg-emerald-500/10" },
    { kind: "automation", label: "Automatizaciones", icon: Zap, tone: "text-violet-500 bg-violet-500/10" },
    { kind: "ai", label: "IA", icon: Sparkles, tone: "text-fuchsia-500 bg-fuchsia-500/10" },
  ];

  return (
    <Card>
      <CardHeader
        title="Actividad reciente"
        icon={Clock}
        action={
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            En vivo
          </span>
        }
      />
      <div className="px-5 pb-5 pt-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {legend.map((l) => (
            <span
              key={l.kind}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", l.tone)}>
                <l.icon className="h-2.5 w-2.5" />
              </span>
              {l.label}
            </span>
          ))}
        </div>
        <div className="relative rounded-lg border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground opacity-60" />
          <p className="text-sm font-medium">Sin actividad reciente</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada conversación respondida, cotización, venta, oportunidad, automatización
            y recomendación IA aparecerá aquí como línea de tiempo ejecutiva.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------- shared UI ---------- */

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof MessageSquare;
  tone: "primary" | "success" | "accent" | "warn";
}) {
  const toneMap = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    accent: "text-sky-500 bg-sky-500/10",
    warn: "text-amber-500 bg-amber-500/10",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneMap[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: "/" | "/clientes" | "/embudo" | "/cotizaciones" | "/catalogo" | "/automatizaciones";
  icon: typeof MessageSquare;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-secondary"
    >
      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
      <span className="flex-1 truncate">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {children}
    </div>
  );
}

function CardHeader({
  title,
  icon: Icon,
  action,
}: {
  title: string;
  icon: typeof MessageSquare;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="ml-auto">{action}</div>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-5 py-8 text-center text-xs text-muted-foreground">
      <Plus className="mx-auto mb-2 h-4 w-4 opacity-40" />
      {message}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof MessageSquare;
  label: string;
  value: string;
  tone: "success" | "muted" | "warn";
}) {
  const t = {
    success: "text-emerald-500",
    muted: "text-muted-foreground",
    warn: "text-amber-500",
  }[tone];
  return (
    <li className="flex items-center gap-3 text-sm">
      <Icon className={cn("h-4 w-4", t)} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </li>
  );
}

function WhatsappStatusBadge() {
  return (
    <Link
      to="/onboarding/whatsapp"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary/40"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      WhatsApp no conectado
      <ArrowRight className="h-3 w-3 opacity-60" />
    </Link>
  );
}
