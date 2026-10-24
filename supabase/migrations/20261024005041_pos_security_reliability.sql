-- Source: supabase/pos-helpers.sql
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


-- Source: supabase/pos-security.sql
-- Additive rollout. Deploy compatible clients before applying lockdown.sql.
-- Critical writes use a single transaction, row locks and durable request IDs.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
alter table public.device_sessions add column if not exists staff_id uuid;
update public.device_sessions d set staff_id = s.id from public.staff s
where d.staff_id is null and d.role = 'staff' and d.restaurant_id = s.restaurant_id
and d.staff_name = s.name and (select count(*) from public.staff x where x.restaurant_id=s.restaurant_id and x.name=s.name)=1;

create or replace function private.actor() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tok text; s public.device_sessions; emp public.staff;
begin
  begin tok := nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_token'; exception when others then tok:=null; end;
  if tok is null then begin tok:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-session-token'; exception when others then tok:=null; end; end if;
  if tok is null then return null; end if;
  select * into s from public.device_sessions where token=tok::uuid and expires_at>now();
  if not found then return null; end if;
  if not exists(select 1 from public.restaurants where id=s.restaurant_id and active) then return null; end if;
  if s.role='staff' then
    select * into emp from public.staff where id=s.staff_id and restaurant_id=s.restaurant_id and active;
    if not found then return null; end if;
  elsif s.role not in ('manager','touchscreen','owner') then return null;
  end if;
  return jsonb_build_object('restaurant_id',s.restaurant_id,'role',s.role,'name',coalesce(emp.name,s.staff_name),
    'permission',case when s.role='staff' then emp.permission else 'full' end,'token',s.token);
exception when invalid_text_representation then return null;
end; $$;

create or replace function public.pos_can(p_capability text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb:=private.actor(); r text:=a->>'role';
begin
 if a is null then return false; end if;
 if p_capability='read' then return true; end if;
 if p_capability='manage' then return r='manager'; end if;
 if p_capability='operate' then return r in ('manager','touchscreen','staff'); end if;
 if p_capability='adjust' then return r in ('manager','touchscreen') or (r='staff' and a->>'permission'='full'); end if;
 return false;
end; $$;
revoke all on function public.pos_can(text) from public;
grant execute on function public.pos_can(text) to anon,authenticated;

create table if not exists public.pos_operations (
 request_id uuid primary key, restaurant_id uuid not null references public.restaurants(id),
 kind text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.pos_operations enable row level security;
revoke all on public.pos_operations from anon,authenticated;
grant select on public.pos_operations to service_role;
create table if not exists public.pos_notifications (
 order_id uuid primary key references public.orders(id), restaurant_id uuid not null references public.restaurants(id),
 claim_token uuid, claimed_at timestamptz, sent_at timestamptz, attempts int not null default 0,
 created_at timestamptz not null default now()
);
alter table public.pos_notifications enable row level security;
revoke all on public.pos_notifications from anon,authenticated;
alter table public.orders add column if not exists order_number bigint;
alter table public.restaurants add column if not exists last_order_no bigint not null default 0;
alter table public.restaurants add column if not exists last_order_date date;

create or replace function public.pos_create_order(p_request_id uuid,p_table_name text,p_items jsonb,p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare rid uuid:=public.request_restaurant_id(); a jsonb:=private.actor(); prior public.pos_operations;
 payload jsonb; canonical text; tabid uuid; oid uuid; n bigint; line jsonb; mi public.menu_items;
 result_items jsonb:='[]'; opts jsonb; opt_suffix text; opt_suffix_en text; total numeric:=0; unit numeric;
 qty int; choice_count int; required_count int; actual_count int; final_result jsonb; actor_name text;
begin
 if rid is null or p_request_id is null then raise exception 'Restoran veya istek bilgisi eksik' using errcode='22023'; end if;
 if a is not null and ((a->>'restaurant_id')::uuid<>rid or not public.pos_can('operate')) then raise exception 'Yetkisiz' using errcode='42501'; end if;
 if length(coalesce(p_note,''))>1000 or length(coalesce(p_table_name,''))>100 then raise exception 'Not veya masa adı çok uzun' using errcode='22023'; end if;
 payload:=jsonb_build_object('table',p_table_name,'items',p_items,'note',p_note);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
   if prior.restaurant_id<>rid or prior.kind<>'order' or prior.payload<>payload then raise exception 'İstek kimliği tekrar kullanılamaz' using errcode='22023'; end if;
   return prior.result;
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Geçersiz sepet' using errcode='22023'; end if;
 select v into canonical from public.settings s cross join lateral jsonb_array_elements_text(s.value) v
 where s.restaurant_id=rid and s.key='tables' and upper(replace(v,'İ','I'))=upper(replace(btrim(p_table_name),'İ','I')) limit 1;
 if canonical is null then raise exception 'Masa bulunamadı. Lütfen masanın QR kodunu okutun.' using errcode='22023'; end if;
 -- Lock the table first, like payment; lock menu rows in ID order to avoid deadlocks.
 perform pg_advisory_xact_lock(hashtextextended(rid::text||'|'||canonical,1));
 tabid:=private.open_tab(canonical);
 perform 1 from public.tabs where id=tabid and restaurant_id=rid and status='open' for update;
 if not found then raise exception 'Masa değişti; tekrar deneyin' using errcode='40001'; end if;
 for line in select value from jsonb_array_elements(p_items) order by value->>'id' loop
   if coalesce(line->>'quantity','') !~ '^[0-9]{1,3}$' then raise exception 'Geçersiz adet' using errcode='22023'; end if;
   qty:=(line->>'quantity')::int;
   if qty not between 1 and 100 then raise exception 'Adet 1-100 olmalı' using errcode='22023'; end if;
   select * into mi from public.menu_items where id=(line->>'id')::uuid and restaurant_id=rid for update;
   if not found or not mi.available or (mi.staff_only and a is null) then raise exception 'Ürün artık satışta değil' using errcode='22023'; end if;
   if mi.track_stock and mi.stock_quantity<qty then raise exception 'Yeterli stok yok: %',mi.name using errcode='22023'; end if;
   opts:=coalesce(line->'option_choice_ids','[]'::jsonb);
   if jsonb_typeof(opts)<>'array' then raise exception 'Geçersiz ürün seçeneği' using errcode='22023'; end if;
   select count(*),count(distinct g.id),sum(c.price_delta),string_agg(c.name,', ' order by g.order_index),
     string_agg(coalesce(nullif(c.name_en,''),c.name),', ' order by g.order_index)
   into choice_count,actual_count,unit,opt_suffix,opt_suffix_en
   from public.item_option_choices c join public.item_option_groups g on g.id=c.group_id and g.restaurant_id=rid
   where c.restaurant_id=rid and g.menu_item_id=mi.id and c.id::text in (select jsonb_array_elements_text(opts));
   if choice_count<>jsonb_array_length(opts) or actual_count<>choice_count then raise exception 'Ürün seçenekleri geçersiz' using errcode='22023'; end if;
   select count(*) into required_count from public.item_option_groups g where g.restaurant_id=rid and g.menu_item_id=mi.id and g.required
   and not exists(select 1 from public.item_option_choices c where c.group_id=g.id and c.id::text in(select jsonb_array_elements_text(opts)));
   if required_count>0 then raise exception 'Ürün tercihini seçin' using errcode='22023'; end if;
   unit:=round(mi.price+coalesce(unit,0),2);
   if unit<0 then raise exception 'Geçersiz ürün fiyatı'; end if;
   result_items:=result_items||jsonb_build_array(jsonb_build_object('id',mi.id,'name',mi.name||case when opt_suffix is null then '' else ' ('||opt_suffix||')' end,
     'name_en',coalesce(nullif(mi.name_en,''),mi.name)||case when opt_suffix_en is null then '' else ' ('||opt_suffix_en||')' end,
     'quantity',qty,'price',unit,'subtotal',unit*qty,'option_choice_ids',opts));
   total:=total+unit*qty;
   if mi.track_stock then update public.menu_items set stock_quantity=stock_quantity-qty,available=case when stock_quantity-qty=0 then false else available end where id=mi.id; end if;
 end loop;
 -- Rate limit public QR submissions per table, independently of browser controls.
 if a is null and (select count(*) from public.orders where restaurant_id=rid and table_name=canonical and created_at>now()-interval '1 minute')>=12 then
   raise exception 'Çok fazla sipariş. Lütfen bir dakika bekleyin.' using errcode='54000';
 end if;
 update public.restaurants set last_order_no=case when last_order_date=(now() at time zone 'Europe/Istanbul')::date then last_order_no+1 else 1 end,
   last_order_date=(now() at time zone 'Europe/Istanbul')::date where id=rid returning last_order_no into n;
 actor_name:=coalesce(a->>'name','Müşteri (QR)');
 insert into public.orders(restaurant_id,table_name,items,total,status,note,tab_id,created_by,client_order_id,order_number)
 values(rid,canonical,result_items,total,'pending',nullif(btrim(p_note),''),tabid,actor_name,p_request_id,n) returning id into oid;
 if a is null then insert into public.pos_notifications(order_id,restaurant_id) values(oid,rid); end if;
 final_result:=jsonb_build_object('id',oid,'tab_id',tabid,'order_number',n,'total',total,'items',result_items);
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result) values(p_request_id,rid,'order',payload,final_result);
 return final_result;
end; $$;
revoke all on function public.pos_create_order(uuid,text,jsonb,text) from public;
grant execute on function public.pos_create_order(uuid,text,jsonb,text) to anon,authenticated;

-- One payment RPC covers full and selected-line payment. The expected snapshot
-- rejects stale screens, including concurrent edits and partial payments.
create or replace function public.pos_pay_tab(p_request_id uuid,p_tab_id uuid,p_expected jsonb,p_selection jsonb,
 p_method text,p_cash numeric default 0,p_card numeric default 0,p_discount numeric default 0,p_reason text default null,
 p_debtor_id uuid default null,p_debtor_name text default null,p_debtor_phone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb:=private.actor(); rid uuid; actor_name text; orig public.tabs; paid public.tabs; o public.orders;
 prior public.pos_operations; payload jsonb; snap jsonb; chosen jsonb:='[]'; remainder jsonb; receipt_orders jsonb:='[]';
 selection_count int:=0; selected_count int; item_count int:=0; subtotal numeric:=0; final_total numeric; cash numeric:=0; card numeric:=0; transfer numeric:=0; debt numeric:=0;
 target uuid; debtor uuid:=p_debtor_id; result jsonb; disc numeric:=coalesce(p_discount,0);
begin
 if a is null or not public.pos_can('operate') then raise exception 'Yetkisiz' using errcode='42501'; end if;
 rid:=(a->>'restaurant_id')::uuid; actor_name:=a->>'name';
 if p_request_id is null then raise exception 'İstek kimliği eksik' using errcode='22023'; end if;
 payload:=jsonb_build_object('tab',p_tab_id,'expected',p_expected,'selection',p_selection,'method',p_method,'cash',p_cash,'card',p_card,'discount',disc,'reason',p_reason,'debtor',p_debtor_id,'name',p_debtor_name,'phone',p_debtor_phone);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.pos_operations where request_id=p_request_id;
 if found then
   if prior.restaurant_id<>rid or prior.kind<>'payment' or prior.payload<>payload then raise exception 'İstek kimliği tekrar kullanılamaz' using errcode='22023'; end if;
   return prior.result;
 end if;
 select * into orig from public.tabs where id=p_tab_id and restaurant_id=rid for update;
 if not found or orig.status<>'open' then raise exception 'Hesap kapalı veya değişti. Yenileyin.' using errcode='40001'; end if;
 perform 1 from public.orders where tab_id=p_tab_id and restaurant_id=rid order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'items',items,'total',total,'status',status) order by id),'[]') into snap from public.orders where tab_id=p_tab_id and restaurant_id=rid and status<>'dismissed';
 if snap is distinct from p_expected then raise exception 'Hesap değişti. Yenileyip tekrar deneyin.' using errcode='40001'; end if;
 if disc<0 or length(coalesce(p_reason,''))>500 then raise exception 'Geçersiz indirim' using errcode='22023'; end if;
 if (disc>0 or p_method='debt') and not public.pos_can('adjust') then raise exception 'Bu işlem için yetkiniz yok' using errcode='42501'; end if;
 if disc>0 and nullif(btrim(p_reason),'') is null then raise exception 'İndirim nedeni gerekli' using errcode='22023'; end if;
 if p_selection is not null and jsonb_typeof(p_selection)<>'array' then raise exception 'Geçersiz ürün seçimi' using errcode='22023'; end if;
 for o in select * from public.orders where tab_id=p_tab_id and restaurant_id=rid and status<>'dismissed' order by id loop
   item_count:=item_count+jsonb_array_length(o.items);
   select coalesce(jsonb_agg(e.value order by e.ordinality),'[]') into chosen from jsonb_array_elements(o.items) with ordinality e
   where p_selection is null or exists(select 1 from jsonb_array_elements(p_selection) s where s->>'order_id'=o.id::text and (s->>'index')::int=e.ordinality-1);
   selection_count:=selection_count+jsonb_array_length(chosen);
   subtotal:=subtotal+coalesce((select sum((x->>'subtotal')::numeric) from jsonb_array_elements(chosen) x),0);
 end loop;
 if selection_count=0 or (p_selection is not null and selection_count<>jsonb_array_length(p_selection)) then raise exception 'Ürün seçimi geçersiz' using errcode='22023'; end if;
 if disc>subtotal then raise exception 'İndirim hesap tutarını aşamaz' using errcode='22023'; end if;
 final_total:=round(subtotal-disc,2);
 case p_method when 'cash' then cash:=final_total; when 'card' then card:=final_total; when 'transfer' then transfer:=final_total;
 when 'debt' then debt:=final_total;
 when 'mixed' then cash:=round(coalesce(p_cash,0),2); card:=round(coalesce(p_card,0),2);
   if cash<0 or card<0 or cash+card<>final_total then raise exception 'Nakit ve kart toplamı hesapla eşleşmiyor' using errcode='22023'; end if;
 else raise exception 'Geçersiz ödeme yöntemi' using errcode='22023'; end case;
 if p_method='debt' then
   if debtor is null and nullif(btrim(p_debtor_name),'') is not null then
     if length(p_debtor_name)>120 or length(coalesce(p_debtor_phone,''))>40 then raise exception 'Geçersiz borçlu bilgisi'; end if;
     insert into public.debtors(name,phone,restaurant_id) values(btrim(p_debtor_name),nullif(btrim(p_debtor_phone),''),rid) returning id into debtor;
   end if;
   if not exists(select 1 from public.debtors where id=debtor and restaurant_id=rid) then raise exception 'Borçlu bulunamadı' using errcode='22023'; end if;
 end if;
 if selection_count=item_count then target:=p_tab_id;
 else
   -- Insert closed to avoid a second open tab for this table, all inside the transaction.
   insert into public.tabs(restaurant_id,table_name,status,total) values(rid,orig.table_name,'closed',final_total) returning id into target;
 end if;
 for o in select * from public.orders where tab_id=p_tab_id and restaurant_id=rid and status<>'dismissed' order by id loop
   select coalesce(jsonb_agg(e.value order by e.ordinality),'[]') into chosen from jsonb_array_elements(o.items) with ordinality e
   where p_selection is null or exists(select 1 from jsonb_array_elements(p_selection) s where s->>'order_id'=o.id::text and (s->>'index')::int=e.ordinality-1);
   if chosen='[]' then continue; end if;
   receipt_orders:=receipt_orders||jsonb_build_array(jsonb_build_object('items',chosen));
   if target<>p_tab_id then
     if chosen=o.items then update public.orders set tab_id=target where id=o.id;
     else
       select jsonb_agg(e.value order by e.ordinality) into remainder from jsonb_array_elements(o.items) with ordinality e
       where not exists(select 1 from jsonb_array_elements(p_selection) s where s->>'order_id'=o.id::text and (s->>'index')::int=e.ordinality-1);
       insert into public.orders(restaurant_id,table_name,items,total,status,tab_id,created_by,handled_by,note)
       values(rid,o.table_name,chosen,(select sum((x->>'subtotal')::numeric) from jsonb_array_elements(chosen)x),o.status,target,o.created_by,o.handled_by,o.note);
       update public.orders set items=remainder,total=(select sum((x->>'subtotal')::numeric) from jsonb_array_elements(remainder)x) where id=o.id;
     end if;
   end if;
 end loop;
 update public.tabs set status='closed',closed_at=now(),payment_method=p_method,total=final_total,cash_amount=cash,card_amount=card,
   transfer_amount=transfer,debt_amount=debt,discount_amount=disc,discount_reason=nullif(btrim(p_reason),''),closed_by=actor_name,bill_requested=false
 where id=target returning * into paid;
 if disc>0 then insert into public.discounts(restaurant_id,tab_id,table_name,original_amount,discount_amount,reason,applied_by)
   values(rid,target,orig.table_name,subtotal,disc,btrim(p_reason),actor_name); end if;
 if p_method='debt' then insert into public.debt_transactions(restaurant_id,debtor_id,tab_id,fatura_no,type,amount,created_by)
   values(rid,debtor,target,paid.fatura_no,'borç',final_total,actor_name); end if;
 -- Payment deliberately does NOT mark food as served.
 result:=jsonb_build_object('table_name',orig.table_name,'total',final_total,'cash',cash,'card',card,'transfer',transfer,'method',p_method,
   'orders',receipt_orders,'discountAmount',disc,'discountReason',p_reason,'originalTotal',subtotal,'faturaNo',paid.fatura_no);
 insert into public.pos_operations(request_id,restaurant_id,kind,payload,result) values(p_request_id,rid,'payment',payload,result);
 return result;
end; $$;
revoke all on function public.pos_pay_tab(uuid,uuid,jsonb,jsonb,text,numeric,numeric,numeric,text,uuid,text,text) from public;
grant execute on function public.pos_pay_tab(uuid,uuid,jsonb,jsonb,text,numeric,numeric,numeric,text,uuid,text,text) to anon,authenticated;

-- Source: supabase/pos-adjustments.sql
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

-- Source: supabase/pos-status.sql
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

-- Source: supabase/pos-transfer.sql
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

-- Source: supabase/pos-bill-edit.sql
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

-- Source: supabase/pos-audit.sql
create table if not exists public.pos_audit_log(
 id uuid primary key default gen_random_uuid(), restaurant_id uuid,
 actor_name text,actor_role text,table_name text not null,action text not null,
 before_row jsonb,after_row jsonb,created_at timestamptz not null default now()
);
alter table public.pos_audit_log enable row level security;
revoke all on public.pos_audit_log from anon,authenticated;
grant select on public.pos_audit_log to anon,authenticated,service_role;
create policy manager_audit_read on public.pos_audit_log for select using(restaurant_id=public.session_restaurant_id() and public.pos_can('manage'));
create or replace function private.audit_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare a jsonb:=private.actor();old_json jsonb;new_json jsonb;
begin
 if TG_OP<>'INSERT' then old_json:=to_jsonb(old)-'pin'-'token';end if;
 if TG_OP<>'DELETE' then new_json:=to_jsonb(new)-'pin'-'token';end if;
 insert into public.pos_audit_log(restaurant_id,actor_name,actor_role,table_name,action,before_row,after_row)
 values(coalesce((new_json->>'restaurant_id')::uuid,(old_json->>'restaurant_id')::uuid),a->>'name',a->>'role',TG_TABLE_NAME,TG_OP,old_json,new_json);
 return coalesce(new,old);
end; $$;
do $$ declare t text;begin
 foreach t in array array['orders','tabs','menu_items','categories','settings','staff','access_pins','cash_movements','debt_transactions','discounts','voids','refunds','price_edits'] loop
 execute format('drop trigger if exists pos_audit on public.%I',t);
 execute format('create trigger pos_audit after insert or update or delete on public.%I for each row execute function private.audit_write()',t);
 end loop;
end; $$;

-- Source: supabase/pos-notifications.sql
create or replace function public.pos_claim_notification(p_order_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; n public.pos_notifications; settings jsonb; claim uuid:=gen_random_uuid();
begin
 select * into o from public.orders where id=p_order_id and client_order_id=p_request_id and created_by='Müşteri (QR)';
 if not found then return null; end if;
 update public.pos_notifications set claim_token=claim,claimed_at=now(),attempts=attempts+1
 where order_id=o.id and sent_at is null and (claimed_at is null or claimed_at<now()-interval '5 minutes') returning * into n;
 if not found then return null; end if;
 select jsonb_object_agg(key,value) into settings from public.settings where restaurant_id=o.restaurant_id and key in ('telegram_recipients','telegram_enabled');
 return jsonb_build_object('order',to_jsonb(o),'claim',claim,'settings',settings);
end; $$;
revoke all on function public.pos_claim_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_claim_notification(uuid,uuid) to service_role;
grant all on public.pos_notifications to service_role;

-- Source: supabase/pos-backups.sql
-- Vault holds the encryption key; only server-side service_role can retrieve it.
do $$ begin
 if not exists(select 1 from vault.secrets where name='pos_backup_encryption_key') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'base64'),'pos_backup_encryption_key','POS backup encryption; export a recovery copy securely');
 end if;
end; $$;
create or replace function public.pos_backup_key() returns text
language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='pos_backup_encryption_key' limit 1;
$$;
revoke all on function public.pos_backup_key() from public,anon,authenticated;
grant execute on function public.pos_backup_key() to service_role;
insert into storage.buckets(id,name,public) values('pos-backups','pos-backups',false) on conflict(id) do update set public=false;
-- A transaction-consistent database snapshot. Raw legacy PINs are excluded.
create or replace function public.pos_backup_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t text;data jsonb;result jsonb:='{}';
begin
 foreach t in array array['restaurants','memberships','access_pins','cash_movements','categories','day_close_reports','debt_transactions','debtors','discounts','item_option_choices','item_option_groups','menu_items','monthly_reports','nargile_timers','orders','price_edits','refunds','settings','shifts','staff','tabs','voids','suppliers','pos_operations','pos_notifications','pos_audit_log'] loop
  execute format('select coalesce(jsonb_agg(case when to_jsonb(x) ? ''pin'' and coalesce(to_jsonb(x)->>''pin'','''') !~ ''^\$2[aby]\$'' then to_jsonb(x)||jsonb_build_object(''pin'',''__REDACTED__'') else to_jsonb(x) end),''[]''::jsonb) from public.%I x',t) into data;
  result:=result||jsonb_build_object(t,data);
 end loop;
 return jsonb_build_object('generated_at',now(),'format',1,'tables',result);
end;$$;
revoke all on function public.pos_backup_snapshot() from public,anon,authenticated;
grant execute on function public.pos_backup_snapshot() to service_role;
