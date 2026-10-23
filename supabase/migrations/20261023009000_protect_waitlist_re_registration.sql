create or replace function public.register_waitlist_entry(
  p_email text,
  p_full_name text,
  p_phone text,
  p_country text,
  p_city text,
  p_area text,
  p_participant_type text,
  p_service_interest text,
  p_preferred_language text,
  p_marketing_consent boolean,
  p_unsubscribe_token text,
  p_data jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare normalized_email text := lower(trim(p_email));
begin
  if normalized_email = '' or p_unsubscribe_token = '' then
    raise exception 'Waitlist registration details are invalid';
  end if;

  -- Serialize public signups for the same address, including legacy rows that
  -- may differ only by case. Existing consent and contact details stay intact.
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));
  if exists (select 1 from public.betawaitlist where lower(email) = normalized_email) then
    return false;
  end if;

  insert into public.betawaitlist (
    email, fullname, phone, country, city, area, participanttype,
    serviceinterest, preferredlanguage, marketingemailpermission,
    marketingconsent, unsubscribetoken, data
  ) values (
    normalized_email, left(trim(p_full_name), 120), left(trim(p_phone), 40),
    left(trim(p_country), 80), left(trim(p_city), 100), left(trim(p_area), 120),
    left(trim(p_participant_type), 30), left(trim(p_service_interest), 30),
    left(trim(p_preferred_language), 40),
    case when p_marketing_consent then 'YES' else 'NO' end,
    jsonb_build_object(
      'granted', p_marketing_consent,
      'timestamp', now(),
      'source', 'website',
      'version', '2026-10-20'
    ),
    p_unsubscribe_token, coalesce(p_data, '{}'::jsonb)
  );
  return true;
end;
$$;

revoke all on function public.register_waitlist_entry(text,text,text,text,text,text,text,text,text,boolean,text,jsonb) from public, anon, authenticated;
grant execute on function public.register_waitlist_entry(text,text,text,text,text,text,text,text,text,boolean,text,jsonb) to service_role;
