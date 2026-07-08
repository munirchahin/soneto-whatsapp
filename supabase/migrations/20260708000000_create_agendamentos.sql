-- Agendamento de disparos (envio de templates WhatsApp para uma data/hora futura).
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  contatos jsonb not null,
  template_name text not null,
  template_language text not null default 'pt_BR',
  agendado_para timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'concluido', 'cancelado')),
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);

-- Usado pelo cron (/api/cron/process-scheduled) para buscar o que está vencido.
create index if not exists agendamentos_status_agendado_para_idx
  on public.agendamentos (status, agendado_para);
