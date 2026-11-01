# gcpp-verify

Independent verifier for **GCPP/2 product passports**: signed, hash-chained provenance records for physical goods, anchored on **Solana** (and optionally mirrored to the **XRP Ledger**).

A brand can say "this record is genuine". This tool lets anyone check that claim without trusting the brand's servers. It uses only public keys, maths and public chain RPC.

- Zero server trust: everything is checked locally from the JSON bundle.
- Two signatures per record: an **Ed25519 issuer key** (also the Solana address that pays for anchors) and a **P-256 founder key** (a hardware passkey).
- Tamper-evident history: each record commits to the previous one (hash chain).
- Public timestamps: batches of record hashes go into a Merkle tree, and its root is written in a Solana memo (and an XRPL memo).
- Works offline: a 174-byte compact proof (`g2.…`, fits in an NFC tag or QR code) can be checked against a saved keyring.

Used in production by [Gallery Crypto](https://gallery-crypto-site.vercel.app) to make NFC-tagged apparel verifiable. The protocol is not tied to it: any issuer can publish GCPP/2 bundles.

## Install

```sh
npm install gcpp-verify      # library
npx gcpp-verify <target>     # command line
```

Requires Node 18 or newer (uses global `fetch`). Its only dependencies are the audited `@noble/curves` and `@noble/hashes`.

## Command line

```sh
# a live passport page (the tool fetches /api/passport/<cert>)
gcpp-verify https://gallery-crypto-site.vercel.app/passport/GC-0001 --anchors

# a saved bundle, pinning the issuer key you trust
gcpp-verify passport.json --issuer 2vvgjWsLc6yrQ7VQjMhk12XKnGUZDdvz9CRmjr4nEjQJ

# an offline compact proof read from an NFC tag, with a saved keyring
gcpp-verify "g2.AAAj…" --keyring keyring.json
```

```
AUTHENTIC RECORD  GC-DEMO-1 (demo)
  issuer 2vvgjWsLc6yrQ7VQjMhk12XKnGUZDdvz9CRmjr4nEjQJ  (not pinned — pass --issuer to compare)
  founder keyring ✓
  4 records — contents, both signatures, chain ✓
```

| Flag | Meaning |
|---|---|
| `--anchors` | Also look each anchor up on Solana / XRPL over public RPC. |
| `--issuer <base58>` | Fail unless the bundle's issuer equals this key. Get it from a source you trust, such as the issuer's `/.well-known/gc-issuer.json` or a printed card. |
| `--genesis <hex>` | Fail unless the founder keyring's first key hash equals this value. |
| `--keyring <file\|url>` | Keyring for compact proofs (the issuer's `/api/keyring`). |
| `--json` | Machine-readable report. |

Exit codes: `0` authentic, `1` verification failed, `2` usage or network error.

## Library

```ts
import { verifyBundle, verifyAnchor, unpackCompact, verifyCompact, verifyKeyring } from 'gcpp-verify';

const bundle = await (await fetch('https://…/api/passport/GC-0001')).json();
const report = await verifyBundle(bundle, { issuer: TRUSTED_ISSUER, anchors: true });
if (!report.ok) console.log(report.records.problems);
```

`verifyBundle` returns:

```json
{
  "ok": true,
  "cert": "GC-DEMO-1",
  "issuer": "2vvgjWsLc6yrQ7VQjMhk12XKnGUZDdvz9CRmjr4nEjQJ",
  "keyring": { "ok": true, "genesis": "47b6…b41a", "problems": [] },
  "records": { "ok": true, "count": 4, "problems": [] },
  "issuerPinned": null,
  "genesisPinned": null,
  "anchors": []
}
```

Other exports include `canonical`, `hashEntry`, `verifySig`, `verifyCosig`, `verifyLog`, `merkleRoot`, `anchorMemo`, `packCompact` and `b58encode`/`b58decode`, so wallets, marketplaces or explorers can build their own checks.

## Protocol summary (GCPP/2)

1. **Record**: a JSON entry `{ protocol, cert, seq, kind, at, prev, signer, data }`, where `signer` is the founder's P-256 public key. It is serialised as canonical JSON (keys sorted, no whitespace) and hashed with SHA-256.
2. **Chain**: `prev` is the hash of the previous record for the same certificate; `seq` counts up from 1.
3. **Signatures** over the bytes `"GCPP/2:" + hash`:
   - `sig`: Ed25519 by the issuer (base58 public key = Solana address).
   - `cosig`: ECDSA P-256 by a founder key that is active in the keyring at time `at`.
4. **Keyring**: a separate hash-chained, issuer-signed log that adds and revokes founder keys. Its first hash is the *genesis*.
5. **Anchor**: record hashes are sorted, then paired with SHA-256 (an odd leaf pairs with itself) to make a Merkle root. The memo `GCPP/2 root:<root> n:<count>` is sent from the issuer address on Solana. The same memo can go in an XRPL `AccountSet` (MemoType `gcpp/2`) from the derived XRPL account.
6. **Compact proof**: `g2.` followed by base64url of serial (4 bytes), seq (2), time (4), hash (32), sig (64), cosig (64) and signer id (4). That is 174 bytes, for NFC or QR.

Privacy: bundles carry provenance (maker, materials, events), never purchase prices or personal data. Only hashes go on chain.

## Development

```sh
npm install
npm test        # builds, then runs node:test against fixtures from a local test issuer
```

The fixtures in `test/fixtures` were generated with a throwaway local test key, not a production key.

## License

Apache-2.0
