import type {
  ActivityLog,
  InventoryRequest,
  InventorySnapshot,
  Item,
  ItemStock,
  Location,
  MovementLedgerEntry,
  MutationEnvelope,
  RequestKind,
  StockBatch,
  SyncEvent,
  User,
  WasteEntry,
} from "./types";

export const OPERATION_LABELS: Record<RequestKind, string> = {
  grn: "GRN Request",
  gin: "GIN Request",
  transfer: "Transfer",
  adjustment: "Adjustment",
  "stock-count": "Stock Count",
  wastage: "Wastage",
};

const OPERATION_PREFIXES: Record<RequestKind, string> = {
  grn: "GRN",
  gin: "GIN",
  transfer: "TRF",
  adjustment: "ADJ",
  "stock-count": "CNT",
  wastage: "WST",
};

interface BatchAllocation {
  lotCode: string;
  quantity: number;
  receivedAt: string;
  expiryDate?: string;
}

export interface MutationResult {
  snapshot: InventorySnapshot;
  event: SyncEvent;
}

export interface ApplyMutationOptions {
  idFactory?: (prefix: string) => string;
  referenceFactory?: (kind: RequestKind, fallbackSequence: number) => string;
  nextSeq?: number;
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function timeValue(iso?: string): number | null {
  if (!iso) {
    return null;
  }

  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function isExpired(batch: StockBatch, referenceDate: string): boolean {
  const expiry = timeValue(batch.expiryDate);
  return expiry !== null && expiry < new Date(referenceDate).getTime();
}

function getLocation(snapshot: InventorySnapshot, locationId?: string): Location | undefined {
  return snapshot.locations.find((location) => location.id === locationId);
}

function getActor(snapshot: InventorySnapshot, actorId: string): User {
  const actor = snapshot.users.find((user) => user.id === actorId);
  if (!actor) {
    throw new Error("Actor not found.");
  }

  return actor;
}

function getItem(snapshot: InventorySnapshot, itemId: string): Item {
  const item = snapshot.items.find((record) => record.id === itemId);
  if (!item) {
    throw new Error("Item not found.");
  }

  return item;
}

function getOrCreateStock(item: Item, locationId: string): ItemStock {
  let stock = item.stocks.find((record) => record.locationId === locationId);
  if (!stock) {
    stock = {
      locationId,
      onHand: 0,
      reserved: 0,
      minLevel: 0,
      maxLevel: 0,
      batches: [],
    };
    item.stocks.push(stock);
  }

  if (!stock.batches) {
    stock.batches = [];
  }

  return stock;
}

function refreshStock(stock: ItemStock) {
  stock.batches = (stock.batches ?? []).filter((batch) => batch.quantity > 0);
  stock.onHand = stock.batches.reduce((sum, batch) => sum + batch.quantity, 0);
}

function refreshItemStocks(item: Item) {
  item.stocks.forEach(refreshStock);
}

function referenceFor(kind: RequestKind, sequence: number): string {
  return `${OPERATION_PREFIXES[kind]}-${String(sequence).padStart(4, "0")}`;
}

function buildLedgerEntry(input: {
  id: string;
  mutation: MutationEnvelope;
  actor: User;
  item: Item;
  location: Location;
  reference: string;
  before: number;
  delta: number;
  now: string;
  note: string;
  allocationSummary?: string;
}): MovementLedgerEntry {
  return {
    id: input.id,
    reference: input.reference,
    itemId: input.item.id,
    itemName: input.item.name,
    locationId: input.location.id,
    locationName: input.location.name,
    changeType: input.mutation.kind,
    quantityBefore: input.before,
    quantityChange: input.delta,
    quantityAfter: input.before + input.delta,
    actorId: input.actor.id,
    actorName: input.actor.name,
    createdAt: input.now,
    allocationSummary: input.allocationSummary,
    note: input.note,
  };
}

function upsertItem(snapshot: InventorySnapshot, item: Item) {
  snapshot.items = snapshot.items.map((record) =>
    record.id === item.id ? item : record,
  );
}

function moduleSeverity(kind: RequestKind): ActivityLog["severity"] {
  if (kind === "adjustment" || kind === "wastage" || kind === "stock-count") {
    return "warning";
  }

  return "success";
}

function normalizedExpiry(expiryDate?: string): string | undefined {
  const trimmed = expiryDate?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedReceived(receivedAt: string | undefined, fallback: string): string {
  const trimmed = receivedAt?.trim();
  return trimmed || fallback;
}

function batchSortValue(batch: StockBatch): number {
  return timeValue(batch.expiryDate) ?? Number.MAX_SAFE_INTEGER;
}

function sortFefoBatches(batches: StockBatch[], referenceDate: string): StockBatch[] {
  return [...batches]
    .filter((batch) => batch.quantity > 0 && !isExpired(batch, referenceDate))
    .sort((left, right) => {
      const expiryDifference = batchSortValue(left) - batchSortValue(right);
      if (expiryDifference !== 0) {
        return expiryDifference;
      }

      return left.receivedAt.localeCompare(right.receivedAt);
    });
}

function sortRemovalBatches(batches: StockBatch[], referenceDate: string): StockBatch[] {
  return [...batches]
    .filter((batch) => batch.quantity > 0)
    .sort((left, right) => {
      const expiredDifference = Number(isExpired(right, referenceDate)) - Number(isExpired(left, referenceDate));
      if (expiredDifference !== 0) {
        return expiredDifference;
      }

      const expiryDifference = batchSortValue(left) - batchSortValue(right);
      if (expiryDifference !== 0) {
        return expiryDifference;
      }

      return left.receivedAt.localeCompare(right.receivedAt);
    });
}

function summarizeAllocations(prefix: string, allocations: BatchAllocation[]): string | undefined {
  if (allocations.length === 0) {
    return undefined;
  }

  return `${prefix} ${allocations
    .map((allocation) => `${allocation.lotCode} (${allocation.quantity})`)
    .join(", ")}.`;
}

function upsertBatch(
  stock: ItemStock,
  batch: Omit<StockBatch, "id"> & { id?: string },
  makeId: (prefix: string) => string,
) {
  const existing = stock.batches.find(
    (entry) =>
      entry.lotCode === batch.lotCode &&
      entry.receivedAt === batch.receivedAt &&
      (entry.expiryDate ?? "") === (batch.expiryDate ?? ""),
  );

  if (existing) {
    existing.quantity += batch.quantity;
    return existing;
  }

  stock.batches.push({
    id: batch.id || makeId("bat"),
    locationId: stock.locationId,
    lotCode: batch.lotCode,
    quantity: batch.quantity,
    receivedAt: batch.receivedAt,
    expiryDate: batch.expiryDate,
  });

  return stock.batches[stock.batches.length - 1];
}

function consumeFromStock(
  stock: ItemStock,
  quantity: number,
  referenceDate: string,
  strategy: "fefo" | "remove-first",
): BatchAllocation[] {
  const candidates =
    strategy === "fefo"
      ? sortFefoBatches(stock.batches, referenceDate)
      : sortRemovalBatches(stock.batches, referenceDate);

  let remaining = quantity;
  const allocations: BatchAllocation[] = [];

  for (const batch of candidates) {
    if (remaining <= 0) {
      break;
    }

    const take = Math.min(batch.quantity, remaining);
    if (take <= 0) {
      continue;
    }

    batch.quantity -= take;
    remaining -= take;
    allocations.push({
      lotCode: batch.lotCode,
      quantity: take,
      receivedAt: batch.receivedAt,
      expiryDate: batch.expiryDate,
    });
  }

  if (remaining > 0) {
    throw new Error("Not enough stock is available to complete the requested movement.");
  }

  refreshStock(stock);
  return allocations;
}

function assertOutboundAvailability(
  stock: ItemStock,
  requestedQuantity: number,
  referenceDate: string,
  strictFefo: boolean,
) {
  const totalQuantity = stock.batches.reduce((sum, batch) => sum + batch.quantity, 0);
  const nonExpiredQuantity = sortFefoBatches(stock.batches, referenceDate).reduce(
    (sum, batch) => sum + batch.quantity,
    0,
  );
  const expiredQuantity = totalQuantity - nonExpiredQuantity;

  if (nonExpiredQuantity >= requestedQuantity) {
    return;
  }

  if (strictFefo && expiredQuantity > 0 && totalQuantity >= requestedQuantity) {
    throw new Error(
      `Only ${nonExpiredQuantity} units are still sellable at this location. ${expiredQuantity} units are expired and blocked by FEFO.`,
    );
  }

  throw new Error(
    `Only ${nonExpiredQuantity} non-expired units are available for this outbound movement.`,
  );
}

function createInboundBatch(
  locationId: string,
  quantity: number,
  mutation: MutationEnvelope,
  now: string,
  lotCodeFallback: string,
): Omit<StockBatch, "id"> {
  return {
    locationId,
    lotCode: mutation.payload.lotCode?.trim() || lotCodeFallback,
    quantity,
    receivedAt: normalizedReceived(mutation.payload.receivedDate, now),
    expiryDate: normalizedExpiry(mutation.payload.expiryDate),
  };
}

export function applyMutation(
  snapshot: InventorySnapshot,
  mutation: MutationEnvelope,
  options: ApplyMutationOptions = {},
): MutationResult {
  const nextSnapshot = structuredClone(snapshot);
  const actor = getActor(nextSnapshot, mutation.actorId);
  const item = structuredClone(getItem(nextSnapshot, mutation.payload.itemId));
  const makeId = options.idFactory ?? createId;
  const note = mutation.payload.note.trim() || `${OPERATION_LABELS[mutation.kind]} processed.`;
  const now = mutation.createdAt;
  const quantity = Number(mutation.payload.quantity);

  if (!Number.isFinite(quantity)) {
    throw new Error("Quantity must be a valid number.");
  }

  if (
    (mutation.kind === "grn" ||
      mutation.kind === "gin" ||
      mutation.kind === "transfer" ||
      mutation.kind === "wastage") &&
    quantity <= 0
  ) {
    throw new Error("Quantity must be greater than zero for this operation.");
  }

  if (mutation.kind === "adjustment" && quantity === 0) {
    throw new Error("Adjustment quantity must be positive or negative.");
  }

  const reference = options.referenceFactory
    ? options.referenceFactory(mutation.kind, nextSnapshot.requests.length + 1001)
    : referenceFor(mutation.kind, nextSnapshot.requests.length + 1001);
  const ledgerEntries: MovementLedgerEntry[] = [];
  const touchedLocations = new Set<string>();

  const fromLocation = getLocation(nextSnapshot, mutation.payload.fromLocationId);
  const toLocation = getLocation(nextSnapshot, mutation.payload.toLocationId);
  const supplier = nextSnapshot.suppliers.find(
    (record) => record.id === mutation.payload.supplierId,
  );

  let allocationSummary: string | undefined;
  let requestLotCode = mutation.payload.lotCode?.trim() || undefined;
  let requestExpiryDate = normalizedExpiry(mutation.payload.expiryDate);
  let requestReceivedDate = mutation.payload.receivedDate?.trim() || undefined;
  let wasteEntry: WasteEntry | undefined;

  switch (mutation.kind) {
    case "grn": {
      if (!toLocation) {
        throw new Error("GRN requires a destination warehouse or outlet.");
      }

      const stock = getOrCreateStock(item, toLocation.id);
      const before = stock.onHand;
      const inboundBatch = createInboundBatch(
        toLocation.id,
        Math.abs(quantity),
        mutation,
        now,
        `${reference}-LOT`,
      );
      const storedBatch = upsertBatch(stock, inboundBatch, makeId);
      refreshStock(stock);
      touchedLocations.add(toLocation.id);
      allocationSummary = summarizeAllocations("Received into lot", [
        {
          lotCode: storedBatch.lotCode,
          quantity: Math.abs(quantity),
          receivedAt: storedBatch.receivedAt,
          expiryDate: storedBatch.expiryDate,
        },
      ]);
      requestLotCode = storedBatch.lotCode;
      requestExpiryDate = storedBatch.expiryDate;
      requestReceivedDate = storedBatch.receivedAt;
      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: toLocation,
          reference,
          before,
          delta: Math.abs(quantity),
          now,
          note,
          allocationSummary,
        }),
      );
      break;
    }
    case "gin": {
      if (!fromLocation) {
        throw new Error("GIN requires a source warehouse or outlet.");
      }

      const stock = getOrCreateStock(item, fromLocation.id);
      assertOutboundAvailability(
        stock,
        Math.abs(quantity),
        now,
        nextSnapshot.settings.strictFefo,
      );
      const before = stock.onHand;
      const allocations = consumeFromStock(stock, Math.abs(quantity), now, "fefo");
      touchedLocations.add(fromLocation.id);
      allocationSummary = summarizeAllocations("FEFO issued from", allocations);
      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: fromLocation,
          reference,
          before,
          delta: -Math.abs(quantity),
          now,
          note,
          allocationSummary,
        }),
      );
      break;
    }
    case "transfer": {
      if (!fromLocation || !toLocation) {
        throw new Error("Transfer requires both source and destination.");
      }

      const outStock = getOrCreateStock(item, fromLocation.id);
      assertOutboundAvailability(
        outStock,
        Math.abs(quantity),
        now,
        nextSnapshot.settings.strictFefo,
      );
      const outBefore = outStock.onHand;
      const allocations = consumeFromStock(outStock, Math.abs(quantity), now, "fefo");

      const inStock = getOrCreateStock(item, toLocation.id);
      const inBefore = inStock.onHand;
      for (const allocation of allocations) {
        upsertBatch(
          inStock,
          {
            locationId: toLocation.id,
            lotCode: allocation.lotCode,
            quantity: allocation.quantity,
            receivedAt: allocation.receivedAt,
            expiryDate: allocation.expiryDate,
          },
          makeId,
        );
      }
      refreshStock(inStock);

      touchedLocations.add(fromLocation.id);
      touchedLocations.add(toLocation.id);
      allocationSummary = summarizeAllocations("FEFO transferred from", allocations);

      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: fromLocation,
          reference,
          before: outBefore,
          delta: -Math.abs(quantity),
          now,
          note,
          allocationSummary,
        }),
      );
      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: toLocation,
          reference,
          before: inBefore,
          delta: Math.abs(quantity),
          now,
          note,
          allocationSummary,
        }),
      );
      break;
    }
    case "adjustment": {
      if (!fromLocation) {
        throw new Error("Adjustment requires a target location.");
      }

      const stock = getOrCreateStock(item, fromLocation.id);
      const before = stock.onHand;

      if (quantity > 0) {
        const inboundBatch = createInboundBatch(
          fromLocation.id,
          quantity,
          mutation,
          now,
          `${reference}-ADJ`,
        );
        const storedBatch = upsertBatch(stock, inboundBatch, makeId);
        refreshStock(stock);
        allocationSummary = summarizeAllocations("Adjustment added to", [
          {
            lotCode: storedBatch.lotCode,
            quantity,
            receivedAt: storedBatch.receivedAt,
            expiryDate: storedBatch.expiryDate,
          },
        ]);
        requestLotCode = storedBatch.lotCode;
        requestExpiryDate = storedBatch.expiryDate;
        requestReceivedDate = storedBatch.receivedAt;
      } else {
        const allocations = consumeFromStock(stock, Math.abs(quantity), now, "remove-first");
        allocationSummary = summarizeAllocations("Adjustment removed from", allocations);
      }

      touchedLocations.add(fromLocation.id);
      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: fromLocation,
          reference,
          before,
          delta: quantity,
          now,
          note,
          allocationSummary,
        }),
      );
      break;
    }
    case "stock-count": {
      if (!fromLocation) {
        throw new Error("Stock count requires a counted location.");
      }

      const countedQuantity = Number(
        mutation.payload.countedQuantity ?? mutation.payload.quantity,
      );
      if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
        throw new Error("Stock count requires a valid counted quantity.");
      }

      const stock = getOrCreateStock(item, fromLocation.id);
      const before = stock.onHand;
      const delta = countedQuantity - before;

      if (delta > 0) {
        const inboundBatch = createInboundBatch(
          fromLocation.id,
          delta,
          mutation,
          now,
          `${reference}-COUNT`,
        );
        const storedBatch = upsertBatch(stock, inboundBatch, makeId);
        refreshStock(stock);
        allocationSummary = summarizeAllocations("Count variance added to", [
          {
            lotCode: storedBatch.lotCode,
            quantity: delta,
            receivedAt: storedBatch.receivedAt,
            expiryDate: storedBatch.expiryDate,
          },
        ]);
        requestLotCode = storedBatch.lotCode;
        requestExpiryDate = storedBatch.expiryDate;
        requestReceivedDate = storedBatch.receivedAt;
      } else if (delta < 0) {
        const allocations = consumeFromStock(stock, Math.abs(delta), now, "remove-first");
        allocationSummary = summarizeAllocations("Count variance removed from", allocations);
      } else {
        allocationSummary = "No batch variance was found during the count.";
      }

      touchedLocations.add(fromLocation.id);
      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: fromLocation,
          reference,
          before,
          delta,
          now,
          note,
          allocationSummary,
        }),
      );
      break;
    }
    case "wastage": {
      if (!fromLocation) {
        throw new Error("Wastage requires a source location.");
      }

      const stock = getOrCreateStock(item, fromLocation.id);
      const before = stock.onHand;
      const allocations = consumeFromStock(stock, Math.abs(quantity), now, "remove-first");
      const wasteReason = mutation.payload.wasteReason ?? "spoilage";
      const wasteShift = mutation.payload.wasteShift ?? "morning";
      const wasteStation = mutation.payload.wasteStation?.trim() || fromLocation.name;
      touchedLocations.add(fromLocation.id);
      allocationSummary = summarizeAllocations("Wastage removed from", allocations);
      wasteEntry = {
        id: makeId("wte"),
        requestId: "",
        itemId: item.id,
        itemName: item.name,
        locationId: fromLocation.id,
        locationName: fromLocation.name,
        quantity: Math.abs(quantity),
        unit: item.unit,
        reason: wasteReason,
        shift: wasteShift,
        station: wasteStation,
        batchLotCode: allocations.map((allocation) => allocation.lotCode).join(", "),
        expiryDate: allocations
          .map((allocation) => allocation.expiryDate)
          .filter((value): value is string => Boolean(value))
          .sort()[0],
        estimatedCost: Math.abs(quantity) * item.costPrice,
        reportedBy: actor.id,
        reportedByName: actor.name,
        createdAt: now,
        note,
      };
      ledgerEntries.push(
        buildLedgerEntry({
          id: makeId("led"),
          mutation,
          actor,
          item,
          location: fromLocation,
          reference,
          before,
          delta: -Math.abs(quantity),
          now,
          note,
          allocationSummary,
        }),
      );
      break;
    }
  }

  refreshItemStocks(item);
  item.updatedAt = now;
  upsertItem(nextSnapshot, item);

  const request: InventoryRequest = {
    id: makeId("req"),
    reference,
    kind: mutation.kind,
    status: "posted",
    itemId: item.id,
    itemName: item.name,
    barcode: mutation.payload.barcode ?? item.barcode,
    quantity:
      mutation.kind === "stock-count"
        ? Number(mutation.payload.countedQuantity ?? mutation.payload.quantity)
        : quantity,
    unit: item.unit,
    supplierId: supplier?.id,
    supplierName: supplier?.name,
    fromLocationId: fromLocation?.id,
    fromLocationName: fromLocation?.name,
    toLocationId: toLocation?.id,
    toLocationName: toLocation?.name,
    lotCode: requestLotCode,
    expiryDate: requestExpiryDate,
    receivedDate: requestReceivedDate,
    allocationSummary,
    wasteReason: mutation.kind === "wastage" ? mutation.payload.wasteReason ?? "spoilage" : undefined,
    wasteShift: mutation.kind === "wastage" ? mutation.payload.wasteShift ?? "morning" : undefined,
    wasteStation:
      mutation.kind === "wastage"
        ? mutation.payload.wasteStation?.trim() || fromLocation?.name
        : undefined,
    note,
    requestedBy: actor.id,
    requestedByName: actor.name,
    requestedAt: now,
  };

  if (wasteEntry) {
    wasteEntry.requestId = request.id;
  }

  const nextSeq = options.nextSeq ?? nextSnapshot.syncCursor + 1;
  const activityDetail = `${request.reference} updated ${item.name} across ${touchedLocations.size} location(s).${
    allocationSummary ? ` ${allocationSummary}` : ""
  }`;
  const activity: ActivityLog = {
    id: makeId("act"),
    seq: nextSeq,
    title: `${OPERATION_LABELS[mutation.kind]} posted`,
    detail: activityDetail,
    actorId: actor.id,
    actorName: actor.name,
    createdAt: now,
    module: "inventoryOps",
    severity: moduleSeverity(mutation.kind),
  };

  nextSnapshot.requests = [request, ...nextSnapshot.requests].slice(0, 160);
  nextSnapshot.movementLedger = [...ledgerEntries, ...nextSnapshot.movementLedger].slice(
    0,
    400,
  );
  if (wasteEntry) {
    nextSnapshot.wasteEntries = [wasteEntry, ...nextSnapshot.wasteEntries].slice(0, 160);
  }
  nextSnapshot.activity = [activity, ...nextSnapshot.activity].slice(0, 160);
  nextSnapshot.syncCursor = nextSeq;
  nextSnapshot.generatedAt = now;

  return {
    snapshot: nextSnapshot,
    event: {
      seq: nextSeq,
      eventId: makeId("evt"),
      mutationId: mutation.clientMutationId,
      timestamp: now,
      actorId: actor.id,
      kind: mutation.kind,
      updatedItem: structuredClone(item),
      request,
      ledgerEntries,
      activity,
      wasteEntry,
    },
  };
}

export function applySyncEvents(
  snapshot: InventorySnapshot,
  events: SyncEvent[],
): InventorySnapshot {
  let nextSnapshot = structuredClone(snapshot);

  for (const event of events) {
    nextSnapshot.items = nextSnapshot.items.map((item) =>
      item.id === event.updatedItem.id ? event.updatedItem : item,
    );

    if (!nextSnapshot.requests.some((request) => request.id === event.request.id)) {
      nextSnapshot.requests = [event.request, ...nextSnapshot.requests];
    } else {
      nextSnapshot.requests = nextSnapshot.requests.map((request) =>
        request.id === event.request.id ? event.request : request,
      );
    }

    for (const ledgerEntry of event.ledgerEntries.slice().reverse()) {
      if (!nextSnapshot.movementLedger.some((record) => record.id === ledgerEntry.id)) {
        nextSnapshot.movementLedger = [ledgerEntry, ...nextSnapshot.movementLedger];
      }
    }

    if (!nextSnapshot.activity.some((record) => record.id === event.activity.id)) {
      nextSnapshot.activity = [event.activity, ...nextSnapshot.activity];
    }

    if (
      event.wasteEntry &&
      !nextSnapshot.wasteEntries.some((record) => record.id === event.wasteEntry?.id)
    ) {
      nextSnapshot.wasteEntries = [event.wasteEntry, ...nextSnapshot.wasteEntries];
    }

    nextSnapshot.syncCursor = Math.max(nextSnapshot.syncCursor, event.seq);
    nextSnapshot.generatedAt = event.timestamp;
  }

  nextSnapshot.requests = nextSnapshot.requests.slice(0, 160);
  nextSnapshot.movementLedger = nextSnapshot.movementLedger.slice(0, 400);
  nextSnapshot.wasteEntries = nextSnapshot.wasteEntries.slice(0, 160);
  nextSnapshot.activity = nextSnapshot.activity.slice(0, 160);

  return nextSnapshot;
}
