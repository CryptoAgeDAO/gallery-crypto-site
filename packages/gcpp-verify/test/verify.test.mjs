// Fixtures were produced by a local test deployment (test issuer key), so they never touch production keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyBundle, verifyAnchor, merkleRoot, anchorMemo, unpackCompact, verifyCompact, verifyKeyring, hashEntry, canonical } from '../dist/index.js';

const fx = (f) => new URL(`./fixtures/${f}`, import.meta.url);
const bundle = () => JSON.parse(readFileSync(fx('demo-passport.json'), 'utf8'));
const ring = JSON.parse(readFileSync(fx('keyring.json'), 'utf8'));

test('canonical JSON sorts keys and drops undefined', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: undefined, c: null }] }), '{"a":[2,{"c":null}],"b":1}');
});

test('a genuine bundle verifies', async () => {
  const b = bundle();
  const r = await verifyBundle(b, { issuer: b.issuer });
  assert.equal(r.ok, true, JSON.stringify(r, null, 2));
  assert.equal(r.records.count, b.entries.length);
});

test('changing one word breaks the record', async () => {
  const b = bundle();
  const seal = b.entries.find((e) => e.entry.kind === 'seal');
  seal.entry.data.dpp.provenance.dealer = 'Somebody Else';
  const r = await verifyBundle(b);
  assert.equal(r.ok, false);
  assert.match(r.records.problems.join(' '), /contents changed/);
});

test('re-hashing a forged record still fails both signatures', async () => {
  const b = bundle();
  const e = b.entries[1];
  e.entry.data.note = 'forged';
  e.hash = hashEntry(e.entry);
  const r = await verifyBundle(b);
  assert.equal(r.ok, false);
  assert.match(r.records.problems.join(' '), /issuer signature/);
});

test('removing a record breaks the chain', async () => {
  const b = bundle();
  b.entries.splice(1, 1);
  const r = await verifyBundle(b);
  assert.equal(r.ok, false);
  assert.match(r.records.problems.join(' '), /chain broken/);
});

test('a pinned issuer that does not match fails', async () => {
  const r = await verifyBundle(bundle(), { issuer: '11111111111111111111111111111111' });
  assert.equal(r.ok, false);
  assert.equal(r.issuerPinned, false);
});

test('compact offline proof verifies against the saved keyring', () => {
  const c = unpackCompact(readFileSync(fx('compact.txt'), 'utf8').trim());
  assert.ok(c, 'compact proof decodes');
  const kr = verifyKeyring(ring.demoKeyring, ring.issuer);
  const r = verifyCompact(c, ring.issuer, kr.keys);
  assert.equal(r.sigOk && r.cosigOk, true);
});

test('merkle root: odd leaf pairs with itself, order does not matter', () => {
  const l = ['aa', 'bb', 'cc'];
  assert.equal(merkleRoot(l), merkleRoot(['cc', 'aa', 'bb']));
  assert.equal(merkleRoot(['aa']), 'aa');
});

test('anchor check finds the memo on Solana and XRPL (mocked RPC)', async () => {
  const leaves = bundle().entries.map((e) => e.hash);
  const root = merkleRoot(leaves);
  const memo = anchorMemo(root, leaves.length);
  const hex = Buffer.from(memo, 'utf8').toString('hex').toUpperCase();
  const fakeFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const json = body.method === 'getTransaction'
      ? { result: { blockTime: 1800000000, meta: { logMessages: [`Program log: Memo (len ${memo.length}): "${memo}"`] }, transaction: { message: { accountKeys: ['ISSUER'] } } } }
      : { result: { Account: 'rXRPL', Memos: [{ Memo: { MemoData: hex } }], meta: { TransactionResult: 'tesSUCCESS' } } };
    return { json: async () => json };
  };
  const r = await verifyAnchor({ chain: 'solana-devnet', root, leaves, tx: 'SIG', xrpl_tx: 'HASH', xrpl_chain: 'xrpl-testnet' }, { hashes: leaves.slice(0, 2), solanaSigner: 'ISSUER', xrplAccount: 'rXRPL', fetch: fakeFetch });
  assert.equal(r.rootOk, true);
  assert.equal(r.solana.found, true);
  assert.equal(r.xrpl.found, true);
  assert.equal(r.contains.length, 2);
  const wrong = await verifyAnchor({ chain: 'solana-devnet', root, leaves, tx: 'SIG' }, { solanaSigner: 'SOMEONE-ELSE', fetch: fakeFetch });
  assert.equal(wrong.solana.found, false);
});
