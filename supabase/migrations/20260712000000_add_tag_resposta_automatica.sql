insert into tags (nome, cor) values
  ('Resposta automática', '#94A3B8')
on conflict (nome) do nothing;
