// サーバー専用：サーバー側の署名、記録と鍵の台帳への追記（共同署名の確認つき）、Solana への刻印。
import 'server-only';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { createClient } from '@supabase/supabase-js';
import { db } from './server';
import {
  PROTOCOL, anchorMemo, b58encode, canonical, hashEntry, keyActive, merkleRoot, sigMessage, verifyCosig, verifyKeyring,
  type Anchor, type GcppEntry, type KeyEntry, type SignedEntry, type SignedKey,
} from './gcpp';
import { DPP_VERSION, EVENT_TYPES, cleanDpp, completeness, mergeDpp, prefill, type Dpp } from './dpp';
import { certNo, type Item } from './types';

// ── サーバーの鍵（共同署名の片方） ──
// 優先順位：1. 環境変数 GC_ISSUER_SEED　2. データベースに自動生成して保管した乱数（初回だけ作り、上書きしない）
// 3. 表ができるまでの仮の鍵（デモ表示用）。この鍵だけでは記録を作れない（創業者の端末の署名が必須）。
let cached: Uint8Array | null = null;
let lastIssuerError = '';
export const issuerError = () => lastIssuerError;
const derive = (base: string) => sha256(utf8ToBytes(`GCPP/1 issuer seed|${base}`));
const serverBase = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

export async function ensureIssuer(): Promise<void> {
  if (cached) return;
  if (process.env.GC_ISSUER_SEED) { cached = derive(process.env.GC_ISSUER_SEED); return; }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !serverBase()) return;
  const read = () => db().from('gc_secrets').select('value').eq('name', 'issuer_seed').maybeSingle();
  let r = await read();
  if (r.error) { lastIssuerError = 'read: ' + r.error.message; return; }
  if (!r.data) {
    const fresh = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const w = await db().from('gc_secrets').upsert({ name: 'issuer_seed', value: fresh }, { onConflict: 'name', ignoreDuplicates: true });
    if (w.error) { lastIssuerError = 'write: ' + w.error.message; return; }
    r = await read();
  }
  lastIssuerError = r.error ? 'read: ' + r.error.message : r.data ? '' : 'no key saved';
  const v = (r.data as { value: string } | null)?.value;
  if (v && /^[0-9a-f]{64}$/.test(v)) cached = new Uint8Array((v.match(/../g) as string[]).map((h) => parseInt(h, 16)));
}
export const issuerPermanent = () => Boolean(cached);
export const resetIssuerCache = () => { cached = null; };
function seed(): Uint8Array {
  if (cached) return cached;
  const base = serverBase();
  if (!base) throw new Error('issuer-not-configured');
  return derive(base);
}
export const issuerConfigured = () => Boolean(process.env.GC_ISSUER_SEED || serverBase());
export const issuerAddress = () => b58encode(ed25519.getPublicKey(seed()));
export const demoSeed = () => sha256(utf8ToBytes(`GCPP demo founder|${bytesToHex(seed())}`));

export function serverSign(entry: unknown): { hash: string; sig: string; issuer: string } {
  const hash = hashEntry(entry);
  return { hash, sig: bytesToHex(ed25519.sign(sigMessage(hash), seed())), issuer: issuerAddress() };
}

// 既定の表示用（実際の刻印先は lib/chains.ts の getChains() で決まる）
export const CHAIN = process.env.GC_ANCHOR_CHAIN === 'solana-mainnet' ? 'solana-mainnet' : 'solana-devnet';
export const issuerSeedForChains = () => seed();

export async function isAdminRequest(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!jwt || !process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return false;
  const as = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data } = await as.rpc('is_admin');
  return Boolean(data);
}

// ── 読み込み ──
type Row<T> = { entry: T; hash: string; sig: string; cosig: string; issuer: string; anchor_id: number | null };
const pick = <T,>(r: Row<T>) => ({ entry: r.entry, hash: r.hash, sig: r.sig, cosig: r.cosig, issuer: r.issuer, anchor_id: r.anchor_id });
export async function loadLog(itemId: string): Promise<SignedEntry[]> {
  const { data, error } = await db().from('passport_log').select('entry,hash,sig,cosig,issuer,anchor_id').eq('item_id', itemId).order('seq');
  if (error) throw error;
  return ((data as Row<GcppEntry>[]) || []).map(pick);
}
export async function loadKeyring(): Promise<SignedKey[]> {
  const { data, error } = await db().from('passport_keys').select('entry,hash,sig,cosig,issuer,anchor_id').order('seq');
  if (error) throw error;
  return ((data as Row<KeyEntry>[]) || []).map(pick);
}

// ── 記録の下書き（署名前）を組み立てる。端末はこれのハッシュに署名して commit に送る ──
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
function eventData(raw: Record<string, unknown>): Record<string, unknown> {
  const type = clip(raw.type, 30);
  if (!EVENT_TYPES.some((t) => t.key === type)) throw new Error('Choose what happened');
  const d: Record<string, unknown> = { type, actor: clip(raw.actor, 120), place: clip(raw.place, 120), note: clip(raw.note, 1000) };
  const date = clip(raw.date, 10);
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bad date');
    d.date = date;
  }
  return d;
}
async function sealData(item: Item, log: SignedEntry[]) {
  const { data: p } = await db().from('passports').select('dpp').eq('item_id', item.id).maybeSingle();
  const d = cleanDpp(mergeDpp(prefill(item), (p?.dpp as Dpp) || null));
  const c = completeness(d);
  if (c.missing.length) throw Object.assign(new Error('missing'), { missing: c.missing });
  return { schema: DPP_VERSION, version: log.filter((l) => l.entry.kind === 'seal').length + 1, dpp: d };
}

export async function prepareRecord(item: Item, kind: GcppEntry['kind'], raw: Record<string, unknown>, signer: string): Promise<GcppEntry> {
  const log = await loadLog(item.id);
  const last = log[log.length - 1];
  const data = kind === 'seal' ? await sealData(item, log) : eventData(raw);
  return { protocol: PROTOCOL, cert: certNo(item), seq: log.length + 1, kind, at: new Date().toISOString(), prev: last ? last.hash : null, signer, data };
}

const WINDOW = 10 * 60_000;
function freshAt(at: string, after?: string) {
  const t = Date.parse(at);
  if (!Number.isFinite(t) || Math.abs(Date.now() - t) > WINDOW || new Date(t).toISOString() !== at) throw new Error('This request expired — try again');
  if (after && at < after) throw new Error('Out of order — try again');
}

// ── 記録の確定：形式・鎖・内容・創業者の署名・鍵の有効性をすべて確かめてから、サーバーも署名して保存 ──
export async function commitRecord(item: Item, entry: GcppEntry, cosig: string): Promise<SignedEntry> {
  await ensureIssuer();
  if (!cached) throw new Error('not-set-up');
  const ring = verifyKeyring(await loadKeyring(), issuerAddress());
  if (!ring.ok) throw new Error('The founder keyring does not verify — signing is locked');
  const log = await loadLog(item.id);
  const last = log[log.length - 1];
  if (entry.protocol !== PROTOCOL || entry.cert !== certNo(item) || entry.seq !== log.length + 1 || entry.prev !== (last ? last.hash : null)) throw new Error('The record changed while you were signing — try again');
  if (entry.kind !== 'seal' && entry.kind !== 'event') throw new Error('Bad record');
  freshAt(entry.at, last?.entry.at);
  const expected = entry.kind === 'seal' ? await sealData(item, log) : eventData(entry.data);
  if (canonical(expected) !== canonical(entry.data)) throw new Error('The draft changed while you were signing — try again');
  if (!keyActive(ring.keys, entry.signer, entry.at)) throw new Error('This device key is not active');
  const clean: GcppEntry = { protocol: entry.protocol, cert: entry.cert, seq: entry.seq, kind: entry.kind, at: entry.at, prev: entry.prev, signer: entry.signer, data: entry.data };
  const s = serverSign(clean);
  if (!verifyCosig(s.hash, cosig, clean.signer)) throw new Error('The device signature is invalid');
  const { error } = await db().from('passport_log').insert({ item_id: item.id, cert: clean.cert, seq: clean.seq, kind: clean.kind, entry: clean, hash: s.hash, sig: s.sig, cosig, issuer: s.issuer });
  if (error) throw new Error(error.code === '23505' ? 'Someone wrote at the same moment — try again' : error.message);
  return { entry: clean, ...s, cosig };
}

// ── 鍵の台帳 ──
export async function prepareKey(kind: KeyEntry['kind'], key: string, label: string, signer: string): Promise<KeyEntry> {
  const ring = await loadKeyring();
  const last = ring[ring.length - 1];
  return { protocol: PROTOCOL, seq: ring.length + 1, kind, key, label: clip(label, 60), at: new Date().toISOString(), prev: last ? last.hash : null, signer };
}
export async function commitKey(entry: KeyEntry, cosig: string): Promise<SignedKey> {
  await ensureIssuer();
  if (!cached) throw new Error('not-set-up');
  const ring = await loadKeyring();
  const before = verifyKeyring(ring, issuerAddress());
  if (ring.length && !before.ok) throw new Error('The founder keyring does not verify — changes are locked');
  freshAt(entry.at, ring[ring.length - 1]?.entry.at);
  const clean: KeyEntry = { protocol: entry.protocol, seq: entry.seq, kind: entry.kind, key: entry.key, label: clip(entry.label, 60), at: entry.at, prev: entry.prev, signer: entry.signer };
  const s = serverSign(clean);
  const cand: SignedKey = { entry: clean, ...s, cosig };
  const after = verifyKeyring([...ring, cand], issuerAddress());
  if (!after.ok) throw new Error('Not allowed: ' + (after.checks[after.checks.length - 1].why || 'invalid'));
  const activeLeft = Array.from(after.keys.values()).filter((k) => !k.revoked).length;
  if (!activeLeft) throw new Error('You cannot revoke the last active key');
  const { error } = await db().from('passport_keys').insert({ seq: clean.seq, entry: clean, hash: s.hash, sig: s.sig, cosig, issuer: s.issuer });
  if (error) throw new Error(error.code === '23505' ? 'Someone changed the keyring at the same moment — try again' : error.message);
  return cand;
}

// ── Solana への刻印：まだ刻んでいない記録と鍵の台帳をまとめて1つのハッシュにして書き込む ──
export async function anchorPending(extraLeaves: string[] = []): Promise<{ anchor?: Anchor; count: number; address: string; needFunds?: boolean; balance?: number; chain?: string; xrpl?: { tx?: string; needFunds?: boolean; error?: string } }> {
  await ensureIssuer();
  const { getChains, solanaRpc, anchorXrpl } = await import('./chains');
  const chains = await getChains(true);
  const NET = chains.solana;
  const web3 = await import('@solana/web3.js');
  const address = issuerAddress();
  const a = await db().from('passport_log').select('id,hash').is('anchor_id', null).order('id');
  if (a.error) throw a.error;
  const k = await db().from('passport_keys').select('id,hash').is('anchor_id', null).order('id');
  const logRows = (a.data as { id: number; hash: string }[]) || [];
  const keyRows = (k.data as { id: number; hash: string }[]) || [];
  const leaves = [...logRows, ...keyRows].map((r) => r.hash).concat(extraLeaves);
  if (!leaves.length) return { count: 0, address };
  const root = merkleRoot(leaves);

  const kp = web3.Keypair.fromSeed(seed());
  const conn = new web3.Connection(solanaRpc(NET), 'confirmed');
  let bal = await conn.getBalance(kp.publicKey);
  if (bal < 0.001 * web3.LAMPORTS_PER_SOL && NET === 'solana-devnet') {
    try {
      const sig = await conn.requestAirdrop(kp.publicKey, 0.5 * web3.LAMPORTS_PER_SOL);
      const bh = await conn.getLatestBlockhash();
      await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      bal = await conn.getBalance(kp.publicKey);
    } catch {
      /* テスト用の無料配布は混雑で失敗することがある */
    }
  }
  if (bal < 0.00001 * web3.LAMPORTS_PER_SOL) return { count: leaves.length, address, needFunds: true, balance: bal / web3.LAMPORTS_PER_SOL, chain: NET };

  const ix = new web3.TransactionInstruction({
    keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: false }],
    programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: Buffer.from(anchorMemo(root, leaves.length), 'utf8'),
  });
  const tx = await web3.sendAndConfirmTransaction(conn, new web3.Transaction().add(ix), [kp], { commitment: 'confirmed' });
  const ins = await db().from('passport_anchors').insert({ chain: NET, root, leaves, tx }).select('*').single();
  if (ins.error) throw ins.error;
  let anchor = ins.data as Anchor;
  // 同じルートを XRPL にも（設定がオンのとき。失敗しても Solana の刻印は残る）
  let xr: { tx?: string; needFunds?: boolean; error?: string } | undefined;
  if (chains.xrpl !== 'off') {
    xr = await anchorXrpl(seed(), chains.xrpl, anchorMemo(root, leaves.length));
    if (xr.tx) {
      const up = await db().from('passport_anchors').update({ xrpl_tx: xr.tx, xrpl_chain: chains.xrpl }).eq('id', anchor.id).select('*').single();
      if (!up.error) anchor = up.data as Anchor;
    }
  }
  if (logRows.length) await db().from('passport_log').update({ anchor_id: anchor.id }).in('id', logRows.map((r) => r.id));
  if (keyRows.length) await db().from('passport_keys').update({ anchor_id: anchor.id }).in('id', keyRows.map((r) => r.id));
  return { anchor, count: leaves.length, address, chain: NET, xrpl: xr, balance: (await conn.getBalance(kp.publicKey)) / web3.LAMPORTS_PER_SOL };
}

// 記録した直後に刻印を試みる（失敗しても記録は残り、毎日の自動刻印で拾われる）
export async function anchorSoon(ms = 25_000) {
  try {
    return await Promise.race([anchorPending(), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  } catch {
    return null;
  }
}

export async function issuerBalance(net?: string): Promise<number | null> {
  try {
    const web3 = await import('@solana/web3.js');
    const { getChains, solanaRpc } = await import('./chains');
    const conn = new web3.Connection(solanaRpc((net as 'solana-devnet') || (await getChains()).solana));
    return (await conn.getBalance(new web3.PublicKey(issuerAddress()))) / web3.LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

// 短時間だけ有効な印（パスキー登録の往復をサーバーに保存せずに確かめるため）
export function serverMac(msg: string): string {
  return sha256hex(`${bytesToHex(seed())}|${msg}`);
}
function sha256hex(s: string) {
  return bytesToHex(sha256(utf8ToBytes(s)));
}
