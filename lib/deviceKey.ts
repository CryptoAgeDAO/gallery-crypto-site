'use client';

// 創業者の端末の鍵（ECDSA P-256）。端末の中で作り、「取り出し不可」として保存する。
// ページの中からも秘密の部分は読み出せない（署名に使うことだけができる）。
import { PROTOCOL } from './gcpp';

const DB = 'gc-founder';
const STORE = 'keys';
const ID = 'device';
export type DeviceKey = { pub: string; priv: CryptoKey; created: string };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...Array.from(new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((res, rej) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export const deviceSupported = () => typeof indexedDB !== 'undefined' && Boolean(globalThis.crypto?.subtle);

export async function getDeviceKey(): Promise<DeviceKey | null> {
  try {
    return ((await tx('readonly', (s) => s.get(ID))) as DeviceKey) || null;
  } catch {
    return null;
  }
}

export async function createDeviceKey(): Promise<DeviceKey> {
  const existing = await getDeviceKey();
  if (existing) return existing;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const pub = hex(await crypto.subtle.exportKey('raw', kp.publicKey));
  const k: DeviceKey = { pub, priv: kp.privateKey, created: new Date().toISOString() };
  await tx('readwrite', (s) => s.put(k, ID));
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  return k;
}

export async function forgetDeviceKey() {
  await tx('readwrite', (s) => s.delete(ID));
}

export async function signHash(priv: CryptoKey, hash: string): Promise<string> {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(`${PROTOCOL}:${hash}`));
  return hex(sig);
}

// オフラインの復旧鍵：ファイルとして書き出し、USB メモリや紙で保管する（このパソコンやクラウドに残さない）
export async function createRecoveryKey(): Promise<{ pub: string; file: string }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = hex(await crypto.subtle.exportKey('raw', kp.publicKey));
  const pkcs8 = b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const file = JSON.stringify({ type: 'gallery-crypto-recovery-key', protocol: PROTOCOL, pub, pkcs8, created: new Date().toISOString(), note: 'Keep offline. Anyone with this file and the admin login can approve new devices.' }, null, 2);
  return { pub, file };
}
export async function importRecoveryKey(text: string): Promise<{ pub: string; priv: CryptoKey }> {
  const j = JSON.parse(text);
  if (j.type !== 'gallery-crypto-recovery-key' || !j.pkcs8 || !j.pub) throw new Error('Not a recovery key file');
  const priv = await crypto.subtle.importKey('pkcs8', unb64(j.pkcs8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { pub: j.pub, priv };
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
