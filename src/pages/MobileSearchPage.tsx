import { useMemo, useState } from "react";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import {
  batchDaysUntilExpiry,
  batchBarcodeValues,
  batchesForLocation,
  findBarcodeMatch,
  itemBarcodeValues,
  itemUnitOptions,
  totalOnHand,
} from "../../shared/selectors";
import type { InventorySnapshot, Item, ItemBarcode } from "../../shared/types";
import { BarcodeScanModal } from "../components/BarcodeScanModal";
import { formatCurrency, formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
}

function itemBatchBarcodeValues(item: Item): string[] {
  return [...new Set(item.stocks.flatMap((stock) => stock.batches.flatMap((batch) => batchBarcodeValues(batch))))];
}

function barcodeSummary(item: Item): string {
  const itemCodes = itemBarcodeValues(item);
  const batchCodes = itemBatchBarcodeValues(item);

  if (itemCodes.length === 0 && batchCodes.length === 0) {
    return "No barcode";
  }

  const primary = itemCodes[0] ?? batchCodes[0];
  const extraCount = Math.max(itemCodes.length - 1, 0) + batchCodes.length;
  return extraCount > 0 ? `${primary} (+${extraCount} more)` : primary ?? "No barcode";
}

function itemBarcodeEntries(item: Item): ItemBarcode[] {
  if (item.barcodes.length > 0) {
    return item.barcodes;
  }

  if (!item.barcode) {
    return [];
  }

  return [
    {
      id: `${item.id}-primary`,
      itemId: item.id,
      barcode: item.barcode,
      barcodeType: "primary",
      unitName: item.unit,
      createdAt: item.updatedAt,
    },
  ];
}

export function MobileSearchPage({ snapshot }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [feedback, setFeedback] = useState<string>();

  const filteredItems = useMemo(() => {
    const value = searchTerm.trim().toLowerCase();
    const base = [...snapshot.items].sort((left, right) => left.name.localeCompare(right.name));
    if (!value) {
      return base.slice(0, 10);
    }

    return base.filter((item) => {
      const supplierName =
        snapshot.suppliers.find((supplier) => supplier.id === item.supplierId)?.name.toLowerCase() ??
        "";

      return (
        item.name.toLowerCase().includes(value) ||
        item.sku.toLowerCase().includes(value) ||
        itemBarcodeValues(item).some((barcode) => barcode.toLowerCase().includes(value)) ||
        itemBatchBarcodeValues(item).some((barcode) => barcode.toLowerCase().includes(value)) ||
        item.category.toLowerCase().includes(value) ||
        supplierName.includes(value)
      );
    });
  }, [searchTerm, snapshot.items, snapshot.suppliers]);

  const selectedItem =
    snapshot.items.find((item) => item.id === selectedItemId) ??
    (filteredItems.length === 1 ? filteredItems[0] : undefined);
  const supplier = selectedItem
    ? snapshot.suppliers.find((entry) => entry.id === selectedItem.supplierId)
    : undefined;
  const latestPrice = selectedItem
    ? [...snapshot.marketPrices]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => `${right.marketDate}-${right.createdAt}`.localeCompare(`${left.marketDate}-${left.createdAt}`))[0]
    : undefined;
  const itemMovements = selectedItem
    ? [...snapshot.movementLedger]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 6)
    : [];
  const selectedItemBarcodes = selectedItem ? itemBarcodeEntries(selectedItem) : [];
  const selectedItemUnits = selectedItem ? itemUnitOptions(selectedItem) : [];
  const itemWaste = selectedItem
    ? [...snapshot.wasteEntries]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 6)
    : [];
  const itemSupplies = selectedItem
    ? [...snapshot.requests]
        .filter(
          (entry) =>
            entry.itemId === selectedItem.id && (entry.kind === "grn" || entry.kind === "transfer"),
        )
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
        .slice(0, 6)
    : [];

  function handleBarcodeDetected(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    setSearchTerm(normalized);
    setScannerOpen(false);
    const match = findBarcodeMatch(snapshot, normalized);
    if (match) {
      setSelectedItemId(match.item.id);
      if (match.source === "batch-barcode" && match.batch) {
        setFeedback(`Matched batch ${match.batch.lotCode} for ${match.item.name}.`);
      } else {
        setFeedback(
          `Matched ${match.item.name} (${match.item.sku})${match.itemBarcode ? ` as ${match.itemBarcode.unitName}` : ""}.`,
        );
      }
      return;
    }

    setSelectedItemId("");
    setFeedback(`No exact barcode match found for ${normalized}.`);
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Mobile Search
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              Scan or search an item
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Fast product lookup for stock, history, waste, supplier, and pricing.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search item, SKU, supplier, or barcode"
              InputProps={{
                startAdornment: (
                  <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />
                ),
              }}
            />
            <Button
              variant="contained"
              onClick={() => setScannerOpen(true)}
              disabled={!snapshot.settings.enableBarcode}
              sx={{ minWidth: 56, px: 1.5, borderRadius: 2.5 }}
            >
              <QrCodeScannerRoundedIcon sx={{ fontSize: 20 }} />
            </Button>
          </Stack>

          {feedback ? (
            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 700 }}>
              {feedback}
            </Typography>
          ) : null}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1" fontWeight={800}>
              Results
            </Typography>
            <Chip size="small" variant="outlined" label={`${filteredItems.length} matches`} />
          </Stack>

          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <Paper
                key={item.id}
                variant="outlined"
                onClick={() => {
                  setSelectedItemId(item.id);
                  setFeedback(undefined);
                }}
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography variant="subtitle2" fontWeight={800}>
                      {item.name}
                    </Typography>
                    <Chip
                      size="small"
                      color={totalOnHand(item) > 0 ? "success" : "warning"}
                      variant="outlined"
                      label={`${totalOnHand(item)} ${item.unit}`}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {item.sku} · {barcodeSummary(item)}
                  </Typography>
                </Stack>
              </Paper>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No items matched this search.
            </Typography>
          )}
        </Stack>
      </Paper>

      {selectedItem ? (
        <Stack spacing={2}>
          <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
            <Stack spacing={1.25}>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Product Snapshot
              </Typography>
              <Typography variant="h5">{selectedItem.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedItem.sku} · {barcodeSummary(selectedItem)} · {selectedItem.category}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined" label={`${totalOnHand(selectedItem)} ${selectedItem.unit} on hand`} />
                <Chip size="small" variant="outlined" label={supplier?.name ?? "No supplier"} />
                <Chip
                  size="small"
                  color={latestPrice ? "success" : "default"}
                  variant="outlined"
                  label={latestPrice ? formatCurrency(latestPrice.quotedPrice, snapshot.settings.currency) : "No market rate"}
                />
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {selectedItemBarcodes.map((entry, index) => (
                  <Chip
                    key={`${entry.barcode}-${index}`}
                    size="small"
                    color={index === 0 ? "primary" : "default"}
                    variant={index === 0 ? "filled" : "outlined"}
                    label={`${entry.barcodeType === "primary" ? "Primary" : entry.barcodeType === "packaging" ? "Packaging" : "Secondary"}: ${entry.barcode} (${entry.unitName})`}
                  />
                ))}
                {itemBatchBarcodeValues(selectedItem).slice(0, 4).map((barcode, index) => (
                  <Chip
                    key={`batch-${barcode}-${index}`}
                    size="small"
                    variant="outlined"
                    color="secondary"
                    label={`Batch: ${barcode}`}
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {selectedItemUnits.map((entry) => (
                  <Chip
                    key={entry.unitName}
                    size="small"
                    color={entry.isBase ? "primary" : "default"}
                    variant={entry.isBase ? "filled" : "outlined"}
                    label={
                      entry.isBase
                        ? `Base: ${entry.unitName}`
                        : `1 ${entry.unitName} = ${entry.quantityInBase} ${selectedItem.unit}`
                    }
                  />
                ))}
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
            <Stack spacing={1.25}>
              <Typography variant="subtitle1" fontWeight={800}>
                Stock by location
              </Typography>
              {selectedItem.stocks.map((stock) => {
                const location = snapshot.locations.find((entry) => entry.id === stock.locationId);
                const nextBatch = batchesForLocation(selectedItem, stock.locationId)[0];
                const days = nextBatch ? batchDaysUntilExpiry(nextBatch) : undefined;
                return (
                  <Paper key={stock.locationId} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {location?.name ?? stock.locationId}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {stock.onHand} {selectedItem.unit}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Reserved {stock.reserved} · Min {stock.minLevel} · Max {stock.maxLevel}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {nextBatch?.expiryDate
                          ? `Next expiry ${nextBatch.expiryDate}${days !== undefined ? ` · ${days} day(s)` : ""}`
                          : "No dated batch at this location"}
                      </Typography>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Paper>

          <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
            <Stack spacing={1.25}>
              <Typography variant="subtitle1" fontWeight={800}>
                Supply, waste, and movement
              </Typography>
              {itemSupplies.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    {entry.reference}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.kind.toUpperCase()} · {entry.supplierName ?? entry.fromLocationName ?? entry.toLocationName ?? "Source pending"} · {formatDateTime(entry.requestedAt)}
                  </Typography>
                </Paper>
              ))}
              {itemWaste.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    Waste: {entry.reason}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.quantity} {entry.unit} · {entry.locationName} · {formatDateTime(entry.createdAt)}
                  </Typography>
                </Paper>
              ))}
              {itemMovements.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 1.25, borderRadius: 3 }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    {entry.reference}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.changeType} · {entry.locationName} · {entry.quantityChange > 0 ? "+" : ""}
                    {entry.quantityChange} · {formatDateTime(entry.createdAt)}
                  </Typography>
                </Paper>
              ))}
              {itemSupplies.length === 0 && itemWaste.length === 0 && itemMovements.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No history has been recorded for this item yet.
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        </Stack>
      ) : null}

      <BarcodeScanModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeDetected}
      />
    </Stack>
  );
}
