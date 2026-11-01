// On-chain anchors: confirm that a Merkle root of passport records is written in a Solana memo
// (and, optionally, in an XRP Ledger memo) signed by the expected account. Uses public JSON-RPC only.
import { anchorMemo, merkleRoot } from './protocol.js';

export type Anchor = { id?: number; chain: string; root: string; leaves: string[]; tx: string; created_at?: string; xrpl_tx?: string; xrpl_chain?: string };
export type AnchorResult = { rootOk: boolean; contains: string[]; solana?: { found: boolean; signer?: string; blockTime?: number; error?: string }; xrpl?: { found: boolean; account?: string; error?: string } };

export const SOLANA_RPC: Record<string, string> = {
  'solana-mainnet': 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
};
export const XRPL_RPC: Record<string, string> = {
  'xrpl-mainnet': 'https://xrplcluster.com',
  'xrpl-testnet': 'https://s.altnet.rippletest.net:51234',
};

type Fetch = typeof fetch;
const post = async (f: Fetch, url: string, body: unknown) => (await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

const hexToUtf8 = (h: string) => new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16))));

/**
 * Check one anchor. `hashes` are the record hashes you care about (e.g. one passport's entries);
 * the result lists which of them are inside this anchor.
 */
export async function verifyAnchor(a: Anchor, opts: { hashes?: string[]; solanaSigner?: string; xrplAccount?: string; fetch?: Fetch; rpc?: { solana?: string; xrpl?: string } } = {}): Promise<AnchorResult> {
  const f = opts.fetch || fetch;
  const rootOk = merkleRoot(a.leaves) === a.root;
  const contains = (opts.hashes || []).filter((h) => a.leaves.includes(h));
  const memo = anchorMemo(a.root, a.leaves.length);
  const out: AnchorResult = { rootOk, contains };
  try {
    const j = await post(f, opts.rpc?.solana || SOLANA_RPC[a.chain] || SOLANA_RPC['solana-mainnet'], {
      jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [a.tx, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
    });
    const logs: string[] = j?.result?.meta?.logMessages || [];
    const signer: string | undefined = j?.result?.transaction?.message?.accountKeys?.[0];
    const found = logs.some((l) => l.includes(memo)) && (!opts.solanaSigner || signer === opts.solanaSigner);
    out.solana = { found, signer, blockTime: j?.result?.blockTime };
  } catch (e) {
    out.solana = { found: false, error: (e as Error).message };
  }
  if (a.xrpl_tx) {
    try {
      const j = await post(f, opts.rpc?.xrpl || XRPL_RPC[a.xrpl_chain || 'xrpl-mainnet'], { method: 'tx', params: [{ transaction: a.xrpl_tx, binary: false }] });
      const r = j?.result || {};
      const memos: string[] = (r.Memos || r.tx_json?.Memos || []).map((m: { Memo?: { MemoData?: string } }) => hexToUtf8(m.Memo?.MemoData || ''));
      const account: string | undefined = r.Account || r.tx_json?.Account;
      const ok = (r.meta?.TransactionResult || r.meta_json?.TransactionResult) === 'tesSUCCESS';
      out.xrpl = { found: ok && memos.includes(memo) && (!opts.xrplAccount || account === opts.xrplAccount), account };
    } catch (e) {
      out.xrpl = { found: false, error: (e as Error).message };
    }
  }
  return out;
}
