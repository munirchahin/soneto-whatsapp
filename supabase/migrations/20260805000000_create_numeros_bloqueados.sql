-- Números de WhatsApp bloqueados: mensagens recebidas desses números são
-- descartadas no webhook (não são salvas nem geram notificação por email).
create table if not exists public.numeros_bloqueados (
  numero text primary key,
  criado_em timestamptz not null default now()
);

insert into public.numeros_bloqueados (numero) values ('5511999648749')
on conflict (numero) do nothing;
