// GCPP/2 — Gallery Crypto Provenance Protocol: reference verifier.
// Pure functions. Runs in browsers, Node, Deno and Bun, fully offline.
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
  signer: string; // co-signing founder key (P-256 public key, uncompressed hex)
  data: Record<string, unknown>;
};
export type KeyEntry = {
  protocol: string;
  seq: number;
  kind: 'genesis' | 'add' | 'revoke';
  key: string; // subject key (P-256 public key, uncompressed hex)
  label: string;
  at: string;
  prev: string | null;
  signer: string; // approving key (for genesis: the key itself)
};
export type Signed<T> = { entry: T; hash: string; sig: string; cosig: string; issuer: string; anchor_id?: number | null };
export type SignedEntry = Signed<GcppEntry>;
export type SignedKey = Signed<KeyEntry>;

// Canonical JSON: keys sorted, no whitespace, undefined dropped. Same content -> same string.
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

// Base58 (Bitcoin/Solana alphabet)
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

// Both signatures are over the UTF-8 string "GCPP/2:<hash>"
export const sigMessage = (hash: string) => utf8ToBytes(`${PROTOCOL}:${hash}`);

export function verifySig(hash: string, sigHex: string, issuer: string): boolean {
  try {
    return ed25519.verify(hexToBytes(sigHex), sigMessage(hash), b58decode(issuer));
  } catch {
    return false;
  }
}
// Founder device key: WebCrypto ECDSA P-256 over SHA-256, 64-byte r||s (high-S allowed)
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

// ── Founder keyring ──
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

// ── Per-object record log ──
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

// Merkle root: sort leaves, then hash pairs (hex concatenation) until one remains; odd leaf pairs with itself
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

// ── Compact offline proof (174 bytes, fits a QR code or an NFC tag) ──
// serial(4) seq(2) at(4, unix seconds) hash(32) sig(64) cosig(64) signerId(4)
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
// Verify a compact proof: issuer signature + a founder key that was active at that time
export function verifyCompact(c: Compact, issuer: string, keys: Map<string, KeyState>): { sigOk: boolean; cosigOk: boolean; signer: KeyState | null } {
  const sigOk = verifySig(c.hash, c.sig, issuer);
  const at = new Date(c.at * 1000).toISOString();
  let signer: KeyState | null = null;
  let cosigOk = false;
  keys.forEach((k) => {
    if (cosigOk || keyId(k.key) !== c.signerId) return;
    // `at` is truncated to seconds, so allow one second of slack
    const later = new Date(c.at * 1000 + 999).toISOString();
    if ((keyActive(keys, k.key, at) || keyActive(keys, k.key, later)) && verifyCosig(c.hash, c.cosig, k.key)) {
      cosigOk = true;
      signer = k;
    }
  });
  return { sigOk, cosigOk, signer };
}

export const anchorMemo = (root: string, n: number) => `${PROTOCOL} root:${root} n:${n}`;

