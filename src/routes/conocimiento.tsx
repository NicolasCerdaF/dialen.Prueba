import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  BookOpen,
  Upload,
  Trash2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Sparkles,
  Pin,
  PinOff,
  RefreshCw,
  Download,
  MoreHorizontal,
  Tag,
  Folder,
  Clock,
  BarChart3,
  History,
  FileStack,
  Plus,
  Copy,
  MessageSquare,
  TrendingUp,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  listKnowledgeAdvanced,
  ingestKnowledgeDocument,
  createKnowledgeFromText,
  deleteKnowledgeDocument,
  updateKnowledgeMetadata,
  bulkKnowledgeAction,
  reembedKnowledgeDocument,
  summarizeAndTagKnowledge,
  getKnowledgeAggregate,
  getKnowledgeDetail,
  listKnowledgeEvents,
  exportKnowledgeBundle,
  searchKnowledge,
  type KnowledgeDocFull,
} from "@/lib/knowledge.functions";
import { isSupported, parseFile } from "@/lib/knowledge-parse";
import { useAuth } from "@/lib/auth-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/conocimiento")({
  head: () => ({
    meta: [
      { title: "Conocimiento Empresarial · Dialen" },
      {
        name: "description",
        content:
          "Centro de conocimiento para tu IA de ventas: sube manuales, catálogos y guiones, mide qué se cita y mantén todo al día.",
      },
    ],
  }),
  component: KnowledgePage,
});

// ---------- helpers ----------

function statusMeta(status: KnowledgeDocFull["status"]) {
  switch (status) {
    case "ready":
      return { icon: CheckCircle2, label: "Listo", tone: "text-emerald-500" };
    case "processing":
    case "uploading":
      return { icon: Loader2, label: "Procesando", tone: "text-blue-500", spin: true };
    case "failed":
      return { icon: AlertCircle, label: "Error", tone: "text-destructive" };
    default:
      return { icon: FileText, label: status, tone: "text-muted-foreground" };
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "hace segs";
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  const days = Math.floor(s / 86400);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString();
}

function eventLabel(t: string): string {
  return (
    ({
      created: "Creado",
      updated: "Editado",
      deleted: "Eliminado",
      reprocessed: "Reprocesado",
      summarized: "Resumen IA",
      tagged: "Etiquetas",
      pinned: "Fijado",
      unpinned: "Desfijado",
      moved: "Movido",
      failed: "Error",
    } as Record<string, string>)[t] ?? t
  );
}

function download(name: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Root ----------

function KnowledgePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { role } = useAuth();
  const canManage = role === "admin" || role === "manager";

  const [tab, setTab] = useState<"docs" | "search" | "analytics" | "audit">("docs");

  useRealtimeInvalidate({
    channel: "knowledge-page",
    tables: ["knowledge_documents", "knowledge_document_events", "knowledge_usage"],
    invalidate: [["knowledge"]],
  });

  const listFn = useServerFn(listKnowledgeAdvanced);
  const aggFn = useServerFn(getKnowledgeAggregate);
  const ingestFn = useServerFn(ingestKnowledgeDocument);
  const bulkFn = useServerFn(bulkKnowledgeAction);
  const exportFn = useServerFn(exportKnowledgeBundle);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sort, setSort] = useState<"recent" | "name" | "size" | "chunks" | "used">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const listQuery = useQuery({
    queryKey: ["knowledge", "list", { search, status, tagFilter, pinnedOnly, sort }],
    queryFn: () =>
      listFn({
        data: {
          search: search || null,
          status: status === "all" ? undefined : ([status] as any),
          tags: tagFilter === "all" ? undefined : [tagFilter],
          pinned: pinnedOnly || undefined,
          sort,
          limit: 100,
          offset: 0,
        },
      }),
    refetchInterval: (q) => {
      const rows = (q.state.data as any)?.rows as KnowledgeDocFull[] | undefined;
      return rows?.some((d) => d.status === "processing" || d.status === "uploading") ? 3500 : false;
    },
  });

  const aggQuery = useQuery({
    queryKey: ["knowledge", "aggregate"],
    queryFn: () => aggFn(),
  });

  const docs = listQuery.data?.rows ?? [];
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) for (const t of d.tags ?? []) s.add(t);
    return Array.from(s).sort();
  }, [docs]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!isSupported(file)) {
        toast.error(`${file.name}: formato no soportado`);
        continue;
      }
      setBusyFile(file.name);
      try {
        toast.info(`Extrayendo texto de ${file.name}…`);
        const parsed = await parseFile(file);
        toast.info(`Indexando ${file.name}…`);
        const res = await ingestFn({
          data: {
            name: parsed.name,
            type: parsed.type,
            size_bytes: parsed.size,
            text: parsed.text,
          },
        });
        toast.success(`${file.name}: ${res.chunks} fragmentos indexados`);
        qc.invalidateQueries({ queryKey: ["knowledge"] });
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message ?? "error procesando"}`);
      } finally {
        setBusyFile(null);
      }
    }
    router.invalidate();
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const bulkMut = useMutation({
    mutationFn: (vars: any) => bulkFn({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(`Acción "${vars.action}" aplicada`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  async function doExport(scope: "selected" | "all") {
    try {
      const ids = scope === "selected" ? Array.from(selected) : undefined;
      const bundle = await exportFn({ data: ids ? { ids } : {} });
      download(`knowledge-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2));
      toast.success(`Exportado (${bundle.count} documentos)`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo exportar");
    }
  }

  const agg = aggQuery.data;

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-8 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
                <BookOpen className="h-5 w-5 text-primary" />
                Conocimiento Empresarial
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Centro documental que alimenta a tu IA en cada conversación. Todo lo que subas se cita
                automáticamente cuando aporta valor.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown"
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["knowledge"] })}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refrescar
              </Button>
              {canManage && (
                <>
                  <NewFromTextDialog
                    onCreated={() => qc.invalidateQueries({ queryKey: ["knowledge"] })}
                  />
                  <Button
                    onClick={() => inputRef.current?.click()}
                    disabled={!!busyFile}
                    size="sm"
                  >
                    {busyFile ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> {busyFile.slice(0, 22)}
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-3.5 w-3.5" /> Subir documento
                      </>
                    )}
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Exportar</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => doExport("all")}>
                    <Download className="mr-2 h-4 w-4" /> Exportar todos (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!selected.size}
                    onClick={() => doExport("selected")}
                  >
                    <Download className="mr-2 h-4 w-4" /> Exportar seleccionados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* KPI strip */}
          {agg && (
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
              <KPI label="Documentos" value={agg.total} icon={FileText} />
              <KPI label="Listos" value={agg.ready} icon={CheckCircle2} tone="emerald" />
              <KPI label="Procesando" value={agg.processing} icon={Loader2} tone="blue" />
              <KPI label="Con error" value={agg.failed} icon={AlertCircle} tone="rose" />
              <KPI label="Fragmentos" value={agg.total_chunks} icon={FileStack} />
              <KPI label="Citas 7d" value={agg.usage_7d} icon={TrendingUp} tone="violet" />
            </div>
          )}

          {/* Alerts strip */}
          {agg && (agg.failed > 0 || agg.processing > 0 || agg.stale_ids.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {agg.failed > 0 && (
                <div className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {agg.failed} con error — revisa o reprocesa
                </div>
              )}
              {agg.processing > 0 && (
                <div className="inline-flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 text-xs text-blue-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {agg.processing} en indexación
                </div>
              )}
              {agg.stale_ids.length > 0 && (
                <div className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-600">
                  <Clock className="h-3.5 w-3.5" />
                  {agg.stale_ids.length} sin uso en 30 días
                </div>
              )}
            </div>
          )}
        </header>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-8 mt-4 justify-start bg-transparent p-0">
            <TabsTrigger value="docs">
              <FileStack className="mr-2 h-3.5 w-3.5" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="mr-2 h-3.5 w-3.5" /> Buscar (IA)
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-2 h-3.5 w-3.5" /> Analítica
            </TabsTrigger>
            <TabsTrigger value="audit">
              <History className="mr-2 h-3.5 w-3.5" /> Auditoría
            </TabsTrigger>
          </TabsList>

          {/* Docs tab */}
          <TabsContent value="docs" className="flex-1 overflow-y-auto p-8 pt-4">
            <Card className="p-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre, título, resumen…"
                    className="pl-8"
                  />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="ready">Listos</SelectItem>
                    <SelectItem value="processing">Procesando</SelectItem>
                    <SelectItem value="failed">Con error</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Etiqueta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las etiquetas</SelectItem>
                    {allTags.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => setSort(v as any)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Más recientes</SelectItem>
                    <SelectItem value="name">Nombre A-Z</SelectItem>
                    <SelectItem value="size">Peso</SelectItem>
                    <SelectItem value="chunks">Fragmentos</SelectItem>
                    <SelectItem value="used">Más citados</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={pinnedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPinnedOnly((v) => !v)}
                >
                  <Pin className="mr-2 h-3.5 w-3.5" /> Fijados
                </Button>
              </div>

              {/* Bulk bar */}
              {selected.size > 0 && canManage && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selected.size} seleccionados</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulkMut.mutate({ ids: Array.from(selected), action: "pin" })
                      }
                    >
                      <Pin className="mr-2 h-3.5 w-3.5" /> Fijar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulkMut.mutate({ ids: Array.from(selected), action: "unpin" })
                      }
                    >
                      <PinOff className="mr-2 h-3.5 w-3.5" /> Quitar fijado
                    </Button>
                    <TagBulkDialog
                      onApply={(tag, op) =>
                        bulkMut.mutate({
                          ids: Array.from(selected),
                          action: op,
                          tag,
                        })
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => doExport("selected")}>
                      <Download className="mr-2 h-3.5 w-3.5" /> Exportar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar {selected.size} documentos</AlertDialogTitle>
                          <AlertDialogDescription>
                            La IA dejará de citarlos y se perderán todos los fragmentos indexados.
                            Esta acción no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              bulkMut.mutate({ ids: Array.from(selected), action: "delete" })
                            }
                          >
                            Eliminar definitivamente
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Docs list */}
              <div className="mt-4">
                {listQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                  </div>
                ) : docs.length === 0 ? (
                  <EmptyState
                    canManage={canManage}
                    onUpload={() => inputRef.current?.click()}
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {docs.map((d) => (
                      <DocRow
                        key={d.id}
                        doc={d}
                        selected={selected.has(d.id)}
                        onToggle={() => toggleSelect(d.id)}
                        onOpen={() => setDetailId(d.id)}
                        canManage={canManage}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="flex-1 overflow-y-auto p-8 pt-4">
            <SearchPlayground />
          </TabsContent>

          <TabsContent value="analytics" className="flex-1 overflow-y-auto p-8 pt-4">
            <AnalyticsPanel agg={agg} onOpenDoc={(id) => setDetailId(id)} />
          </TabsContent>

          <TabsContent value="audit" className="flex-1 overflow-y-auto p-8 pt-4">
            <AuditPanel onOpenDoc={(id) => setDetailId(id)} />
          </TabsContent>
        </Tabs>

        {/* Detail sheet */}
        <DocumentSheet
          id={detailId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
        />
      </div>
    </AppShell>
  );
}

// ---------- Sub-components ----------

function KPI({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone?: "emerald" | "blue" | "rose" | "violet";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "blue"
        ? "text-blue-500"
        : tone === "rose"
          ? "text-rose-500"
          : tone === "violet"
            ? "text-violet-500"
            : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function DocRow({
  doc,
  selected,
  onToggle,
  onOpen,
  canManage,
}: {
  doc: KnowledgeDocFull;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  canManage: boolean;
}) {
  const meta = statusMeta(doc.status);
  const Icon = meta.icon;
  const spin = "spin" in meta && (meta as any).spin;
  const displayName = doc.title || doc.name;

  return (
    <li className="group flex items-center gap-3 py-3">
      {canManage && (
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="Seleccionar" />
      )}
      <button
        onClick={onOpen}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary transition hover:bg-secondary/70"
        title="Abrir detalle"
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={onOpen} className="block max-w-full truncate text-left font-medium hover:underline">
          {displayName}
          {doc.pinned && <Pin className="ml-2 inline h-3 w-3 text-amber-500" />}
        </button>
        {doc.summary && (
          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{doc.summary}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={`inline-flex items-center gap-1 ${meta.tone}`}>
            <Icon className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} />
            {meta.label}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileStack className="h-3 w-3" /> {doc.chunks_count} frag.
          </span>
          <span>{formatSize(doc.size_bytes)}</span>
          {doc.folder && (
            <span className="inline-flex items-center gap-1">
              <Folder className="h-3 w-3" /> {doc.folder}
            </span>
          )}
          <span>{relTime(doc.updated_at)}</span>
          {doc.last_used_at && (
            <span className="inline-flex items-center gap-1 text-violet-500">
              <Sparkles className="h-3 w-3" /> Citado {relTime(doc.last_used_at)}
            </span>
          )}
        </div>
        {doc.tags?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {doc.tags.slice(0, 6).map((t) => (
              <Badge key={t} variant="secondary" className="h-5 rounded text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onOpen}>
        Abrir
      </Button>
    </li>
  );
}

function EmptyState({ canManage, onUpload }: { canManage: boolean; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
      <BookOpen className="h-8 w-8 text-muted-foreground/60" />
      <div className="text-sm font-medium">Aún no hay conocimiento cargado</div>
      <div className="max-w-md text-xs text-muted-foreground">
        Sube manuales, catálogos, FAQ o guiones. La IA los citará automáticamente cuando responda por
        WhatsApp o cree cotizaciones.
      </div>
      {canManage && (
        <Button size="sm" onClick={onUpload} className="mt-2">
          <Upload className="mr-2 h-3.5 w-3.5" /> Subir el primero
        </Button>
      )}
    </div>
  );
}

function NewFromTextDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(createKnowledgeFromText);

  async function submit() {
    if (name.trim().length < 2 || text.trim().length < 20) {
      toast.error("Nombre y contenido son obligatorios (mín. 20 caracteres)");
      return;
    }
    setBusy(true);
    try {
      const r = await fn({
        data: {
          name: name.trim(),
          description: description.trim() || null,
          tags: tags
            .split(",")
            .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
            .filter(Boolean),
          text,
        },
      });
      toast.success(`Indexado: ${r.chunks} fragmentos`);
      setOpen(false);
      setName("");
      setDescription("");
      setTags("");
      setText("");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-3.5 w-3.5" /> Nuevo desde texto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo documento desde texto</DialogTitle>
          <DialogDescription>
            Ideal para FAQ, políticas o guiones cortos sin necesidad de archivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Nombre del documento (ej. FAQ envíos)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            placeholder="Etiquetas separadas por coma (ej. envios, politicas)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <Textarea
            placeholder="Pega aquí el contenido…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[220px] font-mono text-xs"
          />
          <div className="text-xs text-muted-foreground">{text.length.toLocaleString()} caracteres</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Indexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagBulkDialog({
  onApply,
}: {
  onApply: (tag: string, op: "add_tag" | "remove_tag") => void;
}) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [op, setOp] = useState<"add_tag" | "remove_tag">("add_tag");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Tag className="mr-2 h-3.5 w-3.5" /> Etiquetar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Etiquetar seleccionados</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={op} onValueChange={(v) => setOp(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add_tag">Agregar etiqueta</SelectItem>
              <SelectItem value="remove_tag">Quitar etiqueta</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="ej. politicas, faq, catalogo"
            value={tag}
            onChange={(e) => setTag(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!tag) return;
              onApply(tag, op);
              setOpen(false);
              setTag("");
            }}
          >
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentSheet({
  id,
  canManage,
  onClose,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getKnowledgeDetail);
  const updateFn = useServerFn(updateKnowledgeMetadata);
  const summarizeFn = useServerFn(summarizeAndTagKnowledge);
  const reembedFn = useServerFn(reembedKnowledgeDocument);
  const deleteFn = useServerFn(deleteKnowledgeDocument);

  const q = useQuery({
    queryKey: ["knowledge", "detail", id],
    queryFn: () => detailFn({ data: { id: id as string } }),
    enabled: !!id,
  });

  const doc = q.data?.doc;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [folder, setFolder] = useState("");
  const [tab, setTab] = useState<"info" | "chunks" | "usage" | "audit">("info");
  const [busy, setBusy] = useState<"save" | "summarize" | "reembed" | null>(null);

  // Sync state when doc loads
  useEffect(() => {
    if (doc) {
      setTitle(doc.title ?? "");
      setDescription(doc.description ?? "");
      setSummary(doc.summary ?? "");
      setTagsStr((doc.tags ?? []).join(", "));
      setFolder(doc.folder ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  async function save() {
    if (!doc) return;
    setBusy("save");
    try {
      await updateFn({
        data: {
          id: doc.id,
          title: title.trim() || null,
          description: description.trim() || null,
          summary: summary.trim() || null,
          folder: folder.trim() || null,
          tags: tagsStr
            .split(",")
            .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
            .filter(Boolean),
        },
      });
      toast.success("Cambios guardados");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setBusy(null);
    }
  }

  async function runSummarize() {
    if (!doc) return;
    setBusy("summarize");
    try {
      const r = await summarizeFn({ data: { id: doc.id } });
      setSummary(r.summary ?? "");
      setTagsStr((r.tags ?? []).join(", "));
      toast.success("Resumen y etiquetas generados por IA");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e: any) {
      toast.error(e?.message ?? "IA no disponible");
    } finally {
      setBusy(null);
    }
  }

  async function runReembed() {
    if (!doc) return;
    setBusy("reembed");
    try {
      const r = await reembedFn({ data: { id: doc.id } });
      toast.success(`Reprocesado: ${r.chunks} fragmentos`);
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo reprocesar");
    } finally {
      setBusy(null);
    }
  }

  async function togglePin() {
    if (!doc) return;
    try {
      await updateFn({ data: { id: doc.id, pinned: !doc.pinned } });
      qc.invalidateQueries({ queryKey: ["knowledge"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function del() {
    if (!doc) return;
    try {
      await deleteFn({ data: { id: doc.id } });
      toast.success("Documento eliminado");
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {!doc ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {doc.title || doc.name}
                {doc.pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
              </SheetTitle>
              <SheetDescription>
                v{doc.version} · {doc.chunks_count} fragmentos · {formatSize(doc.size_bytes)} ·{" "}
                {statusMeta(doc.status).label}
              </SheetDescription>
            </SheetHeader>

            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={runSummarize} disabled={!!busy}>
                  {busy === "summarize" ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3.5 w-3.5 text-violet-500" />
                  )}
                  Resumir con IA
                </Button>
                <Button size="sm" variant="outline" onClick={runReembed} disabled={!!busy || doc.chunks_count === 0}>
                  {busy === "reembed" ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Reprocesar
                </Button>
                <Button size="sm" variant="outline" onClick={togglePin}>
                  {doc.pinned ? (
                    <>
                      <PinOff className="mr-2 h-3.5 w-3.5" /> Desfijar
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-3.5 w-3.5" /> Fijar
                    </>
                  )}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="ml-auto">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar documento</AlertDialogTitle>
                      <AlertDialogDescription>
                        La IA dejará de citarlo. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={del}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-5">
              <TabsList>
                <TabsTrigger value="info">Ficha</TabsTrigger>
                <TabsTrigger value="chunks">Fragmentos ({q.data?.chunks.length ?? 0})</TabsTrigger>
                <TabsTrigger value="usage">Uso ({q.data?.usage.length ?? 0})</TabsTrigger>
                <TabsTrigger value="audit">Historial</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-3">
                <FieldLabel>Título mostrado</FieldLabel>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canManage}
                  placeholder={doc.name}
                />
                <FieldLabel>Descripción</FieldLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canManage}
                  className="min-h-[70px]"
                />
                <FieldLabel>Resumen (contexto para IA)</FieldLabel>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={!canManage}
                  className="min-h-[100px]"
                />
                <FieldLabel>Etiquetas (coma)</FieldLabel>
                <Input
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  disabled={!canManage}
                  placeholder="catalogo, faq, politicas"
                />
                <FieldLabel>Carpeta</FieldLabel>
                <Input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  disabled={!canManage}
                  placeholder="Ventas / Soporte / …"
                />
                <div className="pt-2 text-xs text-muted-foreground">
                  Creado {relTime(doc.created_at)} · Editado {relTime(doc.updated_at)}
                  {doc.last_used_at && ` · Último uso ${relTime(doc.last_used_at)}`}
                </div>
                {canManage && (
                  <div className="flex justify-end">
                    <Button onClick={save} disabled={busy === "save"}>
                      {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Guardar cambios
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="chunks" className="mt-4">
                {q.data?.chunks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Sin fragmentos indexados
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {q.data?.chunks.slice(0, 30).map((c) => (
                      <li key={c.chunk_index} className="rounded-md border border-border bg-card p-3">
                        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span>Fragmento #{c.chunk_index}</span>
                          <span>{c.content.length} caracteres</span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs text-foreground/90">
                          {c.content.slice(0, 500)}
                          {c.content.length > 500 && "…"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="usage" className="mt-4">
                {q.data?.usage.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    La IA aún no ha citado este documento
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {q.data?.usage.map((u) => (
                      <li key={u.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                          <span className="text-xs text-muted-foreground">
                            Fragmento #{u.chunk_index ?? "-"} · sim {(u.similarity ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{relTime(u.created_at)}</span>
                          {u.conversation_id && (
                            <Link
                              to="/conversaciones"
                              search={{ id: u.conversation_id } as any}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <MessageSquare className="h-3 w-3" /> Ver chat
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="audit" className="mt-4">
                {q.data?.events.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Sin eventos aún
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {q.data?.events.map((e) => (
                      <li key={e.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{eventLabel(e.event_type)}</span>
                          <span className="text-muted-foreground">{relTime(e.created_at)}</span>
                        </div>
                        {e.payload && (
                          <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[10px] text-muted-foreground">
                            {JSON.stringify(e.payload, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}

function SearchPlayground() {
  const searchFn = useServerFn(searchKnowledge);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(5);
  const [rows, setRows] = useState<Array<any> | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (q.trim().length < 3) {
      toast.error("Escribe al menos 3 caracteres");
      return;
    }
    setBusy(true);
    try {
      const r = await searchFn({ data: { query: q, limit } });
      setRows(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-violet-500" /> Simula lo que verá la IA
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Escribe una pregunta como si fuera un cliente por WhatsApp. Te mostramos los fragmentos que la
          IA usaría como contexto.
        </p>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="¿Cuánto cuesta el envío a Guadalajara?"
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 5, 8, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} resultados
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buscar
          </Button>
        </div>
      </Card>

      {rows === null ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Escribe una consulta para ver qué encontrará la IA.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Ningún fragmento supera el umbral de similitud. Considera enriquecer tu conocimiento.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={`${r.document_id}-${r.chunk_index}`} className="rounded-md border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{r.document_name}</span>
                  <Badge variant="secondary" className="h-5 rounded text-[10px]">
                    #{r.chunk_index}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    similitud {(r.similarity as number).toFixed(3)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(String(r.content));
                      toast.success("Copiado");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Progress value={Math.min(100, Math.max(0, r.similarity * 100))} className="mb-2 h-1" />
              <p className="whitespace-pre-wrap text-xs text-foreground/90">
                {String(r.content).slice(0, 500)}
                {String(r.content).length > 500 && "…"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnalyticsPanel({
  agg,
  onOpenDoc,
}: {
  agg: any;
  onOpenDoc: (id: string) => void;
}) {
  if (!agg) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
      </div>
    );
  }
  const maxBucket = Math.max(1, ...agg.buckets.map((b: any) => b.count));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-violet-500" /> Citas por día (7d)
        </div>
        <div className="flex h-32 items-end gap-2">
          {agg.buckets.map((b: any) => (
            <div key={b.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-violet-500/70"
                style={{ height: `${(b.count / maxBucket) * 100}%` }}
                title={`${b.count} citas`}
              />
              <div className="text-[10px] text-muted-foreground">
                {new Date(b.day).toLocaleDateString(undefined, { weekday: "short" })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>Total 7d: {agg.usage_7d}</span>
          <span>Total 30d: {agg.usage_30d}</span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-amber-500" /> Documentos más citados
        </div>
        {agg.top_docs.length === 0 ? (
          <div className="text-sm text-muted-foreground">La IA aún no cita documentos.</div>
        ) : (
          <ul className="space-y-2">
            {agg.top_docs.map((d: any) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <button className="truncate text-left hover:underline" onClick={() => onOpenDoc(d.id)}>
                  {d.name}
                </button>
                <Badge variant="secondary" className="rounded">
                  {d.count} citas
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Tag className="h-4 w-4 text-primary" /> Distribución por etiqueta
        </div>
        {agg.top_tags.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aún no hay etiquetas.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {agg.top_tags.map((t: any) => (
              <Badge key={t.tag} variant="outline" className="rounded">
                {t.tag} · {t.count}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Salud del conocimiento
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between">
            <span className="text-muted-foreground">Cobertura (docs listos)</span>
            <span className="font-medium">
              {agg.total === 0 ? "—" : `${Math.round((agg.ready / agg.total) * 100)}%`}
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Documentos con error</span>
            <span className={`font-medium ${agg.failed ? "text-destructive" : ""}`}>{agg.failed}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Sin uso 30d</span>
            <span className={`font-medium ${agg.stale_ids.length ? "text-amber-500" : ""}`}>
              {agg.stale_ids.length}
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Total caracteres indexados</span>
            <span className="font-medium">{Number(agg.total_chars ?? 0).toLocaleString()}</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

function AuditPanel({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const fn = useServerFn(listKnowledgeEvents);
  const [type, setType] = useState<string>("all");
  const q = useQuery({
    queryKey: ["knowledge", "events", type],
    queryFn: () => fn({ data: { event_type: type === "all" ? null : type, limit: 100 } }),
  });

  const types = [
    "all",
    "created",
    "updated",
    "deleted",
    "reprocessed",
    "summarized",
    "tagged",
    "pinned",
    "unpinned",
    "failed",
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "all" ? "Todos los eventos" : eventLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="p-4">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Sin eventos aún.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {q.data?.map((e: any) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <Badge variant="secondary" className="rounded">
                  {eventLabel(e.event_type)}
                </Badge>
                <button
                  className="flex-1 truncate text-left hover:underline"
                  onClick={() => e.document_id && onOpenDoc(e.document_id)}
                  disabled={!e.document_id}
                >
                  {e.document_name ?? "—"}
                </button>
                <span className="text-xs text-muted-foreground">{e.actor_name}</span>
                <span className="text-xs text-muted-foreground">{relTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
