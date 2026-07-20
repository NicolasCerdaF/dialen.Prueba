
-- Extend profiles for provisioning
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_external_ref_key
  ON public.profiles (external_ref)
  WHERE external_ref IS NOT NULL;

-- Provision audit log
CREATE TABLE IF NOT EXISTS public.provision_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  email TEXT,
  plan TEXT,
  external_ref TEXT,
  ip TEXT,
  ok BOOLEAN NOT NULL,
  status_code INT,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.provision_log TO service_role;

ALTER TABLE public.provision_log ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated -> only service_role (which bypasses RLS) can read/write.
CREATE INDEX IF NOT EXISTS provision_log_external_ref_idx ON public.provision_log (external_ref);
CREATE INDEX IF NOT EXISTS provision_log_created_at_idx ON public.provision_log (created_at DESC);
