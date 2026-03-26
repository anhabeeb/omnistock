import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { OPERATION_LABELS } from "../../shared/operations";
import { can } from "../../shared/permissions";
import { findItemByBarcode } from "../../shared/selectors";
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
import { formatDateTime } from "../lib/format";
import { getDateInputValueForWorkspace } from "../lib/time";
import type { CreateOperationInput, EditOperationInput, SyncState } from "../lib/useOmniStockApp";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  syncState: SyncState;
  onCreateOperation: (input: CreateOperationInput) => Promise<{ reference: string }>;
  onEditOperation: (input: EditOperationInput) => Promise<{ reference: string } | undefined>;
  onDeleteOperation: (input: { requestId: string }) => Promise<{ reference: string } | undefined>;
  onReverseOperation: (input: { requestId: string; reason: string }) => Promise<{ reference: string } | undefined>;
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

type InventoryDialogMode = "create" | "view" | "edit" | "delete" | "reverse";

const INVENTORY_SECTIONS = [
  { slug: "grn", kind: "grn", navLabel: "GRN", title: "Receive Stock", description: "Capture inbound goods quickly from mobile." },
  { slug: "gin", kind: "gin", navLabel: "GIN", title: "Issue Stock", description: "Issue stock to kitchens, outlets, and requests." },
  { slug: "transfer", kind: "transfer", navLabel: "Transfer", title: "Transfer Stock", description: "Move stock between locations with traceability." },
  { slug: "adjustments", kind: "adjustment", navLabel: "Adjustments", title: "Adjust Stock", description: "Correct discrepancies with audit notes." },
  { slug: "stock-count", kind: "stock-count", navLabel: "Stock Count", title: "Count Inventory", description: "Capture physical count results from the floor." },
  { slug: "wastage", kind: "wastage", navLabel: "Wastage", title: "Log Wastage", description: "Record spoilage, expiry, and kitchen waste fast." },
] as const;

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
  const fallbackLocation = currentUser.assignedLocationIds[0] ?? snapshot.locations[0]?.id ?? "";
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
    receivedDate: getDateInputValueForWorkspace(),
    wasteReason: "spoilage",
    wasteShift: "morning",
    wasteStation:
      snapshot.locations.find((location) => location.id === fallbackLocation)?.name ?? "",
  };
}

function locationFlow(request: InventoryRequest) {
  if (request.kind === "transfer") {
    return `${request.fromLocationName ?? "Unknown"} -> ${request.toLocationName ?? "Unknown"}`;
  }
  return request.toLocationName ?? request.fromLocationName ?? "Location pending";
}

export function MobileInventoryOpsPage({
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
  const [form, setForm] = useState<FormState>(() => defaultForm(snapshot, currentUser, activeSection.kind));
  const [itemSearch, setItemSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "submitted" | "posted" | "rejected">("all");
  const [feedback, setFeedback] = useState<string>();
  const [dialogMode, setDialogMode] = useState<InventoryDialogMode | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deferredItemSearch = useDeferredValue(itemSearch);
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
  }, [activeSection.kind, currentUser.id, snapshot.generatedAt]);

  const selectedItem = snapshot.items.find((item) => item.id === form.itemId);
  const selectedRequest = selectedRequestId
    ? snapshot.requests.find((request) => request.id === selectedRequestId)
    : undefined;
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

  const visibleItems = useMemo(() => {
    const value = deferredItemSearch.trim().toLowerCase();
    if (!value) {
      return snapshot.items.slice(0, 40);
    }

    return snapshot.items.filter((item) => {
      return (
        item.name.toLowerCase().includes(value) ||
        item.sku.toLowerCase().includes(value) ||
        item.barcode.toLowerCase().includes(value)
      );
    });
  }, [deferredItemSearch, snapshot.items]);

  const sectionRequests = useMemo(() => {
    const value = deferredLogSearch.trim().toLowerCase();
    return [...snapshot.requests]
      .filter((request) => {
        const matchesKind = request.kind === activeSection.kind;
        const matchesStatus = statusFilter === "all" ? true : request.status === statusFilter;
        const matchesSearch =
          !value ||
          `${request.reference} ${request.itemName} ${request.barcode} ${request.requestedByName} ${request.fromLocationName ?? ""} ${request.toLocationName ?? ""}`
            .toLowerCase()
            .includes(value);
        return matchesKind && matchesStatus && matchesSearch;
      })
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .slice(0, 24);
  }, [activeSection.kind, deferredLogSearch, snapshot.requests, statusFilter]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function closeDialog() {
    if (submitting) {
      return;
    }
    setDialogMode(null);
    setSelectedRequestId(null);
    setActionReason("");
    setBarcodeScannerOpen(false);
  }

  function handleBarcode(value: string) {
    patch("barcode", value);
    setItemSearch(value);
    setBarcodeScannerOpen(false);
    const match = findItemByBarcode(snapshot, value);
    if (match) {
      patch("itemId", match.id);
      setFeedback(`Matched ${match.name} using barcode ${value}.`);
      return;
    }
    setFeedback(`No exact item matched ${value}.`);
  }

  function openCreate() {
    if (!canCreateEntries) {
      setFeedback(`You do not have permission to create ${activeSection.navLabel} entries.`);
      return;
    }
    setForm(defaultForm(snapshot, currentUser, activeSection.kind));
    setItemSearch("");
    setDialogMode("create");
    setSelectedRequestId(null);
  }

  function openRequest(mode: Exclude<InventoryDialogMode, "create">, request: InventoryRequest) {
    setSelectedRequestId(request.id);
    setActionReason("");
    if (mode === "edit") {
      setForm({
        kind: request.kind,
        itemId: request.itemId,
        quantity: String(request.quantity),
        fromLocationId: request.fromLocationId ?? currentUser.assignedLocationIds[0] ?? "",
        toLocationId: request.toLocationId ?? currentUser.assignedLocationIds[0] ?? "",
        supplierId: request.supplierId ?? snapshot.suppliers[0]?.id ?? "",
        note: request.note,
        barcode: request.barcode,
        lotCode: request.lotCode ?? "",
        expiryDate: request.expiryDate ?? "",
        receivedDate: request.receivedDate ?? getDateInputValueForWorkspace(),
        wasteReason: request.wasteReason ?? "spoilage",
        wasteShift: request.wasteShift ?? "morning",
        wasteStation: request.wasteStation ?? request.fromLocationName ?? "",
      });
      setItemSearch(request.itemName);
    }
    setDialogMode(mode);
  }

  async function handleCreate() {
    if (!form.itemId) {
      setFeedback("Choose an item before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await onCreateOperation({
        kind: form.kind,
        itemId: form.itemId,
        quantity: Number(form.quantity),
        note: form.note,
        barcode: form.barcode || selectedItem?.barcode,
        supplierId: needsSupplier ? form.supplierId : undefined,
        fromLocationId: needsSource ? form.fromLocationId : undefined,
        toLocationId: needsDestination ? form.toLocationId : undefined,
        countedQuantity: form.kind === "stock-count" ? Number(form.quantity) : undefined,
        lotCode: capturesBatchMetadata ? form.lotCode || undefined : undefined,
        expiryDate: capturesBatchMetadata ? form.expiryDate || undefined : undefined,
        receivedDate: capturesBatchMetadata ? form.receivedDate || undefined : undefined,
        wasteReason: capturesWasteMetadata ? form.wasteReason : undefined,
        wasteShift: capturesWasteMetadata ? form.wasteShift : undefined,
        wasteStation: capturesWasteMetadata ? form.wasteStation : undefined,
      });
      setFeedback(`${created.reference} saved locally and queued for sync.`);
      closeDialog();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the inventory request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit() {
    if (!selectedRequest || !form.itemId || !actionReason.trim()) {
      setFeedback("Add a correction reason before updating this entry.");
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
        supplierId: needsSupplier ? form.supplierId : undefined,
        fromLocationId: needsSource ? form.fromLocationId : undefined,
        toLocationId: needsDestination ? form.toLocationId : undefined,
        countedQuantity: form.kind === "stock-count" ? Number(form.quantity) : undefined,
        lotCode: capturesBatchMetadata ? form.lotCode || undefined : undefined,
        expiryDate: capturesBatchMetadata ? form.expiryDate || undefined : undefined,
        receivedDate: capturesBatchMetadata ? form.receivedDate || undefined : undefined,
        wasteReason: capturesWasteMetadata ? form.wasteReason : undefined,
        wasteShift: capturesWasteMetadata ? form.wasteShift : undefined,
        wasteStation: capturesWasteMetadata ? form.wasteStation : undefined,
      });
      setFeedback(updated ? `${selectedRequest.reference} corrected through ${updated.reference}.` : `${selectedRequest.reference} corrected.`);
      closeDialog();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the inventory entry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReverse() {
    if (!selectedRequest || !actionReason.trim()) {
      setFeedback("Provide a reason before reversing this entry.");
      return;
    }
    setSubmitting(true);
    try {
      const reversed = await onReverseOperation({ requestId: selectedRequest.id, reason: actionReason.trim() });
      setFeedback(reversed ? `${selectedRequest.reference} reversed through ${reversed.reference}.` : `${selectedRequest.reference} reversed.`);
      closeDialog();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not reverse the entry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selectedRequest) {
      return;
    }
    setSubmitting(true);
    try {
      const deleted = await onDeleteOperation({ requestId: selectedRequest.id });
      setFeedback(deleted ? `${selectedRequest.reference} removed after ${deleted.reference}.` : `${selectedRequest.reference} removed.`);
      closeDialog();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not delete the entry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Inventory OPS
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              {activeSection.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {activeSection.description}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Paper variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">
                {OPERATION_LABELS[activeSection.kind]}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.4 }}>
                {snapshot.requests.filter((request) => request.kind === activeSection.kind).length}
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Queued sync
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.4 }}>
                {syncState.queued}
              </Typography>
            </Paper>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>
                {activeSection.navLabel} log
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {sectionRequests.length} recent records
              </Typography>
            </Box>
            <Button variant="contained" onClick={openCreate} disabled={!canCreateEntries}>
              Add New
            </Button>
          </Stack>

          <TextField
            fullWidth
            value={logSearch}
            onChange={(event) => setLogSearch(event.target.value)}
            placeholder={`Search ${activeSection.navLabel} records`}
          />

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {(["all", "draft", "submitted", "posted", "rejected"] as const).map((status) => (
              <Chip
                key={status}
                label={status}
                clickable
                color={statusFilter === status ? "primary" : "default"}
                variant={statusFilter === status ? "filled" : "outlined"}
                onClick={() => setStatusFilter(status)}
                sx={{ textTransform: "capitalize" }}
              />
            ))}
          </Stack>

          {sectionRequests.length > 0 ? (
            sectionRequests.map((request) => (
              <Paper key={request.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={800}>
                        {request.reference}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {request.itemName} · {request.quantity} {request.unit}
                      </Typography>
                    </Box>
                    <Chip size="small" variant="outlined" label={request.status} />
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {locationFlow(request)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {request.requestedByName} · {formatDateTime(request.requestedAt)}
                  </Typography>

                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <IconButton size="small" onClick={() => openRequest("view", request)} aria-label="View entry">
                      <ViewIcon size={16} />
                    </IconButton>
                    {canEditEntries ? (
                      <IconButton
                        size="small"
                        onClick={() => openRequest("edit", request)}
                        disabled={request.status !== "posted"}
                        aria-label="Edit entry"
                      >
                        <EditIcon size={16} />
                      </IconButton>
                    ) : null}
                    {canReverseEntries ? (
                      <IconButton
                        size="small"
                        onClick={() => openRequest("reverse", request)}
                        disabled={request.status !== "posted"}
                        aria-label="Reverse entry"
                      >
                        <ReverseIcon size={16} />
                      </IconButton>
                    ) : null}
                    {canDeleteEntries ? (
                      <IconButton size="small" onClick={() => openRequest("delete", request)} aria-label="Delete entry">
                        <DeleteIcon size={16} />
                      </IconButton>
                    ) : null}
                  </Stack>
                </Stack>
              </Paper>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No {activeSection.navLabel.toLowerCase()} records have been logged yet.
            </Typography>
          )}
        </Stack>
      </Paper>

      {feedback ? (
        <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700 }}>
          {feedback}
        </Typography>
      ) : null}

      <Dialog fullScreen open={dialogMode === "create" || dialogMode === "edit" || dialogMode === "view"} onClose={closeDialog}>
        <DialogTitle>
          {dialogMode === "create"
            ? `Add New ${activeSection.navLabel}`
            : dialogMode === "edit"
              ? `Edit ${activeSection.navLabel}`
              : `${activeSection.navLabel} Details`}
        </DialogTitle>
        <DialogContent dividers>
          {dialogMode === "view" && selectedRequest ? (
            <Stack spacing={1.25}>
              {[
                ["ID", selectedRequest.id],
                ["Reference", selectedRequest.reference],
                ["Status", selectedRequest.status],
                ["Item", selectedRequest.itemName],
                ["Barcode", selectedRequest.barcode || "No barcode"],
                ["Quantity", `${selectedRequest.quantity} ${selectedRequest.unit}`],
                ["Supplier", selectedRequest.supplierName ?? "Not set"],
                ["From", selectedRequest.fromLocationName ?? "Not set"],
                ["To", selectedRequest.toLocationName ?? "Not set"],
                ["Lot", selectedRequest.lotCode ?? "Not set"],
                ["Received", selectedRequest.receivedDate ?? "Not set"],
                ["Expiry", selectedRequest.expiryDate ?? "Not set"],
                ["Note", selectedRequest.note || "No note provided"],
              ].map(([label, value]) => (
                <Paper key={label} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.35 }}>
                    {value}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              <Stack direction="row" spacing={1}>
                <TextField
                  fullWidth
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                  label="Search items"
                  placeholder="Type item name, SKU, or barcode"
                />
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => setBarcodeScannerOpen(true)}
                  disabled={!snapshot.settings.enableBarcode}
                >
                  Scan
                </Button>
              </Stack>

              <TextField
                select
                label="Selected item"
                value={form.itemId}
                onChange={(event) => patch("itemId", event.target.value)}
              >
                <MenuItem value="">Select an item</MenuItem>
                {visibleItems.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label={form.kind === "stock-count" ? "Counted quantity" : "Quantity"}
                type="number"
                value={form.quantity}
                onChange={(event) => patch("quantity", event.target.value)}
              />

              {needsSource ? (
                <TextField
                  select
                  label={form.kind === "transfer" ? "From warehouse" : "Source location"}
                  value={form.fromLocationId}
                  onChange={(event) => patch("fromLocationId", event.target.value)}
                >
                  {snapshot.locations.map((locationEntry) => (
                    <MenuItem key={locationEntry.id} value={locationEntry.id}>
                      {locationEntry.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}

              {needsDestination ? (
                <TextField
                  select
                  label={form.kind === "grn" ? "Receive into" : "Transfer to"}
                  value={form.toLocationId}
                  onChange={(event) => patch("toLocationId", event.target.value)}
                >
                  {snapshot.locations.map((locationEntry) => (
                    <MenuItem key={locationEntry.id} value={locationEntry.id}>
                      {locationEntry.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}

              {needsSupplier ? (
                <TextField
                  select
                  label="Supplier"
                  value={form.supplierId}
                  onChange={(event) => patch("supplierId", event.target.value)}
                >
                  {snapshot.suppliers.map((supplier) => (
                    <MenuItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}

              {capturesBatchMetadata ? (
                <>
                  <TextField label="Lot / batch code" value={form.lotCode} onChange={(event) => patch("lotCode", event.target.value)} />
                  <TextField label="Received date" type="date" value={form.receivedDate} onChange={(event) => patch("receivedDate", event.target.value)} InputLabelProps={{ shrink: true }} />
                  <TextField label="Expiry date" type="date" value={form.expiryDate} onChange={(event) => patch("expiryDate", event.target.value)} InputLabelProps={{ shrink: true }} />
                </>
              ) : null}

              {capturesWasteMetadata ? (
                <>
                  <TextField select label="Waste reason" value={form.wasteReason} onChange={(event) => patch("wasteReason", event.target.value as WasteReason)}>
                    {["spoilage", "expiry", "overproduction", "prep-loss", "damage", "staff-meal", "qc-rejection"].map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select label="Shift" value={form.wasteShift} onChange={(event) => patch("wasteShift", event.target.value as ShiftKey)}>
                    {["morning", "lunch", "dinner", "night"].map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField label="Station / area" value={form.wasteStation} onChange={(event) => patch("wasteStation", event.target.value)} />
                </>
              ) : null}

              <TextField label="Note / reason" multiline minRows={4} value={form.note} onChange={(event) => patch("note", event.target.value)} />

              {dialogMode === "edit" ? (
                <TextField
                  label="Reason for correction"
                  multiline
                  minRows={3}
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                />
              ) : null}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={submitting}>
            Close
          </Button>
          {dialogMode === "create" ? (
            <Button onClick={() => void handleCreate()} variant="contained" disabled={submitting}>
              {submitting ? "Saving..." : `Create ${OPERATION_LABELS[form.kind]}`}
            </Button>
          ) : null}
          {dialogMode === "edit" ? (
            <Button onClick={() => void handleEdit()} variant="contained" disabled={submitting}>
              {submitting ? "Saving..." : `Update ${OPERATION_LABELS[form.kind]}`}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <Dialog open={dialogMode === "reverse" || dialogMode === "delete"} onClose={closeDialog} fullWidth maxWidth="xs">
        <DialogTitle>{dialogMode === "reverse" ? `Reverse ${activeSection.navLabel}` : `Delete ${activeSection.navLabel}`}</DialogTitle>
        <DialogContent dividers>
          {dialogMode === "reverse" ? (
            <Stack spacing={1.25}>
              <Typography variant="body2" color="text.secondary">
                Reverse this inventory entry and create an audit-safe counter movement.
              </Typography>
              <TextField
                label="Reason for reversal"
                multiline
                minRows={4}
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
              />
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Delete this log entry. OmniStock will safely reverse the stock effect first if the entry is still posted.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={submitting}>
            Cancel
          </Button>
          {dialogMode === "reverse" ? (
            <Button onClick={() => void handleReverse()} variant="contained" disabled={submitting}>
              {submitting ? "Reversing..." : "Confirm Reverse"}
            </Button>
          ) : (
            <Button onClick={() => void handleDelete()} color="error" variant="contained" disabled={submitting}>
              {submitting ? "Deleting..." : "Confirm Delete"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <BarcodeScanModal
        isOpen={barcodeScannerOpen && (dialogMode === "create" || dialogMode === "edit")}
        onClose={() => setBarcodeScannerOpen(false)}
        onScan={handleBarcode}
      />
    </Stack>
  );
}
