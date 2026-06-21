
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'vendedor');
CREATE TYPE public.ai_personality AS ENUM ('vendedor_experto', 'consultor', 'tecnico', 'cercano', 'custom');
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'closed', 'archived');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE public.suggestion_status AS ENUM ('pending', 'used', 'edited', 'discarded');
CREATE TYPE public.channel_status AS ENUM ('disconnected', 'pending', 'connected', 'error');
CREATE TYPE public.document_status AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  ai_personality public.ai_personality NOT NULL DEFAULT 'vendedor_experto',
  ai_custom_prompt TEXT,
  ai_auto_reply BOOLEAN NOT NULL DEFAULT false,
  ai_confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.85,
  language TEXT NOT NULL DEFAULT 'es',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _company_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id
      AND role IN ('admin','manager')
  )
$$;

-- ============ TRIGGER: auto-create profile + company + admin role on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
  display_name TEXT;
  company_name TEXT;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', display_name || ' Workspace');

  INSERT INTO public.companies (name, owner_id)
  VALUES (company_name, NEW.id)
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, full_name, email, company_id)
  VALUES (NEW.id, display_name, NEW.email, new_company_id);

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, new_company_id, 'admin');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ COMPANIES POLICIES ============
CREATE POLICY "Members view their company" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), id));
CREATE POLICY "Admins update their company" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), id, 'admin'));

-- ============ PROFILES POLICIES ============
CREATE POLICY "View own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_member(auth.uid(), company_id));
CREATE POLICY "Update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ============ USER_ROLES POLICIES ============
CREATE POLICY "View roles in own company" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), company_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), company_id, 'admin'));

-- ============ WHATSAPP_CHANNELS ============
CREATE TABLE public.whatsapp_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_phone TEXT,
  phone_number_id TEXT,
  business_account_id TEXT,
  access_token TEXT,
  webhook_verify_token TEXT,
  status public.channel_status NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_channels TO authenticated;
GRANT ALL ON public.whatsapp_channels TO service_role;
ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view channels" ON public.whatsapp_channels
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Admins manage channels" ON public.whatsapp_channels
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), company_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), company_id, 'admin'));

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  stage TEXT,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Members write customers" ON public.customers
  FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), company_id))
  WITH CHECK (public.is_member(auth.uid(), company_id));

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.conversation_status NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view assigned or manage" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin(auth.uid(), company_id)
    OR assignee_id = auth.uid()
  );
CREATE POLICY "Members update assigned or manage" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_manager_or_admin(auth.uid(), company_id)
    OR assignee_id = auth.uid()
  );
CREATE POLICY "Managers insert conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), company_id));

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  body TEXT,
  media_url TEXT,
  status public.message_status NOT NULL DEFAULT 'pending',
  wa_message_id TEXT,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View messages of accessible conversations" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (public.is_manager_or_admin(auth.uid(), c.company_id) OR c.assignee_id = auth.uid())
    )
  );
CREATE POLICY "Insert messages in accessible conversations" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (public.is_manager_or_admin(auth.uid(), c.company_id) OR c.assignee_id = auth.uid())
    )
  );

-- ============ AI_SUGGESTIONS ============
CREATE TABLE public.ai_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  intent TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  objections JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_step TEXT,
  confidence NUMERIC(3,2),
  status public.suggestion_status NOT NULL DEFAULT 'pending',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_suggestions TO authenticated;
GRANT ALL ON public.ai_suggestions TO service_role;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View suggestions in accessible conversations" ON public.ai_suggestions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (public.is_manager_or_admin(auth.uid(), c.company_id) OR c.assignee_id = auth.uid())
    )
  );
CREATE POLICY "Update suggestion status" ON public.ai_suggestions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (public.is_manager_or_admin(auth.uid(), c.company_id) OR c.assignee_id = auth.uid())
    )
  );

-- ============ KNOWLEDGE_DOCUMENTS ============
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  storage_path TEXT,
  size_bytes BIGINT,
  status public.document_status NOT NULL DEFAULT 'uploading',
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT ALL ON public.knowledge_documents TO service_role;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view docs" ON public.knowledge_documents
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Manage docs" ON public.knowledge_documents
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin(auth.uid(), company_id))
  WITH CHECK (public.is_manager_or_admin(auth.uid(), company_id));

-- ============ SALES_LINKS ============
CREATE TABLE public.sales_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  purpose TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_links TO authenticated;
GRANT ALL ON public.sales_links TO service_role;
ALTER TABLE public.sales_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view links" ON public.sales_links
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), company_id));
CREATE POLICY "Manage links" ON public.sales_links
  FOR ALL TO authenticated
  USING (public.is_manager_or_admin(auth.uid(), company_id))
  WITH CHECK (public.is_manager_or_admin(auth.uid(), company_id));

-- ============ STORAGE BUCKET for knowledge documents ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Members read own company docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND public.is_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
CREATE POLICY "Managers upload company docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'knowledge'
    AND public.is_manager_or_admin(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
CREATE POLICY "Managers delete company docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'knowledge'
    AND public.is_manager_or_admin(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_suggestions;
