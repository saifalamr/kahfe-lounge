import {test, before, after} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
let db, rid, tab, item, manager, limited, full, debtor
const request=()=>crypto.randomUUID()
async function header(token=null,slug='fixture') {
 await db.query("select set_config('request.headers',$1,false),set_config('request.jwt.claims','',false)",[JSON.stringify({'x-restaurant-slug':slug,...(token?{'x-session-token':token}:{})})])
}
before(async()=>{
 db=new PGlite({extensions:{pgcrypto}})
 await db.exec("create schema extensions;create extension pgcrypto with schema extensions; create role anon;create role authenticated;create role service_role;")
 const cols=JSON.parse(await readFile(new URL('./fixtures/live-columns.json',import.meta.url),'utf8'))
 for (const name of [...new Set(cols.map(c=>c.table_name))]) {
  for(const c of cols.filter(c=>c.table_name===name&&c.column_default?.startsWith('nextval'))){const seq=c.column_default.split("'")[1];await db.exec(`create sequence if not exists ${seq}`)}
  const defs=cols.filter(c=>c.table_name===name).map(c=>`"${c.column_name}" ${c.data_type}${c.column_default?' default '+c.column_default:''}${c.is_nullable==='NO'?' not null':''}`)
  await db.exec(`create table public."${name}" (${defs.join(',')});`)
 }
 for(const name of ['restaurants','staff','menu_items','categories','tabs','orders','debtors','item_option_groups','item_option_choices'])await db.exec(`alter table public.${name} add primary key(id)`)
 await db.exec('alter table public.device_sessions add primary key(token);create unique index order_client on public.orders(client_order_id) where client_order_id is not null;')
 await db.exec(await readFile(new URL('./fixtures/live-functions.sql',import.meta.url),'utf8'))
 await db.exec("create trigger invoice before insert or update on tabs for each row execute function assign_fatura_no();")
 await db.exec(await readFile(new URL('../supabase/pos-helpers.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-security.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-adjustments.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-status.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-bill-edit.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-transfer.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-audit.sql',import.meta.url),'utf8'))
 rid=request();item=request();manager=request();limited=request();full=request();debtor=request()
 await db.query("insert into restaurants(id,slug,name,active)values($1,'fixture','Fixture',true)",[rid])
 await db.query("insert into settings(key,value,restaurant_id)values('tables','[\"MASA-1\",\"MASA-2\"]',$1)",[rid])
 await db.query("insert into menu_items(id,name,price,available,staff_only,track_stock,stock_quantity,restaurant_id)values($1,'Coffee',10,true,false,true,100,$2)",[item,rid])
 const staffid=request(), fullid=request()
 await db.query("insert into staff(id,name,pin,permission,active,restaurant_id)values($1,'Limited','1111','limited',true,$3),($2,'Full','2222','full',true,$3)",[staffid,fullid,rid])
 await db.query("insert into device_sessions(token,role,staff_name,staff_id,expires_at,restaurant_id) values($1,'manager','Manager',null,now()+interval '1 hour',$4),($2,'staff','Limited',$5,now()+interval '1 hour',$4),($3,'staff','Full',$6,now()+interval '1 hour',$4)",[manager,limited,full,rid,staffid,fullid])
 await db.query("insert into debtors(id,name,restaurant_id)values($1,'Debtor',$2)",[debtor,rid])
})
after(async()=>db?.close())
async function order(id=request(),table='MASA-1',lines=[{id:item,quantity:2}]){
 return (await db.query('select pos_create_order($1,$2,$3,null) r',[id,table,JSON.stringify(lines)])).rows[0].r
}
async function snapshot(tabid){return (await db.query("select coalesce(jsonb_agg(jsonb_build_object('id',id,'items',items,'total',total,'status',status) order by id),'[]') r from orders where tab_id=$1 and status<>'dismissed'",[tabid])).rows[0].r}
async function pay(tabid,id=request(),method='cash',discount=0,selection=null,expected=null){
 return (await db.query("select pos_pay_tab($1,$2,$3,$4,$5,0,0,$6,'test',$7,null,null) r",[id,tabid,JSON.stringify(expected??await snapshot(tabid)),selection===null?null:JSON.stringify(selection),method,discount,debtor])).rows[0].r
}
test('server pricing and stock are atomic, retry has no additional effect',async()=>{
 await header(); const id=request();const a=await order(id);const b=await order(id)
 assert.deepEqual(a,b);assert.equal(a.total,20);tab=a.tab_id
 assert.equal((await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity,98)
 await assert.rejects(order(id,'MASA-2'))
})
test('bad table, negative quantity, insufficient stock and missing options are rejected without writes',async()=>{
 const before=(await db.query('select count(*) n from orders')).rows[0].n
 await assert.rejects(order(request(),'FAKE'))
 await assert.rejects(order(request(),'MASA-1',null))
 await assert.rejects(order(request(),'MASA-1',[{id:item,quantity:-1}]))
 await assert.rejects(order(request(),'MASA-1',[{id:item,quantity:99}]))
 const g=request();await db.query("insert into item_option_groups(id,menu_item_id,name,required,restaurant_id)values($1,$2,'Sugar',true,$3)",[g,item,rid])
 await assert.rejects(order())
 await db.query('delete from item_option_groups where id=$1',[g])
 assert.equal((await db.query('select count(*) n from orders')).rows[0].n,before)
})
test('limited staff cannot adjust or create debt; manager can',async()=>{
 await header(limited);assert.equal((await db.query("select pos_can('manage') m,pos_can('adjust') a,pos_can('operate') o")).rows[0].a,false)
 await assert.rejects(pay(tab,request(),'cash',1));await assert.rejects(pay(tab,request(),'debt'))
 await header(manager);assert.equal((await db.query("select pos_can('adjust') a")).rows[0].a,true)
})
test('stale payment snapshot rolls back; debt and discount commit with closure; retry returns same receipt',async()=>{
 await header(manager);await assert.rejects(pay(tab,request(),'cash',0,null,[]))
 const id=request(),snap=await snapshot(tab);const a=await pay(tab,id,'debt',2,null,snap);const b=await pay(tab,id,'debt',2,null,snap)
 assert.deepEqual(a,b);assert.equal(a.total,18)
 assert.equal((await db.query('select count(*) n from debt_transactions where tab_id=$1',[tab])).rows[0].n,1)
 assert.equal((await db.query('select count(*) n from discounts where tab_id=$1',[tab])).rows[0].n,1)
 assert.equal((await db.query('select status from orders where tab_id=$1',[tab])).rows[0].status,'pending')
 await assert.rejects(pay(tab))
})
test('selected-line payment preserves remaining items and preparation state',async()=>{
 await header(manager);const a=await order(request(),'MASA-2',[{id:item,quantity:1},{id:item,quantity:2}]);const snap=await snapshot(a.tab_id)
 const result=await pay(a.tab_id,request(),'cash',0,[{order_id:a.id,index:0}],snap)
 assert.equal(result.total,10)
 const row=(await db.query('select items,status from orders where tab_id=$1',[a.tab_id])).rows[0]
 assert.equal(row.items.length,1);assert.equal(row.items[0].quantity,2);assert.equal(row.status,'pending')
 await assert.rejects(pay(a.tab_id,request(),'cash',0,null,snap))
})
test('disabled staff lose authorization immediately',async()=>{
 await header(full);assert.equal((await db.query("select pos_can('adjust') a")).rows[0].a,true)
 await db.query("update staff set active=false where name='Full'")
 assert.equal((await db.query("select pos_can('adjust') a")).rows[0].a,false)
})
test('void is atomic with stock restoration and replay does not restore twice',async()=>{
 await header(manager);const a=await order(request(),'MASA-1',[{id:item,quantity:3}]);const id=request()
 const args=[id,a.id,JSON.stringify(a.items),'void',0,null,'test']
 await db.query('select pos_adjust_order($1,$2,$3,$4,$5,$6,$7)',args)
 const stock=(await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity
 await db.query('select pos_adjust_order($1,$2,$3,$4,$5,$6,$7)',args)
 assert.equal((await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity,stock)
 assert.equal((await db.query('select count(*) n from voids where order_id=$1',[a.id])).rows[0].n,1)
})
test('refund records cash movement once and rejects cumulative over-refund',async()=>{
 await header(manager);const a=await order(request(),'MASA-1',[{id:item,quantity:3}]);await pay(a.tab_id)
 const id=request(),args=[id,a.tab_id,'refund','cash',20,'refund test']
 await db.query('select pos_refund($1,$2,$3,$4,$5,$6)',args);await db.query('select pos_refund($1,$2,$3,$4,$5,$6)',args)
 assert.equal((await db.query("select count(*) n from cash_movements where reason='İade: refund test'")).rows[0].n,1)
 await assert.rejects(db.query('select pos_refund($1,$2,$3,$4,$5,$6)',[request(),a.tab_id,'refund','cash',20,'too much']))
})
test('line transfer commits both sides once without stock changes',async()=>{
 await header(manager);const a=await order(request(),'MASA-1',[{id:item,quantity:1}]);const id=request();const args=[id,a.id,JSON.stringify(a.items),0,'MASA-2'];
 const stock=(await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity
 await db.query('select pos_move_item($1,$2,$3,$4,$5)',args);await db.query('select pos_move_item($1,$2,$3,$4,$5)',args)
 assert.equal((await db.query('select status from orders where id=$1',[a.id])).rows[0].status,'dismissed')
 assert.equal((await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity,stock)
})
test('closed bill quantity, inventory and refund commit atomically and replay once',async()=>{
 await header(manager);const a=await order(request(),'MASA-1',[{id:item,quantity:3}]);await pay(a.tab_id);const id=request(),snap=await snapshot(a.tab_id)
 const args=[id,a.tab_id,JSON.stringify(snap),JSON.stringify([{order_id:a.id,index:0,quantity:2}]),'[]','cash','quantity correction']
 await db.query('select pos_edit_bill($1,$2,$3,$4,$5,$6,$7)',args)
 const stock=(await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity
 await db.query('select pos_edit_bill($1,$2,$3,$4,$5,$6,$7)',args)
 assert.equal((await db.query('select total from tabs where id=$1',[a.tab_id])).rows[0].total,'20.00')
 assert.equal((await db.query('select stock_quantity from menu_items where id=$1',[item])).rows[0].stock_quantity,stock)
 await assert.rejects(db.query('select pos_edit_bill($1,$2,$3,$4,$5,$6,$7)',[request(),...args.slice(1)]))
})
test('lockdown enforces catalog/operational isolation and hashes PINs without changing codes',async()=>{
 await header(manager)
 await db.exec(`create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,name text,bucket_id text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/'); $$;
 insert into storage.buckets(id,name,public)values('menu-images','menu-images',true);
 create function public.sign_jwt(jsonb,integer default 3600) returns text language sql as $$select 'fixture-token';$$;
 create function public.cleanup_expired() returns void language sql as $$select;$$;
 grant usage on schema public to anon,authenticated;
 grant select,insert,update,delete on all tables in schema public to anon,authenticated;
 `)
 await db.exec(await readFile(new URL('./fixtures/legacy-functions.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-lockdown.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/pos-auth.sql',import.meta.url),'utf8'))
 await db.exec("create schema vault;create table vault.secrets(id uuid,name text);create view vault.decrypted_secrets as select id,name,''::text decrypted_secret from vault.secrets;create function vault.create_secret(text,text,text) returns uuid language sql as $$select gen_random_uuid();$$;")
 await db.exec(await readFile(new URL('../supabase/pos-backups.sql',import.meta.url),'utf8'))
 const backup=(await db.query('select pos_backup_snapshot() r')).rows[0].r
 assert.equal(backup.tables.staff.length,2)
 assert.ok(backup.tables.staff.every(s=>s.pin.startsWith('$2')))
 await db.exec('set role anon')
 await header()
 assert.equal((await db.query('select * from orders')).rows.length,0)
 assert.ok((await db.query('select * from menu_items')).rows.length>0)
 await assert.rejects(db.query("select get_or_create_open_tab('arbitrary')"))
 await header(limited)
 await db.query('select pos_set_order_status($1,$2)',[tab==='none'?null:(await db.query("select id from orders where status<>'dismissed' limit 1")).rows[0].id,'served'])
 await assert.rejects(db.query("update menu_items set price=0 returning id").then(r=>{if(!r.rows.length)throw Error('denied')}))
 await header(manager)
 assert.ok((await db.query('select * from orders')).rows.length>0)
 await db.exec('reset role')
 const hash=(await db.query("select pin from staff where name='Limited'")).rows[0].pin
 assert.match(hash,/^\$2/)
 assert.equal((await db.query("select extensions.crypt('1111',$1)=$1 ok",[hash])).rows[0].ok,true)
 const listed=(await db.query('select * from list_staff($1)',[manager])).rows
 assert.ok(listed.every(s=>s.pin===''))
 await assert.rejects(db.query("select upsert_staff($1,null,'Duplicate','1111','full')",[manager]))
})
