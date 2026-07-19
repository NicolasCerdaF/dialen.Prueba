-- Partial index for open AI suggestions (used by Opportunities feed)
CREATE INDEX IF NOT EXISTS ai_suggestions_open_prob_idx
  ON public.ai_suggestions (probability DESC, created_at DESC)
  WHERE used_at IS NULL;

-- Composite index for active quotes feed (Opportunities)
CREATE INDEX IF NOT EXISTS quotes_active_status_created_idx
  ON public.quotes (status, created_at DESC)
  WHERE status IN ('draft','sent','viewed');

-- Accelerate "who is already a client" set lookup
CREATE INDEX IF NOT EXISTS quotes_accepted_customer_idx
  ON public.quotes (customer_id)
  WHERE status = 'accepted';