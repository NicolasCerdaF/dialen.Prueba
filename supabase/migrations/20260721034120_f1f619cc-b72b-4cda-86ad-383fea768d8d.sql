ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico','premium'));
CREATE INDEX IF NOT EXISTS companies_plan_idx ON public.companies(plan);