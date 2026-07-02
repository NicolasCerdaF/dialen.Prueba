import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  BookOpen,
  Upload,
  Trash2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  listKnowledgeDocuments,
  ingestKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeDocument,
} from "@/lib/knowledge.functions";
import { isSupported, parseFile } from "@/lib/knowledge-parse";

export const Route = createFileRoute("/conocimiento")({
  head: () => ({
    meta: [
      { title: "Base de conocimiento · Dialen" },
      {
        name: "description",
        content:
          "Sube manuales, catálogos y guiones de venta para que la IA los use al responder en WhatsApp.",
      },
    ],
  }),
  component: KnowledgePage,
});

function statusMeta(status: KnowledgeDocument["status"]) {
  switch (status) {
    case "ready":
      return { icon: CheckCircle2, label: "Listo", color: "text-emerald-500" };
    case "processing":
    case "uploading":
      return { icon: Loader2, label: "Procesando", color: "text-blue-500", spin: true };
    case "failed":
      return { icon: AlertCircle, label: "Error", color: "text-destructive" };
    default:
      return { icon: FileText, label: status, color: "text-muted-foreground" };
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KnowledgePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const listFn = useServerFn(listKnowledgeDocuments);
  const ingestFn = useServerFn(ingestKnowledgeDocument);
  const deleteFn = useServerFn(deleteKnowledgeDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["knowledge", "documents"],
    queryFn: () => listFn(),
    refetchInterval: (q) => {
      const rows = q.state.data as KnowledgeDocument[] | undefined;
      return rows?.some((d) => d.status === "processing" || d.status === "uploading")
        ? 3000
        : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge", "documents"] });
      toast.success("Documento eliminado");
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    for (const file of Array.from(files)) {
      if (!isSupported(file)) {
        toast.error(`${file.name}: formato no soportado`);
        continue;
      }
      setBusy(file.name);
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
        qc.invalidateQueries({ queryKey: ["knowledge", "documents"] });
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message ?? "error procesando"}`);
      } finally {
        setBusy(null);
      }
    }
    router.invalidate();
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-card px-8 py-5">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
              <BookOpen className="h-5 w-5 text-primary" />
              Base de conocimiento
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sube manuales, catálogos y guiones. La IA los usa como contexto al responder chats.
            </p>
          </div>
          <div>
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
            <Button onClick={() => inputRef.current?.click()} disabled={!!busy} size="lg">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {busy}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Subir documento
                </>
              )}
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Documentos ({docs?.length ?? 0})
              </h2>
              <span className="text-xs text-muted-foreground">
                Formatos: PDF · DOCX · TXT · MD — máx. 15 MB
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : !docs?.length ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground/60" />
                <div className="text-sm font-medium">Aún no hay conocimiento cargado</div>
                <div className="text-xs text-muted-foreground">
                  Sube tu primer archivo para que la IA pueda consultarlo.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {docs.map((d) => {
                  const meta = statusMeta(d.status);
                  const Icon = meta.icon;
                  return (
                    <li key={d.id} className="flex items-center gap-4 py-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="truncate font-medium">{d.name}</div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className={`inline-flex items-center gap-1 ${meta.color}`}>
                            <Icon
                              className={`h-3 w-3 ${"spin" in meta && meta.spin ? "animate-spin" : ""}`}
                            />
                            {meta.label}
                          </span>
                          <span>{formatSize(d.size_bytes)}</span>
                          <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`¿Eliminar "${d.name}" de la base de conocimiento?`))
                            deleteMutation.mutate(d.id);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="mt-6 border-primary/20 bg-primary/5 p-6">
            <h3 className="text-sm font-semibold">¿Cómo lo usa la IA?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Cuando un cliente escribe en WhatsApp, la IA busca los fragmentos más relevantes de tu
              base de conocimiento y los usa como contexto para responder. Ideal para:
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>• Catálogos y fichas técnicas de productos</li>
              <li>• Guiones y objeciones de venta (playbooks)</li>
              <li>• Preguntas frecuentes y políticas</li>
              <li>• Manuales internos y procesos</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
