import type {
  ActivateSuperadminRequest,
  BootstrapPayload,
  ChangeOwnPasswordRequest,
  CreateUserRequest,
  CreateMarketPriceRequest,
  CreateMarketPriceResponse,
  InitializeSystemRequest,
  InitializeSystemResponse,
  LoginRequest,
  LoginResponse,
  PullResponse,
  PushResponse,
  RemoveUserRequest,
  ResetUserPasswordRequest,
  UpdateOwnProfileRequest,
  UpdateUserRequest,
  ProfileResponse,
  UserAdminResponse,
  MutationEnvelope,
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
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return new WebSocket(`${protocol}//${window.location.host}/ws`);
}
