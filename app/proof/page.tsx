import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import PassportView from '@/components/PassportView';
import { demoPassport, listSealed } from '@/lib/passportPublic';
import { siteUrl } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';
import { DPP_SECTIONS } from '@/lib/dpp';
import { compactOf } from '@/lib/gcpp';
import { getLang } from '@/lib/lang';
import { makeT } from '@/lib/i18n';
import { dl } from '@/lib/dppJa';

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
  const lang = getLang();
  const t = makeT(lang);
  const ja = lang === 'ja';
  const demo = await demoPassport();
  const sealed = await listSealed();
  const url = `${siteUrl()}/passport/GC-DEMO-1`;
  const offlineUrl = demo ? `${siteUrl()}/verify#${compactOf(demo.entries[demo.entries.length - 1], 9001)}` : '';
  const offlineQr = offlineUrl ? await QRCode.toString(offlineUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'L', color: { dark: '#111111', light: '#00000000' } }) : '';
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#111111', light: '#00000000' } });
  const ROWS: [string, string][] = [
    [t('breaks into our server or database', 'サーバーやデータベースに侵入する'), t("They hold only one of the two keys. Without a founder's device key, no new record verifies.", '手に入るのは2つの鍵のうち1つだけです。創業者の端末の鍵がなければ、新しい記録は検証を通りません。')],
    [t("steals a founder's phone", '創業者のスマホを盗む'), t('The device key alone is not enough — the server must co-sign, behind the admin login. The stolen key is revoked from another device or the offline recovery key.', '端末の鍵だけでは足りません。管理者ログインの奥にあるサーバーの署名も必要です。盗まれた鍵は、別の端末やオフラインの復旧鍵から取り消せます。')],
    [t('tries to add their own key', '自分の鍵を追加しようとする'), t('New keys must be approved by a key that is already active. The keyring is public and anchored on Solana.', '新しい鍵は、すでに有効な鍵の承認が必要です。鍵の台帳は公開され、Solana に刻印されています。')],
    [t('edits or deletes an old record', '古い記録を書き換える・消す'), t('The hash chain breaks, the database refuses the change, and the Solana anchor shows the original.', 'ハッシュのつながりが壊れ、データベースが変更を拒み、Solana の刻印が元の内容を示します。')],
    [t('swaps the whole keyring', '鍵の台帳ごとすり替える'), t("Verifiers remember the keyring's root. A different root triggers a warning.", '検証する側は台帳の起点を覚えています。起点が違えば警告が出ます。')],
    [t('takes the website down', 'サイトを停止させる'), t('The proof file and the offline QR still verify with the public keys alone.', '証明ファイルとオフラインのQRは、公開鍵だけで検証できます。')],
  ];
  return (
    <MoShell title={t('Proof that outlives the platform', 'プラットフォームより長く残る証明')} kicker="Proof Lab · GCPP/2">
      <p className="mo-lead">
        {ja ? (
          <>Gallery Crypto の作品はすべて一点ものです。パスポートは3つのことを証明します。<b>この実物であること</b>、<b>どこから来たか</b>、<b>何でできているか</b>。私たちもマーケットプレイスも、特定のブロックチェーンも信用せずに、誰でも、いつまでも確かめられる形で。</>
        ) : (
          <>Every Gallery Crypto piece is one of a kind. Its passport proves three things: <b>this exact object</b>, <b>where it came from</b>, and <b>what it is made of</b> — in a way
          anyone can check, forever, without trusting us, a marketplace, or any single blockchain.</>
        )}
      </p>

      <ol className="pl-layers">
        <li>
          <span className="pl-n">1</span>
          <h3>{t('The object', '実物')}</h3>
          <p>{t('An NFC chip (NTAG 424 DNA) is sewn deep into the collar. Every tap carries a one-time code, so a copied tag fails. Macro photos of the unique wear are hashed — a fake body with a real-looking tag still does not match.', 'NFCチップ（NTAG 424 DNA）を襟の奥に縫い込みます。タップのたびに使い捨てのコードが出るので、コピーしたタグは通りません。一点ごとの着用感を接写した写真もハッシュ化するため、本物らしいタグを付けた偽物の本体も一致しません。')}</p>
          <span className="pl-tag">{t('Physical', '物理')}</span>
        </li>
        <li>
          <span className="pl-n">2</span>
          <h3>{t('The signed record', '署名つきの記録')}</h3>
          <p>
            {ja ? (
              <>入手・登録・指紋の記録・販売の各段階を、<b>二重</b>に署名します。サーバーの鍵と、端末の外に出ない創業者の端末の鍵です。各記録は一つ前とつながっているので、気づかれずに書き換え・削除・差し込みはできません。<b>ブロックチェーンもインターネットもなしで</b>確かめられます。</>
            ) : (
              <>Each step — sourced, catalogued, fingerprinted, sold — is signed <b>twice</b>: by our server key and by a founder&apos;s device key that can never leave the device. Each record links to the one before, so nothing can be edited, removed or inserted unseen. Works with <b>no blockchain and no internet</b>.</>
            )}
          </p>
          <span className="pl-tag">{t('Chain-independent', 'チェーンに依存しない')}</span>
        </li>
        <li>
          <span className="pl-n">3</span>
          <h3>{t('The public anchor', '公開の刻印')}</h3>
          <p>{t('Records are rolled into one hash and written to Solana. It costs a fraction of a cent and adds a timestamp nobody can change. If the chain ever changes, the records above still verify.', '記録を1つのハッシュにまとめて Solana に書き込みます。費用は1セント未満で、誰にも変えられない日時の証明が加わります。チェーンが変わっても、上の記録はそのまま検証できます。')}</p>
          <span className="pl-tag">Solana</span>
        </li>
      </ol>

      <h2 className="pl-h">{t('Live demo — check it yourself', 'ライブデモ — ご自身で確かめる')}</h2>
      <p className="mo-links"><a href="/demo">{t('Prefer a guided tour with images? Follow one piece →', '画像つきの案内がよければ、一点の作品をたどる →')}</a><a href="/demo/nfc">{t('How the NFC tag works — diagram and 3D →', 'NFCタグの仕組み — 図と3D →')}</a><a href="/ledger">{t('Public ledger — every write to Solana →', '公開台帳 — Solana への書き込みすべて →')}</a></p>
      <p className="mo-lead">
        {ja ? (
          <>このデモのパスポートは、本物の発行者の鍵でいま署名し、あなたのブラウザで確かめています。下の<b>「偽造を試す」</b>までスクロールしてください。QRコードをスマホで読み取ると、NFCタップで開くページが見られます。</>
        ) : (
          <>This demo passport is signed right now with the real issuer key and checked in your browser. Scroll down to <b>Try to fake it</b>. Scan the QR code with a phone — that
          is what an NFC tap opens.</>
        )}
      </p>
      {demo ? <PassportView b={demo} qr={qr} url={url} offlineQr={offlineQr} offlineUrl={offlineUrl} /> : <p className="mo-err">{t('The issuer key is not configured on this server.', 'このサーバーには発行者の鍵が設定されていません。')}</p>}

      {sealed.length > 0 && (
        <>
          <h2 className="pl-h">{t('Sealed passports in the archive', 'アーカイブの確定済みパスポート')}</h2>
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
                <span className="pl-v">{t(`${s.versions} records`, `${s.versions}件の記録`)}</span>
              </a>
            ))}
          </div>
        </>
      )}

      <h2 className="pl-h">{t('Built so it cannot be hijacked', '乗っ取られない作り')}</h2>
      <div className="tablewrap">
        <table className="pl-table">
          <thead>
            <tr><th>{t('If someone…', 'もし誰かが…')}</th><th>{t('What stops them', '止める仕組み')}</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}
          </tbody>
        </table>
      </div>

      <h2 className="pl-h">{t('Ready for the EU Digital Product Passport', 'EUデジタル製品パスポートに対応')}</h2>
      <p className="mo-lead">
        {t('The EU will require digital product passports for textiles, with the rules expected in 2027. Our record follows the six expected categories and adds what a one-of-a-kind vintage piece needs: provenance and a physical fingerprint.', 'EUは繊維製品にデジタル製品パスポートを義務づける予定で、細則は2027年の見込みです。私たちの記録は想定される6つの分類に沿い、一点もののヴィンテージに必要な「来歴」と「物理的な指紋」を加えています。')}
      </p>
      <div className="tablewrap">
        <table className="pl-table">
          <thead>
            <tr><th>{t('Passport section', 'パスポートの項目')}</th><th>{t('EU DPP category', 'EU DPP の分類')}</th></tr>
          </thead>
          <tbody>
            {DPP_SECTIONS.map((s) => (
              <tr key={s.key}><td>{dl(lang, s.title)}</td><td>{dl(lang, s.espr)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="pl-h">{t('Roadmap on Solana', 'Solana でのロードマップ')}</h2>
      <ol className="pl-road">
        <li className="done"><b>{t('Now', '現在')}</b> {t('Two-key signed records, founder keyring, offline verifier, an anchor on Solana at every change, and an NFC tap check of the chip’s one-time code.', '2つの鍵で署名した記録、創業者の鍵の台帳、オフライン検証ツール、変更ごとの Solana への刻印、チップの使い捨てコードを確かめるNFCタップ。')}</li>
        <li><b>{t('Next', '次')}</b> {t('Anchors on Solana mainnet for every real piece.', 'すべての本物の作品を Solana のメインネットに刻印。')}</li>
        <li><b>{t('Then', 'その次')}</b> {t('Claim: the buyer taps and receives the record as a Solana asset (Metaplex Core / compressed), with no wallet setup.', '受け取り：購入者がタップすると、ウォレットの準備なしで記録を Solana のアセット（Metaplex Core・圧縮）として受け取れる。')}</li>
        <li><b>{t('Later', 'その後')}</b> {t('Owners re-scan to add new wear — the record grows, and so does the story. XRPL mirror for payments partners.', '所有者が再スキャンで新しい着用感を追加し、記録とストーリーが育つ。決済パートナー向けの XRPL ミラー。')}</li>
      </ol>

      <h2 className="pl-h">{t('Verify without us', '私たちなしで検証する')}</h2>
      <pre className="pl-code">{SNIPPET}</pre>
      <p className="mo-fine">
        {t('Public key', '公開鍵')}: <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a> · {t('Any passport as JSON', 'パスポートのJSON')}: <a href="/api/passport/GC-DEMO-1">/api/passport/GC-DEMO-1</a> · {t('Protocol GCPP/2 (SHA-256, Ed25519 + ECDSA P-256, canonical JSON).', 'プロトコル GCPP/2（SHA-256、Ed25519 ＋ ECDSA P-256、正規化JSON）。')}{' '}
        {t('Keyring', '鍵の台帳')}: <a href="/api/keyring">/api/keyring</a> · {t('Offline verifier', 'オフライン検証ツール')}: <a href="/verify">/verify</a> · <a href="/spec">{t('Read the full specification', '仕様書をすべて読む')}</a>
      </p>
    </MoShell>
  );
}
