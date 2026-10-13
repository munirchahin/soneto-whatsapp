-- Dispara /api/cron/process-scheduled e /api/cron/process-email-replies a cada minuto.
-- O cron do GitHub Actions (*/5) é atrasado por horas em repos pouco ativos.
-- Pré-requisito (feito uma vez, fora do git): vault.create_secret(<url>, 'app_url') e
-- vault.create_secret(<CRON_SECRET>, 'cron_secret').
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.chamar_crons_disparo() returns void
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url');
  hdr jsonb := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'));
begin
  perform net.http_post(url := base || '/api/cron/process-scheduled', headers := hdr, timeout_milliseconds := 60000);
  perform net.http_post(url := base || '/api/cron/process-email-replies', headers := hdr, timeout_milliseconds := 60000);
end $$;
revoke all on function public.chamar_crons_disparo() from public, anon, authenticated;

select cron.unschedule('processar-disparos') where exists (select 1 from cron.job where jobname = 'processar-disparos');
select cron.schedule('processar-disparos', '* * * * *', 'select public.chamar_crons_disparo()');
