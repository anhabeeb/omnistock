PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  module_key TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (role_code, permission_code),
  FOREIGN KEY (role_code) REFERENCES roles(code) ON DELETE CASCADE,
  FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS id_sequences (
  sequence_key TEXT PRIMARY KEY,
  prefix TEXT NOT NULL UNIQUE,
  next_value INTEGER NOT NULL CHECK (next_value >= 1),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value_integer INTEGER,
  value_text TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'invited')),
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (role_code) REFERENCES roles(code)
) STRICT;

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('warehouse', 'outlet')),
  city TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS user_location_assignments (
  user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, location_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  cost_price REAL NOT NULL,
  selling_price REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) STRICT;

CREATE TABLE IF NOT EXISTS item_stocks (
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  on_hand REAL NOT NULL,
  reserved REAL NOT NULL,
  min_level REAL NOT NULL,
  max_level REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item_id, location_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS inventory_requests (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  reference TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('grn', 'gin', 'transfer', 'adjustment', 'stock-count', 'wastage')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'posted', 'rejected')),
  supplier_id TEXT,
  from_location_id TEXT,
  to_location_id TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  posted_at TEXT,
  note TEXT NOT NULL,
  client_mutation_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (from_location_id) REFERENCES locations(id),
  FOREIGN KEY (to_location_id) REFERENCES locations(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
) STRICT;

CREATE TABLE IF NOT EXISTS inventory_request_lines (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  quantity REAL NOT NULL,
  counted_quantity REAL,
  unit TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (request_id, line_no),
  FOREIGN KEY (request_id) REFERENCES inventory_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
) STRICT;

CREATE TABLE IF NOT EXISTS movement_ledger (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  reference TEXT NOT NULL,
  request_id TEXT,
  request_line_id TEXT,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('grn', 'gin', 'transfer', 'adjustment', 'stock-count', 'wastage')),
  quantity_before REAL NOT NULL,
  quantity_change REAL NOT NULL,
  quantity_after REAL NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES inventory_requests(id),
  FOREIGN KEY (request_line_id) REFERENCES inventory_request_lines(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
) STRICT;

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  seq INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  module_key TEXT NOT NULL CHECK (module_key IN ('dashboard', 'inventoryOps', 'masterData', 'reports', 'administration')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'success', 'warning')),
  related_request_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (related_request_id) REFERENCES inventory_requests(id)
) STRICT;

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  low_stock_threshold INTEGER NOT NULL,
  enable_offline INTEGER NOT NULL CHECK (enable_offline IN (0, 1)),
  enable_realtime INTEGER NOT NULL CHECK (enable_realtime IN (0, 1)),
  enable_barcode INTEGER NOT NULL CHECK (enable_barcode IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  seq INTEGER NOT NULL UNIQUE,
  mutation_id TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('grn', 'gin', 'transfer', 'adjustment', 'stock-count', 'wastage')),
  request_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (request_id) REFERENCES inventory_requests(id),
  FOREIGN KEY (activity_id) REFERENCES activity_logs(id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_users_role_code ON users(role_code);
CREATE INDEX IF NOT EXISTS idx_user_location_assignments_location_id ON user_location_assignments(location_id);
CREATE INDEX IF NOT EXISTS idx_items_supplier_id ON items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_item_stocks_location_id ON item_stocks(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_requested_at ON inventory_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_kind_status ON inventory_requests(kind, status);
CREATE INDEX IF NOT EXISTS idx_inventory_request_lines_item_id ON inventory_request_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_movement_ledger_item_id ON movement_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_movement_ledger_location_id_created_at ON movement_ledger(location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module_key_created_at ON activity_logs(module_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_events_seq ON sync_events(seq DESC);
CREATE INDEX IF NOT EXISTS idx_sync_events_timestamp ON sync_events(timestamp DESC);
