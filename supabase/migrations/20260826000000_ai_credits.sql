-- Phase 4: functional AI credits — purchased bonus balance + LLM event ledger.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS bonus_credits integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ai_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope text NOT NULL,
  cost integer NOT NULL DEFAULT 1 CHECK (cost > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_credit_events_company_created_idx
  ON public.ai_credit_events (company_id, created_at DESC);

ALTER TABLE public.ai_credit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_credit_events_company_read ON public.ai_credit_events;
CREATE POLICY ai_credit_events_company_read ON public.ai_credit_events
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- AL-1: unify legacy recommendation status
UPDATE public.product_recommendations
SET status = 'active'
WHERE status = 'pending';
