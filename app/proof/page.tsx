import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import PassportView from '@/components/PassportView';
import { demoPassport, listSealed } from '@/lib/passportPublic';
import { siteUrl } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';
import { DPP_SECTIONS } from '@/lib/dpp';
import { compactOf } from '@/lib/gcpp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Proof Lab — Gallery Crypto',
  description: 'How Gallery Crypto proves a one-of-a-kind piece: NFC, signed provenance records aligned with the EU Digital Product Passport, and an optional Solana anchor.',
};

const SNIPPET = `// verify any Gallery Crypto passport — no account, no wallet
const b = await (await fetch('/api/passport/GC-DEMO-1')).json();
for (const s of b.entries) {
  const hash = sha256(canonicalJSON(s.entry));          // contents
  ed25519.verify(s.sig, 'GCPP/2:' + hash, b.issuer);   // server key
  p256.verify(s.cosig, 'GCPP/2:' + hash, s.entry.signer); // founder device key
  // s.entry.signer must be active in b.keyring at s.entry.at
  // s.entry.prev must equal the previous hash          // chain
}
// optional: merkleRoot(anchor.leaves) is in a Solana memo`;

export default async function ProofLab() {
  const demo = await demoPassport();
  const sealed = await listSealed();
  const url = `${siteUrl()}/passport/GC-DEMO-1`;
  const offlineUrl = demo ? `${siteUrl()}/verify#${compactOf(demo.entries[demo.entries.length - 1], 9001)}` : '';
  const offlineQr = offlineUrl ? await QRCode.toString(offlineUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'L', color: { dark: '#111111', light: '#00000000' } }) : '';
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#111111', light: '#00000000' } });
  return (
    <MoShell title="Proof that outlives the platform" kicker="Proof Lab · GCPP/2">
      <p className="mo-lead">
        Every Gallery Crypto piece is one of a kind. Its passport proves three things: <b>this exact object</b>, <b>where it came from</b>, and <b>what it is made of</b> — in a way
        anyone can check, forever, without trusting us, a marketplace, or any single blockchain.
      </p>

      <ol className="pl-layers">
        <li>
          <span className="pl-n">1</span>
          <h3>The object</h3>
          <p>An NFC chip (NTAG 424 DNA) is sewn deep into the collar. Every tap carries a one-time code, so a copied tag fails. Macro photos of the unique wear are hashed — a fake body with a real-looking tag still does not match.</p>
          <span className="pl-tag">Physical</span>
        </li>
        <li>
          <span className="pl-n">2</span>
          <h3>The signed record</h3>
          <p>Each step — sourced, catalogued, fingerprinted, sold — is signed <b>twice</b>: by our server key and by a founder&apos;s device key that can never leave the device. Each record links to the one before, so nothing can be edited, removed or inserted unseen. Works with <b>no blockchain and no internet</b>.</p>
          <span className="pl-tag">Chain-independent</span>
        </li>
        <li>
          <span className="pl-n">3</span>
          <h3>The public anchor</h3>
          <p>Records are rolled into one hash and written to Solana. It costs a fraction of a cent and adds a timestamp nobody can change. If the chain ever changes, the records above still verify.</p>
          <span className="pl-tag">Solana</span>
        </li>
      </ol>

      <h2 className="pl-h">Live demo — check it yourself</h2>
      <p className="mo-links"><a href="/demo">Prefer a guided tour with images? Follow one piece →</a></p>
      <p className="mo-lead">
        This demo passport is signed right now with the real issuer key and checked in your browser. Scroll down to <b>Try to fake it</b>. Scan the QR code with a phone — that
        is what an NFC tap opens.
      </p>
      {demo ? <PassportView b={demo} qr={qr} url={url} offlineQr={offlineQr} offlineUrl={offlineUrl} /> : <p className="mo-err">The issuer key is not configured on this server.</p>}

      {sealed.length > 0 && (
        <>
          <h2 className="pl-h">Sealed passports in the archive</h2>
          <div className="pl-list">
            {sealed.map((s) => (
              <a key={s.cert} href={`/passport/${s.cert}`} className="pl-item">
                {s.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(s.photo)} alt="" />
                ) : (
                  <span className="pl-noimg" />
                )}
                <b>{s.cert}</b>
                <span>{s.band}</span>
                <span className="pl-v">{s.versions} records</span>
              </a>
            ))}
          </div>
        </>
      )}

      <h2 className="pl-h">Built so it cannot be hijacked</h2>
      <div className="tablewrap">
        <table className="pl-table">
          <thead>
            <tr><th>If someone…</th><th>What stops them</th></tr>
          </thead>
          <tbody>
            <tr><td>breaks into our server or database</td><td>They hold only one of the two keys. Without a founder&apos;s device key, no new record verifies.</td></tr>
            <tr><td>steals a founder&apos;s phone</td><td>The device key alone is not enough — the server must co-sign, behind the admin login. The stolen key is revoked from another device or the offline recovery key.</td></tr>
            <tr><td>tries to add their own key</td><td>New keys must be approved by a key that is already active. The keyring is public and anchored on Solana.</td></tr>
            <tr><td>edits or deletes an old record</td><td>The hash chain breaks, the database refuses the change, and the Solana anchor shows the original.</td></tr>
            <tr><td>swaps the whole keyring</td><td>Verifiers remember the keyring&apos;s root. A different root triggers a warning.</td></tr>
            <tr><td>takes the website down</td><td>The proof file and the offline QR still verify with the public keys alone.</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="pl-h">Ready for the EU Digital Product Passport</h2>
      <p className="mo-lead">
        The EU will require digital product passports for textiles, with the rules expected in 2027. Our record follows the six expected categories and adds what a one-of-a-kind
        vintage piece needs: provenance and a physical fingerprint.
      </p>
      <div className="tablewrap">
        <table className="pl-table">
          <thead>
            <tr><th>Passport section</th><th>EU DPP category</th></tr>
          </thead>
          <tbody>
            {DPP_SECTIONS.map((s) => (
              <tr key={s.key}><td>{s.title}</td><td>{s.espr}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="pl-h">Roadmap on Solana</h2>
      <ol className="pl-road">
        <li className="done"><b>Now</b> Two-key signed records, founder keyring, offline verifier, and an anchor on Solana devnet at every change.</li>
        <li><b>Next</b> Anchors on Solana mainnet. NFC tap verifies the chip&apos;s one-time code on this page.</li>
        <li><b>Then</b> Claim: the buyer taps and receives the record as a Solana asset (Metaplex Core / compressed), with no wallet setup.</li>
        <li><b>Later</b> Owners re-scan to add new wear — the record grows, and so does the story. XRPL mirror for payments partners.</li>
      </ol>

      <h2 className="pl-h">Verify without us</h2>
      <pre className="pl-code">{SNIPPET}</pre>
      <p className="mo-fine">
        Public key: <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a> · Any passport as JSON: <a href="/api/passport/GC-DEMO-1">/api/passport/GC-DEMO-1</a> · Protocol GCPP/2
        (SHA-256, Ed25519 + ECDSA P-256, canonical JSON). Keyring: <a href="/api/keyring">/api/keyring</a> · Offline verifier: <a href="/verify">/verify</a> · <a href="/spec">Read the full specification</a>
      </p>
    </MoShell>
  );
}
