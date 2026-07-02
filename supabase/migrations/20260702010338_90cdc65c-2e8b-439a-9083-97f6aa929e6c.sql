
-- Extend customers with commercial CRM fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_value numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS customers_company_id_idx ON public.customers(company_id);
CREATE INDEX IF NOT EXISTS customers_assignee_idx ON public.customers(assignee_id);
CREATE INDEX IF NOT EXISTS customers_stage_idx ON public.customers(stage);
CREATE INDEX IF NOT EXISTS customers_last_interaction_idx ON public.customers(last_interaction_at DESC);

-- Customer notes (CRM-scoped, not per-conversation)
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read customer_notes" ON public.customer_notes FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Members write customer_notes" ON public.customer_notes FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id)) WITH CHECK (public.is_member(auth.uid(), company_id));

-- Customer events (unified activity timeline)
CREATE TABLE IF NOT EXISTS public.customer_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_events TO authenticated;
GRANT ALL ON public.customer_events TO service_role;
ALTER TABLE public.customer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read customer_events" ON public.customer_events FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Members insert customer_events" ON public.customer_events FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE INDEX IF NOT EXISTS customer_events_customer_created_idx ON public.customer_events(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_notes_customer_created_idx ON public.customer_notes(customer_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_events;

-- updated_at trigger for customer_notes
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS customer_notes_updated_at ON public.customer_notes;
CREATE TRIGGER customer_notes_updated_at BEFORE UPDATE ON public.customer_notes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
