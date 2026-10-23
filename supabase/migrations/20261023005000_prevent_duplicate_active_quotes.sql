-- Resolve any preexisting duplicate active cleaner quotes by preserving the
-- latest quote and closing older active rows before adding the unique guard.
with ranked as (
  select id, row_number() over (
    partition by jobId, cleanerId
    order by updatedAt desc, createdAt desc, id desc
  ) as position
  from public.bids
  where status in ('PENDING', 'COUNTERED')
)
update public.bids b
set status = 'REJECTED', updatedAt = now()
from ranked r
where b.id = r.id and r.position > 1;

create unique index if not exists bids_one_active_quote_per_cleaner_idx
on public.bids(jobId, cleanerId)
where status in ('PENDING', 'COUNTERED');
