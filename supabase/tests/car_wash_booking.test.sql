begin;
select plan(5);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('b1f10ca8-0afe-45b0-91b6-218f5040a1e1','authenticated','authenticated','wash-owner@detail.invalid','',now(),'{}','{}',now(),now()),
  ('b1f10ca8-0afe-45b0-91b6-218f5040a1e2','authenticated','authenticated','other-cleaner@detail.invalid','',now(),'{}','{}',now(),now());

insert into public.users(id,email,displayName,role,status,verificationStatus,cleanerAgreementAccepted,cleanerOnboardingComplete,serviceCategories)
values
  ('b1f10ca8-0afe-45b0-91b6-218f5040a1e1','wash-owner@detail.invalid','Wash Owner','CLEANER','AVAILABLE','VERIFIED',true,true,array['CAR']),
  ('b1f10ca8-0afe-45b0-91b6-218f5040a1e2','other-cleaner@detail.invalid','Other Cleaner','CLEANER','AVAILABLE','VERIFIED',true,true,array['CAR'])
on conflict(id) do update set role=excluded.role,status=excluded.status,verificationStatus=excluded.verificationStatus,
  cleanerAgreementAccepted=true,cleanerOnboardingComplete=true,serviceCategories=excluded.serviceCategories;

select lives_ok($$select public.save_car_wash_site('b1f10ca8-0afe-45b0-91b6-218f5040a1e1','Town Wash','12 Main Street, Harare',-17.82,31.05,true)$$,
  'verified car cleaner can publish a wash location');
select is((select count(*)::integer from public.list_car_wash_sites(-17.82,31.05)),1,
  'published wash appears in the nearby customer search');

insert into public.jobs(id,customerId,category,serviceType,status,bookingMode,biddingExpiresAt,checklist,location,data)
values
  ('b1f10ca8-0afe-45b0-91b6-218f5040a1e3','b1f10ca8-0afe-45b0-91b6-218f5040a1e1','CAR','Exterior Wash','PENDING','SCHEDULED',now()+interval '1 hour','{}',
   '{"lat":-17.82,"lng":31.05,"address":"12 Main Street, Harare"}',
   jsonb_build_object('serviceMode','VISIT_WASH','washSiteId',(select id from public.car_wash_sites where cleaner_id='b1f10ca8-0afe-45b0-91b6-218f5040a1e1'),'washSiteCleanerId','b1f10ca8-0afe-45b0-91b6-218f5040a1e1')),
  ('b1f10ca8-0afe-45b0-91b6-218f5040a1e4','b1f10ca8-0afe-45b0-91b6-218f5040a1e1','CAR','Exterior Wash','PENDING','SCHEDULED',now()+interval '1 hour','{}',
   '{"lat":-17.82,"lng":31.05,"address":"12 Main Street, Harare"}',
   jsonb_build_object('serviceMode','VISIT_WASH','washSiteId',(select id from public.car_wash_sites where cleaner_id='b1f10ca8-0afe-45b0-91b6-218f5040a1e1'),'washSiteCleanerId','b1f10ca8-0afe-45b0-91b6-218f5040a1e1'));

select throws_ok($$select public.submit_bid_secure('b1f10ca8-0afe-45b0-91b6-218f5040a1e3','b1f10ca8-0afe-45b0-91b6-218f5040a1e2',25,30,'Wrong cleaner')$$,
  'P0001','This booking is reserved for the selected car wash','another cleaner cannot bid on a visit-wash booking');
select ok(public.submit_bid_secure('b1f10ca8-0afe-45b0-91b6-218f5040a1e3','b1f10ca8-0afe-45b0-91b6-218f5040a1e1',25,30,'Wash quote') is not null,
  'the selected wash cleaner can quote the booking');

update public.car_wash_sites set enabled=false where cleaner_id='b1f10ca8-0afe-45b0-91b6-218f5040a1e1';
select ok(public.submit_bid_secure('b1f10ca8-0afe-45b0-91b6-218f5040a1e4','b1f10ca8-0afe-45b0-91b6-218f5040a1e1',25,30,'Existing booking') is not null,
  'hiding a wash only affects future search, not a booking already made');

select * from finish();
rollback;
