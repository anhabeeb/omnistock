import { useMemo, useState } from "react";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  batchDaysUntilExpiry,
  batchesForLocation,
  findItemByBarcode,
  isBatchExpired,
  isBatchNearExpiry,
  totalOnHand,
} from "../../shared/selectors";
import type {
  InventoryRequest,
  InventorySnapshot,
  MarketPriceEntry,
  User,
  WasteEntry,
} from "../../shared/types";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { formatCompactNumber, formatCurrency, formatDateTime } from "../lib/format";
import {
  AlertIcon,
  CurrencyIcon,
  InventoryIcon,
  LocationIcon,
} from "../components/AppIcons";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
}

type MetricTone = "primary" | "success" | "warning" | "info";

function sourceLabel(request: InventoryRequest): string {
  if (request.kind === "grn") {
    return request.supplierName ?? "Supplier not tagged";
  }

  if (request.kind === "transfer") {
    return request.fromLocationName ?? "Source warehouse not tagged";
  }

  return request.requestedByName;
}

export function SearchPage({ snapshot, currentUser }: Props) {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [feedback, setFeedback] = useState<string>();

  const sortedItems = useMemo(
    () => [...snapshot.items].sort((left, right) => left.name.localeCompare(right.name)),
    [snapshot.generatedAt, snapshot.items],
  );

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return sortedItems.slice(0, 12);
    }

    const value = searchTerm.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const supplierName =
        snapshot.suppliers.find((supplier) => supplier.id === item.supplierId)?.name.toLowerCase() ??
        "";

      return (
        item.name.toLowerCase().includes(value) ||
        item.sku.toLowerCase().includes(value) ||
        item.barcode.toLowerCase().includes(value) ||
        item.category.toLowerCase().includes(value) ||
        supplierName.includes(value)
      );
    });
  }, [searchTerm, snapshot.suppliers, sortedItems]);

  const selectedItem =
    snapshot.items.find((item) => item.id === selectedItemId) ??
    (filteredItems.length === 1 ? filteredItems[0] : undefined);
  const supplier = selectedItem
    ? snapshot.suppliers.find((entry) => entry.id === selectedItem.supplierId)
    : undefined;
  const locationRows = selectedItem
    ? selectedItem.stocks.map((stock) => {
        const location = snapshot.locations.find((entry) => entry.id === stock.locationId);
        const activeBatches = batchesForLocation(selectedItem, stock.locationId);
        const nearestBatch = activeBatches[0];
        const nearExpiryCount = activeBatches.filter((batch) =>
          isBatchNearExpiry(batch, snapshot),
        ).length;
        const expiredCount = activeBatches.filter((batch) => isBatchExpired(batch)).length;

        return {
          stock,
          location,
          activeBatches,
          nearestBatch,
          nearExpiryCount,
          expiredCount,
        };
      })
    : [];

  const itemMovements = selectedItem
    ? [...snapshot.movementLedger]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];
  const itemWaste = selectedItem
    ? [...snapshot.wasteEntries]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];
  const itemPrices = selectedItem
    ? [...snapshot.marketPrices]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => {
          const rightKey = `${right.marketDate}-${right.createdAt}`;
          const leftKey = `${left.marketDate}-${left.createdAt}`;
          return rightKey.localeCompare(leftKey);
        })
    : [];
  const itemRequests = selectedItem
    ? [...snapshot.requests]
        .filter((entry) => entry.itemId === selectedItem.id)
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
    : [];
  const supplyHistory = itemRequests.filter(
    (entry) => entry.kind === "grn" || entry.kind === "transfer",
  );
  const lowStockLocations = locationRows.filter(
    (row) => row.stock.onHand <= row.stock.minLevel,
  ).length;
  const totalWasteQuantity = itemWaste.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalWasteCost = itemWaste.reduce((sum, entry) => sum + entry.estimatedCost, 0);
  const latestPrice = itemPrices[0];
  const assignedLocationCount =
    currentUser.assignedLocationIds.length || snapshot.locations.length;
  const metricCards: Array<{
    label: string;
    value: string;
    detail: string;
    icon: typeof InventoryIcon;
    tone: MetricTone;
  }> = selectedItem
    ? [
        {
          label: "Current Quantity",
          value: `${formatCompactNumber(totalOnHand(selectedItem))} ${selectedItem.unit}`,
          detail: "Live on-hand stock across all locations.",
          icon: InventoryIcon,
          tone: "primary",
        },
        {
          label: "Active Locations",
          value: String(locationRows.filter((row) => row.stock.onHand > 0).length),
          detail: "Locations currently holding stock.",
          icon: LocationIcon,
          tone: "success",
        },
        {
          label: "Waste Recorded",
          value: `${formatCompactNumber(totalWasteQuantity)} ${selectedItem.unit}`,
          detail: "Accumulated waste logged for this item.",
          icon: AlertIcon,
          tone: "warning",
        },
        {
          label: "Latest Market Rate",
          value: latestPrice
            ? formatCurrency(latestPrice.quotedPrice, snapshot.settings.currency)
            : "No rate",
          detail: "Most recent quoted purchase rate.",
          icon: CurrencyIcon,
          tone: "info",
        },
      ]
    : [];

  function selectItem(itemId: string) {
    setSelectedItemId(itemId);
    setFeedback(undefined);
  }

  function handleBarcodeDetected(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    setSearchTerm(normalized);
    setScannerOpen(false);

    const match = findItemByBarcode(snapshot, normalized);
    if (match) {
      setSelectedItemId(match.id);
      setFeedback(`Matched ${match.name} (${match.sku}) from barcode ${normalized}.`);
      return;
    }

    setSelectedItemId("");
    setFeedback(`No exact barcode match found for ${normalized}. Review the search results below.`);
  }

  function clearSearch() {
    setSearchTerm("");
    setSelectedItemId("");
    setFeedback(undefined);
    setScannerOpen(false);
  }

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", xl: "row" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ px: { xs: 0.25, md: 0.5 }, py: { xs: 0.5, md: 0.75 } }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
          >
            Quick Search
          </Typography>
          <Typography variant="h3" sx={{ mt: 0.5 }}>
            Item Lookup
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            Scan a barcode or search by item name, SKU, or category to open a live product
            snapshot with quantity, supply source, movement, waste, and market price history.
          </Typography>
        </Box>

        <Paper sx={{ p: 2.25, borderRadius: 3, minWidth: { xl: 320 } }}>
          <Stack spacing={1.1}>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800 }}>
              Search Scope
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {currentUser.name} can review {assignedLocationCount} assigned locations with{" "}
              {formatCompactNumber(snapshot.items.length)} catalog items ready for lookup.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                color={snapshot.settings.enableBarcode ? "primary" : "default"}
                variant={snapshot.settings.enableBarcode ? "filled" : "outlined"}
                label={snapshot.settings.enableBarcode ? "Barcode enabled" : "Barcode disabled"}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${snapshot.marketPrices.length} price points`}
              />
            </Stack>
          </Stack>
        </Paper>
      </Stack>

      <Paper sx={{ p: 2.75, borderRadius: 3 }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          justifyContent="space-between"
          spacing={1.5}
          alignItems={{ xs: "flex-start", lg: "center" }}
        >
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
            >
              Search Controls
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              Scan or search an item
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`${filteredItems.length} matches`} />
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<QrCodeScannerRoundedIcon sx={{ fontSize: 18 }} />}
              disabled={!snapshot.settings.enableBarcode}
              onClick={() => setScannerOpen((current) => !current)}
            >
              {scannerOpen ? "Hide Scanner" : "Scan Barcode"}
            </Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mt: 2 }}>
          <TextField
            fullWidth
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            label="Search item"
            placeholder="Type item name, SKU, barcode, category, or supplier"
            InputProps={{
              startAdornment: (
                <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />
              ),
            }}
          />
          <Button variant="outlined" color="inherit" onClick={clearSearch} sx={{ minWidth: 108 }}>
            Clear
          </Button>
        </Stack>

        {feedback ? (
          <Typography variant="body2" color="primary.main" sx={{ mt: 1.5, fontWeight: 600 }}>
            {feedback}
          </Typography>
        ) : null}

        {scannerOpen ? (
          <Box sx={{ mt: 2 }}>
            <BarcodeScanner onDetected={handleBarcodeDetected} />
          </Box>
        ) : null}
      </Paper>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", xl: "minmax(300px, 0.75fr) minmax(0, 1.55fr)" },
          alignItems: "start",
        }}
      >
        <Paper sx={{ p: 2.25, borderRadius: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography
                  variant="overline"
                  sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                >
                  Search Results
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.4 }}>
                  Matching Items
                </Typography>
              </Box>
              <Chip size="small" variant="outlined" label={`${filteredItems.length} found`} />
            </Stack>

            <Stack spacing={1}>
              {filteredItems.length > 0 ? (
                filteredItems.slice(0, 12).map((item) => {
                  const active = selectedItem?.id === item.id;
                  const itemSupplier =
                    snapshot.suppliers.find((entry) => entry.id === item.supplierId)?.name ??
                    "Supplier not tagged";
                  return (
                    <Button
                      key={item.id}
                      variant={active ? "contained" : "text"}
                      color="inherit"
                      onClick={() => selectItem(item.id)}
                      sx={{
                        justifyContent: "flex-start",
                        px: 1.25,
                        py: 1,
                        borderRadius: 2.5,
                        color: active ? "text.primary" : "text.secondary",
                        bgcolor: active
                          ? theme.palette.mode === "dark"
                            ? alpha(theme.palette.common.white, 0.12)
                            : alpha(theme.palette.text.primary, 0.08)
                          : "transparent",
                      }}
                    >
                      <Stack width="100%" spacing={0.35} alignItems="flex-start">
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          width="100%"
                          spacing={1}
                        >
                          <Typography variant="subtitle2" fontWeight={800} noWrap>
                            {item.name}
                          </Typography>
                          <Chip
                            size="small"
                            color={totalOnHand(item) > 0 ? "success" : "warning"}
                            variant="outlined"
                            label={`${totalOnHand(item)} ${item.unit}`}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {item.sku} - {item.barcode || "No barcode"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {item.category} - {itemSupplier}
                        </Typography>
                      </Stack>
                    </Button>
                  );
                })
              ) : (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2.25,
                    borderRadius: 2.5,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={800}>
                    No items matched this search
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    Try a product name, supplier, SKU, or exact barcode to narrow the list.
                  </Typography>
                </Paper>
              )}
            </Stack>
          </Stack>
        </Paper>

        {selectedItem ? (
          <Stack spacing={2}>
            <Paper sx={{ p: 2.75, borderRadius: 3 }}>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", lg: "row" }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                    >
                      Product Snapshot
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.5 }}>
                      {selectedItem.name}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                      {selectedItem.sku} - {selectedItem.barcode || "No barcode"} -{" "}
                      {selectedItem.category}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip size="small" variant="outlined" label={selectedItem.status} />
                    <Chip
                      size="small"
                      color={lowStockLocations > 0 ? "warning" : "success"}
                      variant="outlined"
                      label={`${lowStockLocations} low-stock locations`}
                    />
                    <Chip
                      size="small"
                      color={
                        locationRows.some((row) => row.expiredCount > 0) ? "error" : "default"
                      }
                      variant="outlined"
                      label={`${
                        locationRows.reduce((sum, row) => sum + row.expiredCount, 0)
                      } expired batches`}
                    />
                  </Stack>
                </Stack>

                <Box
                  sx={{
                    display: "grid",
                    gap: 1.5,
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                      xl: "repeat(4, minmax(0, 1fr))",
                    },
                  }}
                >
                  {metricCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <Paper
                        key={card.label}
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          bgcolor: alpha(theme.palette[card.tone].main, 0.05),
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              borderRadius: 2.5,
                              display: "grid",
                              placeItems: "center",
                              bgcolor: alpha(theme.palette[card.tone].main, 0.14),
                              color: `${card.tone}.main`,
                            }}
                          >
                            <Icon size={18} />
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {card.label}
                          </Typography>
                          <Typography variant="h6">{card.value}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {card.detail}
                          </Typography>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Box>
              </Stack>
            </Paper>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  xl: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
                },
              }}
            >
              <Paper sx={{ p: 2.25, borderRadius: 3 }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                    >
                      Quantity by Location
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.4 }}>
                      Live Stock & Batch Position
                    </Typography>
                  </Box>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Location</TableCell>
                          <TableCell align="right">On Hand</TableCell>
                          <TableCell align="right">Reserved</TableCell>
                          <TableCell>Nearest Expiry</TableCell>
                          <TableCell align="right">Alerts</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {locationRows.map((row) => {
                          const days = row.nearestBatch?.expiryDate
                            ? batchDaysUntilExpiry(row.nearestBatch)
                            : undefined;
                          return (
                            <TableRow key={row.stock.locationId}>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>
                                  {row.location?.name ?? row.stock.locationId}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {row.location?.code ?? "No code"} - {row.activeBatches.length}{" "}
                                  active batches
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                {row.stock.onHand} {selectedItem.unit}
                              </TableCell>
                              <TableCell align="right">{row.stock.reserved}</TableCell>
                              <TableCell>
                                {row.nearestBatch?.expiryDate ? (
                                  <>
                                    <Typography variant="body2">
                                      {row.nearestBatch.expiryDate}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {days === undefined
                                        ? "No alert window"
                                        : `${days} day${days === 1 ? "" : "s"} remaining`}
                                    </Typography>
                                  </>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    No dated batches
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="right">
                                <Stack
                                  direction="row"
                                  spacing={0.75}
                                  justifyContent="flex-end"
                                  useFlexGap
                                  flexWrap="wrap"
                                >
                                  {row.nearExpiryCount > 0 ? (
                                    <Chip
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                      label={`${row.nearExpiryCount} near`}
                                    />
                                  ) : null}
                                  {row.expiredCount > 0 ? (
                                    <Chip
                                      size="small"
                                      color="error"
                                      variant="outlined"
                                      label={`${row.expiredCount} expired`}
                                    />
                                  ) : null}
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </Paper>

              <Paper sx={{ p: 2.25, borderRadius: 3 }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                    >
                      Source Details
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.4 }}>
                      Supplier & Inbound History
                    </Typography>
                  </Box>

                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2.5,
                      bgcolor: alpha(theme.palette.primary.main, 0.04),
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={800}>
                      {supplier?.name ?? "Supplier not assigned"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      {supplier
                        ? `${supplier.email} - ${supplier.phone} - ${supplier.leadTimeDays} day lead time`
                        : "Assign a supplier in Master Data to strengthen sourcing visibility."}
                    </Typography>
                  </Paper>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Source</TableCell>
                          <TableCell>Destination</TableCell>
                          <TableCell align="right">Qty</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {supplyHistory.length > 0 ? (
                          supplyHistory.slice(0, 6).map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{formatDateTime(entry.requestedAt)}</TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>
                                  {sourceLabel(entry)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {entry.kind.toUpperCase()}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {entry.toLocationName ?? entry.fromLocationName ?? "-"}
                              </TableCell>
                              <TableCell align="right">
                                {entry.quantity} {entry.unit}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <Typography variant="body2" color="text.secondary">
                                No inbound or supply history has been logged for this item yet.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </Paper>
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.05fr) minmax(0, 0.95fr)" },
              }}
            >
              <Paper sx={{ p: 2.25, borderRadius: 3 }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                    >
                      Market Prices
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.4 }}>
                      Supplier Rate History
                    </Typography>
                  </Box>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Supplier / Location</TableCell>
                          <TableCell align="right">Quoted</TableCell>
                          <TableCell align="right">Variance</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {itemPrices.length > 0 ? (
                          itemPrices.slice(0, 8).map((entry: MarketPriceEntry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{entry.marketDate}</TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>
                                  {entry.supplierName ?? "Open market"}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {entry.locationName}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                {formatCurrency(entry.quotedPrice, snapshot.settings.currency)}
                              </TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  color:
                                    (entry.variancePct ?? 0) > 0
                                      ? "warning.main"
                                      : (entry.variancePct ?? 0) < 0
                                        ? "success.main"
                                        : "text.secondary",
                                  fontWeight: 700,
                                }}
                              >
                                {entry.variancePct === undefined
                                  ? "New"
                                  : `${entry.variancePct > 0 ? "+" : ""}${entry.variancePct.toFixed(2)}%`}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <Typography variant="body2" color="text.secondary">
                                No market price history has been captured for this item yet.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </Paper>
              <Paper sx={{ p: 2.25, borderRadius: 3 }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography
                      variant="overline"
                      sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                    >
                      Waste History
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 0.4 }}>
                      Product Waste & Losses
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={`${formatCompactNumber(totalWasteQuantity)} ${selectedItem.unit} wasted`}
                    />
                    <Chip
                      size="small"
                      color="error"
                      variant="outlined"
                      label={formatCurrency(totalWasteCost, snapshot.settings.currency)}
                    />
                  </Stack>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Reason</TableCell>
                          <TableCell>Location</TableCell>
                          <TableCell align="right">Qty</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {itemWaste.length > 0 ? (
                          itemWaste.slice(0, 8).map((entry: WasteEntry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>
                                  {entry.reason}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {entry.shift} - {entry.station}
                                </Typography>
                              </TableCell>
                              <TableCell>{entry.locationName}</TableCell>
                              <TableCell align="right">
                                {entry.quantity} {entry.unit}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4}>
                              <Typography variant="body2" color="text.secondary">
                                No waste has been recorded for this item yet.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              </Paper>
            </Box>

            <Paper sx={{ p: 2.25, borderRadius: 3 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography
                    variant="overline"
                    sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
                  >
                    Movement History
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.4 }}>
                    Product Movement Ledger
                  </Typography>
                </Box>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>When</TableCell>
                        <TableCell>Reference</TableCell>
                        <TableCell>Location</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Change</TableCell>
                        <TableCell align="right">After</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {itemMovements.length > 0 ? (
                        itemMovements.slice(0, 12).map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={700}>
                                {entry.reference}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {entry.actorName}
                              </Typography>
                            </TableCell>
                            <TableCell>{entry.locationName}</TableCell>
                            <TableCell>
                              <Chip size="small" variant="outlined" label={entry.changeType} />
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                color: entry.quantityChange < 0 ? "error.main" : "success.main",
                                fontWeight: 700,
                              }}
                            >
                              {entry.quantityChange > 0 ? "+" : ""}
                              {entry.quantityChange}
                            </TableCell>
                            <TableCell align="right">{entry.quantityAfter}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6}>
                            <Typography variant="body2" color="text.secondary">
                              No movement ledger entries have been posted for this item yet.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </Paper>
          </Stack>
        ) : (
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Stack spacing={1.5} alignItems="flex-start">
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 3,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: "primary.main",
                }}
              >
                <SearchRoundedIcon sx={{ fontSize: 24 }} />
              </Box>
              <Typography variant="h5">Choose an item to inspect</Typography>
              <Typography variant="body1" color="text.secondary">
                Select a result from the left, or scan a barcode to open the product details view.
                OmniStock will then show the live quantity, movement ledger, waste history, supply
                source, and captured market prices for that item.
              </Typography>
            </Stack>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
