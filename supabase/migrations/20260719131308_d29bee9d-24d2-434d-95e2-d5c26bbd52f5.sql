
-- 1) Extend knowledge_documents with rich metadata
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS folder text,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS chars integer,
  ADD COLUMN IF NOT EXISTS chunks_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

CREATE INDEX IF NOT EXISTS knowledge_documents_company_idx ON public.knowledge_documents (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON public.knowledge_documents (company_id, status);
CREATE INDEX IF NOT EXISTS knowledge_documents_tags_idx ON public.knowledge_documents USING GIN (tags);
CREATE INDEX IF NOT EXISTS knowledge_documents_search_idx
  ON public.knowledge_documents
  USING GIN (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(summary,'')));

-- updated_at trigger (reuse tg_set_updated_at helper)
DROP TRIGGER IF EXISTS trg_knowledge_documents_updated ON public.knowledge_documents;
CREATE TRIGGER trg_knowledge_documents_updated
BEFORE UPDATE ON public.knowledge_documents
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Chunks counter trigger
CREATE OR REPLACE FUNCTION public.tg_knowledge_chunks_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.knowledge_documents
      SET chunks_count = chunks_count + 1
      WHERE id = NEW.document_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.knowledge_documents
      SET chunks_count = GREATEST(chunks_count - 1, 0)
      WHERE id = OLD.document_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_knowledge_chunks_count_ins ON public.knowledge_chunks;
DROP TRIGGER IF EXISTS trg_knowledge_chunks_count_del ON public.knowledge_chunks;
CREATE TRIGGER trg_knowledge_chunks_count_ins
AFTER INSERT ON public.knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION public.tg_knowledge_chunks_count();
CREATE TRIGGER trg_knowledge_chunks_count_del
AFTER DELETE ON public.knowledge_chunks
FOR EACH ROW EXECUTE FUNCTION public.tg_knowledge_chunks_count();

-- Backfill chunks_count
UPDATE public.knowledge_documents d
   SET chunks_count = sub.c
  FROM (SELECT document_id, COUNT(*)::int AS c FROM public.knowledge_chunks GROUP BY document_id) sub
 WHERE d.id = sub.document_id;

-- 3) Audit table
CREATE TABLE IF NOT EXISTS public.knowledge_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kde_company_idx ON public.knowledge_document_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kde_document_idx ON public.knowledge_document_events (document_id, created_at DESC);

GRANT SELECT, INSERT ON public.knowledge_document_events TO authenticated;
GRANT ALL ON public.knowledge_document_events TO service_role;
ALTER TABLE public.knowledge_document_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read knowledge events"
  ON public.knowledge_document_events FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));

CREATE POLICY "managers write knowledge events"
  ON public.knowledge_document_events FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_admin(auth.uid(), company_id));

-- 4) Usage table (AI citations)
CREATE TABLE IF NOT EXISTS public.knowledge_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer,
  conversation_id uuid,
  message_id uuid,
  similarity real,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ku_company_idx ON public.knowledge_usage (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ku_document_idx ON public.knowledge_usage (document_id, created_at DESC);

GRANT SELECT ON public.knowledge_usage TO authenticated;
GRANT ALL ON public.knowledge_usage TO service_role;
ALTER TABLE public.knowledge_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read knowledge usage"
  ON public.knowledge_usage FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));

-- 5) Widen manage policy on knowledge_documents so managers can update metadata (already OK: "Manage docs" covers all)
-- Nothing else to do here.
