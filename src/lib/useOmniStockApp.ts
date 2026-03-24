import { useEffect, useRef, useState } from "react";
import { applyMutation, applySyncEvents } from "../../shared/operations";
import { createEmptySnapshot } from "../../shared/seed";
import { buildBootstrapPayload } from "../../shared/selectors";
import type {
  BootstrapPayload,
  ChangeOwnPasswordRequest,
  CreateMarketPriceRequest,
  CreateUserRequest,
  InitializeSystemRequest,
  MutationEnvelope,
  MutationPayload,
  OutboxRecord,
  RealtimeMessage,
  RequestKind,
  ResetUserPasswordRequest,
  UpdateOwnProfileRequest,
  UpdateUserRequest,
} from "../../shared/types";
import {
  activateSuperadmin,
  changeOwnPassword,
  createMarketPriceEntry,
  createUser,
  fetchBootstrap,
  initializeSystem,
  login,
  logout,
  openRealtimeSocket,
  pullChanges,
  pushMutations,
  removeUser,
  resetUserPassword,
  updateOwnProfile,
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
  const lastUserIdRef = useRef(safeLastUserId());

  function clearPayload() {
    payloadRef.current = null;
    setPayload(null);
  }

  function rememberPayload(nextPayload: BootstrapPayload, source: SyncState["source"]) {
    const normalizedPayload = normalizePayload(nextPayload);
    payloadRef.current = normalizedPayload;
    setPayload(normalizedPayload);
    setAuthRequired(false);
    lastUserIdRef.current = normalizedPayload.currentUser.id;
    window.localStorage.setItem(LAST_USER_ID_KEY, normalizedPayload.currentUser.id);
    void saveCachedBootstrap({
      userId: normalizedPayload.currentUser.id,
      payload: normalizedPayload,
      cachedAt: new Date().toISOString(),
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
      lastSyncedAt: syncedAt ?? new Date().toISOString(),
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
        lastSyncedAt: new Date().toISOString(),
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
        lastSyncedAt: new Date().toISOString(),
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
        setSyncState((current) => ({
          ...current,
          error:
            error instanceof Error ? error.message : "Could not sync queued changes right now.",
        }));
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
      lastSyncedAt: new Date().toISOString(),
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
      lastSyncedAt: new Date().toISOString(),
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

    const createdAt = new Date().toISOString();
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
      lastSyncedAt: lastSyncedAt ?? new Date().toISOString(),
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

  async function resetAccountPassword(input: ResetUserPasswordRequest) {
    const response = await resetUserPassword(input);
    await applyAdminSnapshot(response.snapshot);
  }

  async function updateProfile(input: UpdateOwnProfileRequest) {
    const response = await updateOwnProfile(input);
    rememberPayload(response.payload, "server");
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: new Date().toISOString(),
      error: undefined,
    }));
    await refreshQueueCount(response.payload.currentUser.id);
  }

  async function changeProfilePassword(input: ChangeOwnPasswordRequest) {
    const response = await changeOwnPassword(input);
    rememberPayload(response.payload, "server");
    setSyncState((current) => ({
      ...current,
      lastSyncedAt: new Date().toISOString(),
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
    createMarketPrice,
    initializeApp,
    updateProfile,
    changeProfilePassword,
    createUserAccount,
    updateUserAccount,
    resetAccountPassword,
    removeUserAccount,
  };
}
