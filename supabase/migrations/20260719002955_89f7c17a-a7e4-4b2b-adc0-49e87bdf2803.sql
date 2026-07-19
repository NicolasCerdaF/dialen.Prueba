-- Etapa 1: Higiene y seguridad de base de datos

-- 1) Endurecer funciones SECURITY DEFINER: revocar EXECUTE de anon.
REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_admin(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_knowledge(uuid, vector, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(uuid, vector, integer) TO authenticated;

-- 2) CHECK constraints en columnas de estado tipo texto.
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired','cancelled'));

ALTER TABLE public.customers
  ADD CONSTRAINT customers_stage_check
  CHECK (stage IN ('nuevo','interesado','cotizado','negociando','ganado','perdido'));

ALTER TABLE public.customers
  ADD CONSTRAINT customers_priority_check
  CHECK (priority IS NULL OR priority IN ('low','normal','high','urgent'));