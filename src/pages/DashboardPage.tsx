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
  lowStockAlerts,
  nearExpiryAlerts,
  recentLedger,
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
  const showGuideSection = false;
  const metricCards = dashboardMetrics(snapshot);
  const recentMovements = recentLedger(snapshot, 5);
  const activeAlerts = alertListForTab(snapshot, alertTab).slice(0, 6);
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
      <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" spacing={2} sx={{ px: { xs: 0.25, md: 0.5 }, py: { xs: 0.5, md: 0.75 } }}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Dashboard Overview
            </Typography>
            <Typography variant="h3" sx={{ mt: 0.5 }}>
              Welcome back, {currentUser.name.split(" ")[0]}
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            justifyContent={{ xs: "flex-start", xl: "flex-end" }}
            alignItems="center"
          >
            <Button
              component={Link}
              to="/reports/analytics"
              variant="outlined"
              size="medium"
              startIcon={<ReportsIcon size={16} />}
              sx={{ minHeight: 38, px: 2 }}
            >
              Reports
            </Button>
            <Button
              component={Link}
              to="/inventory/grn"
              variant="contained"
              size="medium"
              startIcon={<PlusIcon size={16} />}
              sx={{ minHeight: 38, px: 2 }}
            >
              Inventory OPS
            </Button>
          </Stack>
      </Stack>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" } }}>
        {metricCards.map((metric) => {
          const Icon = statIcon(metric.label);
          const tone = statTone(metric.label);
          return (
            <Paper key={metric.label} sx={{ p: { xs: 2.25, md: 2.75 }, borderRadius: 3 }}>
              <Stack spacing={2} sx={{ minHeight: 156, justifyContent: "space-between" }}>
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
              </Stack>
            </Paper>
          );
        })}
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.45fr) minmax(320px, 0.9fr)" } }}>
        <Paper sx={{ p: 2.75, borderRadius: 3 }}>
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

        <Paper sx={{ p: 2.75, borderRadius: 3 }}>
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
      </Box>

      <Paper sx={{ p: 2.75, borderRadius: 3 }}>
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
              <Paper key={event.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
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

      {showGuideSection ? (
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
      ) : null}
    </Stack>
  );
}
