CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv_store(updated_at);
