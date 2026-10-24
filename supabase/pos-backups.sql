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
