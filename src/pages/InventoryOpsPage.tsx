import { useDeferredValue, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { OPERATION_LABELS } from "../../shared/operations";
import { can } from "../../shared/permissions";
import { findBarcodeMatch, itemBarcodeValues, itemUnitOptions } from "../../shared/selectors";
import type {
  InventoryRequest,
  InventorySnapshot,
  PermissionKey,
  RequestKind,
  ShiftKey,
  User,
  WasteReason,
} from "../../shared/types";
import { DeleteIcon, EditIcon, ReverseIcon, ViewIcon } from "../components/AppIcons";
import { BarcodeScanModal } from "../components/BarcodeScanModal";
import {
  DATE_FILTER_OPTIONS,
  type DateFilterPreset,
  matchesDateFilter,
} from "../lib/dateFilters";
import { formatDateTime } from "../lib/format";
import { getDateInputValueForWorkspace } from "../lib/time";
import type { CreateOperationInput, EditOperationInput, SyncState } from "../lib/useOmniStockApp";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  syncState: SyncState;
  onCreateOperation: (input: CreateOperationInput) => Promise<InventoryRequest>;
  onEditOperation: (input: EditOperationInput) => Promise<{ reference: string } | undefined>;
  onDeleteOperation: (input: { requestId: string }) => Promise<{ reference: string } | undefined>;
  onReverseOperation: (input: { requestId: string; reason: string }) => Promise<{ reference: string } | undefined>;
}

interface FormState {
  kind: RequestKind;
  itemId: string;
  quantity: string;
  quantityUnit: string;
  fromLocationId: string;
  toLocationId: string;
  supplierId: string;
  note: string;
  barcode: string;
  lotCode: string;
  batchBarcode: string;
  expiryDate: string;
  receivedDate: string;
  wasteReason: WasteReason;
  wasteShift: ShiftKey;
  wasteStation: string;
}

type InventoryDialogMode = "create" | "view" | "edit" | "delete" | "reverse";

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

function createPermissionForKind(kind: RequestKind): PermissionKey {
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

function defaultForm(snapshot: InventorySnapshot, currentUser: User, kind: RequestKind): FormState {
  const fallbackLocation =
    currentUser.assignedLocationIds[0] ?? snapshot.locations[0]?.id ?? "";

  return {
    kind,
    itemId: "",
    quantity: "1",
    quantityUnit: "",
    fromLocationId: fallbackLocation,
    toLocationId: fallbackLocation,
    supplierId: snapshot.suppliers[0]?.id ?? "",
    note: "",
    barcode: "",
    lotCode: "",
    batchBarcode: "",
    expiryDate: "",
    receivedDate: getDateInputValueForWorkspace(),
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
  onEditOperation,
  onDeleteOperation,
  onReverseOperation,
}: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? INVENTORY_SECTIONS[0].slug;
  const activeSection =
    INVENTORY_SECTIONS.find((section) => section.slug === activeSlug) ?? INVENTORY_SECTIONS[0];
  const [form, setForm] = useState<FormState>(() =>
    defaultForm(snapshot, currentUser, activeSection.kind),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "submitted" | "posted" | "rejected">("all");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [dialogMode, setDialogMode] = useState<InventoryDialogMode | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const deferredLogSearch = useDeferredValue(logSearch);
  const canCreateEntries = can(currentUser, createPermissionForKind(activeSection.kind));
  const canEditEntries = can(currentUser, "inventory.edit");
  const canReverseEntries = can(currentUser, "inventory.reverse");
  const canDeleteEntries = can(currentUser, "inventory.delete");

  useEffect(() => {
    setForm(defaultForm(snapshot, currentUser, activeSection.kind));
    setFeedback(undefined);
    setDialogMode(null);
    setSelectedRequestId(null);
    setActionReason("");
    setBarcodeScannerOpen(false);
  }, [activeSection.kind, currentUser.id, snapshot.generatedAt]);

  useEffect(() => {
    if (!dialogMode) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setDialogMode(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialogMode, submitting]);

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
    .filter((request) => {
      const matchesKind = request.kind === activeSection.kind;
      const matchesStatus = statusFilter === "all" ? true : request.status === statusFilter;
      const matchesDate = matchesDateFilter(request.requestedAt, {
        preset: datePreset,
        customStartDate,
        customEndDate,
      });
      const matchesSearch =
        !deferredLogSearch.trim() ||
        `${request.reference} ${request.itemName} ${request.barcode} ${request.batchBarcode ?? ""} ${request.requestedByName} ${request.fromLocationName ?? ""} ${request.toLocationName ?? ""} ${request.supplierName ?? ""}`
          .toLowerCase()
          .includes(deferredLogSearch.trim().toLowerCase());
      return matchesKind && matchesStatus && matchesDate && matchesSearch;
    })
    .slice(0, 20);
  const selectedRequest = selectedRequestId
    ? snapshot.requests.find((request) => request.id === selectedRequestId)
    : undefined;
  const logPanelId = `inventory-${activeSection.slug}-logs`;
  const availableUnits = selectedItem ? itemUnitOptions(selectedItem) : [];
  const selectedUnitOption =
    availableUnits.find((entry) => entry.unitName === form.quantityUnit) ?? availableUnits[0];
  const visibleItems = snapshot.items.filter((item) => {
    if (!deferredSearchTerm.trim()) {
      return true;
    }

    const value = deferredSearchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(value) ||
      item.sku.toLowerCase().includes(value) ||
      itemBarcodeValues(item).some((barcode) => barcode.toLowerCase().includes(value))
    );
  });

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    if (availableUnits.some((entry) => entry.unitName === form.quantityUnit)) {
      return;
    }

    setForm((current) => ({ ...current, quantityUnit: selectedItem.unit }));
  }, [availableUnits, form.quantityUnit, selectedItem]);

  function handleBarcode(value: string) {
    patch("barcode", value);
    setSearchTerm(value);
    setBarcodeScannerOpen(false);
    const match = findBarcodeMatch(snapshot, value);

    if (match) {
      patch("itemId", match.item.id);
      if (match.source === "batch-barcode" && match.batch) {
        patch("lotCode", match.batch.lotCode);
        patch("batchBarcode", match.batchBarcode?.barcode ?? value);
        patch("expiryDate", match.batch.expiryDate ?? "");
        patch("quantityUnit", match.item.unit);
        if (!needsDestination) {
          patch("fromLocationId", match.batch.locationId);
        }
        setFeedback(`Matched batch ${match.batch.lotCode} for ${match.item.name}.`);
      } else {
        patch("quantityUnit", match.itemBarcode?.unitName ?? match.item.unit);
        setFeedback(`Matched ${match.item.name} using barcode ${value}.`);
      }
      return;
    }

    setFeedback(`No exact match found for ${value}. You can still search or pick manually.`);
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

  function closeDialog(force = false) {
    if (!force && submitting) {
      return;
    }

    setDialogMode(null);
    setSelectedRequestId(null);
    setActionReason("");
    setSearchTerm("");
    setBarcodeScannerOpen(false);
  }

  function openCreateModal() {
    if (!canCreateEntries) {
      setFeedback(`You do not have permission to create ${activeSection.navLabel} entries.`);
      return;
    }
    setFeedback(undefined);
    setForm(defaultForm(snapshot, currentUser, activeSection.kind));
    setSearchTerm("");
    setDialogMode("create");
    setSelectedRequestId(null);
    setActionReason("");
    setBarcodeScannerOpen(false);
  }

  function fillFormFromRequest(request: InventoryRequest) {
    setForm({
      kind: request.kind,
      itemId: request.itemId,
      quantity: String(request.kind === "stock-count" ? request.quantity : request.quantity),
      quantityUnit: request.unit,
      fromLocationId:
        request.fromLocationId ??
        currentUser.assignedLocationIds[0] ??
        snapshot.locations[0]?.id ??
        "",
      toLocationId:
        request.toLocationId ??
        currentUser.assignedLocationIds[0] ??
        snapshot.locations[0]?.id ??
        "",
      supplierId: request.supplierId ?? snapshot.suppliers[0]?.id ?? "",
      note: request.note,
      barcode: request.barcode,
      lotCode: request.lotCode ?? "",
      batchBarcode: request.batchBarcode ?? "",
      expiryDate: request.expiryDate ?? "",
      receivedDate: request.receivedDate ?? getDateInputValueForWorkspace(),
      wasteReason: request.wasteReason ?? "spoilage",
      wasteShift: request.wasteShift ?? "morning",
      wasteStation: request.wasteStation ?? request.fromLocationName ?? "",
    });
    setSearchTerm(request.itemName);
  }

  function openRequestModal(mode: Exclude<InventoryDialogMode, "create">, request: InventoryRequest) {
    if (mode === "edit" && !canEditEntries) {
      setFeedback("You do not have permission to edit inventory entries.");
      return;
    }
    if (mode === "reverse" && !canReverseEntries) {
      setFeedback("You do not have permission to reverse inventory entries.");
      return;
    }
    if (mode === "delete" && !canDeleteEntries) {
      setFeedback("You do not have permission to delete inventory entries.");
      return;
    }
    setFeedback(undefined);
    setSelectedRequestId(request.id);
    setActionReason("");
    setBarcodeScannerOpen(false);

    if (mode === "edit") {
      fillFormFromRequest(request);
    }

    setDialogMode(mode);
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
        quantityUnit: form.quantityUnit || selectedItem?.unit,
        supplierId: needsSupplier ? form.supplierId : undefined,
        fromLocationId: needsSource ? form.fromLocationId : undefined,
        toLocationId: needsDestination ? form.toLocationId : undefined,
        countedQuantity: form.kind === "stock-count" ? quantity : undefined,
        lotCode: capturesBatchMetadata ? form.lotCode || undefined : undefined,
        batchBarcode: capturesBatchMetadata ? form.batchBarcode || undefined : undefined,
        expiryDate: capturesBatchMetadata ? form.expiryDate || undefined : undefined,
        receivedDate: capturesBatchMetadata ? form.receivedDate || undefined : undefined,
        wasteReason: capturesWasteMetadata ? form.wasteReason : undefined,
        wasteShift: capturesWasteMetadata ? form.wasteShift : undefined,
        wasteStation: capturesWasteMetadata ? form.wasteStation : undefined,
      });

      setFeedback(
        request.status === "submitted"
          ? `${request.reference} was submitted for approval and queued for sync.`
          : `${request.reference} saved locally and queued for sync.`,
      );
      setForm((current) => ({
        ...current,
        quantity: "1",
        note: "",
        barcode: "",
        quantityUnit: current.quantityUnit || selectedItem?.unit || "",
        lotCode: "",
        batchBarcode: "",
        expiryDate: "",
        receivedDate: getDateInputValueForWorkspace(),
        wasteReason: "spoilage",
        wasteShift: "morning",
        wasteStation:
          snapshot.locations.find((locationEntry) => locationEntry.id === current.fromLocationId)?.name ??
          "",
      }));
      setSearchTerm("");
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the inventory request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest) {
      return;
    }

    setFeedback(undefined);
    if (!actionReason.trim()) {
      setFeedback("Provide a reason before updating this inventory entry.");
      return;
    }
    if (!form.itemId) {
      setFeedback("Choose an item before updating the inventory operation.");
      return;
    }

    setSubmitting(true);

    try {
      const updated = await onEditOperation({
        requestId: selectedRequest.id,
        reason: actionReason.trim(),
        itemId: form.itemId,
        quantity: Number(form.quantity),
        note: form.note,
        barcode: form.barcode || selectedItem?.barcode,
        quantityUnit: form.quantityUnit || selectedItem?.unit,
        supplierId: needsSupplier ? form.supplierId : undefined,
        fromLocationId: needsSource ? form.fromLocationId : undefined,
        toLocationId: needsDestination ? form.toLocationId : undefined,
        countedQuantity: form.kind === "stock-count" ? Number(form.quantity) : undefined,
        lotCode: capturesBatchMetadata ? form.lotCode || undefined : undefined,
        batchBarcode: capturesBatchMetadata ? form.batchBarcode || undefined : undefined,
        expiryDate: capturesBatchMetadata ? form.expiryDate || undefined : undefined,
        receivedDate: capturesBatchMetadata ? form.receivedDate || undefined : undefined,
        wasteReason: capturesWasteMetadata ? form.wasteReason : undefined,
        wasteShift: capturesWasteMetadata ? form.wasteShift : undefined,
        wasteStation: capturesWasteMetadata ? form.wasteStation : undefined,
      });

      setFeedback(
        updated
          ? `${selectedRequest.reference} was corrected through ${updated.reference}.`
          : `${selectedRequest.reference} was corrected.`,
      );
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update this inventory entry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReverseSubmit() {
    if (!selectedRequest) {
      return;
    }

    setFeedback(undefined);
    if (!actionReason.trim()) {
      setFeedback("Provide a reason before reversing this inventory entry.");
      return;
    }

    setSubmitting(true);

    try {
      const reversed = await onReverseOperation({
        requestId: selectedRequest.id,
        reason: actionReason.trim(),
      });
      setFeedback(
        reversed
          ? `${selectedRequest.reference} was reversed through ${reversed.reference}.`
          : `${selectedRequest.reference} was reversed.`,
      );
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not reverse this inventory entry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSubmit() {
    if (!selectedRequest) {
      return;
    }

    setFeedback(undefined);
    setSubmitting(true);

    try {
      const deleted = await onDeleteOperation({
        requestId: selectedRequest.id,
      });
      setFeedback(
        deleted
          ? `${selectedRequest.reference} was removed after ${deleted.reference}.`
          : `${selectedRequest.reference} was removed.`,
      );
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not delete this inventory entry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
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

      <section className="panel" id={logPanelId}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operation Logs</p>
              <h2>{activeSection.navLabel} Entries</h2>
            </div>
            <div className="button-row">
              <span className="status-chip neutral">{sectionRequests.length} recent records</span>
              <button
                type="button"
                className="primary-button"
                onClick={openCreateModal}
                disabled={!canCreateEntries}
              >
                Add New {activeSection.navLabel}
              </button>
            </div>
          </div>

          <div className="table-toolbar" style={{ marginBottom: "16px", justifyContent: "flex-start" }}>
            <input
              className="table-search"
              value={logSearch}
              onChange={(event) => setLogSearch(event.target.value)}
              placeholder={`Search ${activeSection.navLabel.toLowerCase()} reference, item, barcode, or user`}
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="posted">Posted</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={datePreset} onChange={(event) => setDatePreset(event.target.value as DateFilterPreset)}>
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {datePreset === "custom" ? (
              <>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                />
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                />
              </>
            ) : null}
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
                  <th>Actions</th>
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
                        {request.unitFactor > 1 || request.baseUnit !== request.unit ? (
                          <small>
                            Base quantity: {request.baseQuantity} {request.baseUnit}
                          </small>
                        ) : null}
                        {request.allocationSummary ? <small>{request.allocationSummary}</small> : null}
                        {request.kind === "wastage" ? (
                          <small>
                            {request.wasteReason} - {request.wasteShift} - {request.wasteStation}
                          </small>
                        ) : null}
                      </td>
                      <td>{request.requestedByName}</td>
                      <td>{formatDateTime(request.requestedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => openRequestModal("view", request)}
                            aria-label={`View ${request.reference}`}
                            title="View"
                          >
                            <ViewIcon size={16} />
                          </button>
                          {canEditEntries ? (
                            <button
                              type="button"
                              className="action-icon-button"
                              onClick={() => openRequestModal("edit", request)}
                              aria-label={`Edit ${request.reference}`}
                              title="Edit"
                              disabled={request.status !== "posted"}
                            >
                              <EditIcon size={16} />
                            </button>
                          ) : null}
                          {canReverseEntries ? (
                            <button
                              type="button"
                              className="action-icon-button"
                              onClick={() => openRequestModal("reverse", request)}
                              aria-label={`Reverse ${request.reference}`}
                              title="Cancel or reverse"
                              disabled={request.status !== "posted"}
                            >
                              <ReverseIcon size={16} />
                            </button>
                          ) : null}
                          {canDeleteEntries ? (
                            <button
                              type="button"
                              className="action-icon-button danger"
                              onClick={() => openRequestModal("delete", request)}
                              aria-label={`Delete ${request.reference}`}
                              title="Delete"
                            >
                              <DeleteIcon size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <span className="empty-copy">
                        No {activeSection.navLabel.toLowerCase()} records have been logged yet.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>

      {feedback ? <p className="feedback-copy">{feedback}</p> : null}

      {dialogMode ? (
        <div
          className="page-popup-scrim"
          onClick={() => {
            if (!submitting) {
              closeDialog();
            }
          }}
        >
          <div className="page-popup-card inventory-popup-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  {dialogMode === "view"
                    ? "Entry Details"
                    : dialogMode === "reverse"
                      ? "Cancel or Reverse"
                      : dialogMode === "delete"
                        ? "Delete Entry"
                        : "Operational Entry"}
                </p>
                <h2>
                  {dialogMode === "create"
                    ? `Add New ${activeSection.navLabel}`
                    : dialogMode === "edit"
                      ? `Edit ${activeSection.navLabel}`
                      : dialogMode === "reverse"
                        ? `Reverse ${activeSection.navLabel}`
                        : dialogMode === "delete"
                          ? `Delete ${activeSection.navLabel}`
                          : `${activeSection.navLabel} Details`}
                </h2>
              </div>
              <div className="button-row">
                <span className="status-chip neutral">Realtime: {syncState.websocket}</span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => closeDialog()}
                  disabled={submitting}
                >
                  Close
                </button>
              </div>
            </div>

            {dialogMode === "view" && selectedRequest ? (
              <dl className="detail-list">
                <div><dt>ID</dt><dd>{selectedRequest.id}</dd></div>
                <div><dt>Reference</dt><dd>{selectedRequest.reference}</dd></div>
                <div><dt>Status</dt><dd>{selectedRequest.status}</dd></div>
                <div><dt>Item</dt><dd>{selectedRequest.itemName}</dd></div>
                <div><dt>Barcode</dt><dd>{selectedRequest.barcode || "No barcode"}</dd></div>
                <div><dt>Quantity</dt><dd>{selectedRequest.quantity} {selectedRequest.unit}</dd></div>
                <div><dt>Base Quantity</dt><dd>{selectedRequest.baseQuantity} {selectedRequest.baseUnit}</dd></div>
                <div><dt>Unit Factor</dt><dd>{selectedRequest.unitFactor}x</dd></div>
                <div><dt>Supplier</dt><dd>{selectedRequest.supplierName ?? "Not set"}</dd></div>
                <div><dt>From</dt><dd>{selectedRequest.fromLocationName ?? "Not set"}</dd></div>
                <div><dt>To</dt><dd>{selectedRequest.toLocationName ?? "Not set"}</dd></div>
                <div><dt>Lot Code</dt><dd>{selectedRequest.lotCode ?? "Not set"}</dd></div>
                <div><dt>Batch Barcode</dt><dd>{selectedRequest.batchBarcode ?? "Not set"}</dd></div>
                <div><dt>Received</dt><dd>{selectedRequest.receivedDate ?? "Not set"}</dd></div>
                <div><dt>Expiry</dt><dd>{selectedRequest.expiryDate ?? "Not set"}</dd></div>
                <div><dt>Waste</dt><dd>{selectedRequest.wasteReason ? `${selectedRequest.wasteReason} / ${selectedRequest.wasteShift} / ${selectedRequest.wasteStation}` : "Not a wastage entry"}</dd></div>
                <div><dt>Logged By</dt><dd>{selectedRequest.requestedByName}</dd></div>
                <div><dt>Logged At</dt><dd>{formatDateTime(selectedRequest.requestedAt)}</dd></div>
                <div className="detail-list-wide"><dt>Allocation</dt><dd>{selectedRequest.allocationSummary ?? "No allocation summary recorded."}</dd></div>
                <div className="detail-list-wide"><dt>Note</dt><dd>{selectedRequest.note || "No note provided."}</dd></div>
              </dl>
            ) : null}

            {dialogMode === "reverse" ? (
              <div className="confirm-dialog">
                <p className="confirm-copy">
                  Reverse this inventory entry and create an audit-safe counter movement.
                </p>
                <label className="field field-wide">
                  <span>Reason for reversal</span>
                  <textarea
                    rows={4}
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    placeholder="Explain why this stock movement needs to be cancelled or reversed."
                  />
                </label>
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => closeDialog()} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={() => void handleReverseSubmit()} disabled={submitting}>
                    {submitting ? "Reversing..." : "Confirm Reverse"}
                  </button>
                </div>
              </div>
            ) : null}

            {dialogMode === "delete" ? (
              <div className="confirm-dialog">
                <p className="confirm-copy">
                  Delete this log entry. OmniStock will safely reverse the stock effect first if the entry is still posted.
                </p>
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => closeDialog()} disabled={submitting}>
                    Cancel
                  </button>
                  <button type="button" className="primary-button danger-button" onClick={() => void handleDeleteSubmit()} disabled={submitting}>
                    {submitting ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            ) : null}

            {dialogMode === "create" || dialogMode === "edit" ? (
            <form className="form-grid" onSubmit={dialogMode === "edit" ? handleEditSubmit : handleSubmit}>
              <label className="field">
                <span>Search items</span>
                <div className="barcode-field-toolbar">
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Type item name, SKU, or barcode"
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setBarcodeScannerOpen(true)}
                    disabled={!snapshot.settings.enableBarcode}
                  >
                    Scan Barcode
                  </button>
                </div>
              </label>

              <label className="field">
                <span>Selected item</span>
                <select
                  value={form.itemId}
                  onChange={(event) => {
                    const nextItemId = event.target.value;
                    const nextItem = snapshot.items.find((item) => item.id === nextItemId);
                    setForm((current) => ({
                      ...current,
                      itemId: nextItemId,
                      quantityUnit: nextItem?.unit ?? "",
                    }));
                  }}
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
                  step="0.01"
                  value={form.quantity}
                  onChange={(event) => patch("quantity", event.target.value)}
                />
              </label>

              <label className="field">
                <span>Unit / pack size</span>
                <select
                  value={form.quantityUnit}
                  onChange={(event) => patch("quantityUnit", event.target.value)}
                  disabled={!selectedItem}
                >
                  {selectedItem ? (
                    availableUnits.map((entry) => (
                      <option key={entry.unitName} value={entry.unitName}>
                        {entry.unitName}
                      </option>
                    ))
                  ) : (
                    <option value="">Select an item first</option>
                  )}
                </select>
                {selectedItem && selectedUnitOption ? (
                  <small>
                    1 {selectedUnitOption.unitName} = {selectedUnitOption.quantityInBase}{" "}
                    {selectedItem.unit}
                  </small>
                ) : null}
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
                    <span>Batch barcode</span>
                    <input
                      value={form.batchBarcode}
                      onChange={(event) => patch("batchBarcode", event.target.value)}
                      placeholder="Optional batch barcode"
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

              {dialogMode === "edit" ? (
                <label className="field field-wide">
                  <span>Reason for correction</span>
                  <textarea
                    rows={3}
                    value={actionReason}
                    onChange={(event) => setActionReason(event.target.value)}
                    placeholder="Explain why this entry is being corrected."
                  />
                </label>
              ) : null}

              <div className="button-row">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting
                    ? "Saving..."
                    : dialogMode === "edit"
                      ? `Update ${OPERATION_LABELS[form.kind]}`
                      : `Create ${OPERATION_LABELS[form.kind]}`}
                </button>
                <span className="helper-text">
                  Changes save locally first, then sync through REST and realtime updates. FEFO is{" "}
                  {snapshot.settings.strictFefo ? "enforced" : "guided"} for outbound movements.
                </span>
              </div>
            </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <BarcodeScanModal
        isOpen={barcodeScannerOpen && (dialogMode === "create" || dialogMode === "edit")}
        onClose={() => setBarcodeScannerOpen(false)}
        onScan={handleBarcode}
      />
    </div>
  );
}
