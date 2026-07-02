
CREATE TABLE public.conversation_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_notes_conv ON public.conversation_notes(conversation_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_notes TO authenticated;
GRANT ALL ON public.conversation_notes TO service_role;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view conv notes" ON public.conversation_notes FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Members write conv notes" ON public.conversation_notes FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

CREATE TABLE public.conversation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_events_conv ON public.conversation_events(conversation_id, created_at DESC);
GRANT SELECT, INSERT ON public.conversation_events TO authenticated;
GRANT ALL ON public.conversation_events TO service_role;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view conv events" ON public.conversation_events FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Members insert conv events" ON public.conversation_events FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), company_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
