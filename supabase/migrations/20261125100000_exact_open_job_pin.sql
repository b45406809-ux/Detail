-- At the owner's request, cleaners now see the customer's exact map pin
-- (full-precision lat/lng) on open jobs before a quote is accepted, so travel
-- estimates and the map are precise. The street address is still withheld
-- ('Approximate area') until the customer accepts a quote. Re-project
-- currently open jobs.

create or replace function public.project_open_job_location()
returns trigger language plpgsql security definer set search_path = public
as $$
declare source_location jsonb; raw_lat text; raw_lng text; lat numeric; lng numeric;
begin
  select location into source_location from public.jobs where id = new.jobId;
  raw_lat := source_location->>'lat';
  raw_lng := source_location->>'lng';
  begin lat := raw_lat::numeric; if lat not between -90 and 90 then lat := null; end if;
  exception when others then lat := null; end;
  begin lng := raw_lng::numeric; if lng not between -180 and 180 then lng := null; end if;
  exception when others then lng := null; end;
  new.data := coalesce(new.data, '{}'::jsonb) || jsonb_build_object(
    'location', jsonb_strip_nulls(jsonb_build_object('lat', lat, 'lng', lng, 'address', 'Approximate area'))
  );
  return new;
end;
$$;

with coordinates as (
  select j.id,
    case when j.location->>'lat' ~ '^-?[0-9]+([.][0-9]+)?$' then (j.location->>'lat')::numeric end as lat,
    case when j.location->>'lng' ~ '^-?[0-9]+([.][0-9]+)?$' then (j.location->>'lng')::numeric end as lng
  from public.jobs j
)
update public.openjobs oj
set data = coalesce(oj.data, '{}'::jsonb) || jsonb_build_object(
  'location', jsonb_strip_nulls(jsonb_build_object(
    'lat', case when c.lat between -90 and 90 then c.lat end,
    'lng', case when c.lng between -180 and 180 then c.lng end,
    'address', 'Approximate area'
  ))
)
from coordinates c
where c.id = oj.jobId and oj.status = 'PENDING';
