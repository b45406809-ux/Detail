-- A closed account can erase its photo without qualifying for cleaner work.
create or replace function public.require_cleaner_profile_selfie()
returns trigger language plpgsql set search_path=public as $$
declare selfie_required boolean:=false;
begin
  if new.accountDeletedAt is not null then
    return new;
  end if;

  if new.role='CLEANER' then
    if tg_op='INSERT' then
      selfie_required:=new.photoURL is distinct from 'detail-media/profile-photos/'||new.id::text||'/avatar.jpg'
        or new.cleanerSelfieAt is null;
    elsif (new.role is distinct from old.role or (new.status is distinct from old.status and new.status='AVAILABLE'))
        and (new.photoURL is distinct from 'detail-media/profile-photos/'||new.id::text||'/avatar.jpg'
          or new.cleanerSelfieAt is null) then
      selfie_required:=true;
    elsif new.photoURL is distinct from old.photoURL
        and new.photoURL is distinct from 'detail-media/profile-photos/'||new.id::text||'/avatar.jpg' then
      selfie_required:=true;
    end if;
  end if;
  if selfie_required then
    raise exception 'Take a current front-camera selfie for your cleaner profile before going online or accepting work';
  end if;
  return new;
end;
$$;
