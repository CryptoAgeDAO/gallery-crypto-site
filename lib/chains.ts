import 'server-only';
// どのチェーンに刻印するか（管理画面で切り替え、データベースに保存。環境変数があればそちらを優先）
// Solana：test（devnet）/ main（mainnet）。XRPL：off / test（testnet）/ main（mainnet）
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { db } from './server';

export type SolanaNet = 'solana-devnet' | 'solana-mainnet';
export type XrplNet = 'off' | 'xrpl-testnet' | 'xrpl-mainnet';
export type Chains = { solana: SolanaNet; xrpl: XrplNet; locked: { solana: boolean; xrpl: boolean } };

let cache: { at: number; v: Chains } | null = null;

export async function getChains(fresh = false): Promise<Chains> {
  if (!fresh && cache && Date.now() - cache.at < 20_000) return cache.v;
  let s = '', x = '';
  try {
    const r = await db().from('gc_secrets').select('name,value').in('name', ['chain_solana', 'chain_xrpl']);
    for (const row of (r.data as { name: string; value: string }[]) || []) {
      if (row.name === 'chain_solana') s = row.value;
      if (row.name === 'chain_xrpl') x = row.value;
    }
  } catch {}
  const envS = process.env.GC_ANCHOR_CHAIN, envX = process.env.GC_XRPL_CHAIN;
  const solana: SolanaNet = (envS || s) === 'solana-mainnet' ? 'solana-mainnet' : 'solana-devnet';
  const xrpl: XrplNet = (envX || x) === 'xrpl-mainnet' ? 'xrpl-mainnet' : (envX || x) === 'xrpl-testnet' ? 'xrpl-testnet' : 'off';
  const v = { solana, xrpl, locked: { solana: Boolean(envS), xrpl: Boolean(envX) } };
  cache = { at: Date.now(), v };
  return v;
}

export async function setChains(next: { solana?: SolanaNet; xrpl?: XrplNet }) {
  const rows: { name: string; value: string }[] = [];
  if (next.solana) rows.push({ name: 'chain_solana', value: next.solana === 'solana-mainnet' ? 'solana-mainnet' : 'solana-devnet' });
  if (next.xrpl) rows.push({ name: 'chain_xrpl', value: ['xrpl-testnet', 'xrpl-mainnet'].includes(next.xrpl) ? next.xrpl : 'off' });
  if (rows.length) {
    const r = await db().from('gc_secrets').upsert(rows, { onConflict: 'name' });
    if (r.error) throw r.error;
  }
  cache = null;
  return getChains(true);
}

export function solanaRpc(net: SolanaNet) {
  if (net === 'solana-mainnet') return process.env.GC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
  return 'https://api.devnet.solana.com';
}

const XRPL_WS: Record<Exclude<XrplNet, 'off'>, string> = {
  'xrpl-testnet': 'wss://s.altnet.rippletest.net:51233',
  'xrpl-mainnet': process.env.GC_XRPL_WS || 'wss://xrplcluster.com',
};

// XRPL のアカウントは発行者の鍵の元から別の用途の鍵として導く（Solana の鍵とは別物・同じ元から毎回同じものになる）
async function xrplWallet(seed: Uint8Array) {
  const xrpl = await import('xrpl');
  const ent = sha256(utf8ToBytes(`GCPP xrpl account|${bytesToHex(seed)}`)).slice(0, 16);
  return xrpl.Wallet.fromEntropy(ent, { algorithm: 'ed25519' as never });
}

export async function xrplAddress(seed: Uint8Array) {
  return (await xrplWallet(seed)).classicAddress;
}

async function withClient<T>(net: Exclude<XrplNet, 'off'>, fn: (c: import('xrpl').Client) => Promise<T>): Promise<T> {
  const xrpl = await import('xrpl');
  const c = new xrpl.Client(XRPL_WS[net], { connectionTimeout: 8000 });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    c.disconnect().catch(() => {});
  }
}

export async function xrplBalance(seed: Uint8Array, net: XrplNet): Promise<number | null> {
  if (net === 'off') return null;
  const w = await xrplWallet(seed);
  try {
    return await withClient(net, async (c) => {
      try {
        const r = await c.request({ command: 'account_info', account: w.classicAddress, ledger_index: 'validated' });
        return Number(r.result.account_data.Balance) / 1_000_000;
      } catch {
        return 0; // まだ有効化されていない
      }
    });
  } catch {
    return null;
  }
}

// 同じルートを XRPL にも刻む（AccountSet にメモをのせるだけ。送金はしない）
export async function anchorXrpl(seed: Uint8Array, net: XrplNet, memo: string): Promise<{ tx?: string; needFunds?: boolean; error?: string }> {
  if (net === 'off') return {};
  const xrpl = await import('xrpl');
  const w = await xrplWallet(seed);
  try {
    return await withClient(net, async (c) => {
      let active = true;
      try {
        await c.request({ command: 'account_info', account: w.classicAddress, ledger_index: 'validated' });
      } catch {
        active = false;
      }
      if (!active && net === 'xrpl-testnet') {
        await c.fundWallet(w); // テスト用ネットワークは無料で有効化できる
        active = true;
      }
      if (!active) return { needFunds: true };
      const res = await c.submitAndWait(
        { TransactionType: 'AccountSet', Account: w.classicAddress, Memos: [{ Memo: { MemoType: xrpl.convertStringToHex('gcpp/2'), MemoData: xrpl.convertStringToHex(memo) } }] },
        { wallet: w, autofill: true },
      );
      const ok = (res.result.meta as { TransactionResult?: string } | undefined)?.TransactionResult === 'tesSUCCESS';
      return ok ? { tx: res.result.hash } : { error: String((res.result.meta as { TransactionResult?: string } | undefined)?.TransactionResult || 'failed') };
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
}
