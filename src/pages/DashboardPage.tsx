import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  dashboardMetrics,
  expiredAlerts,
  inventoryAlerts,
  lowStockAlerts,
  nearExpiryAlerts,
  openRequests,
  recentLedger,
  visibleModuleCount,
} from "../../shared/selectors";
import type { InventoryAlert, InventorySnapshot, User } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import type { SyncState } from "../lib/useOmniStockApp";
import {
  AlertIcon,
  ClockIcon,
  CurrencyIcon,
  InventoryIcon,
  PlusIcon,
  ReportsIcon,
} from "../components/AppIcons";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  syncState: SyncState;
}

type AlertTab = "low-stock" | "near-expiry" | "expired";

const ALERT_COPY: Record<AlertTab, { title: string; empty: string }> = {
  "low-stock": {
    title: "Low Stock",
    empty: "No low-stock alerts right now.",
  },
  "near-expiry": {
    title: "Near Expiry",
    empty: "No batches are nearing expiry inside the alert window.",
  },
  expired: {
    title: "Expired",
    empty: "No expired stock is currently sitting in inventory.",
  },
};

const GUIDE_STORAGE_PREFIX = "omnistock:first-login-guide:";
const FIRST_LOGIN_STEPS = [
  {
    title: "Check alerts first",
    detail: "Review low stock, near-expiry, and expired items before starting daily issue or receiving.",
  },
  {
    title: "Post operations from Inventory OPS",
    detail: "Use GRN, GIN, transfers, adjustments, counts, and wastage with barcode support where needed.",
  },
  {
    title: "Keep master data clean",
    detail: "Maintain items, suppliers, warehouses, outlets, and market prices before transaction volume grows.",
  },
  {
    title: "Monitor reports every day",
    detail: "Use the reports area for movement history, waste analysis, expiry exposure, exports, and prints.",
  },
];

function alertListForTab(snapshot: InventorySnapshot, tab: AlertTab): InventoryAlert[] {
  if (tab === "low-stock") {
    return lowStockAlerts(snapshot);
  }
  if (tab === "near-expiry") {
    return nearExpiryAlerts(snapshot);
  }
  return expiredAlerts(snapshot);
}

function locationCoverage(snapshot: InventorySnapshot, locationId: string): number {
  const stocks = snapshot.items
    .flatMap((item) =>
      item.stocks
        .filter((stock) => stock.locationId === locationId)
        .map((stock) => ({ onHand: stock.onHand, minLevel: stock.minLevel })),
    )
    .filter((stock) => stock.onHand > 0 || stock.minLevel > 0);

  if (stocks.length === 0) {
    return 100;
  }

  const healthy = stocks.filter((stock) => stock.onHand > stock.minLevel).length;
  return Math.round((healthy / stocks.length) * 100);
}

function statIcon(label: string) {
  if (label.includes("Value")) {
    return CurrencyIcon;
  }
  if (label.includes("Low")) {
    return AlertIcon;
  }
  if (label.includes("Expiry")) {
    return ClockIcon;
  }
  return InventoryIcon;
}

function statTone(label: string): "success" | "primary" | "warning" | "error" {
  if (label.includes("Value")) {
    return "success";
  }
  if (label.includes("Low")) {
    return "warning";
  }
  if (label.includes("Expiry")) {
    return "error";
  }
  return "primary";
}

export function DashboardPage({ snapshot, currentUser, syncState }: Props) {
  const theme = useTheme();
  const [alertTab, setAlertTab] = useState<AlertTab>("low-stock");
  const [showGuide, setShowGuide] = useState(false);
  const metricCards = dashboardMetrics(snapshot);
  const pendingRequests = openRequests(snapshot).slice(0, 5);
  const recentMovements = recentLedger(snapshot, 5);
  const activeAlerts = alertListForTab(snapshot, alertTab).slice(0, 6);
  const assignedLocations = snapshot.locations.filter((location) =>
    currentUser.assignedLocationIds.includes(location.id),
  );
  const alertBacklog = inventoryAlerts(snapshot).length;
  const alertCounts = {
    "low-stock": lowStockAlerts(snapshot).length,
    "near-expiry": nearExpiryAlerts(snapshot).length,
    expired: expiredAlerts(snapshot).length,
  } satisfies Record<AlertTab, number>;

  useEffect(() => {
    const key = `${GUIDE_STORAGE_PREFIX}${currentUser.id}`;
    setShowGuide(window.localStorage.getItem(key) !== "seen");
  }, [currentUser.id]);

  function dismissGuide() {
    window.localStorage.setItem(`${GUIDE_STORAGE_PREFIX}${currentUser.id}`, "seen");
    setShowGuide(false);
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
        <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Dashboard Overview
            </Typography>
            <Typography variant="h3" sx={{ mt: 0.5 }}>
              Welcome back, {currentUser.name.split(" ")[0]}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 820 }}>
              {snapshot.settings.companyName} is running across {assignedLocations.length} assigned
              locations. You currently have access to {visibleModuleCount(snapshot, currentUser.id)} modules,
              with {alertBacklog} active stock alerts and {syncState.online ? "healthy" : "offline"} sync posture.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
            <Button component={Link} to="/reports/analytics" variant="outlined" startIcon={<ReportsIcon size={16} />}>
              Reports
            </Button>
            <Button component={Link} to="/inventory/grn" variant="contained" startIcon={<PlusIcon size={16} />}>
              Inventory OPS
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" } }}>
        {metricCards.map((metric) => {
          const Icon = statIcon(metric.label);
          const tone = statTone(metric.label);
          return (
            <Paper key={metric.label} sx={{ p: 2.25, borderRadius: 4 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 2.5,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: alpha(theme.palette[tone].main, 0.12),
                      color: `${tone}.main`,
                    }}
                  >
                    <Icon size={20} />
                  </Box>
                  <Chip label={metric.tone === "warning" ? "Attention" : "Live"} color={tone} size="small" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {metric.label}
                </Typography>
                <Typography variant="h5">{metric.value}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {metric.detail}
                </Typography>
              </Stack>
            </Paper>
          );
        })}
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.45fr) minmax(320px, 0.9fr)" } }}>
        <Paper sx={{ p: 2.5, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Movement Ledger
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  Recent Stock Activity
                </Typography>
              </Box>
              <Button component={Link} to="/reports/movement-ledger" variant="text">
                View all
              </Button>
            </Stack>

            <Stack spacing={1.25}>
              {recentMovements.length > 0 ? (
                recentMovements.map((entry) => (
                  <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: 2.5,
                          display: "grid",
                          placeItems: "center",
                          bgcolor: alpha(entry.quantityChange < 0 ? theme.palette.error.main : theme.palette.success.main, 0.12),
                          color: entry.quantityChange < 0 ? "error.main" : "success.main",
                        }}
                      >
                        <InventoryIcon size={18} />
                      </Box>
                      <Box flex={1} minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={800} noWrap>
                          {entry.itemName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {entry.changeType} - {entry.locationName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {entry.reference}
                        </Typography>
                      </Box>
                      <Box textAlign="right">
                        <Typography variant="subtitle2" color={entry.quantityChange < 0 ? "error.main" : "success.main"} fontWeight={800}>
                          {entry.quantityChange > 0 ? "+" : ""}
                          {entry.quantityChange}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(entry.createdAt)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No stock movements have been posted yet.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Warehouse Status
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Assigned Locations
              </Typography>
            </Box>

            <Stack spacing={1.25}>
              {assignedLocations.length > 0 ? (
                assignedLocations.map((location) => {
                  const coverage = locationCoverage(snapshot, location.id);
                  return (
                    <Paper key={location.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="subtitle2" fontWeight={800}>
                              {location.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {location.code}
                            </Typography>
                          </Box>
                          <Chip label={`${coverage}% ready`} color={coverage >= 80 ? "success" : coverage >= 50 ? "warning" : "error"} size="small" />
                        </Stack>
                        <Box sx={{ height: 10, borderRadius: 999, bgcolor: alpha(theme.palette.primary.main, 0.1), overflow: "hidden" }}>
                          <Box sx={{ width: `${coverage}%`, height: "100%", bgcolor: coverage >= 80 ? "success.main" : coverage >= 50 ? "warning.main" : "error.main" }} />
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No locations are assigned to this user yet.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(320px, 0.9fr)" } }}>
        <Paper sx={{ p: 2.5, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Notification Center
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  {ALERT_COPY[alertTab].title}
                </Typography>
              </Box>
              <Chip variant="outlined" label={snapshot.settings.strictFefo ? "FEFO enforced" : "FEFO guided"} />
            </Stack>

            <ToggleButtonGroup
              exclusive
              color="primary"
              value={alertTab}
              onChange={(_, value: AlertTab | null) => value && setAlertTab(value)}
              sx={{ flexWrap: "wrap", gap: 1, "& .MuiToggleButtonGroup-grouped": { borderRadius: "14px !important", border: "1px solid", borderColor: "divider" } }}
            >
              {(["low-stock", "near-expiry", "expired"] as AlertTab[]).map((tab) => (
                <ToggleButton key={tab} value={tab}>
                  {ALERT_COPY[tab].title} ({alertCounts[tab]})
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack spacing={1.25}>
              {activeAlerts.length > 0 ? (
                activeAlerts.map((alert) => (
                  <Paper key={alert.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {alert.itemName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                          {alert.locationName}
                          {alert.lotCode ? ` - ${alert.lotCode}` : ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                          {alert.message}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        color={alert.kind === "expired" ? "error" : alert.kind === "low-stock" ? "warning" : "primary"}
                        label={
                          alert.kind === "low-stock"
                            ? `${alert.quantity} left`
                            : alert.daysUntilExpiry !== undefined
                              ? alert.daysUntilExpiry < 0
                                ? "Expired"
                                : `${alert.daysUntilExpiry}d left`
                              : `${alert.quantity} units`
                        }
                      />
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {ALERT_COPY[alertTab].empty}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Request Flow
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Pending Submissions
              </Typography>
            </Box>

            <Stack spacing={1.25}>
              {pendingRequests.length > 0 ? (
                pendingRequests.map((request) => (
                  <Paper key={request.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1.25}>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {request.reference}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                          {request.itemName} - {request.quantity} {request.unit}
                        </Typography>
                        {request.allocationSummary ? (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                            {request.allocationSummary}
                          </Typography>
                        ) : null}
                      </Box>
                      <Chip size="small" variant="outlined" label={request.kind} />
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  All requests are currently posted.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(360px, 0.92fr)" } }}>
        <Paper sx={{ p: 2.5, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  First Login Guide
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  How To Operate OmniStock
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => setShowGuide(true)}>
                  Open guide
                </Button>
                {showGuide ? (
                  <Button variant="text" onClick={dismissGuide}>
                    Mark as done
                  </Button>
                ) : null}
              </Stack>
            </Stack>

            {showGuide ? (
              <Stack spacing={1.25}>
                {FIRST_LOGIN_STEPS.map((step, index) => (
                  <Paper key={step.title} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1.25}>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {index + 1}. {step.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {step.detail}
                        </Typography>
                      </Box>
                      <Chip size="small" variant="outlined" label={`Step ${index + 1}`} />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                The quick-start guide is tucked away. Open it anytime if a user needs a refresher.
              </Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Activity Feed
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  Audit Highlights
                </Typography>
              </Box>
              <Chip variant="outlined" label={syncState.online ? "Live sync" : "Queued sync"} />
            </Stack>

            <Stack spacing={1.25}>
              {snapshot.activity.slice(0, 6).map((event) => (
                <Paper key={event.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1.25} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        mt: 0.6,
                        bgcolor:
                          event.severity === "warning"
                            ? "warning.main"
                            : event.severity === "success"
                              ? "success.main"
                              : "primary.main",
                        flex: "0 0 auto",
                      }}
                    />
                    <Box minWidth={0}>
                      <Typography variant="subtitle2" fontWeight={800}>
                        {event.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                        {event.detail}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        {event.actorName} - {formatDateTime(event.createdAt)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}
