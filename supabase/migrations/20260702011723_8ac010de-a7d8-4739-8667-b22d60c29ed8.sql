
-- Automations engine: flow definitions + execution log.
-- No duplication of business data — flows reference CRM/inbox/pipeline rows by id.

CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft', -- draft | active | paused | error
  -- Flow definition (versioned via automation_versions)
  trigger jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { type, config }
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ type, op, value }]
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{ type, config }]
  version int NOT NULL DEFAULT 1,
  -- Runtime counters (denormalized for dashboard, updated by executor)
  run_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_error text,
  avg_duration_ms int,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.automations(company_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automations_company_read" ON public.automations
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "automations_company_write" ON public.automations
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin(auth.uid(), company_id))
  WITH CHECK (public.is_manager_or_admin(auth.uid(), company_id));
CREATE TRIGGER automations_updated BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Versioned snapshots for history / rollback.
CREATE TABLE public.automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version int NOT NULL,
  snapshot jsonb NOT NULL,     -- { name, description, trigger, conditions, actions }
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, version)
);
GRANT SELECT, INSERT ON public.automation_versions TO authenticated;
GRANT ALL ON public.automation_versions TO service_role;
ALTER TABLE public.automation_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_versions_read" ON public.automation_versions
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "automation_versions_write" ON public.automation_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_admin(auth.uid(), company_id));

-- Execution log: each row = one attempted run of an automation for a subject.
CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Subject references (all optional — flow decides which apply)
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  triggered_by text NOT NULL,           -- trigger type
  trigger_payload jsonb,
  status text NOT NULL,                 -- success | skipped | error
  skip_reason text,
  error text,
  actions_result jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms int,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX ON public.automation_runs(automation_id, started_at DESC);
CREATE INDEX ON public.automation_runs(company_id, started_at DESC);
CREATE INDEX ON public.automation_runs(customer_id) WHERE customer_id IS NOT NULL;

GRANT SELECT, INSERT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_runs_read" ON public.automation_runs
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "automation_runs_write" ON public.automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), company_id));

-- Realtime for live counters/log
ALTER PUBLICATION supabase_realtime ADD TABLE public.automations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.automation_runs;
