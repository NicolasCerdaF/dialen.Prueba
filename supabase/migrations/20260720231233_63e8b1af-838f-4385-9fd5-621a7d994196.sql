-- Platform administrators (cross-company super-admins)
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  note text
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Helper: is caller a platform admin? Security definer to avoid recursion.
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$$;

-- Only platform admins can read the table (list of admins).
CREATE POLICY "Platform admins can view admin list"
ON public.platform_admins FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- Auto-grant platform admin to the bootstrap email once signed up + confirmed.
CREATE OR REPLACE FUNCTION public.grant_bootstrap_platform_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'nicolasadministrador@gmail.com' THEN
    INSERT INTO public.platform_admins (user_id, note)
    VALUES (NEW.id, 'Bootstrap super admin')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_grant_platform_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_bootstrap_platform_admin();

CREATE TRIGGER on_auth_user_confirmed_grant_platform_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_bootstrap_platform_admin();

-- If the user already exists (e.g. remixed project), grant retroactively.
INSERT INTO public.platform_admins (user_id, note)
SELECT id, 'Bootstrap super admin'
FROM auth.users
WHERE lower(email) = 'nicolasadministrador@gmail.com'
ON CONFLICT (user_id) DO NOTHING;