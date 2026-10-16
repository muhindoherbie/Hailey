/**
 * Small IndexedDB cache so previously loaded notes, tasks, projects and the dashboard can be
 * read offline. It is a read-only copy — changes need a connection (the UI says so).
 */
const DB_NAME = 'hailey-cache';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSet(key: string, value: unknown) {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ value, savedAt: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage unavailable (private mode etc.) — caching is best-effort */
  }
}

export async function cacheGet<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function cacheClear() {
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch {
    /* ignore */
  }
}
