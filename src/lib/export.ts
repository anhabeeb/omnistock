import type { MarketPriceEntry, MovementLedgerEntry, WasteEntry } from "../../shared/types";

export interface WorkbookSheet {
  name: string;
  rows: Array<Record<string, string | number | boolean | null | undefined>>;
}

export async function exportWorkbook(sheets: WorkbookSheet[], filename: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  XLSX.writeFile(workbook, filename);
}

export async function exportMovementLedger(entries: MovementLedgerEntry[]) {
  await exportWorkbook(
    [
      {
        name: "Movement Ledger",
        rows: entries.map((entry) => ({
      Reference: entry.reference,
      Item: entry.itemName,
      Location: entry.locationName,
      Type: entry.changeType,
      "Qty Before": entry.quantityBefore,
      "Qty Change": entry.quantityChange,
      "Qty After": entry.quantityAfter,
      Actor: entry.actorName,
      "Created At": entry.createdAt,
      Note: entry.note,
        })),
      },
    ],
    `omnistock-movement-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export async function exportMarketPrices(entries: MarketPriceEntry[]) {
  await exportWorkbook(
    [
      {
        name: "Market Prices",
        rows: entries.map((entry) => ({
      "Market Date": entry.marketDate,
      Category: entry.category,
      Item: entry.itemName,
      Location: entry.locationName,
      Supplier: entry.supplierName ?? "",
      Unit: entry.unit,
      "Quoted Price": entry.quotedPrice,
      "Previous Price": entry.previousPrice ?? "",
      "Variance %": entry.variancePct ?? "",
      Source: entry.sourceName,
      CapturedBy: entry.capturedByName,
      Note: entry.note,
      "Created At": entry.createdAt,
        })),
      },
    ],
    `omnistock-market-prices-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export async function exportWasteEntries(entries: WasteEntry[]) {
  await exportWorkbook(
    [
      {
        name: "Waste Tracker",
        rows: entries.map((entry) => ({
      Item: entry.itemName,
      Location: entry.locationName,
      Quantity: entry.quantity,
      Unit: entry.unit,
      Reason: entry.reason,
      Shift: entry.shift,
      Station: entry.station,
      Batch: entry.batchLotCode ?? "",
      "Expiry Date": entry.expiryDate ?? "",
      "Estimated Cost": entry.estimatedCost,
      ReportedBy: entry.reportedByName,
      Note: entry.note,
      "Created At": entry.createdAt,
        })),
      },
    ],
    `omnistock-waste-tracker-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export function printCurrentPage() {
  window.print();
}
