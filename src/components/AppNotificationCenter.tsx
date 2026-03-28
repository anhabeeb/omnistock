import { useMemo, useState } from "react";
import {
  Box,
  Button,
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
import type { InventorySnapshot, NotificationRecord, NotificationType } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import { blurActiveElement } from "../lib/muiFocus";
import { AlertIcon, BellIcon, ClockIcon } from "./AppIcons";

interface Props {
  snapshot: InventorySnapshot;
  onMarkRead: (notificationId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  pageMode?: boolean;
  onOpenPage?: () => void;
}

type NotificationFilter = "all" | NotificationType;

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
  if (value === "all") {
    return "All";
  }

  return value.replace(/-/g, " ");
}

function iconFor(notification: NotificationRecord) {
  if (notification.type === "expired" || notification.type === "failed-sync") {
    return <ClockIcon size={16} />;
  }

  return <AlertIcon size={16} />;
}

export function AppNotificationCenter({
  snapshot,
  onMarkRead,
  onMarkAllRead,
  pageMode = false,
  onOpenPage,
}: Props) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [busyId, setBusyId] = useState<string>();
  const activeNotifications = useMemo(
    () => snapshot.notifications.filter((notification) => !notification.resolvedAt),
    [snapshot.notifications],
  );
  const unreadCount = activeNotifications.filter(
    (notification) => notification.status === "unread",
  ).length;
  const filteredNotifications =
    filter === "all"
      ? activeNotifications
      : activeNotifications.filter((notification) => notification.type === filter);

  function closePopover() {
    blurActiveElement();
    setAnchorEl(null);
  }

  async function handleMarkRead(notificationId: string) {
    setBusyId(notificationId);
    try {
      await onMarkRead(notificationId);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <>
      <IconButton
        aria-label="Open notifications"
        onClick={(event) => {
          if (pageMode) {
            blurActiveElement();
            onOpenPage?.();
            return;
          }
          if (anchorEl) {
            closePopover();
            return;
          }
          setAnchorEl(event.currentTarget);
        }}
        sx={{
          position: "relative",
          width: 44,
          height: 44,
        }}
      >
        <BellIcon size={18} />
        {unreadCount > 0 ? (
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
            {unreadCount > 9 ? "9+" : unreadCount}
          </Box>
        ) : null}
      </IconButton>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={closePopover}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              width: { xs: "min(94vw, 420px)", sm: 420 },
              borderRadius: 3,
              overflow: "hidden",
            },
          },
        }}
      >
        <Paper sx={{ p: 2.25 }}>
          <Stack spacing={2}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              spacing={1}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>
                  Notifications
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {activeNotifications.length > 0
                    ? `${unreadCount} unread across ${activeNotifications.length} active notifications`
                    : "No active notifications"}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                {!pageMode && onOpenPage ? (
                  <Button
                    size="small"
                    onClick={() => {
                      closePopover();
                      onOpenPage();
                    }}
                  >
                    Open center
                  </Button>
                ) : null}
                <Button
                  size="small"
                  onClick={() => void onMarkAllRead()}
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </Button>
              </Stack>
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

            <Divider />

            <Stack spacing={1.25}>
              {filteredNotifications.length > 0 ? (
                filteredNotifications.slice(0, 12).map((notification) => (
                  <Paper
                    key={notification.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      borderColor:
                        notification.status === "unread"
                          ? alpha(theme.palette.primary.main, 0.3)
                          : undefined,
                      bgcolor:
                        theme.palette.mode === "dark"
                          ? alpha(theme.palette.common.white, 0.03)
                          : alpha(theme.palette.primary.main, 0.03),
                    }}
                  >
                    <Stack spacing={1.2}>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 2,
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
                          {iconFor(notification)}
                        </Box>

                        <Box minWidth={0} flex={1}>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            useFlexGap
                            flexWrap="wrap"
                          >
                            <Typography variant="body2" fontWeight={800}>
                              {notification.title}
                            </Typography>
                            <Chip
                              size="small"
                              label={notification.type.replace(/-/g, " ")}
                              variant="outlined"
                              sx={{ textTransform: "capitalize" }}
                            />
                            {notification.status === "unread" ? (
                              <Chip size="small" color="primary" label="Unread" />
                            ) : null}
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {notification.message}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mt: 0.9, display: "block" }}
                          >
                            {notification.locationName
                              ? `${notification.locationName} · `
                              : ""}
                            {formatDateTime(notification.createdAt)}
                          </Typography>
                        </Box>
                      </Stack>

                      {notification.status === "unread" ? (
                        <Stack direction="row" justifyContent="flex-end">
                          <Button
                            size="small"
                            disabled={busyId === notification.id}
                            onClick={() => void handleMarkRead(notification.id)}
                          >
                            {busyId === notification.id ? "Saving..." : "Mark read"}
                          </Button>
                        </Stack>
                      ) : null}
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No notifications match this filter.
                </Typography>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Popover>
    </>
  );
}
