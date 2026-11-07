-- SOVEREIGN — esquema do jogo.
-- Progresso, inventário (cartas + acessórios), baralhos, resultados de batalha e PvP.
-- Todas as tabelas usam RLS: cada jogador só enxerga e altera as próprias linhas.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — identidade do jogador (1:1 com auth.users)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Comandante',
  country_id text not null default 'br',
  is_guest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- nation_state — camada geopolítica (economia, tecnologia, moral)
-- ---------------------------------------------------------------------------

create table if not exists public.nation_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country_id text not null default 'br',
  country_name text not null default 'Brasil',
  flag text not null default '🇧🇷',
  techs text[] not null default array['t1','t4','t8','t10'],
  military int not null default 61 check (military between 0 and 100),
  gdp int not null default 2170,
  stability int not null default 54 check (stability between 0 and 100),
  industry int not null default 62 check (industry between 0 and 100),
  logistics int not null default 55 check (logistics between 0 and 100),
  influence int not null default 40 check (influence between 0 and 100),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_nation_touch on public.nation_state;
create trigger trg_nation_touch before update on public.nation_state
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- campaign_progress — progresso narrativo por capítulo
-- ---------------------------------------------------------------------------

create table if not exists public.campaign_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null,
  status text not null default 'bloqueado'
    check (status in ('bloqueado','disponivel','em_andamento','concluido')),
  outcome text check (outcome in ('vitoria','derrota','empate')),
  attempts int not null default 0,
  best_score int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

drop trigger if exists trg_campaign_touch on public.campaign_progress;
create trigger trg_campaign_touch before update on public.campaign_progress
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- inventory — cartas e acessórios que o jogador possui
-- ---------------------------------------------------------------------------

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_kind text not null check (item_kind in ('carta','acessorio')),
  item_id text not null,
  quantity int not null default 1 check (quantity >= 0),
  level int not null default 1 check (level >= 1),
  source text not null default 'inicial',
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_kind, item_id)
);

create index if not exists idx_inventory_user on public.inventory(user_id);

drop trigger if exists trg_inventory_touch on public.inventory;
create trigger trg_inventory_touch before update on public.inventory
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- decks — baralhos salvos (8 cartas) + acessórios equipados
-- ---------------------------------------------------------------------------

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Baralho padrão',
  cards text[] not null default '{}'::text[],
  accessories text[] not null default '{}'::text[],
  doctrine text,
  commander_id text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_decks_user on public.decks(user_id);

drop trigger if exists trg_decks_touch on public.decks;
create trigger trg_decks_touch before update on public.decks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- battle_records — histórico de batalhas (campanha, treino, PvP)
-- ---------------------------------------------------------------------------

create table if not exists public.battle_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'campanha' check (mode in ('campanha','treino','pvp')),
  mission_id text not null,
  mission_name text not null,
  outcome text not null check (outcome in ('vitoria','derrota','empate')),
  difficulty text not null default 'normal',
  duration int not null default 0,
  kills int not null default 0,
  losses int not null default 0,
  territorial_score int not null default 0,
  rewards jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_battles_user on public.battle_records(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- pvp_matches — partidas entre jogadores (resultado assíncrono)
-- ---------------------------------------------------------------------------

create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references auth.users(id) on delete set null,
  guest_id uuid references auth.users(id) on delete set null,
  mode text not null default 'equilibrado' check (mode in ('equilibrado','historico','aposta')),
  status text not null default 'aguardando'
    check (status in ('aguardando','em_andamento','encerrada')),
  host_deck text[] not null default '{}'::text[],
  guest_deck text[] not null default '{}'::text[],
  stakes text[] not null default '{}'::text[],
  winner_id uuid references auth.users(id) on delete set null,
  host_score int not null default 0,
  guest_score int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_pvp_open on public.pvp_matches(status, created_at desc);
create index if not exists idx_pvp_host on public.pvp_matches(host_id);
create index if not exists idx_pvp_guest on public.pvp_matches(guest_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.nation_state enable row level security;
alter table public.campaign_progress enable row level security;
alter table public.inventory enable row level security;
alter table public.decks enable row level security;
alter table public.battle_records enable row level security;
alter table public.pvp_matches enable row level security;

-- profiles: dono
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select using (auth.uid() = id);
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- nation_state: dono
drop policy if exists nation_all on public.nation_state;
create policy nation_all on public.nation_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- campaign_progress: dono
drop policy if exists campaign_all on public.campaign_progress;
create policy campaign_all on public.campaign_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- inventory: dono
drop policy if exists inventory_all on public.inventory;
create policy inventory_all on public.inventory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- decks: dono
drop policy if exists decks_all on public.decks;
create policy decks_all on public.decks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- battle_records: dono
drop policy if exists battles_all on public.battle_records;
create policy battles_all on public.battle_records for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- pvp_matches: lobbies abertos são visíveis; só os envolvidos escrevem
drop policy if exists pvp_select on public.pvp_matches;
drop policy if exists pvp_insert on public.pvp_matches;
drop policy if exists pvp_update on public.pvp_matches;
create policy pvp_select on public.pvp_matches for select
  using (
    status = 'aguardando'
    or auth.uid() = host_id
    or auth.uid() = guest_id
  );
create policy pvp_insert on public.pvp_matches for insert
  with check (auth.uid() = host_id);
create policy pvp_update on public.pvp_matches for update
  using (auth.uid() = host_id or auth.uid() = guest_id or (guest_id is null and auth.uid() is not null))
  with check (auth.uid() = host_id or auth.uid() = guest_id);

-- ---------------------------------------------------------------------------
-- Bootstrap do jogador: cria perfil, nação e inventário inicial
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Comandante'),
    coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
  )
  on conflict (id) do nothing;

  insert into public.nation_state (user_id) values (new.id)
  on conflict (user_id) do nothing;

  -- baralho inicial
  insert into public.inventory (user_id, item_kind, item_id, source)
  select new.id, 'carta', c, 'inicial'
  from unnest(array[
    'inf-fuzileiros','inf-mecanizada','bld-leve','art-morteiro',
    'def-aa','def-engenharia','rec-patrulha','sup-fumaca'
  ]) as c
  on conflict (user_id, item_kind, item_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
