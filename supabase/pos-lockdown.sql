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
