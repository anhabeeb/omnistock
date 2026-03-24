import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Divider,
  IconButton,
  Paper,
  Popover,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { expiredAlerts, inventoryAlerts, lowStockAlerts, nearExpiryAlerts } from "../../shared/selectors";
import type { InventorySnapshot } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import { AlertIcon, BellIcon, ClockIcon } from "./AppIcons";

interface Props {
  snapshot: InventorySnapshot;
}

type AlertFilter = "all" | "low-stock" | "near-expiry" | "expired";

export function AppNotificationCenter({ snapshot }: Props) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState<AlertFilter>("all");
  const allAlerts = useMemo(() => inventoryAlerts(snapshot), [snapshot]);
  const filteredAlerts =
    filter === "all"
      ? allAlerts
      : filter === "low-stock"
        ? lowStockAlerts(snapshot)
        : filter === "near-expiry"
          ? nearExpiryAlerts(snapshot)
          : expiredAlerts(snapshot);

  return (
    <>
      <IconButton
        aria-label="Open notifications"
        onClick={(event) => setAnchorEl(anchorEl ? null : event.currentTarget)}
        sx={{
          position: "relative",
          width: 44,
          height: 44,
        }}
      >
        <BellIcon size={18} />
        {allAlerts.length > 0 ? (
          <Box
            sx={{
              position: "absolute",
              top: 3,
              right: 3,
              minWidth: 18,
              height: 18,
              px: 0.5,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              bgcolor: "error.main",
              color: "common.white",
              fontSize: "0.65rem",
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {allAlerts.length > 9 ? "9+" : allAlerts.length}
          </Box>
        ) : null}
      </IconButton>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              width: { xs: "min(92vw, 360px)", sm: 380 },
              borderRadius: 3,
              overflow: "hidden",
            },
          },
        }}
      >
        <Paper sx={{ p: 2.25 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>
                Notifications
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {allAlerts.length > 0 ? `${allAlerts.length} active inventory alerts` : "No active alerts"}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {(["all", "low-stock", "near-expiry", "expired"] as AlertFilter[]).map((option) => (
                <Chip
                  key={option}
                  label={option === "all" ? "All" : option.replace("-", " ")}
                  clickable
                  color={filter === option ? "primary" : "default"}
                  variant={filter === option ? "filled" : "outlined"}
                  onClick={() => setFilter(option)}
                />
              ))}
            </Stack>

            <Divider />

            <Stack spacing={1.25}>
              {filteredAlerts.length > 0 ? (
                filteredAlerts.slice(0, 8).map((alert) => (
                  <Paper
                    key={alert.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      bgcolor:
                        theme.palette.mode === "dark"
                          ? alpha(theme.palette.common.white, 0.03)
                          : alpha(theme.palette.primary.main, 0.03),
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 2,
                          display: "grid",
                          placeItems: "center",
                          bgcolor:
                            alert.kind === "low-stock"
                              ? alpha(theme.palette.warning.main, 0.14)
                              : alpha(theme.palette.error.main, 0.12),
                          color:
                            alert.kind === "low-stock"
                              ? "warning.main"
                              : "error.main",
                          flex: "0 0 auto",
                        }}
                      >
                        {alert.kind === "low-stock" ? <AlertIcon size={16} /> : <ClockIcon size={16} />}
                      </Box>

                      <Box minWidth={0}>
                        <Typography variant="body2" fontWeight={800}>
                          {alert.itemName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                          {alert.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: "block" }}>
                          {alert.locationName}
                          {alert.expiryDate ? ` - ${formatDateTime(alert.expiryDate)}` : ""}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No alerts match this filter.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Popover>
    </>
  );
}

