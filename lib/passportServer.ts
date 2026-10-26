// サーバー専用：発行者の鍵で署名し、記録を追記し、Solana に刻印する。
import 'server-only';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { createClient } from '@supabase/supabase-js';
import { db } from './server';
import { PROTOCOL, anchorMemo, b58encode, hashEntry, merkleRoot, sigMessage, type Anchor, type GcppEntry, type SignedEntry } from './gcpp';

// 発行者の鍵。GC_ISSUER_SEED があればそれ、なければサーバーの秘密鍵から導く（どこにも保存しない）。
// 本番では専用の鍵管理（KMS など）に移す。
function seed(): Uint8Array {
  const base = process.env.GC_ISSUER_SEED || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!base) throw new Error('issuer-not-configured');
  return sha256(utf8ToBytes(`${PROTOCOL} issuer seed|${base}`));
}
export const issuerConfigured = () => Boolean(process.env.GC_ISSUER_SEED || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
export function issuerAddress(): string {
  return b58encode(ed25519.getPublicKey(seed()));
}
export function signEntry(entry: GcppEntry): SignedEntry {
  const hash = hashEntry(entry);
  const sig = bytesToHex(ed25519.sign(sigMessage(hash), seed()));
  return { entry, hash, sig, issuer: issuerAddress() };
}

export const CHAIN = process.env.GC_ANCHOR_CHAIN === 'solana-mainnet' ? 'solana-mainnet' : 'solana-devnet';

export async function isAdminRequest(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!jwt || !process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return false;
  const as = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data } = await as.rpc('is_admin');
  return Boolean(data);
}

type Row = { entry: GcppEntry; hash: string; sig: string; issuer: string; anchor_id: number | null; seq: number };
export async function loadLog(itemId: string): Promise<SignedEntry[]> {
  const { data, error } = await db().from('passport_log').select('entry,hash,sig,issuer,anchor_id,seq').eq('item_id', itemId).order('seq');
  if (error) throw error;
  return ((data as Row[]) || []).map(({ entry, hash, sig, issuer, anchor_id }) => ({ entry, hash, sig, issuer, anchor_id }));
}

export async function appendEntry(itemId: string, cert: string, kind: GcppEntry['kind'], data: Record<string, unknown>): Promise<SignedEntry> {
  // 同時に押されても seq が重複しないよう、失敗したら読み直して1回だけやり直す
  for (let attempt = 0; attempt < 2; attempt++) {
    const log = await loadLog(itemId);
    const last = log[log.length - 1];
    const entry: GcppEntry = { protocol: PROTOCOL, cert, seq: log.length + 1, kind, at: new Date().toISOString(), prev: last ? last.hash : null, data };
    const s = signEntry(entry);
    const { error } = await db().from('passport_log').insert({ item_id: itemId, cert, seq: entry.seq, kind, entry, hash: s.hash, sig: s.sig, issuer: s.issuer });
    if (!error) return s;
    if (error.code !== '23505' || attempt === 1) throw error;
  }
  throw new Error('unreachable');
}

// まだ刻印していない全記録のハッシュを1つにまとめ、Solana のメモとして書き込む
export async function anchorPending(): Promise<{ anchor?: Anchor; count: number; address: string; needFunds?: boolean; balance?: number }> {
  const web3 = await import('@solana/web3.js');
  const address = issuerAddress();
  const { data, error } = await db().from('passport_log').select('id,hash').is('anchor_id', null).order('id');
  if (error) throw error;
  const rows = (data as { id: number; hash: string }[]) || [];
  if (!rows.length) return { count: 0, address };
  const leaves = rows.map((r) => r.hash);
  const root = merkleRoot(leaves);

  const kp = web3.Keypair.fromSeed(seed());
  const conn = new web3.Connection(CHAIN === 'solana-devnet' ? web3.clusterApiUrl('devnet') : web3.clusterApiUrl('mainnet-beta'), 'confirmed');
  let bal = await conn.getBalance(kp.publicKey);
  if (bal < 0.001 * web3.LAMPORTS_PER_SOL && CHAIN === 'solana-devnet') {
    try {
      const sig = await conn.requestAirdrop(kp.publicKey, 0.5 * web3.LAMPORTS_PER_SOL);
      const bh = await conn.getLatestBlockhash();
      await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      bal = await conn.getBalance(kp.publicKey);
    } catch {
      /* テスト用の無料配布は混雑で失敗することがある */
    }
  }
  if (bal < 0.00001 * web3.LAMPORTS_PER_SOL) return { count: rows.length, address, needFunds: true, balance: bal / web3.LAMPORTS_PER_SOL };

  const ix = new web3.TransactionInstruction({
    keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: false }],
    programId: new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: Buffer.from(anchorMemo(root, leaves.length), 'utf8'),
  });
  const tx = await web3.sendAndConfirmTransaction(conn, new web3.Transaction().add(ix), [kp], { commitment: 'confirmed' });
  const ins = await db().from('passport_anchors').insert({ chain: CHAIN, root, leaves, tx }).select('*').single();
  if (ins.error) throw ins.error;
  const anchor = ins.data as Anchor;
  const up = await db().from('passport_log').update({ anchor_id: anchor.id }).in('id', rows.map((r) => r.id));
  if (up.error) throw up.error;
  return { anchor, count: rows.length, address, balance: (await conn.getBalance(kp.publicKey)) / web3.LAMPORTS_PER_SOL };
}

export async function issuerBalance(): Promise<number | null> {
  try {
    const web3 = await import('@solana/web3.js');
    const conn = new web3.Connection(CHAIN === 'solana-devnet' ? web3.clusterApiUrl('devnet') : web3.clusterApiUrl('mainnet-beta'));
    return (await conn.getBalance(new web3.PublicKey(issuerAddress()))) / web3.LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}
