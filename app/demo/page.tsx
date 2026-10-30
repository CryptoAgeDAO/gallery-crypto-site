import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import HashCheck from '@/components/HashCheck';
import { demoPassport } from '@/lib/passportPublic';
import { DEMO_ITEMS } from '@/lib/demoData';
import { compactOf } from '@/lib/gcpp';
import { siteUrl } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Demo — Gallery Crypto',
  description: 'Follow one piece from the tag to a signed record you can check yourself — with images, live codes and no account.',
};

const svg = (text: string, ecc: 'L' | 'M') => QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: ecc, color: { dark: '#111111', light: '#ffffff' } });

// 画像でたどるデモ：作品 → タグ → パスポート → 指紋 → 偽造の失敗 → 電波なしの照合
export default async function Demo() {
  const it = DEMO_ITEMS[0];
  const b = await demoPassport(1);
  const base = siteUrl();
  const passUrl = `${base}/passport/GC-DEMO-1`;
  const qr = await svg(passUrl, 'M');
  const offUrl = b ? `${base}/verify#${compactOf(b.entries[b.entries.length - 1], 9001)}` : '';
  const offQr = offUrl ? await svg(offUrl, 'L') : '';
  return (
    <MoShell title="Follow one piece" kicker="Demo · about two minutes">
      <p className="mo-lead">
        One tee, start to finish. Everything below is live: scan the codes with your phone, open the record, check the photo and try to fake it. No account, no wallet. The band and the
        artwork are fictional.
      </p>

      <ol className="dm">
        <li className="dm-step">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dm-img" src={it.photos[0]} alt={`${it.band} ${it.title} tee`} />
          <div className="dm-text">
            <p className="dm-n">01 — The piece</p>
            <h2>{it.band}, {it.title} {it.year}</h2>
            <p>A single-stitch tee found through a dealer in Los Angeles. There is only one. Everything that happens to it from here is written down — and signed.</p>
            <a className="mo-btn ghost small" href="/demo/3d">Turn it in 3D →</a> <a className="mo-btn ghost small" href="/demo/nfc">How the NFC tag works →</a>
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-tag">
            <span className="dm-hole" aria-hidden />
            <p className="dm-tagb">Gallery Crypto</p>
            <p className="dm-tagc">GC-DEMO-1</p>
            <p className="dm-tagn">{it.band}</p>
            <span className="dm-qr" aria-label="QR code that opens the passport" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="dm-tags">Scan for provenance</p>
          </div>
          <div className="dm-text">
            <p className="dm-n">02 — The tag</p>
            <h2>Scan it now</h2>
            <p>Point your phone camera at this code. In the shop, you tap the NFC chip sewn inside the label — it opens the same page, and the chip cannot be copied.</p>
            <a className="mo-btn ghost small" href="/passport/GC-DEMO-1">Or open it here →</a>
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/shot-passport.png" alt="The passport page on a phone, showing an authentic record" />
          </div>
          <div className="dm-text">
            <p className="dm-n">03 — The passport</p>
            <h2>A record that checks itself</h2>
            <p>
              Every step — sourced, catalogued, fingerprinted, sealed — is signed twice: by our server and by a founder&apos;s device that never lets its key out. Your phone checks the
              signatures itself, not our server.
            </p>
            <a className="mo-btn ghost small" href="/passport/GC-DEMO-1">Open the passport →</a>
          </div>
        </li>

        <li className="dm-step">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dm-img" src={it.photos[1]} alt="Close-up of the cracked print" />
          <div className="dm-text">
            <p className="dm-n">04 — The fingerprint</p>
            <h2>The print, photographed up close</h2>
            <p>Cracks in an old print never repeat. This macro photo&apos;s fingerprint is sealed in the record. A copy of the tee would not match.</p>
            <HashCheck src={it.photos[1]} expected={it.macroHash} />
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/shot-fake.png" alt="The passport after the dealer name was changed: the record is broken" />
          </div>
          <div className="dm-text">
            <p className="dm-n">05 — Try to fake it</p>
            <h2>Change one word. Watch it break.</h2>
            <p>On the passport, edit the dealer&apos;s name in your own copy. The check fails at once — a new record needs both keys, and nobody holds both.</p>
            <a className="mo-btn ghost small" href="/passport/GC-DEMO-1">Try it on the passport →</a>
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-tag dm-tag-w">
            <span className="dm-qr big" aria-label="Offline proof QR code" dangerouslySetInnerHTML={{ __html: offQr }} />
            <p className="dm-tags">Offline proof · 174 bytes</p>
          </div>
          <div className="dm-text">
            <p className="dm-n">06 — No signal</p>
            <h2>Still works in a basement</h2>
            <p>This code carries the two signatures themselves. Open the verifier once, then switch on airplane mode and scan it — the answer still comes from your phone alone.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dm-small" src="/demo/shot-offline.png" alt="The offline verifier showing Authentic with no connection" />
            <a className="mo-btn ghost small" href="/verify">Open the verifier →</a>
          </div>
        </li>

        <li className="dm-step dm-end">
          <div className="dm-text">
            <p className="dm-n">07 — For good</p>
            <h2>Outlives the website</h2>
            <p>Every change is also written as one fingerprint to Solana. Download the proof file from the passport and it verifies with the public keys alone — even if this site disappears.</p>
            <p className="mo-links">
              <a href="/proof">See the proof lab →</a>
              <a href="/spec">Read the specification →</a>
              <a href="/#archive">Back to the archive →</a>
            </p>
          </div>
        </li>
      </ol>
    </MoShell>
  );
}
