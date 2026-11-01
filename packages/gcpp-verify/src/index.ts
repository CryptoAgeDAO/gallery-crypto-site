// gcpp-verify — check a GCPP/2 passport bundle without trusting the issuer's servers.
export * from './protocol.js';
export * from './anchors.js';
import { checkOk, verifyKeyring, verifyLog, type SignedEntry, type SignedKey } from './protocol.js';
import { verifyAnchor, type Anchor, type AnchorResult } from './anchors.js';

export type Bundle = { protocol: string; issuer: string; chain?: string; cert: string; demo?: boolean; entries: SignedEntry[]; keyring: SignedKey[]; anchors?: Anchor[] };
export type Report = {
  ok: boolean;
  cert: string;
  issuer: string;
  keyring: { ok: boolean; genesis: string | null; problems: string[] };
  records: { ok: boolean; count: number; problems: string[] };
  issuerPinned: boolean | null;
  genesisPinned: boolean | null;
  anchors: (AnchorResult & { tx: string; chain: string })[];
};

/**
 * Verify a passport bundle (as served at /api/passport/<cert>).
 * - pin `issuer` (base58 Ed25519 / Solana address) and `genesis` (keyring root hash) from a source you trust
 * - set `anchors: true` to also look the anchors up on Solana / XRPL over public RPC
 */
export async function verifyBundle(b: Bundle, opts: { issuer?: string; genesis?: string; anchors?: boolean; fetch?: typeof fetch } = {}): Promise<Report> {
  const kr = verifyKeyring(b.keyring || [], b.issuer);
  const lg = verifyLog(b.entries || [], b.issuer, kr.keys);
  const anchors: Report['anchors'] = [];
  if (opts.anchors) {
    const hashes = (b.entries || []).map((e) => e.hash);
    for (const a of b.anchors || []) anchors.push({ tx: a.tx, chain: a.chain, ...(await verifyAnchor(a, { hashes, solanaSigner: b.issuer, fetch: opts.fetch })) });
  }
  const issuerPinned = opts.issuer ? opts.issuer === b.issuer : null;
  const genesisPinned = opts.genesis ? opts.genesis === kr.genesis : null;
  const anchorsOk = anchors.every((a) => a.rootOk && a.solana?.found !== false);
  return {
    ok: kr.ok && lg.ok && issuerPinned !== false && genesisPinned !== false && anchorsOk,
    cert: b.cert,
    issuer: b.issuer,
    keyring: { ok: kr.ok, genesis: kr.genesis, problems: kr.checks.filter((c) => !c.ok).map((c) => `key #${c.seq}: ${c.why}`) },
    records: {
      ok: lg.ok,
      count: lg.checks.length,
      problems: lg.checks.filter((c) => !checkOk(c)).map((c) => `record #${c.seq}: ${[!c.hashOk && 'contents changed', !c.sigOk && 'issuer signature', !c.cosigOk && 'founder signature', !c.chainOk && 'chain broken', !c.issuerOk && 'wrong issuer'].filter(Boolean).join(', ')}`),
    },
    issuerPinned,
    genesisPinned,
    anchors,
  };
}
