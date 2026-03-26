import { useEffect, useRef, useState } from "react";
import { applyMutation, applySyncEvents } from "../../shared/operations";
import { createEmptySnapshot } from "../../shared/seed";
import { buildBootstrapPayload } from "../../shared/selectors";
import type {
  BootstrapPayload,
  ChangeOwnPasswordRequest,
  CreateItemRequest,
  CreateLocationRequest,
  CreateMarketPriceRequest,
  CreateSupplierRequest,
  CreateUserRequest,
  DeleteInventoryRequest,
  DeleteItemRequest,
  DeleteLocationRequest,
  DeleteMarketPriceRequest,
  DeleteSupplierRequest,
  EditInventoryRequest,
  InitializeSystemRequest,
  MutationEnvelope,
  MutationPayload,
  OutboxRecord,
  RealtimeMessage,
  ReverseInventoryRequest,
  RequestKind,
  ResetUserPasswordRequest,
  UpdateRolePermissionsRequest,
  UpdateSettingsRequest,
  UpdateItemRequest,
  UpdateLocationRequest,
  UpdateMarketPriceRequest,
  UpdateOwnProfileRequest,
  UpdateSupplierRequest,
  UpdateUserRequest,
} from "../../shared/types";
import {
  activateSuperadmin,
  changeOwnPassword,
  createItemRecord,
  createLocationRecord,
  createMarketPriceEntry,
  createSupplierRecord,
  createUser,
  deleteInventoryRequestEntry,
  deleteItemRecord,
  deleteLocationRecord,
  deleteMarketPriceEntry,
  deleteSupplierRecord,
  editInventoryRequestEntry,
  fetchBootstrap,
  initializeSystem,
  login,
  logout,
  openRealtimeSocket,
  pullChanges,
  pushMutations,
  reportSyncFailure,
  removeUser,
  reverseInventoryRequestEntry,
  resetUserPassword,
  markAllNotificationsRead,
  markNotificationRead,
  sendTestTelegramNotification,
  updateItemRecord,
  updateLocationRecord,
  updateMarketPriceEntry,
  updateOwnProfile,
  updateSettings,
  updateRolePermissions,
  updateSupplierRecord,
  updateUser,
} from "./client";
import {
  countOutbox,
  getCachedBootstrap,
  listOutbox,
  queueMutation,
  removeCachedBootstrap,
  removeOutbox,
  saveCachedBootstrap,
} from "./indexedDb";
import {
  getCurrentTimestampIso,
  rememberWorkspaceTimePreferences,
} from "./time";

const LAST_USER_ID_KEY = "omnistock:last-user-id";

export interface SyncState {
  loading: boolean;
  online: boolean;
  websocket: "idle" | "connecting" | "connected" | "offline";
  queued: number;
  source: "cache" | "server" | "local";
  lastSyncedAt?: string;
  error?: string;
}

export interface CreateOperationInput extends MutationPayload {
  kind: RequestKind;
}

export interface EditOperationInput extends Omit<EditInventoryRequest, "requestId"> {
  requestId: string;
}

function safeLastUserId(): string {
  return window.localStorage.getItem(LAST_USER_ID_KEY) ?? "";
}

function normalizePayload(nextPayload: BootstrapPayload): BootstrapPayload {
  return {
    ...nextPayload,
    snapshot: {
      ...nextPayload.snapshot,
      marketPrices: nextPayload.snapshot.marketPrices ?? [],
      wasteEntries: nextPayload.snapshot.wasteEntries ?? [],
      notifications: nextPayload.snapshot.notifications ?? [],
    },
    initialization: nextPayload.initialization ?? {
      required: (nextPayload.snapshot.users ?? []).length === 0,
    },
  };
}

function isAuthError(error: unknown): boolean {
  return error instanceof Error && error.message === "Authentication required.";
}

export function useOmniStockApp() {
  const [payload, setPayload] = useState<BootstrapPayload | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>({
    loading: true,
    online: navigator.onLine,
    websocket: navigator.onLine ? "idle" : "offline",
    queued: 0,
    source: "cache",
  });

  const payloadRef = useRef<BootstrapPayload | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingMutationIdsRef = useRef(new Set<string>());
  const lastReportedSyncFailureRef = useRef("");
  const lastUserIdRef = useRef(safeLastUserId());

  function clearPayload() {
    payloadRef.current = null;
    setPayload(null);
  }

  function rememberPayload(nextPayload: BootstrapPayload, source: SyncState["source"]) {
    const normalizedPayload = normalizePayload(nextPayload);
    rememberWorkspaceTimePreferences({
      timeZone: normalizedPayload.snapshot.settings.timezone,
      timeSource: normalizedPayload.snapshot.settings.timeSource,
      serverGeneratedAt:
        source === "server" ? normalizedPayload.snapshot.generatedAt : undefined,
    });
    payloadRef.current = normalizedPayload;
    setPayload(normalizedPayload);
    setAuthRequired(false);
    lastUserIdRef.current = normalizedPayload.currentUser.id;
    window.localStorage.setItem(LAST_USER_ID_KEY, normalizedPayload.currentUser.id);
    void saveCachedBootstrap({
      userId: normalizedPayload.currentUser.id,
      payload: normalizedPayload,
      cachedAt: getCurrentTimestampIso(),
    });
    setSyncState((current) => ({
      ...current,
      source,
    }));
  }

  async function refreshQueueCount(userId: string) {
    const queued = await countOutbox(userId);
    setSyncState((current) => ({ ...current, queued }));
  }

  function closeSocket() {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    socketRef.current = null;
  }

  async function refreshFromServer(syncedAt?: string) {
    if (!navigator.onLine) {
      return;
    }

    const remotePayload = await fetchBootstrap();
    rememberPayload(remotePayload, "server");
    setSyncState((current) => ({
      ...current,
      loading: false,
      online: true,
      lastSyncedAt: syncedAt ?? getCurrentTimestampIso(),
      error: undefined,
    }));
    await refreshQueueCount(remotePayload.currentUser.id);
  }

  async function pullLatest() {
    const currentPayload = payloadRef.current;
    if (!currentPayload || !navigator.onLine || authRequired) {
      return;
    }

    const response = await pullChanges(currentPayload.snapshot.syncCursor);
    const nextSnapshot = response.snapshot
      ? response.snapshot
      : applySyncEvents(currentPayload.snapshot, response.events);

    if (response.snapshot || response.events.length > 0) {
      rememberPayload(buildBootstrapPayload(nextSnapshot, currentPayload.currentUser.id), "server");
      setSyncState((current) => ({
        ...current,
        lastSyncedAt: getCurrentTimestampIso(),
        error: undefined,
      }));
      await refreshQueueCount(currentPayload.currentUser.id);
    }
  }

  async function flushOutbox() {
    const currentPayload = payloadRef.current;
    if (!currentPayload || !navigator.onLine || authRequired) {
      return;
    }

    const queuedMutations = await listOutbox(currentPayload.currentUser.id);
    setSyncState((current) => ({ ...current, queued: queuedMutations.length }));

    if (queuedMutations.length === 0) {
      return;
    }

    try {
      const response = await pushMutations(
        currentPayload.snapshot.syncCursor,
        queuedMutations,
      );
      const rejectedIds = response.rejected.map((entry) => entry.clientMutationId);
      const clearedIds = [...response.appliedMutationIds, ...rejectedIds];
      clearedIds.forEach((mutationId) => pendingMutationIdsRef.current.delete(mutationId));
      await removeOutbox(clearedIds);

      rememberPayload(buildBootstrapPayload(response.snapshot, currentPayload.currentUser.id), "server");
      setSyncState((current) => ({
        ...current,
        lastSyncedAt: getCurrentTimestampIso(),
        error:
          response.rejected.length > 0
            ? response.rejected.map((entry) => entry.reason).join(" | ")
            : undefined,
      }));
    } catch (error) {
      if (isAuthError(error)) {
        closeSocket();
        clearPayload();
        setAuthRequired(true);
      } else {
        const message =
          error instanceof Error ? error.message : "Could not sync queued changes right now.";
        setSyncState((current) => ({
          ...current,
          error: message,
        }));
        const reportKey = `${currentPayload.currentUser.id}:${new Date().toISOString().slice(0, 13)}:${message}`;
        if (lastReportedSyncFailureRef.current !== reportKey) {
          lastReportedSyncFailureRef.current = reportKey;
          void reportSyncFailure({ message })
            .then((response) => {
              rememberPayload(
                buildBootstrapPayload(response.snapshot, currentPayload.currentUser.id),
                "server",
              );
            })
            .catch(() => {
              // Ignore follow-on failures while the system is already degraded.
            });
        }
      }
    } finally {
      if (currentPayload) {
        await refreshQueueCount(currentPayload.currentUser.id);
      }
    }
  }

  function scheduleReconnect() {
    if (reconnectTimerRef.current || !navigator.onLine || authRequired) {
      return;
    }

    const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 8000);
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connectSocket();
    }, delay);
  }

  function handleRealtimeMessage(message: RealtimeMessage) {
    const currentPayload = payloadRef.current;
    if (!currentPayload) {
      return;
    }

    if (message.type === "hello") {
      if (message.cursor > currentPayload.snapshot.syncCursor) {
        void pullLatest();
      }
      return;
    }

    if (message.type === "event") {
      if (pendingMutationIdsRef.current.has(message.event.mutationId)) {
        return;
      }

      const nextSnapshot = applySyncEvents(currentPayload.snapshot, [message.event]);
      rememberPayload(buildBootstrapPayload(nextSnapshot, currentPayload.currentUser.id), "server");
      setSyncState((current) => ({
        ...current,
        lastSyncedAt: message.event.timestamp,
        error: undefined,
      }));
      return;
    }

    if (message.type === "snapshot-refresh") {
      void refreshFromServer(message.triggeredAt).catch((error) => {
        setSyncState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Could not refresh the latest shared snapshot.",
        }));
      });
      return;
    }

    if (message.type === "error") {
      setSyncState((current) => ({ ...current, error: message.message }));
    }
  }

  function connectSocket() {
    const currentPayload = payloadRef.current;
    if (
      !navigator.onLine ||
      !currentPayload ||
      currentPayload.initialization.required ||
      authRequired
    ) {
      return;
    }

    const existingSocket = socketRef.current;
    if (
      existingSocket &&
      (existingSocket.readyState === WebSocket.OPEN ||
        existingSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const socket = openRealtimeSocket();
    socketRef.current = socket;
    setSyncState((current) => ({ ...current, websocket: "connecting" }));

    socket.onopen = () => {
      reconnectAttemptRef.current = 0;
      setSyncState((current) => ({
        ...current,
        websocket: "connected",
        error: undefined,
      }));
      socket.send("ping");
      void pullLatest();
      void flushOutbox();
    };

    socket.onmessage = (event) => {
      try {
        handleRealtimeMessage(JSON.parse(event.data) as RealtimeMessage);
      } catch {
        setSyncState((current) => ({
          ...current,
          error: "Received an unreadable realtime message.",
        }));
      }
    };

    socket.onerror = () => {
      setSyncState((current) => ({
        ...current,
        error: "Realtime connection hit an error and will retry.",
      }));
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setSyncState((current) => ({
        ...current,
        websocket: navigator.onLine ? "idle" : "offline",
      }));
      scheduleReconnect();
    };
  }

  async function hydrate() {
    closeSocket();
    setSyncState((current) => ({
      ...current,
      loading: true,
      online: navigator.onLine,
      websocket: navigator.onLine ? "idle" : "offline",
      error: undefined,
    }));

    const cachedUserId = lastUserIdRef.current;
    const cached = cachedUserId ? await getCachedBootstrap(cachedUserId) : undefined;
    if (cached) {
      rememberPayload(cached.payload, "cache");
      setSyncState((current) => ({
        ...current,
        loading: !navigator.onLine,
        lastSyncedAt: cached.cachedAt,
      }));
    }

    if (!navigator.onLine) {
      if (!cached) {
        rememberPayload(buildBootstrapPayload(createEmptySnapshot()), "local");
      }
      if (payloadRef.current?.currentUser.id) {
        await refreshQueueCount(payloadRef.current.currentUser.id);
      }
      setSyncState((current) => ({
        ...current,
        loading: false,
        online: false,
        websocket: "offline",
      }));
      return;
    }

    try {
      await refreshFromServer();
    } catch (error) {
      if (isAuthError(error)) {
        closeSocket();
        clearPayload();
        setAuthRequired(true);
        setSyncState((current) => ({
          ...current,
          loading: false,
          online: true,
          websocket: "idle",
          error: undefined,
        }));
        return;
      }

      if (!cached) {
        rememberPayload(buildBootstrapPayload(createEmptySnapshot()), "local");
      }
      setSyncState((current) => ({
        ...current,
        loading: false,
        error:
          error instanceof Error ? error.message : "Could not load the latest OmniStock data.",
      }));
    }
  }

  useEffect(() => {
    void hydrate();

    return () => {
      closeSocket();
    };
  }, []);

  useEffect(() => {
    const currentPayload = payloadRef.current;
    if (
      !currentPayload ||
      currentPayload.initialization.required ||
      authRequired ||
      !navigator.onLine ||
      !currentPayload.featureFlags.realtime
    ) {
      return undefined;
    }

    connectSocket();
    return () => {
      closeSocket();
    };
  }, [payload?.currentUser.id, payload?.featureFlags.realtime, authRequired]);

  useEffect(() => {
    function handleOnline() {
      setSyncState((current) => ({
        ...current,
        online: true,
        websocket: "idle",
      }));
      void hydrate().then(() => {
        connectSocket();
        void flushOutbox();
      });
    }

    function handleOffline() {
      closeSocket();
      setSyncState((current) => ({
        ...current,
        online: false,
        websocket: "offline",
      }));
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [authRequired]);

  async function refresh() {
    await hydrate();
    if (navigator.onLine && !authRequired) {
      await flushOutbox();
      await pullLatest();
    }
  }

  async function loginUser(identifier: string, password: string) {
    const response = await login({ identifier, password });
    rememberPayload(response.payload, "server");
    setSyncState((current) => ({
      ...current,
      loading: false,
      online: navigator.onLine,
      lastSyncedAt: getCurrentTimestampIso(),
      error: undefined,
    }));
    await refreshQueueCount(response.payload.currentUser.id);
  }

  async function activateSuperadminPassword(identifier: string, password: string) {
    const response = await activateSuperadmin({ identifier, password });
    rememberPayload(response.payload, "server");
    setSyncState((current) => ({
      ...current,
      loading: false,
      online: navigator.onLine,
      lastSyncedAt: getCurrentTimestampIso(),
      error: undefined,
    }));
    await refreshQueueCount(response.payload.currentUser.id);
  }

  async function logoutUser() {
    const currentUserId = payloadRef.current?.currentUser.id;
    closeSocket();
    await logout();
    if (currentUserId) {
      await removeCachedBootstrap(currentUserId);
    }
    window.localStorage.removeItem(LAST_USER_ID_KEY);
    lastUserIdRef.current = "";
    clearPayload();
    setAuthRequired(true);
    setSyncState({
      loading: false,
      online: navigator.onLine,
      websocket: navigator.onLine ? "idle" : "offline",
      queued: 0,
      source: "local",
    });
  }

  async function createOperation(input: CreateOperationInput) {
    const currentPayload = payloadRef.current;
    if (!currentPayload) {
      throw new Error("OmniStock is still loading.");
    }

    const createdAt = getCurrentTimestampIso();
    const mutation: MutationEnvelope = {
      clientMutationId: crypto.randomUUID(),
      actorId: currentPayload.currentUser.id,
      createdAt,
      kind: input.kind,
      payload: {
        itemId: input.itemId,
        quantity: Number(input.quantity),
        note: input.note,
        barcode: input.barcode,
        supplierId: input.supplierId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        countedQuantity: input.countedQuantity,
        lotCode: input.lotCode,
        expiryDate: input.expiryDate,
        receivedDate: input.receivedDate,
        wasteReason: input.wasteReason,
        wasteShift: input.wasteShift,
        wasteStation: input.wasteStation,
      },
    };

    pendingMutationIdsRef.current.add(mutation.clientMutationId);

    try {
      const optimistic = applyMutation(currentPayload.snapshot, mutation);
      rememberPayload(
        buildBootstrapPayload(optimistic.snapshot, currentPayload.currentUser.id),
        "local",
      );

      const outboxRecord: OutboxRecord = {
        ...mutation,
        queuedAt: createdAt,
      };
      await queueMutation(outboxRecord);
      await refreshQueueCount(currentPayload.currentUser.id);

      if (navigator.onLine) {
        void flushOutbox();
      }

      return optimistic.event.request;
    } catch (error) {
      pendingMutationIdsRef.current.delete(mutation.clientMutationId);
      throw error;
    }
  }

  async function createMarketPrice(input: CreateMarketPriceRequest) {
    const currentPayload = payloadRef.current;
    if (!currentPayload) {
      throw new Error("OmniStock is still loading.");
    }

    if (!navigator.onLine) {
      throw new Error(
        "Market price capture needs an online connection so shared rates stay aligned.",
      );
    }

    const response = await createMarketPriceEntry(input);
    rememberPayload(buildBootstrapPayload(response.snapshot, currentPayload.currentUser.id), "server");
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: response.entry.createdAt,
      error: undefined,
    }));
    return response.entry;
  }

  async function updateMarketPrice(input: UpdateMarketPriceRequest) {
    const response = await updateMarketPriceEntry(input);
    await applyAdminSnapshot(response.snapshot);
    return response.entry;
  }

  async function removeMarketPrice(input: DeleteMarketPriceRequest) {
    const response = await deleteMarketPriceEntry(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function createItem(input: CreateItemRequest) {
    const response = await createItemRecord(input);
    await applyAdminSnapshot(response.snapshot);
    return response.item;
  }

  async function updateItem(input: UpdateItemRequest) {
    const response = await updateItemRecord(input);
    await applyAdminSnapshot(response.snapshot);
    return response.item;
  }

  async function removeItem(input: DeleteItemRequest) {
    const response = await deleteItemRecord(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function createSupplier(input: CreateSupplierRequest) {
    const response = await createSupplierRecord(input);
    await applyAdminSnapshot(response.snapshot);
    return response.supplier;
  }

  async function updateSupplier(input: UpdateSupplierRequest) {
    const response = await updateSupplierRecord(input);
    await applyAdminSnapshot(response.snapshot);
    return response.supplier;
  }

  async function removeSupplier(input: DeleteSupplierRequest) {
    const response = await deleteSupplierRecord(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function createLocation(input: CreateLocationRequest) {
    const response = await createLocationRecord(input);
    await applyAdminSnapshot(response.snapshot);
    return response.location;
  }

  async function updateLocation(input: UpdateLocationRequest) {
    const response = await updateLocationRecord(input);
    await applyAdminSnapshot(response.snapshot);
    return response.location;
  }

  async function removeLocation(input: DeleteLocationRequest) {
    const response = await deleteLocationRecord(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function reverseInventoryRequest(input: ReverseInventoryRequest) {
    const response = await reverseInventoryRequestEntry(input);
    await applyAdminSnapshot(response.snapshot);
    return response.reversalRequest;
  }

  async function editInventoryRequest(input: EditOperationInput) {
    const response = await editInventoryRequestEntry(input);
    await applyAdminSnapshot(response.snapshot);
    return response.replacementRequest;
  }

  async function removeInventoryRequest(input: DeleteInventoryRequest) {
    const response = await deleteInventoryRequestEntry(input);
    await applyAdminSnapshot(response.snapshot);
    return response.reversalRequest;
  }

  async function initializeApp(input: InitializeSystemRequest) {
    if (!navigator.onLine) {
      throw new Error("Initial setup needs an online connection to create the first workspace.");
    }

    await initializeSystem(input);
    const primaryUser = input.users.find((user) => user.role === "superadmin") ?? input.users[0];
    await loginUser(primaryUser.username, primaryUser.password);
  }

  async function applyAdminSnapshot(
    snapshot: BootstrapPayload["snapshot"],
    lastSyncedAt?: string,
  ) {
    const currentPayload = payloadRef.current;
    if (!currentPayload) {
      throw new Error("OmniStock is still loading.");
    }

    rememberPayload(buildBootstrapPayload(snapshot, currentPayload.currentUser.id), "server");
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: lastSyncedAt ?? getCurrentTimestampIso(),
      error: undefined,
    }));
  }

  async function createUserAccount(input: CreateUserRequest) {
    const response = await createUser(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function updateUserAccount(input: UpdateUserRequest) {
    const response = await updateUser(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function updateRolePermissionMatrix(input: UpdateRolePermissionsRequest) {
    const response = await updateRolePermissions(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function updateEnvironmentSettings(input: UpdateSettingsRequest) {
    const response = await updateSettings(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function markNotificationAsRead(notificationId: string) {
    const response = await markNotificationRead({ notificationId });
    await applyAdminSnapshot(response.snapshot);
  }

  async function markEveryNotificationAsRead() {
    const response = await markAllNotificationsRead();
    await applyAdminSnapshot(response.snapshot);
  }

  async function sendTelegramTest(message?: string) {
    return sendTestTelegramNotification({ message });
  }

  async function resetAccountPassword(input: ResetUserPasswordRequest) {
    const response = await resetUserPassword(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function updateProfile(input: UpdateOwnProfileRequest) {
    const response = await updateOwnProfile(input);
    rememberPayload(response.payload, "server");
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: getCurrentTimestampIso(),
      error: undefined,
    }));
    await refreshQueueCount(response.payload.currentUser.id);
  }

  async function changeProfilePassword(input: ChangeOwnPasswordRequest) {
    const response = await changeOwnPassword(input);
    rememberPayload(response.payload, "server");
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: getCurrentTimestampIso(),
      error: undefined,
    }));
    await refreshQueueCount(response.payload.currentUser.id);
  }

  async function removeUserAccount(userId: string) {
    const response = await removeUser({ userId });
    await applyAdminSnapshot(response.snapshot);
  }

  return {
    payload,
    syncState,
    authRequired,
    refresh,
    loginUser,
    activateSuperadminPassword,
    logoutUser,
    createOperation,
    createItem,
    updateItem,
    removeItem,
    createSupplier,
    updateSupplier,
    removeSupplier,
    createLocation,
    updateLocation,
    removeLocation,
    createMarketPrice,
    updateMarketPrice,
    removeMarketPrice,
    reverseInventoryRequest,
    editInventoryRequest,
    removeInventoryRequest,
    initializeApp,
    updateProfile,
    changeProfilePassword,
    createUserAccount,
    updateUserAccount,
    updateEnvironmentSettings,
    updateRolePermissionMatrix,
    resetAccountPassword,
    removeUserAccount,
    markNotificationAsRead,
    markEveryNotificationAsRead,
    sendTelegramTest,
  };
}
