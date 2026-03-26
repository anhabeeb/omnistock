import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
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
import type { InventorySnapshot, User } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import type { SyncState } from "../lib/useOmniStockApp";
import {
  AlertIcon,
  ClockIcon,
  InventoryIcon,
  BellIcon,
  PlusIcon,
  ReportsIcon,
  SearchIcon,
} from "../components/AppIcons";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  syncState: SyncState;
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

function statIcon(label: string) {
  if (label.includes("Low")) {
    return AlertIcon;
  }
  if (label.includes("Expiry")) {
    return ClockIcon;
  }
  return InventoryIcon;
}

export function MobileDashboardPage({ snapshot, currentUser, syncState }: Props) {
  const theme = useTheme();
  const metrics = dashboardMetrics(snapshot).slice(0, 4);
  const lowStockCount = lowStockAlerts(snapshot).length;
  const nearExpiryCount = nearExpiryAlerts(snapshot).length;
  const expiredCount = expiredAlerts(snapshot).length;
  const recentMovements = recentLedger(snapshot, 4);

  const quickLinks = [
    {
      label: "Search",
      to: "/search",
      icon: SearchIcon,
      helper: "Find item fast",
      tone: "primary" as const,
    },
    {
      label: "Receive",
      to: "/inventory/grn",
      icon: PlusIcon,
      helper: "Create GRN",
      tone: "success" as const,
    },
    {
      label: "Reports",
      to: "/reports/analytics",
      icon: ReportsIcon,
      helper: "View insights",
      tone: "warning" as const,
    },
    {
      label: "Alerts",
      to: "/alerts",
      icon: BellIcon,
      helper: "Open inbox",
      tone: "primary" as const,
    },
  ];

  const alertCards = [
    {
      label: "Low stock",
      value: lowStockCount,
      tone: "warning" as const,
    },
    {
      label: "Near expiry",
      value: nearExpiryCount,
      tone: "primary" as const,
    },
    {
      label: "Expired",
      value: expiredCount,
      tone: "error" as const,
    },
  ];

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
            >
              Mobile Overview
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              Welcome back, {currentUser.name.split(" ")[0]}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Quick stock health, fast actions, and live alerts for on-the-go warehouse work.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color={syncState.online ? "success" : "warning"}
              variant={syncState.online ? "outlined" : "filled"}
              label={syncState.online ? "Live sync" : "Offline queue"}
            />
            <Chip
              size="small"
              variant="outlined"
              label={`${syncState.queued} queued`}
            />
          </Stack>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gap: 1.25,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        {metrics.map((metric) => {
          const Icon = statIcon(metric.label);
          const tone = statTone(metric.label);
          return (
            <Paper key={metric.label} sx={{ p: 1.75, borderRadius: 3 }}>
              <Stack spacing={1.5}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 2.5,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: alpha(theme.palette[tone].main, 0.12),
                    color: `${tone}.main`,
                  }}
                >
                  <Icon size={18} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {metric.label}
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.5 }}>
                    {metric.value}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Box>

      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
            >
              Quick Actions
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.4 }}>
              Jump into core tasks
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.label}
                  component={Link}
                  to={link.to}
                  color="inherit"
                  sx={{
                    minHeight: 92,
                    px: 1.25,
                    py: 1.5,
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    border: `1px solid ${alpha(theme.palette[link.tone].main, 0.18)}`,
                    bgcolor: alpha(theme.palette[link.tone].main, 0.08),
                    color: "text.primary",
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2.25,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: alpha(theme.palette[link.tone].main, 0.14),
                      color: `${link.tone}.main`,
                    }}
                  >
                    <Icon size={16} />
                  </Box>
                  <Box sx={{ textAlign: "left" }}>
                    <Typography variant="subtitle2" fontWeight={800}>
                      {link.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {link.helper}
                    </Typography>
                  </Box>
                </Button>
              );
            })}
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
            >
              Alert Snapshot
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.4 }}>
              Current attention areas
            </Typography>
          </Box>

          <Stack spacing={1}>
            {alertCards.map((card) => (
              <Paper
                key={card.label}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 3,
                  bgcolor: alpha(theme.palette[card.tone].main, 0.06),
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={700}>
                    {card.label}
                  </Typography>
                  <Chip
                    size="small"
                    color={card.tone}
                    variant="outlined"
                    label={String(card.value)}
                  />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}
            >
              Recent Movement
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.4 }}>
              Latest stock activity
            </Typography>
          </Box>

          <Stack spacing={1}>
            {recentMovements.length > 0 ? (
              recentMovements.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: 2.25,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha(
                          entry.quantityChange < 0
                            ? theme.palette.error.main
                            : theme.palette.success.main,
                          0.12,
                        ),
                        color: entry.quantityChange < 0 ? "error.main" : "success.main",
                        flex: "0 0 auto",
                      }}
                    >
                      <InventoryIcon size={16} />
                    </Box>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="subtitle2" fontWeight={800} noWrap>
                        {entry.itemName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {entry.changeType} - {entry.locationName}
                      </Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography
                        variant="subtitle2"
                        color={entry.quantityChange < 0 ? "error.main" : "success.main"}
                        fontWeight={800}
                      >
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
    </Stack>
  );
}
