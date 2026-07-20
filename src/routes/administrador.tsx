import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Shield, Users, Building2, Ban, KeyRound, Loader2, Search, TrendingUp, MessageSquare, DollarSign, Copy, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getPlatformMetrics,
  isPlatformAdmin,
  listPlatformCompanies,
  listPlatformUsers,
  resetUserPassword,
  setUserBanned,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/administrador")({
  component: AdministradorPage,
});

function AdministradorPage() {
  const checkFn = useServerFn(isPlatformAdmin);
  const check = useQuery({ queryKey: ["is-platform-admin-page"], queryFn: () => checkFn() });

  if (check.isLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando permisos…
        </div>
      </AppShell>
    );
  }

  if (!check.data?.isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-20 text-center">
          <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este panel es solo para administradores de plataforma.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AdminContent />
    </AppShell>
  );
}

function AdminContent() {
  const [tab, setTab] = useState<"metrics" | "companies" | "users">("metrics");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Administrador de Plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Vista global de todas las cuentas, métricas y gestión de usuarios.
          </p>
        </div>
      </header>

      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
        {(
          [
            { id: "metrics", label: "Métricas", icon: TrendingUp },
            { id: "companies", label: "Empresas", icon: Building2 },
            { id: "users", label: "Usuarios", icon: Users },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "metrics" && <MetricsTab />}
      {tab === "companies" && <CompaniesTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}

function MetricsTab() {
  const fn = useServerFn(getPlatformMetrics);
  const q = useQuery({ queryKey: ["platform-metrics"], queryFn: () => fn() });

  if (q.isLoading || !q.data) {
    return <div className="text-muted-foreground text-sm">Cargando métricas…</div>;
  }
  const m = q.data;

  const stats = [
    { label: "Empresas totales", value: m.totals.companies, icon: Building2 },
    { label: "Usuarios totales", value: m.totals.users, icon: Users },
    { label: "Conversaciones", value: m.totals.conversations, icon: MessageSquare },
    { label: "Mensajes", value: m.totals.messages, icon: MessageSquare },
    {
      label: "Ingresos aceptados",
      value: `$${Math.round(m.totals.acceptedRevenue).toLocaleString("es-CL")}`,
      icon: DollarSign,
    },
    { label: "Altas últimos 30d", value: m.signups30d, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" /> {s.label}
                </div>
                <div className="mt-2 text-2xl font-semibold">{s.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribución por plan</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">Plan Start</div>
            <div className="mt-1 text-xl font-semibold">{m.plans.basic}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Plan Business</div>
            <div className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">
              {m.plans.business}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CompaniesTab() {
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
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o dueño…"
          className="pl-9"
        />
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Empresa</th>
                <th className="p-3 text-left">Dueño</th>
                <th className="p-3 text-left">Plan</th>
                <th className="p-3 text-right">Usuarios</th>
                <th className="p-3 text-left">Creada</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {c.ownerName ?? "—"}
                    {c.ownerEmail && <div className="text-xs">{c.ownerEmail}</div>}
                  </td>
                  <td className="p-3">
                    <Badge variant={c.plan === "premium" ? "default" : "secondary"}>
                      {c.plan === "premium" ? "Business" : "Start"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">{c.userCount}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("es-CL")}
                  </td>
                </tr>
              ))}
              {!q.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersTab() {
  const fn = useServerFn(listPlatformUsers);
  const banFn = useServerFn(setUserBanned);
  const resetFn = useServerFn(resetUserPassword);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["platform-users"], queryFn: () => fn() });

  const [search, setSearch] = useState("");
  const [confirmBan, setConfirmBan] = useState<{ id: string; email: string; banned: boolean } | null>(null);
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
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email, nombre o empresa…"
          className="pl-9"
        />
      </div>
      {q.isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Usuario</th>
                <th className="p-3 text-left">Empresa</th>
                <th className="p-3 text-left">Último acceso</th>
                <th className="p-3 text-left">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{u.fullName ?? u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="p-3 text-muted-foreground">{u.companyName ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {u.lastSignInAt
                      ? new Date(u.lastSignInAt).toLocaleString("es-CL")
                      : "Nunca"}
                  </td>
                  <td className="p-3">
                    {u.banned ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : u.emailConfirmedAt ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Sin confirmar</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResetTarget({ id: u.id, email: u.email })}
                        disabled={busyId === u.id}
                      >
                        <KeyRound className="mr-1 h-3.5 w-3.5" />
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        variant={u.banned ? "outline" : "destructive"}
                        onClick={() =>
                          setConfirmBan({ id: u.id, email: u.email, banned: u.banned })
                        }
                        disabled={busyId === u.id}
                      >
                        {u.banned ? (
                          <>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Reactivar
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
              ))}
              {!q.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
    </div>
  );
}
