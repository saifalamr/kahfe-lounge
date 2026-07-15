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
-- RLS lockdown: categories/menu_items/orders/monthly_reports previously had
-- RLS disabled entirely (no default-deny floor at all - worse than the
-- permissive-but-enabled pattern used everywhere else). Brought in line with
-- the rest of the schema: RLS enabled, same open read/insert/update policies,
-- no delete policy (matches the rest of the app - nothing here should be
-- hard-deletable via the anon key).
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.monthly_reports enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'categories' and policyname = 'categories public read') then
    create policy "categories public read" on public.categories for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'categories' and policyname = 'categories public insert') then
    create policy "categories public insert" on public.categories for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'categories' and policyname = 'categories public update') then
    create policy "categories public update" on public.categories for update using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'menu_items' and policyname = 'menu_items public read') then
    create policy "menu_items public read" on public.menu_items for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'menu_items' and policyname = 'menu_items public insert') then
    create policy "menu_items public insert" on public.menu_items for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'menu_items' and policyname = 'menu_items public update') then
    create policy "menu_items public update" on public.menu_items for update using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'orders' and policyname = 'orders public read') then
    create policy "orders public read" on public.orders for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'orders' and policyname = 'orders public insert') then
    create policy "orders public insert" on public.orders for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'orders' and policyname = 'orders public update') then
    create policy "orders public update" on public.orders for update using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'monthly_reports' and policyname = 'monthly_reports public read') then
    create policy "monthly_reports public read" on public.monthly_reports for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'monthly_reports' and policyname = 'monthly_reports public insert') then
    create policy "monthly_reports public insert" on public.monthly_reports for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'monthly_reports' and policyname = 'monthly_reports public update') then
    create policy "monthly_reports public update" on public.monthly_reports for update using (true) with check (true);
  end if;
end $$;

-- reset_markers table removed (2026-07-16): the Sıfırla feature let a
-- period's stats be reset on one panel without the header/owner panel
-- knowing about it, causing different "today" totals in different places.
-- Today/week/month totals now always compute from the real period start,
-- everywhere, with no override. If you find `drop table if exists
-- public.reset_markers;` useful as a one-off cleanup, it's already been run
-- on production — this comment is just so schema.sql doesn't recreate it.

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
-- Lets order submission be safely retried after a dropped connection (see
-- lib/offlineQueue.ts): each order gets a client-generated ID at creation
-- time, and this unique index means the database itself rejects a
-- duplicate insert if a retry ever fires twice. NULLs don't conflict with
-- each other in Postgres, so existing rows without one are unaffected.
alter table public.orders add column if not exists client_order_id uuid;
create unique index if not exists idx_orders_client_order_id on public.orders(client_order_id) where client_order_id is not null;

-- Invoice numbers, assigned automatically by the DB
create sequence if not exists fatura_seq start 1;
create or replace function assign_fatura_no() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'closed' and new.fatura_no is null then
    new.fatura_no := nextval('fatura_seq');
  end if;
  return new;
end; $$;
drop trigger if exists trg_assign_fatura_no on public.tabs;
create trigger trg_assign_fatura_no before insert or update on public.tabs
for each row execute function assign_fatura_no();

-- Defensive backfill, safe to run every time: a live audit found 20 closed
-- tabs with no fatura_no at all (root cause not fully pinned down, possibly
-- a rare update path that bypassed the trigger before it covered INSERT
-- too) — this catches any tab that's closed but missing one, whenever it
-- runs. A no-op once everything is already assigned.
update tabs set fatura_no = nextval('fatura_seq') where status = 'closed' and fatura_no is null;

-- Atomic tab creation/transfer/merge (race-condition safe)
--
-- Normalizes the Turkish İ vs plain ASCII I difference on both sides
-- when matching an existing open tab, and snaps a newly-created tab to
-- whichever spelling is canonical in settings.tables when a normalized
-- match exists there. Needed because a caller (a QR code baked with the
-- wrong variant, a manual entry, etc.) can hand in an already-uppercase
-- table name that JS's toLocaleUpperCase('tr-TR') can't fix client-side
-- (it only converts lowercase i -> İ; it leaves an already-uppercase
-- ASCII I alone) — without this, that becomes an invisible ghost tab.
create or replace function get_or_create_open_tab(p_table_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tab_id uuid;
  v_canonical text;
begin
  perform pg_advisory_xact_lock(hashtext(upper(replace(p_table_name, 'İ', 'I'))));

  select id into v_tab_id
  from tabs
  where status = 'open'
    and upper(replace(table_name, 'İ', 'I')) = upper(replace(p_table_name, 'İ', 'I'))
  limit 1;
  if v_tab_id is not null then return v_tab_id; end if;

  select t.value into v_canonical
  from (
    select jsonb_array_elements_text(value) as value
    from settings where key = 'tables'
  ) t
  where upper(replace(t.value, 'İ', 'I')) = upper(replace(p_table_name, 'İ', 'I'))
  limit 1;

  insert into tabs(table_name, status) values (coalesce(v_canonical, p_table_name), 'open') returning id into v_tab_id;
  return v_tab_id;
end; $$;
grant execute on function get_or_create_open_tab(text) to anon, authenticated;

create or replace function merge_or_transfer_tab(p_source_tab_id uuid, p_destination_table_name text)
returns uuid language plpgsql security definer set search_path = public as $$
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
language sql security definer set search_path = public as $$ select id, name from staff where pin = p_pin and active = true limit 1; $$;
grant execute on function verify_staff_pin(text) to anon, authenticated;

-- Small helper reused by every staff-management function below so a valid
-- manager session is required before any of them will do anything.
create or replace function assert_manager_session(p_session_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from device_sessions
    where token = p_session_token and role = 'manager' and expires_at > now()
  ) then
    raise exception 'not authorized';
  end if;
end; $$;
grant execute on function assert_manager_session(uuid) to anon, authenticated;

-- list_staff previously took no arguments and returned every staff member's
-- name + PIN + permission to ANYONE holding the anon key, no login required
-- at all — arguably a bigger exposure than the original hardcoded-password
-- issue, since it needed zero interaction with the app to hit directly.
-- Now requires a valid manager session, same as everything else here.
drop function if exists list_staff();
create or replace function list_staff(p_session_token uuid) returns setof staff
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager_session(p_session_token);
  return query select * from staff order by created_at;
end; $$;
grant execute on function list_staff(uuid) to anon, authenticated;

drop function if exists upsert_staff(uuid, text, text);
drop function if exists upsert_staff(uuid, text, text, text);
create or replace function upsert_staff(p_session_token uuid, p_id uuid, p_name text, p_pin text, p_permission text default 'full') returns staff
language plpgsql security definer set search_path = public as $$
declare result staff;
begin
  perform assert_manager_session(p_session_token);
  if p_id is null then insert into staff(name, pin, active, permission) values (p_name, p_pin, true, p_permission) returning * into result;
  else update staff set name = p_name, pin = p_pin, permission = p_permission where id = p_id returning * into result; end if;
  return result;
end; $$;
grant execute on function upsert_staff(uuid, uuid, text, text, text) to anon, authenticated;

drop function if exists set_staff_active(uuid, boolean);
create or replace function set_staff_active(p_session_token uuid, p_id uuid, p_active boolean) returns staff
language plpgsql security definer set search_path = public as $$
declare result staff;
begin
  perform assert_manager_session(p_session_token);
  update staff set active = p_active where id = p_id returning * into result;
  return result;
end; $$;
grant execute on function set_staff_active(uuid, uuid, boolean) to anon, authenticated;

drop function if exists delete_staff(uuid);
create or replace function delete_staff(p_session_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager_session(p_session_token);
  delete from staff where id = p_id;
end; $$;
grant execute on function delete_staff(uuid, uuid) to anon, authenticated;

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
-- menu_items stock tracking — item-level (not full ingredient/recipe-level
-- inventory). Off by default per item; when on, stock decrements per order
-- and the item auto-hides at zero, then restores on void/cancel.
-- ---------------------------------------------------------------------------
alter table public.menu_items add column if not exists track_stock boolean not null default false;
alter table public.menu_items add column if not exists stock_quantity integer not null default 0;
alter table public.menu_items add column if not exists low_stock_threshold integer not null default 5;

create or replace function decrement_stock_for_order(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    update menu_items
    set stock_quantity = greatest(0, stock_quantity - (item->>'quantity')::int),
        available = (greatest(0, stock_quantity - (item->>'quantity')::int) > 0)
    where id = (item->>'id')::uuid and track_stock = true;
  end loop;
end; $$;
grant execute on function decrement_stock_for_order(jsonb) to anon, authenticated;

create or replace function restore_stock_for_items(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    update menu_items
    set stock_quantity = stock_quantity + (item->>'quantity')::int,
        available = case when track_stock and stock_quantity + (item->>'quantity')::int > 0 then true else available end
    where id = (item->>'id')::uuid and track_stock = true;
  end loop;
end; $$;
grant execute on function restore_stock_for_items(jsonb) to anon, authenticated;

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
  ('staff_shared', '5678'),
  ('owner', '7777')
on conflict (role) do nothing;

create or replace function verify_access_pin(p_pin text) returns text
language sql security definer set search_path = public as $$
  select role from access_pins where pin = p_pin limit 1;
$$;
grant execute on function verify_access_pin(text) to anon, authenticated;

create or replace function pin_is_reserved(p_pin text) returns boolean
language sql security definer set search_path = public as $$
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
language sql stable set search_path = public as $$
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
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_staff_id uuid;
  v_staff_name text;
  v_permission text;
  v_token uuid;
  v_ip text;
  v_expires_at timestamptz;
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

  -- Manager (1234), Touchscreen (9000), and Owner (7777, the Patron View
  -- on the owner's personal phone) are fixed, trusted devices that should
  -- basically never need re-login. Staff PINs (individual + the shared
  -- 5678) keep the original 24h expiry - those change hands more often
  -- and are the more likely-to-be-compromised case.
  v_expires_at := case when v_role in ('manager', 'touchscreen', 'owner') then now() + interval '100 years' else now() + interval '24 hours' end;

  insert into device_sessions(role, expires_at) values (v_role, v_expires_at) returning device_sessions.token into v_token;
  return query select v_role,
    v_token,
    coalesce(v_staff_name, case v_role when 'manager' then 'Yönetici' when 'touchscreen' then 'Dokunmatik Ekran' when 'owner' then 'Patron' else 'Personel (Genel)' end),
    coalesce(v_permission, 'full');
end; $$;
grant execute on function login_with_pin(text) to anon, authenticated;

-- update_access_pin requires proof of a valid, non-expired manager session —
-- closes the hole where anyone with the anon key could call it directly and
-- set their own manager PIN without ever logging in.
--
-- IMPORTANT: an old 2-argument version (p_role, p_new_pin — no session
-- token) was created before session tokens existed, and simply adding the
-- new 3-argument version alongside it (via create-or-replace) never removed
-- it, since Postgres treats different argument lists as different
-- overloaded functions. That old signature had ZERO auth check and was
-- still directly callable, completely bypassing the fix below, until this
-- explicit drop.
drop function if exists update_access_pin(text, text);
create or replace function update_access_pin(p_session_token uuid, p_role text, p_new_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager_session(p_session_token);
  if p_role not in ('manager', 'touchscreen', 'owner') then
    raise exception 'Staff access is granted via the Personel tab only, not a shared PIN.';
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
-- Added after a live database audit found these foreign keys had no
-- covering index, which matters for Fiş Geçmişi, Ürün Raporu, İndirim &
-- İptal Raporu, and the customer menu's item-options picker, all of which
-- join through these columns
create index if not exists idx_debt_transactions_tab_id on public.debt_transactions(tab_id);
create index if not exists idx_discounts_tab_id on public.discounts(tab_id);
create index if not exists idx_item_option_choices_group_id on public.item_option_choices(group_id);
create index if not exists idx_item_option_groups_menu_item_id on public.item_option_groups(menu_item_id);
create index if not exists idx_menu_items_category_id on public.menu_items(category_id);
create index if not exists idx_voids_order_id on public.voids(order_id);

-- ---------------------------------------------------------------------------
-- refunds — audit trail for post-close corrections: a full reopen (tab
-- goes back to 'open', same fatura_no, editable/re-closable) or a refund
-- recorded against a tab that stays closed/historical. Cash refunds also
-- create a matching "Kasadan Çıkış" cash_movements row; debt refunds/
-- reopens create an offsetting 'ödeme' debt_transactions row.
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid references public.tabs(id) on delete set null,
  table_name text not null,
  fatura_no bigint,
  type text not null check (type in ('refund','reopen')),
  method text, -- 'cash'|'card'|'transfer'|'debt', null for a plain reopen
  amount numeric not null default 0,
  reason text not null,
  staff_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_refunds_tab_id on public.refunds(tab_id);
create index if not exists idx_refunds_created_at on public.refunds(created_at);
alter table public.refunds enable row level security;
drop policy if exists "refunds public select" on public.refunds;
create policy "refunds public select" on public.refunds for select using (true);
drop policy if exists "refunds public insert" on public.refunds;
create policy "refunds public insert" on public.refunds for insert with check (true);
grant select, insert on public.refunds to anon, authenticated;

-- ---------------------------------------------------------------------------
-- nargile_timers — coal-check countdown, one per open tab that's had a
-- nargile item served. Self-cleaning: always queried joined against
-- tabs.status='open', so a closed tab's timer just stops appearing rather
-- than needing an explicit deactivation step.
-- ---------------------------------------------------------------------------
create table if not exists public.nargile_timers (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  table_name text not null,
  started_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  checked_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_nargile_timers_tab_id on public.nargile_timers(tab_id);
alter table public.nargile_timers enable row level security;
drop policy if exists "nargile_timers public select" on public.nargile_timers;
create policy "nargile_timers public select" on public.nargile_timers for select using (true);
drop policy if exists "nargile_timers public insert" on public.nargile_timers;
create policy "nargile_timers public insert" on public.nargile_timers for insert with check (true);
drop policy if exists "nargile_timers public update" on public.nargile_timers;
create policy "nargile_timers public update" on public.nargile_timers for update using (true);
grant select, insert, update on public.nargile_timers to anon, authenticated;

-- =============================================================================
-- END — if this whole file ran without errors, the database is fully caught up.
-- =============================================================================
