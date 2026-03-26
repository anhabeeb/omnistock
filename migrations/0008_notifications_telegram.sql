ALTER TABLE app_settings
ADD COLUMN notification_settings_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('low-stock', 'near-expiry', 'expired', 'approval-request', 'failed-sync', 'wastage-threshold', 'daily-summary')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unread', 'read')),
  channels_json TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  item_id TEXT,
  item_name TEXT,
  location_id TEXT,
  location_name TEXT,
  request_id TEXT,
  metadata_json TEXT,
  read_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (request_id) REFERENCES inventory_requests(id)
) STRICT;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE,
  notification_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in-app', 'telegram')),
  target TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
  provider_message_id TEXT,
  error_message TEXT,
  attempted_at TEXT NOT NULL,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_created_at
ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_status_created_at
ON notifications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_resolved_at
ON notifications(resolved_at);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id
ON notification_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_attempted_at
ON notification_deliveries(status, attempted_at DESC);
