
CREATE TABLE IF NOT EXISTS public.director_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL,               -- contactar | productos | detenidas | objeciones | campanas | vendedores | hot | riesgo
  title text NOT NULL,
  reason text,                          -- por qué la IA lo recomienda
  benefit text,                         -- beneficio esperado
  potential_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  severity text NOT NULL DEFAULT 'info',-- info | warn | high | critical
  status text NOT NULL DEFAULT 'pending',-- pending | done | snoozed | dismissed
  ref_type text,                        -- customer | conversation | quote | product | user | campaign
  ref_id text,
  action_to text,
  action_search jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL,            -- dedup key per (company + category + ref)
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  snooze_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, fingerprint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.director_insights TO authenticated;
GRANT ALL ON public.director_insights TO service_role;

ALTER TABLE public.director_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "director_insights_select" ON public.director_insights
FOR SELECT TO authenticated
USING (public.is_member(auth.uid(), company_id));

CREATE POLICY "director_insights_insert" ON public.director_insights
FOR INSERT TO authenticated
WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE POLICY "director_insights_update" ON public.director_insights
FOR UPDATE TO authenticated
USING (public.is_member(auth.uid(), company_id))
WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE POLICY "director_insights_delete" ON public.director_insights
FOR DELETE TO authenticated
USING (public.is_member(auth.uid(), company_id));

CREATE INDEX IF NOT EXISTS idx_director_insights_company_status
  ON public.director_insights (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_director_insights_company_category
  ON public.director_insights (company_id, category);

CREATE TRIGGER trg_director_insights_updated_at
BEFORE UPDATE ON public.director_insights
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.director_insights;
