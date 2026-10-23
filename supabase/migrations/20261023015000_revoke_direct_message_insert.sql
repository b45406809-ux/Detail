drop policy if exists "Job participants send messages" on public.messages;
revoke insert on public.messages from public,anon,authenticated;
