import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import HashCheck from '@/components/HashCheck';
import { demoPassport } from '@/lib/passportPublic';
import { DEMO_ITEMS } from '@/lib/demoData';
import { compactOf } from '@/lib/gcpp';
import { siteUrl } from '@/lib/server';
import { getT } from '@/lib/lang';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Demo — Gallery Crypto',
  description: 'Follow one piece from the tag to a signed record you can check yourself — with images, live codes and no account.',
};

const svg = (text: string, ecc: 'L' | 'M') => QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: ecc, color: { dark: '#111111', light: '#ffffff' } });

// 画像でたどるデモ：作品 → タグ → パスポート → 指紋 → 偽造の失敗 → 電波なしの照合
export default async function Demo() {
  const t = getT();
  const it = DEMO_ITEMS[0];
  const b = await demoPassport(1);
  const base = siteUrl();
  const passUrl = `${base}/passport/GC-DEMO-1`;
  const qr = await svg(passUrl, 'M');
  const offUrl = b ? `${base}/verify#${compactOf(b.entries[b.entries.length - 1], 9001)}` : '';
  const offQr = offUrl ? await svg(offUrl, 'L') : '';
  return (
    <MoShell title={t('Follow one piece', '一点の作品をたどる')} kicker={t('Demo · about two minutes', 'デモ · 約2分')}>
      <p className="mo-lead">
        {t('One cap, start to finish. Everything below is live: scan the codes with your phone, open the record, check the photo and try to fake it. No account, no wallet. The band and the artwork are fictional.', 'ひとつのキャップを最初から最後まで。下はすべて本物の動きです。スマホでコードを読み取り、記録を開き、写真を確かめ、偽造を試してください。アカウントもウォレットも不要です。バンドとアートワークは架空のものです。')}
      </p>

      <ol className="dm">
        <li className="dm-step">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dm-img" src={it.photos[0]} alt={`${it.band} ${it.title} ${t('cap', 'キャップ')}`} />
          <div className="dm-text">
            <p className="dm-n">01 — {t('The piece', '作品')}</p>
            <h2>{it.band}, {it.title} {it.year}</h2>
            <p>{t('A 1991 tour cap found through a dealer in Los Angeles. There is only one. Everything that happens to it from here is written down — and signed.', 'ロサンゼルスのディーラーを通じて見つけた1991年のツアーキャップ。世界にひとつだけです。ここから起きることはすべて記録され、署名されます。')}</p>
            <a className="mo-btn ghost small" href="/demo/3d">{t('Turn it in 3D →', '3Dで回す →')}</a> <a className="mo-btn ghost small" href="/demo/nfc">{t('How the NFC tag works →', 'NFCタグの仕組み →')}</a>
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-tag">
            <span className="dm-hole" aria-hidden />
            <p className="dm-tagb">Gallery Crypto</p>
            <p className="dm-tagc">GC-DEMO-1</p>
            <p className="dm-tagn">{it.band}</p>
            <span className="dm-qr" aria-label={t('QR code that opens the passport', 'パスポートを開くQRコード')} dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="dm-tags">{t('Scan for provenance', '読み取って来歴を見る')}</p>
          </div>
          <div className="dm-text">
            <p className="dm-n">02 — {t('The tag', 'タグ')}</p>
            <h2>{t('Scan it now', 'いま読み取ってみる')}</h2>
            <p>{t('Point your phone camera at this code. In the shop, you tap the NFC tag sewn inside the back of the cap — it opens the same page, and the chip cannot be copied.', 'スマホのカメラをこのコードに向けてください。お店では、キャップの後ろの内側に縫い込んだNFCタグをタップします。同じページが開き、チップはコピーできません。')}</p>
            <a className="mo-btn ghost small" href="/passport/GC-DEMO-1">{t('Or open it here →', 'ここで開く →')}</a>
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/shot-passport.png" alt={t('The passport page on a phone, showing an authentic record', 'スマホに表示したパスポート。本物の記録と表示されている')} />
          </div>
          <div className="dm-text">
            <p className="dm-n">03 — {t('The passport', 'パスポート')}</p>
            <h2>{t('A record that checks itself', '自分で確かめられる記録')}</h2>
            <p>
              {t("Every step — sourced, catalogued, fingerprinted, sealed — is signed twice: by our server and by a founder's device that never lets its key out. Your phone checks the signatures itself, not our server.", '入手・登録・指紋の記録・確定の各段階を、二重に署名します。私たちのサーバーと、鍵を外に出さない創業者の端末です。署名を確かめるのは私たちのサーバーではなく、あなたのスマホ自身です。')}
            </p>
            <a className="mo-btn ghost small" href="/passport/GC-DEMO-1">{t('Open the passport →', 'パスポートを開く →')}</a>
          </div>
        </li>

        <li className="dm-step">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dm-img" src={it.photos[1]} alt={t('Close-up of the embroidery', '刺繍の接写')} />
          <div className="dm-text">
            <p className="dm-n">04 — {t('The fingerprint', '指紋')}</p>
            <h2>{t('The embroidery, photographed up close', '刺繍を接写する')}</h2>
            <p>{t("Thread, fade and wear never fall the same way twice. This macro photo's fingerprint is sealed in the record. A copy of the cap would not match.", '糸、色あせ、着用感が同じになることは二度とありません。この接写写真の指紋（ハッシュ）は記録に封じ込められています。キャップを複製しても一致しません。')}</p>
            <HashCheck src={it.photos[1]} expected={it.macroHash} />
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/demo/shot-fake.png" alt={t('The passport after the dealer name was changed: the record is broken', 'ディーラー名を書き換えたあとのパスポート。記録が壊れている')} />
          </div>
          <div className="dm-text">
            <p className="dm-n">05 — {t('Try to fake it', '偽造を試す')}</p>
            <h2>{t('Change one word. Watch it break.', '一語変えるだけで、壊れる')}</h2>
            <p>{t("On the passport, edit the dealer's name in your own copy. The check fails at once — a new record needs both keys, and nobody holds both.", 'パスポートで、手元のコピーのディーラー名を書き換えてみてください。確認はすぐ失敗します。新しい記録には2つの鍵が必要で、両方を持つ人はいません。')}</p>
            <a className="mo-btn ghost small" href="/passport/GC-DEMO-1">{t('Try it on the passport →', 'パスポートで試す →')}</a>
          </div>
        </li>

        <li className="dm-step">
          <div className="dm-tag dm-tag-w">
            <span className="dm-qr big" aria-label={t('Offline proof QR code', 'オフライン証明のQRコード')} dangerouslySetInnerHTML={{ __html: offQr }} />
            <p className="dm-tags">{t('Offline proof · 174 bytes', 'オフライン証明 · 174バイト')}</p>
          </div>
          <div className="dm-text">
            <p className="dm-n">06 — {t('No signal', '電波なし')}</p>
            <h2>{t('Still works in a basement', '地下でも使える')}</h2>
            <p>{t('This code carries the two signatures themselves. Open the verifier once, then switch on airplane mode and scan it — the answer still comes from your phone alone.', 'このコードには2つの署名そのものが入っています。検証ツールを一度開いてから機内モードにして読み取ってみてください。答えはあなたのスマホだけで出ます。')}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dm-small" src="/demo/shot-offline.png" alt={t('The offline verifier showing Authentic with no connection', '通信なしで「本物」と表示したオフライン検証ツール')} />
            <a className="mo-btn ghost small" href="/verify">{t('Open the verifier →', '検証ツールを開く →')}</a>
          </div>
        </li>

        <li className="dm-step dm-end">
          <div className="dm-text">
            <p className="dm-n">07 — {t('For good', 'いつまでも')}</p>
            <h2>{t('Outlives the website', 'サイトより長く残る')}</h2>
            <p>{t('Every change is also written as one fingerprint to Solana. Download the proof file from the passport and it verifies with the public keys alone — even if this site disappears.', '変更のたびに、1つの指紋として Solana にも書き込みます。パスポートから証明ファイルをダウンロードしておけば、このサイトがなくなっても公開鍵だけで確かめられます。')}</p>
            <p className="mo-links">
              <a href="/proof">{t('See the proof lab →', 'Proof Lab を見る →')}</a>
              <a href="/spec">{t('Read the specification →', '仕様書を読む →')}</a>
              <a href="/#archive">{t('Back to the archive →', 'アーカイブに戻る →')}</a>
            </p>
          </div>
        </li>
      </ol>
    </MoShell>
  );
}
