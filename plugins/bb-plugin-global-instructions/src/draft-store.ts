import type { InstructionsSnapshot } from "./contract";

export const DRAFT_DATABASE = "bb-global-instructions-drafts-v1";
export const DRAFT_SIGNAL = "bb:global-instructions:draft-change:v1";
export type EditorMode = "rich" | "plain";
export interface StoredDraft {
  version: 1;
  id: string;
  base: InstructionsSnapshot;
  instructions: string;
  mode: EditorMode;
}

function decode(value: unknown): StoredDraft | null {
  if (value === undefined) return null;
  if (typeof value !== "object" || value === null) throw new Error("The stored draft could not be read.");
  const record = value as Partial<StoredDraft>;
  const base = record.base;
  if (record.version !== 1 || typeof record.id !== "string" || typeof record.instructions !== "string"
    || (record.mode !== "rich" && record.mode !== "plain") || !base
    || typeof base.instructions !== "string" || typeof base.revision !== "string" || typeof base.path !== "string") {
    throw new Error("The stored draft could not be read.");
  }
  return record as StoredDraft;
}

export class DraftStore {
  private database?: Promise<IDBDatabase>;
  private pending: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, StoredDraft | null>();
  private uncommitted = new Set<string>();
  private listeners = new Set<() => void>();

  constructor(private readonly name = DRAFT_DATABASE) {}

  private open() {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (!globalThis.indexedDB) { reject(new Error("Local draft storage is unavailable.")); return; }
        const request = indexedDB.open(this.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "base.path" });
        request.onerror = () => reject(request.error ?? new Error("Local draft storage is unavailable."));
        request.onblocked = () => reject(new Error("Local draft storage is busy. Close other bb windows and retry."));
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); this.database = undefined; };
          resolve(request.result);
        };
      }).catch((error: unknown) => { this.database = undefined; throw error; });
    }
    return this.database;
  }

  private async transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("drafts", mode);
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("The draft could not be stored locally."));
      work(transaction.objectStore("drafts"), (value) => { result = value; });
    });
  }

  private notify(durable = false) {
    this.listeners.forEach((listener) => listener());
    if (durable) {
      try { localStorage.setItem(DRAFT_SIGNAL, crypto.randomUUID()); } catch { /* IndexedDB remains the durable store. */ }
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  invalidate() {
    for (const path of this.cache.keys()) if (!this.uncommitted.has(path)) this.cache.delete(path);
    this.notify();
  }

  needsProtection() { return this.uncommitted.size > 0; }
  async flush() { await this.pending; }

  async read(path: string): Promise<StoredDraft | null> {
    if (this.cache.has(path)) return this.cache.get(path)!;
    const value = await this.transact<unknown>("readonly", (store, result) => {
      const request = store.get(path);
      request.onsuccess = () => result(request.result);
    });
    const record = decode(value);
    // An edit may have arrived while the read was in flight.
    if (this.cache.has(path)) return this.cache.get(path)!;
    this.cache.set(path, record);
    return record;
  }

  write(record: StoredDraft): Promise<void> {
    const path = record.base.path;
    this.cache.set(path, record);
    this.uncommitted.add(path);
    this.notify();
    const operation = this.pending.then(() => this.transact<void>("readwrite", (store) => { store.put(record); }));
    this.pending = operation.catch(() => {});
    return operation.then(() => {
      if (this.cache.get(path)?.id === record.id) this.uncommitted.delete(path);
      this.notify(true);
    });
  }

  clear(path: string, expectedId?: string): Promise<void> {
    const cached = this.cache.get(path);
    if (expectedId === undefined || cached?.id === expectedId) this.cache.set(path, null);
    this.uncommitted.add(path);
    this.notify();
    const operation = this.pending.then(() => this.transact<boolean>("readwrite", (store, result) => {
      const request = store.get(path);
      request.onsuccess = () => {
        const current: unknown = request.result;
        const matches = expectedId === undefined || current === undefined
          || (typeof current === "object" && current !== null && "id" in current && current.id === expectedId);
        if (matches) store.delete(path);
        result(matches);
      };
    }));
    this.pending = operation.catch(() => {});
    return operation.then((cleared) => {
      if (!cleared) this.cache.delete(path);
      if (!this.cache.get(path)) this.uncommitted.delete(path);
      this.notify(true);
    });
  }

  async hasDrafts(): Promise<boolean> {
    if ([...this.cache.values()].some(Boolean)) return true;
    await this.pending;
    return await this.transact<number>("readonly", (store, result) => {
      const request = store.count();
      request.onsuccess = () => result(request.result);
    }) > 0;
  }

  async close() {
    await this.pending;
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}

export const draftStore = new DraftStore();
