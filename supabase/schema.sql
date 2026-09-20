-- WerkBank cloud-sync schema.
-- Plak dit één keer in de Supabase SQL Editor (Project → SQL Editor → New query → Run).
-- Veilig om opnieuw te draaien: elke instructie is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS).

create table if not exists customers (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  contact text,
  email text,
  phone text,
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  title text,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists quotes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  number text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists templates (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  base_template_id text not null,
  name text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists projects_user_id_idx on projects(user_id);
create index if not exists customers_user_id_idx on customers(user_id);
create index if not exists quotes_user_id_idx on quotes(user_id);
create index if not exists quotes_project_id_idx on quotes(project_id);
create index if not exists templates_user_id_idx on templates(user_id);

alter table customers enable row level security;
alter table projects enable row level security;
alter table user_settings enable row level security;
alter table quotes enable row level security;
alter table templates enable row level security;

-- Elke gebruiker ziet en wijzigt uitsluitend zijn eigen rijen.
drop policy if exists "customers_own_rows" on customers;
create policy "customers_own_rows" on customers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_own_rows" on projects;
create policy "projects_own_rows" on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_settings_own_row" on user_settings;
create policy "user_settings_own_row" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
