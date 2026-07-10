-- Tags para marcar e filtrar conversas no inbox
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#FFA300',
  created_at timestamptz not null default now()
);

-- Associação many-to-many entre número de contato e tag
create table if not exists contato_tags (
  numero text not null,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (numero, tag_id)
);

create index if not exists contato_tags_numero_idx on contato_tags(numero);

insert into tags (nome, cor) values
  ('Interesse em comprar', '#22C55E'),
  ('Retorno positivo', '#3B82F6'),
  ('Sair (opt-out)', '#6B7280'),
  ('Retorno negativo', '#EF4444')
on conflict (nome) do nothing;
