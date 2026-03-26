import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Button, Chip, Paper, Stack, Typography, alpha, useTheme } from "@mui/material";
import type {
  InventoryRequest,
  InventorySnapshot,
  NotificationRecord,
  NotificationType,
} from "../../shared/types";
import { AlertIcon, ClockIcon, InventoryIcon } from "../components/AppIcons";
import { formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  onMarkRead: (notificationId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

type NotificationFilter = "all" | NotificationType;
type MobileTab = "alerts" | "approvals";

const FILTERS: NotificationFilter[] = [
  "all",
  "low-stock",
  "near-expiry",
  "expired",
  "approval-request",
  "failed-sync",
  "wastage-threshold",
  "daily-summary",
];

function filterLabel(value: NotificationFilter): string {
  return value === "all" ? "All" : value.replace(/-/g, " ");
}

function iconFor(notification: NotificationRecord) {
  return notification.type === "expired" || notification.type === "failed-sync"
    ? ClockIcon
    : AlertIcon;
}

function requestPath(request: InventoryRequest) {
  switch (request.kind) {
    case "grn":
      return "/inventory/grn";
    case "gin":
      return "/inventory/gin";
    case "transfer":
      return "/inventory/transfer";
    case "adjustment":
      return "/inventory/adjustments";
    case "stock-count":
      return "/inventory/stock-count";
    case "wastage":
      return "/inventory/wastage";
  }
}

export function MobileAlertsPage({ snapshot, onMarkRead, onMarkAllRead }: Props) {
  const theme = useTheme();
  const [tab, setTab] = useState<MobileTab>("alerts");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [busyId, setBusyId] = useState<string>();
  const activeNotifications = useMemo(
    () => snapshot.notifications.filter((notification) => !notification.resolvedAt),
    [snapshot.notifications],
  );
  const pendingApprovals = useMemo(
    () =>
      [...snapshot.requests]
        .filter((request) => request.status === "submitted")
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt)),
    [snapshot.requests],
  );
  const unreadCount = activeNotifications.filter((notification) => notification.status === "unread").length;
  const filteredNotifications =
    filter === "all"
      ? activeNotifications
      : activeNotifications.filter((notification) => notification.type === filter);

  async function handleMarkRead(notificationId: string) {
    setBusyId(notificationId);
    try {
      await onMarkRead(notificationId);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.25, borderRadius: 3.5 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Mobile Alerts
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              Alerts & approvals
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Review live stock warnings, sync issues, and submitted requests without leaving your phone flow.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Paper variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Unread alerts
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.4 }}>
                {unreadCount}
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Pending approvals
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.4 }}>
                {pendingApprovals.length}
              </Typography>
            </Paper>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button fullWidth variant={tab === "alerts" ? "contained" : "outlined"} color="inherit" onClick={() => setTab("alerts")}>
              Alerts
            </Button>
            <Button fullWidth variant={tab === "approvals" ? "contained" : "outlined"} color="inherit" onClick={() => setTab("approvals")}>
              Approvals
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {tab === "alerts" ? (
        <Paper sx={{ p: 2, borderRadius: 3.5 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1" fontWeight={800}>
                Active notifications
              </Typography>
              <Button size="small" onClick={() => void onMarkAllRead()} disabled={unreadCount === 0}>
                Mark all read
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {FILTERS.map((option) => (
                <Chip
                  key={option}
                  label={filterLabel(option)}
                  clickable
                  color={filter === option ? "primary" : "default"}
                  variant={filter === option ? "filled" : "outlined"}
                  onClick={() => setFilter(option)}
                  sx={{ textTransform: "capitalize" }}
                />
              ))}
            </Stack>

            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notification) => {
                const Icon = iconFor(notification);
                return (
                  <Paper
                    key={notification.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 3,
                      borderColor:
                        notification.status === "unread"
                          ? alpha(theme.palette.primary.main, 0.3)
                          : undefined,
                    }}
                  >
                    <Stack spacing={1.25}>
                      <Stack direction="row" spacing={1.25} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 2.25,
                            display: "grid",
                            placeItems: "center",
                            bgcolor:
                              notification.severity === "critical"
                                ? alpha(theme.palette.error.main, 0.12)
                                : notification.severity === "warning"
                                  ? alpha(theme.palette.warning.main, 0.14)
                                  : alpha(theme.palette.info.main, 0.14),
                            color:
                              notification.severity === "critical"
                                ? "error.main"
                                : notification.severity === "warning"
                                  ? "warning.main"
                                  : "info.main",
                            flex: "0 0 auto",
                          }}
                        >
                          <Icon size={16} />
                        </Box>
                        <Box flex={1} minWidth={0}>
                          <Typography variant="subtitle2" fontWeight={800}>
                            {notification.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {notification.message}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.9, display: "block" }}>
                            {formatDateTime(notification.createdAt)}
                          </Typography>
                        </Box>
                      </Stack>

                      {notification.status === "unread" ? (
                        <Stack direction="row" justifyContent="flex-end">
                          <Button size="small" disabled={busyId === notification.id} onClick={() => void handleMarkRead(notification.id)}>
                            {busyId === notification.id ? "Saving..." : "Mark read"}
                          </Button>
                        </Stack>
                      ) : null}
                    </Stack>
                  </Paper>
                );
              })
            ) : (
              <Typography variant="body2" color="text.secondary">
                No notifications match this filter.
              </Typography>
            )}
          </Stack>
        </Paper>
      ) : (
        <Paper sx={{ p: 2, borderRadius: 3.5 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={800}>
              Submitted requests awaiting review
            </Typography>
            {pendingApprovals.length > 0 ? (
              pendingApprovals.map((request) => (
                <Paper key={request.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={800}>
                          {request.reference}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {request.kind.toUpperCase()} · {request.itemName}
                        </Typography>
                      </Box>
                      <Chip size="small" color="warning" variant="outlined" label={request.status} />
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      {request.quantity} {request.unit} · {request.fromLocationName ?? request.toLocationName ?? "Location pending"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Requested by {request.requestedByName} · {formatDateTime(request.requestedAt)}
                    </Typography>

                    <Button
                      component={Link}
                      to={requestPath(request)}
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<InventoryIcon size={15} />}
                      sx={{ alignSelf: "flex-start", mt: 0.5 }}
                    >
                      Open workflow
                    </Button>
                  </Stack>
                </Paper>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No approval requests are waiting right now.
              </Typography>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
