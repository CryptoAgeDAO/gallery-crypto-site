// GCPP/1 — Gallery Crypto Provenance Protocol
// ブラウザでもサーバーでも同じ計算をする部分（正規化・ハッシュ・署名の検証・まとめハッシュ）。
// ブロックチェーンがなくても、公開鍵とこのファイルの手順だけで誰でも検証できる。
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';

export const PROTOCOL = 'GCPP/1';

export type GcppEntry = {
  protocol: string;
  cert: string;
  seq: number;
  kind: 'seal' | 'event';
  at: string;
  prev: string | null;
  data: Record<string, unknown>;
};
export type SignedEntry = { entry: GcppEntry; hash: string; sig: string; issuer: string; anchor_id?: number | null };
export type Anchor = { id: number; chain: string; root: string; leaves: string[]; tx: string; created_at: string };

// キーを並べ替え、空白なしで書き出す（同じ内容なら必ず同じ文字列になる）
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

export const sha256hex = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));
export const hashEntry = (e: GcppEntry) => sha256hex(canonical(e));

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
const hexToBytes = (h: string) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

// 署名するのは「GCPP/1:<ハッシュ>」という文字列
export const sigMessage = (hash: string) => utf8ToBytes(`${PROTOCOL}:${hash}`);

export function verifySig(hash: string, sigHex: string, issuer: string): boolean {
  try {
    return ed25519.verify(hexToBytes(sigHex), sigMessage(hash), b58decode(issuer));
  } catch {
    return false;
  }
}

export type Check = { seq: number; hashOk: boolean; sigOk: boolean; chainOk: boolean; issuerOk: boolean };
// 記録の列をまるごと検証：中身→ハッシュ、署名、前の記録とのつながり、発行者
export function verifyLog(list: SignedEntry[], issuer: string): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  let prev: string | null = null;
  list.forEach((s, i) => {
    const h = hashEntry(s.entry);
    checks.push({
      seq: s.entry.seq,
      hashOk: h === s.hash,
      sigOk: verifySig(h, s.sig, s.issuer),
      chainOk: s.entry.prev === prev && s.entry.seq === i + 1,
      issuerOk: s.issuer === issuer,
    });
    prev = s.hash;
  });
  return { ok: checks.length > 0 && checks.every((c) => c.hashOk && c.sigOk && c.chainOk && c.issuerOk), checks };
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

export const anchorMemo = (root: string, n: number) => `${PROTOCOL} root:${root} n:${n}`;
export const explorerTx = (tx: string, chain: string) => `https://explorer.solana.com/tx/${tx}${chain === 'solana-devnet' ? '?cluster=devnet' : ''}`;
export const explorerAddr = (a: string, chain = 'solana-devnet') => `https://explorer.solana.com/address/${a}${chain === 'solana-devnet' ? '?cluster=devnet' : ''}`;
export const rpcFor = (chain: string) => (chain === 'solana-devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');
