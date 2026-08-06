-- Corrige alerta de segurança do Supabase: tabelas publicamente acessíveis
-- (RLS desabilitado). Todo acesso da app é via service role (bypassa RLS),
-- então habilitar RLS aqui só fecha o acesso público direto via API.
alter table public.tags enable row level security;
alter table public.contato_tags enable row level security;
alter table public.numeros_bloqueados enable row level security;
