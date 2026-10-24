create or replace function public.pos_adjust_order(p_request_id uuid,p_order_id uuid,p_expected jsonb,p_action text,p_index int,p_value numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor(); rid uuid:=(a->>'restaurant_id')::uuid; prior public.pos_operations; o public.orders; tab public.tabs;
 payload jsonb:=jsonb_build_object('id',p_order_id,'items',p_expected,'action',p_action,'index',p_index,'value',p_value,'reason',p_reason);
 item jsonb; changed jsonb; restoring jsonb:='[]'; qty int; result jsonb; val numeric;
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501'; end if;
 if p_request_id is null or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Geçerli bir neden gerekli' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
  if prior.restaurant_id<>rid or prior.kind<>'adjust' or prior.payload<>payload then raise exception 'Geçersiz istek kimliği';end if;
  return prior.result;
 end if;
 select * into tab from public.tabs where id=(select tab_id from public.orders where id=p_order_id and restaurant_id=rid) and restaurant_id=rid for update;
 if not found or tab.status<>'open' then raise exception 'Yalnızca açık hesap düzenlenebilir' using errcode='40001'; end if;
 select * into o from public.orders where id=p_order_id and restaurant_id=rid for update;
 if o.status='dismissed' or (o.items is distinct from p_expected) then raise exception 'Sipariş değişti; yenileyin' using errcode='40001'; end if;
 if p_action='cancel' then restoring:=o.items;changed:='[]';
 elsif p_action in ('void','price') then
  if p_index is null or p_index<0 or p_index>=jsonb_array_length(o.items) then raise exception 'Geçersiz ürün';end if;
  item:=o.items->p_index;
  if p_action='void' then restoring:=jsonb_build_array(item);changed:=o.items-p_index;
  else
   if p_value is null or p_value<0 or p_value>1000000 then raise exception 'Geçersiz fiyat';end if;
   val:=round(p_value,2);changed:=jsonb_set(o.items,array[p_index::text],item||jsonb_build_object('price',val,'subtotal',val*(item->>'quantity')::numeric));
   insert into public.price_edits(restaurant_id,order_id,table_name,item_name,quantity,old_price,new_price,reason,edited_by)
   values(rid,o.id,o.table_name,item->>'name',(item->>'quantity')::numeric,(item->>'price')::numeric,val,btrim(p_reason),a->>'name');
  end if;
 else raise exception 'Geçersiz işlem'; end if;
 for item in select value from jsonb_array_elements(restoring) loop
  qty:=(item->>'quantity')::int;
  insert into public.voids(restaurant_id,order_id,table_name,item_name,quantity,amount,reason,voided_by)
  values(rid,o.id,o.table_name,item->>'name',qty,(item->>'subtotal')::numeric,btrim(p_reason),a->>'name');
  if (item->>'id') ~* '^[0-9a-f-]{36}$' then
   update public.menu_items set stock_quantity=stock_quantity+qty,available=case when stock_quantity+qty>0 then true else available end
   where id=(item->>'id')::uuid and restaurant_id=rid and track_stock;
  end if;
 end loop;
 update public.orders set items=changed,total=coalesce((select sum((x->>'subtotal')::numeric) from jsonb_array_elements(changed)x),0),
  status=case when changed='[]' then 'dismissed' else status end,handled_by=a->>'name' where id=o.id;
 result:=jsonb_build_object('ok',true);
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result)values(p_request_id,rid,'adjust',payload,result);
 return result;
end; $$;
revoke all on function public.pos_adjust_order(uuid,uuid,jsonb,text,int,numeric,text) from public;
grant execute on function public.pos_adjust_order(uuid,uuid,jsonb,text,int,numeric,text) to anon,authenticated;

create or replace function public.pos_refund(p_request_id uuid,p_tab_id uuid,p_action text,p_method text,p_amount numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();rid uuid:=(a->>'restaurant_id')::uuid;t public.tabs;prior public.pos_operations;debtor uuid;balance numeric;
 amt numeric:=round(p_amount,2);already numeric;payload jsonb:=jsonb_build_object('tab',p_tab_id,'action',p_action,'method',p_method,'amount',p_amount,'reason',p_reason);result jsonb;
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501';end if;
 if p_request_id is null or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Geçerli neden gerekli';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
  if prior.restaurant_id<>rid or prior.kind<>'refund' or prior.payload<>payload then raise exception 'Geçersiz istek kimliği';end if;return prior.result;
 end if;
 select * into t from public.tabs where id=p_tab_id and restaurant_id=rid for update;
 if not found or t.status<>'closed' then raise exception 'Hesap kapalı değil veya değişti' using errcode='40001';end if;
 select coalesce(sum(amount),0) into already from public.refunds where tab_id=t.id and restaurant_id=rid and type='refund';
 if p_action='reopen' then
  if already>0 then raise exception 'İadeli fiş yeniden açılamaz; önce mutabakat yapın';end if;
  perform pg_advisory_xact_lock(hashtext(rid::text||'|'||upper(replace(t.table_name,'İ','I'))));
  if exists(select 1 from public.tabs where restaurant_id=rid and table_name=t.table_name and status='open') then raise exception 'Masada açık hesap var';end if;
  amt:=t.total;
 elsif p_action='refund' then
  if amt is null or amt<=0 or amt+already>t.total then raise exception 'İade tutarı kalan fiş tutarını aşamaz';end if;
  if p_method not in ('cash','card','transfer','debt') then raise exception 'Geçersiz iade yöntemi';end if;
 else raise exception 'Geçersiz işlem';end if;
 if p_method='debt' or (p_action='reopen' and t.payment_method='debt') then
  select debtor_id into debtor from public.debt_transactions where restaurant_id=rid and tab_id=t.id and type='borç' order by created_at limit 1;
  if debtor is null then raise exception 'Fişin borçlusu bulunamadı';end if;
  perform 1 from public.debtors where id=debtor and restaurant_id=rid for update;
  select coalesce(sum(case when type='borç' then amount else -amount end),0) into balance from public.debt_transactions where restaurant_id=rid and debtor_id=debtor;
  if amt>balance then raise exception 'Kalan borç iade için yetersiz; ödeme yöntemini kontrol edin';end if;
  insert into public.debt_transactions(restaurant_id,debtor_id,tab_id,type,amount,note,created_by)
  values(rid,debtor,t.id,'ödeme',amt,p_action||': '||p_reason,a->>'name');
 elsif p_action='refund' and p_method='cash' then
  insert into public.cash_movements(restaurant_id,type,amount,reason,created_by)values(rid,'out',amt,'İade: '||p_reason,a->>'name');
 end if;
 if p_action='reopen' then
  update public.tabs set status='open',closed_at=null,payment_method=null,cash_amount=0,card_amount=0,transfer_amount=0,debt_amount=0,fatura_no=null where id=t.id;
 end if;
 insert into public.refunds(restaurant_id,tab_id,table_name,fatura_no,type,method,amount,reason,staff_name)
 values(rid,t.id,t.table_name,t.fatura_no,p_action,p_method,amt,btrim(p_reason),a->>'name');
 result:=jsonb_build_object('ok',true);
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result)values(p_request_id,rid,'refund',payload,result);
 return result;
end; $$;
revoke all on function public.pos_refund(uuid,uuid,text,text,numeric,text) from public;
grant execute on function public.pos_refund(uuid,uuid,text,text,numeric,text) to anon,authenticated;

create or replace function public.pos_logout_all() returns void language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();rid uuid:=(a->>'restaurant_id')::uuid;
begin
 if not public.pos_can('manage') then raise exception 'Yetkisiz' using errcode='42501';end if;
 update public.device_sessions set expires_at=now() where restaurant_id=rid;
end; $$;
revoke all on function public.pos_logout_all() from public;
grant execute on function public.pos_logout_all() to anon,authenticated;

-- Price adjustments are explicit lines, rather than rewriting historical items.
alter table public.orders drop constraint if exists orders_total_nonneg;
alter table public.orders add constraint orders_total_nonneg check(total>=0 or
 (jsonb_typeof(items)='array' and jsonb_array_length(items)=1 and items->0->>'id'='adjustment')) not valid;
create or replace function public.pos_adjust_total(p_request_id uuid,p_tab_id uuid,p_expected numeric,p_value numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();rid uuid:=(a->>'restaurant_id')::uuid;t public.tabs;current_total numeric;delta numeric;oid uuid;prior public.pos_operations;
 payload jsonb:=jsonb_build_object('tab',p_tab_id,'expected',p_expected,'value',p_value,'reason',p_reason);result jsonb:='{"ok":true}';
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501';end if;
 if p_request_id is null or p_value is null or p_value<0 or p_value>1000000 or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'Geçersiz tutar veya neden';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
  if prior.restaurant_id<>rid or prior.kind<>'total' or prior.payload<>payload then raise exception 'Geçersiz istek kimliği';end if;return prior.result;
 end if;
 select * into t from public.tabs where id=p_tab_id and restaurant_id=rid for update;
 if not found or t.status<>'open' then raise exception 'Hesap açık değil';end if;
 perform 1 from public.orders where restaurant_id=rid and tab_id=t.id for update;
 select coalesce(sum(total),0) into current_total from public.orders where restaurant_id=rid and tab_id=t.id and status<>'dismissed';
 if current_total<>p_expected then raise exception 'Hesap değişti; yenileyin' using errcode='40001';end if;
 delta:=round(p_value,2)-current_total;
 if delta<>0 then
  insert into public.orders(restaurant_id,table_name,items,total,status,tab_id,created_by,handled_by)
  values(rid,t.table_name,jsonb_build_array(jsonb_build_object('id','adjustment','name','Fiyat Ayarlaması','name_en','Price Adjustment','price',delta,'quantity',1,'subtotal',delta)),delta,'served',t.id,a->>'name',a->>'name') returning id into oid;
  insert into public.price_edits(restaurant_id,order_id,table_name,item_name,quantity,old_price,new_price,reason,edited_by)
  values(rid,oid,t.table_name,'Hesap toplamı',1,current_total,round(p_value,2),btrim(p_reason),a->>'name');
 end if;
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result)values(p_request_id,rid,'total',payload,result);
 return result;
end; $$;
revoke all on function public.pos_adjust_total(uuid,uuid,numeric,numeric,text) from public;
grant execute on function public.pos_adjust_total(uuid,uuid,numeric,numeric,text) to anon,authenticated;
