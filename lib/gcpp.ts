// GCPP/2 — Gallery Crypto Provenance Protocol
// ブラウザでもサーバーでも同じ計算をする部分。ネットにつながっていなくても、このファイルの手順だけで検証できる。
//
// 乗っ取られない構造：
//  ・すべての記録に「2つの署名」が必要 — サーバーの鍵（Ed25519）＋ 創業者の端末の鍵（P-256・端末の外に出せない）
//    サーバーが乗っ取られても、端末の鍵がなければ偽の記録は作れない。端末を盗まれても、サーバー側の鍵がなければ作れない。
//  ・創業者の鍵は「鍵の台帳」で管理。鍵の追加・取り消しは、いま有効な鍵の署名がないとできない（乗っ取り犯が自分の鍵を足せない）。
//  ・最初の鍵（台帳の起点）は検証する側が記憶（ピン留め）し、Solana にも刻む。起点がすり替わればすぐ警告が出る。
//  ・記録は1つ前の記録のハッシュを含む鎖。途中の削除・挿入・書き換えは必ず検出される。
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { p256 } from '@noble/curves/p256';

export const PROTOCOL = 'GCPP/2';

export type GcppEntry = {
  protocol: string;
  cert: string;
  seq: number;
  kind: 'seal' | 'event';
  at: string;
  prev: string | null;
  signer: string; // 共同署名した創業者の鍵（P-256 公開鍵・hex）
  data: Record<string, unknown>;
};
export type KeyEntry = {
  protocol: string;
  seq: number;
  kind: 'genesis' | 'add' | 'revoke';
  key: string; // 対象の鍵（P-256 公開鍵・hex）
  label: string;
  at: string;
  prev: string | null;
  signer: string; // 承認した鍵（genesis は自分自身）
};
export type Signed<T> = { entry: T; hash: string; sig: string; cosig: string; issuer: string; anchor_id?: number | null };
export type SignedEntry = Signed<GcppEntry>;
export type SignedKey = Signed<KeyEntry>;
export type Anchor = { id: number; chain: string; root: string; leaves: string[]; tx: string; created_at: string };

// キーを並べ替え、空白なしで書き出す（同じ内容なら必ず同じ文字列になる）
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export const sha256hex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));
export const hashEntry = (e: unknown) => sha256hex(canonical(e));
export const hexToBytes = (h: string) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));
export { bytesToHex };

// Solana と同じ表記（base58）
const Z = BigInt(0), N58 = BigInt(58);
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58encode(b: Uint8Array): string {
  let n = BigInt('0x' + (bytesToHex(b) || '0'));
  let s = '';
  while (n > Z) { s = B58[Number(n % N58)] + s; n /= N58; }
  for (const x of b) { if (x === 0) s = '1' + s; else break; }
  return s;
}
export function b58decode(s: string): Uint8Array {
  let n = Z;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * N58 + BigInt(i); }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = n === Z ? [] : hex.match(/../g)!.map((h) => parseInt(h, 16));
  const zeros = (s.match(/^1*/) || [''])[0].length;
  return new Uint8Array([...new Array(zeros).fill(0), ...body]);
}

// 2つの署名とも「GCPP/2:<ハッシュ>」という文字列に対して行う
export const sigMessage = (hash: string) => utf8ToBytes(`${PROTOCOL}:${hash}`);

export function verifySig(hash: string, sigHex: string, issuer: string): boolean {
  try {
    return ed25519.verify(hexToBytes(sigHex), sigMessage(hash), b58decode(issuer));
  } catch {
    return false;
  }
}
// 端末の鍵（WebCrypto の ECDSA P-256 / SHA-256 / r||s 64バイト）
export function verifyCosig(hash: string, cosigHex: string, keyHex: string): boolean {
  try {
    return p256.verify(hexToBytes(cosigHex), sha256(sigMessage(hash)), hexToBytes(keyHex), { lowS: false });
  } catch {
    return false;
  }
}
export function validP256(keyHex: string): boolean {
  try {
    p256.ProjectivePoint.fromHex(keyHex);
    return /^04[0-9a-f]{128}$/.test(keyHex);
  } catch {
    return false;
  }
}
export const keyId = (keyHex: string) => sha256hex(keyHex).slice(0, 8);

// ── 鍵の台帳 ──
export type KeyState = { key: string; label: string; added: string; revoked: string | null };
export type KeyringCheck = { seq: number; ok: boolean; why?: string };
export function verifyKeyring(list: SignedKey[], issuer: string): { ok: boolean; checks: KeyringCheck[]; keys: Map<string, KeyState>; genesis: string | null } {
  const keys = new Map<string, KeyState>();
  const checks: KeyringCheck[] = [];
  let prev: string | null = null;
  const activeAt = (k: string, at: string) => {
    const s = keys.get(k);
    return Boolean(s && s.added <= at && (!s.revoked || s.revoked > at));
  };
  list.forEach((s, i) => {
    const e = s.entry;
    const h = hashEntry(e);
    let why = '';
    if (h !== s.hash) why = 'contents changed';
    else if (s.issuer !== issuer || !verifySig(h, s.sig, s.issuer)) why = 'server signature invalid';
    else if (!verifyCosig(h, s.cosig, e.signer)) why = 'founder signature invalid';
    else if (e.prev !== prev || e.seq !== i + 1) why = 'chain broken';
    else if (e.protocol !== PROTOCOL) why = 'unknown protocol';
    else if (i === 0 ? !(e.kind === 'genesis' && e.signer === e.key) : e.kind === 'genesis') why = 'only the first key can be the root';
    else if (i > 0 && !activeAt(e.signer, e.at)) why = 'approved by a key that was not active';
    else if (!validP256(e.key)) why = 'not a valid key';
    else if (e.kind !== 'revoke' && keys.has(e.key)) why = 'key already registered';
    else if (e.kind === 'revoke' && !activeAt(e.key, e.at)) why = 'revoking a key that is not active';
    if (!why) {
      if (e.kind === 'revoke') keys.get(e.key)!.revoked = e.at;
      else keys.set(e.key, { key: e.key, label: e.label, added: e.at, revoked: null });
    }
    checks.push({ seq: e.seq, ok: !why, why: why || undefined });
    prev = s.hash;
  });
  return { ok: checks.length > 0 && checks.every((c) => c.ok), checks, keys, genesis: list[0]?.hash ?? null };
}
export function keyActive(keys: Map<string, KeyState>, k: string, at: string): boolean {
  const s = keys.get(k);
  return Boolean(s && s.added <= at && (!s.revoked || s.revoked > at));
}

// ── 作品ごとの記録 ──
export type Check = { seq: number; hashOk: boolean; sigOk: boolean; cosigOk: boolean; chainOk: boolean; issuerOk: boolean };
export const checkOk = (c: Check) => c.hashOk && c.sigOk && c.cosigOk && c.chainOk && c.issuerOk;
export function verifyLog(list: SignedEntry[], issuer: string, keys: Map<string, KeyState>): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  let prev: string | null = null;
  list.forEach((s, i) => {
    const h = hashEntry(s.entry);
    checks.push({
      seq: s.entry.seq,
      hashOk: h === s.hash,
      sigOk: verifySig(h, s.sig, s.issuer),
      cosigOk: verifyCosig(h, s.cosig, s.entry.signer) && keyActive(keys, s.entry.signer, s.entry.at),
      chainOk: s.entry.prev === prev && s.entry.seq === i + 1 && s.entry.protocol === PROTOCOL,
      issuerOk: s.issuer === issuer,
    });
    prev = s.hash;
  });
  return { ok: checks.length > 0 && checks.every(checkOk), checks };
}

// まとめハッシュ（Merkle root）。並べ替えた葉を2つずつ結合してハッシュ、を1つになるまで
export function merkleRoot(leaves: string[]): string {
  if (!leaves.length) return '';
  let lvl = [...leaves].sort();
  while (lvl.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < lvl.length; i += 2) next.push(sha256hex(lvl[i] + (lvl[i + 1] ?? lvl[i])));
    lvl = next;
  }
  return lvl[0];
}

// ── 通信なしで検証できる「小さな証明」（QR・NFC に入る 174 バイト） ──
// serial(4) seq(2) at(4, unix秒) hash(32) sig(64) cosig(64) signerId(4)
export type Compact = { serial: number; seq: number; at: number; hash: string; sig: string; cosig: string; signerId: string };
const b64u = (b: Uint8Array) => {
  let s = '';
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
export function packCompact(c: Compact): string {
  const b = new Uint8Array(174);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, c.serial);
  dv.setUint16(4, c.seq);
  dv.setUint32(6, c.at);
  b.set(hexToBytes(c.hash), 10);
  b.set(hexToBytes(c.sig), 42);
  b.set(hexToBytes(c.cosig), 106);
  b.set(hexToBytes(c.signerId), 170);
  return 'g2.' + b64u(b);
}
export function unpackCompact(s: string): Compact | null {
  try {
    const m = /g2\.([A-Za-z0-9_-]{232})/.exec(s);
    if (!m) return null;
    const b = unb64u(m[1]);
    if (b.length !== 174) return null;
    const dv = new DataView(b.buffer);
    return { serial: dv.getUint32(0), seq: dv.getUint16(4), at: dv.getUint32(6), hash: bytesToHex(b.slice(10, 42)), sig: bytesToHex(b.slice(42, 106)), cosig: bytesToHex(b.slice(106, 170)), signerId: bytesToHex(b.slice(170, 174)) };
  } catch {
    return null;
  }
}
export function compactOf(s: SignedEntry, serial: number): string {
  return packCompact({ serial, seq: s.entry.seq, at: Math.floor(Date.parse(s.entry.at) / 1000), hash: s.hash, sig: s.sig, cosig: s.cosig, signerId: keyId(s.entry.signer) });
}
// 小さな証明の検証：サーバーの署名と、その時点で有効だった創業者の鍵の署名がそろっているか
export function verifyCompact(c: Compact, issuer: string, keys: Map<string, KeyState>): { sigOk: boolean; cosigOk: boolean; signer: KeyState | null } {
  const sigOk = verifySig(c.hash, c.sig, issuer);
  const at = new Date(c.at * 1000).toISOString();
  let signer: KeyState | null = null;
  let cosigOk = false;
  keys.forEach((k) => {
    if (cosigOk || keyId(k.key) !== c.signerId) return;
    // at は秒に丸めてあるので、1秒の余裕を見る
    const later = new Date(c.at * 1000 + 999).toISOString();
    if ((keyActive(keys, k.key, at) || keyActive(keys, k.key, later)) && verifyCosig(c.hash, c.cosig, k.key)) {
      cosigOk = true;
      signer = k;
    }
  });
  return { sigOk, cosigOk, signer };
}

export const anchorMemo = (root: string, n: number) => `${PROTOCOL} root:${root} n:${n}`;
export const explorerTx = (tx: string, chain: string) => `https://explorer.solana.com/tx/${tx}${chain === 'solana-devnet' ? '?cluster=devnet' : ''}`;
export const explorerAddr = (a: string, chain = 'solana-devnet') => `https://explorer.solana.com/address/${a}${chain === 'solana-devnet' ? '?cluster=devnet' : ''}`;
export const rpcFor = (chain: string) => (chain === 'solana-devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');
