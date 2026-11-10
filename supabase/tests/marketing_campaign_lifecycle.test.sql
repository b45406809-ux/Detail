begin;

select plan(8);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('859aca4b-b899-49bb-9e37-4a2c5d3168cb','authenticated','authenticated','campaign-test@detail.invalid','',now(),'{}'::jsonb,'{}'::jsonb,now(),now());

insert into public.users(id,email,displayName,role)
values('859aca4b-b899-49bb-9e37-4a2c5d3168cb','campaign-test@detail.invalid','Campaign Test','CUSTOMER')
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role;

insert into public.userMarketingPreferences(userId,emailEnabled,inAppEnabled)
values('859aca4b-b899-49bb-9e37-4a2c5d3168cb',true,true);

insert into public.marketingCampaigns(id,subject,message,status)
values('campaign-lifecycle-test','A test announcement','Test body','QUEUED');

select is((public.preview_registered_campaign('ALL_USERS')->>'EMAIL')::integer,1,'preview counts email only for explicit email consent');
select is((public.preview_registered_campaign('ALL_USERS')->>'IN_APP')::integer,1,'preview counts in-app only for explicit in-app consent');
select is((public.preview_registered_campaign('ALL_USERS')->>'SMS')::integer,0,'preview does not include SMS without consent and a verified-format phone');
select is((public.preview_registered_campaign('ALL_USERS')->>'PUSH')::integer,0,'preview does not include push without consent and a registered device');

select is((public.enqueue_registered_marketing_campaign('campaign-lifecycle-test',array['EMAIL','IN_APP'],'ALL_USERS')->>'EMAIL')::integer,1,'campaign queue resolves the campaign row for email content');
select is((public.enqueue_registered_marketing_campaign('campaign-lifecycle-test',array['EMAIL','IN_APP'],'ALL_USERS')->>'IN_APP')::integer,1,'campaign queue is idempotent for in-app delivery');
select is((select count(*)::integer from public.marketingCampaignDeliveries where campaignId='campaign-lifecycle-test'),2,'only the two explicitly opted-in channel deliveries are queued');
select is((select count(*)::integer from public.marketingCampaignDeliveries where campaignId='campaign-lifecycle-test' and channel in ('SMS','WHATSAPP','PUSH')),0,'unselected or unconsented channels are never queued');

select * from finish();
rollback;
