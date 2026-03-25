import { ROLE_PRESETS } from "../../shared/permissions";
import { applyMutation } from "../../shared/operations";
import type { MutationResult } from "../../shared/operations";
import { buildBootstrapPayload } from "../../shared/selectors";
import type {
  ActivateSuperadminRequest,
  ActivityLog,
  BootstrapPayload,
  ChangeOwnPasswordRequest,
  CreateItemRequest,
  CreateItemResponse,
  CreateLocationRequest,
  CreateLocationResponse,
  CreateUserRequest,
  CreateMarketPriceRequest,
  CreateMarketPriceResponse,
  CreateSupplierRequest,
  CreateSupplierResponse,
  DeleteInventoryRequest,
  DeleteItemRequest,
  DeleteLocationRequest,
  DeleteMarketPriceRequest,
  DeleteSnapshotResponse,
  DeleteSupplierRequest,
  EditInventoryRequest,
  InventorySnapshot,
  InventoryActionResponse,
  InventoryRequest,
  InitializeSystemRequest,
  InitializeSystemResponse,
  Item,
  ItemStock,
  LoginRequest,
  LoginResponse,
  Location,
  MarketPriceEntry,
  MutationEnvelope,
  PermissionKey,
  PullResponse,
  PushResponse,
  RequestKind,
  ReverseInventoryRequest,
  ResetUserPasswordRequest,
  RemoveUserRequest,
  ProfileResponse,
  StockBatch,
  Supplier,
  SyncEvent,
  UpdateItemRequest,
  UpdateItemResponse,
  UpdateLocationRequest,
  UpdateLocationResponse,
  UpdateMarketPriceRequest,
  UpdateMarketPriceResponse,
  UpdateOwnProfileRequest,
  UpdateSupplierRequest,
  UpdateSupplierResponse,
  UpdateUserRequest,
  User,
  WasteEntry,
  UserAdminResponse,
} from "../../shared/types";
import { OMNISTOCK_D1_SCHEMA_SQL } from "./schema";

type D1Value = string | number | null;

const SETTINGS_ID = "stg-00001";
const SEQUENCE_DEFAULT_WIDTH = 5;
const DOCUMENT_SEQUENCE_START = 1001;
const PASSWORD_ITERATIONS = 100_000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const textEncoder = new TextEncoder();

const PERMISSION_CATALOG: Array<{
  code: PermissionKey;
  moduleKey: string;
  label: string;
}> = [
  { code: "dashboard.view", moduleKey: "dashboard", label: "View dashboard" },
  { code: "inventory.view", moduleKey: "inventoryOps", label: "View inventory operations" },
  { code: "inventory.grn", moduleKey: "inventoryOps", label: "Create GRN requests" },
  { code: "inventory.gin", moduleKey: "inventoryOps", label: "Create GIN requests" },
  { code: "inventory.transfer", moduleKey: "inventoryOps", label: "Create transfers" },
  { code: "inventory.adjustment", moduleKey: "inventoryOps", label: "Create adjustments" },
  { code: "inventory.count", moduleKey: "inventoryOps", label: "Run stock counts" },
  { code: "inventory.wastage", moduleKey: "inventoryOps", label: "Record wastage" },
  { code: "master.items", moduleKey: "masterData", label: "Manage items" },
  { code: "master.suppliers", moduleKey: "masterData", label: "Manage suppliers" },
  { code: "master.locations", moduleKey: "masterData", label: "Manage locations" },
  { code: "reports.view", moduleKey: "reports", label: "View reports" },
  { code: "reports.export", moduleKey: "reports", label: "Export reports" },
  { code: "admin.users", moduleKey: "administration", label: "Manage users" },
  { code: "admin.settings", moduleKey: "administration", label: "Manage settings" },
  { code: "admin.activity", moduleKey: "administration", label: "View activity" },
];

const DOCUMENT_PREFIX_BY_KIND: Record<RequestKind, string> = {
  grn: "GRN",
  gin: "GIN",
  transfer: "TRF",
  adjustment: "ADJ",
  "stock-count": "CNT",
  wastage: "WST",
};

let schemaReady: Promise<void> | null = null;

interface CountRow {
  count: number;
}

interface IntegerValueRow {
  value_integer: number | null;
}

interface SequenceRow {
  next_value: number;
}

interface ValueTextRow {
  value_text: string | null;
}

interface InitializationCounts {
  userCount: number;
  locationCount: number;
  settingsCount: number;
}

function numberPart(value: string): number {
  const [, numeric] = value.split("-", 2);
  return Number.parseInt(numeric ?? "0", 10) || 0;
}

function formatPrefixedId(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(SEQUENCE_DEFAULT_WIDTH, "0")}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return new Uint8Array(output.buffer.slice(0));
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function futureIso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

function isPastIso(value: string): boolean {
  return Date.parse(value) <= Date.now();
}

function assertPasswordStrength(password: string) {
  if (password.length < 8) {
    throw new Error("Passwords must be at least 8 characters long.");
  }
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function assertUsername(username: string) {
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error(
      "Usernames must be 3-32 characters and use only letters, numbers, dots, dashes, or underscores.",
    );
  }
}

function fallbackUsername(userId: string): string {
  return `user-${userId.split("-")[1] ?? userId}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function derivePasswordHash(
  password: string,
  saltHex: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(derived));
}

async function hashPassword(password: string): Promise<{
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}> {
  assertPasswordStrength(password);
  const passwordSalt = randomHex(16);
  const passwordIterations = PASSWORD_ITERATIONS;
  return {
    passwordHash: await derivePasswordHash(password, passwordSalt, passwordIterations),
    passwordSalt,
    passwordIterations,
  };
}

async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
  passwordIterations: number,
): Promise<boolean> {
  if (!passwordHash || !passwordSalt || !passwordIterations) {
    return false;
  }

  return (
    (await derivePasswordHash(password, passwordSalt, passwordIterations)) === passwordHash
  );
}

async function execute(
  db: D1Database,
  sql: string,
  bindings: D1Value[] = [],
): Promise<void> {
  await db.prepare(sql).bind(...bindings).run();
}

async function executeScript(db: D1Database, script: string): Promise<void> {
  const statements = script
    .split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const statement of statements) {
    await execute(db, statement);
  }
}

async function first<T>(
  db: D1Database,
  sql: string,
  bindings: D1Value[] = [],
): Promise<T | null> {
  return (await db.prepare(sql).bind(...bindings).first<T>()) ?? null;
}

async function all<T>(
  db: D1Database,
  sql: string,
  bindings: D1Value[] = [],
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

async function scalarCount(db: D1Database, tableName: string): Promise<number> {
  const row = await first<CountRow>(db, `SELECT COUNT(*) AS count FROM ${tableName}`);
  return Number(row?.count ?? 0);
}

async function loadInitializationCounts(db: D1Database): Promise<InitializationCounts> {
  const [userCount, locationCount, settingsCount] = await Promise.all([
    scalarCount(db, "users"),
    scalarCount(db, "locations"),
    scalarCount(db, "app_settings"),
  ]);

  return { userCount, locationCount, settingsCount };
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await first<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  );
  return Boolean(row?.name);
}

async function columnExists(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all<{
    name: string;
  }>();
  return (result.results ?? []).some((row) => row.name === columnName);
}

async function reserveNextId(
  db: D1Database,
  sequenceKey: string,
  prefix: string,
): Promise<string> {
  const now = new Date().toISOString();
  await execute(
    db,
    "INSERT OR IGNORE INTO id_sequences (sequence_key, prefix, next_value, updated_at) VALUES (?, ?, 1, ?)",
    [sequenceKey, prefix, now],
  );

  const row = await first<SequenceRow>(
    db,
    "SELECT next_value FROM id_sequences WHERE sequence_key = ?",
    [sequenceKey],
  );
  const nextValue = Number(row?.next_value ?? 1);

  await execute(
    db,
    "UPDATE id_sequences SET next_value = ?, updated_at = ? WHERE sequence_key = ?",
    [nextValue + 1, now, sequenceKey],
  );

  return formatPrefixedId(prefix, nextValue);
}

async function reserveNextDocumentReference(
  db: D1Database,
  kind: RequestKind,
): Promise<string> {
  const prefix = DOCUMENT_PREFIX_BY_KIND[kind];
  const sequenceKey = `reference:${kind}`;
  const now = new Date().toISOString();

  await execute(
    db,
    "INSERT OR IGNORE INTO id_sequences (sequence_key, prefix, next_value, updated_at) VALUES (?, ?, ?, ?)",
    [sequenceKey, prefix, DOCUMENT_SEQUENCE_START, now],
  );

  const row = await first<SequenceRow>(
    db,
    "SELECT next_value FROM id_sequences WHERE sequence_key = ?",
    [sequenceKey],
  );
  const nextValue = Number(row?.next_value ?? DOCUMENT_SEQUENCE_START);

  await execute(
    db,
    "UPDATE id_sequences SET next_value = ?, updated_at = ? WHERE sequence_key = ?",
    [nextValue + 1, now, sequenceKey],
  );

  return `${prefix}-${nextValue}`;
}

async function currentCursor(db: D1Database): Promise<number> {
  const row = await first<IntegerValueRow>(
    db,
    "SELECT value_integer FROM system_state WHERE key = 'latest_cursor'",
  );
  return Number(row?.value_integer ?? 0);
}

async function initializedAt(db: D1Database): Promise<string | null> {
  const row = await first<ValueTextRow>(
    db,
    "SELECT value_text FROM system_state WHERE key = 'initialized_at'",
  );
  return row?.value_text ?? null;
}

export async function isSystemInitialized(db: D1Database): Promise<boolean> {
  await ensureDatabaseReady(db);
  const { userCount, locationCount, settingsCount } = await loadInitializationCounts(db);
  return userCount > 0 && locationCount > 0 && settingsCount > 0;
}

async function hasOperationalData(db: D1Database): Promise<boolean> {
  const [
    supplierCount,
    itemCount,
    stockCount,
    batchCount,
    requestCount,
    ledgerCount,
    marketPriceCount,
    wasteCount,
    syncEventCount,
  ] = await Promise.all([
    scalarCount(db, "suppliers"),
    scalarCount(db, "items"),
    scalarCount(db, "item_stocks"),
    scalarCount(db, "stock_batches"),
    scalarCount(db, "inventory_requests"),
    scalarCount(db, "movement_ledger"),
    scalarCount(db, "market_price_entries"),
    scalarCount(db, "waste_entries"),
    scalarCount(db, "sync_events"),
  ]);

  return [
    supplierCount,
    itemCount,
    stockCount,
    batchCount,
    requestCount,
    ledgerCount,
    marketPriceCount,
    wasteCount,
    syncEventCount,
  ].some((count) => count > 0);
}

async function resetIncompleteInitialization(db: D1Database): Promise<void> {
  if (await hasOperationalData(db)) {
    throw new Error(
      "OmniStock setup is incomplete and cannot be auto-recovered because operational records already exist. Clear the database or restore from a clean state before retrying initialization.",
    );
  }

  await execute(db, "DELETE FROM user_sessions");
  await execute(db, "DELETE FROM user_location_assignments");
  await execute(db, "DELETE FROM activity_logs");
  await execute(db, "DELETE FROM app_settings");
  await execute(db, "DELETE FROM users");
  await execute(db, "DELETE FROM locations");
  await execute(
    db,
    "DELETE FROM system_state WHERE key IN ('initialized_at', 'latest_cursor')",
  );
}

async function deleteUserSessions(db: D1Database, userId: string): Promise<void> {
  await execute(db, "DELETE FROM user_sessions WHERE user_id = ?", [userId]);
}

export async function loadCurrentCursor(db: D1Database): Promise<number> {
  await ensureDatabaseReady(db);
  return currentCursor(db);
}

function rolePermissions(role: User["role"]): PermissionKey[] {
  return ROLE_PRESETS[role].permissions;
}

function userHasPermission(user: User, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}

function requirePermission(user: User | undefined, permission: PermissionKey, message: string): User {
  if (!user || !userHasPermission(user, permission)) {
    throw new Error(message);
  }

  return user;
}

async function seedReferenceData(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  const roleCount = await scalarCount(db, "roles");

  if (roleCount === 0) {
    for (const [roleCode, preset] of Object.entries(ROLE_PRESETS)) {
      await execute(
        db,
        "INSERT INTO roles (code, label, description, created_at) VALUES (?, ?, ?, ?)",
        [roleCode, preset.label, preset.description, now],
      );
    }

    for (const permission of PERMISSION_CATALOG) {
      await execute(
        db,
        "INSERT INTO permissions (code, module_key, label, created_at) VALUES (?, ?, ?, ?)",
        [permission.code, permission.moduleKey, permission.label, now],
      );
    }

    for (const [roleCode, preset] of Object.entries(ROLE_PRESETS)) {
      for (const permissionCode of preset.permissions) {
        await execute(
          db,
          "INSERT INTO role_permissions (role_code, permission_code, created_at) VALUES (?, ?, ?)",
          [roleCode, permissionCode, now],
        );
      }
    }
  }

  await execute(
    db,
    "INSERT OR IGNORE INTO system_state (key, value_integer, value_text, updated_at) VALUES ('latest_cursor', 0, NULL, ?)",
    [now],
  );
}

async function ensureLatestSchema(db: D1Database): Promise<void> {
  if (!(await columnExists(db, "users", "username"))) {
    await execute(db, "ALTER TABLE users ADD COLUMN username TEXT");
  }
  if (!(await columnExists(db, "users", "password_hash"))) {
    await execute(db, "ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  }
  if (!(await columnExists(db, "users", "password_salt"))) {
    await execute(db, "ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''");
  }
  if (!(await columnExists(db, "users", "password_iterations"))) {
    await execute(
      db,
      `ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT ${PASSWORD_ITERATIONS}`,
    );
  }

  if (!(await tableExists(db, "user_sessions"))) {
    await executeScript(
      db,
      `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        sequence_no INTEGER NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) STRICT;
    `,
    );
  }

  if (!(await tableExists(db, "stock_batches"))) {
    await executeScript(
      db,
      `
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
    `,
    );
  }

  if (!(await columnExists(db, "inventory_request_lines", "lot_code"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN lot_code TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "expiry_date"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN expiry_date TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "received_at"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN received_at TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "allocation_summary"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN allocation_summary TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "waste_reason"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN waste_reason TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "waste_shift"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN waste_shift TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "waste_station"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN waste_station TEXT");
  }
  if (!(await columnExists(db, "inventory_requests", "deleted_at"))) {
    await execute(db, "ALTER TABLE inventory_requests ADD COLUMN deleted_at TEXT");
  }
  if (!(await columnExists(db, "inventory_requests", "deleted_by"))) {
    await execute(db, "ALTER TABLE inventory_requests ADD COLUMN deleted_by TEXT");
  }
  if (!(await columnExists(db, "movement_ledger", "allocation_summary"))) {
    await execute(db, "ALTER TABLE movement_ledger ADD COLUMN allocation_summary TEXT");
  }
  if (!(await columnExists(db, "app_settings", "expiry_alert_days"))) {
    await execute(
      db,
      "ALTER TABLE app_settings ADD COLUMN expiry_alert_days INTEGER NOT NULL DEFAULT 14",
    );
  }
  if (!(await columnExists(db, "app_settings", "strict_fefo"))) {
    await execute(
      db,
      "ALTER TABLE app_settings ADD COLUMN strict_fefo INTEGER NOT NULL DEFAULT 1",
    );
  }
  if (!(await tableExists(db, "market_price_entries"))) {
    await executeScript(
      db,
      `
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
    `,
    );
  }
  if (!(await tableExists(db, "waste_entries"))) {
    await executeScript(
      db,
      `
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
    `,
    );
  }

  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_stock_batches_item_location_expiry ON stock_batches(item_id, location_id, expiry_date)",
  );
  await execute(db, "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)");
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_inventory_request_lines_waste_reason ON inventory_request_lines(waste_reason)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_market_price_entries_item_location_date ON market_price_entries(item_id, location_id, market_date DESC)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_market_price_entries_category_date ON market_price_entries(category, market_date DESC)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_waste_entries_location_created_at ON waste_entries(location_id, created_at DESC)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_waste_entries_reason_created_at ON waste_entries(reason, created_at DESC)",
  );

  const usersMissingUsername = await all<{ id: string }>(
    db,
    "SELECT id FROM users WHERE username IS NULL OR trim(username) = '' ORDER BY sequence_no ASC",
  );
  for (const user of usersMissingUsername) {
    await execute(db, "UPDATE users SET username = ? WHERE id = ?", [
      fallbackUsername(user.id),
      user.id,
    ]);
  }

  await execute(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
}

async function initializeDatabase(db: D1Database): Promise<void> {
  const usersTableExists = await tableExists(db, "users");
  if (!usersTableExists) {
    await executeScript(db, OMNISTOCK_D1_SCHEMA_SQL);
  }

  await ensureLatestSchema(db);
  await seedReferenceData(db);
}

export async function ensureDatabaseReady(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = initializeDatabase(db).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
}

interface UserRow {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role_code: User["role"];
  status: User["status"];
  password_hash?: string;
  password_salt?: string;
  password_iterations?: number;
  last_seen_at: string;
}

interface SessionRow {
  user_id: string;
  expires_at: string;
}

interface UserPermissionRow {
  user_id: string;
  permission_code: PermissionKey;
}

interface UserLocationRow {
  user_id: string;
  location_id: string;
}

interface ItemRow {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  supplier_id: string;
  cost_price: number;
  selling_price: number;
  status: Item["status"];
  updated_at: string;
}

interface ItemStockRow {
  item_id: string;
  location_id: string;
  on_hand: number;
  reserved: number;
  min_level: number;
  max_level: number;
}

interface StockBatchRow {
  id: string;
  item_id: string;
  location_id: string;
  lot_code: string;
  quantity: number;
  received_at: string;
  expiry_date: string | null;
}

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  lead_time_days: number;
  status: Supplier["status"];
}

interface LocationRow {
  id: string;
  code: string;
  name: string;
  type: Location["type"];
  city: string;
  status: Location["status"];
}

interface RequestRow {
  id: string;
  reference: string;
  kind: RequestKind;
  status: "draft" | "submitted" | "posted" | "rejected";
  item_id: string;
  item_name: string;
  barcode: string;
  quantity: number;
  counted_quantity: number | null;
  lot_code: string | null;
  expiry_date: string | null;
  received_at: string | null;
  allocation_summary: string | null;
  waste_reason: WasteEntry["reason"] | null;
  waste_shift: WasteEntry["shift"] | null;
  waste_station: string | null;
  unit: string;
  supplier_id: string | null;
  supplier_name: string | null;
  from_location_id: string | null;
  from_location_name: string | null;
  to_location_id: string | null;
  to_location_name: string | null;
  note: string;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
}

interface InventoryRequestActionRow {
  id: string;
  reference: string;
  kind: RequestKind;
  status: InventoryRequest["status"];
  item_id: string;
  barcode: string;
  quantity: number;
  counted_quantity: number | null;
  lot_code: string | null;
  expiry_date: string | null;
  received_at: string | null;
  waste_reason: WasteEntry["reason"] | null;
  waste_shift: WasteEntry["shift"] | null;
  waste_station: string | null;
  unit: string;
  supplier_id: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  note: string;
  requested_by: string;
  requested_at: string;
}

interface MarketPriceRow {
  id: string;
  market_date: string;
  category: MarketPriceEntry["category"];
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  unit: string;
  quoted_price: number;
  previous_price: number | null;
  variance_pct: number | null;
  source_name: string;
  note: string;
  captured_by: string;
  captured_by_name: string;
  created_at: string;
}

interface WasteEntryRow {
  id: string;
  request_id: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  quantity: number;
  unit: string;
  reason: WasteEntry["reason"];
  shift_key: WasteEntry["shift"];
  station: string;
  batch_lot_code: string | null;
  expiry_date: string | null;
  estimated_cost: number;
  reported_by: string;
  reported_by_name: string;
  created_at: string;
  note: string;
}

interface LedgerRow {
  id: string;
  reference: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location_name: string;
  change_type: RequestKind;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  actor_id: string;
  actor_name: string;
  created_at: string;
  allocation_summary: string | null;
  note: string;
}

interface ActivityRow {
  id: string;
  seq: number;
  title: string;
  detail: string;
  actor_id: string;
  actor_name: string;
  created_at: string;
  module_key: ActivityLog["module"];
  severity: ActivityLog["severity"];
}

interface SettingsRow {
  company_name: string;
  currency: string;
  timezone: string;
  low_stock_threshold: number;
  expiry_alert_days: number;
  enable_offline: number;
  enable_realtime: number;
  enable_barcode: number;
  strict_fefo: number;
}

interface ExistingEventRow {
  payload_json: string;
}

function mapBatchesByStock(batchRows: StockBatchRow[]): Map<string, StockBatch[]> {
  const map = new Map<string, StockBatch[]>();
  for (const row of batchRows) {
    const key = `${row.item_id}:${row.location_id}`;
    const current = map.get(key) ?? [];
    current.push({
      id: row.id,
      locationId: row.location_id,
      lotCode: row.lot_code,
      quantity: Number(row.quantity),
      receivedAt: row.received_at,
      expiryDate: row.expiry_date ?? undefined,
    });
    map.set(key, current);
  }
  return map;
}

function mapStocksByItem(
  stockRows: ItemStockRow[],
  batchMap: Map<string, StockBatch[]>,
): Map<string, ItemStock[]> {
  const map = new Map<string, ItemStock[]>();
  for (const row of stockRows) {
    const current = map.get(row.item_id) ?? [];
    const key = `${row.item_id}:${row.location_id}`;
    const fallbackBatches =
      Number(row.on_hand) > 0
        ? [
            {
              id: `${row.item_id}-${row.location_id}-legacy`,
              locationId: row.location_id,
              lotCode: "LEGACY-STOCK",
              quantity: Number(row.on_hand),
              receivedAt: "1970-01-01T00:00:00.000Z",
            } satisfies StockBatch,
          ]
        : [];
    current.push({
      locationId: row.location_id,
      onHand: Number(row.on_hand),
      reserved: Number(row.reserved),
      minLevel: Number(row.min_level),
      maxLevel: Number(row.max_level),
      batches: batchMap.get(key) ?? fallbackBatches,
    });
    map.set(row.item_id, current);
  }
  return map;
}

function groupValues(rows: Array<{ user_id: string; value: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const current = map.get(row.user_id) ?? [];
    current.push(row.value);
    map.set(row.user_id, current);
  }
  return map;
}

export async function loadSnapshot(db: D1Database): Promise<InventorySnapshot> {
  await ensureDatabaseReady(db);

  const [
    locationRows,
    supplierRows,
    itemRows,
    stockRows,
    batchRows,
    userRows,
    permissionRows,
    assignmentRows,
    requestRows,
    marketPriceRows,
    wasteEntryRows,
    ledgerRows,
    activityRows,
    settingsRow,
  ] = await Promise.all([
    all<LocationRow>(
      db,
      "SELECT id, code, name, type, city, status FROM locations ORDER BY sequence_no ASC",
    ),
    all<SupplierRow>(
      db,
      "SELECT id, code, name, email, phone, lead_time_days, status FROM suppliers ORDER BY sequence_no ASC",
    ),
    all<ItemRow>(
      db,
      "SELECT id, sku, barcode, name, category, unit, supplier_id, cost_price, selling_price, status, updated_at FROM items ORDER BY sequence_no ASC",
    ),
    all<ItemStockRow>(
      db,
      "SELECT item_id, location_id, on_hand, reserved, min_level, max_level FROM item_stocks ORDER BY item_id, location_id",
    ),
    all<StockBatchRow>(
      db,
      "SELECT id, item_id, location_id, lot_code, quantity, received_at, expiry_date FROM stock_batches ORDER BY item_id, location_id, expiry_date, received_at",
    ),
    all<UserRow>(
      db,
      "SELECT id, name, username, email, role_code, status, last_seen_at FROM users ORDER BY sequence_no ASC",
    ),
    all<UserPermissionRow>(
      db,
      "SELECT u.id AS user_id, rp.permission_code AS permission_code FROM users u JOIN role_permissions rp ON rp.role_code = u.role_code ORDER BY u.sequence_no ASC",
    ),
    all<UserLocationRow>(
      db,
      "SELECT user_id, location_id FROM user_location_assignments ORDER BY user_id, location_id",
    ),
    all<RequestRow>(
      db,
      `SELECT
        r.id,
        r.reference,
        r.kind,
        r.status,
        rl.item_id,
        i.name AS item_name,
        rl.barcode,
        rl.quantity,
        rl.counted_quantity,
        rl.lot_code,
        rl.expiry_date,
        rl.received_at,
        rl.allocation_summary,
        rl.waste_reason,
        rl.waste_shift,
        rl.waste_station,
        rl.unit,
        r.supplier_id,
        s.name AS supplier_name,
        r.from_location_id,
        lf.name AS from_location_name,
        r.to_location_id,
        lt.name AS to_location_name,
        r.note,
        r.requested_by,
        u.name AS requested_by_name,
        r.requested_at
      FROM inventory_requests r
      JOIN inventory_request_lines rl ON rl.request_id = r.id AND rl.line_no = 1
      JOIN items i ON i.id = rl.item_id
      JOIN users u ON u.id = r.requested_by
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      LEFT JOIN locations lf ON lf.id = r.from_location_id
      LEFT JOIN locations lt ON lt.id = r.to_location_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.requested_at DESC, r.sequence_no DESC
      LIMIT 160`,
    ),
    all<MarketPriceRow>(
      db,
      `SELECT
        mp.id,
        mp.market_date,
        mp.category,
        mp.item_id,
        i.name AS item_name,
        mp.location_id,
        l.name AS location_name,
        mp.supplier_id,
        s.name AS supplier_name,
        mp.unit,
        mp.quoted_price,
        mp.previous_price,
        mp.variance_pct,
        mp.source_name,
        mp.note,
        mp.captured_by,
        u.name AS captured_by_name,
        mp.created_at
      FROM market_price_entries mp
      JOIN items i ON i.id = mp.item_id
      JOIN locations l ON l.id = mp.location_id
      JOIN users u ON u.id = mp.captured_by
      LEFT JOIN suppliers s ON s.id = mp.supplier_id
      ORDER BY mp.market_date DESC, mp.created_at DESC, mp.sequence_no DESC
      LIMIT 180`,
    ),
    all<WasteEntryRow>(
      db,
      `SELECT
        we.id,
        we.request_id,
        we.item_id,
        i.name AS item_name,
        we.location_id,
        l.name AS location_name,
        we.quantity,
        we.unit,
        we.reason,
        we.shift_key,
        we.station,
        we.batch_lot_code,
        we.expiry_date,
        we.estimated_cost,
        we.reported_by,
        u.name AS reported_by_name,
        we.created_at,
        we.note
      FROM waste_entries we
      JOIN items i ON i.id = we.item_id
      JOIN locations l ON l.id = we.location_id
      JOIN users u ON u.id = we.reported_by
      ORDER BY we.created_at DESC, we.sequence_no DESC
      LIMIT 160`,
    ),
    all<LedgerRow>(
      db,
      `SELECT
        ml.id,
        ml.reference,
        ml.item_id,
        i.name AS item_name,
        ml.location_id,
        l.name AS location_name,
        ml.change_type,
        ml.quantity_before,
        ml.quantity_change,
        ml.quantity_after,
        ml.actor_id,
        u.name AS actor_name,
        ml.created_at,
        ml.allocation_summary,
        ml.note
      FROM movement_ledger ml
      JOIN items i ON i.id = ml.item_id
      JOIN locations l ON l.id = ml.location_id
      JOIN users u ON u.id = ml.actor_id
      ORDER BY ml.created_at DESC, ml.sequence_no DESC
      LIMIT 400`,
    ),
    all<ActivityRow>(
      db,
      `SELECT
        al.id,
        al.seq,
        al.title,
        al.detail,
        al.actor_id,
        u.name AS actor_name,
        al.created_at,
        al.module_key,
        al.severity
      FROM activity_logs al
      JOIN users u ON u.id = al.actor_id
      ORDER BY al.created_at DESC, al.sequence_no DESC
      LIMIT 160`,
    ),
    first<SettingsRow>(
      db,
      "SELECT company_name, currency, timezone, low_stock_threshold, expiry_alert_days, enable_offline, enable_realtime, enable_barcode, strict_fefo FROM app_settings LIMIT 1",
    ),
  ]);

  const cursor = await currentCursor(db);
  const batchMap = mapBatchesByStock(batchRows);
  const stockMap = mapStocksByItem(stockRows, batchMap);
  const assignmentMap = groupValues(
    assignmentRows.map((row) => ({ user_id: row.user_id, value: row.location_id })),
  );
  const permissionMap = groupValues(
    permissionRows.map((row) => ({ user_id: row.user_id, value: row.permission_code })),
  );

  return {
    generatedAt: new Date().toISOString(),
    syncCursor: cursor,
    locations: locationRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      city: row.city,
      status: row.status,
    })),
    suppliers: supplierRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      email: row.email,
      phone: row.phone,
      leadTimeDays: Number(row.lead_time_days),
      status: row.status,
    })),
    marketPrices: marketPriceRows.map((row) => ({
      id: row.id,
      marketDate: row.market_date,
      category: row.category,
      itemId: row.item_id,
      itemName: row.item_name,
      locationId: row.location_id,
      locationName: row.location_name,
      supplierId: row.supplier_id ?? undefined,
      supplierName: row.supplier_name ?? undefined,
      unit: row.unit,
      quotedPrice: Number(row.quoted_price),
      previousPrice: row.previous_price === null ? undefined : Number(row.previous_price),
      variancePct: row.variance_pct === null ? undefined : Number(row.variance_pct),
      sourceName: row.source_name,
      note: row.note,
      capturedBy: row.captured_by,
      capturedByName: row.captured_by_name,
      createdAt: row.created_at,
    })),
    wasteEntries: wasteEntryRows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      itemId: row.item_id,
      itemName: row.item_name,
      locationId: row.location_id,
      locationName: row.location_name,
      quantity: Number(row.quantity),
      unit: row.unit,
      reason: row.reason,
      shift: row.shift_key,
      station: row.station,
      batchLotCode: row.batch_lot_code ?? undefined,
      expiryDate: row.expiry_date ?? undefined,
      estimatedCost: Number(row.estimated_cost),
      reportedBy: row.reported_by,
      reportedByName: row.reported_by_name,
      createdAt: row.created_at,
      note: row.note,
    })),
    items: itemRows.map((row) => ({
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      category: row.category,
      unit: row.unit,
      supplierId: row.supplier_id,
      costPrice: Number(row.cost_price),
      sellingPrice: Number(row.selling_price),
      status: row.status,
      stocks: stockMap.get(row.id) ?? [],
      updatedAt: row.updated_at,
    })),
    users: userRows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username || fallbackUsername(row.id),
      email: row.email,
      role: row.role_code,
      permissions: permissionMap.get(row.id)?.map((permission) => permission as PermissionKey) ?? rolePermissions(row.role_code),
      assignedLocationIds: assignmentMap.get(row.id) ?? [],
      status: row.status,
      lastSeenAt: row.last_seen_at,
    })),
    requests: requestRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      kind: row.kind,
      status: row.status,
      itemId: row.item_id,
      itemName: row.item_name,
      barcode: row.barcode,
      quantity: Number(row.counted_quantity ?? row.quantity),
      lotCode: row.lot_code ?? undefined,
      expiryDate: row.expiry_date ?? undefined,
      receivedDate: row.received_at ?? undefined,
      allocationSummary: row.allocation_summary ?? undefined,
      wasteReason: row.waste_reason ?? undefined,
      wasteShift: row.waste_shift ?? undefined,
      wasteStation: row.waste_station ?? undefined,
      unit: row.unit,
      supplierId: row.supplier_id ?? undefined,
      supplierName: row.supplier_name ?? undefined,
      fromLocationId: row.from_location_id ?? undefined,
      fromLocationName: row.from_location_name ?? undefined,
      toLocationId: row.to_location_id ?? undefined,
      toLocationName: row.to_location_name ?? undefined,
      note: row.note,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name,
      requestedAt: row.requested_at,
    })),
    movementLedger: ledgerRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      itemId: row.item_id,
      itemName: row.item_name,
      locationId: row.location_id,
      locationName: row.location_name,
      changeType: row.change_type,
      quantityBefore: Number(row.quantity_before),
      quantityChange: Number(row.quantity_change),
      quantityAfter: Number(row.quantity_after),
      actorId: row.actor_id,
      actorName: row.actor_name,
      createdAt: row.created_at,
      allocationSummary: row.allocation_summary ?? undefined,
      note: row.note,
    })),
    activity: activityRows.map((row) => ({
      id: row.id,
      seq: Number(row.seq),
      title: row.title,
      detail: row.detail,
      actorId: row.actor_id,
      actorName: row.actor_name,
      createdAt: row.created_at,
      module: row.module_key,
      severity: row.severity,
    })),
    settings: {
      companyName: settingsRow?.company_name ?? "OmniStock",
      currency: settingsRow?.currency ?? "PKR",
      timezone: settingsRow?.timezone ?? "Asia/Karachi",
      lowStockThreshold: Number(settingsRow?.low_stock_threshold ?? 1),
      expiryAlertDays: Number(settingsRow?.expiry_alert_days ?? 14),
      enableOffline: Boolean(settingsRow?.enable_offline ?? 1),
      enableRealtime: Boolean(settingsRow?.enable_realtime ?? 1),
      enableBarcode: Boolean(settingsRow?.enable_barcode ?? 1),
      strictFefo: Boolean(settingsRow?.strict_fefo ?? 1),
    },
  };
}

export async function loadBootstrapPayload(
  db: D1Database,
  userId?: string,
): Promise<BootstrapPayload> {
  const snapshot = await loadSnapshot(db);
  const payload = buildBootstrapPayload(snapshot, userId);
  return {
    ...payload,
    initialization: {
      ...payload.initialization,
      completedAt: await initializedAt(db) ?? undefined,
    },
  };
}

async function userExistsByEmail(
  db: D1Database,
  email: string,
  excludeUserId?: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    `SELECT id FROM users WHERE email = ? ${excludeUserId ? "AND id <> ?" : ""} LIMIT 1`,
    excludeUserId ? [email, excludeUserId] : [email],
  );
  return Boolean(row?.id);
}

async function userExistsByUsername(
  db: D1Database,
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    `SELECT id FROM users WHERE username = ? ${excludeUserId ? "AND id <> ?" : ""} LIMIT 1`,
    excludeUserId ? [username, excludeUserId] : [username],
  );
  return Boolean(row?.id);
}

async function itemExistsBySku(
  db: D1Database,
  sku: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(db, "SELECT id FROM items WHERE sku = ? LIMIT 1", [sku]);
  return Boolean(row?.id);
}

async function itemExistsBySkuExcludingId(
  db: D1Database,
  sku: string,
  itemId: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM items WHERE sku = ? AND id <> ? LIMIT 1",
    [sku, itemId],
  );
  return Boolean(row?.id);
}

async function itemExistsByBarcode(
  db: D1Database,
  barcode: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM items WHERE barcode = ? LIMIT 1",
    [barcode],
  );
  return Boolean(row?.id);
}

async function itemExistsByBarcodeExcludingId(
  db: D1Database,
  barcode: string,
  itemId: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM items WHERE barcode = ? AND id <> ? LIMIT 1",
    [barcode, itemId],
  );
  return Boolean(row?.id);
}

async function supplierExistsByCode(
  db: D1Database,
  code: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM suppliers WHERE code = ? LIMIT 1",
    [code],
  );
  return Boolean(row?.id);
}

async function supplierExistsByCodeExcludingId(
  db: D1Database,
  code: string,
  supplierId: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM suppliers WHERE code = ? AND id <> ? LIMIT 1",
    [code, supplierId],
  );
  return Boolean(row?.id);
}

async function locationExistsByCode(
  db: D1Database,
  code: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM locations WHERE code = ? LIMIT 1",
    [code],
  );
  return Boolean(row?.id);
}

async function locationExistsByCodeExcludingId(
  db: D1Database,
  code: string,
  locationId: string,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    "SELECT id FROM locations WHERE code = ? AND id <> ? LIMIT 1",
    [code, locationId],
  );
  return Boolean(row?.id);
}

function inventoryPermissionForKind(kind: RequestKind): PermissionKey {
  switch (kind) {
    case "grn":
      return "inventory.grn";
    case "gin":
      return "inventory.gin";
    case "transfer":
      return "inventory.transfer";
    case "adjustment":
      return "inventory.adjustment";
    case "stock-count":
      return "inventory.count";
    case "wastage":
      return "inventory.wastage";
  }
}

async function countSuperadmins(db: D1Database, excludeUserId?: string): Promise<number> {
  const row = await first<CountRow>(
    db,
    `SELECT COUNT(*) AS count FROM users WHERE role_code = 'superadmin' AND status = 'active' ${
      excludeUserId ? "AND id <> ?" : ""
    }`,
    excludeUserId ? [excludeUserId] : [],
  );
  return Number(row?.count ?? 0);
}

async function hasUserHistory(db: D1Database, userId: string): Promise<boolean> {
  const [requests, activity, marketPrices, waste, sessions] = await Promise.all([
    first<CountRow>(db, "SELECT COUNT(*) AS count FROM inventory_requests WHERE requested_by = ?", [userId]),
    first<CountRow>(db, "SELECT COUNT(*) AS count FROM activity_logs WHERE actor_id = ?", [userId]),
    first<CountRow>(db, "SELECT COUNT(*) AS count FROM market_price_entries WHERE captured_by = ?", [userId]),
    first<CountRow>(db, "SELECT COUNT(*) AS count FROM waste_entries WHERE reported_by = ?", [userId]),
    first<CountRow>(db, "SELECT COUNT(*) AS count FROM movement_ledger WHERE actor_id = ?", [userId]),
  ]);
  return [requests, activity, marketPrices, waste, sessions].some(
    (row) => Number(row?.count ?? 0) > 0,
  );
}

async function appendActivity(
  db: D1Database,
  actorId: string,
  moduleKey: "administration" | "masterData",
  title: string,
  detail: string,
): Promise<void> {
  const cursor = await currentCursor(db);
  const activityId = await reserveNextId(db, "activity_logs", "act");
  const nextSeq = cursor + 1;
  const createdAt = new Date().toISOString();
  await execute(
    db,
    "INSERT INTO activity_logs (id, sequence_no, seq, title, detail, actor_id, module_key, severity, related_request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'success', NULL, ?)",
    [activityId, numberPart(activityId), nextSeq, title, detail, actorId, moduleKey, createdAt],
  );
  await execute(
    db,
    "UPDATE system_state SET value_integer = ?, updated_at = ? WHERE key = 'latest_cursor'",
    [nextSeq, createdAt],
  );
}

async function appendAdminActivity(
  db: D1Database,
  actorId: string,
  title: string,
  detail: string,
): Promise<void> {
  await appendActivity(db, actorId, "administration", title, detail);
}

async function issueSessionForUser(db: D1Database, userId: string): Promise<string> {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const sessionId = await reserveNextId(db, "user_sessions", "ses");
  const createdAt = new Date().toISOString();
  const expiresAt = futureIso(SESSION_TTL_MS);
  await execute(
    db,
    "INSERT INTO user_sessions (id, sequence_no, user_id, token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [sessionId, numberPart(sessionId), userId, tokenHash, expiresAt, createdAt, createdAt],
  );
  await execute(db, "UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?", [
    createdAt,
    createdAt,
    userId,
  ]);
  return token;
}

export async function authenticateUserInD1(
  db: D1Database,
  input: LoginRequest,
): Promise<{ token: string; response: LoginResponse }> {
  await ensureDatabaseReady(db);
  const identifier = input.identifier.trim().toLowerCase();
  const user = await first<UserRow>(
    db,
    "SELECT id, username, email, role_code, status, password_hash, password_salt, password_iterations, name, last_seen_at FROM users WHERE email = ? OR username = ? LIMIT 1",
    [identifier, identifier],
  );

  if (!user || user.status !== "active") {
    throw new Error("Invalid username, email, or password.");
  }

  const passwordValid = await verifyPassword(
    input.password,
    user.password_hash ?? "",
    user.password_salt ?? "",
    Number(user.password_iterations ?? 0),
  );
  if (!passwordValid) {
    throw new Error("Invalid username, email, or password.");
  }

  const token = await issueSessionForUser(db, user.id);
  return {
    token,
    response: {
      payload: await loadBootstrapPayload(db, user.id),
    },
  };
}

export async function activateLegacySuperadminInD1(
  db: D1Database,
  input: ActivateSuperadminRequest,
): Promise<{ token: string; response: LoginResponse }> {
  await ensureDatabaseReady(db);
  const identifier = input.identifier.trim().toLowerCase();
  const user = await first<UserRow>(
    db,
    "SELECT id, username, status, role_code, password_hash FROM users WHERE email = ? OR username = ? LIMIT 1",
    [identifier, identifier],
  );

  if (!user || user.role_code !== "superadmin" || user.status !== "active") {
    throw new Error("No active superadmin account could be activated with that username or email.");
  }
  if (user.password_hash) {
    throw new Error("This superadmin account already has a password. Use normal login.");
  }

  const hashed = await hashPassword(input.password);
  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?",
    [hashed.passwordHash, hashed.passwordSalt, hashed.passwordIterations, now, user.id],
  );

  const token = await issueSessionForUser(db, user.id);
  return {
    token,
    response: {
      payload: await loadBootstrapPayload(db, user.id),
    },
  };
}

export async function loadUserIdForSessionToken(
  db: D1Database,
  token: string,
): Promise<string | null> {
  await ensureDatabaseReady(db);
  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const session = await first<SessionRow>(
    db,
    "SELECT user_id, expires_at FROM user_sessions WHERE token_hash = ? LIMIT 1",
    [tokenHash],
  );
  if (!session) {
    return null;
  }
  if (isPastIso(session.expires_at)) {
    await execute(db, "DELETE FROM user_sessions WHERE token_hash = ?", [tokenHash]);
    return null;
  }

  const user = await first<{ id: string; status: User["status"] }>(
    db,
    "SELECT id, status FROM users WHERE id = ? LIMIT 1",
    [session.user_id],
  );
  if (!user || user.status !== "active") {
    await execute(db, "DELETE FROM user_sessions WHERE token_hash = ?", [tokenHash]);
    return null;
  }

  const now = new Date().toISOString();
  await execute(db, "UPDATE user_sessions SET updated_at = ? WHERE token_hash = ?", [now, tokenHash]);
  await execute(db, "UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?", [
    now,
    now,
    user.id,
  ]);
  return user.id;
}

export async function logoutSessionInD1(db: D1Database, token: string): Promise<void> {
  await ensureDatabaseReady(db);
  if (!token) {
    return;
  }
  await execute(db, "DELETE FROM user_sessions WHERE token_hash = ?", [await sha256Hex(token)]);
}

export async function updateOwnProfileInD1(
  db: D1Database,
  userId: string,
  input: UpdateOwnProfileRequest,
): Promise<ProfileResponse> {
  await ensureDatabaseReady(db);

  const user = await first<{ id: string; status: User["status"] }>(
    db,
    "SELECT id, status FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  if (!user || user.status !== "active") {
    throw new Error("The signed-in user could not be found.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Your display name cannot be blank.");
  }

  const now = new Date().toISOString();
  await execute(db, "UPDATE users SET name = ?, updated_at = ? WHERE id = ?", [name, now, userId]);

  return {
    payload: await loadBootstrapPayload(db, userId),
  };
}

export async function changeOwnPasswordInD1(
  db: D1Database,
  userId: string,
  input: ChangeOwnPasswordRequest,
): Promise<{ token: string; response: ProfileResponse }> {
  await ensureDatabaseReady(db);

  const user = await first<UserRow>(
    db,
    "SELECT id, status, password_hash, password_salt, password_iterations FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  if (!user || user.status !== "active") {
    throw new Error("The signed-in user could not be found.");
  }

  const currentPassword = input.oldPassword;
  const newPassword = input.newPassword;
  const currentPasswordValid = await verifyPassword(
    currentPassword,
    user.password_hash ?? "",
    user.password_salt ?? "",
    Number(user.password_iterations ?? 0),
  );
  if (!currentPasswordValid) {
    throw new Error("Your current password is incorrect.");
  }
  if (currentPassword === newPassword) {
    throw new Error("Choose a new password that is different from your current password.");
  }

  const hashed = await hashPassword(newPassword);
  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?",
    [hashed.passwordHash, hashed.passwordSalt, hashed.passwordIterations, now, userId],
  );

  await deleteUserSessions(db, userId);
  const token = await issueSessionForUser(db, userId);

  return {
    token,
    response: {
      payload: await loadBootstrapPayload(db, userId),
    },
  };
}

export async function createUserInD1(
  db: D1Database,
  actorId: string,
  input: CreateUserRequest,
): Promise<UserAdminResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = snapshot.users.find((user) => user.id === actorId);
  if (!actor || actor.role !== "superadmin") {
    throw new Error("Only superadmin users can create user accounts.");
  }

  const username = normalizeUsername(input.username);
  assertUsername(username);
  const email = input.email.trim().toLowerCase();
  if (await userExistsByUsername(db, username)) {
    throw new Error("Another user already exists with that username.");
  }
  if (await userExistsByEmail(db, email)) {
    throw new Error("Another user already exists with that email.");
  }

  const hashed = await hashPassword(input.password);
  const id = await reserveNextId(db, "users", "usr");
  const now = new Date().toISOString();
  const assignedLocationIds = [...new Set(input.assignedLocationIds)];

  await execute(
    db,
    "INSERT INTO users (id, sequence_no, name, username, email, role_code, status, password_hash, password_salt, password_iterations, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      numberPart(id),
      input.name.trim(),
      username,
      email,
      input.role,
      input.status ?? "active",
      hashed.passwordHash,
      hashed.passwordSalt,
      hashed.passwordIterations,
      now,
      now,
      now,
    ],
  );

  for (const locationId of assignedLocationIds) {
    await execute(
      db,
      "INSERT INTO user_location_assignments (user_id, location_id, created_at) VALUES (?, ?, ?)",
      [id, locationId, now],
    );
  }

  await appendAdminActivity(
    db,
    actorId,
    "User created",
    `${input.name.trim()} was added as ${input.role}.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function updateUserInD1(
  db: D1Database,
  actorId: string,
  input: UpdateUserRequest,
): Promise<UserAdminResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = snapshot.users.find((user) => user.id === actorId);
  const target = snapshot.users.find((user) => user.id === input.userId);
  if (!actor || actor.role !== "superadmin") {
    throw new Error("Only superadmin users can edit user accounts.");
  }
  if (!target) {
    throw new Error("The selected user could not be found.");
  }

  const username = normalizeUsername(input.username);
  assertUsername(username);
  const email = input.email.trim().toLowerCase();
  if (await userExistsByUsername(db, username, input.userId)) {
    throw new Error("Another user already exists with that username.");
  }
  if (await userExistsByEmail(db, email, input.userId)) {
    throw new Error("Another user already exists with that email.");
  }
  if (
    target.role === "superadmin" &&
    (input.role !== "superadmin" || input.status !== "active") &&
    (await countSuperadmins(db, input.userId)) === 0
  ) {
    throw new Error("At least one active superadmin must remain in the system.");
  }

  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE users SET name = ?, username = ?, email = ?, role_code = ?, status = ?, updated_at = ? WHERE id = ?",
    [
      input.name.trim(),
      username,
      email,
      input.role,
      input.status === "archived" ? "invited" : input.status,
      now,
      input.userId,
    ],
  );
  await execute(db, "DELETE FROM user_location_assignments WHERE user_id = ?", [input.userId]);
  for (const locationId of [...new Set(input.assignedLocationIds)]) {
    await execute(
      db,
      "INSERT INTO user_location_assignments (user_id, location_id, created_at) VALUES (?, ?, ?)",
      [input.userId, locationId, now],
    );
  }

  if (input.status !== "active") {
    await deleteUserSessions(db, input.userId);
  }

  await appendAdminActivity(
    db,
    actorId,
    "User updated",
    `${input.name.trim()} was updated by superadmin.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function resetUserPasswordInD1(
  db: D1Database,
  actorId: string,
  input: ResetUserPasswordRequest,
): Promise<UserAdminResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = snapshot.users.find((user) => user.id === actorId);
  const target = snapshot.users.find((user) => user.id === input.userId);
  if (!actor || actor.role !== "superadmin") {
    throw new Error("Only superadmin users can reset passwords.");
  }
  if (!target) {
    throw new Error("The selected user could not be found.");
  }

  const hashed = await hashPassword(input.newPassword);
  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?",
    [hashed.passwordHash, hashed.passwordSalt, hashed.passwordIterations, now, input.userId],
  );
  await deleteUserSessions(db, input.userId);
  await appendAdminActivity(
    db,
    actorId,
    "Password reset",
    `Password access was reset for ${target.name}.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function removeUserInD1(
  db: D1Database,
  actorId: string,
  input: RemoveUserRequest,
): Promise<UserAdminResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = snapshot.users.find((user) => user.id === actorId);
  const target = snapshot.users.find((user) => user.id === input.userId);
  if (!actor || actor.role !== "superadmin") {
    throw new Error("Only superadmin users can remove accounts.");
  }
  if (!target) {
    throw new Error("The selected user could not be found.");
  }
  if (target.id === actorId) {
    throw new Error("Superadmin users cannot remove their own active account.");
  }
  if (target.role === "superadmin" && (await countSuperadmins(db, input.userId)) === 0) {
    throw new Error("At least one active superadmin must remain in the system.");
  }

  const now = new Date().toISOString();
  const hasHistory = await hasUserHistory(db, input.userId);
  await deleteUserSessions(db, input.userId);

  if (hasHistory) {
    const anonymizedEmail = `removed+${input.userId}+${Date.now()}@omnistock.local`;
    const anonymizedUsername = `removed-${input.userId}-${Date.now()}`;
    await execute(
      db,
      "UPDATE users SET status = 'invited', username = ?, email = ?, updated_at = ? WHERE id = ?",
      [anonymizedUsername, anonymizedEmail, now, input.userId],
    );
    await execute(db, "DELETE FROM user_location_assignments WHERE user_id = ?", [input.userId]);
  } else {
    await execute(db, "DELETE FROM user_location_assignments WHERE user_id = ?", [input.userId]);
    await execute(db, "DELETE FROM users WHERE id = ?", [input.userId]);
  }

  await appendAdminActivity(
    db,
    actorId,
    "User removed",
    `${target.name} was removed from active access.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function pullChangesFromD1(
  db: D1Database,
  cursor: number,
): Promise<PullResponse> {
  await ensureDatabaseReady(db);

  const latestCursor = await currentCursor(db);
  if (cursor >= latestCursor) {
    return {
      events: [],
      cursor: latestCursor,
    };
  }

  const firstEvent = await first<{ seq: number }>(
    db,
    "SELECT seq FROM sync_events ORDER BY seq ASC LIMIT 1",
  );

  if (!firstEvent || cursor < Number(firstEvent.seq)) {
    return {
      events: [],
      cursor: latestCursor,
      snapshot: await loadSnapshot(db),
    };
  }

  const eventRows = await all<ExistingEventRow>(
    db,
    "SELECT payload_json FROM sync_events WHERE seq > ? ORDER BY seq ASC LIMIT 500",
    [cursor],
  );

  return {
    events: eventRows.map((row) => JSON.parse(row.payload_json) as SyncEvent),
    cursor: latestCursor,
  };
}

interface GeneratedMutationContext {
  reference: string;
  requestLineId: string;
  idFactory: (prefix: string) => string;
}

async function buildMutationContext(
  db: D1Database,
  mutation: MutationEnvelope,
  requestedIds: Map<string, number>,
): Promise<GeneratedMutationContext> {
  const requestId = await reserveNextId(db, "inventory_requests", "req");
  const requestLineId = await reserveNextId(db, "inventory_request_lines", "rql");
  const activityId = await reserveNextId(db, "activity_logs", "act");
  const eventId = await reserveNextId(db, "sync_events", "evt");
  const ledgerIds = await Promise.all(
    Array.from({ length: requestedIds.get("led") ?? (mutation.kind === "transfer" ? 2 : 1) }, () =>
      reserveNextId(db, "movement_ledger", "led"),
    ),
  );
  const batchIds = await Promise.all(
    Array.from({ length: requestedIds.get("bat") ?? 0 }, () =>
      reserveNextId(db, "stock_batches", "bat"),
    ),
  );
  const wasteEntryIds = await Promise.all(
    Array.from({ length: requestedIds.get("wte") ?? 0 }, () =>
      reserveNextId(db, "waste_entries", "wte"),
    ),
  );
  const reference = await reserveNextDocumentReference(db, mutation.kind);

  const idBuckets = new Map<string, string[]>([
    ["req", [requestId]],
    ["act", [activityId]],
    ["evt", [eventId]],
    ["led", ledgerIds],
    ["bat", batchIds],
    ["wte", wasteEntryIds],
  ]);

  return {
    reference,
    requestLineId,
    idFactory(prefix: string) {
      const bucket = idBuckets.get(prefix);
      const value = bucket?.shift();
      if (!value) {
        throw new Error(`No reserved ID available for prefix ${prefix}.`);
      }
      return value;
    },
  };
}

async function persistMutationResult(
  db: D1Database,
  mutation: MutationEnvelope,
  event: SyncEvent,
  context: GeneratedMutationContext,
) {
  const updatedItem = event.updatedItem;
  const request = event.request;
  const lineId = context.requestLineId;

  await execute(db, "UPDATE items SET updated_at = ? WHERE id = ?", [
    updatedItem.updatedAt,
    updatedItem.id,
  ]);
  await execute(db, "DELETE FROM item_stocks WHERE item_id = ?", [updatedItem.id]);
  await execute(db, "DELETE FROM stock_batches WHERE item_id = ?", [updatedItem.id]);

  for (const stock of updatedItem.stocks) {
    await execute(
      db,
      "INSERT INTO item_stocks (item_id, location_id, on_hand, reserved, min_level, max_level, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        updatedItem.id,
        stock.locationId,
        stock.onHand,
        stock.reserved,
        stock.minLevel,
        stock.maxLevel,
        updatedItem.updatedAt,
      ],
    );

    for (const batch of stock.batches) {
      await execute(
        db,
        "INSERT INTO stock_batches (id, sequence_no, item_id, location_id, lot_code, quantity, received_at, expiry_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          batch.id,
          numberPart(batch.id),
          updatedItem.id,
          stock.locationId,
          batch.lotCode,
          batch.quantity,
          batch.receivedAt,
          batch.expiryDate ?? null,
          updatedItem.updatedAt,
        ],
      );
    }
  }

  await execute(
    db,
    "INSERT INTO inventory_requests (id, sequence_no, reference, kind, status, supplier_id, from_location_id, to_location_id, requested_by, requested_at, posted_at, note, client_mutation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      request.id,
      numberPart(request.id),
      request.reference,
      request.kind,
      request.status,
      request.supplierId ?? null,
      request.fromLocationId ?? null,
      request.toLocationId ?? null,
      request.requestedBy,
      request.requestedAt,
      request.status === "posted" ? request.requestedAt : null,
      request.note,
      mutation.clientMutationId,
      request.requestedAt,
      request.requestedAt,
    ],
  );

  await execute(
    db,
    "INSERT INTO inventory_request_lines (id, sequence_no, request_id, line_no, item_id, barcode, quantity, counted_quantity, lot_code, expiry_date, received_at, allocation_summary, waste_reason, waste_shift, waste_station, unit, note, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      lineId,
      numberPart(lineId),
      request.id,
      request.itemId,
      request.barcode,
      request.quantity,
      request.kind === "stock-count" ? request.quantity : null,
      request.lotCode ?? null,
      request.expiryDate ?? null,
      request.receivedDate ?? null,
      request.allocationSummary ?? null,
      request.wasteReason ?? null,
      request.wasteShift ?? null,
      request.wasteStation ?? null,
      request.unit,
      request.note,
      request.requestedAt,
      request.requestedAt,
    ],
  );

  for (const ledgerEntry of event.ledgerEntries) {
    await execute(
      db,
      "INSERT INTO movement_ledger (id, sequence_no, reference, request_id, request_line_id, item_id, location_id, change_type, quantity_before, quantity_change, quantity_after, actor_id, created_at, allocation_summary, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        ledgerEntry.id,
        numberPart(ledgerEntry.id),
        ledgerEntry.reference,
        request.id,
        lineId,
        ledgerEntry.itemId,
        ledgerEntry.locationId,
        ledgerEntry.changeType,
        ledgerEntry.quantityBefore,
        ledgerEntry.quantityChange,
        ledgerEntry.quantityAfter,
        ledgerEntry.actorId,
        ledgerEntry.createdAt,
        ledgerEntry.allocationSummary ?? null,
        ledgerEntry.note,
      ],
    );
  }

  if (event.wasteEntry) {
    await execute(
      db,
      "INSERT INTO waste_entries (id, sequence_no, request_id, item_id, location_id, quantity, unit, reason, shift_key, station, batch_lot_code, expiry_date, estimated_cost, reported_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        event.wasteEntry.id,
        numberPart(event.wasteEntry.id),
        event.wasteEntry.requestId,
        event.wasteEntry.itemId,
        event.wasteEntry.locationId,
        event.wasteEntry.quantity,
        event.wasteEntry.unit,
        event.wasteEntry.reason,
        event.wasteEntry.shift,
        event.wasteEntry.station,
        event.wasteEntry.batchLotCode ?? null,
        event.wasteEntry.expiryDate ?? null,
        event.wasteEntry.estimatedCost,
        event.wasteEntry.reportedBy,
        event.wasteEntry.note,
        event.wasteEntry.createdAt,
      ],
    );
  }

  await execute(
    db,
    "INSERT INTO activity_logs (id, sequence_no, seq, title, detail, actor_id, module_key, severity, related_request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      event.activity.id,
      numberPart(event.activity.id),
      event.activity.seq,
      event.activity.title,
      event.activity.detail,
      event.activity.actorId,
      event.activity.module,
      event.activity.severity,
      request.id,
      event.activity.createdAt,
    ],
  );

  await execute(
    db,
    "INSERT INTO sync_events (id, sequence_no, seq, mutation_id, actor_id, kind, request_id, activity_id, timestamp, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      event.eventId,
      numberPart(event.eventId),
      event.seq,
      event.mutationId,
      event.actorId,
      event.kind,
      request.id,
      event.activity.id,
      event.timestamp,
      JSON.stringify(event),
      event.timestamp,
    ],
  );

  await execute(
    db,
    "UPDATE system_state SET value_integer = ?, updated_at = ? WHERE key = 'latest_cursor'",
    [event.seq, event.timestamp],
  );
}

async function recordInventoryMutation(
  db: D1Database,
  snapshot: InventorySnapshot,
  mutation: MutationEnvelope,
): Promise<MutationResult> {
  const nextSeq = snapshot.syncCursor + 1;
  const previewCounters = new Map<string, number>();
  applyMutation(snapshot, mutation, {
    idFactory: (prefix: string) => {
      const nextValue = (previewCounters.get(prefix) ?? 0) + 1;
      previewCounters.set(prefix, nextValue);
      return `${prefix}-preview-${nextValue}`;
    },
    referenceFactory: () => `PREVIEW-${nextSeq}`,
    nextSeq,
  });

  const context = await buildMutationContext(db, mutation, previewCounters);
  const result = applyMutation(snapshot, mutation, {
    idFactory: context.idFactory,
    referenceFactory: () => context.reference,
    nextSeq,
  });

  await persistMutationResult(db, mutation, result.event, context);
  return result;
}

async function loadInventoryRequestActionRow(
  db: D1Database,
  requestId: string,
): Promise<InventoryRequestActionRow | null> {
  return first<InventoryRequestActionRow>(
    db,
    `SELECT
      r.id,
      r.reference,
      r.kind,
      r.status,
      rl.item_id,
      rl.barcode,
      rl.quantity,
      rl.counted_quantity,
      rl.lot_code,
      rl.expiry_date,
      rl.received_at,
      rl.waste_reason,
      rl.waste_shift,
      rl.waste_station,
      rl.unit,
      r.supplier_id,
      r.from_location_id,
      r.to_location_id,
      r.note,
      r.requested_by,
      r.requested_at
    FROM inventory_requests r
    JOIN inventory_request_lines rl ON rl.request_id = r.id AND rl.line_no = 1
    WHERE r.id = ? AND r.deleted_at IS NULL
    LIMIT 1`,
    [requestId],
  );
}

async function loadFirstLedgerBefore(db: D1Database, requestId: string): Promise<number | null> {
  const row = await first<{ quantity_before: number }>(
    db,
    "SELECT quantity_before FROM movement_ledger WHERE request_id = ? ORDER BY sequence_no ASC LIMIT 1",
    [requestId],
  );
  return row ? Number(row.quantity_before) : null;
}

async function markInventoryRequestRejected(
  db: D1Database,
  requestId: string,
  note: string,
): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE inventory_requests SET status = 'rejected', note = ?, updated_at = ? WHERE id = ?",
    [note, now, requestId],
  );
}

async function markInventoryRequestDeleted(
  db: D1Database,
  requestId: string,
  actorId: string,
  note: string,
): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE inventory_requests SET status = 'rejected', note = ?, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?",
    [note, now, actorId, now, requestId],
  );
}

function buildInventoryActionNote(
  originalNote: string,
  prefix: string,
  actorName: string,
  reason: string,
  relatedReference?: string,
): string {
  const base = originalNote.trim();
  const suffix = relatedReference
    ? `[${prefix}] ${actorName}: ${reason}. Related reference ${relatedReference}.`
    : `[${prefix}] ${actorName}: ${reason}.`;
  return base ? `${base}\n${suffix}` : suffix;
}

function buildReversalMutation(
  actorId: string,
  request: InventoryRequestActionRow,
  reason: string,
  quantityBefore?: number | null,
): MutationEnvelope {
  const createdAt = new Date().toISOString();
  const note = `Reversal for ${request.reference}: ${reason}`;

  switch (request.kind) {
    case "grn":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "adjustment",
        payload: {
          itemId: request.item_id,
          quantity: -Math.abs(Number(request.quantity)),
          note,
          barcode: request.barcode,
          fromLocationId: request.to_location_id ?? undefined,
        },
      };
    case "gin":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "adjustment",
        payload: {
          itemId: request.item_id,
          quantity: Math.abs(Number(request.quantity)),
          note,
          barcode: request.barcode,
          fromLocationId: request.from_location_id ?? undefined,
          lotCode: request.lot_code ?? undefined,
          expiryDate: request.expiry_date ?? undefined,
          receivedDate: request.received_at ?? undefined,
        },
      };
    case "transfer":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "transfer",
        payload: {
          itemId: request.item_id,
          quantity: Math.abs(Number(request.quantity)),
          note,
          barcode: request.barcode,
          fromLocationId: request.to_location_id ?? undefined,
          toLocationId: request.from_location_id ?? undefined,
        },
      };
    case "adjustment":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "adjustment",
        payload: {
          itemId: request.item_id,
          quantity: -Number(request.quantity),
          note,
          barcode: request.barcode,
          fromLocationId: request.from_location_id ?? undefined,
        },
      };
    case "stock-count":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "stock-count",
        payload: {
          itemId: request.item_id,
          quantity: Math.max(0, Number(quantityBefore ?? request.quantity)),
          countedQuantity: Math.max(0, Number(quantityBefore ?? request.quantity)),
          note,
          barcode: request.barcode,
          fromLocationId: request.from_location_id ?? undefined,
        },
      };
    case "wastage":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "adjustment",
        payload: {
          itemId: request.item_id,
          quantity: Math.abs(Number(request.quantity)),
          note,
          barcode: request.barcode,
          fromLocationId: request.from_location_id ?? undefined,
          lotCode: request.lot_code ?? undefined,
          expiryDate: request.expiry_date ?? undefined,
          receivedDate: request.received_at ?? undefined,
        },
      };
  }
}

export async function createMarketPriceEntryInD1(
  db: D1Database,
  actorId: string,
  input: CreateMarketPriceRequest,
): Promise<CreateMarketPriceResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = snapshot.users.find((user) => user.id === actorId);
  if (!actor) {
    throw new Error("Could not identify the user creating the market price entry.");
  }

  const item = snapshot.items.find((record) => record.id === input.itemId);
  if (!item) {
    throw new Error("Market price entry requires a valid item.");
  }

  const location = snapshot.locations.find((record) => record.id === input.locationId);
  if (!location) {
    throw new Error("Market price entry requires a valid warehouse or outlet.");
  }

  const supplier = input.supplierId
    ? snapshot.suppliers.find((record) => record.id === input.supplierId)
    : snapshot.suppliers.find((record) => record.id === item.supplierId);
  if (input.supplierId && !supplier) {
    throw new Error("Selected supplier was not found.");
  }

  const quotedPrice = Number(input.quotedPrice);
  if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) {
    throw new Error("Quoted price must be greater than zero.");
  }

  const note = input.note.trim();
  const sourceName = input.sourceName.trim();
  if (!sourceName) {
    throw new Error("Provide the market source or supplier reference.");
  }

  const previousEntry = snapshot.marketPrices.find(
    (entry) => entry.itemId === item.id && entry.locationId === location.id,
  );
  const previousPrice = previousEntry?.quotedPrice;
  const variancePct =
    previousPrice && previousPrice > 0
      ? Number((((quotedPrice - previousPrice) / previousPrice) * 100).toFixed(2))
      : undefined;
  const createdAt = new Date().toISOString();
  const id = await reserveNextId(db, "market_price_entries", "mpr");
  const entry: MarketPriceEntry = {
    id,
    marketDate: input.marketDate,
    category: input.category,
    itemId: item.id,
    itemName: item.name,
    locationId: location.id,
    locationName: location.name,
    supplierId: supplier?.id,
    supplierName: supplier?.name,
    unit: item.unit,
    quotedPrice,
    previousPrice,
    variancePct,
    sourceName,
    note,
    capturedBy: actor.id,
    capturedByName: actor.name,
    createdAt,
  };

  await execute(
    db,
    "INSERT INTO market_price_entries (id, sequence_no, market_date, category, item_id, location_id, supplier_id, unit, quoted_price, previous_price, variance_pct, source_name, note, captured_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      entry.id,
      numberPart(entry.id),
      entry.marketDate,
      entry.category,
      entry.itemId,
      entry.locationId,
      entry.supplierId ?? null,
      entry.unit,
      entry.quotedPrice,
      entry.previousPrice ?? null,
      entry.variancePct ?? null,
      entry.sourceName,
      entry.note,
      entry.capturedBy,
      entry.createdAt,
    ],
  );

  return {
    entry,
    snapshot: await loadSnapshot(db),
  };
}

export async function updateMarketPriceEntryInD1(
  db: D1Database,
  actorId: string,
  input: UpdateMarketPriceRequest,
): Promise<UpdateMarketPriceResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.items",
    "You do not have permission to edit market prices.",
  );
  const existing = snapshot.marketPrices.find((entry) => entry.id === input.marketPriceId);
  if (!existing) {
    throw new Error("The selected market price entry could not be found.");
  }

  const item = snapshot.items.find((record) => record.id === input.itemId);
  if (!item) {
    throw new Error("Market price entry requires a valid item.");
  }
  const location = snapshot.locations.find((record) => record.id === input.locationId);
  if (!location) {
    throw new Error("Market price entry requires a valid warehouse or outlet.");
  }
  const supplier = input.supplierId
    ? snapshot.suppliers.find((record) => record.id === input.supplierId)
    : undefined;
  if (input.supplierId && !supplier) {
    throw new Error("Selected supplier was not found.");
  }

  const quotedPrice = Number(input.quotedPrice);
  if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) {
    throw new Error("Quoted price must be greater than zero.");
  }

  const sourceName = input.sourceName.trim();
  const note = input.note.trim();
  if (!sourceName) {
    throw new Error("Provide the market source or supplier reference.");
  }

  const previousEntry = snapshot.marketPrices.find(
    (entry) =>
      entry.id !== input.marketPriceId &&
      entry.itemId === item.id &&
      entry.locationId === location.id,
  );
  const previousPrice = previousEntry?.quotedPrice;
  const variancePct =
    previousPrice && previousPrice > 0
      ? Number((((quotedPrice - previousPrice) / previousPrice) * 100).toFixed(2))
      : undefined;

  await execute(
    db,
    "UPDATE market_price_entries SET market_date = ?, category = ?, item_id = ?, location_id = ?, supplier_id = ?, unit = ?, quoted_price = ?, previous_price = ?, variance_pct = ?, source_name = ?, note = ? WHERE id = ?",
    [
      input.marketDate,
      input.category,
      item.id,
      location.id,
      supplier?.id ?? null,
      item.unit,
      quotedPrice,
      previousPrice ?? null,
      variancePct ?? null,
      sourceName,
      note,
      input.marketPriceId,
    ],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Market price updated",
    `${item.name} market price was updated for ${location.name}.`,
  );

  return {
    entry: {
      ...existing,
      marketDate: input.marketDate,
      category: input.category,
      itemId: item.id,
      itemName: item.name,
      locationId: location.id,
      locationName: location.name,
      supplierId: supplier?.id,
      supplierName: supplier?.name,
      unit: item.unit,
      quotedPrice,
      previousPrice,
      variancePct,
      sourceName,
      note,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function deleteMarketPriceEntryInD1(
  db: D1Database,
  actorId: string,
  input: DeleteMarketPriceRequest,
): Promise<DeleteSnapshotResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.items",
    "You do not have permission to delete market prices.",
  );
  const existing = snapshot.marketPrices.find((entry) => entry.id === input.marketPriceId);
  if (!existing) {
    throw new Error("The selected market price entry could not be found.");
  }

  await execute(db, "DELETE FROM market_price_entries WHERE id = ?", [input.marketPriceId]);

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Market price deleted",
    `${existing.itemName} market price dated ${existing.marketDate} was deleted.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function createItemInD1(
  db: D1Database,
  actorId: string,
  input: CreateItemRequest,
): Promise<CreateItemResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.items",
    "You do not have permission to add items.",
  );

  const name = input.name.trim();
  const sku = input.sku.trim().toUpperCase();
  const barcode = input.barcode.trim();
  const category = input.category.trim();
  const unit = input.unit.trim();
  const status = input.status ?? "active";

  if (!name || !sku || !barcode || !category || !unit) {
    throw new Error("Name, SKU, barcode, category, and unit are required for items.");
  }

  if (await itemExistsBySku(db, sku)) {
    throw new Error(`An item already exists with SKU ${sku}.`);
  }

  if (await itemExistsByBarcode(db, barcode)) {
    throw new Error(`An item already exists with barcode ${barcode}.`);
  }

  const supplier = snapshot.suppliers.find((record) => record.id === input.supplierId);
  if (!supplier) {
    throw new Error("Select a valid supplier before creating the item.");
  }

  const costPrice = Number(input.costPrice);
  const sellingPrice = Number(input.sellingPrice);
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw new Error("Cost price must be zero or greater.");
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("Selling price must be zero or greater.");
  }

  const createdAt = new Date().toISOString();
  const id = await reserveNextId(db, "items", "itm");
  await execute(
    db,
    "INSERT INTO items (id, sequence_no, sku, barcode, name, category, unit, supplier_id, cost_price, selling_price, status, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      numberPart(id),
      sku,
      barcode,
      name,
      category,
      unit,
      supplier.id,
      costPrice,
      sellingPrice,
      status,
      createdAt,
      createdAt,
    ],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Item created",
    `${name} (${sku}) was added to the item catalog.`,
  );

  return {
    item: {
      id,
      sku,
      barcode,
      name,
      category,
      unit,
      supplierId: supplier.id,
      costPrice,
      sellingPrice,
      status,
      stocks: [],
      updatedAt: createdAt,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function updateItemInD1(
  db: D1Database,
  actorId: string,
  input: UpdateItemRequest,
): Promise<UpdateItemResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.items",
    "You do not have permission to edit items.",
  );
  const existing = snapshot.items.find((item) => item.id === input.itemId);
  if (!existing) {
    throw new Error("The selected item could not be found.");
  }

  const name = input.name.trim();
  const sku = input.sku.trim().toUpperCase();
  const barcode = input.barcode.trim();
  const category = input.category.trim();
  const unit = input.unit.trim();
  const status = input.status ?? existing.status;
  if (!name || !sku || !barcode || !category || !unit) {
    throw new Error("Name, SKU, barcode, category, and unit are required for items.");
  }
  if (await itemExistsBySkuExcludingId(db, sku, input.itemId)) {
    throw new Error(`An item already exists with SKU ${sku}.`);
  }
  if (await itemExistsByBarcodeExcludingId(db, barcode, input.itemId)) {
    throw new Error(`An item already exists with barcode ${barcode}.`);
  }

  const supplier = snapshot.suppliers.find((record) => record.id === input.supplierId);
  if (!supplier) {
    throw new Error("Select a valid supplier before saving the item.");
  }

  const costPrice = Number(input.costPrice);
  const sellingPrice = Number(input.sellingPrice);
  if (!Number.isFinite(costPrice) || costPrice < 0) {
    throw new Error("Cost price must be zero or greater.");
  }
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    throw new Error("Selling price must be zero or greater.");
  }

  const updatedAt = new Date().toISOString();
  await execute(
    db,
    "UPDATE items SET sku = ?, barcode = ?, name = ?, category = ?, unit = ?, supplier_id = ?, cost_price = ?, selling_price = ?, status = ?, updated_at = ? WHERE id = ?",
    [
      sku,
      barcode,
      name,
      category,
      unit,
      supplier.id,
      costPrice,
      sellingPrice,
      status,
      updatedAt,
      input.itemId,
    ],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Item updated",
    `${name} (${sku}) was updated in the item catalog.`,
  );

  return {
    item: {
      ...existing,
      sku,
      barcode,
      name,
      category,
      unit,
      supplierId: supplier.id,
      costPrice,
      sellingPrice,
      status,
      updatedAt,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function deleteItemInD1(
  db: D1Database,
  actorId: string,
  input: DeleteItemRequest,
): Promise<DeleteSnapshotResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.items",
    "You do not have permission to delete items.",
  );
  const existing = snapshot.items.find((item) => item.id === input.itemId);
  if (!existing) {
    throw new Error("The selected item could not be found.");
  }

  const updatedAt = new Date().toISOString();
  await execute(
    db,
    "UPDATE items SET status = 'archived', updated_at = ? WHERE id = ?",
    [updatedAt, input.itemId],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Item archived",
    `${existing.name} (${existing.sku}) was removed from the active item list.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function createSupplierInD1(
  db: D1Database,
  actorId: string,
  input: CreateSupplierRequest,
): Promise<CreateSupplierResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.suppliers",
    "You do not have permission to add suppliers.",
  );

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const status = input.status ?? "active";
  const leadTimeDays = Number(input.leadTimeDays);

  if (!name || !code || !email || !phone) {
    throw new Error("Supplier name, code, email, and phone are required.");
  }

  if (await supplierExistsByCode(db, code)) {
    throw new Error(`A supplier already exists with code ${code}.`);
  }

  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
    throw new Error("Lead time must be zero or greater.");
  }

  const createdAt = new Date().toISOString();
  const id = await reserveNextId(db, "suppliers", "sup");
  await execute(
    db,
    "INSERT INTO suppliers (id, sequence_no, code, name, email, phone, lead_time_days, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      numberPart(id),
      code,
      name,
      email,
      phone,
      leadTimeDays,
      status,
      createdAt,
      createdAt,
    ],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Supplier created",
    `${name} (${code}) was added to the supplier directory.`,
  );

  return {
    supplier: {
      id,
      code,
      name,
      email,
      phone,
      leadTimeDays,
      status,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function updateSupplierInD1(
  db: D1Database,
  actorId: string,
  input: UpdateSupplierRequest,
): Promise<UpdateSupplierResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.suppliers",
    "You do not have permission to edit suppliers.",
  );
  const existing = snapshot.suppliers.find((supplier) => supplier.id === input.supplierId);
  if (!existing) {
    throw new Error("The selected supplier could not be found.");
  }

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const status = input.status ?? existing.status;
  const leadTimeDays = Number(input.leadTimeDays);

  if (!name || !code || !email || !phone) {
    throw new Error("Supplier name, code, email, and phone are required.");
  }
  if (await supplierExistsByCodeExcludingId(db, code, input.supplierId)) {
    throw new Error(`A supplier already exists with code ${code}.`);
  }
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
    throw new Error("Lead time must be zero or greater.");
  }

  const updatedAt = new Date().toISOString();
  await execute(
    db,
    "UPDATE suppliers SET code = ?, name = ?, email = ?, phone = ?, lead_time_days = ?, status = ?, updated_at = ? WHERE id = ?",
    [code, name, email, phone, leadTimeDays, status, updatedAt, input.supplierId],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Supplier updated",
    `${name} (${code}) was updated in the supplier directory.`,
  );

  return {
    supplier: {
      ...existing,
      code,
      name,
      email,
      phone,
      leadTimeDays,
      status,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function deleteSupplierInD1(
  db: D1Database,
  actorId: string,
  input: DeleteSupplierRequest,
): Promise<DeleteSnapshotResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.suppliers",
    "You do not have permission to delete suppliers.",
  );
  const existing = snapshot.suppliers.find((supplier) => supplier.id === input.supplierId);
  if (!existing) {
    throw new Error("The selected supplier could not be found.");
  }

  const updatedAt = new Date().toISOString();
  await execute(
    db,
    "UPDATE suppliers SET status = 'archived', updated_at = ? WHERE id = ?",
    [updatedAt, input.supplierId],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Supplier archived",
    `${existing.name} (${existing.code}) was removed from the active supplier list.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function createLocationInD1(
  db: D1Database,
  actorId: string,
  input: CreateLocationRequest,
): Promise<CreateLocationResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.locations",
    "You do not have permission to add warehouse or outlet records.",
  );

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const city = input.city.trim();
  const type = input.type;
  const status = input.status ?? "active";

  if (!name || !code) {
    throw new Error("Location name and code are required.");
  }

  if (type !== "warehouse" && type !== "outlet") {
    throw new Error("Location type must be warehouse or outlet.");
  }

  if (await locationExistsByCode(db, code)) {
    throw new Error(`A location already exists with code ${code}.`);
  }

  const createdAt = new Date().toISOString();
  const id = await reserveNextId(db, "locations", "loc");
  await execute(
    db,
    "INSERT INTO locations (id, sequence_no, code, name, type, city, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      numberPart(id),
      code,
      name,
      type,
      city,
      status,
      createdAt,
      createdAt,
    ],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Location created",
    `${name} (${code}) was added as a ${type}.`,
  );

  return {
    location: {
      id,
      code,
      name,
      type,
      city,
      status,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function updateLocationInD1(
  db: D1Database,
  actorId: string,
  input: UpdateLocationRequest,
): Promise<UpdateLocationResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.locations",
    "You do not have permission to edit locations.",
  );
  const existing = snapshot.locations.find((location) => location.id === input.locationId);
  if (!existing) {
    throw new Error("The selected location could not be found.");
  }

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const city = input.city.trim();
  const type = input.type;
  const status = input.status ?? existing.status;
  if (!name || !code) {
    throw new Error("Location name and code are required.");
  }
  if (type !== "warehouse" && type !== "outlet") {
    throw new Error("Location type must be warehouse or outlet.");
  }
  if (await locationExistsByCodeExcludingId(db, code, input.locationId)) {
    throw new Error(`A location already exists with code ${code}.`);
  }

  const updatedAt = new Date().toISOString();
  await execute(
    db,
    "UPDATE locations SET code = ?, name = ?, type = ?, city = ?, status = ?, updated_at = ? WHERE id = ?",
    [code, name, type, city, status, updatedAt, input.locationId],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Location updated",
    `${name} (${code}) was updated in the location directory.`,
  );

  return {
    location: {
      ...existing,
      code,
      name,
      type,
      city,
      status,
    },
    snapshot: await loadSnapshot(db),
  };
}

export async function deleteLocationInD1(
  db: D1Database,
  actorId: string,
  input: DeleteLocationRequest,
): Promise<DeleteSnapshotResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "master.locations",
    "You do not have permission to delete locations.",
  );
  const existing = snapshot.locations.find((location) => location.id === input.locationId);
  if (!existing) {
    throw new Error("The selected location could not be found.");
  }

  const updatedAt = new Date().toISOString();
  await execute(
    db,
    "UPDATE locations SET status = 'archived', updated_at = ? WHERE id = ?",
    [updatedAt, input.locationId],
  );

  await appendActivity(
    db,
    actor.id,
    "masterData",
    "Location archived",
    `${existing.name} (${existing.code}) was removed from the active location list.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function initializeSystemInD1(
  db: D1Database,
  input: InitializeSystemRequest,
): Promise<InitializeSystemResponse> {
  await ensureDatabaseReady(db);

  const { userCount, locationCount, settingsCount } = await loadInitializationCounts(db);
  const fullyInitialized = userCount > 0 && locationCount > 0 && settingsCount > 0;
  const partiallyInitialized = userCount > 0 || locationCount > 0 || settingsCount > 0;

  if (fullyInitialized) {
    throw new Error("OmniStock is already initialized for this database.");
  }

  if (partiallyInitialized) {
    await resetIncompleteInitialization(db);
  }

  const companyName = input.companyName.trim();
  if (!companyName) {
    throw new Error("Company name is required to initialize OmniStock.");
  }

  const locations = input.locations
    .map((location) => ({
      ...location,
      name: location.name.trim(),
      code: location.code.trim().toUpperCase(),
      city: location.city.trim(),
    }))
    .filter((location) => location.name && location.code);
  const hasWarehouse = locations.some((location) => location.type === "warehouse");
  const hasOutlet = locations.some((location) => location.type === "outlet");
  if (!hasWarehouse || !hasOutlet) {
    throw new Error("Create at least one warehouse and one outlet during initialization.");
  }

  const users = input.users
    .map((user) => ({
      ...user,
      name: user.name.trim(),
      username: normalizeUsername(user.username),
      email: user.email.trim().toLowerCase(),
      password: user.password,
    }))
    .filter((user) => user.name && user.username && user.email && user.password);
  if (!users.some((user) => user.role === "superadmin")) {
    throw new Error("Create at least one superadmin user to complete initialization.");
  }

  const locationCodes = new Set<string>();
  for (const location of locations) {
    if (locationCodes.has(location.code)) {
      throw new Error(`Location code ${location.code} is duplicated in the setup form.`);
    }
    locationCodes.add(location.code);
  }

  const usernames = new Set<string>();
  const emails = new Set<string>();
  for (const user of users) {
    assertUsername(user.username);
    if (usernames.has(user.username)) {
      throw new Error(`Username ${user.username} is duplicated in the setup form.`);
    }
    usernames.add(user.username);
    if (emails.has(user.email)) {
      throw new Error(`User email ${user.email} is duplicated in the setup form.`);
    }
    emails.add(user.email);
    assertPasswordStrength(user.password);
  }

  const now = new Date().toISOString();
  const createdLocationIds: string[] = [];
  for (const location of locations) {
    const id = await reserveNextId(db, "locations", "loc");
    createdLocationIds.push(id);
    await execute(
      db,
      "INSERT INTO locations (id, sequence_no, code, name, type, city, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
      [id, numberPart(id), location.code, location.name, location.type, location.city, now, now],
    );
  }

  let firstUserId = "";
  for (const user of users) {
    const id = await reserveNextId(db, "users", "usr");
    if (!firstUserId) {
      firstUserId = id;
    }
    const hashed = await hashPassword(user.password);

    await execute(
      db,
      "INSERT INTO users (id, sequence_no, name, username, email, role_code, status, password_hash, password_salt, password_iterations, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)",
      [
        id,
        numberPart(id),
        user.name,
        user.username,
        user.email,
        user.role,
        hashed.passwordHash,
        hashed.passwordSalt,
        hashed.passwordIterations,
        now,
        now,
        now,
      ],
    );

    for (const locationId of createdLocationIds) {
      await execute(
        db,
        "INSERT INTO user_location_assignments (user_id, location_id, created_at) VALUES (?, ?, ?)",
        [id, locationId, now],
      );
    }
  }

  await execute(
    db,
    "INSERT INTO app_settings (id, sequence_no, company_name, currency, timezone, low_stock_threshold, expiry_alert_days, enable_offline, enable_realtime, enable_barcode, strict_fefo, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      SETTINGS_ID,
      numberPart(SETTINGS_ID),
      companyName,
      input.currency,
      input.timezone,
      Number(input.lowStockThreshold),
      Number(input.expiryAlertDays),
      input.enableOffline ? 1 : 0,
      input.enableRealtime ? 1 : 0,
      input.enableBarcode ? 1 : 0,
      input.strictFefo ? 1 : 0,
      now,
    ],
  );

  const activityId = await reserveNextId(db, "activity_logs", "act");
  await execute(
    db,
    "INSERT INTO activity_logs (id, sequence_no, seq, title, detail, actor_id, module_key, severity, related_request_id, created_at) VALUES (?, ?, 0, ?, ?, ?, 'administration', 'success', NULL, ?)",
    [
      activityId,
      numberPart(activityId),
      "System initialized",
      `${companyName} completed first-run setup with ${locations.length} locations and ${users.length} users.`,
      firstUserId,
      now,
    ],
  );

  await execute(
    db,
    "INSERT OR REPLACE INTO system_state (key, value_integer, value_text, updated_at) VALUES ('latest_cursor', 0, NULL, ?)",
    [now],
  );
  await execute(
    db,
    "INSERT OR REPLACE INTO system_state (key, value_integer, value_text, updated_at) VALUES ('initialized_at', NULL, ?, ?)",
    [now, now],
  );

  return {
    snapshot: await loadSnapshot(db),
  };
}

export async function reverseInventoryRequestInD1(
  db: D1Database,
  actorId: string,
  input: ReverseInventoryRequest,
): Promise<InventoryActionResponse> {
  await ensureDatabaseReady(db);

  let snapshot = await loadSnapshot(db);
  const request = await loadInventoryRequestActionRow(db, input.requestId);
  if (!request) {
    throw new Error("The selected inventory entry could not be found.");
  }
  if (request.status !== "posted") {
    throw new Error("Only posted inventory entries can be reversed.");
  }

  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    inventoryPermissionForKind(request.kind),
    "You do not have permission to reverse this inventory entry.",
  );
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Provide a reason before reversing an inventory entry.");
  }

  const quantityBefore =
    request.kind === "stock-count" ? await loadFirstLedgerBefore(db, request.id) : null;
  const reversalMutation = buildReversalMutation(actor.id, request, reason, quantityBefore);
  const reversalResult = await recordInventoryMutation(db, snapshot, reversalMutation);
  snapshot = reversalResult.snapshot;

  await markInventoryRequestRejected(
    db,
    request.id,
    buildInventoryActionNote(
      request.note,
      "Reversed",
      actor.name,
      reason,
      reversalResult.event.request.reference,
    ),
  );

  return {
    snapshot: await loadSnapshot(db),
    reversalRequest: reversalResult.event.request,
  };
}

export async function editInventoryRequestInD1(
  db: D1Database,
  actorId: string,
  input: EditInventoryRequest,
): Promise<InventoryActionResponse> {
  await ensureDatabaseReady(db);

  let snapshot = await loadSnapshot(db);
  const request = await loadInventoryRequestActionRow(db, input.requestId);
  if (!request) {
    throw new Error("The selected inventory entry could not be found.");
  }
  if (request.status !== "posted") {
    throw new Error("Only posted inventory entries can be edited.");
  }

  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    inventoryPermissionForKind(request.kind),
    "You do not have permission to edit this inventory entry.",
  );
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Provide a correction reason before editing an inventory entry.");
  }

  const quantityBefore =
    request.kind === "stock-count" ? await loadFirstLedgerBefore(db, request.id) : null;
  const reversalMutation = buildReversalMutation(actor.id, request, reason, quantityBefore);
  const reversalResult = await recordInventoryMutation(db, snapshot, reversalMutation);
  snapshot = reversalResult.snapshot;

  const correctedMutation: MutationEnvelope = {
    clientMutationId: crypto.randomUUID(),
    actorId,
    createdAt: new Date().toISOString(),
    kind: request.kind,
    payload: {
      itemId: input.itemId,
      quantity: Number(input.quantity),
      note: input.note.trim(),
      barcode: input.barcode?.trim() || undefined,
      supplierId: input.supplierId?.trim() || undefined,
      fromLocationId: input.fromLocationId?.trim() || undefined,
      toLocationId: input.toLocationId?.trim() || undefined,
      countedQuantity:
        request.kind === "stock-count"
          ? Number(input.countedQuantity ?? input.quantity)
          : undefined,
      lotCode: input.lotCode?.trim() || undefined,
      expiryDate: input.expiryDate?.trim() || undefined,
      receivedDate: input.receivedDate?.trim() || undefined,
      wasteReason: request.kind === "wastage" ? input.wasteReason : undefined,
      wasteShift: request.kind === "wastage" ? input.wasteShift : undefined,
      wasteStation:
        request.kind === "wastage" ? input.wasteStation?.trim() || undefined : undefined,
    },
  };

  const correctedResult = await recordInventoryMutation(db, snapshot, correctedMutation);

  await markInventoryRequestRejected(
    db,
    request.id,
    buildInventoryActionNote(
      request.note,
      "Corrected",
      actor.name,
      reason,
      correctedResult.event.request.reference,
    ),
  );

  return {
    snapshot: await loadSnapshot(db),
    replacementRequest: correctedResult.event.request,
    reversalRequest: reversalResult.event.request,
  };
}

export async function deleteInventoryRequestInD1(
  db: D1Database,
  actorId: string,
  input: DeleteInventoryRequest,
): Promise<InventoryActionResponse> {
  await ensureDatabaseReady(db);

  let snapshot = await loadSnapshot(db);
  const request = await loadInventoryRequestActionRow(db, input.requestId);
  if (!request) {
    throw new Error("The selected inventory entry could not be found.");
  }

  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    inventoryPermissionForKind(request.kind),
    "You do not have permission to delete this inventory entry.",
  );

  let reversalRequest: InventoryRequest | undefined;
  if (request.status === "posted") {
    const quantityBefore =
      request.kind === "stock-count" ? await loadFirstLedgerBefore(db, request.id) : null;
    const reversalMutation = buildReversalMutation(
      actor.id,
      request,
      "Deleted from Inventory OPS.",
      quantityBefore,
    );
    const reversalResult = await recordInventoryMutation(db, snapshot, reversalMutation);
    snapshot = reversalResult.snapshot;
    reversalRequest = reversalResult.event.request;
  }

  await markInventoryRequestDeleted(
    db,
    request.id,
    actor.id,
    buildInventoryActionNote(
      request.note,
      "Deleted",
      actor.name,
      "Entry was removed from Inventory OPS.",
      reversalRequest?.reference,
    ),
  );

  return {
    snapshot: await loadSnapshot(db),
    reversalRequest,
  };
}

export async function applyMutationsToD1(
  db: D1Database,
  mutations: MutationEnvelope[],
): Promise<PushResponse> {
  await ensureDatabaseReady(db);

  let snapshot = await loadSnapshot(db);
  const appliedMutationIds: string[] = [];
  const rejected: Array<{ clientMutationId: string; reason: string }> = [];
  const events: SyncEvent[] = [];

  for (const mutation of mutations) {
    const existing = await first<ExistingEventRow>(
      db,
      "SELECT payload_json FROM sync_events WHERE mutation_id = ?",
      [mutation.clientMutationId],
    );

    if (existing) {
      appliedMutationIds.push(mutation.clientMutationId);
      continue;
    }

    try {
      const result = await recordInventoryMutation(db, snapshot, mutation);
      snapshot = result.snapshot;
      appliedMutationIds.push(mutation.clientMutationId);
      events.push(result.event);
    } catch (error) {
      rejected.push({
        clientMutationId: mutation.clientMutationId,
        reason: error instanceof Error ? error.message : "Mutation rejected.",
      });
    }
  }

  return {
    appliedMutationIds,
    rejected,
    events,
    cursor: snapshot.syncCursor,
    snapshot,
  };
}
