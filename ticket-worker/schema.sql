PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_auth (
  google_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  encrypted_totp_secret TEXT,
  totp_confirmed INTEGER NOT NULL DEFAULT 0,
  last_totp_step INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  device TEXT NOT NULL,
  category TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'Normal',
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received',
  access_hash TEXT NOT NULL,
  access_hint TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'gmail',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  status TEXT NOT NULL,
  public_message TEXT NOT NULL,
  private_note TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  service_description TEXT NOT NULL,
  rate_cents INTEGER,
  rate_unit TEXT,
  minimum_cents INTEGER,
  maximum_cents INTEGER,
  terms TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(ticket_id, version),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  last_error TEXT,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS processed_emails (
  gmail_message_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(customer_email);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_updates_ticket ON ticket_updates(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON email_outbox(status, created_at);
