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
