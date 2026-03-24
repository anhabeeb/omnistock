import { useDeferredValue, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { useLocation } from "react-router-dom";
import { lowStockItems, openRequests, totalInventoryValue } from "../../shared/selectors";
import type { InventorySnapshot, User, WasteEntry } from "../../shared/types";
import { exportMovementLedger, exportWasteEntries, printCurrentPage } from "../lib/export";
import { formatCurrency, formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
}

const REPORT_SECTIONS = [
  {
    slug: "analytics",
    label: "Analytics",
    title: "Analytics Overview",
    description: "Monitor inventory value, waste impact, and low-stock risk in one place.",
  },
  {
    slug: "waste-tracker",
    label: "Waste Tracker",
    title: "Waste Tracker",
    description: "Inspect detailed restaurant waste logs, reasons, stations, and shift patterns.",
  },
  {
    slug: "movement-ledger",
    label: "Movement Ledger",
    title: "Movement Ledger",
    description: "Review every stock change with actor, timing, and after-balance detail.",
  },
] as const;

function topWasteReason(entries: WasteEntry[]): string {
  if (entries.length === 0) {
    return "None";
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])[0][0]
    .replace("-", " ");
}

export function ReportsPage({ snapshot, currentUser }: Props) {
  const theme = useTheme();
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? REPORT_SECTIONS[0].slug;
  const activeSection = REPORT_SECTIONS.find((section) => section.slug === activeSlug) ?? REPORT_SECTIONS[0];
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [feedback, setFeedback] = useState<string>();
  const [exportingLedger, setExportingLedger] = useState(false);
  const [exportingWaste, setExportingWaste] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const filteredLedger = snapshot.movementLedger.filter((entry) => {
    const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
    const matchesSearch =
      !deferredSearch.trim()
        ? true
        : `${entry.reference} ${entry.itemName} ${entry.locationName} ${entry.actorName}`
            .toLowerCase()
            .includes(deferredSearch.toLowerCase());
    return matchesLocation && matchesSearch;
  });

  const filteredWaste = snapshot.wasteEntries.filter((entry) => {
    const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
    const matchesSearch =
      !deferredSearch.trim()
        ? true
        : `${entry.itemName} ${entry.locationName} ${entry.reason} ${entry.station} ${entry.reportedByName}`
            .toLowerCase()
            .includes(deferredSearch.toLowerCase());
    return matchesLocation && matchesSearch;
  });

  const wasteCost = filteredWaste.reduce((sum, entry) => sum + entry.estimatedCost, 0);
  const expiryWaste = filteredWaste.filter((entry) => entry.reason === "expiry");

  async function handleExportLedger() {
    setExportingLedger(true);
    setFeedback(undefined);
    try {
      await exportMovementLedger(filteredLedger);
      setFeedback("Movement ledger exported to Excel.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not export the ledger.");
    } finally {
      setExportingLedger(false);
    }
  }

  async function handleExportWaste() {
    setExportingWaste(true);
    setFeedback(undefined);
    try {
      await exportWasteEntries(filteredWaste);
      setFeedback("Waste tracker exported to Excel.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not export waste entries.");
    } finally {
      setExportingWaste(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <Paper
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 4,
          background:
            theme.palette.mode === "dark"
              ? alpha(theme.palette.background.paper, 0.88)
              : alpha(theme.palette.background.paper, 0.92),
        }}
      >
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Reports & Analytics
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5 }}>
              {activeSection.title}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 760 }}>
              {activeSection.description}
            </Typography>
          </Box>

          <Box className="hero-meta" sx={{ width: { xs: "100%", lg: 360 }, maxWidth: "100%" }}>
            <Box className="meta-card">
              <span>Prepared For</span>
              <strong>{currentUser.name}</strong>
              <small>Current report session owner for exports and print actions.</small>
            </Box>
            <Box className="meta-card">
              <span>Inventory Value</span>
              <strong>{formatCurrency(totalInventoryValue(snapshot), snapshot.settings.currency)}</strong>
              <small>Total live stock value across the active OmniStock snapshot.</small>
            </Box>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Filters
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              Report Controls
            </Typography>
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.35fr 0.95fr" } }}>
            <TextField
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, item, actor, reason, or location"
              fullWidth
            />
            <TextField
              select
              label="Filter by location"
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              fullWidth
            >
              <MenuItem value="all">All locations</MenuItem>
              {snapshot.locations.map((locationEntry) => (
                <MenuItem key={locationEntry.id} value={locationEntry.id}>
                  {locationEntry.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
            <Button variant="contained" onClick={() => void handleExportLedger()}>
              {exportingLedger ? "Exporting..." : "Export Ledger"}
            </Button>
            <Button variant="outlined" onClick={() => void handleExportWaste()}>
              {exportingWaste ? "Exporting..." : "Export Waste"}
            </Button>
            <Button variant="text" onClick={printCurrentPage}>
              Print report
            </Button>
          </Stack>

          {feedback ? <Alert severity="info">{feedback}</Alert> : null}
        </Stack>
      </Paper>

      {activeSection.slug === "analytics" ? (
        <>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" } }}>
            {[
              {
                label: "Waste Cost",
                value: formatCurrency(wasteCost, snapshot.settings.currency),
                detail: "Estimated cost of filtered waste entries in the current view.",
              },
              {
                label: "Waste Entries",
                value: String(filteredWaste.length),
                detail: "Restaurant waste records matched by the current filters.",
              },
              {
                label: "Low Stock Items",
                value: String(lowStockItems(snapshot).length),
                detail: "Items below minimum threshold across the network.",
              },
              {
                label: "Open Requests",
                value: String(openRequests(snapshot).length),
                detail: "Requests still waiting for operational follow-up.",
              },
            ].map((card) => (
              <Paper key={card.label} sx={{ p: 2.25, borderRadius: 4 }}>
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    {card.label}
                  </Typography>
                  <Typography variant="h5">{card.value}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {card.detail}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(340px, 0.92fr)" } }}>
            <Paper sx={{ p: 2.5, borderRadius: 4 }}>
              <Stack spacing={1.25}>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Waste Analytics
                </Typography>
                <Typography variant="h6">Restaurant Waste Summary</Typography>
                <Chip variant="outlined" label={`Top reason - ${topWasteReason(filteredWaste)}`} />
                <Chip variant="outlined" label={`Expiry write-offs - ${expiryWaste.length}`} />
                <Chip variant="outlined" label={`Low-stock items - ${lowStockItems(snapshot).length}`} />
              </Stack>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 4 }}>
              <Stack spacing={1.25}>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Exposure
                </Typography>
                <Typography variant="h6">At-a-glance controls</Typography>
                <Typography variant="body2" color="text.secondary">
                  Use the filters above to narrow by location, export ledger or waste files, and print the
                  current report for daily reviews.
                </Typography>
              </Stack>
            </Paper>
          </Box>
        </>
      ) : null}

      {activeSection.slug === "waste-tracker" ? (
        <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Waste Tracker
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Filtered waste entries
              </Typography>
            </Box>

            <Stack spacing={1.25}>
              {filteredWaste.length > 0 ? (
                filteredWaste.map((entry) => (
                  <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {entry.itemName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                          {entry.locationName} - {entry.station || "No station"} - {entry.shift}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                          {entry.reason} - {entry.reportedByName} - {formatDateTime(entry.createdAt)}
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Chip size="small" color="warning" label={`${entry.quantity} ${entry.unit}`} />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                          {formatCurrency(entry.estimatedCost, snapshot.settings.currency)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No waste entries matched the current filters.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {activeSection.slug === "movement-ledger" ? (
        <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Movement Ledger
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Filtered stock movements
              </Typography>
            </Box>

            <Stack spacing={1.25}>
              {filteredLedger.length > 0 ? (
                filteredLedger.map((entry) => (
                  <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {entry.reference}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                          {entry.itemName} - {entry.locationName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                          {entry.actorName} - {formatDateTime(entry.createdAt)}
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Chip
                          size="small"
                          color={entry.quantityChange < 0 ? "warning" : "success"}
                          label={`${entry.quantityChange > 0 ? "+" : ""}${entry.quantityChange}`}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                          After balance {entry.quantityAfter}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No movement ledger entries matched the current filters.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
