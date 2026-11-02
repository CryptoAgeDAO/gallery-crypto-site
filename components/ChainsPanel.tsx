'use client';

// 管理：刻印先のチェーン。テスト用ネットワークと本番ネットワークの切り替え、入金先、今すぐ書き込む
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { explorerAddr, explorerTx, explorerXrplAddr, explorerXrplTx } from '@/lib/gcpp';
import { tt } from '@/components/Lang';

type C = {
  solana: 'solana-devnet' | 'solana-mainnet'; xrpl: 'off' | 'xrpl-testnet' | 'xrpl-mainnet'; locked: { solana: boolean; xrpl: boolean };
  solanaAddress: string; xrplAddress: string; solanaBalance: number | null; xrplBalance: number | null; anchors: number;
};

async function call(body: Record<string, unknown>) {
  const { data } = await supabase()!.auth.getSession();
  const r = await fetch('/api/admin/passport', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } }).then(setSvg).catch(() => setSvg('')); }, [text]);
  return <span aria-label={tt('QR code of the address', 'アドレスのQRコード')} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function ChainsPanel() {
  const [c, setC] = useState<C | null>(null);
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => call({ action: 'chains' }).then(({ ok, j }) => (ok ? setC(j) : setSt(j.error || tt('Could not load', '読み込めませんでした'))));
  useEffect(() => { load(); }, []);

  const set = async (next: Partial<Pick<C, 'solana' | 'xrpl'>>) => {
    const main = next.solana === 'solana-mainnet' || next.xrpl === 'xrpl-mainnet';
    if (main && !confirm(tt('Switch to the main network? From now on every write is public and permanent on the real network, and costs a tiny fee from the address below.', '本番のネットワークに切り替えますか？これからの書き込みはすべて本番のネットワークで公開・永久になり、下のアドレスからごくわずかな手数料がかかります。'))) return;
    setBusy(true);
    const { ok, j } = await call({ action: 'set-chains', ...next });
    setBusy(false);
    if (!ok) return setSt(j.error === 'mfa-required' ? 'Sign in with your second step (6-digit code or Face ID) to change networks.' : j.error || tt('Could not save', '保存できませんでした'));
    setSt(tt('Saved', '保存しました'));
    load();
  };
  const writeNow = async () => {
    setBusy(true);
    setSt(tt('Writing…', '書き込み中…'));
    const { ok, j } = await call({ action: 'anchor' });
    setBusy(false);
    if (!ok) return setSt(j.error || tt('Failed', '失敗しました'));
    if (!j.count) return setSt(tt('Nothing new to write. A write happens after a passport is sealed or a record is added.', '新しく書き込むものはありません。書き込みはパスポートの確定や記録の追加のあとに行われます。'));
    if (j.needFunds) return setSt(tt(`${j.count} records are waiting, but the Solana address has no SOL to pay the fee. Send a little SOL to it (below).`, `${j.count}件の記録が待っていますが、Solana のアドレスに手数料を払う SOL がありません。下のアドレスに少し SOL を送ってください。`));
    const x = j.xrpl?.tx ? tt(' · mirrored to XRPL', ' · XRPL にも記録') : j.xrpl?.needFunds ? tt(' · XRPL account needs funding', ' · XRPL のアカウントに入金が必要') : j.xrpl?.error ? tt(` · XRPL failed: ${j.xrpl.error}`, ` · XRPL 失敗：${j.xrpl.error}`) : '';
    setSt(tt(`Written: ${j.count} records${x}`, `書き込みました：${j.count}件の記録${x}`));
    if (j.anchor?.tx) window.open(explorerTx(j.anchor.tx, j.anchor.chain), '_blank', 'noopener');
    if (j.anchor?.xrpl_tx) window.open(explorerXrplTx(j.anchor.xrpl_tx, j.anchor.xrpl_chain), '_blank', 'noopener');
    load();
  };

  if (!c) return <div className="ch"><p>{st || 'Loading networks…'}</p></div>;
  const solMain = c.solana === 'solana-mainnet';
  const xrMain = c.xrpl === 'xrpl-mainnet';
  const solLow = c.solanaBalance != null && c.solanaBalance < 0.001;
  const xrLow = c.xrpl !== 'off' && c.xrplBalance != null && c.xrplBalance < 1.2;
  return (
    <div className="ch">
      <h4>{tt('Where records are written', '記録の書き込み先')}</h4>
      <p>{tt('Every new record is written as one fingerprint to Solana, and — if switched on — mirrored to the XRP Ledger. Start on the test networks; switch to main when the first real pieces are sealed. The public track record is at', '新しい記録はすべて1つの指紋として Solana に書き込まれ、オンにすれば XRP Ledger にも同じものを記録します。最初はテスト網で始め、本物の作品を初めて確定したら本番に切り替えてください。公開の運用実績はこちら：')} <a href="/ledger" target="_blank" rel="noreferrer">/ledger</a> ({c.anchors} writes so far).</p>

      <div className="ch-row">
        <div>
          <b>Solana</b> · {solMain ? 'mainnet' : 'devnet (test, free)'} · balance {c.solanaBalance == null ? '—' : `${c.solanaBalance} SOL`}
          <p className="ch-addr"><a href={explorerAddr(c.solanaAddress, c.solana)} target="_blank" rel="noopener noreferrer">{c.solanaAddress}</a></p>
        </div>
        <div className="ch-seg" role="group" aria-label="Solana network">
          <button aria-pressed={!solMain} disabled={busy || c.locked.solana} onClick={() => set({ solana: 'solana-devnet' })}>{tt('Test', 'テスト')}</button>
          <button aria-pressed={solMain} disabled={busy || c.locked.solana} onClick={() => set({ solana: 'solana-mainnet' })}>{tt('Main', '本番')}</button>
        </div>
      </div>
      {solMain && solLow && (
        <div className="ch-fund">
          <Qr text={`solana:${c.solanaAddress}`} />
          <p>
            <b>{tt('Send about 0.02 SOL to this address', 'このアドレスに約 0.02 SOL を送ってください')}</b> {tt('from your own wallet or exchange. Each write costs 0.000005 SOL, so 0.02 SOL covers about 4,000 writes. Keep only a small amount here: this key lives on the server.', '（ご自身のウォレットか取引所から）。1回の書き込みは 0.000005 SOL なので、0.02 SOL で約4,000回分です。この鍵はサーバーにあるので、置くのは少額だけにしてください。')}
          </p>
        </div>
      )}

      <div className="ch-row">
        <div>
          <b>{tt('XRP Ledger mirror', 'XRP Ledger への記録')}</b> · {c.xrpl === 'off' ? 'off' : xrMain ? 'mainnet' : 'testnet (test, free)'} · balance {c.xrpl === 'off' || c.xrplBalance == null ? '—' : `${c.xrplBalance} XRP`}
          <p className="ch-addr"><a href={explorerXrplAddr(c.xrplAddress, c.xrpl === 'off' ? 'xrpl-testnet' : c.xrpl)} target="_blank" rel="noopener noreferrer">{c.xrplAddress}</a></p>
        </div>
        <div className="ch-seg" role="group" aria-label="XRPL network">
          <button aria-pressed={c.xrpl === 'off'} disabled={busy || c.locked.xrpl} onClick={() => set({ xrpl: 'off' })}>{tt('Off', 'オフ')}</button>
          <button aria-pressed={c.xrpl === 'xrpl-testnet'} disabled={busy || c.locked.xrpl} onClick={() => set({ xrpl: 'xrpl-testnet' })}>{tt('Test', 'テスト')}</button>
          <button aria-pressed={xrMain} disabled={busy || c.locked.xrpl} onClick={() => set({ xrpl: 'xrpl-mainnet' })}>{tt('Main', '本番')}</button>
        </div>
      </div>
      {xrMain && xrLow && (
        <div className="ch-fund">
          <Qr text={c.xrplAddress} />
          <p>
            <b>{tt('Send 2 XRP to this address', 'このアドレスに 2 XRP を送ってください')}</b> {tt('to open the account. The XRP Ledger keeps a small reserve locked in every account; each write then costs about 0.00001 XRP. No destination tag is needed. The test network is opened for free automatically.', '（アカウントを開くため）。XRP Ledger はすべてのアカウントに少額の準備金を固定します。その後の書き込みは1回約 0.00001 XRP です。宛先タグは不要です。テスト網は自動で無料で開きます。')}
          </p>
        </div>
      )}

      <div className="pp-row">
        <button className="btn" onClick={writeNow} disabled={busy}>{tt('Write new records now', '新しい記録をいま書き込む')}</button>
        <a className="btn" href="/ledger" target="_blank" rel="noreferrer">{tt('Open the public track record', '公開の運用実績を開く')}</a>
      </div>
      {st && <p className="pa-st">{st}</p>}
    </div>
  );
}
