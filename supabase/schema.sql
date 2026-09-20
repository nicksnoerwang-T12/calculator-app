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
  address text,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now()
);
-- address/lat/lng zijn later toegevoegd (CRM pakket 2, "in de buurt") — idempotent bijwerken van
-- een tabel die al bestond, vandaar losse ALTER-instructies i.p.v. alleen CREATE TABLE.
alter table customers add column if not exists address text;
alter table customers add column if not exists lat double precision;
alter table customers add column if not exists lng double precision;

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

-- Abonnementsstatus (freemium-laag, paywall/). Bewust GEEN insert/update/delete-policy voor de
-- 'authenticated'-rol: een gebruiker mag zijn eigen status alleen LEZEN, nooit zelf schrijven —
-- anders kan iedereen zichzelf gratis "actief abonnement" geven. Schrijven gebeurt uitsluitend
-- door de Mollie-webhook Edge Function met de service-role-sleutel, die RLS altijd omzeilt.
-- Zie paywall/README.md en supabase/functions/mollie-webhook.
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'none',
  plan text,
  mollie_customer_id text,
  mollie_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- CRM-acties (pakket 1, "nooit meer vergeten"). project_id verwijst naar projects.id (dat is de
-- STORE.calculations-entry-id, niet iets op de job zelf — zie crm/README.md). on delete cascade
-- zodat een verwijderde klus niet met dode acties achterblijft; customer_id set null (een actie
-- mag ook zonder klant blijven bestaan).
create table if not exists crm_actions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  customer_id text references customers(id) on delete set null,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

-- Contactlog (pakket 2). Append-only vanuit de client (zie mergeCrmLogRows in crm.js: een
-- bestaande regel wordt nooit overschreven bij het mergen) — dus geen schrijfconflicten mogelijk.
create table if not exists crm_log (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  customer_id text references customers(id) on delete cascade,
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists projects_user_id_idx on projects(user_id);
create index if not exists customers_user_id_idx on customers(user_id);
create index if not exists quotes_user_id_idx on quotes(user_id);
create index if not exists quotes_project_id_idx on quotes(project_id);
create index if not exists templates_user_id_idx on templates(user_id);
create index if not exists crm_actions_user_id_idx on crm_actions(user_id);
create index if not exists crm_actions_project_id_idx on crm_actions(project_id);
create index if not exists crm_log_user_id_idx on crm_log(user_id);
create index if not exists crm_log_customer_id_idx on crm_log(customer_id);

alter table customers enable row level security;
alter table projects enable row level security;
alter table user_settings enable row level security;
alter table quotes enable row level security;
alter table templates enable row level security;
alter table subscriptions enable row level security;
alter table crm_actions enable row level security;
alter table crm_log enable row level security;

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

-- quotes/templates hadden RLS al aan staan maar misten nog een policy (dus alles-dicht totdat
-- deze er stond) — hier alsnog toegevoegd, zelfde eigen-rijen-patroon als de rest.
drop policy if exists "quotes_own_rows" on quotes;
create policy "quotes_own_rows" on quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "templates_own_rows" on templates;
create policy "templates_own_rows" on templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- subscriptions: alleen lezen, nooit zelf schrijven (zie de tabelcommentaar hierboven).
drop policy if exists "subscriptions_read_own" on subscriptions;
create policy "subscriptions_read_own" on subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "crm_actions_own_rows" on crm_actions;
create policy "crm_actions_own_rows" on crm_actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "crm_log_own_rows" on crm_log;
create policy "crm_log_own_rows" on crm_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
