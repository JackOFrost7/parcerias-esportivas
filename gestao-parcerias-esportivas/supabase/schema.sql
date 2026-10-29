-- =========================================================
-- Gestão de Parcerias Esportivas — esquema do banco (Supabase / PostgreSQL)
-- Rode no Supabase: SQL Editor → New query → cole este arquivo → Run.
-- Pode ser executado mais de uma vez (idempotente).
-- =========================================================

-- ---------- Tabelas ----------

create table if not exists public.teams (
  id            text primary key default gen_random_uuid()::text,
  name          text not null check (length(trim(name)) > 0),
  sport         text not null default '',
  color         text not null default '#1d4ed8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  contract_end  date,
  contact       text not null default '',
  links         jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid()
);

create table if not exists public.events (
  id          text primary key default gen_random_uuid()::text,
  team_id     text not null references public.teams (id) on delete cascade,
  type        text not null default 'game' check (type in ('game', 'activation', 'other')),
  stage       text not null default 'todo' check (stage in ('todo', 'planning', 'production', 'ready', 'done')),
  title       text not null check (length(trim(title)) > 0),
  date        date not null,
  time        time,
  location    text not null default '',
  owner       text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create table if not exists public.deliverables (
  id          text primary key default gen_random_uuid()::text,
  team_id     text not null references public.teams (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  due         date not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create index if not exists events_team_id_idx       on public.events (team_id);
create index if not exists events_date_idx          on public.events (date);
create index if not exists deliverables_team_id_idx on public.deliverables (team_id);
create index if not exists deliverables_due_idx     on public.deliverables (due) where not done;

-- ---------- Auditoria: quem alterou e quando ----------

create or replace function public.touch_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['teams', 'events', 'deliverables'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated()', t, t);
  end loop;
end $$;

-- ---------- Segurança (Row Level Security) ----------
-- Somente usuários autenticados (o time) leem e editam.
-- Visitantes sem login usam o app em modo local, sem acesso ao banco.

alter table public.teams        enable row level security;
alter table public.events       enable row level security;
alter table public.deliverables enable row level security;

do $$
declare t text;
begin
  foreach t in array array['teams', 'events', 'deliverables'] loop
    execute format('drop policy if exists "time edita %1$s" on public.%1$I', t);
    execute format('create policy "time edita %1$s" on public.%1$I
                    for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Data local ----------
-- O servidor do Supabase roda em UTC; "hoje" para o time é o dia em Brasília.

create or replace function public.local_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- ---------- Views de acompanhamento ----------
-- security_invoker: as views respeitam o RLS de quem consulta.

-- Status de cada entregável, com o nome do time
create or replace view public.v_deliverables_status
with (security_invoker = true) as
select
  d.id,
  d.title,
  t.name                     as team,
  d.due,
  d.due - public.local_today()       as days_left,
  case
    when d.done                     then 'concluido'
    when d.due < public.local_today()       then 'atrasado'
    when d.due <= public.local_today() + 7  then 'vencendo'
    else 'pendente'
  end                        as status
from public.deliverables d
join public.teams t on t.id = d.team_id;

-- Ativações ainda não iniciadas dentro da janela mínima de 45 dias
create or replace view public.v_planning_alerts
with (security_invoker = true) as
select
  e.id,
  e.title,
  t.name               as team,
  e.date,
  e.date - public.local_today() as days_left,
  e.stage,
  nullif(e.owner, '')  as owner
from public.events e
join public.teams t on t.id = e.team_id
where e.type = 'activation'
  and e.stage in ('todo', 'planning')
  and e.date >= public.local_today()
  and e.date <  public.local_today() + 45
order by e.date;

-- Resumo por time: progresso dos entregáveis, próximo evento e renovação
create or replace view public.v_team_summary
with (security_invoker = true) as
select
  t.id,
  t.name,
  t.sport,
  t.contract_end,
  t.contract_end - public.local_today()                                   as days_to_contract_end,
  count(d.id)                                                     as deliverables_total,
  count(d.id) filter (where d.done)                               as deliverables_done,
  count(d.id) filter (where not d.done and d.due < public.local_today())  as deliverables_late,
  round(100.0 * count(d.id) filter (where d.done) / nullif(count(d.id), 0)) as pct_done,
  nxt.title                                                       as next_event,
  nxt.date                                                        as next_event_date
from public.teams t
left join public.deliverables d on d.team_id = t.id
left join lateral (
  select e.title, e.date
  from public.events e
  where e.team_id = t.id and e.date >= public.local_today()
  order by e.date, e.time nulls last
  limit 1
) nxt on true
group by t.id, nxt.title, nxt.date
order by t.name;

-- ---------- Tempo real ----------
-- Publica as alterações para o app atualizar a tela de todo o time.

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['teams', 'events', 'deliverables'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
