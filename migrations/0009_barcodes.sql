CREATE TABLE IF NOT EXISTS item_barcodes (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  barcode_type TEXT NOT NULL CHECK (barcode_type IN ('primary', 'secondary', 'packaging')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS batch_barcodes (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  batch_id TEXT NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES stock_batches(id) ON DELETE CASCADE
) STRICT;

ALTER TABLE inventory_request_lines
ADD COLUMN batch_barcode TEXT;

CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id
ON item_barcodes(item_id);

CREATE INDEX IF NOT EXISTS idx_item_barcodes_barcode_type
ON item_barcodes(barcode_type);

CREATE INDEX IF NOT EXISTS idx_batch_barcodes_batch_id
ON batch_barcodes(batch_id);

INSERT INTO item_barcodes (id, sequence_no, item_id, barcode, barcode_type, created_at, updated_at)
SELECT
  'ibc-' || printf('%05d', row_number() OVER (ORDER BY i.sequence_no)),
  row_number() OVER (ORDER BY i.sequence_no),
  i.id,
  i.barcode,
  'primary',
  i.created_at,
  i.updated_at
FROM items i
LEFT JOIN item_barcodes ib
  ON ib.item_id = i.id
 AND ib.barcode = i.barcode
 AND ib.barcode_type = 'primary'
WHERE ib.id IS NULL
  AND trim(i.barcode) <> '';
