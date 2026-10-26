import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import { DPP_SECTIONS, EVENT_TYPES } from '@/lib/dpp';

export const metadata: Metadata = {
  title: 'GCPP/2 specification — Gallery Crypto',
  description: 'Gallery Crypto Provenance Protocol: one record, two signatures, one chain. Verifiable forever, with or without a blockchain.',
};

// 公開仕様書：シンプルな3つのルールと、誰でも実装できる検証手順
const Code = ({ children }: { children: string }) => <pre className="pl-code">{children}</pre>;

export default function Spec() {
  return (
    <MoShell title="One record. Two signatures. One chain." kicker="Specification · GCPP/2 · Oct 2026">
      <p className="mo-lead">
        GCPP (Gallery Crypto Provenance Protocol) proves where a one-of-a-kind object came from, what it is made of and everything that happened to it — in a form anyone can check,
        forever, without trusting Gallery Crypto, a marketplace or any single blockchain. It is small enough to fit on an NFC tag.
      </p>

      <h2 className="pl-h">The three rules</h2>
      <ol className="pl-layers">
        <li><span className="pl-n">1</span><h3>One record</h3><p>Every fact is one small JSON object. Its fingerprint is SHA-256 of the canonical JSON (keys sorted, no spaces).</p></li>
        <li><span className="pl-n">2</span><h3>Two signatures</h3><p>Each fingerprint is signed by the issuer&apos;s server key (Ed25519) <b>and</b> a founder&apos;s device key (ECDSA P-256) that cannot leave its device.</p></li>
        <li><span className="pl-n">3</span><h3>One chain</h3><p>Each record contains the previous record&apos;s fingerprint. Nothing can be removed, inserted or changed without breaking the chain.</p></li>
      </ol>
      <p className="mo-lead">Everything else — keyring, anchors, offline proof, backups — follows from these three rules.</p>

      <h2 className="pl-h">1 · Record</h2>
      <Code>{`{
  "protocol": "GCPP/2",
  "cert":     "GC-0007",            // the object
  "seq":      3,                    // 1, 2, 3 … per object
  "kind":     "seal" | "event",     // seal = full product passport, event = something happened
  "at":       "2027-02-02T04:00:00.000Z",
  "prev":     "<hash of seq 2>" | null,
  "signer":   "<founder device key, P-256, hex>",
  "data":     { … }                 // seal: { schema, version, dpp } · event: { type, actor, place, note, date? }
}
hash  = sha256( canonical(record) )
sig   = Ed25519.sign(  "GCPP/2:" + hash , issuer server key )
cosig = ECDSA_P256_SHA256.sign( "GCPP/2:" + hash , signer )   // 64-byte r||s`}</Code>
      <p>Event types: {EVENT_TYPES.map((e) => e.key).join(', ')}. No prices and no personal data are ever written into a record.</p>

      <h2 className="pl-h">2 · Keyring</h2>
      <p>Founder keys live in their own chain of records, signed the same way.</p>
      <Code>{`{ "protocol":"GCPP/2", "seq":n, "kind":"genesis"|"add"|"revoke", "key":"<P-256 hex>",
  "label":"…", "at":"…", "prev":"<hash>"|null, "signer":"<P-256 hex>" }

genesis  must be seq 1 and self-signed (signer == key)
add      must be signed by a key that is active at "at"
revoke   must be signed by an active key; at least one key stays active
active(k, t) = added(k) <= t  and  (not revoked  or  revoked(k) > t)`}</Code>
      <p>A record is valid only if its signer was active at its time. Revoking a key never invalidates what it signed before. Verifiers remember the genesis hash; a different genesis is a warning.</p>

      <h2 className="pl-h">3 · Verify (any language, ~60 lines)</h2>
      <ol className="pl-road">
        <li><b>1</b> Get the issuer key from <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a> (base58 Ed25519, also a Solana address) — or from a copy you already trust.</li>
        <li><b>2</b> Verify the keyring in order with the rules above.</li>
        <li><b>3</b> For each record of the object, in order: recompute the hash, check <i>sig</i> with the issuer key, check <i>cosig</i> with <i>signer</i>, check <i>signer</i> was active at <i>at</i>, check <i>prev</i> and <i>seq</i>.</li>
        <li><b>4</b> Optional: for each anchor, recompute the Merkle root of its leaves and find it in the Solana memo of its transaction.</li>
      </ol>
      <p>Bundle for any object: <a href="/api/passport/GC-DEMO">/api/passport/&lt;cert&gt;</a> · keyring: <a href="/api/keyring">/api/keyring</a> · reference code: <span className="pp-mono">lib/gcpp.ts</span>.</p>

      <h2 className="pl-h">4 · Anchor (optional)</h2>
      <Code>{`leaves = hashes not yet anchored (records, keyring changes, daily snapshot fingerprint)
level  = sort(leaves); while len > 1: level = [ sha256(a + b) for each pair (last one paired with itself) ]
memo   = "GCPP/2 root:<root> n:<count>"   →  Solana Memo program, signed by the issuer key`}</Code>
      <p>Anchors are written right after every change and once a day. The chain adds an outside timestamp; the proof never depends on it.</p>

      <h2 className="pl-h">5 · Offline proof — 174 bytes</h2>
      <div className="tablewrap">
        <table className="pl-table">
          <thead><tr><th>Bytes</th><th>Field</th></tr></thead>
          <tbody>
            <tr><td>4</td><td>object serial (0 = demo)</td></tr>
            <tr><td>2</td><td>record seq</td></tr>
            <tr><td>4</td><td>time, unix seconds</td></tr>
            <tr><td>32</td><td>record hash</td></tr>
            <tr><td>64</td><td>issuer signature</td></tr>
            <tr><td>64</td><td>founder signature</td></tr>
            <tr><td>4</td><td>signer key id (first 4 bytes of sha256(key hex))</td></tr>
          </tbody>
        </table>
      </div>
      <p>Written as <span className="pp-mono">/verify#g2.&lt;base64url&gt;</span> into a QR code or an NFC tag. The verifier app keeps the public keyring on the device, so a phone with no signal can still say <b>authentic</b> or <b>not verified</b>.</p>

      <h2 className="pl-h">6 · Product passport (seal data)</h2>
      <p>Schema <span className="pp-mono">gc-dpp-textile/0.1</span>, aligned with the categories expected in the EU Digital Product Passport for textiles, plus provenance and a physical fingerprint:</p>
      <ul>
        {DPP_SECTIONS.map((s) => (
          <li key={s.key}><b>{s.title}</b> — {s.fields.map((f) => f.label + (f.required ? '*' : '')).join(', ')}</li>
        ))}
      </ul>

      <h2 className="pl-h">7 · Security model</h2>
      <div className="tablewrap">
        <table className="pl-table">
          <thead><tr><th>Layer</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td>Sign-in</td><td>Password plus a second step (authenticator code or Face ID). Enforced by the database itself, not just the screen.</td></tr>
            <tr><td>Face ID per signature</td><td>Every record and key change needs a fresh biometric check, bound to that record&apos;s hash and verified by the server.</td></tr>
            <tr><td>Device key</td><td>Created inside the device as non-extractable. The page itself cannot read it. The device checks what it signs before signing.</td></tr>
            <tr><td>Two signatures</td><td>A server breach or a stolen device alone cannot create a valid record.</td></tr>
            <tr><td>Keyring</td><td>New devices only with an active key or the offline recovery key file.</td></tr>
            <tr><td>Append-only storage</td><td>The database refuses edits and deletes of signed records and key changes.</td></tr>
            <tr><td>Anchors</td><td>Public timestamps on Solana after every change and daily.</td></tr>
            <tr><td>Backups</td><td>Daily snapshot to private storage; encrypted full backup (AES-256-GCM, PBKDF2 600k) made on the owner&apos;s device; verified restore that only adds what is missing.</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="pl-h">8 · Backup file</h2>
      <Code>{`{ "format":"gc-backup-enc/1", "created_at":"…",
  "kdf":    { "name":"PBKDF2", "hash":"SHA-256", "iterations":600000, "salt":"<b64>" },
  "cipher": { "name":"AES-GCM", "iv":"<b64>" },      // additional data = "gc-backup-enc/1"
  "data":   "<b64 ciphertext>",
  "sha256": "<fingerprint of the plaintext>" }
plaintext = { "format":"gc-backup/1", "issuer":"…", "tables": { …every table… } }`}</Code>
      <p>Keep three copies in two places: a USB stick, a second cloud, and the passphrase on paper next to the recovery key — never in the same place as the file.</p>

      <h2 className="pl-h">9 · Next — GCPP/3</h2>
      <ol className="pl-road">
        <li><b>Chip</b> Each NFC tap adds the chip&apos;s one-time code (NTAG 424 DNA SUN) to the proof, binding the record to the physical tag.</li>
        <li><b>Dealers</b> Dealers and artists hold their own keys and co-sign their own events (“sourced”, “processed”) — provenance signed by the people who made it.</li>
        <li><b>Owners</b> Owners re-scan and add wear with their own key; the record grows with the object.</li>
        <li><b>Post-quantum</b> A third signature (ML-DSA) can be added without changing rules 1–3.</li>
      </ol>
      <p className="mo-fine">This specification is published so that anyone can verify, mirror or re-implement it. © Gallery Crypto, Tokyo.</p>
    </MoShell>
  );
}
