import { DurableObject } from "cloudflare:workers";
import {
  activateLegacySuperadminInD1,
  applyMutationsToD1,
  authenticateUserInD1,
  changeOwnPasswordInD1,
  createUserInD1,
  createMarketPriceEntryInD1,
  ensureDatabaseReady,
  initializeSystemInD1,
  isSystemInitialized,
  loadBootstrapPayload,
  loadCurrentCursor,
  loadUserIdForSessionToken,
  logoutSessionInD1,
  pullChangesFromD1,
  removeUserInD1,
  resetUserPasswordInD1,
  updateOwnProfileInD1,
  updateUserInD1,
} from "./lib/database";
import type {
  ActivateSuperadminRequest,
  ChangeOwnPasswordRequest,
  CreateUserRequest,
  CreateMarketPriceRequest,
  InitializeSystemRequest,
  LoginRequest,
  RemoveUserRequest,
  ResetUserPasswordRequest,
  PullRequest,
  PushRequest,
  RealtimeMessage,
  UpdateOwnProfileRequest,
  UpdateUserRequest,
} from "../shared/types";

export interface Env {
  ASSETS: Fetcher;
  OMNISTOCK_DB: D1Database;
  OMNISTOCK_HUB: DurableObjectNamespace<OmniStockHub>;
}

const SESSION_COOKIE = "omnistock_session";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function sessionCookieHeader(request: Request, token: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${secure}`;
}

function clearSessionCookieHeader(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const stub = env.OMNISTOCK_HUB.getByName("primary");
      const proxiedUrl = new URL(request.url);
      proxiedUrl.pathname = url.pathname.replace("/api", "") || "/";
      return stub.fetch(new Request(proxiedUrl.toString(), request));
    }

    if (url.pathname === "/ws") {
      const stub = env.OMNISTOCK_HUB.getByName("primary");
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class OmniStockHub extends DurableObject<Env> {
  private initialized = false;
  private latestCursor = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await ensureDatabaseReady(this.env.OMNISTOCK_DB);
    this.latestCursor = await loadCurrentCursor(this.env.OMNISTOCK_DB);
    this.initialized = true;
  }

  private broadcast(message: RealtimeMessage) {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // Ignore stale sockets; Durable Objects will clean them up.
      }
    }
  }

  private async requireUserId(request: Request): Promise<string> {
    const sessionToken = readCookie(request, SESSION_COOKIE);
    const userId = sessionToken
      ? await loadUserIdForSessionToken(this.env.OMNISTOCK_DB, sessionToken)
      : null;

    if (!userId) {
      throw new Error("Authentication required.");
    }

    return userId;
  }

  private async handleBootstrap(request: Request): Promise<Response> {
    const initialized = await isSystemInitialized(this.env.OMNISTOCK_DB);
    if (!initialized) {
      return json(await loadBootstrapPayload(this.env.OMNISTOCK_DB));
    }

    try {
      const userId = await this.requireUserId(request);
      return json(await loadBootstrapPayload(this.env.OMNISTOCK_DB, userId));
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }
  }

  private async handlePull(request: Request): Promise<Response> {
    try {
      await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<PullRequest>(request);
    const response = await pullChangesFromD1(this.env.OMNISTOCK_DB, Number(body.cursor ?? 0));
    this.latestCursor = response.cursor;
    return json(response);
  }

  private async handlePush(request: Request): Promise<Response> {
    try {
      await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<PushRequest>(request);
    const response = await this.ctx.blockConcurrencyWhile(() =>
      applyMutationsToD1(this.env.OMNISTOCK_DB, body.mutations ?? []),
    );
    this.latestCursor = response.cursor;

    for (const event of response.events) {
      this.broadcast({ type: "event", event });
    }

    return json(response);
  }

  private async handleCreateMarketPrice(request: Request): Promise<Response> {
    let actorId = "";
    try {
      actorId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<CreateMarketPriceRequest>(request);
    const response = await this.ctx.blockConcurrencyWhile(() =>
      createMarketPriceEntryInD1(this.env.OMNISTOCK_DB, actorId, {
        itemId: body.itemId,
        category: body.category,
        locationId: body.locationId,
        supplierId: body.supplierId,
        quotedPrice: body.quotedPrice,
        sourceName: body.sourceName,
        marketDate: body.marketDate,
        note: body.note,
      }),
    );

    this.broadcast({
      type: "snapshot-refresh",
      scope: "market-prices",
      triggeredAt: response.entry.createdAt,
    });

    return json(response);
  }

  private async handleLogin(request: Request): Promise<Response> {
    const body = await readJson<LoginRequest>(request);
    const result = await this.ctx.blockConcurrencyWhile(() =>
      authenticateUserInD1(this.env.OMNISTOCK_DB, body),
    );

    return new Response(JSON.stringify(result.response), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": sessionCookieHeader(request, result.token),
      },
    });
  }

  private async handleActivateSuperadmin(request: Request): Promise<Response> {
    const body = await readJson<ActivateSuperadminRequest>(request);
    const result = await this.ctx.blockConcurrencyWhile(() =>
      activateLegacySuperadminInD1(this.env.OMNISTOCK_DB, body),
    );

    return new Response(JSON.stringify(result.response), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": sessionCookieHeader(request, result.token),
      },
    });
  }

  private async handleLogout(request: Request): Promise<Response> {
    const sessionToken = readCookie(request, SESSION_COOKIE);
    if (sessionToken) {
      await logoutSessionInD1(this.env.OMNISTOCK_DB, sessionToken);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": clearSessionCookieHeader(request),
      },
    });
  }

  private async handleUpdateOwnProfile(request: Request): Promise<Response> {
    let userId = "";
    try {
      userId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<UpdateOwnProfileRequest>(request);
    return json(
      await this.ctx.blockConcurrencyWhile(() =>
        updateOwnProfileInD1(this.env.OMNISTOCK_DB, userId, body),
      ),
    );
  }

  private async handleChangeOwnPassword(request: Request): Promise<Response> {
    let userId = "";
    try {
      userId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<ChangeOwnPasswordRequest>(request);
    const result = await this.ctx.blockConcurrencyWhile(() =>
      changeOwnPasswordInD1(this.env.OMNISTOCK_DB, userId, body),
    );

    return new Response(JSON.stringify(result.response), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "set-cookie": sessionCookieHeader(request, result.token),
      },
    });
  }

  private async handleCreateUser(request: Request): Promise<Response> {
    let actorId = "";
    try {
      actorId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<CreateUserRequest>(request);
    return json(
      await this.ctx.blockConcurrencyWhile(() =>
        createUserInD1(this.env.OMNISTOCK_DB, actorId, body),
      ),
    );
  }

  private async handleUpdateUser(request: Request): Promise<Response> {
    let actorId = "";
    try {
      actorId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<UpdateUserRequest>(request);
    return json(
      await this.ctx.blockConcurrencyWhile(() =>
        updateUserInD1(this.env.OMNISTOCK_DB, actorId, body),
      ),
    );
  }

  private async handleResetUserPassword(request: Request): Promise<Response> {
    let actorId = "";
    try {
      actorId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<ResetUserPasswordRequest>(request);
    return json(
      await this.ctx.blockConcurrencyWhile(() =>
        resetUserPasswordInD1(this.env.OMNISTOCK_DB, actorId, body),
      ),
    );
  }

  private async handleRemoveUser(request: Request): Promise<Response> {
    let actorId = "";
    try {
      actorId = await this.requireUserId(request);
    } catch {
      return new Response("Authentication required.", { status: 401 });
    }

    const body = await readJson<RemoveUserRequest>(request);
    return json(
      await this.ctx.blockConcurrencyWhile(() =>
        removeUserInD1(this.env.OMNISTOCK_DB, actorId, body),
      ),
    );
  }

  private async handleInitialize(request: Request): Promise<Response> {
    const body = await readJson<InitializeSystemRequest>(request);
    const response = await this.ctx.blockConcurrencyWhile(() =>
      initializeSystemInD1(this.env.OMNISTOCK_DB, body),
    );
    this.latestCursor = await loadCurrentCursor(this.env.OMNISTOCK_DB);
    return json(response);
  }

  private async handleHealth(): Promise<Response> {
    this.latestCursor = await loadCurrentCursor(this.env.OMNISTOCK_DB);
    return json({
      ok: true,
      cursor: this.latestCursor,
      realtimeSockets: this.ctx.getWebSockets().length,
    });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade.", { status: 426 });
    }

    const sessionToken = readCookie(request, SESSION_COOKIE);
    const userId = sessionToken
      ? await loadUserIdForSessionToken(this.env.OMNISTOCK_DB, sessionToken)
      : null;
    if (!userId) {
      return new Response("Authentication required.", { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(
      JSON.stringify({
        type: "hello",
        cursor: this.latestCursor,
      } satisfies RealtimeMessage),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/bootstrap") {
      return this.handleBootstrap(request);
    }

    if (request.method === "POST" && url.pathname === "/sync/pull") {
      return this.handlePull(request);
    }

    if (request.method === "POST" && url.pathname === "/sync/push") {
      return this.handlePush(request);
    }

    if (request.method === "POST" && url.pathname === "/market-prices") {
      return this.handleCreateMarketPrice(request);
    }

    if (request.method === "POST" && url.pathname === "/auth/login") {
      return this.handleLogin(request);
    }

    if (request.method === "POST" && url.pathname === "/auth/activate-superadmin") {
      return this.handleActivateSuperadmin(request);
    }

    if (request.method === "POST" && url.pathname === "/auth/logout") {
      return this.handleLogout(request);
    }

    if (request.method === "PATCH" && url.pathname === "/profile") {
      return this.handleUpdateOwnProfile(request);
    }

    if (request.method === "POST" && url.pathname === "/profile/change-password") {
      return this.handleChangeOwnPassword(request);
    }

    if (request.method === "POST" && url.pathname === "/users") {
      return this.handleCreateUser(request);
    }

    if (request.method === "PATCH" && url.pathname === "/users") {
      return this.handleUpdateUser(request);
    }

    if (request.method === "POST" && url.pathname === "/users/reset-password") {
      return this.handleResetUserPassword(request);
    }

    if (request.method === "POST" && url.pathname === "/users/remove") {
      return this.handleRemoveUser(request);
    }

    if (request.method === "POST" && url.pathname === "/initialize") {
      return this.handleInitialize(request);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return this.handleHealth();
    }

    if (url.pathname === "/ws") {
      return this.handleWebSocket(request);
    }

    return new Response("Not found.", { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      return;
    }

    if (message.toLowerCase() === "ping") {
      ws.send(
        JSON.stringify({
          type: "pong",
          cursor: this.latestCursor,
        } satisfies RealtimeMessage),
      );
    }
  }
}
