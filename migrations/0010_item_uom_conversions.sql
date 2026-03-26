CREATE TABLE IF NOT EXISTS item_unit_conversions (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  quantity_in_base REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_item_unit_conversions_item_id
ON item_unit_conversions(item_id);
