#!/usr/bin/env node
// gcpp-verify <passport URL | proof.json | compact proof "g2.…"> [--anchors] [--issuer <base58>] [--genesis <hash>] [--json]
import { readFile } from 'node:fs/promises';
import { unpackCompact, verifyBundle, verifyCompact, verifyKeyring, type Bundle } from './index.js';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const target = args.find((a, i) => !a.startsWith('--') && !['--issuer', '--genesis', '--keyring'].includes(args[i - 1] || ''));
const mark = (b: boolean | null | undefined) => (b === null || b === undefined ? '–' : b ? '✓' : '✕');

if (!target) {
  console.log('usage: gcpp-verify <https://…/passport/GC-0001 | proof.json | g2.…> [--anchors] [--issuer <base58>] [--genesis <hash>] [--json]');
  process.exit(2);
}

async function load(t: string): Promise<Bundle> {
  if (/^https?:\/\//.test(t)) {
    const u = new URL(t);
    const m = /\/passport\/([^/?#]+)/.exec(u.pathname);
    const api = m ? `${u.origin}/api/passport/${m[1]}` : t;
    const r = await fetch(api);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${api}`);
    return r.json();
  }
  return JSON.parse(await readFile(t, 'utf8'));
}

async function main() {
  const compact = unpackCompact(target!);
  if (compact) {
    // compact proof: needs the public keyring (from a saved file or the issuer's /api/keyring)
    const src = val('--keyring');
    if (!src) throw new Error('a compact proof needs --keyring <file or URL of /api/keyring>');
    const ring = /^https?:/.test(src) ? await (await fetch(src)).json() : JSON.parse(await readFile(src, 'utf8'));
    const demo = compact.serial === 0 || (compact.serial > 9000 && compact.serial <= 9006);
    const kr = verifyKeyring(demo ? ring.demoKeyring : ring.keyring, ring.issuer);
    const r = verifyCompact(compact, ring.issuer, kr.keys);
    const ok = r.sigOk && r.cosigOk && kr.ok;
    if (flag('--json')) console.log(JSON.stringify({ ok, ...r, keyringOk: kr.ok }, null, 2));
    else console.log(`${ok ? 'AUTHENTIC' : 'NOT VERIFIED'}  serial ${compact.serial} · record #${compact.seq}\n  issuer signature ${mark(r.sigOk)}\n  founder signature ${mark(r.cosigOk)}\n  keyring ${mark(kr.ok)}`);
    process.exit(ok ? 0 : 1);
  }
  const b = await load(target!);
  const rep = await verifyBundle(b, { issuer: val('--issuer'), genesis: val('--genesis'), anchors: flag('--anchors') });
  if (flag('--json')) console.log(JSON.stringify(rep, null, 2));
  else {
    console.log(`${rep.ok ? 'AUTHENTIC RECORD' : 'RECORD BROKEN'}  ${rep.cert}${b.demo ? ' (demo)' : ''}`);
    console.log(`  issuer ${rep.issuer}${rep.issuerPinned === null ? '  (not pinned — pass --issuer to compare)' : `  pinned ${mark(rep.issuerPinned)}`}`);
    console.log(`  founder keyring ${mark(rep.keyring.ok)}${rep.genesisPinned === null ? '' : `  root pinned ${mark(rep.genesisPinned)}`}`);
    console.log(`  ${rep.records.count} records — contents, both signatures, chain ${mark(rep.records.ok)}`);
    [...rep.keyring.problems, ...rep.records.problems].forEach((p) => console.log(`    ✕ ${p}`));
    if (flag('--anchors')) {
      if (!rep.anchors.length) console.log('  anchors: none in this bundle');
      rep.anchors.forEach((a) => console.log(`  anchor ${a.chain} ${a.tx.slice(0, 12)}…  root ${mark(a.rootOk)}  on-chain ${mark(a.solana?.found)}${a.xrpl ? `  XRPL ${mark(a.xrpl.found)}` : ''}  covers ${a.contains.length} of these records`));
    }
  }
  process.exit(rep.ok ? 0 : 1);
}
main().catch((e) => { console.error('error:', (e as Error).message); process.exit(2); });
