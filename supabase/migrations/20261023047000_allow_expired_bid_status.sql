alter table public.bids drop constraint if exists bids_status_check;
alter table public.bids add constraint bids_status_check
  check (status in ('PENDING','ACCEPTED','REJECTED','COUNTERED','EXPIRED'));
