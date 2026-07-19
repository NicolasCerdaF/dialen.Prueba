CREATE OR REPLACE FUNCTION public.ensure_user_company()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _email text := auth.jwt() ->> 'email';
  _full_name text := COALESCE(
    auth.jwt() #>> '{user_metadata,full_name}',
    auth.jwt() #>> '{user_metadata,name}',
    NULLIF(split_part(COALESCE(auth.jwt() ->> 'email', ''), '@', 1), ''),
    'Mi empresa'
  );
  _company_id uuid;
  _has_role boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT p.company_id
    INTO _company_id
  FROM public.profiles p
  WHERE p.id = _user_id;

  IF _company_id IS NULL THEN
    SELECT c.id
      INTO _company_id
    FROM public.companies c
    WHERE c.owner_id = _user_id
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  IF _company_id IS NULL THEN
    INSERT INTO public.companies (name, owner_id)
    VALUES (_full_name || ' Workspace', _user_id)
    RETURNING id INTO _company_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, company_id)
  VALUES (_user_id, _full_name, _email, _company_id)
  ON CONFLICT (id) DO UPDATE
    SET company_id = COALESCE(public.profiles.company_id, EXCLUDED.company_id),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(public.profiles.email, EXCLUDED.email),
        updated_at = now();

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.company_id = _company_id
  ) INTO _has_role;

  IF NOT _has_role THEN
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (_user_id, _company_id, 'admin')
    ON CONFLICT (user_id, company_id, role) DO NOTHING;
  END IF;

  RETURN _company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_company() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_user_company() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_company() TO service_role;