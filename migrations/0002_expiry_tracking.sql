PRAGMA foreign_keys = ON;

ALTER TABLE inventory_request_lines ADD COLUMN lot_code TEXT;
ALTER TABLE inventory_request_lines ADD COLUMN expiry_date TEXT;
ALTER TABLE inventory_request_lines ADD COLUMN received_at TEXT;
ALTER TABLE inventory_request_lines ADD COLUMN allocation_summary TEXT;

ALTER TABLE movement_ledger ADD COLUMN allocation_summary TEXT;

ALTER TABLE app_settings ADD COLUMN expiry_alert_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE app_settings ADD COLUMN strict_fefo INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  lot_code TEXT NOT NULL,
  quantity REAL NOT NULL,
  received_at TEXT NOT NULL,
  expiry_date TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_stock_batches_item_location_expiry
  ON stock_batches(item_id, location_id, expiry_date);
