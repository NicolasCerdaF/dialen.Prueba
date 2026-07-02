
-- Quotes module
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  stage TEXT,
  number TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sent, viewed, accepted, rejected, expired
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  valid_until DATE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  share_token TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_company ON public.quotes(company_id, created_at DESC);
CREATE INDEX idx_quotes_customer ON public.quotes(customer_id, created_at DESC);
CREATE INDEX idx_quotes_status ON public.quotes(company_id, status);

CREATE TABLE public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  recommendation_id UUID REFERENCES public.product_recommendations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  margin NUMERIC(14,2) NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  ai_suggested BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id, position);

CREATE TABLE public.quote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- created, updated, sent, viewed, accepted, rejected, expired, item_added, ai_draft
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_events_quote ON public.quote_events(quote_id, created_at DESC);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT SELECT ON public.quotes TO anon; -- for public share_token access (filtered by policy)
GRANT ALL ON public.quotes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT SELECT ON public.quote_items TO anon;
GRANT ALL ON public.quote_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_events TO authenticated;
GRANT ALL ON public.quote_events TO service_role;

-- RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_company_members" ON public.quotes
  FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE POLICY "quote_items_company_members" ON public.quote_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.is_member(auth.uid(), q.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.is_member(auth.uid(), q.company_id)));

CREATE POLICY "quote_events_company_members" ON public.quote_events
  FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

-- updated_at trigger
CREATE TRIGGER trg_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_items;
