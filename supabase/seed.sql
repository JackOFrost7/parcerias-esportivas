-- =========================================================
-- Dados de exemplo (100% fictícios), com datas relativas a hoje.
-- Rode depois do schema.sql. Atenção: apaga os dados atuais das tabelas.
-- =========================================================

begin;

truncate public.deliverables, public.events, public.teams;

insert into public.teams (id, name, sport, color, contract_end, contact, links) values
  ('t1', 'Cerrado FC',            'Futebol',        '#16a34a', public.local_today() + 240, 'contato@cerradofc.exemplo',
     '[{"label":"Contrato (PDF)","url":"#"},{"label":"Pasta de fotos","url":"#"},{"label":"Manual de marca do time","url":"#"}]'),
  ('t2', 'Araguaia Vôlei',        'Vôlei',          '#2563eb', public.local_today() + 150, 'marketing@araguaiavolei.exemplo',
     '[{"label":"Contrato (PDF)","url":"#"},{"label":"Fotos da temporada","url":"#"}]'),
  ('t3', 'Planalto Basquete',     'Basquete',       '#ea580c', public.local_today() + 320, 'parcerias@planaltobasquete.exemplo',
     '[{"label":"Contrato (PDF)","url":"#"}]'),
  ('t4', 'Corrida Serra Dourada', 'Corrida de rua', '#7c3aed', public.local_today() + 90,  'org@serradourada.exemplo',
     '[{"label":"Regulamento da prova","url":"#"},{"label":"Kit do patrocinador","url":"#"}]');

insert into public.events (team_id, type, stage, owner, title, date, time, location, notes) values
  ('t1', 'game',       'ready',      'Ana Lima',    'Cerrado FC x Rio Verde EC',        public.local_today(),      '16:00', 'Estádio Municipal', 'Placa de LED no 2º tempo.'),
  ('t2', 'game',       'ready',      'Bruno Reis',  'Araguaia x Litoral Vôlei',         public.local_today() + 3,  '19:30', 'Ginásio Central',   ''),
  ('t1', 'activation', 'production', 'Ana Lima',    'Sampling na entrada do estádio',   public.local_today() + 20, '14:00', 'Portão A',          'Precisa de promotores e tenda.'),
  ('t3', 'game',       'planning',   'Carla Souza', 'Planalto x Capital Basket',        public.local_today() + 6,  '20:00', 'Arena Planalto',    ''),
  ('t4', 'activation', 'planning',   'Diego Alves', 'Estande na entrega de kits',       public.local_today() + 38, '09:00', 'Shopping Parque',   'Validar layout do estande com o time de trade.'),
  ('t2', 'activation', 'todo',       'Bruno Reis',  'Meet & greet com atletas',         public.local_today() + 60, '18:00', 'Ginásio Central',   ''),
  ('t3', 'other',      'production', 'Carla Souza', 'Sessão de fotos do uniforme',      public.local_today() + 14, '10:00', 'CT Planalto',       'Conferir aplicação da logo na manga.'),
  ('t4', 'game',       'todo',       'Diego Alves', 'Corrida Serra Dourada 10K',        public.local_today() + 45, '06:30', 'Parque da Cidade',  ''),
  ('t1', 'game',       'planning',   'Ana Lima',    'Cerrado FC x Vale do Sol',         public.local_today() + 17, '16:00', 'Estádio Municipal', ''),
  ('t3', 'activation', 'todo',       'Carla Souza', 'Quadra aberta para crianças',      public.local_today() + 29, '15:00', 'Arena Planalto',    ''),
  ('t2', 'game',       'done',       'Bruno Reis',  'Araguaia x Serra Azul',            public.local_today() - 4,  '19:30', 'Ginásio Central',   'Fotos enviadas.'),
  ('t1', 'activation', 'done',       'Ana Lima',    'Ação com torcedores no intervalo', public.local_today() - 9,  '16:45', 'Estádio Municipal', ''),
  ('t4', 'other',      'production', 'Diego Alves', 'Produção das camisetas do staff',  public.local_today() + 1,  null,    'Fornecedor',        '');

insert into public.deliverables (team_id, title, due, done) values
  ('t1', 'Logo na frente da camisa (temporada)',          public.local_today() - 10, true),
  ('t1', '2 posts patrocinados no Instagram / mês',       public.local_today() + 5,  false),
  ('t2', 'Backdrop de entrevistas com logo',              public.local_today() - 3,  false),
  ('t2', 'Relatório de exposição de mídia (trimestral)',  public.local_today() + 25, false),
  ('t3', 'Placas de quadra em jogos em casa',             public.local_today() + 8,  false),
  ('t4', 'Logo no peito do número de peito',              public.local_today() + 30, false),
  ('t4', 'Menção no locutor da largada',                  public.local_today() + 45, false),
  ('t3', 'Envio de fotos oficiais dos jogos',             public.local_today() - 1,  true);

commit;
