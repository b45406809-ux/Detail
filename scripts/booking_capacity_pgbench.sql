\set user_seq random(1,10000)
SELECT ('00000000-0000-0000-0000-'||lpad(to_hex(:user_seq),12,'0')) AS actor_id \gset
SELECT public.create_booking(
  :'actor_id'::uuid,
  'capacity_'||:'run_id'||'_'||txid_current()::text,
  jsonb_build_object(
    'category','HOUSE',
    'serviceType','Capacity benchmark clean',
    'bookingMode','SCHEDULED',
    'timePreference','CUSTOM',
    'scheduledDateTime',(now()+interval '1 day')::text,
    'budget',30,
    'location',jsonb_build_object('address','Synthetic Test Location','lat',-17.8,'lng',31),
    'checklist',jsonb_build_object('rooms',2),
    'capacityTestRun',:'run_id'
  )
) AS booking_id \gset
SELECT public.notify_scheduled_job_cleaners(:'booking_id'::uuid,:'actor_id'::uuid,20);
