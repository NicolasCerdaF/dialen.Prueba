
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_response_style text NOT NULL DEFAULT 'cercano';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_ai_response_style_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_ai_response_style_check
  CHECK (ai_response_style IN ('formal','cercano','vendedor','soporte'));
