CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  phone TEXT,
  display_name TEXT,
  role TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id),
  cleaner_id TEXT REFERENCES users(id),
  status TEXT NOT NULL,
  service TEXT NOT NULL,
  scheduled_at TEXT,
  address_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  budget REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  photo_urls_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_customer_created ON jobs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_cleaner_created ON jobs(cleaner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_open_created ON jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  cleaner_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  message TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, cleaner_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  attachment_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_job_created ON messages(job_id, created_at);
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  platform TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  payer_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  provider_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  provider_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
