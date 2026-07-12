-- =============================================================================
-- KAHFE LOUNGE — CONSOLIDATED SCHEMA
-- =============================================================================
-- This is the single source of truth for the database. Every table, column,
-- and function the app depends on should exist here — not scattered across
-- old chat messages. Safe to run this ENTIRE file at any time, on any state
-- of the database (fresh project or one that's missing a few things): every
-- statement is written to be idempotent (create-if-not-exists, drop-then-
-- recreate for functions, etc), so re-running it never breaks anything that
-- already exists correctly.
--
-- WHEN TO RUN THIS: any time login breaks with "system error" instead of a
-- normal wrong-password message, or after being told a new feature needs a
-- database change — just run this whole file again rather than hunting for
-- a specific snippet. It's always safe.
--
-- Assumes categories, menu_items, orders (base columns), and the
-- menu-images storage bucket already exist from initial project setup.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- reset_markers (Sıfırla)
-- ---------------------------------------------------------------------------
create table if not exists public.reset_markers (
  key text primary key, reset_at timestamptz not null, updated_at timestamptz not null default now()
);
alter table public.reset_markers enable row level security;
drop policy if exists "reset public read" on public.reset_markers;
create policy "reset public read" on public.reset_markers for select using (true);
drop policy if exists "reset public insert" on public.reset_markers;
create policy "reset public insert" on public.reset_markers for insert with check (true);
drop policy if exists "reset public update" on public.reset_markers;
create policy "reset public update" on public.reset_markers for update using (true);

-- ---------------------------------------------------------------------------
-- tabs (running bills) — includes every column added over time
-- ---------------------------------------------------------------------------
create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(), table_name text not null, status text not null default 'open',
  opened_at timestamptz not null default now(), closed_at timestamptz, bill_requested boolean not null default false,
  payment_method text, total numeric not null default 0, closed_by text, created_at timestamptz not null default now(),
  cash_amount numeric not null default 0, card_amount numeric not null default 0,
  discount_amount numeric not null default 0, discount_reason text,
  fatura_no bigint, debt_amount numeric not null default 0
);
alter table public.tabs add column if not exists transfer_amount numeric not null default 0;
alter table public.tabs enable row level security;
drop policy if exists "tabs public read" on public.tabs;
create policy "tabs public read" on public.tabs for select using (true);
drop policy if exists "tabs public insert" on public.tabs;
create policy "tabs public insert" on public.tabs for insert with check (true);
drop policy if exists "tabs public update" on public.tabs;
create policy "tabs public update" on public.tabs for update using (true);

alter table public.orders add column if not exists tab_id uuid references public.tabs(id);
alter table public.orders add column if not exists created_by text;
alter table public.orders add column if not exists handled_by text;

-- Invoice numbers, assigned automatically by the DB
create sequence if not exists fatura_seq start 1;
create or replace function assign_fatura_no() returns trigger as $$
begin
  if new.status = 'closed' and new.fatura_no is null then
    new.fatura_no := nextval('fatura_seq');
  end if;
  return new;
end; $$ language plpgsql;
drop trigger if exists trg_assign_fatura_no on public.tabs;
create trigger trg_assign_fatura_no before update on public.tabs
for each row execute function assign_fatura_no();

-- Atomic tab creation/transfer/merge (race-condition safe)
create or replace function get_or_create_open_tab(p_table_name text)
returns uuid language plpgsql security definer as $$
declare v_tab_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_table_name));
  select id into v_tab_id from tabs where table_name = p_table_name and status = 'open' limit 1;
  if v_tab_id is not null then return v_tab_id; end if;
  insert into tabs(table_name, status) values (p_table_name, 'open') returning id into v_tab_id;
  return v_tab_id;
end; $$;
grant execute on function get_or_create_open_tab(text) to anon, authenticated;

create or replace function merge_or_transfer_tab(p_source_tab_id uuid, p_destination_table_name text)
returns uuid language plpgsql security definer as $$
declare v_dest_tab_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_destination_table_name));
  select id into v_dest_tab_id from tabs where table_name = p_destination_table_name and status = 'open' limit 1;
  if v_dest_tab_id is null then
    update tabs set table_name = p_destination_table_name where id = p_source_tab_id;
    update orders set table_name = p_destination_table_name where tab_id = p_source_tab_id;
    return p_source_tab_id;
  else
    update orders set tab_id = v_dest_tab_id, table_name = p_destination_table_name where tab_id = p_source_tab_id;
    update tabs set status = 'merged', closed_at = now() where id = p_source_tab_id;
    return v_dest_tab_id;
  end if;
end; $$;
grant execute on function merge_or_transfer_tab(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- staff (individual PINs, RPC-only access, no direct table read)
-- ---------------------------------------------------------------------------
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(), name text not null, pin text not null unique,
  active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.staff add column if not exists permission text not null default 'full';
alter table public.staff enable row level security;
-- (no direct select/insert/update/delete policies - all access via RPCs below)

create or replace function verify_staff_pin(p_pin text) returns table(id uuid, name text)
language sql security definer as $$ select id, name from staff where pin = p_pin and active = true limit 1; $$;
grant execute on function verify_staff_pin(text) to anon, authenticated;

create or replace function list_staff() returns setof staff
language sql security definer as $$ select * from staff order by created_at; $$;
grant execute on function list_staff() to anon, authenticated;

drop function if exists upsert_staff(uuid, text, text);
create or replace function upsert_staff(p_id uuid, p_name text, p_pin text, p_permission text default 'full') returns staff
language plpgsql security definer as $$
declare result staff;
begin
  if p_id is null then insert into staff(name, pin, active, permission) values (p_name, p_pin, true, p_permission) returning * into result;
  else update staff set name = p_name, pin = p_pin, permission = p_permission where id = p_id returning * into result; end if;
  return result;
end; $$;
grant execute on function upsert_staff(uuid, text, text, text) to anon, authenticated;

create or replace function set_staff_active(p_id uuid, p_active boolean) returns staff
language plpgsql security definer as $$
declare result staff;
begin update staff set active = p_active where id = p_id returning * into result; return result; end; $$;
grant execute on function set_staff_active(uuid, boolean) to anon, authenticated;

create or replace function delete_staff(p_id uuid) returns void
language plpgsql security definer as $$ begin delete from staff where id = p_id; end; $$;
grant execute on function delete_staff(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- day_close_reports (Gün Sonu)
-- ---------------------------------------------------------------------------
create table if not exists public.day_close_reports (
  id uuid primary key default gen_random_uuid(), report_date date not null, total_revenue numeric not null default 0,
  cash_total numeric not null default 0, card_total numeric not null default 0, tab_count integer not null default 0,
  counted_cash numeric, cash_difference numeric, closed_by text, created_at timestamptz not null default now()
);
alter table public.day_close_reports add column if not exists transfer_total numeric not null default 0;
alter table public.day_close_reports add column if not exists debt_total numeric not null default 0;
alter table public.day_close_reports add column if not exists cash_in_total numeric not null default 0;
alter table public.day_close_reports add column if not exists cash_out_total numeric not null default 0;
alter table public.day_close_reports enable row level security;
drop policy if exists "day_close public read" on public.day_close_reports;
create policy "day_close public read" on public.day_close_reports for select using (true);
drop policy if exists "day_close public insert" on public.day_close_reports;
create policy "day_close public insert" on public.day_close_reports for insert with check (true);

-- ---------------------------------------------------------------------------
-- voids (item + full-order cancellation audit trail)
-- ---------------------------------------------------------------------------
create table if not exists public.voids (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id), table_name text,
  item_name text, quantity integer, amount numeric, reason text, voided_by text, created_at timestamptz not null default now()
);
alter table public.voids enable row level security;
drop policy if exists "voids public read" on public.voids;
create policy "voids public read" on public.voids for select using (true);
drop policy if exists "voids public insert" on public.voids;
create policy "voids public insert" on public.voids for insert with check (true);

-- ---------------------------------------------------------------------------
-- discounts (audit trail)
-- ---------------------------------------------------------------------------
create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(), tab_id uuid references public.tabs(id), table_name text,
  original_amount numeric, discount_amount numeric, reason text, applied_by text, created_at timestamptz not null default now()
);
alter table public.discounts enable row level security;
drop policy if exists "discounts public read" on public.discounts;
create policy "discounts public read" on public.discounts for select using (true);
drop policy if exists "discounts public insert" on public.discounts;
create policy "discounts public insert" on public.discounts for insert with check (true);

-- ---------------------------------------------------------------------------
-- settings (Ayarlar: telegram_recipients, telegram_enabled, tables,
-- category_stations, auto_print_enabled, table_positions, session_epoch)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings for select using (true);
drop policy if exists "settings public insert" on public.settings;
create policy "settings public insert" on public.settings for insert with check (true);
drop policy if exists "settings public update" on public.settings;
create policy "settings public update" on public.settings for update using (true);

-- ---------------------------------------------------------------------------
-- debtors + debt_transactions (Borç)
-- ---------------------------------------------------------------------------
create table if not exists public.debtors (
  id uuid primary key default gen_random_uuid(), name text not null, phone text, created_at timestamptz not null default now()
);
alter table public.debtors enable row level security;
drop policy if exists "debtors public read" on public.debtors;
create policy "debtors public read" on public.debtors for select using (true);
drop policy if exists "debtors public insert" on public.debtors;
create policy "debtors public insert" on public.debtors for insert with check (true);
drop policy if exists "debtors public update" on public.debtors;
create policy "debtors public update" on public.debtors for update using (true);

create table if not exists public.debt_transactions (
  id uuid primary key default gen_random_uuid(), debtor_id uuid references public.debtors(id),
  tab_id uuid references public.tabs(id), fatura_no bigint, type text not null,
  amount numeric not null, note text, created_by text, created_at timestamptz not null default now()
);
alter table public.debt_transactions enable row level security;
drop policy if exists "debt_tx public read" on public.debt_transactions;
create policy "debt_tx public read" on public.debt_transactions for select using (true);
drop policy if exists "debt_tx public insert" on public.debt_transactions;
create policy "debt_tx public insert" on public.debt_transactions for insert with check (true);

-- ---------------------------------------------------------------------------
-- menu_items.staff_only — items marked this way are hidden from the customer
-- QR menu but still selectable by staff in Sipariş Ekle (e.g. VİP Oda
-- (Saatlik), or anything else that should only ever be added by staff)
-- ---------------------------------------------------------------------------
alter table public.menu_items add column if not exists staff_only boolean not null default false;

-- ---------------------------------------------------------------------------
-- item options (e.g. Şeker Oranı: Sade/Az Şekerli/Orta Şekerli/Şekerli)
-- name_en/name_ar let the customer menu show translated option names
-- ---------------------------------------------------------------------------
create table if not exists public.item_option_groups (
  id uuid primary key default gen_random_uuid(), menu_item_id uuid references public.menu_items(id) on delete cascade,
  name text not null, required boolean not null default true, order_index integer not null default 0, created_at timestamptz not null default now()
);
alter table public.item_option_groups add column if not exists name_en text;
alter table public.item_option_groups add column if not exists name_ar text;
alter table public.item_option_groups enable row level security;
drop policy if exists "option_groups public read" on public.item_option_groups;
create policy "option_groups public read" on public.item_option_groups for select using (true);
drop policy if exists "option_groups public insert" on public.item_option_groups;
create policy "option_groups public insert" on public.item_option_groups for insert with check (true);
drop policy if exists "option_groups public update" on public.item_option_groups;
create policy "option_groups public update" on public.item_option_groups for update using (true);
drop policy if exists "option_groups public delete" on public.item_option_groups;
create policy "option_groups public delete" on public.item_option_groups for delete using (true);

create table if not exists public.item_option_choices (
  id uuid primary key default gen_random_uuid(), group_id uuid references public.item_option_groups(id) on delete cascade,
  name text not null, price_delta numeric not null default 0, order_index integer not null default 0, created_at timestamptz not null default now()
);
alter table public.item_option_choices add column if not exists name_en text;
alter table public.item_option_choices add column if not exists name_ar text;
alter table public.item_option_choices enable row level security;
drop policy if exists "option_choices public read" on public.item_option_choices;
create policy "option_choices public read" on public.item_option_choices for select using (true);
drop policy if exists "option_choices public insert" on public.item_option_choices;
create policy "option_choices public insert" on public.item_option_choices for insert with check (true);
drop policy if exists "option_choices public update" on public.item_option_choices;
create policy "option_choices public update" on public.item_option_choices for update using (true);
drop policy if exists "option_choices public delete" on public.item_option_choices;
create policy "option_choices public delete" on public.item_option_choices for delete using (true);

-- ---------------------------------------------------------------------------
-- access_pins (Manager/Touchscreen/shared-staff-code PINs — server-side only,
-- never shipped in client JS)
-- ---------------------------------------------------------------------------
create table if not exists public.access_pins (
  role text primary key,
  pin text not null
);
alter table public.access_pins enable row level security;
-- No select/insert/update policies on purpose — RPC access only.

insert into public.access_pins (role, pin) values
  ('manager', '1234'),
  ('touchscreen', '9000'),
  ('staff_shared', '5678')
on conflict (role) do nothing;

create or replace function verify_access_pin(p_pin text) returns text
language sql security definer as $$
  select role from access_pins where pin = p_pin limit 1;
$$;
grant execute on function verify_access_pin(text) to anon, authenticated;

create or replace function pin_is_reserved(p_pin text) returns boolean
language sql security definer as $$
  select exists(select 1 from access_pins where pin = p_pin);
$$;
grant execute on function pin_is_reserved(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- login_attempts + rate limiting helper
-- ---------------------------------------------------------------------------
create table if not exists public.login_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_login_attempts_ip_time on public.login_attempts(ip, attempted_at);
alter table public.login_attempts enable row level security;
-- No policies — RPC access only.

create or replace function get_client_ip() returns text
language sql stable as $$
  select split_part(coalesce((current_setting('request.headers', true)::json->>'x-forwarded-for'), 'unknown'), ',', 1);
$$;
grant execute on function get_client_ip() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- device_sessions (server-minted session tokens)
-- ---------------------------------------------------------------------------
create table if not exists public.device_sessions (
  token uuid primary key default gen_random_uuid(),
  role text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.device_sessions enable row level security;
-- No policies — RPC access only.

-- ---------------------------------------------------------------------------
-- login_with_pin — THE single login RPC. Verifies the PIN (staff PIN or
-- manager/touchscreen/staff-shared) AND mints a session token atomically,
-- with the same rate limit as before. Dropped first because its return
-- signature has changed over time (adding `permission`) and Postgres won't
-- let create-or-replace change a function's return columns.
-- ---------------------------------------------------------------------------
drop function if exists login_with_pin(text);
create or replace function login_with_pin(p_pin text)
returns table(role text, token uuid, staff_name text, permission text)
language plpgsql security definer as $$
declare
  v_role text;
  v_staff_id uuid;
  v_staff_name text;
  v_permission text;
  v_token uuid;
  v_ip text;
begin
  v_ip := get_client_ip();
  if (select count(*) from login_attempts where ip = v_ip and attempted_at > now() - interval '10 minutes') >= 15 then
    return;
  end if;

  select s.id, s.name, s.permission into v_staff_id, v_staff_name, v_permission from staff s where s.pin = p_pin and s.active = true limit 1;
  if v_staff_id is not null then
    v_role := 'staff';
  else
    select a.role into v_role from access_pins a where a.pin = p_pin limit 1;
  end if;

  if v_role is null then
    insert into login_attempts(ip) values (v_ip);
    return;
  end if;

  insert into device_sessions(role, expires_at) values (v_role, now() + interval '24 hours') returning device_sessions.token into v_token;
  return query select v_role,
    v_token,
    coalesce(v_staff_name, case v_role when 'manager' then 'Yönetici' when 'touchscreen' then 'Dokunmatik Ekran' else 'Personel (Genel)' end),
    coalesce(v_permission, 'full');
end; $$;
grant execute on function login_with_pin(text) to anon, authenticated;

-- update_access_pin requires proof of a valid, non-expired manager session —
-- closes the hole where anyone with the anon key could call it directly and
-- set their own manager PIN without ever logging in.
create or replace function update_access_pin(p_session_token uuid, p_role text, p_new_pin text) returns void
language plpgsql security definer as $$
begin
  if not exists (
    select 1 from device_sessions
    where token = p_session_token and role = 'manager' and expires_at > now()
  ) then
    raise exception 'not authorized';
  end if;
  update access_pins set pin = p_new_pin where role = p_role;
end; $$;
grant execute on function update_access_pin(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- shifts (Vardiya) — shift-based cash drawer reconciliation
-- ---------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  counted_cash numeric,
  cash_difference numeric,
  cash_total numeric,
  card_total numeric,
  transfer_total numeric,
  debt_total numeric,
  total_revenue numeric,
  tab_count integer,
  created_at timestamptz not null default now()
);
alter table public.shifts add column if not exists cash_in_total numeric not null default 0;
alter table public.shifts add column if not exists cash_out_total numeric not null default 0;
alter table public.shifts enable row level security;
drop policy if exists "shifts public read" on public.shifts;
create policy "shifts public read" on public.shifts for select using (true);
drop policy if exists "shifts public insert" on public.shifts;
create policy "shifts public insert" on public.shifts for insert with check (true);
drop policy if exists "shifts public update" on public.shifts;
create policy "shifts public update" on public.shifts for update using (true);

-- ---------------------------------------------------------------------------
-- cash_movements (Kasa Hareketi) — manual cash in/out unrelated to sales
-- ---------------------------------------------------------------------------
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('in', 'out')),
  amount numeric not null,
  reason text not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.cash_movements enable row level security;
drop policy if exists "cash_movements public read" on public.cash_movements;
create policy "cash_movements public read" on public.cash_movements for select using (true);
drop policy if exists "cash_movements public insert" on public.cash_movements;
create policy "cash_movements public insert" on public.cash_movements for insert with check (true);

-- ---------------------------------------------------------------------------
-- performance indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_orders_created_at on public.orders(created_at);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_tab_id on public.orders(tab_id);
create index if not exists idx_tabs_status on public.tabs(status);
create index if not exists idx_tabs_closed_at on public.tabs(closed_at);
create index if not exists idx_tabs_table_name on public.tabs(table_name);
create index if not exists idx_debt_tx_debtor_id on public.debt_transactions(debtor_id);

-- =============================================================================
-- END — if this whole file ran without errors, the database is fully caught up.
-- =============================================================================
