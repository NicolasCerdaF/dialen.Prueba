
-- =========================================================
-- PRODUCTS: core catalog
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  stock INTEGER,
  track_stock BOOLEAN NOT NULL DEFAULT false,
  low_stock_threshold INTEGER,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_recommendable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, sku)
);

CREATE INDEX products_company_idx ON public.products(company_id);
CREATE INDEX products_active_idx  ON public.products(company_id, active);
CREATE INDEX products_category_idx ON public.products(company_id, category);
CREATE INDEX products_tags_idx    ON public.products USING GIN (tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read products of their company"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));

CREATE POLICY "Managers write products"
  ON public.products FOR ALL TO authenticated
  USING (public.is_manager_or_admin(auth.uid(), company_id))
  WITH CHECK (public.is_manager_or_admin(auth.uid(), company_id));

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- PRODUCT ↔ CUSTOMER linkage (Bandeja / CRM / Embudo)
-- =========================================================
CREATE TABLE public.product_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  context TEXT NOT NULL DEFAULT 'interested',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2),
  estimated_value NUMERIC(14,2),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX product_customers_company_idx  ON public.product_customers(company_id);
CREATE INDEX product_customers_customer_idx ON public.product_customers(customer_id);
CREATE INDEX product_customers_product_idx  ON public.product_customers(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_customers TO authenticated;
GRANT ALL ON public.product_customers TO service_role;

ALTER TABLE public.product_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read product links of their company"
  ON public.product_customers FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));

CREATE POLICY "Members write product links of their company"
  ON public.product_customers FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE TRIGGER product_customers_set_updated_at
  BEFORE UPDATE ON public.product_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- AI RECOMMENDATIONS (trazabilidad IA → Catálogo)
-- =========================================================
CREATE TABLE public.product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL DEFAULT 'sales',
  reason TEXT,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  probability NUMERIC(4,3),
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX product_reco_company_idx  ON public.product_recommendations(company_id);
CREATE INDEX product_reco_customer_idx ON public.product_recommendations(customer_id);
CREATE INDEX product_reco_product_idx  ON public.product_recommendations(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recommendations TO authenticated;
GRANT ALL ON public.product_recommendations TO service_role;

ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read product recos of their company"
  ON public.product_recommendations FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));

CREATE POLICY "Members write product recos of their company"
  ON public.product_recommendations FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_recommendations;
