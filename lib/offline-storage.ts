/** Almacenamiento local durable para la operación offline de BOOM POS.
 * IndexedDB es el almacenamiento principal. localStorage se conserva como fallback
 * y para migrar las colas creadas por la fase 1.
 */
export type OfflineSaleRecord = {
  localId: string;
  companyId: string;
  args: { p_idempotency_key: string; p_items: { product_id: string; quantity: number }[] };
  customer: string;
  docType: number;
  createdAt: string;
  status: "queued" | "syncing";
  lastError?: string;
};

type CatalogRecord = { companyId: string; products: unknown[]; savedAt: string };
const DB_NAME = "boom-pos-offline";
const DB_VERSION = 1;
const SALES_STORE = "sales";
const CATALOG_STORE = "catalogs";
const legacyQueueKey = (companyId: string) => `boom-pos:offline-sales:${companyId}`;
const legacyCatalogKey = (companyId: string) => `boom-pos:catalog:${companyId}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SALES_STORE)) db.createObjectStore(SALES_STORE, { keyPath: "localId" });
      if (!db.objectStoreNames.contains(CATALOG_STORE)) db.createObjectStore(CATALOG_STORE, { keyPath: "companyId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
    request.onblocked = () => reject(new Error("La actualización del almacenamiento está bloqueada por otra pestaña"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Error de almacenamiento local"));
  });
}

async function idbAllSales(): Promise<OfflineSaleRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(SALES_STORE, "readonly");
    return await requestResult(tx.objectStore(SALES_STORE).getAll()) as OfflineSaleRecord[];
  } finally { db.close(); }
}

export async function getOfflineSales(companyId: string): Promise<OfflineSaleRecord[]> {
  try {
    const all = await idbAllSales();
    const scoped = all.filter((sale) => sale.companyId === companyId && sale.args?.p_idempotency_key);
    // Migra las ventas de la fase 1 que todavía no estén en IndexedDB.
    let legacy: OfflineSaleRecord[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(legacyQueueKey(companyId)) || "[]");
      if (Array.isArray(raw)) legacy = raw.filter((sale) => sale?.companyId === companyId && sale?.args?.p_idempotency_key);
    } catch { /* se conserva la cola IDB aunque la copia antigua esté dañada */ }
    const known = new Set(scoped.map((sale) => sale.localId));
    const toMigrate = legacy.filter((sale) => !known.has(sale.localId));
    if (toMigrate.length) {
      const db = await openDb();
      try {
        const tx = db.transaction(SALES_STORE, "readwrite");
        const store = tx.objectStore(SALES_STORE);
        toMigrate.forEach((sale) => store.put({ ...sale, status: "queued" }));
        await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
      } finally { db.close(); }
    }
    const result = [...scoped, ...toMigrate];
    // Refresca el respaldo legado para facilitar recuperación manual.
    try { localStorage.setItem(legacyQueueKey(companyId), JSON.stringify(result)); } catch { /* IDB sigue siendo la fuente principal */ }
    return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    try {
      const raw = JSON.parse(localStorage.getItem(legacyQueueKey(companyId)) || "[]");
      return Array.isArray(raw) ? raw.filter((sale) => sale?.companyId === companyId && sale?.args?.p_idempotency_key) : [];
    } catch { return []; }
  }
}

export async function saveOfflineSales(companyId: string, sales: OfflineSaleRecord[]): Promise<void> {
  const scoped = sales.filter((sale) => sale.companyId === companyId);
  // IndexedDB es la fuente principal; localStorage queda como respaldo/migración.
  let legacySaved = false;
  try { localStorage.setItem(legacyQueueKey(companyId), JSON.stringify(scoped)); legacySaved = true; } catch { /* se intenta persistir en IndexedDB */ }
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(SALES_STORE, "readwrite");
      const store = tx.objectStore(SALES_STORE);
      const allRequest = store.getAll();
      allRequest.onsuccess = () => {
        (allRequest.result as OfflineSaleRecord[])
          .filter((sale) => sale.companyId === companyId)
          .forEach((sale) => store.delete(sale.localId));
        scoped.forEach((sale) => store.put(sale));
      };
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
  } catch (error) {
    if (!legacySaved) throw error;
  }
}

export async function saveOfflineCatalog(companyId: string, products: unknown[]): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(CATALOG_STORE, "readwrite");
      tx.objectStore(CATALOG_STORE).put({ companyId, products, savedAt: new Date().toISOString() } satisfies CatalogRecord);
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    } finally { db.close(); }
  } catch {
    localStorage.setItem(legacyCatalogKey(companyId), JSON.stringify(products));
  }
  try { localStorage.setItem(legacyCatalogKey(companyId), JSON.stringify(products)); } catch { /* IDB tiene el catálogo */ }
}

export async function getOfflineCatalog<T>(companyId: string): Promise<T[] | null> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(CATALOG_STORE, "readonly");
      const record = await requestResult(tx.objectStore(CATALOG_STORE).get(companyId)) as CatalogRecord | undefined;
      if (record && Array.isArray(record.products)) return record.products as T[];
    } finally { db.close(); }
  } catch { /* fallback de fase 1 */ }
  try {
    const value = JSON.parse(localStorage.getItem(legacyCatalogKey(companyId)) || "null");
    return Array.isArray(value) ? value as T[] : null;
  } catch { return null; }
}
