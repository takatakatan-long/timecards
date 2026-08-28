/**
 * IndexedDB の薄いラッパー。
 * 端末内はこの DB を正データとし、JSON は Google Drive 同期とバックアップの入出力形式として扱う。
 * 外部ライブラリは使わず、必要な操作だけを Promise 化している。
 */

export const DB_NAME = 'timecards';
export const DB_VERSION = 1;

export const STORE_STAFF = 'staff';
export const STORE_TERMS = 'terms';
export const STORE_RECORDS = 'records';
export const STORE_CONFIG = 'config';

/** config は 1 件しか無いので固定キーで出し入れする */
export const CONFIG_KEY = 'config';

let dbPromise: Promise<IDBDatabase> | null = null;

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_STAFF)) {
    db.createObjectStore(STORE_STAFF, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_TERMS)) {
    db.createObjectStore(STORE_TERMS, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(STORE_RECORDS)) {
    const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' });
    // 日付での絞り込み（ホームの当日分、一覧表の期間指定）
    store.createIndex('date', 'date');
    // 期での絞り込み（集計と明細は必ず期の内側だけで行う）
    store.createIndex('termId', 'termId');
    // 期 × スタッフ（明細の出力単位）
    store.createIndex('termId_staffId', ['termId', 'staffId']);
    // 同じ日・同じスタッフの重複登録を検知するため
    store.createIndex('date_staffId', ['date', 'staffId']);
  }
  if (!db.objectStoreNames.contains(STORE_CONFIG)) {
    db.createObjectStore(STORE_CONFIG);
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('別のタブが古いバージョンの出勤簿を開いています。他のタブを閉じてください。'));
  });
  return dbPromise;
}

/** テストや接続のやり直しのために内部キャッシュを捨てる */
export function resetDbCache(): void {
  dbPromise = null;
}

async function withStore<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeNames, mode);
  const result = await run(tx);
  return new Promise<T>((resolve, reject) => {
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function getAll<T>(storeName: string): Promise<T[]> {
  return withStore(storeName, 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(storeName).getAll() as IDBRequest<T[]>),
  );
}

export function getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore(storeName, 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(storeName).get(key) as IDBRequest<T | undefined>),
  );
}

/** インデックスの範囲検索。キーを省略すると全件返す */
export function getAllByIndex<T>(
  storeName: string,
  indexName: string,
  range?: IDBKeyRange | IDBValidKey,
): Promise<T[]> {
  return withStore(storeName, 'readonly', (tx) =>
    promisifyRequest(
      tx.objectStore(storeName).index(indexName).getAll(range) as IDBRequest<T[]>,
    ),
  );
}

export function put<T>(storeName: string, value: T, key?: IDBValidKey): Promise<void> {
  return withStore(storeName, 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(storeName).put(value, key));
  });
}

/** 複数件をひとつのトランザクションで書く。復元と同期のマージで使う */
export function putAll<T>(storeName: string, values: T[]): Promise<void> {
  return withStore(storeName, 'readwrite', async (tx) => {
    const store = tx.objectStore(storeName);
    for (const value of values) {
      store.put(value);
    }
  });
}

/**
 * 物理削除。論理削除（deleted: true）で足りるため通常は使わない。
 * 復元時に DB を作り直す場合だけ clearStores を経由して使う。
 */
export function clearStores(storeNames: string[]): Promise<void> {
  return withStore(storeNames, 'readwrite', (tx) => {
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
  });
}
