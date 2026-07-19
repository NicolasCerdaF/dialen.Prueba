import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, FileText,
  Loader2, MessageSquare, Phone, Plug, PlugZap, Power, RefreshCw, Send,
  ShieldCheck, Sparkles, Trash2, TrendingUp, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmbeddedSignupButton } from "@/components/whatsapp/embedded-signup-button";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  disconnectWhatsAppChannel, getWhatsAppChannel, getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile, getWhatsAppPhoneHealth, listWhatsAppTemplates,
  createWhatsAppTemplate, deleteWhatsAppTemplate, getWhatsAppMetrics,
  getRecentWhatsAppActivity, refreshWhatsAppChannel, rotateWhatsAppVerifyToken,
  sendTestWhatsAppMessage,
} from "@/lib/whatsapp.functions";
import { getWhatsAppDiagnostics } from "@/lib/whatsapp-debug.functions";

export const Route = createFileRoute("/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp Business — Dialen" }] }),
  component: WhatsAppModule,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-muted-foreground">Error: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">No encontrado</div>,
});

const CHANNEL_KEY = ["whatsapp", "channel"];

function WhatsAppModule() {
  const channelFn = useServerFn(getWhatsAppChannel);
  const { data: channel } = useSuspenseQuery({
    queryKey: CHANNEL_KEY,
    queryFn: () => channelFn(),
  });
  /* no realtime for channels */

  const connected = channel?.status === "connected";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Header connected={connected} channel={channel} />
      {!channel ? (
        <ConnectPanel />
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="overview"><Activity className="mr-2 h-4 w-4" />Resumen</TabsTrigger>
            <TabsTrigger value="profile"><ShieldCheck className="mr-2 h-4 w-4" />Perfil de negocio</TabsTrigger>
            <TabsTrigger value="templates"><FileText className="mr-2 h-4 w-4" />Plantillas</TabsTrigger>
            <TabsTrigger value="metrics"><TrendingUp className="mr-2 h-4 w-4" />Métricas</TabsTrigger>
            <TabsTrigger value="test"><Send className="mr-2 h-4 w-4" />Prueba de envío</TabsTrigger>
            <TabsTrigger value="webhook"><PlugZap className="mr-2 h-4 w-4" />Webhook</TabsTrigger>
            <TabsTrigger value="diagnostics"><AlertTriangle className="mr-2 h-4 w-4" />Diagnóstico</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab channel={channel} /></TabsContent>
          <TabsContent value="profile"><ProfileTab connected={connected} /></TabsContent>
          <TabsContent value="templates"><TemplatesTab connected={connected} /></TabsContent>
          <TabsContent value="metrics"><MetricsTab /></TabsContent>
          <TabsContent value="test"><TestTab connected={connected} /></TabsContent>
          <TabsContent value="webhook"><WebhookTab channel={channel} /></TabsContent>
          <TabsContent value="diagnostics"><DiagnosticsTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Header({ connected, channel }: { connected: boolean; channel: any }) {
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshWhatsAppChannel);
  const disconnectFn = useServerFn(disconnectWhatsAppChannel);
  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: () => { toast.success("Canal actualizado"); qc.invalidateQueries({ queryKey: ["whatsapp"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => { toast.success("WhatsApp desconectado"); qc.invalidateQueries({ queryKey: ["whatsapp"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">WhatsApp Business</h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            {connected ? (
              <>
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Conectado como <span className="font-medium text-foreground">{channel?.display_phone}</span>
              </>
            ) : channel ? (
              <><XCircle className="h-4 w-4 text-destructive" /> Desconectado</>
            ) : (
              <>Sin canal configurado</>
            )}
          </div>
        </div>
      </div>
      {channel ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive"><Power className="mr-2 h-4 w-4" />Desconectar</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desconectar WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  Las conversaciones actuales se conservarán, pero no podrás enviar ni recibir mensajes nuevos hasta reconectar.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => disconnect.mutate()}>Desconectar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}

function ConnectPanel() {
  const qc = useQueryClient();
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Plug className="h-7 w-7" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Conecta tu WhatsApp Business</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Inicia sesión con Meta. Al terminar, Dialen recibirá los mensajes automáticamente y podrás responder desde la Bandeja.
          </p>
        </div>
        <EmbeddedSignupButton onConnected={() => qc.invalidateQueries({ queryKey: ["whatsapp"] })} />
        <div className="mt-2 grid gap-3 text-left text-sm sm:grid-cols-3">
          <Bullet icon={<Sparkles className="h-4 w-4" />} text="IA responde borradores" />
          <Bullet icon={<ShieldCheck className="h-4 w-4" />} text="Conexión oficial Meta" />
          <Bullet icon={<TrendingUp className="h-4 w-4" />} text="Métricas en vivo" />
        </div>
      </CardContent>
    </Card>
  );
}

function Bullet({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-muted-foreground">
      <span className="text-primary">{icon}</span>{text}
    </div>
  );
}

// -------- Overview --------
function OverviewTab({ channel }: { channel: any }) {
  const healthFn = useServerFn(getWhatsAppPhoneHealth);
  const metricsFn = useServerFn(getWhatsAppMetrics);
  const activityFn = useServerFn(getRecentWhatsAppActivity);
  const { data: health } = useQuery({ queryKey: ["whatsapp", "health"], queryFn: () => healthFn() });
  const { data: metrics } = useQuery({ queryKey: ["whatsapp", "metrics"], queryFn: () => metricsFn() });
  const { data: activity } = useQuery({ queryKey: ["whatsapp", "activity"], queryFn: () => activityFn() });
  useRealtimeInvalidate({ channel: "wa-overview", tables: ["messages"], invalidate: [["whatsapp", "metrics"], ["whatsapp", "activity"]] });

  const qualityColor = (q?: string) =>
    q === "GREEN" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : q === "YELLOW" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : q === "RED" ? "bg-red-500/10 text-red-700 dark:text-red-400"
    : "bg-muted text-muted-foreground";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-sm font-medium">Estado del número</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Número" value={health?.display_phone_number ?? channel?.display_phone ?? "—"} icon={<Phone className="h-4 w-4" />} />
          <Field label="Nombre verificado" value={health?.verified_name ?? "—"} />
          <Field label="Estado del nombre" value={<Badge variant="secondary">{health?.name_status ?? "—"}</Badge>} />
          <Field label="Calidad de mensajería" value={<Badge className={qualityColor(health?.quality_rating)}>{health?.quality_rating ?? "—"}</Badge>} />
          <Field label="Verificación" value={<Badge variant="outline">{health?.code_verification_status ?? "—"}</Badge>} />
          <Field label="Throughput" value={health?.throughput?.level ?? "—"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Volumen últimas 24h</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Stat label="Entrantes" value={metrics?.buckets.d1.in ?? 0} />
          <Stat label="Salientes" value={metrics?.buckets.d1.out ?? 0} />
          <div className="border-t pt-3 text-xs text-muted-foreground">
            Últimos 30 días: {metrics?.total30 ?? 0} mensajes
          </div>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Actividad reciente</CardTitle>
          <Link to="/conversaciones" className="text-xs text-primary hover:underline">Ver bandeja →</Link>
        </CardHeader>
        <CardContent>
          {!activity?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin actividad reciente.</p>
          ) : (
            <div className="max-h-96 divide-y divide-border overflow-y-auto">
              {activity.map((m: any) => (
                <div key={m.id} className="flex items-start gap-3 py-2.5">
                  <Badge variant={m.direction === "inbound" ? "secondary" : "outline"} className="mt-0.5 shrink-0">
                    {m.direction === "inbound" ? "IN" : "OUT"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{m.body || <span className="italic text-muted-foreground">(sin texto)</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString()} · {m.status ?? "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// -------- Profile --------
function ProfileTab({ connected }: { connected: boolean }) {
  const qc = useQueryClient();
  const profileFn = useServerFn(getWhatsAppBusinessProfile);
  const saveFn = useServerFn(updateWhatsAppBusinessProfile);
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp", "profile"],
    queryFn: () => profileFn(),
    enabled: connected,
  });
  const [form, setForm] = useState<any>(null);
  const state = form ?? data ?? {};
  const save = useMutation({
    mutationFn: (payload: any) => saveFn({ data: payload }),
    onSuccess: () => { toast.success("Perfil actualizado"); qc.invalidateQueries({ queryKey: ["whatsapp", "profile"] }); setForm(null); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!connected) return <EmptyConnect />;
  if (isLoading) return <Skeleton className="h-96" />;

  const update = (k: string, v: any) => setForm({ ...state, [k]: v });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perfil de negocio</CardTitle>
        <p className="text-xs text-muted-foreground">Estos datos aparecen en tu perfil público de WhatsApp.</p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Descripción corta (about) · 139 caracteres</Label>
          <Input maxLength={139} value={state.about ?? ""} onChange={(e) => update("about", e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Descripción completa · 512 caracteres</Label>
          <Textarea maxLength={512} rows={3} value={state.description ?? ""} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div>
          <Label>Email de contacto</Label>
          <Input type="email" value={state.email ?? ""} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div>
          <Label>Dirección</Label>
          <Input value={state.address ?? ""} onChange={(e) => update("address", e.target.value)} />
        </div>
        <div>
          <Label>Vertical</Label>
          <Select value={state.vertical ?? ""} onValueChange={(v) => update("vertical", v)}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              {["OTHER","AUTO","BEAUTY","APPAREL","EDU","ENTERTAIN","EVENT_PLAN","FINANCE","GROCERY","GOVT","HOTEL","HEALTH","NONPROFIT","PROF_SERVICES","RETAIL","TRAVEL","RESTAURANT"].map(v =>
                <SelectItem key={v} value={v}>{v}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Sitio web</Label>
          <Input placeholder="https://" value={state.websites?.[0] ?? ""} onChange={(e) => update("websites", [e.target.value])} />
        </div>
        <div className="md:col-span-2 flex justify-end pt-2">
          <Button onClick={() => save.mutate(state)} disabled={save.isPending || !form}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// -------- Templates --------
function TemplatesTab({ connected }: { connected: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsAppTemplates);
  const delFn = useServerFn(deleteWhatsAppTemplate);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["whatsapp", "templates"],
    queryFn: () => listFn(),
    enabled: connected,
  });
  const del = useMutation({
    mutationFn: (name: string) => delFn({ data: { name } }),
    onSuccess: () => { toast.success("Plantilla eliminada"); qc.invalidateQueries({ queryKey: ["whatsapp", "templates"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return data.filter((t: any) =>
      (status === "all" || t.status === status) &&
      (!qq || t.name?.toLowerCase().includes(qq) || t.category?.toLowerCase().includes(qq))
    );
  }, [data, q, status]);

  if (!connected) return <EmptyConnect />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar plantilla…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="APPROVED">Aprobadas</SelectItem>
            <SelectItem value="PENDING">Pendientes</SelectItem>
            <SelectItem value="REJECTED">Rechazadas</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <TemplateCreateDialog open={open} onOpenChange={setOpen} />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? <Skeleton className="h-72" /> : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sin plantillas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                    <TableCell>{t.language}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "APPROVED" ? "default" : t.status === "REJECTED" ? "destructive" : "secondary"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar "{t.name}"</AlertDialogTitle>
                            <AlertDialogDescription>Meta eliminará esta plantilla. Esta acción no se puede deshacer.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => del.mutate(t.name)}>Eliminar</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createWhatsAppTemplate);
  const [form, setForm] = useState({ name: "", language: "es_MX", category: "UTILITY" as const, body: "", footer: "" });
  const create = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => {
      toast.success("Plantilla enviada a Meta para revisión");
      qc.invalidateQueries({ queryKey: ["whatsapp", "templates"] });
      onOpenChange(false);
      setForm({ name: "", language: "es_MX", category: "UTILITY", body: "", footer: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><FileText className="mr-2 h-4 w-4" />Nueva plantilla</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear plantilla de mensaje</DialogTitle>
          <DialogDescription>Meta revisará la plantilla antes de aprobarla (~1h).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div><Label>Nombre técnico</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} placeholder="bienvenida_general" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Idioma</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="es_MX">Español (MX)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en_US">Inglés (US)</SelectItem>
                  <SelectItem value="pt_BR">Portugués (BR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Categoría</Label>
              <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">Utilidad</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticación</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Cuerpo del mensaje</Label><Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Hola {{1}}, gracias por contactarnos." /></div>
          <div><Label>Footer (opcional)</Label><Input maxLength={60} value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name || !form.body}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar a Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Metrics --------
function MetricsTab() {
  const metricsFn = useServerFn(getWhatsAppMetrics);
  const { data } = useQuery({ queryKey: ["whatsapp", "metrics"], queryFn: () => metricsFn() });
  useRealtimeInvalidate({ channel: "wa-metrics", tables: ["messages"], invalidate: [["whatsapp", "metrics"]] });

  const max = Math.max(1, ...(data?.series ?? []).map((d: any) => d.in + d.out));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Últimas 24h" inCount={data?.buckets.d1.in ?? 0} outCount={data?.buckets.d1.out ?? 0} />
        <MetricCard label="Últimos 7 días" inCount={data?.buckets.d7.in ?? 0} outCount={data?.buckets.d7.out ?? 0} />
        <MetricCard label="Últimos 30 días" inCount={data?.buckets.d30.in ?? 0} outCount={data?.buckets.d30.out ?? 0} />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Entregas</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(data?.statusCount ?? {}).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="capitalize text-muted-foreground">{k}</span><span className="tabular-nums font-medium">{v as number}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Volumen diario (30d)</CardTitle></CardHeader>
        <CardContent>
          {!data?.series?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin datos aún.</p>
          ) : (
            <div className="flex h-56 items-end gap-1">
              {data.series.map((d: any) => {
                const total = d.in + d.out;
                const h = (total / max) * 100;
                return (
                  <div key={d.date} className="group flex-1 relative">
                    <div className="mx-auto flex w-full max-w-[24px] flex-col-reverse rounded-t bg-muted overflow-hidden" style={{ height: `${h}%` }}>
                      <div className="bg-primary" style={{ height: `${(d.out / Math.max(1,total)) * 100}%` }} />
                      <div className="bg-emerald-500" style={{ height: `${(d.in / Math.max(1,total)) * 100}%` }} />
                    </div>
                    <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-0.5 text-[10px] text-background opacity-0 group-hover:opacity-100">
                      {d.date}: {d.in} IN / {d.out} OUT
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Entrantes</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" />Salientes</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, inCount, outCount }: { label: string; inCount: number; outCount: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <div className="font-display text-2xl font-semibold tabular-nums">{inCount + outCount}</div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{inCount} entrantes</span><span>{outCount} salientes</span>
        </div>
      </CardContent>
    </Card>
  );
}

// -------- Test send --------
function TestTab({ connected }: { connected: boolean }) {
  const sendFn = useServerFn(sendTestWhatsAppMessage);
  const [to, setTo] = useState("");
  const [text, setText] = useState("Hola desde Dialen 👋");
  const send = useMutation({
    mutationFn: () => sendFn({ data: { to, text } }),
    onSuccess: () => toast.success("Mensaje enviado"),
    onError: (e: any) => toast.error(e.message),
  });
  if (!connected) return <EmptyConnect />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enviar mensaje de prueba</CardTitle>
        <p className="text-xs text-muted-foreground">Útil para validar la conexión. Solo funciona con números que hayan escrito primero (ventana de 24h) o con plantillas aprobadas.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Número destino</Label><Input placeholder="+52 55 1234 5678" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><Label>Mensaje</Label><Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div className="flex justify-end"><Button onClick={() => send.mutate()} disabled={send.isPending || !to || !text}>
          {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar
        </Button></div>
      </CardContent>
    </Card>
  );
}

// -------- Webhook --------
function WebhookTab({ channel }: { channel: any }) {
  const qc = useQueryClient();
  const rotateFn = useServerFn(rotateWhatsAppVerifyToken);
  const rotate = useMutation({
    mutationFn: () => rotateFn(),
    onSuccess: () => { toast.success("Token rotado"); qc.invalidateQueries({ queryKey: CHANNEL_KEY }); },
    onError: (e: any) => toast.error(e.message),
  });
  const url = typeof window !== "undefined" ? `${window.location.origin}/api/public/whatsapp/webhook` : "";
  return (
    <div className="space-y-4">
      <Alert>
        <PlugZap className="h-4 w-4" />
        <AlertTitle>Webhook automático</AlertTitle>
        <AlertDescription>Al conectar con Meta, Dialen se suscribe automáticamente. Solo necesitas estos valores si configuras el webhook manualmente.</AlertDescription>
      </Alert>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <CopyRow label="URL del webhook" value={url} />
          <CopyRow label="Verify token" value={channel?.webhook_verify_token ?? "—"} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
              <RefreshCw className="mr-2 h-4 w-4" />Rotar token
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{value}</code>
        <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// -------- Diagnostics --------
function DiagnosticsTab() {
  const diagFn = useServerFn(getWhatsAppDiagnostics);
  const { data, refetch, isFetching } = useQuery({ queryKey: ["whatsapp", "diag"], queryFn: () => diagFn() });
  const s = data?.server;
  const ok = (b: boolean | null | undefined) => b ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Diagnóstico del servidor</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Reintentar
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="META_APP_ID configurado" ok={ok(s?.meta_app_id_set)} extra={s?.meta_app_id_preview ?? undefined} />
        <Row label="META_APP_SECRET configurado" ok={ok(s?.meta_app_secret_set)} />
        <Row label="Versión Graph API" ok={<Badge variant="outline">{s?.graph_version}</Badge>} />
        <Row label="Meta App alcanzable" ok={ok(s?.meta_app_reachable)} extra={s?.meta_app_error ?? undefined} />
        <Alert className="mt-4">
          <ExternalLink className="h-4 w-4" />
          <AlertDescription>
            Si algo falla, verifica que las variables <code>META_APP_ID</code>, <code>META_APP_SECRET</code> y <code>META_GRAPH_API_VERSION</code> estén configuradas en el backend y que la URL actual esté en los dominios permitidos del App en Meta.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function Row({ label, ok, extra }: { label: string; ok: React.ReactNode; extra?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div>
        <div className="font-medium">{label}</div>
        {extra ? <div className="text-xs text-muted-foreground">{extra}</div> : null}
      </div>
      {ok}
    </div>
  );
}

function EmptyConnect() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        Conecta primero tu WhatsApp para usar este apartado.
      </CardContent>
    </Card>
  );
}
