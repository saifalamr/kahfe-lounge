create or replace function public.pos_edit_bill(p_request_id uuid,p_tab_id uuid,p_expected jsonb,p_quantities jsonb,p_added jsonb,p_method text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();rid uuid:=(a->>'restaurant_id')::uuid;t public.tabs;o public.orders;prior public.pos_operations;
 payload jsonb:=jsonb_build_object('tab',p_tab_id,'expected',p_expected,'quantities',p_quantities,'added',p_added,'method',p_method,'reason',p_reason);
 snap jsonb;entry jsonb;line jsonb;changed jsonb;added jsonb:='[]';mi public.menu_items;idx int;qty int;oldqty int;diff int;newtotal numeric:=0;delta numeric;part numeric;debtor uuid;balance numeric;result jsonb;
begin
 if not public.pos_can('adjust') then raise exception 'Yetkisiz' using errcode='42501';end if;
 if p_request_id is null or length(btrim(coalesce(p_reason,''))) not between 1 and 500 or p_method not in ('cash','card','transfer','debt') then raise exception 'Geçersiz düzenleme';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
  if prior.restaurant_id<>rid or prior.kind<>'bill_edit' or prior.payload<>payload then raise exception 'Geçersiz istek kimliği';end if;return prior.result;
 end if;
 select * into t from public.tabs where id=p_tab_id and restaurant_id=rid for update;
 if not found or t.status<>'closed' then raise exception 'Kapalı fiş bulunamadı';end if;
 if exists(select 1 from public.refunds where tab_id=t.id and restaurant_id=rid) or exists(select 1 from public.discounts where tab_id=t.id and restaurant_id=rid) then raise exception 'İadeli veya indirimli fiş yeniden açılarak düzeltilmeli';end if;
 perform 1 from public.orders where tab_id=t.id order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'items',items,'total',total,'status',status) order by id),'[]') into snap from public.orders where tab_id=t.id and status<>'dismissed';
 if snap is distinct from p_expected then raise exception 'Fiş değişti; yenileyin' using errcode='40001';end if;
 if p_quantities is null or p_added is null or jsonb_typeof(p_quantities)<>'array' or jsonb_typeof(p_added)<>'array' or jsonb_array_length(p_added)>50 then raise exception 'Geçersiz ürünler';end if;
 if exists(select 1 from jsonb_array_elements(p_quantities)x group by x->>'order_id',x->>'index' having count(*)>1) then raise exception 'Tekrarlanan ürün';end if;
 -- Lock inventory consistently before changing quantities.
 perform 1 from public.menu_items where restaurant_id=rid order by id for update;
 for o in select * from public.orders where tab_id=t.id and status<>'dismissed' order by id loop
  changed:='[]';idx:=0;
  for line in select value from jsonb_array_elements(o.items) loop
   oldqty:=(line->>'quantity')::int;qty:=oldqty;
   select value into entry from jsonb_array_elements(p_quantities) where value->>'order_id'=o.id::text and (value->>'index')::int=idx;
   if found then qty:=(entry->>'quantity')::int;end if;
   if qty is null or qty not between 0 and 100 then raise exception 'Geçersiz adet';end if;
   diff:=qty-oldqty;
   if diff<>0 and (line->>'id')~*'^[0-9a-f-]{36}$' then
    select * into mi from public.menu_items where id=(line->>'id')::uuid and restaurant_id=rid;
    if found and mi.track_stock then
     if mi.stock_quantity<diff then raise exception 'Yetersiz stok';end if;
     update public.menu_items set stock_quantity=stock_quantity-diff,available=stock_quantity-diff>0 where id=mi.id;
    end if;
   end if;
   if diff<0 then
    insert into public.voids(restaurant_id,order_id,table_name,item_name,quantity,amount,reason,voided_by)values(rid,o.id,t.table_name,line->>'name',-diff,-diff*(line->>'price')::numeric,'Fiş Düzenleme — '||p_reason,a->>'name');
   end if;
   if qty>0 then changed:=changed||jsonb_build_array(line||jsonb_build_object('quantity',qty,'subtotal',qty*(line->>'price')::numeric));end if;
   idx:=idx+1;
  end loop;
  select coalesce(sum((x->>'subtotal')::numeric),0) into part from jsonb_array_elements(changed)x;
  newtotal:=newtotal+part;
  update public.orders set items=changed,total=part,status=case when changed='[]' then 'dismissed' else status end,handled_by=a->>'name' where id=o.id;
 end loop;
 for entry in select value from jsonb_array_elements(p_added) loop
  qty:=(entry->>'quantity')::int;
  if qty is null or qty not between 1 and 100 then raise exception 'Geçersiz adet';end if;
  select * into mi from public.menu_items where id=(entry->>'id')::uuid and restaurant_id=rid and available;
  if not found then raise exception 'Ürün bulunamadı';end if;
  if exists(select 1 from public.item_option_groups where menu_item_id=mi.id and required) then raise exception 'Seçenekli ürün yeni sipariş olarak eklenmeli';end if;
  if mi.track_stock then
   if mi.stock_quantity<qty then raise exception 'Yetersiz stok';end if;
   update public.menu_items set stock_quantity=stock_quantity-qty,available=stock_quantity-qty>0 where id=mi.id;
  end if;
  added:=added||jsonb_build_array(jsonb_build_object('id',mi.id,'name',mi.name,'name_en',mi.name_en,'price',mi.price,'quantity',qty,'subtotal',mi.price*qty));newtotal:=newtotal+mi.price*qty;
 end loop;
 if newtotal<=0 then raise exception 'Fiş en az bir ürün içermeli';end if;
 if added<>'[]' then
  insert into public.orders(restaurant_id,table_name,tab_id,items,total,status,created_by,handled_by)values(rid,t.table_name,t.id,added,(select sum((x->>'subtotal')::numeric) from jsonb_array_elements(added)x),'served',a->>'name',a->>'name');
 end if;
 delta:=round(newtotal-t.total,2);
 if p_method='debt' and delta<>0 then
  select debtor_id into debtor from public.debt_transactions where tab_id=t.id and restaurant_id=rid and type='borç' limit 1;
  if debtor is null then raise exception 'Bağlı borçlu bulunamadı';end if;
  perform 1 from public.debtors where id=debtor and restaurant_id=rid for update;
  select coalesce(sum(case when type='borç' then amount else -amount end),0) into balance from public.debt_transactions where debtor_id=debtor and restaurant_id=rid;
  if delta<0 and -delta>balance then raise exception 'İade açık borcu aşıyor';end if;
  insert into public.debt_transactions(restaurant_id,debtor_id,tab_id,fatura_no,type,amount,note,created_by)values(rid,debtor,t.id,t.fatura_no,case when delta>0 then 'borç' else 'ödeme' end,abs(delta),'Fiş Düzenleme — '||p_reason,a->>'name');
 end if;
 if (p_method='cash' and coalesce(t.cash_amount,0)+delta<0) or (p_method='card' and coalesce(t.card_amount,0)+delta<0) or (p_method='transfer' and coalesce(t.transfer_amount,0)+delta<0) or (p_method='debt' and coalesce(t.debt_amount,0)+delta<0) then raise exception 'İade seçilen ödeme tutarını aşıyor';end if;
 update public.tabs set total=newtotal,cash_amount=coalesce(cash_amount,0)+case when p_method='cash' then delta else 0 end,card_amount=coalesce(card_amount,0)+case when p_method='card' then delta else 0 end,transfer_amount=coalesce(transfer_amount,0)+case when p_method='transfer' then delta else 0 end,debt_amount=coalesce(debt_amount,0)+case when p_method='debt' then delta else 0 end where id=t.id;
 if p_method='cash' and delta<0 then insert into public.cash_movements(restaurant_id,type,amount,reason,created_by)values(rid,'out',-delta,'Fiş Düzenleme İadesi — '||p_reason,a->>'name');end if;
 result:=jsonb_build_object('ok',true,'total',newtotal);
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result)values(p_request_id,rid,'bill_edit',payload,result);return result;
end;$$;
revoke all on function public.pos_edit_bill(uuid,uuid,jsonb,jsonb,jsonb,text,text) from public;
grant execute on function public.pos_edit_bill(uuid,uuid,jsonb,jsonb,jsonb,text,text) to anon,authenticated;
