CREATE OR REPLACE FUNCTION public.assert_manager_session(p_session_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rid uuid;
begin
  select restaurant_id into v_rid from device_sessions
   where token = p_session_token and role = 'manager' and expires_at > now();
  if v_rid is null then
    raise exception 'not authorized';
  end if;
  return v_rid;
end; $function$;

CREATE OR REPLACE FUNCTION public.assign_fatura_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'closed' and new.fatura_no is null then
    update restaurants
       set last_invoice_no = last_invoice_no + 1
     where id = new.restaurant_id
     returning last_invoice_no into new.fatura_no;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_client_ip()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  h json;
  cf text;
  xff text;
  parts text[];
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    return 'unknown';
  end;
  if h is null then return 'unknown'; end if;

  cf := nullif(btrim(coalesce(h->>'cf-connecting-ip', '')), '');
  if cf is not null then return cf; end if;

  xff := coalesce(h->>'x-forwarded-for', '');
  if btrim(xff) = '' then return 'unknown'; end if;

  parts := string_to_array(xff, ',');
  return coalesce(nullif(btrim(parts[array_length(parts, 1)]), ''), 'unknown');
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_open_tab(p_table_name text)
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

CREATE OR REPLACE FUNCTION public.has_valid_session(required_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text;
begin
  v_token := current_setting('request.headers', true)::json ->> 'x-session-token';
  if v_token is null or v_token = '' then
    return false;
  end if;
  return exists (
    select 1 from device_sessions
    where token = v_token::uuid
    and expires_at > now()
    and (required_roles is null or role = any(required_roles))
  );
exception when others then
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_restaurant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rid uuid; v_claims text; v_slug text;
begin
  begin
    v_claims := current_setting('request.jwt.claims', true);
    if v_claims is not null and v_claims <> '' then
      v_rid := nullif(v_claims::json ->> 'restaurant_id','')::uuid;
      if v_rid is not null then return v_rid; end if;
    end if;
  exception when others then null; end;
  v_rid := session_restaurant_id();
  if v_rid is not null then return v_rid; end if;
  begin v_slug := current_setting('request.headers', true)::json ->> 'x-restaurant-slug'; exception when others then v_slug := null; end;
  if v_slug is null or v_slug = '' then return null; end if;
  select id into v_rid from restaurants where slug = v_slug and active = true;
  return v_rid;
exception when others then return null;
end $function$;

CREATE OR REPLACE FUNCTION public.session_restaurant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_token text; v_rid uuid;
begin
  begin v_token := current_setting('request.jwt.claims', true)::json ->> 'session_token'; exception when others then v_token := null; end;
  if v_token is null or v_token = '' then
    begin v_token := current_setting('request.headers', true)::json ->> 'x-session-token'; exception when others then v_token := null; end;
  end if;
  if v_token is null or v_token = '' then return null; end if;
  select restaurant_id into v_rid from device_sessions where token = v_token::uuid and expires_at > now();
  return v_rid;
exception when others then return null;
end $function$;

