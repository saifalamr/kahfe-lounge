CREATE OR REPLACE FUNCTION public.decrement_stock_for_order(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item jsonb;
  v_staff boolean;
  v_qty int;
  v_id uuid;
  v_recent_ids text[];
  v_rid uuid;
begin
  v_rid := request_restaurant_id();
  if v_rid is null then
    return;
  end if;

  v_staff := has_valid_session();

  if not v_staff then
    select array_agg(distinct oi->>'id')
      into v_recent_ids
      from orders o,
           lateral jsonb_array_elements(o.items) oi
     where o.created_at > now() - interval '5 minutes'
       and o.restaurant_id = v_rid;
    v_recent_ids := coalesce(v_recent_ids, array[]::text[]);
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    begin
      v_id := (item->>'id')::uuid;
      v_qty := coalesce((item->>'quantity')::int, 0);
    exception when others then
      continue;
    end;

    if v_qty <= 0 then continue; end if;

    if not v_staff then
      if v_qty > 100 then continue; end if;
      if not ((item->>'id') = any(v_recent_ids)) then continue; end if;
    end if;

    update menu_items
       set stock_quantity = greatest(0, stock_quantity - v_qty),
           available = case
             when greatest(0, stock_quantity - v_qty) <= 0 then false
             else available
           end
     where id = v_id and track_stock = true and restaurant_id = v_rid;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pin_is_reserved(p_pin text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from access_pins where pin = p_pin and restaurant_id = session_restaurant_id());
$function$;
