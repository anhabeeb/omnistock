import { useDeferredValue, useEffect, useState } from "react";
import { OPERATION_LABELS } from "../../shared/operations";
import {
  batchDaysUntilExpiry,
  batchesForLocation,
  findItemByBarcode,
  isBatchExpired,
  totalOnHand,
} from "../../shared/selectors";
import type {
  InventorySnapshot,
  RequestKind,
  ShiftKey,
  User,
  WasteReason,
} from "../../shared/types";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { formatDateTime } from "../lib/format";
import type { CreateOperationInput, SyncState } from "../lib/useOmniStockApp";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  syncState: SyncState;
  onCreateOperation: (input: CreateOperationInput) => Promise<{ reference: string }>;
}

interface FormState {
  kind: RequestKind;
  itemId: string;
  quantity: string;
  fromLocationId: string;
  toLocationId: string;
  supplierId: string;
  note: string;
  barcode: string;
  lotCode: string;
  expiryDate: string;
  receivedDate: string;
  wasteReason: WasteReason;
  wasteShift: ShiftKey;
  wasteStation: string;
}

function defaultForm(snapshot: InventorySnapshot, currentUser: User): FormState {
  const fallbackLocation =
    currentUser.assignedLocationIds[0] ?? snapshot.locations[0]?.id ?? "";

  return {
    kind: "grn",
    itemId: "",
    quantity: "1",
    fromLocationId: fallbackLocation,
    toLocationId: fallbackLocation,
    supplierId: snapshot.suppliers[0]?.id ?? "",
    note: "",
    barcode: "",
    lotCode: "",
    expiryDate: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    wasteReason: "spoilage",
    wasteShift: "morning",
    wasteStation:
      snapshot.locations.find((location) => location.id === fallbackLocation)?.name ?? "",
  };
}

export function InventoryOpsPage({
  snapshot,
  currentUser,
  syncState,
  onCreateOperation,
}: Props) {
  const [form, setForm] = useState<FormState>(() => defaultForm(snapshot, currentUser));
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    setForm(defaultForm(snapshot, currentUser));
    setFeedback(undefined);
  }, [currentUser.id, snapshot.generatedAt]);

  const selectedItem = snapshot.items.find((item) => item.id === form.itemId);
  const needsSource =
    form.kind === "gin" ||
    form.kind === "transfer" ||
    form.kind === "adjustment" ||
    form.kind === "stock-count" ||
    form.kind === "wastage";
  const needsDestination = form.kind === "grn" || form.kind === "transfer";
  const needsSupplier = form.kind === "grn";
  const capturesBatchMetadata =
    form.kind === "grn" || form.kind === "adjustment" || form.kind === "stock-count";
  const capturesWasteMetadata = form.kind === "wastage";
  const sourceBatches =
    selectedItem && needsSource ? batchesForLocation(selectedItem, form.fromLocationId) : [];

  const visibleItems = snapshot.items.filter((item) => {
    if (!deferredSearchTerm.trim()) {
      return true;
    }

    const value = deferredSearchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(value) ||
      item.sku.toLowerCase().includes(value) ||
      item.barcode.includes(value)
    );
  });

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleBarcode(value: string) {
    patch("barcode", value);
    setSearchTerm(value);
    const match = findItemByBarcode(snapshot, value);

    if (match) {
      patch("itemId", match.id);
      setFeedback(`Matched ${match.name} using barcode ${value}.`);
      return;
    }

    setFeedback(`No exact match found for ${value}. You can still search or pick manually.`);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);

    if (!form.itemId) {
      setFeedback("Choose an item before submitting the inventory operation.");
      return;
    }

    setSubmitting(true);

    try {
      const quantity = Number(form.quantity);
      const request = await onCreateOperation({
        kind: form.kind,
        itemId: form.itemId,
        quantity,
        note: form.note,
        barcode: form.barcode || selectedItem?.barcode,
        supplierId: needsSupplier ? form.supplierId : undefined,
        fromLocationId: needsSource ? form.fromLocationId : undefined,
        toLocationId: needsDestination ? form.toLocationId : undefined,
        countedQuantity: form.kind === "stock-count" ? quantity : undefined,
        lotCode: capturesBatchMetadata ? form.lotCode || undefined : undefined,
        expiryDate: capturesBatchMetadata ? form.expiryDate || undefined : undefined,
        receivedDate: capturesBatchMetadata ? form.receivedDate || undefined : undefined,
        wasteReason: capturesWasteMetadata ? form.wasteReason : undefined,
        wasteShift: capturesWasteMetadata ? form.wasteShift : undefined,
        wasteStation: capturesWasteMetadata ? form.wasteStation : undefined,
      });

      setFeedback(`${request.reference} saved locally and queued for sync.`);
      setForm((current) => ({
        ...current,
        quantity: "1",
        note: "",
        barcode: "",
        lotCode: "",
        expiryDate: "",
        receivedDate: new Date().toISOString().slice(0, 10),
        wasteReason: "spoilage",
        wasteShift: "morning",
        wasteStation:
          snapshot.locations.find((location) => location.id === current.fromLocationId)?.name ?? "",
      }));
      setSearchTerm("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the inventory request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operational Entry</p>
              <h2>Post Inventory Movement</h2>
            </div>
            <span className="status-chip neutral">Queued: {syncState.queued}</span>
          </div>

          <div className="chip-row">
            {(Object.keys(OPERATION_LABELS) as RequestKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={kind === form.kind ? "chip-button active" : "chip-button"}
                onClick={() => patch("kind", kind)}
              >
                {OPERATION_LABELS[kind]}
              </button>
            ))}
          </div>

          <BarcodeScanner onDetected={handleBarcode} />

          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Search items</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Type item name, SKU, or barcode"
              />
            </label>

            <label className="field">
              <span>Selected item</span>
              <select
                value={form.itemId}
                onChange={(event) => patch("itemId", event.target.value)}
              >
                <option value="">Select an item</option>
                {visibleItems.slice(0, 50).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>
                {form.kind === "stock-count"
                  ? "Counted quantity"
                  : form.kind === "adjustment"
                    ? "Adjustment quantity (+/-)"
                    : "Quantity"}
              </span>
              <input
                type="number"
                step="1"
                value={form.quantity}
                onChange={(event) => patch("quantity", event.target.value)}
              />
            </label>

            {needsSource ? (
              <label className="field">
                <span>{form.kind === "transfer" ? "From warehouse" : "Source / counted location"}</span>
                <select
                  value={form.fromLocationId}
                  onChange={(event) => {
                    const nextLocationId = event.target.value;
                    patch("fromLocationId", nextLocationId);
                    if (form.kind === "wastage") {
                      patch(
                        "wasteStation",
                        snapshot.locations.find((location) => location.id === nextLocationId)?.name ??
                          "",
                      );
                    }
                  }}
                >
                  {snapshot.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {needsDestination ? (
              <label className="field">
                <span>{form.kind === "grn" ? "Receive into" : "Transfer to"}</span>
                <select
                  value={form.toLocationId}
                  onChange={(event) => patch("toLocationId", event.target.value)}
                >
                  {snapshot.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {needsSupplier ? (
              <label className="field">
                <span>Supplier</span>
                <select
                  value={form.supplierId}
                  onChange={(event) => patch("supplierId", event.target.value)}
                >
                  {snapshot.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {capturesBatchMetadata ? (
              <>
                <label className="field">
                  <span>Lot / batch code</span>
                  <input
                    value={form.lotCode}
                    onChange={(event) => patch("lotCode", event.target.value)}
                    placeholder="Optional inbound lot reference"
                  />
                </label>

                <label className="field">
                  <span>Received date</span>
                  <input
                    type="date"
                    value={form.receivedDate}
                    onChange={(event) => patch("receivedDate", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Expiry date</span>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(event) => patch("expiryDate", event.target.value)}
                  />
                </label>
              </>
            ) : null}

            {capturesWasteMetadata ? (
              <>
                <label className="field">
                  <span>Waste reason</span>
                  <select
                    value={form.wasteReason}
                    onChange={(event) => patch("wasteReason", event.target.value as WasteReason)}
                  >
                    <option value="spoilage">Spoilage</option>
                    <option value="expiry">Expiry</option>
                    <option value="overproduction">Overproduction</option>
                    <option value="prep-loss">Prep loss</option>
                    <option value="damage">Damage</option>
                    <option value="staff-meal">Staff meal</option>
                    <option value="qc-rejection">QC rejection</option>
                  </select>
                </label>

                <label className="field">
                  <span>Shift</span>
                  <select
                    value={form.wasteShift}
                    onChange={(event) => patch("wasteShift", event.target.value as ShiftKey)}
                  >
                    <option value="morning">Morning</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="night">Night</option>
                  </select>
                </label>

                <label className="field">
                  <span>Station / area</span>
                  <input
                    value={form.wasteStation}
                    onChange={(event) => patch("wasteStation", event.target.value)}
                    placeholder="Prep kitchen, pantry, cold room, or outlet line"
                  />
                </label>
              </>
            ) : null}

            <label className="field field-wide">
              <span>Note / reason</span>
              <textarea
                rows={4}
                value={form.note}
                onChange={(event) => patch("note", event.target.value)}
                placeholder="Explain the movement, discrepancy, or receiving context."
              />
            </label>

            <div className="button-row">
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? "Saving..." : `Create ${OPERATION_LABELS[form.kind]}`}
              </button>
              <span className="helper-text">
                Changes save locally first, then sync through REST and realtime updates. FEFO is{" "}
                {snapshot.settings.strictFefo ? "enforced" : "guided"} for outbound movements.
              </span>
            </div>
          </form>

          {feedback ? <p className="feedback-copy">{feedback}</p> : null}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Quick Pick</p>
              <h2>Matched Items</h2>
            </div>
            <span className="status-chip neutral">
              Expiry alerts in {snapshot.settings.expiryAlertDays} days
            </span>
          </div>

          <div className="stack-list">
            {visibleItems.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inventory-card ${form.itemId === item.id ? "selected" : ""}`}
                onClick={() => patch("itemId", item.id)}
              >
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.sku} - {item.barcode}</p>
                </div>
                <span>{totalOnHand(item)} on hand</span>
              </button>
            ))}
          </div>

          {selectedItem ? (
            <>
              <div className="stock-grid">
                {selectedItem.stocks.map((stock) => (
                  <div key={stock.locationId} className="stock-card">
                    <span>
                      {snapshot.locations.find((location) => location.id === stock.locationId)?.code}
                    </span>
                    <strong>{stock.onHand}</strong>
                    <small>Min {stock.minLevel}</small>
                  </div>
                ))}
              </div>

              {needsSource && form.fromLocationId ? (
                <div className="batch-list">
                  <div className="panel-heading compact-heading">
                    <div>
                      <p className="eyebrow">FEFO Queue</p>
                      <h3>Source batches</h3>
                    </div>
                  </div>
                  {sourceBatches.length > 0 ? (
                    sourceBatches.map((batch) => {
                      const expired = isBatchExpired(batch);
                      const daysUntilExpiry = batchDaysUntilExpiry(batch);

                      return (
                        <div key={batch.id} className="list-row">
                          <div>
                            <strong>{batch.lotCode}</strong>
                            <p>
                              {batch.quantity} {selectedItem.unit}
                            </p>
                          </div>
                          <span
                            className={`status-chip ${
                              expired
                                ? "warning"
                                : daysUntilExpiry !== undefined &&
                                    daysUntilExpiry <= snapshot.settings.expiryAlertDays
                                  ? "warning"
                                  : "neutral"
                            }`}
                          >
                            {batch.expiryDate
                              ? expired
                                ? "Expired"
                                : `${daysUntilExpiry}d to expiry`
                              : "No expiry"}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-copy">
                      No batch detail is available for this source location yet.
                    </p>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-copy">Pick an item to inspect stock by location before posting.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent Operations</p>
            <h2>Latest Requests</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Item</th>
                <th>Quantity</th>
                <th>Requested By</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.requests.slice(0, 8).map((request) => (
                <tr key={request.id}>
                  <td>{request.reference}</td>
                  <td>{OPERATION_LABELS[request.kind]}</td>
                  <td>{request.itemName}</td>
                  <td>
                    {request.quantity} {request.unit}
                    {request.allocationSummary ? <small>{request.allocationSummary}</small> : null}
                    {request.kind === "wastage" ? (
                      <small>
                        {request.wasteReason} - {request.wasteShift} - {request.wasteStation}
                      </small>
                    ) : null}
                  </td>
                  <td>{request.requestedByName}</td>
                  <td>{formatDateTime(request.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
