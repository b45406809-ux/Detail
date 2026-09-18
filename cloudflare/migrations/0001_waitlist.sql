CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('CUSTOMER','CLEANER')),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  area TEXT NOT NULL,
  preferred_language TEXT NOT NULL,
  service_interest TEXT NOT NULL CHECK (service_interest IN ('HOUSE','CAR','BOTH')),
  marketing_email_permission TEXT NOT NULL CHECK (marketing_email_permission IN ('YES','NO')),
  privacy_accepted INTEGER NOT NULL CHECK (privacy_accepted = 1),
  campaign_json TEXT NOT NULL DEFAULT '{}',
  unsubscribe_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS waitlist_created_at ON waitlist(created_at DESC);
CREATE INDEX IF NOT EXISTS waitlist_marketing ON waitlist(marketing_email_permission,status,created_at DESC);
CREATE INDEX IF NOT EXISTS waitlist_location ON waitlist(country,city,created_at DESC);
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id TEXT PRIMARY KEY, actor_uid TEXT NOT NULL, subject TEXT NOT NULL,
  recipient_count INTEGER NOT NULL, filters_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
