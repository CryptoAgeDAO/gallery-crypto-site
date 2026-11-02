// NTAG 424 DNA の SUN（タップのたびに変わる使い捨てコード）を確かめる計算部分。
// NXP AN12196 の方式：
//   e = 暗号化された PICC データ（16 バイト = 32 桁の16進数）… UID と読み取り回数が入っている
//   c = SDMMAC（8 バイト = 16 桁）… タグの中の秘密鍵でしか作れない署名
// データベースや鍵の置き場所には触れない（それは lib/sunServer.ts）。
import { createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

export type SunPicc = { uid: string; counter: number };

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex').toUpperCase();
export const isHexLen = (s: unknown, n: number): s is string => typeof s === 'string' && s.length === n && /^[0-9a-fA-F]+$/.test(s);
export const keyFromHex = (s: string): Buffer => {
  if (!isHexLen(s, 32)) throw new Error('AES key must be 32 hex characters');
  return Buffer.from(s, 'hex');
};

function aesEcb(key: Buffer, block: Buffer): Buffer {
  const c = createCipheriv('aes-128-ecb', key, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

// AES-CMAC（RFC 4493）
function shiftLeft(b: Buffer): Buffer {
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = ((b[i] << 1) & 0xff) | (i < 15 ? b[i + 1] >> 7 : 0);
  if (b[0] & 0x80) out[15] ^= 0x87;
  return out;
}
export function aesCmac(key: Buffer, msg: Buffer): Buffer {
  const k1 = shiftLeft(aesEcb(key, Buffer.alloc(16)));
  const k2 = shiftLeft(k1);
  const n = Math.max(1, Math.ceil(msg.length / 16));
  const complete = msg.length > 0 && msg.length % 16 === 0;
  const last = Buffer.alloc(16);
  if (complete) {
    msg.copy(last, 0, (n - 1) * 16);
    for (let i = 0; i < 16; i++) last[i] ^= k1[i];
  } else {
    const rest = msg.subarray((n - 1) * 16);
    rest.copy(last);
    last[rest.length] = 0x80;
    for (let i = 0; i < 16; i++) last[i] ^= k2[i];
  }
  let x = Buffer.alloc(16);
  for (let j = 0; j < n - 1; j++) {
    const blk = msg.subarray(j * 16, j * 16 + 16);
    for (let i = 0; i < 16; i++) x[i] ^= blk[i];
    x = aesEcb(key, x);
  }
  for (let i = 0; i < 16; i++) x[i] ^= last[i];
  return aesEcb(key, x);
}

// e を SDMMetaReadKey で復号して UID と回数を取り出す
export function decryptPicc(metaKey: Buffer, e: string): SunPicc | null {
  if (!isHexLen(e, 32)) return null;
  const d = createDecipheriv('aes-128-cbc', metaKey, Buffer.alloc(16));
  d.setAutoPadding(false);
  const p = Buffer.concat([d.update(Buffer.from(e, 'hex')), d.final()]);
  const tag = p[0];
  // 先頭バイト：UID を含む(bit7)・回数を含む(bit6)・UID の長さ 7
  if ((tag & 0xc0) !== 0xc0 || (tag & 0x0f) !== 7) return null;
  const uid = hex(p.subarray(1, 8));
  const counter = p[8] | (p[9] << 8) | (p[10] << 16);
  return { uid, counter };
}

// セッション鍵 = CMAC(SDMFileReadKey, 3CC3 0001 0080 || UID || 回数(下位バイトから3バイト))
export function sessionMacKey(fileKey: Buffer, picc: SunPicc): Buffer {
  const sv2 = Buffer.alloc(16);
  Buffer.from('3CC300010080', 'hex').copy(sv2, 0);
  Buffer.from(picc.uid, 'hex').copy(sv2, 6);
  sv2[13] = picc.counter & 0xff;
  sv2[14] = (picc.counter >> 8) & 0xff;
  sv2[15] = (picc.counter >> 16) & 0xff;
  return aesCmac(fileKey, sv2);
}

// タグが出す 8 バイトの MAC（CMAC 16 バイトの奇数番目だけを取る）
export function sdmMac(fileKey: Buffer, picc: SunPicc, macInput: Buffer = Buffer.alloc(0)): string {
  const full = aesCmac(sessionMacKey(fileKey, picc), macInput);
  const t = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) t[i] = full[i * 2 + 1];
  return hex(t);
}

export function macMatches(fileKey: Buffer, picc: SunPicc, c: string): boolean {
  if (!isHexLen(c, 16)) return false;
  const want = Buffer.from(sdmMac(fileKey, picc), 'hex');
  return timingSafeEqual(want, Buffer.from(c, 'hex'));
}
