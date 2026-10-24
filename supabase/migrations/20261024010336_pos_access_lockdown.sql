-- Source: supabase/pos-lockdown.sql
-- Activate only after compatible clients are published and acceptance-tested.
-- No business records are deleted. Public catalog reads remain available.
do $$
declare t text; cap text; pol record;
begin
 foreach t in array array['orders','tabs','categories','menu_items','item_option_groups','item_option_choices','settings',
 'cash_movements','day_close_reports','debt_transactions','debtors','discounts','monthly_reports','nargile_timers','price_edits','refunds','shifts','voids','suppliers'] loop
  for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',pol.policyname,t);
  end loop;
  execute format('alter table public.%I enable row level security',t);
  if t='menu_items' then
   execute 'create policy catalog_read on public.menu_items for select using ((restaurant_id=public.session_restaurant_id() and public.pos_can(''read'')) or (restaurant_id=public.request_restaurant_id() and available and not staff_only))';
  elsif t in ('categories','item_option_groups','item_option_choices') then
   execute format('create policy catalog_read on public.%I for select using (restaurant_id=public.request_restaurant_id())',t);
  elsif t='settings' then
   execute 'create policy settings_read on public.settings for select using ((restaurant_id=public.session_restaurant_id() and public.pos_can(''read'')) or (restaurant_id=public.request_restaurant_id() and key in (''tables'',''receipt_branding'')))';
  else
   execute format('create policy staff_read on public.%I for select using (restaurant_id=public.session_restaurant_id() and public.pos_can(''read''))',t);
  end if;
  cap:=case when t in ('categories','menu_items','item_option_groups','item_option_choices','settings','suppliers') then 'manage' when t in ('nargile_timers','shifts') then 'operate' else 'adjust' end;
  -- All order creation goes through pos_create_order or trusted full-staff adjustments.
  execute format('create policy staff_insert on public.%I for insert with check (restaurant_id=public.session_restaurant_id() and public.pos_can(%L))',t,cap);
  if t in ('orders','tabs','categories','menu_items','item_option_groups','item_option_choices','settings','suppliers','debtors','monthly_reports','nargile_timers','shifts') then
   execute format('create policy staff_update on public.%I for update using (restaurant_id=public.session_restaurant_id() and public.pos_can(%L)) with check (restaurant_id=public.session_restaurant_id() and public.pos_can(%L))',t,cap,cap);
  end if;
  if t in ('categories','menu_items','item_option_groups','item_option_choices','suppliers') then
   execute format('create policy manager_delete on public.%I for delete using (restaurant_id=public.session_restaurant_id() and public.pos_can(''manage''))',t);
  end if;
 end loop;
end; $$;

-- Prevent using legacy side-effect RPCs to manipulate inventory without an order.
revoke execute on function public.decrement_stock_for_order(jsonb) from public,anon,authenticated;
revoke execute on function public.sign_jwt(jsonb,integer) from public,anon,authenticated;
-- Full staff adjustments still use restore_stock_for_items; enforce its role below.
create or replace function public.restore_stock_for_items(p_items jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; rid uuid:=public.session_restaurant_id(); qty int;
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  qty:=(item->>'quantity')::int;
  if qty not between 1 and 100 then raise exception 'Geçersiz adet'; end if;
  update public.menu_items set stock_quantity=stock_quantity+qty,
   available=case when track_stock and stock_quantity+qty>0 then true else available end
  where id=(item->>'id')::uuid and restaurant_id=rid and track_stock;
 end loop;
end; $$;
revoke all on function public.restore_stock_for_items(jsonb) from public;
grant execute on function public.restore_stock_for_items(jsonb) to anon,authenticated;

-- No public writes to menu images. Header/session-based auth is used by this app.
drop policy if exists "Public upload" on storage.objects;
drop policy if exists "Public update" on storage.objects;
drop policy if exists "Public delete" on storage.objects;
create policy pos_image_insert on storage.objects for insert with check(bucket_id='menu-images' and public.pos_can('manage') and (storage.foldername(name))[1]=public.session_restaurant_id()::text);
create policy pos_image_update on storage.objects for update using(bucket_id='menu-images' and public.pos_can('manage') and (storage.foldername(name))[1]=public.session_restaurant_id()::text) with check(bucket_id='menu-images' and public.pos_can('manage') and (storage.foldername(name))[1]=public.session_restaurant_id()::text);
create policy pos_image_delete on storage.objects for delete using(bucket_id='menu-images' and public.pos_can('manage') and (storage.foldername(name))[1]=public.session_restaurant_id()::text);
update storage.buckets set file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='menu-images';
insert into storage.buckets(id,name,public) values('pos-backups','pos-backups',false) on conflict(id) do update set public=false;

-- Store existing PINs as salted bcrypt while keeping current codes valid.
update public.staff set pin=extensions.crypt(pin,extensions.gen_salt('bf',10)) where pin !~ '^\$2[aby]\$';
update public.access_pins set pin=extensions.crypt(pin,extensions.gen_salt('bf',10)) where pin !~ '^\$2[aby]\$';
create or replace function private.hash_pin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.pin=old.pin then return new; end if;
 if new.pin !~ '^[0-9]{4,6}$' then raise exception 'PIN 4-6 rakam olmalı' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.restaurant_id::text||'|pin',0));
 if exists(select 1 from public.staff s where s.restaurant_id=new.restaurant_id and s.pin=extensions.crypt(new.pin,s.pin) and not (TG_TABLE_NAME='staff' and s.id=(to_jsonb(new)->>'id')::uuid))
 or exists(select 1 from public.access_pins a where a.restaurant_id=new.restaurant_id and a.pin=extensions.crypt(new.pin,a.pin) and not (TG_TABLE_NAME='access_pins' and a.role=to_jsonb(new)->>'role')) then
   raise exception 'PIN zaten kullanılıyor' using errcode='23505';
 end if;
 new.pin:=extensions.crypt(new.pin,extensions.gen_salt('bf',10)); return new;
end; $$;
drop trigger if exists hash_staff_pin on public.staff;
create trigger hash_staff_pin before insert or update of pin on public.staff for each row execute function private.hash_pin();
drop trigger if exists hash_access_pin on public.access_pins;
create trigger hash_access_pin before insert or update of pin on public.access_pins for each row execute function private.hash_pin();
-- Retire introspection that used to reveal whether a privileged PIN exists.
revoke execute on function public.pin_is_reserved(text) from public,anon,authenticated;

create or replace function public.get_or_create_open_tab(p_table_name text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501'; end if;
 return private.open_tab(p_table_name);
end; $$;

-- Source: supabase/pos-auth.sql
-- PIN hashing and immediate staff revocation. Existing codes keep working; values are never returned.
CREATE OR REPLACE FUNCTION public.login_with_pin(p_pin text, p_restaurant_slug text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(role text, token uuid, staff_name text, permission text, access_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rid uuid; v_role text; v_staff_id uuid; v_staff_name text; v_permission text;
  v_token uuid; v_ip text; v_expires_at timestamptz; v_trusted boolean; v_ip_fails int; v_global_fails int;
  v_name_final text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then return; end if;
  if random() < 0.02 then perform cleanup_expired(); end if;

  select id into v_rid from restaurants where slug = p_restaurant_slug and active = true;
  if v_rid is null then return; end if;

  v_ip := get_client_ip();
  v_trusted := exists (select 1 from device_sessions where ip is not null and ip = v_ip and expires_at > now());
  select count(*) into v_ip_fails from login_attempts where ip = v_ip and attempted_at > now() - interval '10 minutes';
  if v_trusted then
    if v_ip_fails >= 50 then return; end if;
  else
    if v_ip_fails >= 15 then return; end if;
    select count(*) into v_global_fails from login_attempts where attempted_at > now() - interval '10 minutes';
    if v_global_fails >= 120 then return; end if;
  end if;

  select s.id, s.name, s.permission into v_staff_id, v_staff_name, v_permission
    from staff s where s.pin = extensions.crypt(p_pin,s.pin) and s.active = true and s.restaurant_id = v_rid limit 1;
  if v_staff_id is not null then
    v_role := 'staff';
  else
    select a.role into v_role from access_pins a where a.pin = extensions.crypt(p_pin,a.pin) and a.restaurant_id = v_rid limit 1;
  end if;

  if v_role is null then
    insert into login_attempts(ip) values (v_ip);
    return;
  end if;

  v_expires_at := case when v_role in ('manager','touchscreen','owner') then now() + interval '30 days' else now() + interval '24 hours' end;
  v_name_final := coalesce(v_staff_name, case v_role
      when 'manager' then 'Yönetici' when 'touchscreen' then 'Dokunmatik Ekran' when 'owner' then 'Patron' else 'Personel (Genel)' end);

  insert into device_sessions(role, expires_at, staff_name, user_agent, last_seen_at, ip, restaurant_id, staff_id)
  values (v_role, v_expires_at, v_name_final, p_user_agent, now(), v_ip, v_rid, v_staff_id)
  returning device_sessions.token into v_token;

  return query select
    v_role,
    v_token,
    v_name_final,
    coalesce(v_permission,'full'),
    sign_jwt(jsonb_build_object('role','authenticated','restaurant_id',v_rid,'session_token',v_token,'staff_role',v_role), 3600);
end $function$;

CREATE OR REPLACE FUNCTION public.upsert_staff(p_session_token uuid, p_id uuid, p_name text, p_pin text, p_permission text DEFAULT 'full'::text)
 RETURNS staff
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result staff; v_rid uuid;
begin
  v_rid := assert_manager_session(p_session_token);
  if p_id is null then
    insert into staff(name, pin, active, permission, restaurant_id)
      values (p_name, p_pin, true, p_permission, v_rid) returning * into result;
  else
    update staff set name = p_name, pin = coalesce(nullif(p_pin,''),pin), permission = p_permission
      where id = p_id and restaurant_id = v_rid returning * into result;
  end if;
  result.pin := ''; return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.list_staff(p_session_token uuid)
 RETURNS SETOF staff
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rid uuid; result public.staff;
begin
  v_rid := assert_manager_session(p_session_token);
  for result in select * from staff where restaurant_id = v_rid order by created_at loop result.pin := ''; return next result; end loop; return;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_staff_active(p_session_token uuid, p_id uuid, p_active boolean)
 RETURNS staff
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result staff; v_rid uuid;
begin
  v_rid := assert_manager_session(p_session_token);
  update staff set active = p_active where id = p_id and restaurant_id = v_rid returning * into result;
  update device_sessions set expires_at=now() where staff_id=p_id and restaurant_id=v_rid; result.pin := ''; return result;
end; $function$;

CREATE OR REPLACE FUNCTION public.delete_staff(p_session_token uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rid uuid;
begin
  v_rid := assert_manager_session(p_session_token);
  update device_sessions set expires_at=now() where staff_id=p_id and restaurant_id=v_rid;
  delete from staff where id = p_id and restaurant_id = v_rid;
end; $function$;

CREATE OR REPLACE FUNCTION public.update_access_pin(p_session_token uuid, p_role text, p_new_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rid uuid;
begin
  v_rid := assert_manager_session(p_session_token);
  if p_role not in ('manager', 'touchscreen', 'owner') then
    raise exception 'Staff access is granted via the Personel tab only, not a shared PIN.';
  end if;
  update access_pins set pin = p_new_pin where role = p_role and restaurant_id = v_rid;
end; $function$;

CREATE OR REPLACE FUNCTION public.session_is_valid(p_session_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return exists (select 1 from device_sessions where token = p_session_token and expires_at > now() and (role <> 'staff' or exists (select 1 from public.staff s where s.id=device_sessions.staff_id and s.active and s.restaurant_id=device_sessions.restaurant_id)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_session_jwt(p_session_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rid uuid; v_role text;
begin
  select restaurant_id, role into v_rid, v_role from device_sessions where token = p_session_token and expires_at > now() and (role <> 'staff' or exists (select 1 from public.staff s where s.id=device_sessions.staff_id and s.active and s.restaurant_id=device_sessions.restaurant_id));
  if v_rid is null then raise exception 'session invalid'; end if;
  update device_sessions
     set last_seen_at = now(),
         expires_at = case when role in ('manager','touchscreen','owner') then greatest(expires_at, now() + interval '30 days') else expires_at end
   where token = p_session_token;
  return sign_jwt(jsonb_build_object('role','authenticated','restaurant_id',v_rid,'session_token',p_session_token,'staff_role',v_role), 3600);
end $function$;

CREATE OR REPLACE FUNCTION public.touch_session(p_session_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update device_sessions
     set last_seen_at = now(),
         ip = coalesce(get_client_ip(), ip),
         expires_at = case
           when role in ('manager', 'touchscreen', 'owner')
             then greatest(expires_at, now() + interval '30 days')
           else expires_at
         end
   where token = p_session_token
     and expires_at > now();
end;
$function$;


