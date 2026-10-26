'use client';

// バックアップの暗号化（この端末の中だけで行う）。合言葉 → PBKDF2-SHA256（60万回）→ AES-256-GCM
// サーバーにも合言葉は送らない。合言葉を忘れると誰にも（Gallery Crypto にも）開けない。
export const BACKUP_FORMAT = 'gc-backup-enc/1';
const ITER = 600_000;

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...Array.from(u.subarray(i, i + 0x8000)));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');

async function keyFrom(pass: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export type EncryptedBackup = {
  format: typeof BACKUP_FORMAT;
  created_at: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
  sha256: string; // 暗号化前の中身の指紋（開けたあとに改ざんがないか確かめる）
};

export async function encryptBackup(plain: string, pass: string): Promise<{ file: string; sha256: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(plain);
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  const key = await keyFrom(pass, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(BACKUP_FORMAT) }, key, bytes);
  const out: EncryptedBackup = { format: BACKUP_FORMAT, created_at: new Date().toISOString(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: b64(salt) }, cipher: { name: 'AES-GCM', iv: b64(iv) }, data: b64(ct), sha256 };
  return { file: JSON.stringify(out), sha256 };
}

export async function decryptBackup(text: string, pass: string): Promise<string> {
  const e = JSON.parse(text) as EncryptedBackup;
  if (e.format !== BACKUP_FORMAT) throw new Error('Not a Gallery Crypto backup file');
  const key = await keyFrom(pass, unb64(e.kdf.salt), e.kdf.iterations);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.cipher.iv), additionalData: new TextEncoder().encode(BACKUP_FORMAT) }, key, unb64(e.data));
  } catch {
    throw new Error('Wrong passphrase, or the file was changed');
  }
  if (hex(await crypto.subtle.digest('SHA-256', pt)) !== e.sha256) throw new Error('The file was changed');
  return new TextDecoder().decode(pt);
}

// 書き留めやすい合言葉（紛らわしい文字を除いた 6 文字 × 5 組 ≈ 150 ビット）
export function makePassphrase(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(30));
  const g: string[] = [];
  for (let i = 0; i < 30; i += 6) g.push(Array.from(r.slice(i, i + 6), (x) => A[x % 32]).join(''));
  return g.join('-');
}
