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


