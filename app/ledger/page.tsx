import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import GcIcon, { IconRow } from '@/components/GcIcon';
import LedgerTable from '@/components/LedgerTable';
import { getLedger } from '@/lib/ledger';
import { explorerAddr, explorerXrplAddr } from '@/lib/gcpp';
import { getLang } from '@/lib/lang';
import { makeT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Public ledger — Gallery Crypto',
  description: 'Every fingerprint Gallery Crypto has written to Solana (and mirrored to the XRP Ledger), live, with links to check each one yourself.',
};

const day = (s: string | null, ja = false) => (s ? new Date(s).toLocaleDateString(ja ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }) : '—');
const netName = (c: string, ja = false) => (c === 'solana-mainnet' ? (ja ? 'Solana メインネット' : 'Solana mainnet') : c === 'solana-devnet' ? (ja ? 'Solana devnet（テスト網）' : 'Solana devnet (test network)') : c === 'xrpl-mainnet' ? (ja ? 'XRP Ledger メインネット' : 'XRP Ledger mainnet') : c === 'xrpl-testnet' ? (ja ? 'XRP Ledger テスト網' : 'XRP Ledger testnet') : ja ? 'オフ' : 'off');

// 運用実績：これまでに書いたすべての刻印。サイトが読むのは自分のデータベース、照合は誰でも公開ノードで
export default async function LedgerPage() {
  const lang = getLang();
  const tr = makeT(lang);
  const ja = lang === 'ja';
  const l = await getLedger();
  if (!l) {
    return (
      <MoShell title={tr('Public ledger', '公開台帳')} kicker={tr('Track record', '運用実績')}>
        <p className="mo-lead">{tr('The ledger appears here once this server is connected to its database.', 'このサーバーがデータベースにつながると、ここに台帳が表示されます。')}</p>
      </MoShell>
    );
  }
  const t = l.totals;
  return (
    <MoShell title={tr('Every write, in public', 'すべての書き込みを公開')} kicker={tr('Track record · live', '運用実績 · リアルタイム')}>
      <p className="mo-lead">
        {tr('This page lists every fingerprint Gallery Crypto has written to Solana — and, when switched on, mirrored to the XRP Ledger. Each line links to the public transaction, and the Check button asks a Solana node directly from your browser. Nothing here is taken on our word.', 'Gallery Crypto が Solana に書き込んだ指紋（設定がオンなら XRP Ledger にも同じものを記録）をすべて並べています。各行は公開の取引にリンクし、「確かめる」ボタンはあなたのブラウザから Solana のノードに直接問い合わせます。私たちの言葉をそのまま信じる必要はありません。')}
      </p>

      <div className="lg-stats">
        <div><GcIcon name="ledger" size={40} tone="ink" /><b>{t.anchors}</b><span>{tr('writes to Solana', 'Solana への書き込み')}{t.anchors_mainnet ? tr(` · ${t.anchors_mainnet} on mainnet`, ` · うちメインネット ${t.anchors_mainnet}`) : ''}</span></div>
        <div><GcIcon name="fingerprint" size={40} /><b>{t.records_anchored}</b><span>{tr('records covered', 'カバーした記録')}</span></div>
        <div><GcIcon name="cap" size={40} /><b>{t.pieces_sealed}</b><span>{tr('pieces with a sealed passport', '確定したパスポートのある作品')}</span></div>
        <div><GcIcon name="clock" size={40} /><b>{t.days_active}</b><span>{tr('days with a write · since', '書き込みのあった日数 · 開始')} {day(t.first_anchor, ja)}</span></div>
        <div><GcIcon name="chain" size={40} tone={t.xrpl_mirrors ? 'copper' : 'soft'} /><b>{t.xrpl_mirrors}</b><span>{tr('mirrored to the XRP Ledger', 'XRP Ledger への記録')}</span></div>
      </div>

      <div className="sol-grid">
        <IconRow name="ledger" tone="ink" title={`Solana · ${netName(l.chains.solana, ja)}`}>
          {tr('Issuer address', '発行者のアドレス')} <a href={explorerAddr(l.addresses.solana, l.chains.solana)} target="_blank" rel="noopener noreferrer" className="pp-mono">{l.addresses.solana.slice(0, 6)}…{l.addresses.solana.slice(-6)}</a> {tr('— the same key that signs every passport. All of its transactions are public.', '— すべてのパスポートに署名しているのと同じ鍵です。その取引はすべて公開されています。')}
        </IconRow>
        <IconRow name="chain" tone="copper" title={`XRP Ledger · ${netName(l.chains.xrpl, ja)}`}>
          {l.chains.xrpl === 'off' ? tr('Mirroring is switched off.', 'XRP Ledger への記録はオフです。') : <>{tr('Account', 'アカウント')} <a href={explorerXrplAddr(l.addresses.xrpl, l.chains.xrpl)} target="_blank" rel="noopener noreferrer" className="pp-mono">{l.addresses.xrpl.slice(0, 6)}…{l.addresses.xrpl.slice(-6)}</a> {tr('writes the same fingerprint as a memo. No payment is made.', 'が同じ指紋をメモとして書き込みます。送金は行いません。')}</>}
        </IconRow>
        <IconRow name="clock" title={tr('When we write', '書き込むとき')}>{tr("Right after a passport is sealed or a record is added, and once a day at 03:00 Tokyo time for the day's backup fingerprint. Nothing is written on a quiet day without changes.", 'パスポートの確定や記録の追加のすぐあとと、毎日1回（日本時間の午前3時）、その日のバックアップの指紋を書き込みます。変更のない日は何も書きません。')}</IconRow>
        <IconRow name="eye" title={tr('What is in each write', '書き込む内容')}>{tr('One 32-byte fingerprint and how many records it covers. Never names, prices, photos or anything about a buyer.', '32バイトの指紋1つと、それがカバーする記録の件数だけです。名前、価格、写真、購入者に関することは決して書きません。')}</IconRow>
      </div>

      <h2 className="pl-h">{tr('All writes', 'すべての書き込み')}</h2>
      {l.anchors.length ? (
        <LedgerTable anchors={l.anchors} />
      ) : (
        <p className="sol-status"><GcIcon name="clock" size={30} tone="copper" /> <span><b>{tr('No writes yet.', 'まだ書き込みはありません。')}</b> {tr('The first one happens when the first real piece is sealed. The demo pieces are signed but deliberately not written.', '最初の本物の作品を確定したときに、最初の書き込みが行われます。デモの作品は署名済みですが、あえて書き込んでいません。')}</span></p>
      )}

      <p className="mo-fine">
        {tr('Machine-readable:', '機械で読める形式：')} <a href="/api/ledger">/api/ledger</a> {tr('(JSON, every write with its records)', '（JSON、すべての書き込みと記録）')} · {tr('Protocol:', 'プロトコル：')} <a href="/spec">{tr('GCPP/2 specification', 'GCPP/2 仕様書')}</a> · {tr('Public keys:', '公開鍵：')} <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a> · {tr('How it works:', '仕組み：')} <a href="/demo/nfc#solana">{tr('Solana, in plain words', 'Solana をやさしく')}</a>
      </p>
    </MoShell>
  );
}
