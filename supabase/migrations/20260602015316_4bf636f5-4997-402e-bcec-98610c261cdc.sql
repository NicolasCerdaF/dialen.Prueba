ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT true;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Allow members (not just managers/admins) to update conversations they can see (e.g. ai_paused)
DROP POLICY IF EXISTS "Members update assigned or manage" ON public.conversations;
CREATE POLICY "Members update conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (is_member(auth.uid(), company_id))
WITH CHECK (is_member(auth.uid(), company_id));

-- Allow members to insert messages in their company conversations (for manual replies + demo)
DROP POLICY IF EXISTS "Insert messages in accessible conversations" ON public.messages;
CREATE POLICY "Members insert messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (is_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "View messages of accessible conversations" ON public.messages;
CREATE POLICY "Members view messages"
ON public.messages FOR SELECT TO authenticated
USING (is_member(auth.uid(), company_id));

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversations';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; END IF;
END $$;