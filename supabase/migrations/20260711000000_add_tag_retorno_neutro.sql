insert into tags (nome, cor) values
  ('Retorno neutro', '#A855F7')
on conflict (nome) do nothing;
