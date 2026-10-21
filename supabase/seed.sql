insert into public.configuration (key, value)
values
  ('beta', '{"bookingEnabled":false,"waitlistEnabled":true,"message":"Bookings are being prepared for beta. Join the waitlist and we’ll let you know when your area opens.","whatsapp":"263714885936"}'::jsonb),
  ('operations', '{"switches":{},"supportCopy":""}'::jsonb)
on conflict (key) do nothing;
