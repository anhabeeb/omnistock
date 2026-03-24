import type { CachedBootstrapRecord, OutboxRecord } from "../../shared/types";

const DATABASE_NAME = "omnistock-offline";
const DATABASE_VERSION = 1;
const CACHE_STORE = "cache";
const OUTBOX_STORE = "outbox";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: "userId" });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = database.createObjectStore(OUTBOX_STORE, {
          keyPath: "clientMutationId",
        });
        store.createIndex("actorId", "actorId", { unique: false });
        store.createIndex("queuedAt", "queuedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);

  try {
    const result = await runner(store);
    await transactionToPromise(transaction);
    return result;
  } finally {
    database.close();
  }
}

export async function getCachedBootstrap(
  userId: string,
): Promise<CachedBootstrapRecord | undefined> {
  return withStore(CACHE_STORE, "readonly", async (store) => {
    return requestToPromise<CachedBootstrapRecord | undefined>(store.get(userId));
  });
}

export async function saveCachedBootstrap(record: CachedBootstrapRecord): Promise<void> {
  await withStore(CACHE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put(record));
  });
}

export async function removeCachedBootstrap(userId: string): Promise<void> {
  await withStore(CACHE_STORE, "readwrite", async (store) => {
    await requestToPromise(store.delete(userId));
  });
}

export async function queueMutation(record: OutboxRecord): Promise<void> {
  await withStore(OUTBOX_STORE, "readwrite", async (store) => {
    await requestToPromise(store.put(record));
  });
}

export async function listOutbox(actorId: string): Promise<OutboxRecord[]> {
  return withStore(OUTBOX_STORE, "readonly", async (store) => {
    const request = store.index("actorId").getAll(actorId);
    const results = (await requestToPromise(request)) as OutboxRecord[];
    return results.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  });
}

export async function countOutbox(actorId: string): Promise<number> {
  const records = await listOutbox(actorId);
  return records.length;
}

export async function removeOutbox(clientMutationIds: string[]): Promise<void> {
  await withStore(OUTBOX_STORE, "readwrite", async (store) => {
    for (const clientMutationId of clientMutationIds) {
      await requestToPromise(store.delete(clientMutationId));
    }
  });
}
