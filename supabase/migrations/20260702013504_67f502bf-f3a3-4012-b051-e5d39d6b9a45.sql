
-- Extend ai_suggestions with multiagent fields
ALTER TABLE public.ai_suggestions
  ADD COLUMN IF NOT EXISTS agent_type text NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS probability numeric,
  ADD COLUMN IF NOT EXISTS actor_id uuid;

CREATE INDEX IF NOT EXISTS ai_suggestions_customer_idx ON public.ai_suggestions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_suggestions_agent_idx ON public.ai_suggestions(agent_type, created_at DESC);

-- Insights per customer (single source of AI-derived scoring)
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  probability numeric,           -- 0..1 close probability
  intent text,                    -- e.g. "high_intent", "browsing", "objection", "ready_to_close"
  sentiment text,                 -- "positive" | "neutral" | "negative"
  churn_risk numeric,             -- 0..1
  quality_score numeric,          -- 0..1 conversation quality
  next_best_action text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_analysis_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read ai_insights" ON public.ai_insights
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));

CREATE POLICY "members write ai_insights" ON public.ai_insights
  FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE INDEX IF NOT EXISTS ai_insights_company_idx ON public.ai_insights(company_id);
CREATE INDEX IF NOT EXISTS ai_insights_probability_idx ON public.ai_insights(company_id, probability DESC NULLS LAST);

CREATE TRIGGER trg_ai_insights_updated
  BEFORE UPDATE ON public.ai_insights
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_insights;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_suggestions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
