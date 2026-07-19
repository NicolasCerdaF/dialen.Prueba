// Base de conocimiento — server functions.
// MVP: ingesta de texto extraído en cliente + embeddings + búsqueda semántica.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiFetch } from "@/lib/ai-fetch";

const EMBEDDINGS_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH_SIZE = 32;

export type KnowledgeDocument = {
  id: string;
  name: string;
  type: string | null;
  size_bytes: number | null;
  status: "uploading" | "processing" | "ready" | "failed";
  storage_path: string | null;
  created_at: string;
};

export type KnowledgeMatch = {
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

// ---------- Utilidades ----------

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text: string): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + CHUNK_SIZE);
    let slice = clean.slice(i, end);
    // Intenta cortar en el último salto de línea o punto para no partir palabras.
    if (end < clean.length) {
      const brk = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
      if (brk > CHUNK_SIZE * 0.5) slice = slice.slice(0, brk + 1);
    }
    chunks.push(slice.trim());
    i += Math.max(1, slice.length - CHUNK_OVERLAP);
  }
  return chunks.filter((c) => c.length > 20);
}

async function embedBatch(inputs: string[], scope: string, companyId: string): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await aiFetch(
    EMBEDDINGS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMS,
      }),
    },
    { scope, companyId },
  );
  const json: any = await res.json();
  const data: any[] = json?.data ?? [];
  return data.map((d) => d.embedding as number[]);
}

// ---------- Listar ----------

export const listKnowledgeDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, name, type, size_bytes, status, storage_path, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as KnowledgeDocument[];
  });

// ---------- Ingesta ----------

const IngestSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().max(120).nullable().optional(),
  size_bytes: z.number().int().nonnegative().nullable().optional(),
  storage_path: z.string().max(500).nullable().optional(),
  text: z.string().min(1).max(2_000_000), // ~2MB de texto
});

export const ingestKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IngestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // 1) Compañía del usuario
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error("Sin compañía");

    // 2) Crea documento (status processing)
    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .insert({
        company_id: companyId,
        name: data.name,
        type: data.type ?? null,
        size_bytes: data.size_bytes ?? null,
        storage_path: data.storage_path ?? null,
        status: "processing",
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (docErr || !doc) throw new Error(docErr?.message ?? "No se pudo crear documento");

    // 3) Chunking + embeddings
    try {
      const chunks = chunkText(data.text);
      if (chunks.length === 0) throw new Error("Documento vacío tras el parseo");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      let inserted = 0;
      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
        const embeddings = await embedBatch(batch, "knowledge-embed", companyId);
        if (embeddings.length !== batch.length) {
          throw new Error("Respuesta de embeddings inconsistente");
        }
        const rows = batch.map((content, k) => ({
          document_id: doc.id,
          company_id: companyId,
          chunk_index: i + k,
          content,
          embedding: embeddings[k] as unknown as string,
        }));
        const { error: insErr } = await supabaseAdmin.from("knowledge_chunks").insert(rows);
        if (insErr) throw new Error(insErr.message);
        inserted += rows.length;
      }

      await supabase.from("knowledge_documents").update({ status: "ready" }).eq("id", doc.id);
      return { id: doc.id, chunks: inserted };
    } catch (e: any) {
      await supabase.from("knowledge_documents").update({ status: "failed" }).eq("id", doc.id);
      throw new Error(e?.message ?? "Error procesando documento");
    }
  });

// ---------- Eliminar ----------

export const deleteKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("knowledge_documents")
      .select("id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) return { ok: true };
    // Storage (best effort)
    if (doc.storage_path) {
      try {
        await supabase.storage.from("knowledge").remove([doc.storage_path]);
      } catch {}
    }
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Búsqueda semántica ----------

export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().min(2).max(2000),
        limit: z.number().int().min(1).max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = profile?.company_id;
    if (!companyId) return [] as KnowledgeMatch[];

    const [embedding] = await embedBatch([data.query], "knowledge-search", companyId);
    if (!embedding) return [];

    const { data: rows, error } = await supabase.rpc("match_knowledge", {
      _company_id: companyId,
      query_embedding: embedding as unknown as string,
      match_count: data.limit ?? 5,
    });
    if (error) throw new Error(error.message);

    const docIds = Array.from(new Set((rows ?? []).map((r: any) => r.document_id))) as string[];
    const nameMap = new Map<string, string>();
    if (docIds.length) {
      const { data: docs } = await supabase
        .from("knowledge_documents")
        .select("id, name")
        .in("id", docIds);
      for (const d of docs ?? []) nameMap.set(d.id, d.name);
    }
    return (rows ?? []).map((r: any) => ({
      document_id: r.document_id,
      document_name: nameMap.get(r.document_id) ?? "Documento",
      chunk_index: r.chunk_index,
      content: r.content,
      similarity: r.similarity,
    })) as KnowledgeMatch[];
  });

// =========================================================================
// PRODUCTION EXTENSIONS
// =========================================================================

async function getCompanyId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!data?.company_id) throw new Error("Sin compañía");
  return data.company_id as string;
}

async function requireManager(supabase: any, userId: string, companyId: string) {
  const { data } = await supabase.rpc("is_manager_or_admin", {
    _user_id: userId,
    _company_id: companyId,
  });
  if (!data) throw new Error("Requiere rol admin o manager");
}

async function logEvent(
  supabase: any,
  companyId: string,
  userId: string,
  documentId: string | null,
  eventType: string,
  payload: Record<string, unknown> | null = null,
) {
  try {
    await supabase.from("knowledge_document_events").insert({
      company_id: companyId,
      document_id: documentId,
      actor_id: userId,
      event_type: eventType,
      payload,
    });
  } catch {
    /* best-effort */
  }
}

// ---------- Listado avanzado ----------

export type KnowledgeDocFull = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  tags: string[];
  folder: string | null;
  pinned: boolean;
  version: number;
  type: string | null;
  size_bytes: number | null;
  chars: number | null;
  chunks_count: number;
  status: "uploading" | "processing" | "ready" | "failed";
  storage_path: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  last_used_at: string | null;
};

const AdvancedListSchema = z.object({
  search: z.string().max(200).optional().nullable(),
  status: z.array(z.enum(["uploading", "processing", "ready", "failed"])).optional(),
  tags: z.array(z.string()).max(20).optional(),
  folder: z.string().max(200).optional().nullable(),
  pinned: z.boolean().optional(),
  sort: z
    .enum(["recent", "name", "size", "chunks", "used"])
    .default("recent"),
  limit: z.number().int().min(1).max(200).default(60),
  offset: z.number().int().min(0).default(0),
});

export const listKnowledgeAdvanced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdvancedListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);

    const sel = (s: string): string => s;
    let q: any = supabase
      .from("knowledge_documents")
      .select(
        sel(
          "id, name, title, description, summary, tags, folder, pinned, version, type, size_bytes, chars, chunks_count, status, storage_path, created_at, updated_at, updated_by, last_used_at",
        ),
        { count: "exact" },
      )
      .eq("company_id", companyId);

    if (data.search && data.search.trim().length > 0) {
      const term = `%${data.search.trim()}%`;
      q = q.or(
        `name.ilike.${term},title.ilike.${term},description.ilike.${term},summary.ilike.${term}`,
      );
    }
    if (data.status?.length) q = q.in("status", data.status);
    if (data.tags?.length) q = q.contains("tags", data.tags);
    if (data.folder) q = q.eq("folder", data.folder);
    if (data.pinned === true) q = q.eq("pinned", true);

    switch (data.sort) {
      case "name":
        q = q.order("name", { ascending: true });
        break;
      case "size":
        q = q.order("size_bytes", { ascending: false, nullsFirst: false });
        break;
      case "chunks":
        q = q.order("chunks_count", { ascending: false });
        break;
      case "used":
        q = q.order("last_used_at", { ascending: false, nullsFirst: false });
        break;
      default:
        q = q.order("pinned", { ascending: false }).order("created_at", { ascending: false });
    }
    q = q.range(data.offset, data.offset + data.limit - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as KnowledgeDocFull[], total: count ?? 0 };
  });

// ---------- Detalle de documento ----------

export const getKnowledgeDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);

    const { data: doc, error } = await supabase
      .from("knowledge_documents")
      .select(
        "id, name, title, description, summary, tags, folder, pinned, version, type, size_bytes, chars, chunks_count, status, storage_path, created_at, updated_at, updated_by, last_used_at",
      )
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento no encontrado");

    const [chunksRes, eventsRes, usageRes] = await Promise.all([
      supabase
        .from("knowledge_chunks")
        .select("chunk_index, content")
        .eq("document_id", data.id)
        .eq("company_id", companyId)
        .order("chunk_index", { ascending: true })
        .limit(30),
      supabase
        .from("knowledge_document_events")
        .select("id, event_type, payload, actor_id, created_at")
        .eq("document_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("knowledge_usage")
        .select("id, similarity, chunk_index, conversation_id, created_at")
        .eq("document_id", data.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    return {
      doc: doc as KnowledgeDocFull,
      chunks: (chunksRes.data ?? []) as Array<{ chunk_index: number; content: string }>,
      events: (eventsRes.data ?? []) as Array<{
        id: string;
        event_type: string;
        payload: any;
        actor_id: string | null;
        created_at: string;
      }>,
      usage: (usageRes.data ?? []) as Array<{
        id: string;
        similarity: number | null;
        chunk_index: number | null;
        conversation_id: string | null;
        created_at: string;
      }>,
    };
  });

// ---------- Actualizar metadatos ----------

const UpdateMetaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  folder: z.string().max(120).nullable().optional(),
  pinned: z.boolean().optional(),
});

export const updateKnowledgeMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateMetaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await requireManager(supabase, userId, companyId);

    const patch: Record<string, unknown> = { updated_by: userId };
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.folder !== undefined) patch.folder = data.folder;
    if (data.pinned !== undefined) patch.pinned = data.pinned;

    const { error } = await supabase
      .from("knowledge_documents")
      .update(patch as any)
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    await logEvent(supabase, companyId, userId, data.id, "updated", { fields: Object.keys(patch) });
    return { ok: true };
  });

// ---------- Bulk actions ----------

const BulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["delete", "pin", "unpin", "add_tag", "remove_tag", "move_folder"]),
  tag: z.string().min(1).max(40).optional(),
  folder: z.string().max(120).nullable().optional(),
});

export const bulkKnowledgeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BulkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await requireManager(supabase, userId, companyId);

    if (data.action === "delete") {
      // Retrieve storage_paths for cleanup
      const { data: docs } = await supabase
        .from("knowledge_documents")
        .select("id, storage_path")
        .eq("company_id", companyId)
        .in("id", data.ids);
      const paths = (docs ?? []).map((d: any) => d.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        try {
          await supabase.storage.from("knowledge").remove(paths);
        } catch {
          /* best-effort */
        }
      }
      const { error } = await supabase
        .from("knowledge_documents")
        .delete()
        .eq("company_id", companyId)
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      for (const id of data.ids) await logEvent(supabase, companyId, userId, id, "deleted");
      return { ok: true, affected: data.ids.length };
    }

    if (data.action === "pin" || data.action === "unpin") {
      const { error } = await supabase
        .from("knowledge_documents")
        .update({ pinned: data.action === "pin", updated_by: userId })
        .eq("company_id", companyId)
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      for (const id of data.ids)
        await logEvent(supabase, companyId, userId, id, data.action === "pin" ? "pinned" : "unpinned");
      return { ok: true, affected: data.ids.length };
    }

    if (data.action === "move_folder") {
      const { error } = await supabase
        .from("knowledge_documents")
        .update({ folder: data.folder ?? null, updated_by: userId })
        .eq("company_id", companyId)
        .in("id", data.ids);
      if (error) throw new Error(error.message);
      for (const id of data.ids)
        await logEvent(supabase, companyId, userId, id, "moved", { folder: data.folder });
      return { ok: true, affected: data.ids.length };
    }

    if (data.action === "add_tag" || data.action === "remove_tag") {
      if (!data.tag) throw new Error("Falta la etiqueta");
      // Fetch current tags then patch client-side (avoids array RPCs).
      const { data: docs } = await supabase
        .from("knowledge_documents")
        .select("id, tags")
        .eq("company_id", companyId)
        .in("id", data.ids);
      for (const d of docs ?? []) {
        const existing = new Set<string>((d as any).tags ?? []);
        if (data.action === "add_tag") existing.add(data.tag);
        else existing.delete(data.tag);
        await supabase
          .from("knowledge_documents")
          .update({ tags: Array.from(existing), updated_by: userId })
          .eq("id", (d as any).id);
      }
      for (const id of data.ids)
        await logEvent(supabase, companyId, userId, id, "tagged", {
          op: data.action,
          tag: data.tag,
        });
      return { ok: true, affected: (docs ?? []).length };
    }

    throw new Error("Acción no soportada");
  });

// ---------- Crear desde texto pegado ----------

const CreateFromTextSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  folder: z.string().max(120).nullable().optional(),
  text: z.string().min(20).max(2_000_000),
});

export const createKnowledgeFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateFromTextSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await requireManager(supabase, userId, companyId);

    const { data: doc, error } = await supabase
      .from("knowledge_documents")
      .insert({
        company_id: companyId,
        name: data.name,
        title: data.title ?? null,
        description: data.description ?? null,
        tags: data.tags ?? [],
        folder: data.folder ?? null,
        type: "text/plain",
        size_bytes: data.text.length,
        chars: data.text.length,
        status: "processing",
        uploaded_by: userId,
        updated_by: userId,
      } as any)
      .select("id")
      .single();
    if (error || !doc) throw new Error(error?.message ?? "No se pudo crear documento");
    await logEvent(supabase, companyId, userId, doc.id, "created", { source: "text" });

    try {
      const chunks = chunkText(data.text);
      if (chunks.length === 0) throw new Error("Texto vacío");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let inserted = 0;
      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
        const embeddings = await embedBatch(batch, "knowledge-embed", companyId);
        if (embeddings.length !== batch.length) throw new Error("Embeddings inconsistentes");
        const rows = batch.map((content, k) => ({
          document_id: doc.id,
          company_id: companyId,
          chunk_index: i + k,
          content,
          embedding: embeddings[k] as unknown as string,
        }));
        const { error: insErr } = await supabaseAdmin.from("knowledge_chunks").insert(rows);
        if (insErr) throw new Error(insErr.message);
        inserted += rows.length;
      }
      await supabase
        .from("knowledge_documents")
        .update({ status: "ready", chars: data.text.length } as any)
        .eq("id", doc.id);
      return { id: doc.id, chunks: inserted };
    } catch (e: any) {
      await supabase.from("knowledge_documents").update({ status: "failed" }).eq("id", doc.id);
      await logEvent(supabase, companyId, userId, doc.id, "failed", { err: String(e?.message ?? e) });
      throw new Error(e?.message ?? "Error procesando texto");
    }
  });

// ---------- Reprocesar (regenera embeddings desde chunks existentes) ----------
// Nota: no re-parseamos el archivo. Regeneramos embeddings del contenido ya indexado.

export const reembedKnowledgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await requireManager(supabase, userId, companyId);

    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("id, chunk_index, content")
      .eq("document_id", data.id)
      .eq("company_id", companyId)
      .order("chunk_index", { ascending: true });
    if (!chunks?.length) throw new Error("No hay fragmentos que reprocesar");

    await supabase.from("knowledge_documents").update({ status: "processing" }).eq("id", data.id);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
        const embs = await embedBatch(
          batch.map((c: any) => c.content as string),
          "knowledge-reembed",
          companyId,
        );
        for (let k = 0; k < batch.length; k++) {
          await supabaseAdmin
            .from("knowledge_chunks")
            .update({ embedding: embs[k] as unknown as string })
            .eq("id", (batch[k] as any).id);
        }
      }
      const { data: cur } = await supabase
        .from("knowledge_documents")
        .select("version")
        .eq("id", data.id)
        .maybeSingle();
      const nextVersion = ((cur?.version as number | undefined) ?? 1) + 1;
      await supabase
        .from("knowledge_documents")
        .update({ status: "ready", version: nextVersion } as any)
        .eq("id", data.id);
      await logEvent(supabase, companyId, userId, data.id, "reprocessed", { chunks: chunks.length });
      return { ok: true, chunks: chunks.length };
    } catch (e: any) {
      await supabase.from("knowledge_documents").update({ status: "failed" }).eq("id", data.id);
      await logEvent(supabase, companyId, userId, data.id, "failed", { stage: "reembed" });
      throw new Error(e?.message ?? "Error reprocesando");
    }
  });

// ---------- IA: resumen + etiquetas sugeridas ----------

export const summarizeAndTagKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    await requireManager(supabase, userId, companyId);

    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("content")
      .eq("document_id", data.id)
      .eq("company_id", companyId)
      .order("chunk_index", { ascending: true })
      .limit(12);
    if (!chunks?.length) throw new Error("Sin contenido indexado");

    const sample = chunks
      .map((c: any) => String(c.content))
      .join("\n---\n")
      .slice(0, 8000);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const res = await aiFetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Eres un asistente que resume documentos empresariales para ventas por WhatsApp. Responde SOLO con JSON válido en el formato: {\"summary\":\"2-3 frases\",\"tags\":[\"kebab-case\",...],\"category\":\"catalogo|faq|politicas|playbook|manual|otro\"}",
            },
            {
              role: "user",
              content: `Resume estos fragmentos de un documento y sugiere 3-6 etiquetas cortas en kebab-case.\n\n${sample}`,
            },
          ],
          temperature: 0.2,
        }),
      },
      { scope: "knowledge-summarize", companyId, timeoutMs: 30_000 },
    );
    const json: any = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { summary?: string; tags?: string[]; category?: string } = {};
    try {
      const cleaned = String(raw).replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: String(raw).slice(0, 500) };
    }
    const summary = (parsed.summary ?? "").toString().slice(0, 2000) || null;
    const suggestedTags = Array.isArray(parsed.tags)
      ? parsed.tags.slice(0, 8).map((t) => String(t).toLowerCase().replace(/\s+/g, "-").slice(0, 40))
      : [];
    const category = parsed.category ? String(parsed.category).slice(0, 40) : null;

    // Merge tags into existing
    const { data: cur } = await supabase
      .from("knowledge_documents")
      .select("tags")
      .eq("id", data.id)
      .maybeSingle();
    const merged = Array.from(new Set([...(cur?.tags ?? []), ...suggestedTags]));

    await supabase
      .from("knowledge_documents")
      .update({ summary, tags: merged, updated_by: userId } as any)
      .eq("id", data.id);
    await logEvent(supabase, companyId, userId, data.id, "summarized", {
      tags: suggestedTags,
      category,
    });
    return { summary, tags: merged, suggested: suggestedTags, category };
  });

// ---------- Estadísticas / KPIs ----------

export const getKnowledgeAggregate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);

    const [docsAll, chunksAll, usage7, usage30, topDocs] = await Promise.all([
      supabase
        .from("knowledge_documents")
        .select("id, status, size_bytes, chars, chunks_count, tags, last_used_at, created_at")
        .eq("company_id", companyId),
      supabase.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      supabase
        .from("knowledge_usage")
        .select("id, created_at, document_id")
        .eq("company_id", companyId)
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase
        .from("knowledge_usage")
        .select("id")
        .eq("company_id", companyId)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase
        .from("knowledge_usage")
        .select("document_id")
        .eq("company_id", companyId)
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .limit(2000),
    ]);

    const docs = (docsAll.data ?? []) as any[];
    const total = docs.length;
    const ready = docs.filter((d) => d.status === "ready").length;
    const processing = docs.filter((d) => d.status === "processing" || d.status === "uploading").length;
    const failed = docs.filter((d) => d.status === "failed").length;
    const totalBytes = docs.reduce((a, d) => a + (Number(d.size_bytes) || 0), 0);
    const totalChars = docs.reduce((a, d) => a + (Number(d.chars) || 0), 0);

    // Top used docs (30d)
    const counts = new Map<string, number>();
    for (const u of (topDocs.data ?? []) as any[]) {
      counts.set(u.document_id, (counts.get(u.document_id) ?? 0) + 1);
    }
    const topIds = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topInfo = new Map<string, { name: string; count: number }>();
    if (topIds.length) {
      const { data: names } = await supabase
        .from("knowledge_documents")
        .select("id, name, title")
        .in(
          "id",
          topIds.map((t) => t[0]),
        );
      for (const [id, c] of topIds) {
        const row = (names ?? []).find((n: any) => n.id === id);
        topInfo.set(id, { name: (row as any)?.title || (row as any)?.name || "Documento", count: c });
      }
    }

    // 7d activity buckets
    const buckets: { day: string; count: number }[] = [];
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ day: key, count: 0 });
    }
    for (const u of (usage7.data ?? []) as any[]) {
      const key = new Date(u.created_at).toISOString().slice(0, 10);
      const b = buckets.find((x) => x.day === key);
      if (b) b.count += 1;
    }

    // Tags histogram
    const tagCount = new Map<string, number>();
    for (const d of docs) {
      for (const t of (d.tags ?? []) as string[]) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
    const topTags = Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t, c]) => ({ tag: t, count: c }));

    // Docs sin uso reciente (30d) y listos
    const staleThreshold = Date.now() - 30 * 86400000;
    const stale = docs
      .filter(
        (d) =>
          d.status === "ready" &&
          (!d.last_used_at || new Date(d.last_used_at).getTime() < staleThreshold),
      )
      .slice(0, 10)
      .map((d) => d.id as string);

    return {
      total,
      ready,
      processing,
      failed,
      total_chunks: chunksAll.count ?? 0,
      total_bytes: totalBytes,
      total_chars: totalChars,
      usage_7d: (usage7.data ?? []).length,
      usage_30d: (usage30.data ?? []).length,
      top_docs: Array.from(topInfo.entries()).map(([id, v]) => ({ id, ...v })),
      buckets,
      top_tags: topTags,
      stale_ids: stale,
    };
  });

// ---------- Auditoría (feed empresa) ----------

export const listKnowledgeEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        event_type: z.string().max(40).optional().nullable(),
        limit: z.number().int().min(1).max(200).default(80),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    let q: any = supabase
      .from("knowledge_document_events")
      .select("id, event_type, payload, actor_id, document_id, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.event_type) q = q.eq("event_type", data.event_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich with doc names + actor names
    const docIds = Array.from(new Set((rows ?? []).map((r: any) => r.document_id).filter(Boolean))) as string[];
    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean))) as string[];
    const [docsRes, actorsRes] = await Promise.all([
      docIds.length
        ? supabase.from("knowledge_documents").select("id, name, title").in("id", docIds)
        : Promise.resolve({ data: [] as any[] }),
      actorIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const docMap = new Map<string, string>(
      ((docsRes as any).data ?? []).map((d: any) => [d.id, d.title || d.name]),
    );
    const actorMap = new Map<string, string>(
      ((actorsRes as any).data ?? []).map((a: any) => [a.id, a.full_name || a.email || "Usuario"]),
    );
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      event_type: r.event_type,
      payload: r.payload,
      created_at: r.created_at,
      document_id: r.document_id,
      document_name: r.document_id ? docMap.get(r.document_id) ?? "Documento eliminado" : null,
      actor_id: r.actor_id,
      actor_name: r.actor_id ? actorMap.get(r.actor_id) ?? "Usuario" : "Sistema",
    }));
  });

// ---------- Exportar bundle (metadatos) ----------

export const exportKnowledgeBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await getCompanyId(supabase, userId);
    let q: any = supabase
      .from("knowledge_documents")
      .select("id, name, title, description, summary, tags, folder, pinned, type, size_bytes, chars, chunks_count, status, created_at, updated_at")
      .eq("company_id", companyId);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      count: (rows ?? []).length,
      documents: rows ?? [],
    };
  });

