export type Role = "superadmin" | "admin" | "manager" | "worker";

export type ModuleKey =
  | "dashboard"
  | "inventoryOps"
  | "masterData"
  | "reports"
  | "administration";

export type TimeSource = "system" | "browser";
export type PrintPaperSize = "a4" | "letter";
export type PrintOrientation = "portrait" | "landscape";
export type PrintDensity = "comfortable" | "compact";
export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationChannel = "in-app" | "telegram";
export type NotificationStatus = "unread" | "read";
export type NotificationSummaryScope = "warehouse" | "branch";
export type NotificationType =
  | "low-stock"
  | "near-expiry"
  | "expired"
  | "approval-request"
  | "failed-sync"
  | "wastage-threshold"
  | "daily-summary";
export type PrintLayoutBlockType =
  | "company-name"
  | "report-title"
  | "report-subtitle"
  | "header-note"
  | "generated-by"
  | "generated-at"
  | "filters"
  | "summary"
  | "report-sections"
  | "footer-note"
  | "signatures"
  | "custom-text";

export type PermissionKey =
  | "dashboard.view"
  | "inventory.view"
  | "inventory.grn"
  | "inventory.gin"
  | "inventory.transfer"
  | "inventory.adjustment"
  | "inventory.count"
  | "inventory.wastage"
  | "inventory.edit"
  | "inventory.delete"
  | "inventory.reverse"
  | "inventory.approve"
  | "master.items"
  | "master.suppliers"
  | "master.locations"
  | "master.edit"
  | "master.delete"
  | "reports.view"
  | "reports.export"
  | "reports.print"
  | "admin.users.view"
  | "admin.users.create"
  | "admin.users.edit"
  | "admin.users.password"
  | "admin.users.remove"
  | "admin.environment.edit"
  | "admin.notifications.edit"
  | "admin.permissions.edit"
  | "admin.permissions.manage"
  | "admin.settings"
  | "admin.activity";

export type LocationType = "warehouse" | "outlet";
export type RecordStatus = "active" | "inactive" | "archived";
export type RequestKind =
  | "grn"
  | "gin"
  | "transfer"
  | "adjustment"
  | "stock-count"
  | "wastage";
export type RequestStatus = "draft" | "submitted" | "posted" | "rejected";
export type ActivitySeverity = "info" | "success" | "warning";
export type PriceCategory =
  | "meat"
  | "vegetables"
  | "seafood"
  | "dairy"
  | "dry-goods"
  | "oil";
export type BarcodeType = "primary" | "secondary" | "packaging";
export type WasteReason =
  | "spoilage"
  | "expiry"
  | "overproduction"
  | "prep-loss"
  | "damage"
  | "staff-meal"
  | "qc-rejection";
export type ShiftKey = "morning" | "lunch" | "dinner" | "night";

export interface ReportPrintTemplate {
  templateName: string;
  accentColor: string;
  paperSize: PrintPaperSize;
  orientation: PrintOrientation;
  density: PrintDensity;
  marginMm: number;
  headerNote: string;
  footerNote: string;
  showCompanyName: boolean;
  showGeneratedAt: boolean;
  showGeneratedBy: boolean;
  showFilters: boolean;
  showSummary: boolean;
  showSignatures: boolean;
  signatureLabelLeft: string;
  signatureLabelRight: string;
  layoutBlocks: PrintLayoutBlock[];
}

export interface NotificationRuleSettings {
  enabled: boolean;
  inApp: boolean;
  telegram: boolean;
}

export interface NotificationMessageTemplate {
  title: string;
  body: string;
}

export interface NotificationStyleSettings {
  telegramHeader: string;
  telegramFooter: string;
  includeTimestamp: boolean;
}

export interface DailySummaryNotificationSettings extends NotificationRuleSettings {
  hour: number;
  scope: NotificationSummaryScope;
}

export interface NotificationSettings {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  lowStock: NotificationRuleSettings;
  nearExpiry: NotificationRuleSettings;
  expired: NotificationRuleSettings;
  approvalRequests: NotificationRuleSettings;
  failedSync: NotificationRuleSettings;
  wastageThresholdExceeded: NotificationRuleSettings;
  dailySummary: DailySummaryNotificationSettings;
  wastageCostThreshold: number;
  style: NotificationStyleSettings;
  templates: Record<NotificationType, NotificationMessageTemplate>;
}

export interface PrintLayoutBlock {
  id: string;
  type: PrintLayoutBlockType;
  label: string;
  enabled: boolean;
  content: string;
  x: number;
  y: number;
  z: number;
  width: number;
  minHeight: number;
}

export interface Location {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  city: string;
  status: RecordStatus;
}

export interface BatchBarcode {
  id: string;
  batchId: string;
  barcode: string;
  createdAt: string;
}

export interface StockBatch {
  id: string;
  locationId: string;
  lotCode: string;
  quantity: number;
  receivedAt: string;
  expiryDate?: string;
  barcodes: BatchBarcode[];
}

export interface ItemStock {
  locationId: string;
  onHand: number;
  reserved: number;
  minLevel: number;
  maxLevel: number;
  batches: StockBatch[];
}

export interface ItemBarcode {
  id: string;
  itemId: string;
  barcode: string;
  barcodeType: BarcodeType;
  unitName: string;
  createdAt: string;
}

export interface ItemUnitConversion {
  id: string;
  itemId: string;
  unitName: string;
  quantityInBase: number;
  createdAt: string;
}

export interface Item {
  id: string;
  sku: string;
  barcode: string;
  barcodes: ItemBarcode[];
  name: string;
  category: string;
  unit: string;
  uomConversions: ItemUnitConversion[];
  supplierId: string;
  costPrice: number;
  sellingPrice: number;
  status: RecordStatus;
  stocks: ItemStock[];
  updatedAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  leadTimeDays: number;
  status: RecordStatus;
}

export interface MarketPriceEntry {
  id: string;
  marketDate: string;
  category: PriceCategory;
  itemId: string;
  itemName: string;
  locationId: string;
  locationName: string;
  supplierId?: string;
  supplierName?: string;
  unit: string;
  quotedPrice: number;
  previousPrice?: number;
  variancePct?: number;
  sourceName: string;
  note: string;
  capturedBy: string;
  capturedByName: string;
  createdAt: string;
}

export type UserStatus = "active" | "invited" | "archived";

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  permissions: PermissionKey[];
  assignedLocationIds: string[];
  status: UserStatus;
  lastSeenAt: string;
}

export interface InventoryRequest {
  id: string;
  reference: string;
  kind: RequestKind;
  status: RequestStatus;
  itemId: string;
  itemName: string;
  barcode: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  baseUnit: string;
  unitFactor: number;
  supplierId?: string;
  supplierName?: string;
  fromLocationId?: string;
  fromLocationName?: string;
  toLocationId?: string;
  toLocationName?: string;
  lotCode?: string;
  batchBarcode?: string;
  expiryDate?: string;
  receivedDate?: string;
  allocationSummary?: string;
  wasteReason?: WasteReason;
  wasteShift?: ShiftKey;
  wasteStation?: string;
  note: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
}

export interface WasteEntry {
  id: string;
  requestId: string;
  itemId: string;
  itemName: string;
  locationId: string;
  locationName: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  shift: ShiftKey;
  station: string;
  batchLotCode?: string;
  expiryDate?: string;
  estimatedCost: number;
  reportedBy: string;
  reportedByName: string;
  createdAt: string;
  note: string;
}

export interface MovementLedgerEntry {
  id: string;
  reference: string;
  itemId: string;
  itemName: string;
  locationId: string;
  locationName: string;
  changeType: RequestKind;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  actorId: string;
  actorName: string;
  createdAt: string;
  allocationSummary?: string;
  note: string;
}

export interface ActivityLog {
  id: string;
  seq: number;
  title: string;
  detail: string;
  actorId: string;
  actorName: string;
  createdAt: string;
  module: ModuleKey;
  severity: ActivitySeverity;
}

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  status: NotificationStatus;
  channels: NotificationChannel[];
  createdAt: string;
  readAt?: string;
  resolvedAt?: string;
  itemId?: string;
  itemName?: string;
  locationId?: string;
  locationName?: string;
  requestId?: string;
  metadata?: Record<string, boolean | number | string | null>;
}

export interface AppSettings {
  companyName: string;
  currency: string;
  timezone: string;
  timeSource: TimeSource;
  lowStockThreshold: number;
  expiryAlertDays: number;
  enableOffline: boolean;
  enableRealtime: boolean;
  enableBarcode: boolean;
  strictFefo: boolean;
  reportPrintTemplate: ReportPrintTemplate;
  notificationSettings: NotificationSettings;
}

export interface InventorySnapshot {
  generatedAt: string;
  syncCursor: number;
  items: Item[];
  suppliers: Supplier[];
  marketPrices: MarketPriceEntry[];
  wasteEntries: WasteEntry[];
  locations: Location[];
  users: User[];
  requests: InventoryRequest[];
  movementLedger: MovementLedgerEntry[];
  activity: ActivityLog[];
  notifications: NotificationRecord[];
  settings: AppSettings;
  rolePermissions: Record<Role, PermissionKey[]>;
}

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "positive" | "warning";
}

export interface InventoryAlert {
  id: string;
  kind: "low-stock" | "near-expiry" | "expired";
  itemId: string;
  itemName: string;
  sku: string;
  locationId: string;
  locationName: string;
  quantity: number;
  message: string;
  expiryDate?: string;
  lotCode?: string;
  daysUntilExpiry?: number;
}

export interface BootstrapPayload {
  appName: string;
  generatedAt: string;
  currentUser: User;
  snapshot: InventorySnapshot;
  initialization: {
    required: boolean;
    completedAt?: string;
  };
  featureFlags: {
    offline: boolean;
    realtime: boolean;
    barcode: boolean;
    export: boolean;
    printing: boolean;
  };
  transport: {
    restBasePath: string;
    websocketPath: string;
  };
}

export interface MutationPayload {
  itemId: string;
  quantity: number;
  note: string;
  barcode?: string;
  quantityUnit?: string;
  supplierId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  countedQuantity?: number;
  lotCode?: string;
  batchBarcode?: string;
  expiryDate?: string;
  receivedDate?: string;
  wasteReason?: WasteReason;
  wasteShift?: ShiftKey;
  wasteStation?: string;
}

export interface MutationEnvelope {
  clientMutationId: string;
  kind: RequestKind;
  createdAt: string;
  actorId: string;
  payload: MutationPayload;
}

export interface SyncEvent {
  seq: number;
  eventId: string;
  mutationId: string;
  timestamp: string;
  actorId: string;
  kind: RequestKind;
  updatedItem: Item;
  request: InventoryRequest;
  ledgerEntries: MovementLedgerEntry[];
  activity: ActivityLog;
  wasteEntry?: WasteEntry;
}

export interface PushRequest {
  cursor: number;
  mutations: MutationEnvelope[];
}

export interface PushResponse {
  appliedMutationIds: string[];
  rejected: Array<{ clientMutationId: string; reason: string }>;
  events: SyncEvent[];
  cursor: number;
  snapshot: InventorySnapshot;
}

export interface PullRequest {
  cursor: number;
}

export interface PullResponse {
  events: SyncEvent[];
  cursor: number;
  snapshot?: InventorySnapshot;
}

export interface CreateMarketPriceRequest {
  itemId: string;
  category: PriceCategory;
  locationId: string;
  supplierId?: string;
  quotedPrice: number;
  sourceName: string;
  marketDate: string;
  note: string;
}

export interface CreateMarketPriceResponse {
  entry: MarketPriceEntry;
  snapshot: InventorySnapshot;
}

export interface CreateItemRequest {
  sku: string;
  barcode: string;
  barcodes?: Array<{
    barcode: string;
    barcodeType: BarcodeType;
    unitName?: string;
  }>;
  uomConversions?: Array<{
    unitName: string;
    quantityInBase: number;
  }>;
  name: string;
  category: string;
  unit: string;
  supplierId: string;
  costPrice: number;
  sellingPrice: number;
  status: RecordStatus;
}

export interface CreateItemResponse {
  item: Item;
  snapshot: InventorySnapshot;
}

export interface UpdateItemRequest {
  itemId: string;
  sku: string;
  barcode: string;
  barcodes?: Array<{
    barcode: string;
    barcodeType: BarcodeType;
    unitName?: string;
  }>;
  uomConversions?: Array<{
    unitName: string;
    quantityInBase: number;
  }>;
  name: string;
  category: string;
  unit: string;
  supplierId: string;
  costPrice: number;
  sellingPrice: number;
  status: RecordStatus;
}

export interface UpdateItemResponse {
  item: Item;
  snapshot: InventorySnapshot;
}

export interface DeleteItemRequest {
  itemId: string;
}

export interface CreateSupplierRequest {
  code: string;
  name: string;
  email: string;
  phone: string;
  leadTimeDays: number;
  status: RecordStatus;
}

export interface CreateSupplierResponse {
  supplier: Supplier;
  snapshot: InventorySnapshot;
}

export interface UpdateSupplierRequest {
  supplierId: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  leadTimeDays: number;
  status: RecordStatus;
}

export interface UpdateSupplierResponse {
  supplier: Supplier;
  snapshot: InventorySnapshot;
}

export interface DeleteSupplierRequest {
  supplierId: string;
}

export interface CreateLocationRequest {
  code: string;
  name: string;
  type: LocationType;
  city: string;
  status: RecordStatus;
}

export interface CreateLocationResponse {
  location: Location;
  snapshot: InventorySnapshot;
}

export interface UpdateLocationRequest {
  locationId: string;
  code: string;
  name: string;
  type: LocationType;
  city: string;
  status: RecordStatus;
}

export interface UpdateLocationResponse {
  location: Location;
  snapshot: InventorySnapshot;
}

export interface DeleteLocationRequest {
  locationId: string;
}

export interface UpdateMarketPriceRequest {
  marketPriceId: string;
  itemId: string;
  category: PriceCategory;
  locationId: string;
  supplierId?: string;
  quotedPrice: number;
  sourceName: string;
  marketDate: string;
  note: string;
}

export interface UpdateMarketPriceResponse {
  entry: MarketPriceEntry;
  snapshot: InventorySnapshot;
}

export interface DeleteMarketPriceRequest {
  marketPriceId: string;
}

export interface DeleteSnapshotResponse {
  snapshot: InventorySnapshot;
}

export interface InitializationLocationInput {
  name: string;
  code: string;
  city: string;
  type: LocationType;
}

export interface InitializationUserInput {
  name: string;
  username: string;
  email: string;
  role: Role;
  password: string;
}

export interface InitializeSystemRequest {
  companyName: string;
  currency: string;
  timezone: string;
  timeSource?: TimeSource;
  lowStockThreshold: number;
  expiryAlertDays: number;
  enableOffline: boolean;
  enableRealtime: boolean;
  enableBarcode: boolean;
  strictFefo: boolean;
  reportPrintTemplate?: ReportPrintTemplate;
  locations: InitializationLocationInput[];
  users: InitializationUserInput[];
}

export interface InitializeSystemResponse {
  snapshot: InventorySnapshot;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  payload: BootstrapPayload;
}

export interface ActivateSuperadminRequest {
  identifier: string;
  password: string;
}

export interface CreateUserRequest {
  name: string;
  username: string;
  email: string;
  role: Role;
  password: string;
  status?: Exclude<UserStatus, "archived">;
  assignedLocationIds: string[];
  permissions?: PermissionKey[];
}

export interface UpdateUserRequest {
  userId: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  assignedLocationIds: string[];
  permissions: PermissionKey[];
}

export interface UpdateOwnProfileRequest {
  name: string;
}

export interface ResetUserPasswordRequest {
  userId: string;
  newPassword: string;
}

export interface ChangeOwnPasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface RemoveUserRequest {
  userId: string;
}

export interface UserAdminResponse {
  snapshot: InventorySnapshot;
}

export interface UpdateSettingsRequest {
  timezone: string;
  timeSource: TimeSource;
  lowStockThreshold: number;
  expiryAlertDays: number;
  enableOffline: boolean;
  enableRealtime: boolean;
  enableBarcode: boolean;
  strictFefo: boolean;
  reportPrintTemplate: ReportPrintTemplate;
  notificationSettings: NotificationSettings;
}

export interface SettingsResponse {
  snapshot: InventorySnapshot;
}

export interface MarkNotificationReadRequest {
  notificationId: string;
}

export interface ReportSyncFailureRequest {
  message: string;
}

export interface NotificationActionResponse {
  snapshot: InventorySnapshot;
}

export interface TestTelegramNotificationRequest {
  message?: string;
}

export interface TestTelegramNotificationResponse {
  ok: boolean;
  detail: string;
}

export interface UpdateRolePermissionsRequest {
  role: Role;
  permissions: PermissionKey[];
}

export interface RolePermissionsResponse {
  snapshot: InventorySnapshot;
}

export interface ProfileResponse {
  payload: BootstrapPayload;
}

export interface ReverseInventoryRequest {
  requestId: string;
  reason: string;
}

export interface DeleteInventoryRequest {
  requestId: string;
}

export interface EditInventoryRequest {
  requestId: string;
  reason: string;
  itemId: string;
  quantity: number;
  note: string;
  barcode?: string;
  quantityUnit?: string;
  supplierId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  countedQuantity?: number;
  lotCode?: string;
  batchBarcode?: string;
  expiryDate?: string;
  receivedDate?: string;
  wasteReason?: WasteReason;
  wasteShift?: ShiftKey;
  wasteStation?: string;
}

export interface InventoryActionResponse {
  snapshot: InventorySnapshot;
  replacementRequest?: InventoryRequest;
  reversalRequest?: InventoryRequest;
}

export type RealtimeMessage =
  | { type: "hello"; cursor: number }
  | { type: "event"; event: SyncEvent }
  | { type: "pong"; cursor: number }
  | {
      type: "snapshot-refresh";
      scope: "inventory-ops" | "market-prices" | "master-data" | "notifications";
      triggeredAt: string;
    }
  | { type: "error"; message: string };

export interface CachedBootstrapRecord {
  userId: string;
  payload: BootstrapPayload;
  cachedAt: string;
}

export interface OutboxRecord extends MutationEnvelope {
  queuedAt: string;
}
