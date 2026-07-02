
CREATE OR REPLACE FUNCTION public.tg_bump_customer_last_interaction()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  SELECT customer_id INTO cid FROM public.conversations WHERE id = NEW.conversation_id;
  IF cid IS NOT NULL THEN
    UPDATE public.customers SET last_interaction_at = NEW.created_at
    WHERE id = cid AND (last_interaction_at IS NULL OR last_interaction_at < NEW.created_at);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS messages_bump_customer ON public.messages;
CREATE TRIGGER messages_bump_customer AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_bump_customer_last_interaction();

-- Backfill from existing messages
UPDATE public.customers c SET last_interaction_at = sub.max_created
FROM (
  SELECT co.customer_id, MAX(m.created_at) AS max_created
  FROM public.messages m JOIN public.conversations co ON co.id = m.conversation_id
  GROUP BY co.customer_id
) sub
WHERE c.id = sub.customer_id AND (c.last_interaction_at IS NULL OR c.last_interaction_at < sub.max_created);
