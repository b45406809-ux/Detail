select count(*) from public.jobs where data->>'capacityTestRun' = :'run_id';
select count(*) from public.scheduledJobNotices n join public.jobs j on j.id=n.jobId where j.data->>'capacityTestRun' = :'run_id';
