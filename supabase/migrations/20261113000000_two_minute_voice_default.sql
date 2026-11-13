insert into public.configuration (key, value) values ('operations', jsonb_build_object('voiceCallLimitSeconds', 120))
on conflict (key) do update set value = jsonb_set(coalesce(public.configuration.value, '{}'::jsonb), '{voiceCallLimitSeconds}', '120'::jsonb, true), updatedAt = now();
