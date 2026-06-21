
-- Phase 3: WhatsApp Cloud API webhook + send/receive
-- Ensure phone_number_id is unique so webhook can route to the right company
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_phone_number_id_unique
  ON public.whatsapp_channels (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_webhook_token_unique
  ON public.whatsapp_channels (webhook_verify_token)
  WHERE webhook_verify_token IS NOT NULL;

-- Avoid duplicate inbound messages from WhatsApp retries
CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_message_id_unique
  ON public.messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- Unique customer per company by phone (so webhook can upsert)
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_phone_unique
  ON public.customers (company_id, phone);

-- Realtime for live chat
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  PERFORM 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;
END $$;
