import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
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
  RequestAttachmentInput,
  RejectInventoryRequest,
  User,
} from "../../shared/types";
import { can } from "../../shared/permissions";
import { AlertIcon, ClockIcon, InventoryIcon } from "../components/AppIcons";
import { RequestEvidenceList, RequestEvidenceUploader } from "../components/RequestEvidence";
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

export function AlertsPage({
  snapshot,
  currentUser,
  onMarkRead,
  onMarkAllRead,
  onApproveRequest,
  onRejectRequest,
}: Props) {
  const theme = useTheme();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [busyId, setBusyId] = useState<string>();
  const [decisionMode, setDecisionMode] = useState<DecisionMode>(null);
  const [decisionRequestId, setDecisionRequestId] = useState<string>();
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionAttachments, setDecisionAttachments] = useState<RequestAttachmentInput[]>([]);
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
  const unreadCount = activeNotifications.filter((notification) => notification.status === "unread").length;
  const criticalCount = activeNotifications.filter((notification) => notification.severity === "critical").length;
  const filteredNotifications =
    filter === "all"
      ? activeNotifications
      : activeNotifications.filter((notification) => notification.type === filter);
  const selectedApproval = pendingApprovals.find((request) => request.id === decisionRequestId);

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
    setDecisionAttachments([]);
    setDecisionError(undefined);
  }

  function closeDecision() {
    if (decisionBusy) {
      return;
    }
    setDecisionMode(null);
    setDecisionRequestId(undefined);
    setDecisionNote("");
    setDecisionAttachments([]);
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
          attachments: decisionAttachments,
        });
      } else {
        await onRejectRequest({
          requestId: selectedApproval.id,
          reason: note,
          attachments: decisionAttachments,
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
      <Stack spacing={3}>
        <Box className="page-intro page-intro--plain">
          <Typography className="page-intro__eyebrow">Approval center</Typography>
          <Typography className="page-intro__title">Alerts & approvals</Typography>
          <Typography className="page-intro__description">
            Review live stock warnings, sync issues, and submitted inventory requests from one desktop inbox.
          </Typography>
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              xl: "repeat(4, minmax(0, 1fr))",
            },
          }}
        >
          {[
            {
              eyebrow: "Unread alerts",
              value: unreadCount,
              detail: "Notifications that still need attention.",
            },
            {
              eyebrow: "Critical alerts",
              value: criticalCount,
              detail: "High-priority issues needing immediate review.",
            },
            {
              eyebrow: "Pending approvals",
              value: pendingApprovals.length,
              detail: "Submitted inventory requests waiting for a decision.",
            },
            {
              eyebrow: "Approval access",
              value: canApproveRequests ? "Enabled" : "View only",
              detail: canApproveRequests
                ? "You can approve or reject incoming requests."
                : "You can review requests, but approvals need extra access.",
            },
          ].map((card) => (
            <Paper key={card.eyebrow} sx={{ p: 2.25, borderRadius: 2.75 }}>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.14em" }}>
                {card.eyebrow}
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.6 }}>
                {card.value}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.9 }}>
                {card.detail}
              </Typography>
            </Paper>
          ))}
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              xl: "minmax(0, 1.3fr) minmax(360px, 0.95fr)",
            },
            alignItems: "start",
          }}
        >
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                spacing={1.5}
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Box>
                  <Typography variant="h6">Active notifications</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>
                    Filter current stock, expiry, sync, and workflow alerts without leaving the approval center.
                  </Typography>
                </Box>
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

              <Stack spacing={1.5}>
                {filteredNotifications.length > 0 ? (
                  filteredNotifications.map((notification) => {
                    const Icon = iconFor(notification);
                    return (
                      <Paper
                        key={notification.id}
                        variant="outlined"
                        sx={{
                          p: 1.75,
                          borderRadius: 2.5,
                          borderColor:
                            notification.status === "unread"
                              ? alpha(theme.palette.primary.main, 0.3)
                              : undefined,
                        }}
                      >
                        <Stack spacing={1.25}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box
                              sx={{
                                width: 38,
                                height: 38,
                                borderRadius: 2.5,
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
                              <Icon size={18} />
                            </Box>
                            <Box minWidth={0} flex={1}>
                              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                                <Typography variant="subtitle2" fontWeight={800}>
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
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>
                                {notification.message}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                                {notification.locationName ? `${notification.locationName} - ` : ""}
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
                    );
                  })
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No notifications match this filter.
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6">Incoming inventory approvals</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7 }}>
                  Review submitted GRN, GIN, transfers, adjustments, counts, and wastage entries before they post.
                </Typography>
              </Box>

              {!canApproveRequests ? (
                <Alert severity="info">
                  You can review submitted requests here, but approval actions require the inventory approval permission.
                </Alert>
              ) : null}

              <Stack spacing={1.5}>
                {pendingApprovals.length > 0 ? (
                  pendingApprovals.map((request) => (
                    <Paper key={request.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2.5 }}>
                      <Stack spacing={1.2}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box>
                            <Typography variant="subtitle1" fontWeight={800}>
                              {request.reference}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                              {request.kind.toUpperCase()} - {request.itemName}
                            </Typography>
                          </Box>
                          <Chip size="small" color="warning" variant="outlined" label="Submitted" />
                        </Stack>

                        <Box
                          sx={{
                            display: "grid",
                            gap: 1,
                            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                          }}
                        >
                          <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                            <Typography variant="caption" color="text.secondary">
                              Quantity
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.35, fontWeight: 700 }}>
                              {request.quantity} {request.unit}
                            </Typography>
                          </Paper>
                          <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                            <Typography variant="caption" color="text.secondary">
                              Location
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.35, fontWeight: 700 }}>
                              {request.fromLocationName ?? request.toLocationName ?? "Location pending"}
                            </Typography>
                          </Paper>
                        </Box>

                        <Typography variant="body2" color="text.secondary">
                          Requested by {request.requestedByName} - {formatDateTime(request.requestedAt)}
                        </Typography>

                        {request.note ? (
                          <Typography variant="body2" color="text.secondary">
                            {request.note}
                          </Typography>
                        ) : null}

                        {request.attachments.length > 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            {request.attachments.length} request evidence file
                            {request.attachments.length === 1 ? "" : "s"} attached.
                          </Typography>
                        ) : null}

                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {canApproveRequests ? (
                            <>
                              <Button variant="contained" size="small" onClick={() => openDecision("approve", request)}>
                                Approve
                              </Button>
                              <Button
                                variant="outlined"
                                color="error"
                                size="small"
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
            </Stack>
          </Paper>
        </Box>
      </Stack>

      <Dialog open={Boolean(decisionMode && selectedApproval)} onClose={closeDecision} fullWidth maxWidth="sm">
        <DialogTitle>{decisionMode === "approve" ? "Approve request" : "Reject request"}</DialogTitle>
        <DialogContent dividers>
          {selectedApproval ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" fontWeight={800}>
                  {selectedApproval.reference}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                  {selectedApproval.itemName} - {selectedApproval.quantity} {selectedApproval.unit}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.6, display: "block" }}>
                  Requested by {selectedApproval.requestedByName} - {formatDateTime(selectedApproval.requestedAt)}
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

              <RequestEvidenceList
                title="Submitted evidence"
                attachments={selectedApproval.attachments}
                emptyLabel="No evidence was attached to the submitted request."
              />

              <RequestEvidenceUploader
                title={decisionMode === "approve" ? "Approval evidence" : "Rejection evidence"}
                hint="Attach photos or PDFs to support this approval decision."
                attachments={decisionAttachments}
                onChange={setDecisionAttachments}
                disabled={decisionBusy}
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
