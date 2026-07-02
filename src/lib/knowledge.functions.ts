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
