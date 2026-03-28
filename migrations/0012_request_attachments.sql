CREATE TABLE IF NOT EXISTS inventory_request_attachments (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('request', 'decision')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_url TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES inventory_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inventory_request_attachments_request_scope
  ON inventory_request_attachments(request_id, scope, uploaded_at DESC);
