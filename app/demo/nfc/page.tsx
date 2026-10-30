import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import NfcDiagram from '@/components/NfcDiagram';
import NfcSystem3DLazy from '@/components/NfcSystem3DLazy';
import SolanaTree3DLazy from '@/components/SolanaTree3DLazy';
import CapViewerLazy from '@/components/CapViewerLazy';
import { DEMO_ITEMS, demoCert } from '@/lib/demoData';
import GcIcon, { IconRow, SvgIcon } from '@/components/GcIcon';

export const metadata: Metadata = {
  title: 'How the NFC tag and Solana work — Gallery Crypto',
  description: 'What is inside the NFC tag, what one tap does, what goes on Solana and what never does, and how to check every piece yourself.',
};

// 記録をまとめて1つの指紋（ルート）にし、Solana に書く流れの図
function TreeFigure() {
  const INK = '#111111', MUTE = '#6B6862', LINE = '#B9B4AB', CU = '#C47A45';
  const SANS = 'Archivo, "Noto Sans JP", sans-serif', MONO = '"JetBrains Mono", monospace';
  const leaves = ['Sourced', 'Catalogued', 'Fingerprinted', 'Sealed'];
  return (
    <svg className="sol-fig" viewBox="0 0 760 330" role="img" aria-label="Four records each get a fingerprint. Pairs are combined until one root fingerprint is left. Only that root is written to Solana.">
      {leaves.map((l, i) => {
        const x = 20 + i * 185;
        return (
          <g key={l}>
            <rect x={x} y={232} width={165} height={78} fill="#fff" stroke={INK} />
            <SvgIcon name="fingerprint" x={x + 12} y={244} size={34} />
            <text x={x + 56} y={258} fontFamily={SANS} fontSize="13" fill={INK}>Record {i + 1}</text>
            <text x={x + 56} y={276} fontFamily={SANS} fontSize="11.5" fill={MUTE}>{l}</text>
            <text x={x + 12} y={300} fontFamily={MONO} fontSize="10" fill={MUTE}>{['a1f4…', '9c02…', '47de…', 'e8b3…'][i]}</text>
            <line x1={x + 82} y1={232} x2={i < 2 ? 195 : 565} y2={170} stroke={LINE} />
          </g>
        );
      })}
      {[195, 565].map((x, i) => (
        <g key={x}>
          <rect x={x - 70} y={130} width={140} height={40} fill="#fff" stroke={INK} />
          <text x={x} y={155} textAnchor="middle" fontFamily={MONO} fontSize="11" fill={INK}>{i ? 'combine 3 + 4' : 'combine 1 + 2'}</text>
          <line x1={x} y1={130} x2={380} y2={82} stroke={LINE} />
        </g>
      ))}
      <rect x={250} y={30} width={260} height={52} fill={INK} />
      <text x={380} y={52} textAnchor="middle" fontFamily={SANS} fontSize="12" letterSpacing="2" fill="#FAFAF8">ONE ROOT FINGERPRINT</text>
      <text x={380} y={71} textAnchor="middle" fontFamily={MONO} fontSize="11" fill="#D9D4CA">5f2e9a…c41b · 32 bytes</text>
      <path d="M510 56 H600" stroke={CU} strokeWidth="1.5" markerEnd="url(#solA)" />
      <defs><marker id="solA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill={CU} /></marker></defs>
      <SvgIcon name="ledger" x={612} y={26} size={52} tone="copper" />
      <text x={612} y={98} fontFamily={SANS} fontSize="12.5" fill={INK}>Solana</text>
      <text x={612} y={115} fontFamily={SANS} fontSize="11.5" fill={MUTE}>memo, signed by our</text>
      <text x={612} y={130} fontFamily={SANS} fontSize="11.5" fill={MUTE}>issuer address</text>
    </svg>
  );
}

const FAQ: [string, string][] = [
  ['Can someone copy the tag?', 'They can copy the link it showed last time, but not the chip’s secret key. Every tap makes a new one-time code with a counter that only goes up, so an old code replayed by a copy is rejected. (The code check arrives with GCPP/3; today the two signatures and the photo fingerprint do the proving.)'],
  ['Can the tag be moved to another cap?', 'The antenna is printed so that peeling the label off tears it, and the tag stops answering. The record also holds macro photos of this cap’s own thread and wear — a different cap does not match them.'],
  ['Does the tag track me?', 'No. The tag holds a link and nothing else, and a tap opens a normal web page. The record never stores who tapped, when, or where.'],
  ['Does it need charging or an app?', 'No battery, no app. The phone’s own NFC field powers the chip for the moment it is read.'],
  ['What if Gallery Crypto or this website closes?', 'Download the proof file from any passport. It checks with the public keys alone, and the Solana timestamps stay public. Nothing depends on us staying online.'],
  ['Can I wash the cap?', 'Spot clean, as with any vintage cap. The tag is sealed against sweat and light moisture; avoid machine washing and tumble drying.'],
];

export default function NfcPage() {
  return (
    <MoShell title="One tap, one proof" kicker="Demo · NFC tag and Solana">
      <p className="mo-lead">Every piece carries a small NFC tag sewn inside it — on a cap, inside the back. Tap it with any phone and the piece proves itself: two signatures, an unbroken chain of records, and a public timestamp on Solana. No app, no account, and it still works with no signal.</p>

      <nav className="sol-toc" aria-label="On this page">
        <a href="#glance"><GcIcon name="tree" size={36} />The system at a glance</a>
        <a href="#tag"><GcIcon name="chip" size={36} tone="copper" />Inside the tag</a>
        <a href="#tap"><GcIcon name="tap" size={36} />What one tap does</a>
        <a href="#solana"><GcIcon name="ledger" size={36} />Solana, in plain words</a>
        <a href="#check"><GcIcon name="search" size={36} />Check it yourself</a>
        <a href="#faq"><GcIcon name="eye" size={36} />Questions</a>
      </nav>

      <h2 className="pl-h" id="glance">The system at a glance</h2>
      <NfcDiagram />

      <h2 className="pl-h" id="tag">Inside the tag</h2>
      <p className="mo-lead">A woven label about the size of a stamp, cut from the cap’s own fabric. Inside it sits an NFC inlay — a coil of copper and a chip thinner than paper.</p>
      <div className="pp-3d">
        <CapViewerLazy compact pieces={[{ n: 1, band: DEMO_ITEMS[0].band, title: DEMO_ITEMS[0].title, year: DEMO_ITEMS[0].year, cert: demoCert(1), cap: DEMO_ITEMS[0].cap, qr: '' }]} />
      </div>
      <div className="sol-grid">
        <IconRow name="chip" tone="copper" title="NTAG 424 DNA chip">An NFC chip made for proving authenticity. It holds a secret AES-128 key that can be used but never read out — not even by us.</IconRow>
        <IconRow name="antenna" title="Copper antenna, no battery">The coil catches the phone’s field (13.56 MHz) and powers the chip for the instant it is read. Nothing to charge, nothing to wear out.</IconRow>
        <IconRow name="lock" title="A code that is never the same">Each tap, the chip counts up by one and signs the count with its key. The phone receives a link carrying that one-time code.</IconRow>
        <IconRow name="copy" title="Copies fail">A copied tag can only repeat an old code. The counter has already moved on, so the check rejects it.</IconRow>
        <IconRow name="move" title="Moving it breaks it">The antenna tears if the label is peeled away, and a torn tag stops answering. It is sewn in, not stuck on.</IconRow>
        <IconRow name="eye" title="No personal data">The tag stores one link. Who owns the piece, what it cost and who tapped it are never on the tag or in the record.</IconRow>
      </div>

      <h2 className="pl-h">In 3D</h2>
      <p className="mo-lead">Open the label layer by layer, then follow a tap through the whole system.</p>
      <NfcSystem3DLazy />

      <h2 className="pl-h" id="tap">What one tap does — in about two seconds</h2>
      <ol className="sol-steps">
        <li><GcIcon name="antenna" size={52} /><div><b>1 · The phone wakes the chip</b><span>Hold the phone near the tag. Its field powers the chip.</span></div></li>
        <li><GcIcon name="chip" size={52} tone="copper" status="next" /><div><b>2 · The chip makes a one-time code</b><span>It counts up and signs the count. Checking this code on our side arrives with GCPP/3.</span></div></li>
        <li><GcIcon name="tap" size={52} /><div><b>3 · The passport opens</b><span>The phone shows a notification and opens the piece’s page. No app.</span></div></li>
        <li><GcIcon name="shield" size={52} tone="ok" /><div><b>4 · Your phone checks the signatures</b><span>Every record is checked in your browser: our server key, a founder’s device key, and the chain from one record to the next.</span></div></li>
        <li><GcIcon name="clock" size={52} /><div><b>5 · The timestamp is public</b><span>Each record is covered by a fingerprint written to Solana. Anyone can look it up.</span></div></li>
      </ol>
      <div className="sol-phones">
        <IconRow name="phone" title="iPhone">iPhone XS or later reads tags with no setup. Hold the top edge of the phone near the tag.</IconRow>
        <IconRow name="phone" title="Android">Turn on NFC in Settings if it is off. Hold the middle of the back of the phone near the tag.</IconRow>
        <IconRow name="qr" title="No NFC?">Scan the QR on the hang tag with the camera. It opens the same passport.</IconRow>
      </div>

      <h2 className="pl-h" id="solana">Solana, in plain words</h2>
      <p className="mo-lead">Solana is a public record-keeping network that nobody owns and nobody can rewrite. We use it for one thing only: a timestamp that proves our records existed, unchanged, at a certain moment.</p>
      <SolanaTree3DLazy />
      <details className="pp-more">
        <summary>Show the same thing as a flat diagram</summary>
        <div className="sol-figwrap"><TreeFigure /></div>
      </details>
      <div className="sol-two">
        <div>
          <p className="sol-h"><GcIcon name="shield" size={30} tone="ok" /> On Solana</p>
          <ul className="sol-list ok">
            <li>One 32-byte fingerprint per batch of records (a “Merkle root”)</li>
            <li>How many records the batch covers</li>
            <li>The time Solana accepted it</li>
            <li>Our issuer address, which signed it</li>
          </ul>
        </div>
        <div>
          <p className="sol-h"><GcIcon name="lock" size={30} tone="ng" /> Never on Solana</p>
          <ul className="sol-list ng">
            <li>Names of owners or buyers</li>
            <li>Prices, payments or addresses</li>
            <li>Photos or product details</li>
            <li>Anything that could identify a person</li>
          </ul>
        </div>
      </div>
      <div className="sol-grid">
        <IconRow name="fingerprint" title="Fingerprints, not data">A fingerprint (SHA-256) can be made from a record, but the record can never be rebuilt from it. Change one letter and the fingerprint changes completely.</IconRow>
        <IconRow name="tree" title="Many records, one entry">Fingerprints are paired and combined until one root is left. One Solana entry then covers every record in the batch.</IconRow>
        <IconRow name="clock" title="After every change, and daily">A batch is written right after each new record and once a day at 03:00 Tokyo time.</IconRow>
        <IconRow name="ledger" title="Cheap and fast">An entry costs Solana’s base fee — 0.000005 SOL, a tiny fraction of a cent — and is confirmed in seconds.</IconRow>
        <IconRow name="founder" title="One key, two jobs">Our issuer key signs every record and is also our Solana address, so the same key you check on a passport is the one you see on Solana.</IconRow>
        <IconRow name="offline" title="Optional by design">If Solana ever stopped, every passport would still verify with its signatures. The chain adds an outside witness; it is never the only proof.</IconRow>
      </div>
      <p className="sol-status"><GcIcon name="warn" size={30} tone="copper" /> <span><b>Now:</b> entries go to Solana’s test network (devnet) while we prepare launch. <b>Next:</b> Solana mainnet, together with the chip’s one-time code check.</span></p>

      <h2 className="pl-h" id="check">Check it yourself</h2>
      <ol className="sol-steps">
        <li><GcIcon name="tap" size={52} /><div><b>1 · Open a passport</b><span>Tap the tag, scan the hang-tag QR, or open <a href="/passport/GC-DEMO-1">the demo passport</a>.</span></div></li>
        <li><GcIcon name="shield" size={52} tone="ok" /><div><b>2 · Read the five answers at the top</b><span>The tag, signed by Gallery Crypto, approved by a founder, nothing changed, public timestamp — each with a clear ✓ or ✕.</span></div></li>
        <li><GcIcon name="search" size={52} /><div><b>3 · Press “Check on Solana”</b><span>In the Public timestamp box. Your browser asks a public Solana node directly and confirms our root is in that entry.</span></div></li>
        <li><GcIcon name="ledger" size={52} tone="copper" /><div><b>4 · Or look it up in an explorer</b><span>Press “Explorer”. Find the memo starting <code>GCPP/2 root:</code> and compare it with the root shown on the passport.</span></div></li>
        <li><GcIcon name="download" size={52} /><div><b>5 · Keep a copy</b><span>Download the proof file. It checks offline at <a href="/verify">/verify</a>, even if this site is gone.</span></div></li>
      </ol>

      <h2 className="pl-h" id="faq">Questions</h2>
      <div className="sol-faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>

      <p className="mo-links">
        <a href="/demo/3d">See the tag inside the cap in 3D →</a>
        <a href="/passport/GC-DEMO-1">Open the demo passport →</a>
        <a href="/spec">Read the full specification →</a>
      </p>
    </MoShell>
  );
}
