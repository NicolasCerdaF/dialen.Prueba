import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Shield,
  Users,
  Building2,
  Ban,
  KeyRound,
  Loader2,
  Search,
  TrendingUp,
  MessageSquare,
  DollarSign,
  Copy,
  CheckCircle2,
  Sparkles,
  Zap,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  getPlatformMetrics,
  isPlatformAdmin,
  listPlatformCompanies,
  listPlatformUsers,
  resetUserPassword,
  setUserBanned,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/administrador")({
  head: () => ({ meta: [{ title: "Admin Plataforma — Dialen" }] }),
  component: AdministradorPage,
});

function AdministradorPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const checkFn = useServerFn(isPlatformAdmin);
  const check = useQuery({
    queryKey: ["is-platform-admin-page"],
    queryFn: () => checkFn(),
    enabled: !!session,
  });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login", replace: true });
  }, [loading, session, navigate]);

  if (loading || check.isLoading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19] text-slate-300">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando permisos…
      </div>
    );
  }

  if (!check.data?.isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0f19] px-6 text-center text-slate-200">
        <Shield className="h-10 w-10 text-slate-500" />
        <div>
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-slate-400">
            Este panel es solo para administradores de plataforma.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          Volver al inicio
        </Button>
      </div>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-10">
        <section id="overview" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Vista general"
            title="Estado global de la plataforma"
            description="Métricas en vivo de todas las cuentas, empresas y consumo de crédito IA."
          />
          <MetricsBlock />
        </section>

        <section id="users" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Usuarios"
            title="Gestión de usuarios y créditos"
            description="Consumo de crédito por usuario, activación / bloqueo y reinicio de contraseña."
          />
          <UsersBlock />
        </section>

        <section id="companies" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Empresas"
            title="Cuentas de empresa"
            description="Todas las empresas registradas y su plan contratado."
          />
          <CompaniesBlock />
        </section>
      </div>
    </AdminShell>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-xl font-semibold text-slate-100">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function AdminCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/60 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] ${className}`}
    >
      {children}
    </div>
  );
}

function MetricsBlock() {
  const fn = useServerFn(getPlatformMetrics);
  const q = useQuery({ queryKey: ["platform-metrics"], queryFn: () => fn() });

  if (q.isLoading || !q.data) {
    return <div className="text-sm text-slate-500">Cargando métricas…</div>;
  }
  const m = q.data;

  const stats = [
    { label: "Empresas", value: m.totals.companies, icon: Building2, tint: "text-cyan-400" },
    { label: "Usuarios", value: m.totals.users, icon: Users, tint: "text-emerald-400" },
    { label: "Conversaciones", value: m.totals.conversations, icon: MessageSquare, tint: "text-indigo-400" },
    { label: "Mensajes", value: m.totals.messages, icon: MessageSquare, tint: "text-sky-400" },
    {
      label: "Ingresos aceptados",
      value: `$${Math.round(m.totals.acceptedRevenue).toLocaleString("es-CL")}`,
      icon: DollarSign,
      tint: "text-amber-300",
    },
    { label: "Altas 30d", value: m.signups30d, icon: TrendingUp, tint: "text-fuchsia-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <AdminCard key={s.label} className="p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                <Icon className={`h-3.5 w-3.5 ${s.tint}`} /> {s.label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-100">{s.value}</div>
            </AdminCard>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AdminCard className="p-5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Distribución de planes</div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <div className="text-xs text-slate-400">Plan Start</div>
              <div className="mt-1 text-2xl font-semibold text-slate-100">{m.plans.basic}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Plan Business</div>
              <div className="mt-1 text-2xl font-semibold text-amber-300">{m.plans.business}</div>
            </div>
          </div>
        </AdminCard>

        <AdminCard className="p-5">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Actividad IA (mes)</div>
          <div className="mt-3 flex items-center gap-3 text-sm text-slate-300">
            <Sparkles className="h-4 w-4 text-amber-300" />
            El consumo detallado por usuario está debajo en la sección{" "}
            <a href="#users" className="text-amber-300 underline-offset-2 hover:underline">
              Usuarios
            </a>
            .
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

function creditsColor(pct: number) {
  if (pct >= 90) return "bg-rose-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-emerald-500";
}

function UsersBlock() {
  const fn = useServerFn(listPlatformUsers);
  const banFn = useServerFn(setUserBanned);
  const resetFn = useServerFn(resetUserPassword);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["platform-users"], queryFn: () => fn() });

  const [search, setSearch] = useState("");
  const [confirmBan, setConfirmBan] = useState<{ id: string; email: string; banned: boolean } | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (u) =>
        u.email?.toLowerCase().includes(s) ||
        u.fullName?.toLowerCase().includes(s) ||
        u.companyName?.toLowerCase().includes(s),
    );
  }, [q.data, search]);

  async function doBan() {
    if (!confirmBan) return;
    setBusyId(confirmBan.id);
    try {
      await banFn({ data: { userId: confirmBan.id, banned: !confirmBan.banned } });
      toast.success(confirmBan.banned ? "Cuenta reactivada" : "Cuenta bloqueada");
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally {
      setBusyId(null);
      setConfirmBan(null);
    }
  }

  async function doReset() {
    if (!resetTarget) return;
    setBusyId(resetTarget.id);
    try {
      const res = await resetFn({ data: { userId: resetTarget.id } });
      setResetResult({ email: resetTarget.email, password: res.password });
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally {
      setBusyId(null);
      setResetTarget(null);
    }
  }

  return (
    <AdminCard>
      <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email, nombre o empresa…"
            className="border-slate-800 bg-slate-950/60 pl-9 text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="text-xs text-slate-500">
          {q.isLoading ? "Cargando…" : `${filtered.length} usuario${filtered.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3 text-left font-medium">Usuario</th>
              <th className="p-3 text-left font-medium">Empresa / plan</th>
              <th className="p-3 text-left font-medium">Consumo IA (mes)</th>
              <th className="p-3 text-left font-medium">Último acceso</th>
              <th className="p-3 text-left font-medium">Estado</th>
              <th className="p-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const pct = u.creditsPct ?? 0;
              return (
                <tr key={u.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="p-3">
                    <div className="font-medium text-slate-100">{u.fullName ?? u.email}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-slate-300">{u.companyName ?? "—"}</div>
                    <div className="mt-0.5 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                          u.plan === "premium"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {u.plan === "premium" ? "Business" : "Start"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Zap className="h-3.5 w-3.5 text-amber-300" />
                      <span className="font-medium text-slate-100">
                        {u.creditsUsed.toLocaleString("es-CL")}
                      </span>
                      <span className="text-slate-500">
                        / {u.creditsIncluded.toLocaleString("es-CL")}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full ${creditsColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="p-3 text-xs text-slate-400">
                    {u.lastSignInAt
                      ? new Date(u.lastSignInAt).toLocaleString("es-CL")
                      : "Nunca"}
                  </td>
                  <td className="p-3">
                    {u.banned ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        Bloqueado
                      </span>
                    ) : u.emailConfirmedAt ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                        Activo
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                        Sin confirmar
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                        onClick={() => setResetTarget({ id: u.id, email: u.email })}
                        disabled={busyId === u.id}
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant={u.banned ? "outline" : "destructive"}
                        className={
                          u.banned
                            ? "border-emerald-600/50 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-900/40"
                            : ""
                        }
                        onClick={() =>
                          setConfirmBan({ id: u.id, email: u.email, banned: u.banned })
                        }
                        disabled={busyId === u.id}
                      >
                        {u.banned ? (
                          <>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Activar
                          </>
                        ) : (
                          <>
                            <Ban className="mr-1 h-3.5 w-3.5" /> Bloquear
                          </>
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!q.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!confirmBan} onOpenChange={(o) => !o && setConfirmBan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBan?.banned ? "Reactivar cuenta" : "Bloquear cuenta"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBan?.banned
                ? `El usuario ${confirmBan?.email} podrá volver a iniciar sesión.`
                : `El usuario ${confirmBan?.email} no podrá iniciar sesión hasta que lo reactives. Los datos se conservan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doBan}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetear contraseña</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará una contraseña temporal para {resetTarget?.email}. Compártela por un
              canal seguro; el usuario debe cambiarla al ingresar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doReset}>Generar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva contraseña temporal</DialogTitle>
            <DialogDescription>
              Cópiala ahora. Por seguridad no se volverá a mostrar.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{resetResult?.email}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="font-mono text-lg">{resetResult?.password}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (resetResult?.password) {
                    navigator.clipboard.writeText(resetResult.password);
                    toast.success("Contraseña copiada");
                  }
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setResetResult(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminCard>
  );
}

function CompaniesBlock() {
  const fn = useServerFn(listPlatformCompanies);
  const q = useQuery({ queryKey: ["platform-companies"], queryFn: () => fn() });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (c) =>
        c.name?.toLowerCase().includes(s) ||
        c.ownerEmail?.toLowerCase().includes(s) ||
        c.ownerName?.toLowerCase().includes(s),
    );
  }, [q.data, search]);

  return (
    <AdminCard>
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa o dueño…"
            className="border-slate-800 bg-slate-950/60 pl-9 text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div className="text-xs text-slate-500">
          {q.isLoading ? "Cargando…" : `${filtered.length} empresa${filtered.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3 text-left font-medium">Empresa</th>
              <th className="p-3 text-left font-medium">Dueño</th>
              <th className="p-3 text-left font-medium">Plan</th>
              <th className="p-3 text-right font-medium">Usuarios</th>
              <th className="p-3 text-left font-medium">Creada</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/60 last:border-0">
                <td className="p-3 font-medium text-slate-100">{c.name}</td>
                <td className="p-3 text-slate-300">
                  {c.ownerName ?? "—"}
                  {c.ownerEmail && <div className="text-xs text-slate-500">{c.ownerEmail}</div>}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                      c.plan === "premium"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {c.plan === "premium" ? "Business" : "Start"}
                  </span>
                </td>
                <td className="p-3 text-right text-slate-200">{c.userCount}</td>
                <td className="p-3 text-xs text-slate-400">
                  {new Date(c.createdAt).toLocaleDateString("es-CL")}
                </td>
              </tr>
            ))}
            {!q.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}
