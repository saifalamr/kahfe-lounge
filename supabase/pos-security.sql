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
