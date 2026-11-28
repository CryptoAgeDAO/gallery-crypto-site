'use client';
// この端末に立体（.glb）を保存しておく場所（ブラウザの IndexedDB）。
// スキャンした服の立体をここに入れ、ショールームの「スキャン」の台で読み出して並べる。サーバーには送らない。
const DB = 'gc-models', STORE = 'glb';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((res, rej) => { const q = fn(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const putModel = (key: string, data: ArrayBuffer) => run('readwrite', (s) => s.put(data, key));
export const getModel = (key: string) => run<ArrayBuffer | undefined>('readonly', (s) => s.get(key) as IDBRequest<ArrayBuffer | undefined>);
export const delModel = (key: string) => run('readwrite', (s) => s.delete(key));
export const listModels = () => run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
