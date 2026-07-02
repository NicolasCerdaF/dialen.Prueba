-- Inbox list: filter by company + status, sort by last_message_at DESC
CREATE INDEX IF NOT EXISTS conversations_company_status_last_msg_idx
  ON public.conversations (company_id, status, last_message_at DESC NULLS LAST);

-- CRM: fetch conversations of a customer
CREATE INDEX IF NOT EXISTS conversations_customer_idx
  ON public.conversations (customer_id, last_message_at DESC NULLS LAST);

-- Chat: paginate messages of a conversation by time (DESC)
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC);

-- Uniqueness guard: 1 active quote per conversation (draft/sent/viewed)
CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_active_per_conversation
  ON public.quotes (conversation_id)
  WHERE conversation_id IS NOT NULL AND status IN ('draft','sent','viewed');

-- Quote lookup by conversation (non-unique complement for other statuses)
CREATE INDEX IF NOT EXISTS quotes_conversation_idx
  ON public.quotes (conversation_id) WHERE conversation_id IS NOT NULL;

-- has_role lookup
CREATE INDEX IF NOT EXISTS user_roles_user_idx
  ON public.user_roles (user_id);

-- customer_events by company for tenant-wide audit queries
CREATE INDEX IF NOT EXISTS customer_events_company_created_idx
  ON public.customer_events (company_id, created_at DESC);