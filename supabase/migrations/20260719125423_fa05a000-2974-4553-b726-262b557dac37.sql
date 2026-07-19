
CREATE TABLE public.product_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX product_events_product_idx ON public.product_events(product_id, created_at DESC);
CREATE INDEX product_events_company_idx ON public.product_events(company_id, created_at DESC);
GRANT SELECT, INSERT ON public.product_events TO authenticated;
GRANT ALL ON public.product_events TO service_role;
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read product events of their company" ON public.product_events
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Members insert product events of their company" ON public.product_events
  FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), company_id));
