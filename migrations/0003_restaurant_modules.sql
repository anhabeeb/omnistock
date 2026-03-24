ALTER TABLE inventory_request_lines ADD COLUMN waste_reason TEXT;
ALTER TABLE inventory_request_lines ADD COLUMN waste_shift TEXT;
ALTER TABLE inventory_request_lines ADD COLUMN waste_station TEXT;

CREATE TABLE IF NOT EXISTS market_price_entries (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  market_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('meat', 'vegetables', 'seafood', 'dairy', 'dry-goods', 'oil')),
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  supplier_id TEXT,
  unit TEXT NOT NULL,
  quoted_price REAL NOT NULL,
  previous_price REAL,
  variance_pct REAL,
  source_name TEXT NOT NULL,
  note TEXT NOT NULL,
  captured_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (captured_by) REFERENCES users(id)
) STRICT;

CREATE TABLE IF NOT EXISTS waste_entries (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spoilage', 'expiry', 'overproduction', 'prep-loss', 'damage', 'staff-meal', 'qc-rejection')),
  shift_key TEXT NOT NULL CHECK (shift_key IN ('morning', 'lunch', 'dinner', 'night')),
  station TEXT NOT NULL,
  batch_lot_code TEXT,
  expiry_date TEXT,
  estimated_cost REAL NOT NULL,
  reported_by TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES inventory_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (reported_by) REFERENCES users(id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inventory_request_lines_waste_reason ON inventory_request_lines(waste_reason);
CREATE INDEX IF NOT EXISTS idx_market_price_entries_item_location_date ON market_price_entries(item_id, location_id, market_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_price_entries_category_date ON market_price_entries(category, market_date DESC);
CREATE INDEX IF NOT EXISTS idx_waste_entries_location_created_at ON waste_entries(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_entries_reason_created_at ON waste_entries(reason, created_at DESC);

INSERT OR IGNORE INTO id_sequences (sequence_key, prefix, next_value, updated_at)
VALUES ('market_price_entries', 'mpr', 1, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO id_sequences (sequence_key, prefix, next_value, updated_at)
VALUES ('waste_entries', 'wte', 1, CURRENT_TIMESTAMP);
