CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('dialen-follow-up-check');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dialen-follow-up-check',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--bb6e02ce-209d-4146-abe4-9288208938a5.lovable.app/api/public/hooks/follow-up-check',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);