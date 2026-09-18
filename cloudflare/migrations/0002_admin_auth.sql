CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,elevated INTEGER NOT NULL DEFAULT 0,permissions_json TEXT NOT NULL DEFAULT '[]',must_change_password INTEGER NOT NULL DEFAULT 1,disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,last_sign_in_at TEXT);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(admin_id) REFERENCES admins(id));
CREATE TABLE IF NOT EXISTS admin_invites (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,token_hash TEXT NOT NULL UNIQUE,permissions_json TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit (id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dashboard_settings (key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
