import type {
  ActivateSuperadminRequest,
  BootstrapPayload,
  ChangeOwnPasswordRequest,
  CreateItemRequest,
  CreateItemResponse,
  CreateLocationRequest,
  CreateLocationResponse,
  CreateMarketPriceRequest,
  CreateMarketPriceResponse,
  CreateSupplierRequest,
  CreateSupplierResponse,
  CreateUserRequest,
  DeleteInventoryRequest,
  DeleteItemRequest,
  DeleteLocationRequest,
  DeleteMarketPriceRequest,
  DeleteSnapshotResponse,
  DeleteSupplierRequest,
  EditInventoryRequest,
  InitializeSystemRequest,
  InitializeSystemResponse,
  InventoryActionResponse,
  LoginRequest,
  LoginResponse,
  MarkNotificationReadRequest,
  MutationEnvelope,
  NotificationActionResponse,
  PullResponse,
  ProfileResponse,
  PushResponse,
  ReportSyncFailureRequest,
  RemoveUserRequest,
  ReverseInventoryRequest,
  ResetUserPasswordRequest,
  RolePermissionsResponse,
  SettingsResponse,
  TestTelegramNotificationRequest,
  TestTelegramNotificationResponse,
  UpdateItemRequest,
  UpdateItemResponse,
  UpdateLocationRequest,
  UpdateLocationResponse,
  UpdateMarketPriceRequest,
  UpdateMarketPriceResponse,
  UpdateOwnProfileRequest,
  UpdateSettingsRequest,
  UpdateRolePermissionsRequest,
  UpdateSupplierRequest,
  UpdateSupplierResponse,
  UpdateUserRequest,
  UserAdminResponse,
} from "../../shared/types";

function normalizeErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Request failed.";
  }

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "The server returned an unexpected error page. Please try again. If it keeps happening, check the Worker logs.";
  }

  return trimmed;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(normalizeErrorMessage(message));
  }

  return (await response.json()) as T;
}

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  const response = await fetch("/api/bootstrap", {
    headers: {
      Accept: "application/json",
    },
  });

  return parseJson<BootstrapPayload>(response);
}

export async function pushMutations(
  cursor: number,
  mutations: MutationEnvelope[],
): Promise<PushResponse> {
  const response = await fetch("/api/sync/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cursor, mutations }),
  });

  return parseJson<PushResponse>(response);
}

export async function pullChanges(cursor: number): Promise<PullResponse> {
  const response = await fetch("/api/sync/pull", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cursor }),
  });

  return parseJson<PullResponse>(response);
}

export async function createMarketPriceEntry(
  input: CreateMarketPriceRequest,
): Promise<CreateMarketPriceResponse> {
  const response = await fetch("/api/market-prices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<CreateMarketPriceResponse>(response);
}

export async function createItemRecord(input: CreateItemRequest): Promise<CreateItemResponse> {
  const response = await fetch("/api/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<CreateItemResponse>(response);
}

export async function updateItemRecord(input: UpdateItemRequest): Promise<UpdateItemResponse> {
  const response = await fetch("/api/items", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UpdateItemResponse>(response);
}

export async function deleteItemRecord(input: DeleteItemRequest): Promise<DeleteSnapshotResponse> {
  const response = await fetch("/api/items/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<DeleteSnapshotResponse>(response);
}

export async function createSupplierRecord(
  input: CreateSupplierRequest,
): Promise<CreateSupplierResponse> {
  const response = await fetch("/api/suppliers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<CreateSupplierResponse>(response);
}

export async function updateSupplierRecord(
  input: UpdateSupplierRequest,
): Promise<UpdateSupplierResponse> {
  const response = await fetch("/api/suppliers", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UpdateSupplierResponse>(response);
}

export async function deleteSupplierRecord(
  input: DeleteSupplierRequest,
): Promise<DeleteSnapshotResponse> {
  const response = await fetch("/api/suppliers/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<DeleteSnapshotResponse>(response);
}

export async function createLocationRecord(
  input: CreateLocationRequest,
): Promise<CreateLocationResponse> {
  const response = await fetch("/api/locations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<CreateLocationResponse>(response);
}

export async function updateLocationRecord(
  input: UpdateLocationRequest,
): Promise<UpdateLocationResponse> {
  const response = await fetch("/api/locations", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UpdateLocationResponse>(response);
}

export async function deleteLocationRecord(
  input: DeleteLocationRequest,
): Promise<DeleteSnapshotResponse> {
  const response = await fetch("/api/locations/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<DeleteSnapshotResponse>(response);
}

export async function updateMarketPriceEntry(
  input: UpdateMarketPriceRequest,
): Promise<UpdateMarketPriceResponse> {
  const response = await fetch("/api/market-prices", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UpdateMarketPriceResponse>(response);
}

export async function deleteMarketPriceEntry(
  input: DeleteMarketPriceRequest,
): Promise<DeleteSnapshotResponse> {
  const response = await fetch("/api/market-prices/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<DeleteSnapshotResponse>(response);
}

export async function reverseInventoryRequestEntry(
  input: ReverseInventoryRequest,
): Promise<InventoryActionResponse> {
  const response = await fetch("/api/inventory/reverse", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<InventoryActionResponse>(response);
}

export async function editInventoryRequestEntry(
  input: EditInventoryRequest,
): Promise<InventoryActionResponse> {
  const response = await fetch("/api/inventory/edit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<InventoryActionResponse>(response);
}

export async function deleteInventoryRequestEntry(
  input: DeleteInventoryRequest,
): Promise<InventoryActionResponse> {
  const response = await fetch("/api/inventory/delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<InventoryActionResponse>(response);
}

export async function initializeSystem(
  input: InitializeSystemRequest,
): Promise<InitializeSystemResponse> {
  const response = await fetch("/api/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<InitializeSystemResponse>(response);
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<LoginResponse>(response);
}

export async function activateSuperadmin(
  input: ActivateSuperadminRequest,
): Promise<LoginResponse> {
  const response = await fetch("/api/auth/activate-superadmin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<LoginResponse>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
  });

  await parseJson<{ ok: boolean }>(response);
}

export async function updateOwnProfile(input: UpdateOwnProfileRequest): Promise<ProfileResponse> {
  const response = await fetch("/api/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<ProfileResponse>(response);
}

export async function changeOwnPassword(
  input: ChangeOwnPasswordRequest,
): Promise<ProfileResponse> {
  const response = await fetch("/api/profile/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<ProfileResponse>(response);
}

export async function createUser(input: CreateUserRequest): Promise<UserAdminResponse> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UserAdminResponse>(response);
}

export async function updateUser(input: UpdateUserRequest): Promise<UserAdminResponse> {
  const response = await fetch("/api/users", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UserAdminResponse>(response);
}

export async function updateRolePermissions(
  input: UpdateRolePermissionsRequest,
): Promise<RolePermissionsResponse> {
  const response = await fetch("/api/roles/permissions", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<RolePermissionsResponse>(response);
}

export async function updateSettings(input: UpdateSettingsRequest): Promise<SettingsResponse> {
  const response = await fetch("/api/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<SettingsResponse>(response);
}

export async function markNotificationRead(
  input: MarkNotificationReadRequest,
): Promise<NotificationActionResponse> {
  const response = await fetch("/api/notifications/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<NotificationActionResponse>(response);
}

export async function markAllNotificationsRead(): Promise<NotificationActionResponse> {
  const response = await fetch("/api/notifications/read-all", {
    method: "POST",
  });

  return parseJson<NotificationActionResponse>(response);
}

export async function reportSyncFailure(
  input: ReportSyncFailureRequest,
): Promise<NotificationActionResponse> {
  const response = await fetch("/api/notifications/report-sync-failure", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<NotificationActionResponse>(response);
}

export async function sendTestTelegramNotification(
  input: TestTelegramNotificationRequest,
): Promise<TestTelegramNotificationResponse> {
  const response = await fetch("/api/notifications/test-telegram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<TestTelegramNotificationResponse>(response);
}

export async function resetUserPassword(
  input: ResetUserPasswordRequest,
): Promise<UserAdminResponse> {
  const response = await fetch("/api/users/reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UserAdminResponse>(response);
}

export async function removeUser(input: RemoveUserRequest): Promise<UserAdminResponse> {
  const response = await fetch("/api/users/remove", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<UserAdminResponse>(response);
}

export function openRealtimeSocket(): WebSocket {
  const socketUrl = new URL("/ws", window.location.origin);
  socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(socketUrl.toString());
}
