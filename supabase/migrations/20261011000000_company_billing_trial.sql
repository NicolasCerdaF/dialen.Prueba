-- Lovable Cloud: ejecutar en Project settings → Cloud → SQL

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_cycle_anchor timestamptz,
  ADD COLUMN IF NOT EXISTS credit_period_started_at timestamptz;

COMMENT ON COLUMN public.companies.trial_ends_at IS
  'Fin del periodo de prueba gratuita (p. ej. 7 días desde alta).';
COMMENT ON COLUMN public.companies.billing_cycle_anchor IS
  'Inicio del primer ciclo de facturación mensual (normalmente = fin de la prueba).';
COMMENT ON COLUMN public.companies.credit_period_started_at IS
  'Inicio del periodo actual de conteo de créditos IA.';
