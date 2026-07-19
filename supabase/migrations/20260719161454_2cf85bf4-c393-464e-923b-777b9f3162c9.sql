DROP POLICY IF EXISTS "Users can create their own company" ON public.companies;
CREATE POLICY "Users can create their own company"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners view their company before role bootstrap" ON public.companies;
CREATE POLICY "Owners view their company before role bootstrap"
ON public.companies
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can bootstrap their admin role" ON public.user_roles;
CREATE POLICY "Owners can bootstrap their admin role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = user_roles.company_id
      AND c.owner_id = auth.uid()
  )
);

REVOKE ALL ON FUNCTION public.ensure_user_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_company() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_user_company() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_company() TO service_role;