create or replace function public.pos_set_order_status(p_order_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();
begin
 if not public.pos_can('operate') or p_status not in ('pending','served') then raise exception 'Yetkisiz işlem' using errcode='42501';end if;
 update public.orders set status=p_status,handled_by=a->>'name' where id=p_order_id and restaurant_id=(a->>'restaurant_id')::uuid and status<>'dismissed';
 if not found then raise exception 'Sipariş bulunamadı' using errcode='40001';end if;
end;$$;
revoke all on function public.pos_set_order_status(uuid,text) from public;
grant execute on function public.pos_set_order_status(uuid,text) to anon,authenticated;
create or replace function public.pos_request_bill(p_tab_id uuid,p_requested boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();
begin
 if not public.pos_can('operate') then raise exception 'Yetkisiz işlem' using errcode='42501';end if;
 update public.tabs set bill_requested=p_requested where id=p_tab_id and restaurant_id=(a->>'restaurant_id')::uuid and status='open';
 if not found then raise exception 'Hesap bulunamadı' using errcode='40001';end if;
end;$$;
revoke all on function public.pos_request_bill(uuid,boolean) from public;
grant execute on function public.pos_request_bill(uuid,boolean) to anon,authenticated;
