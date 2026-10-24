create schema if not exists private;
CREATE OR REPLACE FUNCTION private.open_tab(p_table_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tab_id uuid;
  v_canonical text;
  v_rid uuid;
begin
  v_rid := request_restaurant_id();
  if v_rid is null then
    raise exception 'restoran baglami yok' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_rid::text || '|' || upper(replace(p_table_name, 'İ', 'I'))));

  select id into v_tab_id
  from tabs
  where status = 'open'
    and restaurant_id = v_rid
    and upper(replace(table_name, 'İ', 'I')) = upper(replace(p_table_name, 'İ', 'I'))
  limit 1;
  if v_tab_id is not null then return v_tab_id; end if;

  select t.value into v_canonical
  from (
    select jsonb_array_elements_text(value) as value
    from settings where key = 'tables' and restaurant_id = v_rid
  ) t
  where upper(replace(t.value, 'İ', 'I')) = upper(replace(p_table_name, 'İ', 'I'))
  limit 1;

  insert into tabs(table_name, status, restaurant_id)
  values (coalesce(v_canonical, p_table_name), 'open', v_rid)
  returning id into v_tab_id;

  return v_tab_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_or_transfer_tab(p_source_tab_id uuid, p_destination_table_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dest_tab_id uuid;
  v_source_status text;
  v_rid uuid;
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501'; end if;
  v_rid := session_restaurant_id();
  if v_rid is null then
    raise exception 'yetkisiz islem' using errcode = '42501';
  end if;

  if not exists(select 1 from public.settings s where s.restaurant_id=v_rid and s.key='tables' and s.value ? p_destination_table_name) then raise exception 'Geçersiz masa';end if;

  select status into v_source_status from tabs
   where id = p_source_tab_id and restaurant_id = v_rid for update;
  if v_source_status is null then
    raise exception 'kaynak hesap bulunamadi' using errcode = 'P0002';
  end if;
  if v_source_status <> 'open' then
    raise exception 'kapali hesap tasinamaz' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_rid::text || '|' || upper(replace(p_destination_table_name, 'İ', 'I'))));

  select id into v_dest_tab_id
    from tabs
   where restaurant_id = v_rid
     and upper(replace(table_name, 'İ', 'I')) = upper(replace(p_destination_table_name, 'İ', 'I'))
     and status = 'open'
     and id <> p_source_tab_id
   limit 1;

  if v_dest_tab_id is null then
    update tabs set table_name = p_destination_table_name where id = p_source_tab_id;
    update orders set table_name = p_destination_table_name where tab_id = p_source_tab_id;
    return p_source_tab_id;
  else
    update orders set tab_id = v_dest_tab_id, table_name = p_destination_table_name where tab_id = p_source_tab_id;
    update tabs set status = 'merged', closed_at = now() where id = p_source_tab_id;
    return v_dest_tab_id;
  end if;
end;
$function$;

