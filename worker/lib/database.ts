import {
  DEFAULT_CURRENCY,
  DEFAULT_TIME_SOURCE,
  DEFAULT_TIMEZONE,
  DEFAULT_WORKSPACE_LOCATION,
  createDefaultNotificationSettings,
  createDefaultReportPrintTemplate,
} from "../../shared/defaults";
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLE_PRESETS,
  permissionsForRole,
} from "../../shared/permissions";
import { OPERATION_LABELS, applyMutation } from "../../shared/operations";
import type { MutationResult } from "../../shared/operations";
import {
  buildBootstrapPayload,
  expiredAlerts,
  lowStockAlerts,
  nearExpiryAlerts,
} from "../../shared/selectors";
import type {
  ActivateSuperadminRequest,
  ActivityLog,
  BarcodeType,
  BatchBarcode,
  BootstrapPayload,
  ChangeOwnPasswordRequest,
  DailySummaryNotificationSettings,
  CreateItemRequest,
  CreateItemResponse,
  CreateLocationRequest,
  CreateLocationResponse,
  CreateUserRequest,
  CreateMarketPriceRequest,
  CreateMarketPriceResponse,
  CreateSupplierRequest,
  CreateSupplierResponse,
  ApproveInventoryRequest,
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
  ItemBarcode,
  ItemUnitConversion,
  ItemStock,
  LoginRequest,
  LoginResponse,
  Location,
  MarketPriceEntry,
  MutationEnvelope,
  NotificationActionResponse,
  NotificationChannel,
  NotificationRecord,
  NotificationRuleSettings,
  NotificationSettings,
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  PermissionKey,
  PrintLayoutBlock,
  PullResponse,
  PushResponse,
  RequestAttachment,
  RequestAttachmentInput,
  RequestAttachmentScope,
  RequestKind,
  ReportSyncFailureRequest,
  ReportPrintTemplate,
  RejectInventoryRequest,
  ReverseInventoryRequest,
  ResetUserPasswordRequest,
  RemoveUserRequest,
  ProfileResponse,
  StockBatch,
  Supplier,
  SyncEvent,
  SettingsResponse,
  MarkNotificationReadRequest,
  TestTelegramNotificationRequest,
  TestTelegramNotificationResponse,
  UpdateItemRequest,
  UpdateItemResponse,
  UpdateLocationRequest,
  UpdateLocationResponse,
  UpdateMarketPriceRequest,
  UpdateMarketPriceResponse,
  UpdateOwnProfileRequest,
  UpdateSettingsRequest,
  UpdateRolePermissionsRequest,
  UpdateSupplierRequest,
  UpdateSupplierResponse,
  TimeSource,
  UpdateUserRequest,
  User,
  WasteEntry,
  UserAdminResponse,
  RolePermissionsResponse,
} from "../../shared/types";
import { OMNISTOCK_D1_SCHEMA_SQL } from "./schema";

type D1Value = string | number | null;
type LegacyNotificationSettingsInput = NotificationSettings & {
  telegramBotToken?: string;
};
type NotificationSecretContext = {
  appSecretsKey?: string;
  legacyTelegramBotToken?: string;
};

const SETTINGS_ID = "stg-00001";
const SEQUENCE_DEFAULT_WIDTH = 5;
const DOCUMENT_SEQUENCE_START = 1001;
const PASSWORD_ITERATIONS = 100_000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const DAILY_SUMMARY_STATE_PREFIX = "daily_summary_sent_on:";
const MAX_REQUEST_ATTACHMENT_COUNT = 4;
const MAX_REQUEST_ATTACHMENT_BYTES = 450_000;
const MAX_TOTAL_REQUEST_ATTACHMENT_BYTES = 1_200_000;
const textEncoder = new TextEncoder();

const NOTIFICATION_TYPE_TO_SETTINGS_KEY: Record<
  Exclude<NotificationType, "daily-summary">,
  keyof Omit<
    NotificationSettings,
    | "telegramEnabled"
    | "telegramChatId"
    | "telegramTokenConfigured"
    | "dailySummary"
    | "wastageCostThreshold"
  >
> = {
  "low-stock": "lowStock",
  "near-expiry": "nearExpiry",
  expired: "expired",
  "approval-request": "approvalRequests",
  "failed-sync": "failedSync",
  "wastage-threshold": "wastageThresholdExceeded",
};

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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hexToBytes(hex: string): Uint8Array {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
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

function todayKeyInTimeZone(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hourInTimeZone(timeZone: string, date = new Date()): number {
  return Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date),
    10,
  );
}

function normalizeNotificationRule<T extends object>(
  input: Partial<T> | undefined,
  fallback: T,
): T {
  return {
    ...fallback,
    ...(typeof input === "object" && input ? input : {}),
  } as T;
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
      salt: toArrayBuffer(hexToBytes(saltHex)),
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
  return permissionsForRole(role);
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

function sanitizeRequestedPermissions(
  role: User["role"],
  requestedPermissions?: PermissionKey[],
): PermissionKey[] {
  if (role === "superadmin") {
    return [...ALL_PERMISSIONS];
  }

  const normalized = [...new Set(requestedPermissions ?? rolePermissions(role))];
  for (const permission of normalized) {
    if (!ALL_PERMISSIONS.includes(permission)) {
      throw new Error(`Unknown permission code: ${permission}`);
    }
  }

  return normalized.sort();
}

function sanitizeAttachmentInputs(
  attachments?: RequestAttachmentInput[],
): RequestAttachmentInput[] {
  const sanitized = (attachments ?? [])
    .slice(0, MAX_REQUEST_ATTACHMENT_COUNT)
    .map((attachment) => ({
      fileName: attachment.fileName.trim(),
      mimeType: attachment.mimeType.trim().toLowerCase(),
      sizeBytes: Number(attachment.sizeBytes),
      dataUrl: attachment.dataUrl.trim(),
    }))
    .filter((attachment) => attachment.fileName && attachment.mimeType && attachment.dataUrl);

  const totalBytes = sanitized.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  if (sanitized.length > MAX_REQUEST_ATTACHMENT_COUNT) {
    throw new Error(`Only ${MAX_REQUEST_ATTACHMENT_COUNT} evidence files can be attached to a request.`);
  }
  if (totalBytes > MAX_TOTAL_REQUEST_ATTACHMENT_BYTES) {
    throw new Error("The combined evidence files are too large for this request.");
  }

  for (const attachment of sanitized) {
    if (!attachment.mimeType.startsWith("image/") && attachment.mimeType !== "application/pdf") {
      throw new Error(`Attachment ${attachment.fileName} must be an image or PDF evidence file.`);
    }
    if (
      !attachment.dataUrl.startsWith(`data:${attachment.mimeType};base64,`) &&
      !attachment.dataUrl.startsWith(`data:${attachment.mimeType},`)
    ) {
      throw new Error(`Attachment ${attachment.fileName} has an invalid encoded payload.`);
    }
    if (!Number.isFinite(attachment.sizeBytes) || attachment.sizeBytes <= 0) {
      throw new Error(`Attachment ${attachment.fileName} has an invalid file size.`);
    }
    if (attachment.sizeBytes > MAX_REQUEST_ATTACHMENT_BYTES) {
      throw new Error(`Attachment ${attachment.fileName} is too large.`);
    }
  }

  return sanitized;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

async function importSecretsKey(appSecretsKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(appSecretsKey.trim()),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecretValue(
  value: string,
  appSecretsKey?: string,
): Promise<{ ciphertext: string; iv: string }> {
  const trimmedKey = appSecretsKey?.trim() ?? "";
  if (!trimmedKey) {
    throw new Error("Configure the APP_SECRETS_KEY Worker secret before saving encrypted bot tokens.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importSecretsKey(trimmedKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(value),
  );

  return {
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
    iv: encodeBase64(iv),
  };
}

async function decryptSecretValue(
  ciphertext: string,
  iv: string,
  appSecretsKey?: string,
): Promise<string> {
  const trimmedKey = appSecretsKey?.trim() ?? "";
  if (!trimmedKey) {
    throw new Error("Configure the APP_SECRETS_KEY Worker secret before using encrypted bot tokens.");
  }

  const key = await importSecretsKey(trimmedKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(decodeBase64(iv)) },
    key,
    toArrayBuffer(decodeBase64(ciphertext)),
  );

  return new TextDecoder().decode(decrypted);
}

async function resolveTelegramBotToken(
  db: D1Database,
  secretContext: NotificationSecretContext = {},
): Promise<string> {
  const row = await first<{
    telegram_token_ciphertext: string | null;
    telegram_token_iv: string | null;
  }>(
    db,
    "SELECT telegram_token_ciphertext, telegram_token_iv FROM app_settings WHERE id = ? LIMIT 1",
    [SETTINGS_ID],
  );

  if (row?.telegram_token_ciphertext && row.telegram_token_iv) {
    try {
      return await decryptSecretValue(
        row.telegram_token_ciphertext,
        row.telegram_token_iv,
        secretContext.appSecretsKey,
      );
    } catch (error) {
      const fallbackToken = secretContext.legacyTelegramBotToken?.trim() ?? "";
      if (fallbackToken) {
        return fallbackToken;
      }
      throw error;
    }
  }

  return secretContext.legacyTelegramBotToken?.trim() ?? "";
}

async function persistRequestAttachments(
  db: D1Database,
  requestId: string,
  scope: RequestAttachmentScope,
  attachments: RequestAttachmentInput[] | undefined,
  uploadedBy: string,
  uploadedByName: string,
  uploadedAt: string,
  replaceExisting = false,
): Promise<RequestAttachment[]> {
  const sanitized = sanitizeAttachmentInputs(attachments);

  if (replaceExisting) {
    await execute(
      db,
      "DELETE FROM inventory_request_attachments WHERE request_id = ? AND scope = ?",
      [requestId, scope],
    );
  }

  const persisted: RequestAttachment[] = [];
  for (const attachment of sanitized) {
    const id = await reserveNextId(db, "inventory_request_attachments", "rat");
    await execute(
      db,
      "INSERT INTO inventory_request_attachments (id, sequence_no, request_id, scope, file_name, mime_type, size_bytes, data_url, uploaded_by, uploaded_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        numberPart(id),
        requestId,
        scope,
        attachment.fileName,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.dataUrl,
        uploadedBy,
        uploadedAt,
        uploadedAt,
        uploadedAt,
      ],
    );

    persisted.push({
      id,
      requestId,
      scope,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      dataUrl: attachment.dataUrl,
      uploadedBy,
      uploadedByName,
      uploadedAt,
    });
  }

  return persisted;
}

function permissionsDifferFromRoleDefaults(
  roleDefaults: PermissionKey[],
  permissions: PermissionKey[],
): boolean {
  const expected = [...roleDefaults].sort();
  if (expected.length !== permissions.length) {
    return true;
  }

  return expected.some((permission, index) => permission !== permissions[index]);
}

function ensureManagePermissionsAllowed(
  actor: User,
  permissions: PermissionKey[],
  roleDefaults: PermissionKey[],
): void {
  if (!permissionsDifferFromRoleDefaults(roleDefaults, permissions)) {
    return;
  }

  requirePermission(
    actor,
    "admin.permissions.manage",
    "You do not have permission to override user permissions.",
  );

  if (permissions.includes("admin.permissions.manage") && actor.role !== "superadmin") {
    throw new Error("Only superadmin users can grant permission-management access.");
  }

  if (permissions.includes("admin.permissions.edit") && actor.role !== "superadmin") {
    throw new Error("Only superadmin users can grant role-permission edit access.");
  }
}

function ensurePrivilegedUserManagementAllowed(
  actor: User,
  targetRole: User["role"],
  actionLabel: string,
): void {
  if (targetRole === "superadmin" && actor.role !== "superadmin") {
    throw new Error(`Only superadmin users can ${actionLabel} a superadmin account.`);
  }
}

function validateNotificationSettings(
  input: NotificationSettings | LegacyNotificationSettingsInput | undefined,
): NotificationSettings {
  const fallback = createDefaultNotificationSettings();
  const safeInput = (input ?? fallback) as NotificationSettings & {
    telegramBotToken?: string;
  };
  const dailySummaryInput = safeInput.dailySummary ?? fallback.dailySummary;
  const dailySummaryHour = Number(dailySummaryInput.hour);
  const wastageCostThreshold = Number(safeInput.wastageCostThreshold);
  const templates = Object.fromEntries(
    (Object.keys(fallback.templates) as NotificationType[]).map((type) => {
      const inputTemplate = safeInput.templates?.[type];
      const fallbackTemplate = fallback.templates[type];
      return [
        type,
        {
          title:
            typeof inputTemplate?.title === "string" && inputTemplate.title.trim()
              ? inputTemplate.title.trim()
              : fallbackTemplate.title,
          body:
            typeof inputTemplate?.body === "string" && inputTemplate.body.trim()
              ? inputTemplate.body.trim()
              : fallbackTemplate.body,
        },
      ];
    }),
  ) as NotificationSettings["templates"];
  const style = {
    telegramHeader:
      typeof safeInput.style?.telegramHeader === "string" &&
      safeInput.style.telegramHeader.trim()
        ? safeInput.style.telegramHeader.trim()
        : fallback.style.telegramHeader,
    telegramFooter:
      typeof safeInput.style?.telegramFooter === "string"
        ? safeInput.style.telegramFooter.trim()
        : fallback.style.telegramFooter,
    includeTimestamp:
      typeof safeInput.style?.includeTimestamp === "boolean"
        ? safeInput.style.includeTimestamp
        : fallback.style.includeTimestamp,
  };

  const normalized: NotificationSettings = {
    telegramEnabled: Boolean(safeInput.telegramEnabled),
    telegramChatId: String(safeInput.telegramChatId ?? "").trim(),
    telegramTokenConfigured: Boolean(safeInput.telegramTokenConfigured),
    lowStock: normalizeNotificationRule(safeInput.lowStock, fallback.lowStock),
    nearExpiry: normalizeNotificationRule(safeInput.nearExpiry, fallback.nearExpiry),
    expired: normalizeNotificationRule(safeInput.expired, fallback.expired),
    approvalRequests: normalizeNotificationRule(
      safeInput.approvalRequests,
      fallback.approvalRequests,
    ),
    failedSync: normalizeNotificationRule(safeInput.failedSync, fallback.failedSync),
    wastageThresholdExceeded: normalizeNotificationRule(
      safeInput.wastageThresholdExceeded,
      fallback.wastageThresholdExceeded,
    ),
    dailySummary: {
      ...(normalizeNotificationRule(
        dailySummaryInput,
        fallback.dailySummary,
      ) as DailySummaryNotificationSettings),
      hour:
        Number.isFinite(dailySummaryHour) && dailySummaryHour >= 0 && dailySummaryHour <= 23
          ? Math.floor(dailySummaryHour)
          : fallback.dailySummary.hour,
      scope:
        dailySummaryInput.scope === "branch" || dailySummaryInput.scope === "warehouse"
          ? dailySummaryInput.scope
          : fallback.dailySummary.scope,
    },
    wastageCostThreshold:
      Number.isFinite(wastageCostThreshold) && wastageCostThreshold >= 0
        ? wastageCostThreshold
        : fallback.wastageCostThreshold,
    style,
    templates,
  };

  const telegramRequested =
    normalized.lowStock.telegram ||
    normalized.nearExpiry.telegram ||
    normalized.expired.telegram ||
    normalized.approvalRequests.telegram ||
    normalized.failedSync.telegram ||
    normalized.wastageThresholdExceeded.telegram ||
    normalized.dailySummary.telegram;

  if (
    normalized.telegramEnabled &&
    telegramRequested &&
    normalized.telegramChatId &&
    !/^(-?\d{6,}|@\w{5,})$/.test(normalized.telegramChatId)
  ) {
    throw new Error(
      "Telegram chat ID must be a numeric chat ID like -1001234567890 or a channel username like @omnistock_alerts.",
    );
  }

  return normalized;
}

function validateEnvironmentSettings(
  input: UpdateSettingsRequest,
  companyName = "OmniStock",
): UpdateSettingsRequest {
  const workspaceLocation = input.workspaceLocation.trim() || DEFAULT_WORKSPACE_LOCATION;
  const currency = input.currency.trim().toUpperCase() || DEFAULT_CURRENCY;
  const timezone = input.timezone.trim();
  if (!timezone) {
    throw new Error("Timezone is required.");
  }

  const lowStockThreshold = Number(input.lowStockThreshold);
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    throw new Error("Low stock threshold must be zero or greater.");
  }

  const expiryAlertDays = Number(input.expiryAlertDays);
  if (!Number.isFinite(expiryAlertDays) || expiryAlertDays < 0) {
    throw new Error("Expiry alert days must be zero or greater.");
  }

  const notificationSettings = validateNotificationSettings(input.notificationSettings);
  const timeSource: TimeSource = input.timeSource === "browser" ? "browser" : DEFAULT_TIME_SOURCE;
  const fallbackTemplate = createDefaultReportPrintTemplate(companyName);
  const template = input.reportPrintTemplate;
  const accentColor =
    typeof template?.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(template.accentColor)
      ? template.accentColor
      : fallbackTemplate.accentColor;
  const fallbackBlocks = fallbackTemplate.layoutBlocks;
  const reportLayoutBlocks: PrintLayoutBlock[] = Array.isArray(template?.layoutBlocks)
    ? template.layoutBlocks
        .map((block, index) => {
          const fallbackBlock = fallbackBlocks[index] ?? fallbackBlocks[0];
          if (!block || typeof block !== "object" || typeof fallbackBlock !== "object") {
            return null;
          }

          const type =
            typeof block.type === "string" &&
            fallbackBlocks.some((candidate) => candidate.type === block.type)
              ? block.type
              : fallbackBlock.type;

          return {
            id:
              typeof block.id === "string" && block.id.trim()
                ? block.id.trim()
                : `blk-${type}-${index + 1}`,
            type,
            label:
              typeof block.label === "string" && block.label.trim()
                ? block.label.trim()
                : fallbackBlocks.find((candidate) => candidate.type === type)?.label ??
                  fallbackBlock.label,
            enabled:
              typeof block.enabled === "boolean" ? block.enabled : fallbackBlock.enabled,
            content:
              typeof block.content === "string" ? block.content : fallbackBlock.content,
            x:
              Number.isFinite(Number(block.x)) && Number(block.x) >= 0
                ? Math.min(100, Math.max(0, Number(block.x)))
                : fallbackBlock.x,
            y:
              Number.isFinite(Number(block.y)) && Number(block.y) >= 0
                ? Math.min(100, Math.max(0, Number(block.y)))
                : fallbackBlock.y,
            z:
              Number.isFinite(Number(block.z)) && Number(block.z) >= 0
                ? Math.floor(Number(block.z))
                : fallbackBlock.z,
            width:
              Number.isFinite(Number(block.width)) && Number(block.width) >= 10
                ? Math.min(100, Math.max(10, Number(block.width)))
                : fallbackBlock.width,
            minHeight:
              Number.isFinite(Number(block.minHeight)) && Number(block.minHeight) >= 48
                ? Math.min(960, Math.max(48, Number(block.minHeight)))
                : fallbackBlock.minHeight,
          } satisfies PrintLayoutBlock;
        })
        .filter((block): block is PrintLayoutBlock => Boolean(block))
    : fallbackBlocks;
  const reportPrintTemplate: ReportPrintTemplate = {
    templateName:
      typeof template?.templateName === "string" && template.templateName.trim()
        ? template.templateName.trim()
        : fallbackTemplate.templateName,
    accentColor,
    paperSize:
      template?.paperSize === "letter" || template?.paperSize === "a4"
        ? template.paperSize
        : fallbackTemplate.paperSize,
    orientation:
      template?.orientation === "landscape" || template?.orientation === "portrait"
        ? template.orientation
        : fallbackTemplate.orientation,
    density:
      template?.density === "compact" || template?.density === "comfortable"
        ? template.density
        : fallbackTemplate.density,
    marginMm:
      Number.isFinite(Number(template?.marginMm)) && Number(template?.marginMm) >= 6
        ? Number(template.marginMm)
        : fallbackTemplate.marginMm,
    headerNote:
      typeof template?.headerNote === "string"
        ? template.headerNote.trim()
        : fallbackTemplate.headerNote,
    footerNote:
      typeof template?.footerNote === "string"
        ? template.footerNote.trim()
        : fallbackTemplate.footerNote,
    showCompanyName:
      typeof template?.showCompanyName === "boolean"
        ? template.showCompanyName
        : fallbackTemplate.showCompanyName,
    showGeneratedAt:
      typeof template?.showGeneratedAt === "boolean"
        ? template.showGeneratedAt
        : fallbackTemplate.showGeneratedAt,
    showGeneratedBy:
      typeof template?.showGeneratedBy === "boolean"
        ? template.showGeneratedBy
        : fallbackTemplate.showGeneratedBy,
    showFilters:
      typeof template?.showFilters === "boolean"
        ? template.showFilters
        : fallbackTemplate.showFilters,
    showSummary:
      typeof template?.showSummary === "boolean"
        ? template.showSummary
        : fallbackTemplate.showSummary,
    showSignatures:
      typeof template?.showSignatures === "boolean"
        ? template.showSignatures
        : fallbackTemplate.showSignatures,
    signatureLabelLeft:
      typeof template?.signatureLabelLeft === "string" && template.signatureLabelLeft.trim()
        ? template.signatureLabelLeft.trim()
        : fallbackTemplate.signatureLabelLeft,
    signatureLabelRight:
      typeof template?.signatureLabelRight === "string" && template.signatureLabelRight.trim()
        ? template.signatureLabelRight.trim()
        : fallbackTemplate.signatureLabelRight,
    layoutBlocks: reportLayoutBlocks.length ? reportLayoutBlocks : fallbackBlocks,
  };

  return {
    workspaceLocation,
    currency,
    timezone,
    timeSource,
    lowStockThreshold,
    expiryAlertDays,
    enableOffline: Boolean(input.enableOffline),
    enableRealtime: Boolean(input.enableRealtime),
    enableBarcode: Boolean(input.enableBarcode),
    strictFefo: Boolean(input.strictFefo),
    reportPrintTemplate,
    notificationSettings,
    telegramBotTokenInput:
      typeof input.telegramBotTokenInput === "string" ? input.telegramBotTokenInput.trim() : "",
    clearTelegramBotToken:
      !input.telegramBotTokenInput?.trim() && Boolean(input.clearTelegramBotToken),
  };
}

async function replaceUserPermissionOverrides(
  db: D1Database,
  userId: string,
  roleDefaults: PermissionKey[],
  permissions: PermissionKey[],
  updatedAt: string,
): Promise<void> {
  const desiredPermissions = new Set(permissions);
  const defaultPermissions = new Set(roleDefaults);

  await execute(db, "DELETE FROM user_permission_overrides WHERE user_id = ?", [userId]);

  for (const permission of ALL_PERMISSIONS) {
    const shouldHavePermission = desiredPermissions.has(permission);
    const roleHasPermission = defaultPermissions.has(permission);
    if (shouldHavePermission === roleHasPermission) {
      continue;
    }

    await execute(
      db,
      "INSERT INTO user_permission_overrides (user_id, permission_code, is_allowed, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [userId, permission, shouldHavePermission ? 1 : 0, updatedAt, updatedAt],
    );
  }
}

async function seedReferenceData(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  for (const [roleCode, preset] of Object.entries(ROLE_PRESETS)) {
    await execute(
      db,
      "INSERT OR REPLACE INTO roles (code, label, description, created_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM roles WHERE code = ?), ?))",
      [roleCode, preset.label, preset.description, roleCode, now],
    );
  }

  for (const permission of PERMISSION_CATALOG) {
    await execute(
      db,
      "INSERT OR REPLACE INTO permissions (code, module_key, label, created_at) VALUES (?, ?, ?, COALESCE((SELECT created_at FROM permissions WHERE code = ?), ?))",
      [permission.code, permission.moduleKey, permission.label, permission.code, now],
    );
  }

  for (const [roleCode, preset] of Object.entries(ROLE_PRESETS)) {
    const existingPermissionCount = await first<CountRow>(
      db,
      "SELECT COUNT(*) AS count FROM role_permissions WHERE role_code = ?",
      [roleCode],
    );
    if (Number(existingPermissionCount?.count ?? 0) > 0) {
      continue;
    }

    for (const permissionCode of preset.permissions) {
      await execute(
        db,
        "INSERT INTO role_permissions (role_code, permission_code, created_at) VALUES (?, ?, ?)",
        [roleCode, permissionCode, now],
      );
    }
  }

  await execute(
    db,
    "INSERT OR IGNORE INTO system_state (key, value_integer, value_text, updated_at) VALUES ('latest_cursor', 0, NULL, ?)",
    [now],
  );
}

async function scrubLegacyTelegramBotToken(db: D1Database): Promise<void> {
  if (!(await tableExists(db, "app_settings"))) {
    return;
  }

  const row = await first<{ id: string; notification_settings_json: string | null }>(
    db,
    "SELECT id, notification_settings_json FROM app_settings WHERE id = ? LIMIT 1",
    [SETTINGS_ID],
  );
  if (!row?.notification_settings_json) {
    return;
  }

  try {
    const parsed = JSON.parse(row.notification_settings_json) as LegacyNotificationSettingsInput;
    if (!Object.prototype.hasOwnProperty.call(parsed, "telegramBotToken")) {
      return;
    }

    delete parsed.telegramBotToken;
    await execute(
      db,
      "UPDATE app_settings SET notification_settings_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(validateNotificationSettings(parsed)), new Date().toISOString(), row.id],
    );
  } catch {
    // Ignore malformed legacy settings rows; the runtime validation path already falls back safely.
  }
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

  if (!(await tableExists(db, "user_permission_overrides"))) {
    await executeScript(
      db,
      `
      CREATE TABLE IF NOT EXISTS user_permission_overrides (
        user_id TEXT NOT NULL,
        permission_code TEXT NOT NULL,
        is_allowed INTEGER NOT NULL CHECK (is_allowed IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, permission_code),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
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

  if (!(await tableExists(db, "item_barcodes"))) {
    await executeScript(
      db,
      `
      CREATE TABLE IF NOT EXISTS item_barcodes (
        id TEXT PRIMARY KEY,
        sequence_no INTEGER NOT NULL UNIQUE,
        item_id TEXT NOT NULL,
        barcode TEXT NOT NULL UNIQUE,
        barcode_type TEXT NOT NULL CHECK (barcode_type IN ('primary', 'secondary', 'packaging')),
        unit_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      ) STRICT;
    `,
    );
  }

  if (!(await tableExists(db, "item_unit_conversions"))) {
    await executeScript(
      db,
      `
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
    `,
    );
  }

  if (!(await tableExists(db, "batch_barcodes"))) {
    await executeScript(
      db,
      `
      CREATE TABLE IF NOT EXISTS batch_barcodes (
        id TEXT PRIMARY KEY,
        sequence_no INTEGER NOT NULL UNIQUE,
        batch_id TEXT NOT NULL,
        barcode TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id) ON DELETE CASCADE
      ) STRICT;
    `,
    );
  }

  if (!(await columnExists(db, "item_barcodes", "unit_name"))) {
    await execute(
      db,
      "ALTER TABLE item_barcodes ADD COLUMN unit_name TEXT NOT NULL DEFAULT 'unit'",
    );
  }

  if (!(await columnExists(db, "inventory_request_lines", "lot_code"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN lot_code TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "base_quantity"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN base_quantity REAL");
  }
  if (!(await columnExists(db, "inventory_request_lines", "base_unit"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN base_unit TEXT");
  }
  if (!(await columnExists(db, "inventory_request_lines", "unit_factor"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN unit_factor REAL");
  }
  if (!(await columnExists(db, "inventory_request_lines", "batch_barcode"))) {
    await execute(db, "ALTER TABLE inventory_request_lines ADD COLUMN batch_barcode TEXT");
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
  if (!(await tableExists(db, "inventory_request_attachments"))) {
    await executeScript(
      db,
      `
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
      `,
    );
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
  if (!(await columnExists(db, "app_settings", "time_source"))) {
    await execute(
      db,
      `ALTER TABLE app_settings ADD COLUMN time_source TEXT NOT NULL DEFAULT '${DEFAULT_TIME_SOURCE}'`,
    );
  }
  if (!(await columnExists(db, "app_settings", "workspace_location"))) {
    await execute(
      db,
      `ALTER TABLE app_settings ADD COLUMN workspace_location TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_LOCATION}'`,
    );
  }
  if (!(await columnExists(db, "app_settings", "report_print_template_json"))) {
    await execute(
      db,
      "ALTER TABLE app_settings ADD COLUMN report_print_template_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
  if (!(await columnExists(db, "app_settings", "notification_settings_json"))) {
    await execute(
      db,
      "ALTER TABLE app_settings ADD COLUMN notification_settings_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
  if (!(await columnExists(db, "app_settings", "telegram_token_ciphertext"))) {
    await execute(
      db,
      "ALTER TABLE app_settings ADD COLUMN telegram_token_ciphertext TEXT",
    );
  }
  if (!(await columnExists(db, "app_settings", "telegram_token_iv"))) {
    await execute(
      db,
      "ALTER TABLE app_settings ADD COLUMN telegram_token_iv TEXT",
    );
  }

  if (!(await tableExists(db, "notifications"))) {
    await executeScript(
      db,
      `
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
      ) STRICT
    `,
    );
  }

  if (!(await tableExists(db, "notification_deliveries"))) {
    await executeScript(
      db,
      `
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
      ) STRICT
    `,
    );
  }

  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_notifications_type_created_at ON notifications(type, created_at DESC)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_notifications_status_created_at ON notifications(status, created_at DESC)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_notifications_resolved_at ON notifications(resolved_at)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification_id ON notification_deliveries(notification_id)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_attempted_at ON notification_deliveries(status, attempted_at DESC)",
  );
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
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id ON item_barcodes(item_id)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_item_barcodes_barcode_type ON item_barcodes(barcode_type)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_item_unit_conversions_item_id ON item_unit_conversions(item_id)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_batch_barcodes_batch_id ON batch_barcodes(batch_id)",
  );
  await execute(db, "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)");
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)",
  );
  await execute(
    db,
    "CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_id ON user_permission_overrides(user_id)",
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
    "CREATE INDEX IF NOT EXISTS idx_inventory_request_attachments_request_scope ON inventory_request_attachments(request_id, scope, uploaded_at DESC)",
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
  await execute(
    db,
    `UPDATE item_barcodes
     SET unit_name = (
       SELECT i.unit
       FROM items i
       WHERE i.id = item_barcodes.item_id
     )
     WHERE unit_name IS NULL OR trim(unit_name) = '' OR unit_name = 'unit'`,
  );
  await execute(
    db,
    `UPDATE inventory_request_lines
     SET base_quantity = quantity
     WHERE base_quantity IS NULL`,
  );
  await execute(
    db,
    `UPDATE inventory_request_lines
     SET base_unit = unit
     WHERE base_unit IS NULL OR trim(base_unit) = ''`,
  );
  await execute(
    db,
    `UPDATE inventory_request_lines
     SET unit_factor = 1
     WHERE unit_factor IS NULL OR unit_factor <= 0`,
  );

  const orphanPrimaryBarcodes = await all<{
    id: string;
    barcode: string;
    unit: string;
    updated_at: string;
  }>(
    db,
    `SELECT i.id, i.barcode, i.unit, i.updated_at
     FROM items i
     LEFT JOIN item_barcodes ib
       ON ib.item_id = i.id
       AND ib.barcode = i.barcode
       AND ib.barcode_type = 'primary'
     WHERE ib.id IS NULL`,
  );
  for (const row of orphanPrimaryBarcodes) {
    const barcodeId = await reserveNextId(db, "item_barcodes", "ibc");
    await execute(
      db,
      "INSERT INTO item_barcodes (id, sequence_no, item_id, barcode, barcode_type, unit_name, created_at, updated_at) VALUES (?, ?, ?, ?, 'primary', ?, ?, ?)",
      [
        barcodeId,
        numberPart(barcodeId),
        row.id,
        row.barcode,
        row.unit,
        row.updated_at,
        row.updated_at,
      ],
    );
  }

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
  await scrubLegacyTelegramBotToken(db);
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

interface UserPermissionOverrideRow {
  user_id: string;
  permission_code: PermissionKey;
  is_allowed: number;
}

interface RolePermissionRow {
  role_code: User["role"];
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

interface ItemBarcodeRow {
  id: string;
  item_id: string;
  barcode: string;
  barcode_type: BarcodeType;
  unit_name: string;
  created_at: string;
}

interface ItemUnitConversionRow {
  id: string;
  item_id: string;
  unit_name: string;
  quantity_in_base: number;
  created_at: string;
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

interface BatchBarcodeRow {
  id: string;
  batch_id: string;
  barcode: string;
  created_at: string;
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
  base_quantity: number | null;
  base_unit: string | null;
  unit_factor: number | null;
  counted_quantity: number | null;
  lot_code: string | null;
  batch_barcode: string | null;
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

interface RequestAttachmentRow {
  id: string;
  request_id: string;
  scope: RequestAttachmentScope;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_url: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: string;
}

interface InventoryRequestActionRow {
  id: string;
  line_id: string;
  reference: string;
  kind: RequestKind;
  status: InventoryRequest["status"];
  item_id: string;
  barcode: string;
  quantity: number;
  base_quantity: number | null;
  base_unit: string | null;
  unit_factor: number | null;
  counted_quantity: number | null;
  lot_code: string | null;
  batch_barcode: string | null;
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
  workspace_location: string;
  currency: string;
  timezone: string;
  time_source: TimeSource;
  low_stock_threshold: number;
  expiry_alert_days: number;
  enable_offline: number;
  enable_realtime: number;
  enable_barcode: number;
  strict_fefo: number;
  report_print_template_json: string;
  notification_settings_json: string;
  telegram_token_ciphertext: string | null;
  telegram_token_iv: string | null;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  status: NotificationStatus;
  channels_json: string;
  item_id: string | null;
  item_name: string | null;
  location_id: string | null;
  location_name: string | null;
  request_id: string | null;
  metadata_json: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface ExistingEventRow {
  payload_json: string;
}

function mapBatchBarcodesByBatch(batchBarcodeRows: BatchBarcodeRow[]): Map<string, BatchBarcode[]> {
  const map = new Map<string, BatchBarcode[]>();
  for (const row of batchBarcodeRows) {
    const current = map.get(row.batch_id) ?? [];
    current.push({
      id: row.id,
      batchId: row.batch_id,
      barcode: row.barcode,
      createdAt: row.created_at,
    });
    map.set(row.batch_id, current);
  }
  return map;
}

function mapRequestAttachmentsByRequest(
  attachmentRows: RequestAttachmentRow[],
): Map<string, { request: RequestAttachment[]; decision: RequestAttachment[] }> {
  const map = new Map<string, { request: RequestAttachment[]; decision: RequestAttachment[] }>();
  for (const row of attachmentRows) {
    const current = map.get(row.request_id) ?? { request: [], decision: [] };
    const attachment: RequestAttachment = {
      id: row.id,
      requestId: row.request_id,
      scope: row.scope,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      dataUrl: row.data_url,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      uploadedAt: row.uploaded_at,
    };
    if (row.scope === "decision") {
      current.decision.push(attachment);
    } else {
      current.request.push(attachment);
    }
    map.set(row.request_id, current);
  }
  return map;
}

function mapBatchesByStock(
  batchRows: StockBatchRow[],
  batchBarcodeMap: Map<string, BatchBarcode[]>,
): Map<string, StockBatch[]> {
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
      barcodes: batchBarcodeMap.get(row.id) ?? [],
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
              barcodes: [],
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

function mapItemBarcodesByItem(itemBarcodeRows: ItemBarcodeRow[]): Map<string, ItemBarcode[]> {
  const map = new Map<string, ItemBarcode[]>();
  for (const row of itemBarcodeRows) {
    const current = map.get(row.item_id) ?? [];
    current.push({
      id: row.id,
      itemId: row.item_id,
      barcode: row.barcode,
      barcodeType: row.barcode_type,
      unitName: row.unit_name,
      createdAt: row.created_at,
    });
    map.set(row.item_id, current);
  }
  return map;
}

function mapItemUnitConversionsByItem(
  rows: ItemUnitConversionRow[],
): Map<string, ItemUnitConversion[]> {
  const map = new Map<string, ItemUnitConversion[]>();
  for (const row of rows) {
    const current = map.get(row.item_id) ?? [];
    current.push({
      id: row.id,
      itemId: row.item_id,
      unitName: row.unit_name,
      quantityInBase: Number(row.quantity_in_base),
      createdAt: row.created_at,
    });
    map.set(row.item_id, current);
  }
  return map;
}

function loadRolePermissionMapFromRows(
  rolePermissionRows: RolePermissionRow[],
): Record<User["role"], PermissionKey[]> {
  const roleMap = {
    superadmin: [...ALL_PERMISSIONS],
    admin: [] as PermissionKey[],
    manager: [] as PermissionKey[],
    worker: [] as PermissionKey[],
  } satisfies Record<User["role"], PermissionKey[]>;

  const seenPermissions = new Map<User["role"], Set<PermissionKey>>([
    ["admin", new Set<PermissionKey>()],
    ["manager", new Set<PermissionKey>()],
    ["worker", new Set<PermissionKey>()],
  ]);

  for (const row of rolePermissionRows) {
    if (row.role_code === "superadmin") {
      continue;
    }

    const bucket = seenPermissions.get(row.role_code);
    if (!bucket || bucket.has(row.permission_code)) {
      continue;
    }
    bucket.add(row.permission_code);
    roleMap[row.role_code].push(row.permission_code);
  }

  for (const role of ["admin", "manager", "worker"] as const) {
    roleMap[role] =
      roleMap[role].length > 0 ? roleMap[role].sort() : [...permissionsForRole(role)].sort();
  }

  return roleMap;
}

async function loadRolePermissionMap(db: D1Database): Promise<Record<User["role"], PermissionKey[]>> {
  const rows = await all<RolePermissionRow>(
    db,
    "SELECT role_code, permission_code FROM role_permissions ORDER BY role_code, permission_code",
  );
  return loadRolePermissionMapFromRows(rows);
}

function parseNotificationSettings(settingsRow: SettingsRow | null): NotificationSettings {
  try {
    const parsed = settingsRow?.notification_settings_json
      ? (JSON.parse(settingsRow.notification_settings_json) as NotificationSettings)
      : undefined;
    return {
      ...validateNotificationSettings(parsed),
      telegramTokenConfigured: Boolean(
        settingsRow?.telegram_token_ciphertext && settingsRow.telegram_token_iv,
      ),
    };
  } catch {
    return {
      ...createDefaultNotificationSettings(),
      telegramTokenConfigured: Boolean(
        settingsRow?.telegram_token_ciphertext && settingsRow.telegram_token_iv,
      ),
    };
  }
}

function parseNotificationRows(rows: NotificationRow[]): NotificationRecord[] {
  return rows.map((row) => {
    let channels: NotificationChannel[] = ["in-app"];
    let metadata: NotificationRecord["metadata"];

    try {
      const parsedChannels = JSON.parse(row.channels_json) as NotificationChannel[];
      if (Array.isArray(parsedChannels) && parsedChannels.length > 0) {
        channels = parsedChannels.filter(
          (channel): channel is NotificationChannel =>
            channel === "in-app" || channel === "telegram",
        );
      }
    } catch {
      channels = ["in-app"];
    }

    try {
      metadata = row.metadata_json
        ? (JSON.parse(row.metadata_json) as NotificationRecord["metadata"])
        : undefined;
    } catch {
      metadata = undefined;
    }

    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      status: row.status,
      channels,
      createdAt: row.created_at,
      readAt: row.read_at ?? undefined,
      resolvedAt: row.resolved_at ?? undefined,
      itemId: row.item_id ?? undefined,
      itemName: row.item_name ?? undefined,
      locationId: row.location_id ?? undefined,
      locationName: row.location_name ?? undefined,
      requestId: row.request_id ?? undefined,
      metadata,
    };
  });
}

export async function loadSnapshot(db: D1Database): Promise<InventorySnapshot> {
  await ensureDatabaseReady(db);

  const [
    locationRows,
    supplierRows,
    itemRows,
    itemBarcodeRows,
    itemUnitConversionRows,
    stockRows,
    batchRows,
    batchBarcodeRows,
    userRows,
    rolePermissionRows,
    overrideRows,
    assignmentRows,
    requestRows,
    attachmentRows,
    marketPriceRows,
    wasteEntryRows,
    ledgerRows,
    activityRows,
    notificationRows,
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
    all<ItemBarcodeRow>(
      db,
      "SELECT id, item_id, barcode, barcode_type, unit_name, created_at FROM item_barcodes ORDER BY sequence_no ASC",
    ),
    all<ItemUnitConversionRow>(
      db,
      "SELECT id, item_id, unit_name, quantity_in_base, created_at FROM item_unit_conversions ORDER BY sequence_no ASC",
    ),
    all<ItemStockRow>(
      db,
      "SELECT item_id, location_id, on_hand, reserved, min_level, max_level FROM item_stocks ORDER BY item_id, location_id",
    ),
    all<StockBatchRow>(
      db,
      "SELECT id, item_id, location_id, lot_code, quantity, received_at, expiry_date FROM stock_batches ORDER BY item_id, location_id, expiry_date, received_at",
    ),
    all<BatchBarcodeRow>(
      db,
      "SELECT id, batch_id, barcode, created_at FROM batch_barcodes ORDER BY sequence_no ASC",
    ),
    all<UserRow>(
      db,
      "SELECT id, name, username, email, role_code, status, last_seen_at FROM users ORDER BY sequence_no ASC",
    ),
    all<RolePermissionRow>(
      db,
      "SELECT role_code, permission_code FROM role_permissions ORDER BY role_code, permission_code",
    ),
    all<UserPermissionOverrideRow>(
      db,
      "SELECT user_id, permission_code, is_allowed FROM user_permission_overrides ORDER BY user_id, permission_code",
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
        rl.base_quantity,
        rl.base_unit,
        rl.unit_factor,
        rl.counted_quantity,
        rl.lot_code,
        rl.batch_barcode,
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
    all<RequestAttachmentRow>(
      db,
      `SELECT
        att.id,
        att.request_id,
        att.scope,
        att.file_name,
        att.mime_type,
        att.size_bytes,
        att.data_url,
        att.uploaded_by,
        u.name AS uploaded_by_name,
        att.uploaded_at
      FROM inventory_request_attachments att
      JOIN users u ON u.id = att.uploaded_by
      ORDER BY att.uploaded_at ASC, att.sequence_no ASC`,
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
    all<NotificationRow>(
      db,
      `SELECT
        id,
        type,
        severity,
        title,
        message,
        status,
        channels_json,
        item_id,
        item_name,
        location_id,
        location_name,
        request_id,
        metadata_json,
        read_at,
        resolved_at,
        created_at
      FROM notifications
      ORDER BY created_at DESC, sequence_no DESC
      LIMIT 180`,
    ),
    first<SettingsRow>(
      db,
        "SELECT company_name, workspace_location, currency, timezone, time_source, low_stock_threshold, expiry_alert_days, enable_offline, enable_realtime, enable_barcode, strict_fefo, report_print_template_json, notification_settings_json, telegram_token_ciphertext, telegram_token_iv FROM app_settings LIMIT 1",
    ),
  ]);

  const cursor = await currentCursor(db);
  const itemBarcodeMap = mapItemBarcodesByItem(itemBarcodeRows);
  const itemUnitConversionMap = mapItemUnitConversionsByItem(itemUnitConversionRows);
  const batchBarcodeMap = mapBatchBarcodesByBatch(batchBarcodeRows);
  const batchMap = mapBatchesByStock(batchRows, batchBarcodeMap);
  const stockMap = mapStocksByItem(stockRows, batchMap);
  const rolePermissionMap = loadRolePermissionMapFromRows(rolePermissionRows);
  const notificationSettings = parseNotificationSettings(settingsRow);
  const requestAttachmentMap = mapRequestAttachmentsByRequest(attachmentRows);
  const assignmentMap = groupValues(
    assignmentRows.map((row) => ({ user_id: row.user_id, value: row.location_id })),
  );
  const permissionOverrideMap = new Map<string, UserPermissionOverrideRow[]>();
  for (const row of overrideRows) {
    const existingRows = permissionOverrideMap.get(row.user_id) ?? [];
    existingRows.push(row);
    permissionOverrideMap.set(row.user_id, existingRows);
  }

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
      barcodes: itemBarcodeMap.get(row.id) ?? [
        {
          id: `${row.id}-primary`,
          itemId: row.id,
          barcode: row.barcode,
          barcodeType: "primary",
          unitName: row.unit,
          createdAt: row.updated_at,
        },
      ],
      name: row.name,
      category: row.category,
      unit: row.unit,
      uomConversions: itemUnitConversionMap.get(row.id) ?? [],
      supplierId: row.supplier_id,
      costPrice: Number(row.cost_price),
      sellingPrice: Number(row.selling_price),
      status: row.status,
      stocks: stockMap.get(row.id) ?? [],
      updatedAt: row.updated_at,
    })),
    rolePermissions: rolePermissionMap,
    users: userRows.map((row) => {
      const effectivePermissions = new Set<PermissionKey>(rolePermissionMap[row.role_code]);
      for (const override of permissionOverrideMap.get(row.id) ?? []) {
        if (override.is_allowed) {
          effectivePermissions.add(override.permission_code);
        } else {
          effectivePermissions.delete(override.permission_code);
        }
      }

      return {
        id: row.id,
        name: row.name,
        username: row.username || fallbackUsername(row.id),
        email: row.email,
        role: row.role_code,
        permissions: [...effectivePermissions].sort(),
        assignedLocationIds: assignmentMap.get(row.id) ?? [],
        status: row.status,
        lastSeenAt: row.last_seen_at,
      };
    }),
    requests: requestRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      kind: row.kind,
      status: row.status,
      itemId: row.item_id,
      itemName: row.item_name,
      barcode: row.barcode,
      quantity: Number(row.counted_quantity ?? row.quantity),
      baseQuantity: Number(row.base_quantity ?? row.counted_quantity ?? row.quantity),
      baseUnit: row.base_unit ?? row.unit,
      unitFactor: Number(row.unit_factor ?? 1),
      lotCode: row.lot_code ?? undefined,
      batchBarcode: row.batch_barcode ?? undefined,
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
      attachments: requestAttachmentMap.get(row.id)?.request ?? [],
      decisionAttachments: requestAttachmentMap.get(row.id)?.decision ?? [],
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
    notifications: parseNotificationRows(notificationRows),
    settings: {
      companyName: settingsRow?.company_name ?? "OmniStock",
      workspaceLocation: settingsRow?.workspace_location ?? DEFAULT_WORKSPACE_LOCATION,
      currency: settingsRow?.currency ?? DEFAULT_CURRENCY,
      timezone: settingsRow?.timezone ?? DEFAULT_TIMEZONE,
      timeSource: settingsRow?.time_source === "browser" ? "browser" : DEFAULT_TIME_SOURCE,
      lowStockThreshold: Number(settingsRow?.low_stock_threshold ?? 1),
      expiryAlertDays: Number(settingsRow?.expiry_alert_days ?? 14),
      enableOffline: Boolean(settingsRow?.enable_offline ?? 1),
      enableRealtime: Boolean(settingsRow?.enable_realtime ?? 1),
      enableBarcode: Boolean(settingsRow?.enable_barcode ?? 1),
      strictFefo: Boolean(settingsRow?.strict_fefo ?? 1),
      reportPrintTemplate: (() => {
        try {
          const parsed = settingsRow?.report_print_template_json
            ? (JSON.parse(settingsRow.report_print_template_json) as Partial<ReportPrintTemplate>)
            : undefined;
          return validateEnvironmentSettings(
            {
              workspaceLocation:
                settingsRow?.workspace_location ?? DEFAULT_WORKSPACE_LOCATION,
              currency: settingsRow?.currency ?? DEFAULT_CURRENCY,
              timezone: settingsRow?.timezone ?? DEFAULT_TIMEZONE,
              timeSource: settingsRow?.time_source === "browser" ? "browser" : DEFAULT_TIME_SOURCE,
              lowStockThreshold: Number(settingsRow?.low_stock_threshold ?? 1),
              expiryAlertDays: Number(settingsRow?.expiry_alert_days ?? 14),
              enableOffline: Boolean(settingsRow?.enable_offline ?? 1),
              enableRealtime: Boolean(settingsRow?.enable_realtime ?? 1),
              enableBarcode: Boolean(settingsRow?.enable_barcode ?? 1),
              strictFefo: Boolean(settingsRow?.strict_fefo ?? 1),
              reportPrintTemplate:
                (parsed as ReportPrintTemplate | undefined) ??
                createDefaultReportPrintTemplate(settingsRow?.company_name ?? "OmniStock"),
              notificationSettings,
            },
            settingsRow?.company_name ?? "OmniStock",
          ).reportPrintTemplate;
        } catch {
          return createDefaultReportPrintTemplate(settingsRow?.company_name ?? "OmniStock");
        }
      })(),
      notificationSettings,
    },
  };
}

interface NotificationInput {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  dedupeKey: string;
  channels: NotificationChannel[];
  itemId?: string;
  itemName?: string;
  locationId?: string;
  locationName?: string;
  requestId?: string;
  metadata?: NotificationRecord["metadata"];
}

interface NotificationDedupeRow {
  id: string;
  dedupe_key: string;
  resolved_at: string | null;
}

function ruleForNotification(
  settings: NotificationSettings,
  type: NotificationType,
): NotificationRuleSettings | DailySummaryNotificationSettings {
  if (type === "daily-summary") {
    return settings.dailySummary;
  }

  return settings[
    NOTIFICATION_TYPE_TO_SETTINGS_KEY[type]
  ] as NotificationRuleSettings;
}

function channelsForNotification(
  settings: NotificationSettings,
  type: NotificationType,
): NotificationChannel[] {
  const rule = ruleForNotification(settings, type);
  const channels: NotificationChannel[] = [];
  if (rule.inApp) {
    channels.push("in-app");
  }
  if (rule.telegram && settings.telegramEnabled && settings.telegramChatId.trim()) {
    channels.push("telegram");
  }
  return channels;
}

function renderNotificationTemplate(
  template: string,
  values: Record<string, boolean | number | string | null | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}

function composeNotificationContent(
  settings: NotificationSettings,
  type: NotificationType,
  values: Record<string, boolean | number | string | null | undefined>,
): Pick<NotificationInput, "title" | "message"> {
  const template = settings.templates[type];
  return {
    title: renderNotificationTemplate(template.title, values).trim(),
    message: renderNotificationTemplate(template.body, values).trim(),
  };
}

function formatTelegramMessage(
  companyName: string,
  settings: NotificationSettings,
  notification: NotificationInput,
): string {
  const lines: string[] = [];
  const header = settings.style.telegramHeader.trim();
  if (header) {
    lines.push(`${header}`);
  } else {
    lines.push(`${companyName}`);
  }
  lines.push(notification.title, notification.message);

  if (notification.locationName) {
    lines.push(`Location: ${notification.locationName}`);
  }
  if (notification.itemName) {
    lines.push(`Item: ${notification.itemName}`);
  }
  if (settings.style.includeTimestamp) {
    lines.push(`At: ${new Date().toISOString()}`);
  }
  if (settings.style.telegramFooter.trim()) {
    lines.push(settings.style.telegramFooter.trim());
  }

  return lines.join("\n");
}

async function recordNotificationDelivery(
  db: D1Database,
  notificationId: string,
  channel: NotificationChannel,
  target: string,
  status: "pending" | "delivered" | "failed" | "skipped",
  errorMessage?: string,
  providerMessageId?: string,
): Promise<void> {
  const id = await reserveNextId(db, "notification_deliveries", "ndl");
  const attemptedAt = new Date().toISOString();
  await execute(
    db,
    `INSERT INTO notification_deliveries (
      id,
      sequence_no,
      notification_id,
      channel,
      target,
      status,
      provider_message_id,
      error_message,
      attempted_at,
      delivered_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      numberPart(id),
      notificationId,
      channel,
      target,
      status,
      providerMessageId ?? null,
      errorMessage ?? null,
      attemptedAt,
      status === "delivered" ? attemptedAt : null,
      attemptedAt,
      attemptedAt,
    ],
  );
}

async function deliverNotificationToTelegram(
  db: D1Database,
  notificationId: string,
  companyName: string,
  settings: NotificationSettings,
  notification: NotificationInput,
  secretContext?: NotificationSecretContext,
): Promise<void> {
  const chatId = settings.telegramChatId.trim();
  let configuredToken = "";
  try {
    configuredToken = await resolveTelegramBotToken(db, secretContext);
  } catch (error) {
    await recordNotificationDelivery(
      db,
      notificationId,
      "telegram",
      chatId || "unconfigured",
      "failed",
      error instanceof Error ? error.message : "Telegram bot token could not be decrypted.",
    );
    return;
  }

  if (!configuredToken || !chatId) {
    await recordNotificationDelivery(
      db,
      notificationId,
      "telegram",
      chatId || "unconfigured",
      "skipped",
      !configuredToken
        ? "Telegram bot token is not configured yet."
        : "Telegram chat ID is not configured yet.",
    );
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${configuredToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatTelegramMessage(companyName, settings, notification),
        }),
      },
    );

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };

    if (!response.ok || !payload.ok) {
      await recordNotificationDelivery(
        db,
        notificationId,
        "telegram",
        chatId,
        "failed",
        payload.description ?? "Telegram delivery failed.",
      );
      return;
    }

    await recordNotificationDelivery(
      db,
      notificationId,
      "telegram",
      chatId,
      "delivered",
      undefined,
      payload.result?.message_id ? String(payload.result.message_id) : undefined,
    );
  } catch (error) {
    await recordNotificationDelivery(
      db,
      notificationId,
      "telegram",
      chatId,
      "failed",
      error instanceof Error ? error.message : "Telegram delivery failed.",
    );
  }
}

async function upsertNotification(
  db: D1Database,
  snapshot: InventorySnapshot,
  input: NotificationInput,
  secretContext?: NotificationSecretContext,
): Promise<void> {
  const existing = await first<{
    id: string;
    status: NotificationStatus;
    resolved_at: string | null;
  }>(
    db,
    "SELECT id, status, resolved_at FROM notifications WHERE dedupe_key = ? LIMIT 1",
    [input.dedupeKey],
  );

  const now = new Date().toISOString();
  const channelsJson = JSON.stringify(input.channels);
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
  let notificationId = existing?.id;
  let shouldDispatchTelegram = false;

  if (!existing) {
    notificationId = await reserveNextId(db, "notifications", "ntf");
    await execute(
      db,
      `INSERT INTO notifications (
        id,
        sequence_no,
        type,
        severity,
        title,
        message,
        status,
        channels_json,
        dedupe_key,
        item_id,
        item_name,
        location_id,
        location_name,
        request_id,
        metadata_json,
        read_at,
        resolved_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'unread', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [
        notificationId,
        numberPart(notificationId),
        input.type,
        input.severity,
        input.title,
        input.message,
        channelsJson,
        input.dedupeKey,
        input.itemId ?? null,
        input.itemName ?? null,
        input.locationId ?? null,
        input.locationName ?? null,
        input.requestId ?? null,
        metadataJson,
        now,
        now,
      ],
    );
    shouldDispatchTelegram = true;
  } else {
    shouldDispatchTelegram = Boolean(existing.resolved_at);
    await execute(
      db,
      `UPDATE notifications
        SET type = ?,
            severity = ?,
            title = ?,
            message = ?,
            channels_json = ?,
            item_id = ?,
            item_name = ?,
            location_id = ?,
            location_name = ?,
            request_id = ?,
            metadata_json = ?,
            resolved_at = NULL,
            status = CASE WHEN resolved_at IS NOT NULL THEN 'unread' ELSE status END,
            read_at = CASE WHEN resolved_at IS NOT NULL THEN NULL ELSE read_at END,
            updated_at = ?
      WHERE id = ?`,
      [
        input.type,
        input.severity,
        input.title,
        input.message,
        channelsJson,
        input.itemId ?? null,
        input.itemName ?? null,
        input.locationId ?? null,
        input.locationName ?? null,
        input.requestId ?? null,
        metadataJson,
        now,
        existing.id,
      ],
    );
  }

  if (
    shouldDispatchTelegram &&
    notificationId &&
    input.channels.includes("telegram")
  ) {
    await deliverNotificationToTelegram(
      db,
      notificationId,
      snapshot.settings.companyName,
      snapshot.settings.notificationSettings,
      input,
      secretContext,
    );
  }
}

async function resolveMissingNotifications(
  db: D1Database,
  type: NotificationType,
  activeKeys: Set<string>,
): Promise<void> {
  const rows = await all<NotificationDedupeRow>(
    db,
    "SELECT id, dedupe_key, resolved_at FROM notifications WHERE type = ?",
    [type],
  );
  const now = new Date().toISOString();
  for (const row of rows) {
    if (activeKeys.has(row.dedupe_key) || row.resolved_at) {
      continue;
    }
    await execute(
      db,
      "UPDATE notifications SET resolved_at = ?, updated_at = ? WHERE id = ?",
      [now, now, row.id],
    );
  }
}

async function synchronizeNotificationSet(
  db: D1Database,
  snapshot: InventorySnapshot,
  type: NotificationType,
  inputs: NotificationInput[],
  secretContext?: NotificationSecretContext,
): Promise<void> {
  const activeKeys = new Set(inputs.map((entry) => entry.dedupeKey));
  for (const entry of inputs) {
    await upsertNotification(db, snapshot, entry, secretContext);
  }
  await resolveMissingNotifications(db, type, activeKeys);
}

function buildStateNotifications(snapshot: InventorySnapshot): NotificationInput[] {
  const settings = snapshot.settings.notificationSettings;
  const notifications: NotificationInput[] = [];

  for (const alert of lowStockAlerts(snapshot)) {
    const rule = settings.lowStock;
    if (!rule.enabled) {
      continue;
    }
    const values = {
      itemName: alert.itemName,
      locationName: alert.locationName,
      quantity: alert.quantity,
    };
    const content = composeNotificationContent(settings, "low-stock", values);
    notifications.push({
      type: "low-stock",
      severity: "warning",
      title: content.title,
      message: content.message,
      dedupeKey: `low-stock:${alert.itemId}:${alert.locationId}`,
      channels: channelsForNotification(settings, "low-stock"),
      itemId: alert.itemId,
      itemName: alert.itemName,
      locationId: alert.locationId,
      locationName: alert.locationName,
      metadata: {
        quantity: alert.quantity,
      },
    });
  }

  for (const alert of nearExpiryAlerts(snapshot)) {
    const rule = settings.nearExpiry;
    if (!rule.enabled) {
      continue;
    }
    const values = {
      itemName: alert.itemName,
      locationName: alert.locationName,
      quantity: alert.quantity,
      daysUntilExpiry: alert.daysUntilExpiry ?? "",
      lotCode: alert.lotCode ?? "",
    };
    const content = composeNotificationContent(settings, "near-expiry", values);
    notifications.push({
      type: "near-expiry",
      severity: "warning",
      title: content.title,
      message: content.message,
      dedupeKey: `near-expiry:${alert.itemId}:${alert.locationId}:${alert.lotCode ?? "n/a"}`,
      channels: channelsForNotification(settings, "near-expiry"),
      itemId: alert.itemId,
      itemName: alert.itemName,
      locationId: alert.locationId,
      locationName: alert.locationName,
      metadata: {
        quantity: alert.quantity,
        daysUntilExpiry: alert.daysUntilExpiry ?? null,
        lotCode: alert.lotCode ?? null,
      },
    });
  }

  for (const alert of expiredAlerts(snapshot)) {
    const rule = settings.expired;
    if (!rule.enabled) {
      continue;
    }
    const values = {
      itemName: alert.itemName,
      locationName: alert.locationName,
      quantity: alert.quantity,
      daysUntilExpiry: alert.daysUntilExpiry ?? "",
      lotCode: alert.lotCode ?? "",
    };
    const content = composeNotificationContent(settings, "expired", values);
    notifications.push({
      type: "expired",
      severity: "critical",
      title: content.title,
      message: content.message,
      dedupeKey: `expired:${alert.itemId}:${alert.locationId}:${alert.lotCode ?? "n/a"}`,
      channels: channelsForNotification(settings, "expired"),
      itemId: alert.itemId,
      itemName: alert.itemName,
      locationId: alert.locationId,
      locationName: alert.locationName,
      metadata: {
        quantity: alert.quantity,
        daysUntilExpiry: alert.daysUntilExpiry ?? null,
        lotCode: alert.lotCode ?? null,
      },
    });
  }

  if (settings.approvalRequests.enabled) {
    for (const request of snapshot.requests.filter((entry) => entry.status === "submitted")) {
      const values = {
        reference: request.reference,
        requestKind: request.kind.toUpperCase(),
        itemName: request.itemName,
        locationName: request.toLocationName ?? request.fromLocationName ?? "",
        quantity: request.quantity,
      };
      const content = composeNotificationContent(settings, "approval-request", values);
      notifications.push({
        type: "approval-request",
        severity: "info",
        title: content.title,
        message: content.message,
        dedupeKey: `approval-request:${request.id}`,
        channels: channelsForNotification(settings, "approval-request"),
        itemId: request.itemId,
        itemName: request.itemName,
        locationId: request.toLocationId ?? request.fromLocationId,
        locationName: request.toLocationName ?? request.fromLocationName,
        requestId: request.id,
        metadata: {
          quantity: request.quantity,
        },
      });
    }
  }

  if (settings.wastageThresholdExceeded.enabled) {
    const now = Date.now();
    const locationTotals = new Map<
      string,
      { locationName: string; totalCost: number; count: number }
    >();
    for (const entry of snapshot.wasteEntries) {
      if (now - Date.parse(entry.createdAt) > 24 * 60 * 60 * 1000) {
        continue;
      }
      const current = locationTotals.get(entry.locationId) ?? {
        locationName: entry.locationName,
        totalCost: 0,
        count: 0,
      };
      current.totalCost += entry.estimatedCost;
      current.count += 1;
      locationTotals.set(entry.locationId, current);
    }

    for (const [locationId, total] of locationTotals) {
      if (total.totalCost < settings.wastageCostThreshold) {
        continue;
      }
      const values = {
        locationName: total.locationName,
        totalCost: Number(total.totalCost.toFixed(0)),
        entries: total.count,
      };
      const content = composeNotificationContent(settings, "wastage-threshold", values);
      notifications.push({
        type: "wastage-threshold",
        severity: "warning",
        title: content.title,
        message: content.message,
        dedupeKey: `wastage-threshold:${locationId}`,
        channels: channelsForNotification(settings, "wastage-threshold"),
        locationId,
        locationName: total.locationName,
        metadata: {
          totalCost: Number(total.totalCost.toFixed(2)),
          entries: total.count,
        },
      });
    }
  }

  return notifications;
}

async function synchronizeStateNotifications(
  db: D1Database,
  snapshot: InventorySnapshot,
  secretContext?: NotificationSecretContext,
): Promise<void> {
  const grouped = new Map<NotificationType, NotificationInput[]>();
  for (const notification of buildStateNotifications(snapshot)) {
    const bucket = grouped.get(notification.type) ?? [];
    bucket.push(notification);
    grouped.set(notification.type, bucket);
  }

  for (const type of [
    "low-stock",
    "near-expiry",
    "expired",
    "approval-request",
    "wastage-threshold",
  ] as const) {
    await synchronizeNotificationSet(
      db,
      snapshot,
      type,
      grouped.get(type) ?? [],
      secretContext,
    );
  }
}

async function createSingleNotification(
  db: D1Database,
  snapshot: InventorySnapshot,
  input: NotificationInput,
  secretContext?: NotificationSecretContext,
): Promise<void> {
  await upsertNotification(db, snapshot, input, secretContext);
}

export async function markNotificationReadInD1(
  db: D1Database,
  actorId: string,
  input: MarkNotificationReadRequest,
): Promise<NotificationActionResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "dashboard.view",
    "You do not have permission to access notifications.",
  );

  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE notifications SET status = 'read', read_at = ?, updated_at = ? WHERE id = ?",
    [now, now, input.notificationId],
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function markAllNotificationsReadInD1(
  db: D1Database,
  actorId: string,
): Promise<NotificationActionResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "dashboard.view",
    "You do not have permission to access notifications.",
  );

  const now = new Date().toISOString();
  await execute(
    db,
    "UPDATE notifications SET status = 'read', read_at = ?, updated_at = ? WHERE status = 'unread' AND resolved_at IS NULL",
    [now, now],
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function reportSyncFailureInD1(
  db: D1Database,
  actorId: string,
  input: ReportSyncFailureRequest,
  secretContext?: NotificationSecretContext,
): Promise<NotificationActionResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "dashboard.view",
    "You do not have permission to access notifications.",
  );
  if (!snapshot.settings.notificationSettings.failedSync.enabled) {
    return { snapshot };
  }

  const nowKey = todayKeyInTimeZone(snapshot.settings.timezone);
  const content = composeNotificationContent(
    snapshot.settings.notificationSettings,
    "failed-sync",
    {
      actorName: actor.name,
      message: input.message.trim() || "A device failed to sync with OmniStock.",
    },
  );
  await createSingleNotification(
    db,
    snapshot,
    {
      type: "failed-sync",
      severity: "critical",
      title: content.title,
      message: content.message,
      dedupeKey: `failed-sync:${actor.id}:${nowKey}`,
      channels: channelsForNotification(snapshot.settings.notificationSettings, "failed-sync"),
      metadata: {
        actorId: actor.id,
      },
    },
    secretContext,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function sendTestTelegramNotificationInD1(
  db: D1Database,
  actorId: string,
  input: TestTelegramNotificationRequest,
  secretContext?: NotificationSecretContext,
): Promise<TestTelegramNotificationResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "admin.notifications.edit",
    "You do not have permission to edit notification settings.",
  );
  const settings = snapshot.settings.notificationSettings;

  if (!settings.telegramEnabled) {
    throw new Error("Enable Telegram delivery in Settings before sending a test message.");
  }
  if (!settings.telegramChatId.trim()) {
    throw new Error("Enter a valid Telegram chat ID before sending a test message.");
  }
  const configuredToken = await resolveTelegramBotToken(db, secretContext);
  if (!configuredToken) {
    throw new Error(
      "Save a Telegram bot token in Settings before sending a Telegram test message.",
    );
  }

  const response = await fetch(`https://api.telegram.org/bot${configuredToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      chat_id: settings.telegramChatId.trim(),
      text: `${snapshot.settings.companyName} - Telegram setup test\nTriggered by ${actor.name} from OmniStock Settings.`,
    }),
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? "Telegram delivery failed.");
  }

  return {
    ok: true,
    detail: input.message?.trim() || "Telegram test message sent successfully.",
  };
}

export async function sendDueDailySummariesInD1(
  db: D1Database,
  secretContext?: NotificationSecretContext,
): Promise<void> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const settings = snapshot.settings.notificationSettings;
  if (!settings.dailySummary.enabled) {
    return;
  }

  const currentHour = hourInTimeZone(snapshot.settings.timezone);
  if (currentHour !== settings.dailySummary.hour) {
    return;
  }

  const todayKey = todayKeyInTimeZone(snapshot.settings.timezone);
  const stateKey = `${DAILY_SUMMARY_STATE_PREFIX}${settings.dailySummary.scope}`;
  const lastSent = await first<ValueTextRow>(
    db,
    "SELECT value_text FROM system_state WHERE key = ?",
    [stateKey],
  );
  if (lastSent?.value_text === todayKey) {
    return;
  }

  const relevantLocations = snapshot.locations.filter((location) =>
    settings.dailySummary.scope === "warehouse"
      ? location.type === "warehouse"
      : location.type === "outlet",
  );

  const lowStock = lowStockAlerts(snapshot);
  const nearExpiry = nearExpiryAlerts(snapshot);
  const expired = expiredAlerts(snapshot);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const location of relevantLocations) {
    const movementCount = snapshot.movementLedger.filter(
      (entry) =>
        entry.locationId === location.id && Date.parse(entry.createdAt) >= dayAgo,
    ).length;
    const wasteCost = snapshot.wasteEntries
      .filter(
        (entry) =>
          entry.locationId === location.id && Date.parse(entry.createdAt) >= dayAgo,
      )
      .reduce((sum, entry) => sum + entry.estimatedCost, 0);

    const content = composeNotificationContent(settings, "daily-summary", {
      locationName: location.name,
      movementCount,
      lowStockCount: lowStock.filter((entry) => entry.locationId === location.id).length,
      nearExpiryCount: nearExpiry.filter((entry) => entry.locationId === location.id).length,
      expiredCount: expired.filter((entry) => entry.locationId === location.id).length,
      wasteCost: Number(wasteCost.toFixed(0)),
    });
    await createSingleNotification(
      db,
      snapshot,
      {
        type: "daily-summary",
        severity: "info",
        title: content.title,
        message: content.message,
        dedupeKey: `daily-summary:${settings.dailySummary.scope}:${location.id}:${todayKey}`,
        channels: channelsForNotification(snapshot.settings.notificationSettings, "daily-summary"),
        locationId: location.id,
        locationName: location.name,
        metadata: {
          movementCount,
          wasteCost: Number(wasteCost.toFixed(2)),
          date: todayKey,
        },
      },
      secretContext,
    );
  }

  const now = new Date().toISOString();
  await execute(
    db,
    "INSERT OR REPLACE INTO system_state (key, value_integer, value_text, updated_at) VALUES (?, NULL, ?, ?)",
    [stateKey, todayKey, now],
  );
}

export async function loadBootstrapPayload(
  db: D1Database,
  userId?: string,
): Promise<BootstrapPayload> {
  let snapshot = await loadSnapshot(db);
  if (snapshot.items.length > 0 && snapshot.notifications.length === 0) {
    await synchronizeStateNotifications(db, snapshot);
    snapshot = await loadSnapshot(db);
  }
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

function normalizeItemBarcodeEntries(
  primaryBarcode: string,
  primaryUnitName: string,
  requestedBarcodes?: Array<{ barcode: string; barcodeType: BarcodeType; unitName?: string }>,
): Array<{ barcode: string; barcodeType: BarcodeType; unitName: string }> {
  const seen = new Set<string>();
  const normalized: Array<{ barcode: string; barcodeType: BarcodeType; unitName: string }> = [];

  const pushBarcode = (barcode: string, barcodeType: BarcodeType, unitName: string) => {
    const cleaned = barcode.trim();
    if (!cleaned || seen.has(cleaned)) {
      return;
    }
    seen.add(cleaned);
    normalized.push({ barcode: cleaned, barcodeType, unitName: unitName.trim() || primaryUnitName });
  };

  pushBarcode(primaryBarcode, "primary", primaryUnitName);
  for (const entry of requestedBarcodes ?? []) {
    const barcodeType = entry.barcodeType ?? "secondary";
    if (barcodeType === "primary") {
      continue;
    }
    pushBarcode(entry.barcode, barcodeType, entry.unitName ?? primaryUnitName);
  }

  return normalized;
}

function normalizeItemUnitConversions(
  baseUnit: string,
  requestedConversions?: Array<{ unitName: string; quantityInBase: number }>,
): Array<{ unitName: string; quantityInBase: number }> {
  const seen = new Set([baseUnit.trim().toLowerCase()]);
  const normalized: Array<{ unitName: string; quantityInBase: number }> = [];

  for (const entry of requestedConversions ?? []) {
    const unitName = entry.unitName.trim();
    const quantityInBase = Number(entry.quantityInBase);
    const key = unitName.toLowerCase();

    if (!unitName || seen.has(key)) {
      continue;
    }
    if (!Number.isFinite(quantityInBase) || quantityInBase <= 0) {
      throw new Error(`Unit conversion for ${unitName || "this unit"} must be greater than zero.`);
    }

    seen.add(key);
    normalized.push({ unitName, quantityInBase });
  }

  return normalized;
}

function assertBarcodeUnitsExist(
  baseUnit: string,
  conversions: Array<{ unitName: string; quantityInBase: number }>,
  barcodes: Array<{ barcode: string; barcodeType: BarcodeType; unitName: string }>,
) {
  const allowedUnits = new Set([baseUnit.trim().toLowerCase(), ...conversions.map((entry) => entry.unitName.trim().toLowerCase())]);

  for (const barcode of barcodes) {
    if (!allowedUnits.has(barcode.unitName.trim().toLowerCase())) {
      throw new Error(`Barcode ${barcode.barcode} is mapped to unknown unit ${barcode.unitName}.`);
    }
  }
}

async function barcodeExistsForOtherRecord(
  db: D1Database,
  barcode: string,
  options?: {
    excludeItemId?: string;
    excludeBatchId?: string;
  },
): Promise<boolean> {
  const itemBindings: D1Value[] = [barcode];
  const itemSql = options?.excludeItemId
    ? "SELECT id FROM item_barcodes WHERE barcode = ? AND item_id <> ? LIMIT 1"
    : "SELECT id FROM item_barcodes WHERE barcode = ? LIMIT 1";
  if (options?.excludeItemId) {
    itemBindings.push(options.excludeItemId);
  }
  const itemRow = await first<{ id: string }>(db, itemSql, itemBindings);
  if (itemRow?.id) {
    return true;
  }

  const batchBindings: D1Value[] = [barcode];
  const batchSql = options?.excludeBatchId
    ? "SELECT id FROM batch_barcodes WHERE barcode = ? AND batch_id <> ? LIMIT 1"
    : "SELECT id FROM batch_barcodes WHERE barcode = ? LIMIT 1";
  if (options?.excludeBatchId) {
    batchBindings.push(options.excludeBatchId);
  }
  const batchRow = await first<{ id: string }>(db, batchSql, batchBindings);
  return Boolean(batchRow?.id);
}

async function assertBarcodesAvailable(
  db: D1Database,
  barcodes: string[],
  options?: {
    excludeItemId?: string;
    excludeBatchId?: string;
  },
): Promise<void> {
  for (const barcode of barcodes) {
    if (await barcodeExistsForOtherRecord(db, barcode, options)) {
      throw new Error(`Barcode ${barcode} is already assigned elsewhere in OmniStock.`);
    }
  }
}

async function replaceItemBarcodes(
  db: D1Database,
  itemId: string,
  barcodes: Array<{ barcode: string; barcodeType: BarcodeType; unitName: string }>,
  timestamp: string,
): Promise<ItemBarcode[]> {
  await execute(db, "DELETE FROM item_barcodes WHERE item_id = ?", [itemId]);

  const created: ItemBarcode[] = [];
  for (const entry of barcodes) {
    const barcodeId = await reserveNextId(db, "item_barcodes", "ibc");
    await execute(
      db,
      "INSERT INTO item_barcodes (id, sequence_no, item_id, barcode, barcode_type, unit_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        barcodeId,
        numberPart(barcodeId),
        itemId,
        entry.barcode,
        entry.barcodeType,
        entry.unitName,
        timestamp,
        timestamp,
      ],
    );
    created.push({
      id: barcodeId,
      itemId,
      barcode: entry.barcode,
      barcodeType: entry.barcodeType,
      unitName: entry.unitName,
      createdAt: timestamp,
    });
  }

  return created;
}

async function replaceItemUnitConversions(
  db: D1Database,
  itemId: string,
  conversions: Array<{ unitName: string; quantityInBase: number }>,
  timestamp: string,
): Promise<ItemUnitConversion[]> {
  await execute(db, "DELETE FROM item_unit_conversions WHERE item_id = ?", [itemId]);

  const created: ItemUnitConversion[] = [];
  for (const entry of conversions) {
    const conversionId = await reserveNextId(db, "item_unit_conversions", "uom");
    await execute(
      db,
      "INSERT INTO item_unit_conversions (id, sequence_no, item_id, unit_name, quantity_in_base, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        conversionId,
        numberPart(conversionId),
        itemId,
        entry.unitName,
        entry.quantityInBase,
        timestamp,
        timestamp,
      ],
    );
    created.push({
      id: conversionId,
      itemId,
      unitName: entry.unitName,
      quantityInBase: entry.quantityInBase,
      createdAt: timestamp,
    });
  }

  return created;
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

function inventoryRequestStatusForActor(
  actor: User,
): Extract<InventoryRequest["status"], "posted" | "submitted"> {
  return userHasPermission(actor, "inventory.approve") ? "posted" : "submitted";
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
  moduleKey: ActivityLog["module"],
  title: string,
  detail: string,
  severity: ActivityLog["severity"] = "success",
  relatedRequestId?: string,
): Promise<void> {
  const cursor = await currentCursor(db);
  const activityId = await reserveNextId(db, "activity_logs", "act");
  const nextSeq = cursor + 1;
  const createdAt = new Date().toISOString();
  await execute(
    db,
    "INSERT INTO activity_logs (id, sequence_no, seq, title, detail, actor_id, module_key, severity, related_request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      activityId,
      numberPart(activityId),
      nextSeq,
      title,
      detail,
      actorId,
      moduleKey,
      severity,
      relatedRequestId ?? null,
      createdAt,
    ],
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
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "admin.users.create",
    "You do not have permission to create user accounts.",
  );

  const username = normalizeUsername(input.username);
  assertUsername(username);
  const email = input.email.trim().toLowerCase();
  const currentRoleDefaults = await loadRolePermissionMap(db).then((map) => map[input.role]);
  const desiredPermissions = sanitizeRequestedPermissions(input.role, input.permissions);
  ensureManagePermissionsAllowed(actor, desiredPermissions, currentRoleDefaults);
  ensurePrivilegedUserManagementAllowed(actor, input.role, "create");
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
  await replaceUserPermissionOverrides(db, id, currentRoleDefaults, desiredPermissions, now);

  await appendAdminActivity(
    db,
    actorId,
    "User created",
    `${input.name.trim()} was added as ${input.role} with ${desiredPermissions.length} effective permissions.`,
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
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "admin.users.edit",
    "You do not have permission to edit user accounts.",
  );
  const target = snapshot.users.find((user) => user.id === input.userId);
  if (!target) {
    throw new Error("The selected user could not be found.");
  }

  const username = normalizeUsername(input.username);
  assertUsername(username);
  const email = input.email.trim().toLowerCase();
  const currentRoleDefaults = await loadRolePermissionMap(db).then((map) => map[input.role]);
  const desiredPermissions = sanitizeRequestedPermissions(input.role, input.permissions);
  ensureManagePermissionsAllowed(actor, desiredPermissions, currentRoleDefaults);
  ensurePrivilegedUserManagementAllowed(actor, target.role, "edit");
  ensurePrivilegedUserManagementAllowed(actor, input.role, "promote");
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
  await replaceUserPermissionOverrides(
    db,
    input.userId,
    currentRoleDefaults,
    desiredPermissions,
    now,
  );

  if (input.status !== "active") {
    await deleteUserSessions(db, input.userId);
  }

  await appendAdminActivity(
    db,
    actorId,
    "User updated",
    `${input.name.trim()} was updated with ${desiredPermissions.length} effective permissions.`,
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
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "admin.users.password",
    "You do not have permission to reset user passwords.",
  );
  const target = snapshot.users.find((user) => user.id === input.userId);
  if (!target) {
    throw new Error("The selected user could not be found.");
  }
  ensurePrivilegedUserManagementAllowed(actor, target.role, "reset the password for");

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
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "admin.users.remove",
    "You do not have permission to remove user accounts.",
  );
  const target = snapshot.users.find((user) => user.id === input.userId);
  if (!target) {
    throw new Error("The selected user could not be found.");
  }
  ensurePrivilegedUserManagementAllowed(actor, target.role, "remove");
  if (target.id === actorId) {
    throw new Error("You cannot remove your own active account.");
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
    await execute(db, "DELETE FROM user_permission_overrides WHERE user_id = ?", [input.userId]);
  } else {
    await execute(db, "DELETE FROM user_location_assignments WHERE user_id = ?", [input.userId]);
    await execute(db, "DELETE FROM user_permission_overrides WHERE user_id = ?", [input.userId]);
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

export async function updateRolePermissionsInD1(
  db: D1Database,
  actorId: string,
  input: UpdateRolePermissionsRequest,
): Promise<RolePermissionsResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "admin.permissions.edit",
    "You do not have permission to edit role permissions.",
  );

  if (input.role === "superadmin") {
    throw new Error("The superadmin role always keeps full access and cannot be edited.");
  }

  const desiredPermissions = sanitizeRequestedPermissions(input.role, input.permissions);
  if (
    (desiredPermissions.includes("admin.permissions.edit") ||
      desiredPermissions.includes("admin.permissions.manage")) &&
    actor.role !== "superadmin"
  ) {
    throw new Error(
      "Only superadmin users can grant permission-edit or permission-management access to roles.",
    );
  }

  const now = new Date().toISOString();
  await execute(db, "DELETE FROM role_permissions WHERE role_code = ?", [input.role]);
  for (const permission of desiredPermissions) {
    await execute(
      db,
      "INSERT INTO role_permissions (role_code, permission_code, created_at) VALUES (?, ?, ?)",
      [input.role, permission, now],
    );
  }

  const affectedUsers = snapshot.users.filter((user) => user.role === input.role);
  for (const user of affectedUsers) {
    await replaceUserPermissionOverrides(db, user.id, desiredPermissions, user.permissions, now);
  }

  await appendAdminActivity(
    db,
    actorId,
    "Role permissions updated",
    `${input.role} now has ${desiredPermissions.length} default permissions.`,
  );

  return { snapshot: await loadSnapshot(db) };
}

export async function updateSettingsInD1(
  db: D1Database,
  actorId: string,
  input: UpdateSettingsRequest,
  secretContext?: NotificationSecretContext,
): Promise<SettingsResponse> {
  await ensureDatabaseReady(db);
  const snapshot = await loadSnapshot(db);
  const actor = snapshot.users.find((user) => user.id === actorId);
  if (!actor) {
    throw new Error("Authentication required.");
  }
  const nextSettings = validateEnvironmentSettings(input, snapshot.settings.companyName);
  const environmentChanged =
    snapshot.settings.workspaceLocation !== nextSettings.workspaceLocation ||
    snapshot.settings.currency !== nextSettings.currency ||
    snapshot.settings.timezone !== nextSettings.timezone ||
    snapshot.settings.timeSource !== nextSettings.timeSource ||
    snapshot.settings.lowStockThreshold !== nextSettings.lowStockThreshold ||
    snapshot.settings.expiryAlertDays !== nextSettings.expiryAlertDays ||
    snapshot.settings.enableOffline !== nextSettings.enableOffline ||
    snapshot.settings.enableRealtime !== nextSettings.enableRealtime ||
    snapshot.settings.enableBarcode !== nextSettings.enableBarcode ||
    snapshot.settings.strictFefo !== nextSettings.strictFefo ||
    JSON.stringify(snapshot.settings.reportPrintTemplate) !==
      JSON.stringify(nextSettings.reportPrintTemplate);
  const notificationChanged =
    JSON.stringify(snapshot.settings.notificationSettings) !==
    JSON.stringify(nextSettings.notificationSettings);
  const tokenInputProvided = Boolean(nextSettings.telegramBotTokenInput?.trim());
  const clearStoredToken = Boolean(nextSettings.clearTelegramBotToken);

  if (environmentChanged) {
    requirePermission(
      actor,
      "admin.environment.edit",
      "You do not have permission to edit environment settings.",
    );
  }
  if (notificationChanged) {
    requirePermission(
      actor,
      "admin.notifications.edit",
      "You do not have permission to edit notification settings.",
    );
  }
  if (tokenInputProvided || clearStoredToken) {
    requirePermission(
      actor,
      "admin.notifications.edit",
      "You do not have permission to edit notification settings.",
    );
  }
  const now = new Date().toISOString();
  const currentTokenRow = await first<{
    telegram_token_ciphertext: string | null;
    telegram_token_iv: string | null;
  }>(
    db,
    "SELECT telegram_token_ciphertext, telegram_token_iv FROM app_settings WHERE id = ? LIMIT 1",
    [SETTINGS_ID],
  );
  let nextCiphertext = currentTokenRow?.telegram_token_ciphertext ?? null;
  let nextIv = currentTokenRow?.telegram_token_iv ?? null;

  if (tokenInputProvided) {
    const encrypted = await encryptSecretValue(
      nextSettings.telegramBotTokenInput!.trim(),
      secretContext?.appSecretsKey,
    );
    nextCiphertext = encrypted.ciphertext;
    nextIv = encrypted.iv;
  } else if (clearStoredToken) {
    nextCiphertext = null;
    nextIv = null;
  }

  const persistedNotificationSettings = {
    ...nextSettings.notificationSettings,
    telegramTokenConfigured: Boolean(nextCiphertext && nextIv),
  };

  await execute(
    db,
    `UPDATE app_settings
      SET workspace_location = ?,
          currency = ?,
          timezone = ?,
          time_source = ?,
          low_stock_threshold = ?,
          expiry_alert_days = ?,
          enable_offline = ?,
          enable_realtime = ?,
          enable_barcode = ?,
          strict_fefo = ?,
          report_print_template_json = ?,
          notification_settings_json = ?,
          telegram_token_ciphertext = ?,
          telegram_token_iv = ?,
          updated_at = ?
      WHERE id = ?`,
    [
      nextSettings.workspaceLocation,
      nextSettings.currency,
      nextSettings.timezone,
      nextSettings.timeSource,
      nextSettings.lowStockThreshold,
      nextSettings.expiryAlertDays,
      nextSettings.enableOffline ? 1 : 0,
      nextSettings.enableRealtime ? 1 : 0,
      nextSettings.enableBarcode ? 1 : 0,
      nextSettings.strictFefo ? 1 : 0,
      JSON.stringify(nextSettings.reportPrintTemplate),
      JSON.stringify(persistedNotificationSettings),
      nextCiphertext,
      nextIv,
      now,
      SETTINGS_ID,
    ],
  );

  await appendAdminActivity(
    db,
    actor.id,
    "Environment settings updated",
    `${actor.name} updated runtime settings, print defaults, and notification delivery controls.`,
  );

  await synchronizeStateNotifications(
    db,
    await loadSnapshot(db),
    secretContext,
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

interface BuildMutationContextOptions {
  requestId?: string;
  requestLineId?: string;
  reference?: string;
}

async function buildMutationContext(
  db: D1Database,
  mutation: MutationEnvelope,
  requestedIds: Map<string, number>,
  options: BuildMutationContextOptions = {},
): Promise<GeneratedMutationContext> {
  const requestId = options.requestId ?? (await reserveNextId(db, "inventory_requests", "req"));
  const requestLineId =
    options.requestLineId ?? (await reserveNextId(db, "inventory_request_lines", "rql"));
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
  const batchBarcodeIds = await Promise.all(
    Array.from({ length: requestedIds.get("bcb") ?? 0 }, () =>
      reserveNextId(db, "batch_barcodes", "bcb"),
    ),
  );
  const wasteEntryIds = await Promise.all(
    Array.from({ length: requestedIds.get("wte") ?? 0 }, () =>
      reserveNextId(db, "waste_entries", "wte"),
    ),
  );
  const reference = options.reference ?? (await reserveNextDocumentReference(db, mutation.kind));

  const idBuckets = new Map<string, string[]>([
    ["req", [requestId]],
    ["act", [activityId]],
    ["evt", [eventId]],
    ["led", ledgerIds],
    ["bat", batchIds],
    ["bcb", batchBarcodeIds],
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

async function persistUpdatedItemState(db: D1Database, updatedItem: Item): Promise<void> {
  await execute(db, "UPDATE items SET updated_at = ? WHERE id = ?", [
    updatedItem.updatedAt,
    updatedItem.id,
  ]);
  await execute(db, "DELETE FROM item_barcodes WHERE item_id = ?", [updatedItem.id]);
  await execute(db, "DELETE FROM item_unit_conversions WHERE item_id = ?", [updatedItem.id]);
  await execute(db, "DELETE FROM item_stocks WHERE item_id = ?", [updatedItem.id]);
  await execute(
    db,
    "DELETE FROM batch_barcodes WHERE batch_id IN (SELECT id FROM stock_batches WHERE item_id = ?)",
    [updatedItem.id],
  );
  await execute(db, "DELETE FROM stock_batches WHERE item_id = ?", [updatedItem.id]);

  for (const barcode of updatedItem.barcodes) {
    await execute(
      db,
      "INSERT INTO item_barcodes (id, sequence_no, item_id, barcode, barcode_type, unit_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        barcode.id,
        numberPart(barcode.id),
        updatedItem.id,
        barcode.barcode,
        barcode.barcodeType,
        barcode.unitName,
        barcode.createdAt,
        updatedItem.updatedAt,
      ],
    );
  }

  for (const conversion of updatedItem.uomConversions) {
    await execute(
      db,
      "INSERT INTO item_unit_conversions (id, sequence_no, item_id, unit_name, quantity_in_base, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        conversion.id,
        numberPart(conversion.id),
        updatedItem.id,
        conversion.unitName,
        conversion.quantityInBase,
        conversion.createdAt,
        updatedItem.updatedAt,
      ],
    );
  }

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

      for (const barcode of batch.barcodes) {
        await execute(
          db,
          "INSERT INTO batch_barcodes (id, sequence_no, batch_id, barcode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            barcode.id,
            numberPart(barcode.id),
            batch.id,
            barcode.barcode,
            barcode.createdAt,
            updatedItem.updatedAt,
          ],
        );
      }
    }
  }
}

async function persistInventoryArtifacts(
  db: D1Database,
  event: SyncEvent,
  lineId: string,
): Promise<void> {
  const request = event.request;
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

async function persistMutationResult(
  db: D1Database,
  mutation: MutationEnvelope,
  event: SyncEvent,
  context: GeneratedMutationContext,
) {
  const request = event.request;
  const lineId = context.requestLineId;

  await persistUpdatedItemState(db, event.updatedItem);

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
      request.status === "posted" ? event.timestamp : null,
      request.note,
      mutation.clientMutationId,
      request.requestedAt,
      event.timestamp,
    ],
  );

  await execute(
    db,
    "INSERT INTO inventory_request_lines (id, sequence_no, request_id, line_no, item_id, barcode, quantity, base_quantity, base_unit, unit_factor, counted_quantity, lot_code, batch_barcode, expiry_date, received_at, allocation_summary, waste_reason, waste_shift, waste_station, unit, note, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      lineId,
      numberPart(lineId),
      request.id,
      request.itemId,
      request.barcode,
      request.quantity,
      request.baseQuantity,
      request.baseUnit,
      request.unitFactor,
      request.kind === "stock-count" ? request.quantity : null,
      request.lotCode ?? null,
      request.batchBarcode ?? null,
      request.expiryDate ?? null,
      request.receivedDate ?? null,
      request.allocationSummary ?? null,
      request.wasteReason ?? null,
      request.wasteShift ?? null,
      request.wasteStation ?? null,
      request.unit,
      request.note,
      request.requestedAt,
      event.timestamp,
    ],
  );

  await persistRequestAttachments(
    db,
    request.id,
    "request",
    mutation.payload.attachments,
    request.requestedBy,
    request.requestedByName,
    request.requestedAt,
  );

  await persistInventoryArtifacts(db, event, lineId);
}

async function persistApprovedMutationResult(
  db: D1Database,
  mutation: MutationEnvelope,
  event: SyncEvent,
  context: GeneratedMutationContext,
) {
  const request = event.request;
  const lineId = context.requestLineId;

  await persistUpdatedItemState(db, event.updatedItem);

  await execute(
    db,
    `UPDATE inventory_requests
       SET kind = ?,
           status = ?,
           supplier_id = ?,
           from_location_id = ?,
           to_location_id = ?,
           requested_by = ?,
           requested_at = ?,
           posted_at = ?,
           note = ?,
           client_mutation_id = ?,
           updated_at = ?
     WHERE id = ?`,
    [
      request.kind,
      request.status,
      request.supplierId ?? null,
      request.fromLocationId ?? null,
      request.toLocationId ?? null,
      request.requestedBy,
      request.requestedAt,
      request.status === "posted" ? event.timestamp : null,
      request.note,
      mutation.clientMutationId,
      event.timestamp,
      request.id,
    ],
  );

  await execute(
    db,
    `UPDATE inventory_request_lines
       SET item_id = ?,
           barcode = ?,
           quantity = ?,
           base_quantity = ?,
           base_unit = ?,
           unit_factor = ?,
           counted_quantity = ?,
           lot_code = ?,
           batch_barcode = ?,
           expiry_date = ?,
           received_at = ?,
           allocation_summary = ?,
           waste_reason = ?,
           waste_shift = ?,
           waste_station = ?,
           unit = ?,
           note = ?,
           updated_at = ?
     WHERE id = ?`,
    [
      request.itemId,
      request.barcode,
      request.quantity,
      request.baseQuantity,
      request.baseUnit,
      request.unitFactor,
      request.kind === "stock-count" ? request.quantity : null,
      request.lotCode ?? null,
      request.batchBarcode ?? null,
      request.expiryDate ?? null,
      request.receivedDate ?? null,
      request.allocationSummary ?? null,
      request.wasteReason ?? null,
      request.wasteShift ?? null,
      request.wasteStation ?? null,
      request.unit,
      request.note,
      event.timestamp,
      lineId,
    ],
  );

  await persistInventoryArtifacts(db, event, lineId);
}

async function recordInventoryMutation(
  db: D1Database,
  snapshot: InventorySnapshot,
  mutation: MutationEnvelope,
  secretContext?: NotificationSecretContext,
  requestStatus: Extract<InventoryRequest["status"], "posted" | "submitted"> = "posted",
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
    requestStatus,
  });

  const context = await buildMutationContext(db, mutation, previewCounters);
  const result = applyMutation(snapshot, mutation, {
    idFactory: context.idFactory,
    referenceFactory: () => context.reference,
    nextSeq,
    requestStatus,
  });

  await persistMutationResult(db, mutation, result.event, context);
  const latestSnapshot = await loadSnapshot(db);
  await synchronizeStateNotifications(db, latestSnapshot, secretContext);
  return {
    ...result,
    snapshot: await loadSnapshot(db),
  };
}

async function loadInventoryRequestActionRow(
  db: D1Database,
  requestId: string,
): Promise<InventoryRequestActionRow | null> {
    return first<InventoryRequestActionRow>(
      db,
      `SELECT
        r.id,
        rl.id AS line_id,
        r.reference,
        r.kind,
      r.status,
      rl.item_id,
      rl.barcode,
      rl.quantity,
      rl.base_quantity,
      rl.base_unit,
      rl.unit_factor,
      rl.counted_quantity,
      rl.lot_code,
      rl.batch_barcode,
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
  const baseQuantity = Number(request.base_quantity ?? request.quantity);
  const baseUnit = request.base_unit ?? request.unit;

  switch (request.kind) {
    case "grn":
      return {
        clientMutationId: crypto.randomUUID(),
        actorId,
        createdAt,
        kind: "adjustment",
        payload: {
          itemId: request.item_id,
          quantity: -Math.abs(baseQuantity),
          note,
          barcode: request.barcode,
          quantityUnit: baseUnit,
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
          quantity: Math.abs(baseQuantity),
          note,
          barcode: request.barcode,
          quantityUnit: baseUnit,
          fromLocationId: request.from_location_id ?? undefined,
          lotCode: request.lot_code ?? undefined,
          batchBarcode: request.batch_barcode ?? undefined,
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
          quantity: Math.abs(baseQuantity),
          note,
          barcode: request.barcode,
          quantityUnit: baseUnit,
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
          quantity: -baseQuantity,
          note,
          barcode: request.barcode,
          quantityUnit: baseUnit,
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
          quantity: Math.max(0, Number(quantityBefore ?? request.base_quantity ?? request.quantity)),
          countedQuantity: Math.max(
            0,
            Number(quantityBefore ?? request.base_quantity ?? request.quantity),
          ),
          note,
          barcode: request.barcode,
          quantityUnit: baseUnit,
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
          quantity: Math.abs(baseQuantity),
          note,
          barcode: request.barcode,
          quantityUnit: baseUnit,
          fromLocationId: request.from_location_id ?? undefined,
          lotCode: request.lot_code ?? undefined,
          batchBarcode: request.batch_barcode ?? undefined,
          expiryDate: request.expiry_date ?? undefined,
          receivedDate: request.received_at ?? undefined,
        },
      };
  }
}

function buildApprovalMutation(
  actorId: string,
  request: InventoryRequestActionRow,
): MutationEnvelope {
  return {
    clientMutationId: crypto.randomUUID(),
    actorId,
    createdAt: new Date().toISOString(),
    kind: request.kind,
    payload: {
      itemId: request.item_id,
      quantity: Number(request.quantity),
      note: request.note,
      barcode: request.barcode,
      quantityUnit: request.unit,
      supplierId: request.supplier_id ?? undefined,
      fromLocationId: request.from_location_id ?? undefined,
      toLocationId: request.to_location_id ?? undefined,
      countedQuantity:
        request.kind === "stock-count"
          ? Number(request.counted_quantity ?? request.quantity)
          : undefined,
      lotCode: request.lot_code ?? undefined,
      batchBarcode: request.batch_barcode ?? undefined,
      expiryDate: request.expiry_date ?? undefined,
      receivedDate: request.received_at ?? undefined,
      wasteReason: request.kind === "wastage" ? request.waste_reason ?? undefined : undefined,
      wasteShift: request.kind === "wastage" ? request.waste_shift ?? undefined : undefined,
      wasteStation: request.kind === "wastage" ? request.waste_station ?? undefined : undefined,
    },
  };
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
    "master.edit",
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
    "master.delete",
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
  const uomConversions = normalizeItemUnitConversions(unit, input.uomConversions);
  const barcodes = normalizeItemBarcodeEntries(barcode, unit, input.barcodes);
  const status = input.status ?? "active";

  if (!name || !sku || !barcode || !category || !unit) {
    throw new Error("Name, SKU, barcode, category, and unit are required for items.");
  }
  assertBarcodeUnitsExist(unit, uomConversions, barcodes);

  if (await itemExistsBySku(db, sku)) {
    throw new Error(`An item already exists with SKU ${sku}.`);
  }

  await assertBarcodesAvailable(
    db,
    barcodes.map((entry) => entry.barcode),
  );

  if (barcodes.length === 0) {
    throw new Error("Add at least one barcode before creating the item.");
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
  const savedBarcodes = await replaceItemBarcodes(db, id, barcodes, createdAt);
  const savedUomConversions = await replaceItemUnitConversions(
    db,
    id,
    uomConversions,
    createdAt,
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
      barcodes: savedBarcodes,
      name,
      category,
      unit,
      uomConversions: savedUomConversions,
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
    "master.edit",
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
  const uomConversions = normalizeItemUnitConversions(unit, input.uomConversions);
  const barcodes = normalizeItemBarcodeEntries(barcode, unit, input.barcodes);
  const status = input.status ?? existing.status;
  if (!name || !sku || !barcode || !category || !unit) {
    throw new Error("Name, SKU, barcode, category, and unit are required for items.");
  }
  assertBarcodeUnitsExist(unit, uomConversions, barcodes);
  if (await itemExistsBySkuExcludingId(db, sku, input.itemId)) {
    throw new Error(`An item already exists with SKU ${sku}.`);
  }
  await assertBarcodesAvailable(
    db,
    barcodes.map((entry) => entry.barcode),
    { excludeItemId: input.itemId },
  );
  if (barcodes.length === 0) {
    throw new Error("Add at least one barcode before saving the item.");
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
  const savedBarcodes = await replaceItemBarcodes(db, input.itemId, barcodes, updatedAt);
  const savedUomConversions = await replaceItemUnitConversions(
    db,
    input.itemId,
    uomConversions,
    updatedAt,
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
      barcodes: savedBarcodes,
      name,
      category,
      unit,
      uomConversions: savedUomConversions,
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
    "master.delete",
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
    "master.edit",
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
    "master.delete",
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
    "master.edit",
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
    "master.delete",
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
  const initialSettings = validateEnvironmentSettings({
    workspaceLocation: input.workspaceLocation,
    currency: input.currency,
    timezone: input.timezone,
    timeSource: input.timeSource ?? DEFAULT_TIME_SOURCE,
    lowStockThreshold: input.lowStockThreshold,
    expiryAlertDays: input.expiryAlertDays,
    enableOffline: input.enableOffline,
    enableRealtime: input.enableRealtime,
    enableBarcode: input.enableBarcode,
    strictFefo: input.strictFefo,
    reportPrintTemplate:
      input.reportPrintTemplate ?? createDefaultReportPrintTemplate(companyName),
    notificationSettings: createDefaultNotificationSettings(),
  }, companyName);

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
    "INSERT INTO app_settings (id, sequence_no, company_name, workspace_location, currency, timezone, time_source, low_stock_threshold, expiry_alert_days, enable_offline, enable_realtime, enable_barcode, strict_fefo, report_print_template_json, notification_settings_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      SETTINGS_ID,
      numberPart(SETTINGS_ID),
      companyName,
      initialSettings.workspaceLocation,
      initialSettings.currency,
      initialSettings.timezone,
      initialSettings.timeSource,
      initialSettings.lowStockThreshold,
      initialSettings.expiryAlertDays,
      initialSettings.enableOffline ? 1 : 0,
      initialSettings.enableRealtime ? 1 : 0,
      initialSettings.enableBarcode ? 1 : 0,
      initialSettings.strictFefo ? 1 : 0,
      JSON.stringify(initialSettings.reportPrintTemplate),
      JSON.stringify(initialSettings.notificationSettings),
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

export async function approveInventoryRequestInD1(
  db: D1Database,
  actorId: string,
  input: ApproveInventoryRequest,
  secretContext?: NotificationSecretContext,
): Promise<InventoryActionResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const request = await loadInventoryRequestActionRow(db, input.requestId);
  if (!request) {
    throw new Error("The selected approval request could not be found.");
  }
  if (request.status !== "submitted") {
    throw new Error("Only submitted inventory requests can be approved.");
  }

  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "inventory.approve",
    "You do not have permission to approve inventory requests.",
  );
  const existingRequest =
    snapshot.requests.find((entry) => entry.id === request.id);
  const requesterName =
    snapshot.users.find((user) => user.id === request.requested_by)?.name ?? "Unknown user";
  const approvalNote = input.note?.trim() || "Approved for posting.";
  const decisionUploadTime = new Date().toISOString();
  const decisionInputs = sanitizeAttachmentInputs(input.attachments);
  const decisionAttachments = decisionInputs.map((attachment) => ({
    id: `att-${crypto.randomUUID().slice(0, 8)}`,
    requestId: request.id,
    scope: "decision" as const,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    dataUrl: attachment.dataUrl,
    uploadedBy: actor.id,
    uploadedByName: actor.name,
    uploadedAt: decisionUploadTime,
  }));
  const mutation = buildApprovalMutation(actor.id, request);
  const nextSeq = snapshot.syncCursor + 1;
  const previewCounters = new Map<string, number>();
  applyMutation(snapshot, mutation, {
    idFactory: (prefix: string) => {
      const nextValue = (previewCounters.get(prefix) ?? 0) + 1;
      previewCounters.set(prefix, nextValue);
      return `${prefix}-preview-${nextValue}`;
    },
    referenceFactory: () => request.reference,
    nextSeq,
    requestStatus: "posted",
  });

  const context = await buildMutationContext(db, mutation, previewCounters, {
    requestId: request.id,
    requestLineId: request.line_id,
    reference: request.reference,
  });
  const result = applyMutation(snapshot, mutation, {
    idFactory: context.idFactory,
    referenceFactory: () => context.reference,
    nextSeq,
    requestStatus: "posted",
  });

  const mergedRequest: InventoryRequest = {
    ...result.event.request,
    id: request.id,
    reference: request.reference,
    attachments: existingRequest?.attachments ?? [],
    decisionAttachments,
    requestedBy: request.requested_by,
    requestedByName: requesterName,
    requestedAt: request.requested_at,
    note: buildInventoryActionNote(request.note, "Approved", actor.name, approvalNote),
    status: "posted",
  };
  result.event.request = mergedRequest;
  result.event.activity = {
    ...result.event.activity,
    title: `${OPERATION_LABELS[request.kind]} approved`,
    detail: `${request.reference} was approved by ${actor.name} and posted.${mergedRequest.allocationSummary ? ` ${mergedRequest.allocationSummary}` : ""}`,
  };
  result.snapshot.requests = [mergedRequest, ...result.snapshot.requests.filter((entry) => entry.id !== request.id)];

  await persistApprovedMutationResult(db, mutation, result.event, context);
  await persistRequestAttachments(
    db,
    request.id,
    "decision",
    decisionInputs,
    actor.id,
    actor.name,
    decisionUploadTime,
    true,
  );
  const latestSnapshot = await loadSnapshot(db);
  await synchronizeStateNotifications(db, latestSnapshot, secretContext);

  return {
    snapshot: latestSnapshot,
    request: mergedRequest,
  };
}

export async function rejectInventoryRequestInD1(
  db: D1Database,
  actorId: string,
  input: RejectInventoryRequest,
  secretContext?: NotificationSecretContext,
): Promise<InventoryActionResponse> {
  await ensureDatabaseReady(db);

  const snapshot = await loadSnapshot(db);
  const request = await loadInventoryRequestActionRow(db, input.requestId);
  if (!request) {
    throw new Error("The selected approval request could not be found.");
  }
  if (request.status !== "submitted") {
    throw new Error("Only submitted inventory requests can be rejected.");
  }

  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "inventory.approve",
    "You do not have permission to reject inventory requests.",
  );
  const reason = input.reason.trim();
  const decisionUploadTime = new Date().toISOString();
  const decisionInputs = sanitizeAttachmentInputs(input.attachments);
  if (!reason) {
    throw new Error("Provide a reason before rejecting an inventory request.");
  }

  const updatedNote = buildInventoryActionNote(request.note, "Rejected", actor.name, reason);
  await markInventoryRequestRejected(db, request.id, updatedNote);
  await persistRequestAttachments(
    db,
    request.id,
    "decision",
    decisionInputs,
    actor.id,
    actor.name,
    decisionUploadTime,
    true,
  );
  await appendActivity(
    db,
    actor.id,
    "inventoryOps",
    `${OPERATION_LABELS[request.kind]} rejected`,
    `${request.reference} was rejected by ${actor.name}. Reason: ${reason}`,
    "warning",
    request.id,
  );

  const latestSnapshot = await loadSnapshot(db);
  await synchronizeStateNotifications(db, latestSnapshot, secretContext);
  const rejectedRequest = latestSnapshot.requests.find((entry) => entry.id === request.id);

  return {
    snapshot: latestSnapshot,
    request: rejectedRequest,
  };
}

export async function reverseInventoryRequestInD1(
  db: D1Database,
  actorId: string,
  input: ReverseInventoryRequest,
  secretContext?: NotificationSecretContext,
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
    "inventory.reverse",
    "You do not have permission to reverse this inventory entry.",
  );
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Provide a reason before reversing an inventory entry.");
  }

  const quantityBefore =
    request.kind === "stock-count" ? await loadFirstLedgerBefore(db, request.id) : null;
  const reversalMutation = buildReversalMutation(actor.id, request, reason, quantityBefore);
  const reversalResult = await recordInventoryMutation(
    db,
    snapshot,
    reversalMutation,
    secretContext,
  );
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
  secretContext?: NotificationSecretContext,
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
    "inventory.edit",
    "You do not have permission to edit this inventory entry.",
  );
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Provide a correction reason before editing an inventory entry.");
  }

  const quantityBefore =
    request.kind === "stock-count" ? await loadFirstLedgerBefore(db, request.id) : null;
  const reversalMutation = buildReversalMutation(actor.id, request, reason, quantityBefore);
  const reversalResult = await recordInventoryMutation(
    db,
    snapshot,
    reversalMutation,
    secretContext,
  );
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
      attachments: sanitizeAttachmentInputs(input.attachments),
      barcode: input.barcode?.trim() || undefined,
      quantityUnit: input.quantityUnit?.trim() || undefined,
      supplierId: input.supplierId?.trim() || undefined,
      fromLocationId: input.fromLocationId?.trim() || undefined,
      toLocationId: input.toLocationId?.trim() || undefined,
      countedQuantity:
        request.kind === "stock-count"
          ? Number(input.countedQuantity ?? input.quantity)
          : undefined,
      lotCode: input.lotCode?.trim() || undefined,
      batchBarcode: input.batchBarcode?.trim() || undefined,
      expiryDate: input.expiryDate?.trim() || undefined,
      receivedDate: input.receivedDate?.trim() || undefined,
      wasteReason: request.kind === "wastage" ? input.wasteReason : undefined,
      wasteShift: request.kind === "wastage" ? input.wasteShift : undefined,
      wasteStation:
        request.kind === "wastage" ? input.wasteStation?.trim() || undefined : undefined,
    },
  };

  const correctedResult = await recordInventoryMutation(
    db,
    snapshot,
    correctedMutation,
    secretContext,
  );

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
  secretContext?: NotificationSecretContext,
): Promise<InventoryActionResponse> {
  await ensureDatabaseReady(db);

  let snapshot = await loadSnapshot(db);
  const request = await loadInventoryRequestActionRow(db, input.requestId);
  if (!request) {
    throw new Error("The selected inventory entry could not be found.");
  }

  const actor = requirePermission(
    snapshot.users.find((user) => user.id === actorId),
    "inventory.delete",
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
    const reversalResult = await recordInventoryMutation(
      db,
      snapshot,
      reversalMutation,
      secretContext,
    );
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
  secretContext?: NotificationSecretContext,
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
        const actor = requirePermission(
          snapshot.users.find((user) => user.id === mutation.actorId),
          inventoryPermissionForKind(mutation.kind),
          "You do not have permission to create this inventory entry.",
        );
        const requestStatus = inventoryRequestStatusForActor(actor);
        const result = await recordInventoryMutation(
          db,
          snapshot,
          mutation,
          secretContext,
          requestStatus,
        );
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
