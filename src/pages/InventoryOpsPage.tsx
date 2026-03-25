import { useDeferredValue, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { OPERATION_LABELS } from "../../shared/operations";
import { findItemByBarcode } from "../../shared/selectors";
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

const INVENTORY_SECTIONS = [
  {
    slug: "grn",
    kind: "grn",
    navLabel: "GRN",
    title: "Receive Stock (GRN)",
    description: "Capture supplier deliveries, batch details, and inbound stock checks.",
  },
  {
    slug: "gin",
    kind: "gin",
    navLabel: "GIN",
    title: "Issue Stock (GIN)",
    description: "Send stock out to kitchens, outlets, and approved internal requests.",
  },
  {
    slug: "transfer",
    kind: "transfer",
    navLabel: "Transfer",
    title: "Transfer to Another Warehouse",
    description: "Move inventory between warehouses and outlets with full traceability.",
  },
  {
    slug: "adjustments",
    kind: "adjustment",
    navLabel: "Adjustments",
    title: "Inventory Adjustments",
    description: "Correct discrepancies with reason notes and batch-level audit visibility.",
  },
  {
    slug: "stock-count",
    kind: "stock-count",
    navLabel: "Stock Count",
    title: "Stock Count",
    description: "Record counts, compare variances, and update the live snapshot safely.",
  },
  {
    slug: "wastage",
    kind: "wastage",
    navLabel: "Wastage",
    title: "Waste Control",
    description: "Log spoilage, expiry, and kitchen write-offs with station and shift context.",
  },
] as const satisfies Array<{
  slug: string;
  kind: RequestKind;
  navLabel: string;
  title: string;
  description: string;
}>;

function defaultForm(snapshot: InventorySnapshot, currentUser: User, kind: RequestKind): FormState {
  const fallbackLocation =
    currentUser.assignedLocationIds[0] ?? snapshot.locations[0]?.id ?? "";

  return {
    kind,
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
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? INVENTORY_SECTIONS[0].slug;
  const activeSection =
    INVENTORY_SECTIONS.find((section) => section.slug === activeSlug) ?? INVENTORY_SECTIONS[0];
  const [form, setForm] = useState<FormState>(() =>
    defaultForm(snapshot, currentUser, activeSection.kind),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    setForm(defaultForm(snapshot, currentUser, activeSection.kind));
    setFeedback(undefined);
  }, [activeSection.kind, currentUser.id, snapshot.generatedAt]);

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
  const sectionRequests = snapshot.requests
    .filter((request) => request.kind === activeSection.kind)
    .slice(0, 12);
  const formPanelId = `inventory-${activeSection.slug}-entry`;
  const logPanelId = `inventory-${activeSection.slug}-logs`;
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

  function scrollToPanel(panelId: string) {
    document.getElementById(panelId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestRouteLabel(request: (typeof sectionRequests)[number]) {
    const fromLocationName = request.fromLocationId
      ? snapshot.locations.find((locationEntry) => locationEntry.id === request.fromLocationId)?.name
      : undefined;
    const toLocationName = request.toLocationId
      ? snapshot.locations.find((locationEntry) => locationEntry.id === request.toLocationId)?.name
      : undefined;

    if (request.kind === "transfer") {
      return `${fromLocationName ?? "Unknown"} -> ${toLocationName ?? "Unknown"}`;
    }

    if (request.kind === "grn") {
      return toLocationName ?? "Receiving location pending";
    }

    return fromLocationName ?? toLocationName ?? "Location not specified";
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
          snapshot.locations.find((locationEntry) => locationEntry.id === current.fromLocationId)?.name ??
          "",
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
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Inventory OPS</p>
          <h1>{activeSection.title}</h1>
          <p className="hero-copy">{activeSection.description}</p>
        </div>

        <div className="hero-meta">
          <div className="meta-card">
            <span>{OPERATION_LABELS[activeSection.kind]}</span>
            <strong>{snapshot.requests.filter((request) => request.kind === activeSection.kind).length}</strong>
            <small>Requests already captured for this operation type.</small>
          </div>
          <div className="meta-card">
            <span>Queued for Sync</span>
            <strong>{syncState.queued}</strong>
            <small>Offline-safe mutations waiting to reach the server.</small>
          </div>
        </div>
      </section>

      <section className="split-grid">
        <article className="panel" id={formPanelId}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operational Entry</p>
              <h2>{activeSection.title}</h2>
            </div>
            <span className="status-chip neutral">Realtime: {syncState.websocket}</span>
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
              <select value={form.itemId} onChange={(event) => patch("itemId", event.target.value)}>
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
                        snapshot.locations.find((locationEntry) => locationEntry.id === nextLocationId)?.name ??
                          "",
                      );
                    }
                  }}
                >
                  {snapshot.locations.map((locationEntry) => (
                    <option key={locationEntry.id} value={locationEntry.id}>
                      {locationEntry.name}
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
                  {snapshot.locations.map((locationEntry) => (
                    <option key={locationEntry.id} value={locationEntry.id}>
                      {locationEntry.name}
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

        <article className="panel" id={logPanelId}>
          <div className="panel-heading">
            <div>
              <div className="button-row" style={{ marginBottom: "12px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => scrollToPanel(logPanelId)}
                >
                  Logs
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => scrollToPanel(formPanelId)}
                >
                  Add New {activeSection.navLabel}
                </button>
              </div>
              <p className="eyebrow">Operation Logs</p>
              <h2>{activeSection.navLabel} Entries</h2>
            </div>
            <span className="status-chip neutral">{sectionRequests.length} recent records</span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Item</th>
                  <th>Location / Flow</th>
                  <th>Quantity</th>
                  <th>Logged By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {sectionRequests.length > 0 ? (
                  sectionRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.reference}</td>
                      <td>
                        {request.itemName}
                        <small>{request.barcode || "No barcode"}</small>
                      </td>
                      <td>
                        {requestRouteLabel(request)}
                        {request.supplierId && request.kind === "grn" ? (
                          <small>
                            Supplier:{" "}
                            {snapshot.suppliers.find((supplier) => supplier.id === request.supplierId)?.name ??
                              "Unknown"}
                          </small>
                        ) : null}
                      </td>
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <span className="empty-copy">
                        No {activeSection.navLabel.toLowerCase()} records have been logged yet.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
