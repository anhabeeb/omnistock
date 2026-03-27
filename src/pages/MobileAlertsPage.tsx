import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import type {
  ApproveInventoryRequest,
  InventoryRequest,
  InventorySnapshot,
  NotificationRecord,
  NotificationType,
  RejectInventoryRequest,
  User,
} from "../../shared/types";
import { can } from "../../shared/permissions";
import { AlertIcon, ClockIcon, InventoryIcon } from "../components/AppIcons";
import { formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onMarkRead: (notificationId: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onApproveRequest: (input: ApproveInventoryRequest) => Promise<InventoryRequest | undefined>;
  onRejectRequest: (input: RejectInventoryRequest) => Promise<InventoryRequest | undefined>;
}

type NotificationFilter = "all" | NotificationType;
type MobileTab = "alerts" | "approvals";
type DecisionMode = "approve" | "reject" | null;

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

export function MobileAlertsPage({
  snapshot,
  currentUser,
  onMarkRead,
  onMarkAllRead,
  onApproveRequest,
  onRejectRequest,
}: Props) {
  const theme = useTheme();
  const [tab, setTab] = useState<MobileTab>("alerts");
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [busyId, setBusyId] = useState<string>();
  const [decisionMode, setDecisionMode] = useState<DecisionMode>(null);
  const [decisionRequestId, setDecisionRequestId] = useState<string>();
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string>();

  const canApproveRequests = can(currentUser, "inventory.approve");
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
  const selectedApproval = pendingApprovals.find((request) => request.id === decisionRequestId);
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

  function openDecision(mode: Exclude<DecisionMode, null>, request: InventoryRequest) {
    setDecisionMode(mode);
    setDecisionRequestId(request.id);
    setDecisionNote("");
    setDecisionError(undefined);
  }

  function closeDecision() {
    if (decisionBusy) {
      return;
    }
    setDecisionMode(null);
    setDecisionRequestId(undefined);
    setDecisionNote("");
    setDecisionError(undefined);
  }

  async function submitDecision() {
    if (!selectedApproval || !decisionMode) {
      return;
    }

    const note = decisionNote.trim();
    if (decisionMode === "reject" && !note) {
      setDecisionError("Provide a reason before rejecting this request.");
      return;
    }

    setDecisionBusy(true);
    setDecisionError(undefined);
    try {
      if (decisionMode === "approve") {
        await onApproveRequest({
          requestId: selectedApproval.id,
          note,
        });
      } else {
        await onRejectRequest({
          requestId: selectedApproval.id,
          reason: note,
        });
      }
      closeDecision();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Could not complete the approval action.");
    } finally {
      setDecisionBusy(false);
    }
  }

  return (
    <>
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
                      {request.note ? (
                        <Typography variant="body2" color="text.secondary">
                          {request.note}
                        </Typography>
                      ) : null}

                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {canApproveRequests ? (
                          <>
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              onClick={() => openDecision("approve", request)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => openDecision("reject", request)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                        <Button
                          component={Link}
                          to={requestPath(request)}
                          size="small"
                          variant="outlined"
                          color="inherit"
                          startIcon={<InventoryIcon size={15} />}
                        >
                          Open workflow
                        </Button>
                      </Stack>
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

      <Dialog
        open={Boolean(decisionMode && selectedApproval)}
        onClose={closeDecision}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {decisionMode === "approve" ? "Approve request" : "Reject request"}
        </DialogTitle>
        <DialogContent dividers>
          {selectedApproval ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" fontWeight={800}>
                  {selectedApproval.reference}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                  {selectedApproval.itemName} · {selectedApproval.quantity} {selectedApproval.unit}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.6, display: "block" }}>
                  Requested by {selectedApproval.requestedByName} · {formatDateTime(selectedApproval.requestedAt)}
                </Typography>
              </Box>

              <TextField
                label={decisionMode === "approve" ? "Approval note (optional)" : "Rejection reason"}
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder={
                  decisionMode === "approve"
                    ? "Optional note for the approval trail"
                    : "Explain why this request is being rejected"
                }
                multiline
                minRows={3}
                autoFocus
                required={decisionMode === "reject"}
              />

              {decisionError ? (
                <Typography variant="body2" color="error.main">
                  {decisionError}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDecision} disabled={decisionBusy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submitDecision()}
            variant="contained"
            color={decisionMode === "reject" ? "error" : "primary"}
            disabled={decisionBusy}
          >
            {decisionBusy
              ? decisionMode === "approve"
                ? "Approving..."
                : "Rejecting..."
              : decisionMode === "approve"
                ? "Approve request"
                : "Reject request"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
