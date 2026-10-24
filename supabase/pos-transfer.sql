-- Move one line in a single transaction, with stale-client and replay protection.
create or replace function public.pos_move_item(p_request_id uuid,p_order_id uuid,p_expected jsonb,p_index int,p_destination text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();rid uuid:=(a->>'restaurant_id')::uuid;o public.orders;src public.tabs;dest uuid;prior public.pos_operations;line jsonb;remaining jsonb;
 payload jsonb:=jsonb_build_object('order',p_order_id,'expected',p_expected,'index',p_index,'destination',p_destination);result jsonb;
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501';end if;
 if p_request_id is null then raise exception 'İstek kimliği gerekli';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
  if prior.restaurant_id<>rid or prior.kind<>'move' or prior.payload<>payload then raise exception 'Geçersiz istek kimliği';end if;return prior.result;
 end if;
 if not exists(select 1 from public.settings s where s.restaurant_id=rid and s.key='tables' and s.value::jsonb ? p_destination) then raise exception 'Geçersiz masa';end if;
 select * into src from public.tabs where id=(select tab_id from public.orders where id=p_order_id and restaurant_id=rid) for update;
 if not found or src.status<>'open' or src.table_name=p_destination then raise exception 'Geçersiz kaynak hesap';end if;
 dest:=private.open_tab(p_destination);
 perform 1 from public.tabs where id=dest for update;
 select * into o from public.orders where id=p_order_id and restaurant_id=rid for update;
 if (o.items is distinct from p_expected) or o.status='dismissed' then raise exception 'Sipariş değişti; yenileyin' using errcode='40001';end if;
 if p_index is null or p_index<0 or p_index>=jsonb_array_length(o.items) then raise exception 'Geçersiz ürün';end if;
 line:=o.items->p_index;remaining:=o.items-p_index;
 update public.orders set items=remaining,total=coalesce((select sum((x->>'subtotal')::numeric) from jsonb_array_elements(remaining)x),0),status=case when remaining='[]' then 'dismissed' else status end,handled_by=a->>'name' where id=o.id;
 insert into public.orders(restaurant_id,table_name,tab_id,items,total,status,created_by,handled_by)values(rid,p_destination,dest,jsonb_build_array(line),(line->>'subtotal')::numeric,o.status,o.created_by,a->>'name');
 result:=jsonb_build_object('ok',true);
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result)values(p_request_id,rid,'move',payload,result);return result;
end;$$;
revoke all on function public.pos_move_item(uuid,uuid,jsonb,int,text) from public;
grant execute on function public.pos_move_item(uuid,uuid,jsonb,int,text) to anon,authenticated;
