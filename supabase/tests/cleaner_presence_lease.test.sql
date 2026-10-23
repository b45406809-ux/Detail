begin;
select plan(10);

select has_function('public','expire_stale_cleaner_presence',array['timestamp with time zone','integer'],'the worker has a bounded cleaner presence lease function');
select ok(not has_function_privilege('authenticated','public.expire_stale_cleaner_presence(timestamptz,integer)','execute'),'clients cannot force presence expiry');
select ok(has_function_privilege('service_role','public.expire_stale_cleaner_presence(timestamptz,integer)','execute'),'only the trusted worker can expire stale presence');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('801342e6-d0a3-4473-85d2-e9557cc1a010','authenticated','authenticated','presence-stale@detail.invalid','',now(),'{}','{}',now(),now()),
 ('801342e6-d0a3-4473-85d2-e9557cc1a011','authenticated','authenticated','presence-stale-second@detail.invalid','',now(),'{}','{}',now(),now()),
 ('801342e6-d0a3-4473-85d2-e9557cc1a012','authenticated','authenticated','presence-fresh@detail.invalid','',now(),'{}','{}',now(),now()),
 ('801342e6-d0a3-4473-85d2-e9557cc1a013','authenticated','authenticated','presence-offline@detail.invalid','',now(),'{}','{}',now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,location,locationPoint,locationUpdatedAt)
values
 ('801342e6-d0a3-4473-85d2-e9557cc1a010','presence-stale@detail.invalid','Stale Cleaner','CLEANER','AVAILABLE','VERIFIED',true,'{"lat":-17.8,"lng":31.0}',extensions.st_setsrid(extensions.st_makepoint(31.0,-17.8),4326)::extensions.geography,now()-interval '6 minutes'),
 ('801342e6-d0a3-4473-85d2-e9557cc1a011','presence-stale-second@detail.invalid','Second Stale Cleaner','CLEANER','AVAILABLE','VERIFIED',true,'{"lat":-17.8,"lng":31.0}',extensions.st_setsrid(extensions.st_makepoint(31.0,-17.8),4326)::extensions.geography,now()-interval '6 minutes'),
 ('801342e6-d0a3-4473-85d2-e9557cc1a012','presence-fresh@detail.invalid','Fresh Cleaner','CLEANER','AVAILABLE','VERIFIED',true,'{"lat":-17.8,"lng":31.0}',extensions.st_setsrid(extensions.st_makepoint(31.0,-17.8),4326)::extensions.geography,now()-interval '1 minute'),
 ('801342e6-d0a3-4473-85d2-e9557cc1a013','presence-offline@detail.invalid','Offline Cleaner','CLEANER','OFFLINE','VERIFIED',true,'{"lat":-17.8,"lng":31.0}',extensions.st_setsrid(extensions.st_makepoint(31.0,-17.8),4326)::extensions.geography,now()-interval '1 hour')
on conflict(id) do update set email=excluded.email,displayName=excluded.displayName,role=excluded.role,status=excluded.status,
  verificationStatus=excluded.verificationStatus,cleanerAgreementAccepted=excluded.cleanerAgreementAccepted,
  location=excluded.location,locationPoint=excluded.locationPoint,locationUpdatedAt=excluded.locationUpdatedAt;

select is(public.expire_stale_cleaner_presence(now(),1),1,'a bounded run expires at most its limit of stale cleaners');
select is((select status from public.users where id='801342e6-d0a3-4473-85d2-e9557cc1a010'),'OFFLINE'::text,'stale available cleaner is marked offline');
select ok((select location='{}'::jsonb and locationPoint is null and locationUpdatedAt is null from public.users where id='801342e6-d0a3-4473-85d2-e9557cc1a010'),'expired location and freshness data are cleared');
select is((select status from public.users where id='801342e6-d0a3-4473-85d2-e9557cc1a011'),'AVAILABLE'::text,'the first run leaves stale rows beyond its batch limit untouched');
select is((select status from public.users where id='801342e6-d0a3-4473-85d2-e9557cc1a012'),'AVAILABLE'::text,'fresh online cleaner is preserved');
select is((select status from public.users where id='801342e6-d0a3-4473-85d2-e9557cc1a013'),'OFFLINE'::text,'already-offline cleaner is preserved');
select is(public.expire_stale_cleaner_presence(now(),100),1,'the next bounded run expires the remaining stale cleaner');

select * from finish();
rollback;
