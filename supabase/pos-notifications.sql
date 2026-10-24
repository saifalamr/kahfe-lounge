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
