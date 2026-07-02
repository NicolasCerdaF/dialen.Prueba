// Server-only helper para inyectar contexto de la base de conocimiento
// en el auto-reply. Usa el admin client (webhook) para evitar RLS y filtra
// por company_id explícitamente.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { aiFetch } from "@/lib/ai-fetch";
import { log } from "@/lib/logger";

const EMBEDDINGS_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

type AdminClient = ReturnType<typeof createClient<Database>>;

async function embedQuery(query: string, companyId: string): Promise<number[] | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
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
          input: [query],
          dimensions: EMBEDDING_DIMS,
        }),
      },
      { scope: "knowledge-rag", companyId, timeoutMs: 10_000 },
    );
    const json: any = await res.json();
    return (json?.data?.[0]?.embedding as number[]) ?? null;
  } catch (e) {
    log.warn("knowledge-rag", "embed_failed", { company_id: companyId, err: e });
    return null;
  }
}

/**
 * Devuelve un bloque de texto con fragmentos relevantes o null si no hay
 * base de conocimiento cargada / falla la búsqueda. Fail-safe: nunca lanza.
 */
export async function fetchKnowledgeContext(opts: {
  supabase: AdminClient;
  companyId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<string | null> {
  const { supabase, companyId, query } = opts;
  if (!query || query.trim().length < 3) return null;
  try {
    // Fast-check: ¿hay chunks para esta empresa?
    const { count } = await supabase
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .limit(1);
    if (!count) return null;

    const emb = await embedQuery(query, companyId);
    if (!emb) return null;

    // Nota: la RPC filtra por is_member(auth.uid()), así que aquí usamos
    // una consulta directa con service role para tener acceso desde webhook.
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("content, document_id")
      .eq("company_id", companyId)
      .order("embedding <=> " + JSON.stringify(emb) as any, { ascending: true } as any)
      .limit(opts.limit ?? 4);

    // Fallback: si el order-by con operador vectorial no está soportado en select builder,
    // usamos la RPC pública mediante admin client (bypasea is_member al usar service_role).
    let rows: Array<{ content: string; document_id: string }> = [];
    if (error || !data) {
      const { data: rpcRows } = await supabase.rpc("match_knowledge", {
        _company_id: companyId,
        query_embedding: emb as unknown as string,
        match_count: opts.limit ?? 4,
      });
      rows = (rpcRows ?? []).map((r: any) => ({
        content: r.content,
        document_id: r.document_id,
      }));
    } else {
      rows = data as any;
    }

    if (!rows.length) return null;
    const snippet = rows
      .map((r, i) => `[${i + 1}] ${r.content.trim()}`)
      .join("\n---\n")
      .slice(0, 4000);
    return snippet;
  } catch (e) {
    log.warn("knowledge-rag", "context_failed", { company_id: companyId, err: e });
    return null;
  }
}
