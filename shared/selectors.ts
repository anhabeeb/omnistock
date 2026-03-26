import { canAccessModule } from "./permissions";
import type {
  BatchBarcode,
  BootstrapPayload,
  DashboardMetric,
  InventoryAlert,
  InventorySnapshot,
  Item,
  ItemBarcode,
  MovementLedgerEntry,
  StockBatch,
  User,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function setupUser(): User {
  return {
    id: "usr-setup",
    name: "Setup Wizard",
    username: "setup",
    email: "setup@omnistock.local",
    role: "superadmin",
    permissions: [],
    assignedLocationIds: [],
    status: "active",
    lastSeenAt: new Date().toISOString(),
  };
}

function timeValue(iso?: string): number | null {
  if (!iso) {
    return null;
  }

  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function locationName(snapshot: InventorySnapshot, locationId: string): string {
  return snapshot.locations.find((location) => location.id === locationId)?.name ?? locationId;
}

function expiryPriority(batch: StockBatch): number {
  const expiry = timeValue(batch.expiryDate);
  return expiry ?? Number.MAX_SAFE_INTEGER;
}

export function getUser(snapshot: InventorySnapshot, userId?: string): User {
  if (userId) {
    const matched = snapshot.users.find((user) => user.id === userId);
    if (matched) {
      return matched;
    }
  }

  return snapshot.users[0] ?? setupUser();
}

export function totalOnHand(item: Item): number {
  return item.stocks.reduce((sum, stock) => sum + stock.onHand, 0);
}

export function itemBarcodeValues(item: Item): string[] {
  return [...new Set([item.barcode, ...item.barcodes.map((entry) => entry.barcode)].filter(Boolean))];
}

export function batchBarcodeValues(batch: StockBatch): string[] {
  return [...new Set((batch.barcodes ?? []).map((entry) => entry.barcode).filter(Boolean))];
}

function unitKey(value: string): string {
  return value.trim().toLowerCase();
}

export interface ItemUnitOption {
  unitName: string;
  quantityInBase: number;
  isBase: boolean;
}

export function itemUnitOptions(item: Item): ItemUnitOption[] {
  const options: ItemUnitOption[] = [{ unitName: item.unit, quantityInBase: 1, isBase: true }];
  const seen = new Set([unitKey(item.unit)]);

  for (const entry of item.uomConversions ?? []) {
    const normalized = unitKey(entry.unitName);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({
      unitName: entry.unitName,
      quantityInBase: entry.quantityInBase,
      isBase: false,
    });
  }

  return options;
}

export function conversionForUnit(
  item: Item,
  unitName?: string,
): ItemUnitOption {
  if (!unitName?.trim()) {
    return itemUnitOptions(item)[0];
  }

  const normalized = unitKey(unitName);
  return (
    itemUnitOptions(item).find((entry) => unitKey(entry.unitName) === normalized) ??
    itemUnitOptions(item)[0]
  );
}

export function barcodeUnitName(item: Item, barcode?: ItemBarcode): string {
  return conversionForUnit(item, barcode?.unitName).unitName;
}

export interface BarcodeLookupResult {
  item: Item;
  source: "sku" | "item-barcode" | "batch-barcode";
  itemBarcode?: ItemBarcode;
  batch?: StockBatch;
  batchBarcode?: BatchBarcode;
}

export function totalInventoryValue(snapshot: InventorySnapshot): number {
  return snapshot.items.reduce(
    (sum, item) => sum + totalOnHand(item) * item.costPrice,
    0,
  );
}

export function lowStockItems(snapshot: InventorySnapshot): Item[] {
  return snapshot.items.filter((item) =>
    item.stocks.some((stock) => stock.onHand <= stock.minLevel),
  );
}

export function openRequests(snapshot: InventorySnapshot) {
  return snapshot.requests.filter((request) => request.status !== "posted");
}

export function recentLedger(
  snapshot: InventorySnapshot,
  take = 8,
): MovementLedgerEntry[] {
  return [...snapshot.movementLedger]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, take);
}

export function batchesForLocation(item: Item, locationId: string): StockBatch[] {
  const stock = item.stocks.find((entry) => entry.locationId === locationId);
  return [...(stock?.batches ?? [])]
    .filter((batch) => batch.quantity > 0)
    .sort((left, right) => {
      const expiryDifference = expiryPriority(left) - expiryPriority(right);
      if (expiryDifference !== 0) {
        return expiryDifference;
      }

      return left.receivedAt.localeCompare(right.receivedAt);
    });
}

export function batchDaysUntilExpiry(batch: StockBatch, referenceDate = Date.now()): number | undefined {
  const expiry = timeValue(batch.expiryDate);
  if (expiry === null) {
    return undefined;
  }

  return Math.floor((expiry - referenceDate) / DAY_MS);
}

export function isBatchExpired(batch: StockBatch, referenceDate = Date.now()): boolean {
  const days = batchDaysUntilExpiry(batch, referenceDate);
  return days !== undefined && days < 0;
}

export function isBatchNearExpiry(
  batch: StockBatch,
  snapshot: InventorySnapshot,
  referenceDate = Date.now(),
): boolean {
  const days = batchDaysUntilExpiry(batch, referenceDate);
  return (
    days !== undefined &&
    days >= 0 &&
    days <= snapshot.settings.expiryAlertDays
  );
}

export function expiredAlerts(snapshot: InventorySnapshot): InventoryAlert[] {
  const now = Date.now();

  return snapshot.items.flatMap((item) =>
    item.stocks.flatMap((stock) =>
      (stock.batches ?? [])
        .filter((batch) => batch.quantity > 0 && isBatchExpired(batch, now))
        .map((batch) => ({
          id: `expired:${item.id}:${stock.locationId}:${batch.id}`,
          kind: "expired" as const,
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          locationId: stock.locationId,
          locationName: locationName(snapshot, stock.locationId),
          quantity: batch.quantity,
          expiryDate: batch.expiryDate,
          lotCode: batch.lotCode,
          daysUntilExpiry: batchDaysUntilExpiry(batch, now),
          message: `Expired lot ${batch.lotCode} is still on hand and should be blocked for normal issue.`,
        })),
    ),
  );
}

export function nearExpiryAlerts(snapshot: InventorySnapshot): InventoryAlert[] {
  const now = Date.now();

  return snapshot.items.flatMap((item) =>
    item.stocks.flatMap((stock) =>
      (stock.batches ?? [])
        .filter((batch) => batch.quantity > 0 && isBatchNearExpiry(batch, snapshot, now))
        .map((batch) => ({
          id: `near:${item.id}:${stock.locationId}:${batch.id}`,
          kind: "near-expiry" as const,
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          locationId: stock.locationId,
          locationName: locationName(snapshot, stock.locationId),
          quantity: batch.quantity,
          expiryDate: batch.expiryDate,
          lotCode: batch.lotCode,
          daysUntilExpiry: batchDaysUntilExpiry(batch, now),
          message: `Lot ${batch.lotCode} should be issued first under FEFO before fresher stock.`,
        })),
    ),
  );
}

export function lowStockAlerts(snapshot: InventorySnapshot): InventoryAlert[] {
  return snapshot.items.flatMap((item) =>
    item.stocks
      .filter((stock) => stock.onHand <= stock.minLevel)
      .map((stock) => ({
        id: `low:${item.id}:${stock.locationId}`,
        kind: "low-stock" as const,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        locationId: stock.locationId,
        locationName: locationName(snapshot, stock.locationId),
        quantity: stock.onHand,
        message: `Stock is at or below minimum threshold (${stock.minLevel}) for this location.`,
      })),
  );
}

export function inventoryAlerts(snapshot: InventorySnapshot): InventoryAlert[] {
  const expired = expiredAlerts(snapshot);
  const nearExpiry = nearExpiryAlerts(snapshot);
  const lowStock = lowStockAlerts(snapshot);

  return [...expired, ...nearExpiry, ...lowStock];
}

export function dashboardMetrics(snapshot: InventorySnapshot): DashboardMetric[] {
  const lowStock = lowStockAlerts(snapshot);
  const expiryAlerts = [...expiredAlerts(snapshot), ...nearExpiryAlerts(snapshot)];
  const inventoryValue = totalInventoryValue(snapshot);
  const movementsLast24h = snapshot.movementLedger.filter((entry) => {
    return Date.now() - new Date(entry.createdAt).getTime() <= 24 * 60 * 60 * 1000;
  });

  return [
    {
      label: "Inventory Value",
      value: new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency: snapshot.settings.currency,
        maximumFractionDigits: 0,
      }).format(inventoryValue),
      detail: "Calculated from current on-hand quantity and cost price.",
      tone: "positive",
    },
    {
      label: "Low Stock Alerts",
      value: String(lowStock.length),
      detail: "Items at or below minimum threshold across all sites.",
      tone: lowStock.length > 0 ? "warning" : "positive",
    },
    {
      label: "Expiry Alerts",
      value: String(expiryAlerts.length),
      detail: `Expired and next ${snapshot.settings.expiryAlertDays} day batches needing FEFO attention.`,
      tone: expiryAlerts.length > 0 ? "warning" : "neutral",
    },
    {
      label: "24h Movements",
      value: String(movementsLast24h.length),
      detail: "Ledger entries posted in the last rolling 24 hours.",
      tone: "neutral",
    },
  ];
}

export function buildBootstrapPayload(
  snapshot: InventorySnapshot,
  userId?: string,
): BootstrapPayload {
  const currentUser = getUser(snapshot, userId);
  return {
    appName: "OmniStock",
    generatedAt: snapshot.generatedAt,
    currentUser,
    snapshot,
    initialization: {
      required: snapshot.users.length === 0,
    },
    featureFlags: {
      offline: snapshot.settings.enableOffline,
      realtime: snapshot.settings.enableRealtime,
      barcode: snapshot.settings.enableBarcode,
      export: true,
      printing: true,
    },
    transport: {
      restBasePath: "/api",
      websocketPath: "/ws",
    },
  };
}

export function visibleModuleCount(
  snapshot: InventorySnapshot,
  userId?: string,
): number {
  const user = getUser(snapshot, userId);
  return (
    ["dashboard", "inventoryOps", "masterData", "reports", "administration"] as const
  ).filter((moduleKey) => canAccessModule(user, moduleKey)).length;
}

export function findItemByBarcode(
  snapshot: InventorySnapshot,
  code: string,
): Item | undefined {
  return findBarcodeMatch(snapshot, code)?.item;
}

export function findBarcodeMatch(
  snapshot: InventorySnapshot,
  code: string,
): BarcodeLookupResult | undefined {
  const cleaned = code.trim();
  if (!cleaned) {
    return undefined;
  }

  for (const item of snapshot.items) {
    if (item.sku === cleaned) {
      return { item, source: "sku" };
    }

    const matchedItemBarcode =
      item.barcodes.find((entry) => entry.barcode === cleaned) ??
      (item.barcode === cleaned
        ? {
            id: `${item.id}-primary`,
            itemId: item.id,
            barcode: item.barcode,
            barcodeType: "primary" as const,
            unitName: item.unit,
            createdAt: item.updatedAt,
          }
        : undefined);

    if (matchedItemBarcode) {
      return {
        item,
        source: "item-barcode",
        itemBarcode: matchedItemBarcode,
      };
    }

    for (const stock of item.stocks) {
      for (const batch of stock.batches) {
        const matchedBatchBarcode = batch.barcodes.find((entry) => entry.barcode === cleaned);
        if (matchedBatchBarcode) {
          return {
            item,
            source: "batch-barcode",
            batch,
            batchBarcode: matchedBatchBarcode,
          };
        }
      }
    }
  }

  return undefined;
}
