'use client';

// A4 ラベル印刷シート：種類・作品・枚数を選んで、そのまま印刷
import { useMemo, useState } from 'react';
import { tt } from '@/components/Lang';

export type LabelItem = {
  cert: string; band: string; title: string; year: string; size: string; dealer: string;
  sealed: boolean; records: number; url: string; qr: string; offlineQr: string; demo?: boolean;
};
type Kind = 'tag' | 'card' | 'sticker';
// 言語で文言が変わるので、表示のたびに作る
const kinds = (): Record<Kind, { name: string; size: string; perPage: number; cols: number; note: string }> => ({
  tag: { name: tt('Hang tag', '下げ札'), size: '55 × 90 mm', perPage: 9, cols: 3, note: tt('Online QR. Punch the circle for the string.', 'オンラインのQR。丸い部分に穴を開けて紐を通します。') },
  card: { name: tt('Certificate card', '証明書カード'), size: '91 × 55 mm', perPage: 10, cols: 2, note: tt('Online + offline QR. Print at 600 dpi or finer.', 'オンライン＋オフラインのQR。600dpi 以上で印刷してください。') },
  sticker: { name: tt('Small sticker', '小さいシール'), size: '38 × 38 mm', perPage: 35, cols: 5, note: tt('Online QR only. For boxes, bags and care labels.', 'オンラインのQRのみ。箱、袋、洗濯表示用。') },
});

function Qr({ svg, label }: { svg: string; label?: string }) {
  return (
    <span className="lb-qrw">
      <span className="lb-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      {label && <span className="lb-qrl">{label}</span>}
    </span>
  );
}

function Label({ it, kind, host }: { it: LabelItem; kind: Kind; host: string }) {
  const name = it.band || tt('Untitled', '無題');
  if (kind === 'sticker')
    return (
      <div className="lb lb-sticker">
        <Qr svg={it.qr} />
        <b>{it.cert}</b>
      </div>
    );
  if (kind === 'tag')
    return (
      <div className="lb lb-tag">
        <span className="lb-hole" aria-hidden />
        <div className="lb-bar">Gallery Crypto</div>
        <div className="lb-one">1 OF 1</div>
        <div className="lb-cert">{it.cert}</div>
        <div className="lb-name">{name}</div>
        {it.title && <div className="lb-sub">{it.title}</div>}
        <div className="lb-meta">{[it.year, it.size && it.size.toUpperCase()].filter(Boolean).join(' · ')}</div>
        <Qr svg={it.qr} />
        <div className="lb-scan">Scan for provenance</div>
        <div className="lb-url">{host}/passport/{it.cert}</div>
      </div>
    );
  return (
    <div className="lb lb-card">
      <div className="lb-left">
        <div className="lb-bar">Gallery Crypto · Provenance</div>
        <div className="lb-cert">{it.cert}</div>
        <div className="lb-name">{name}</div>
        {it.title && <div className="lb-sub">{it.title}</div>}
        <div className="lb-meta">{[it.year, it.size && it.size.toUpperCase()].filter(Boolean).join(' · ')}</div>
        {it.dealer && <div className="lb-meta">Inherited from {it.dealer}</div>}
        <div className="lb-meta">{it.sealed ? `${it.records} signed records` : 'Record not sealed yet'}</div>
        <div className="lb-url">Gallery Crypto · Tokyo · 1 of 1</div>
      </div>
      <div className="lb-right">
        <Qr svg={it.qr} label="Online" />
        {it.offlineQr ? <Qr svg={it.offlineQr} label="Offline proof" /> : <span className="lb-qrw lb-empty">Seal the record to add the offline proof</span>}
      </div>
    </div>
  );
}

export default function LabelSheet({ items, host }: { items: LabelItem[]; host: string }) {
  const real = items.filter((i) => !i.demo);
  const [kind, setKind] = useState<Kind>('card');
  const [picked, setPicked] = useState<Set<string>>(() => new Set((real.length ? real : items).map((i) => i.cert)));
  const [copies, setCopies] = useState(1);
  const [skip, setSkip] = useState(0);
  const [cuts, setCuts] = useState(true);
  const k = kinds()[kind];

  const slots = useMemo(() => {
    const list: (LabelItem | null)[] = Array.from({ length: Math.min(skip, k.perPage - 1) }, () => null);
    items.filter((i) => picked.has(i.cert)).forEach((i) => { for (let c = 0; c < copies; c++) list.push(i); });
    const pages: (LabelItem | null)[][] = [];
    for (let i = 0; i < list.length; i += k.perPage) pages.push(list.slice(i, i + k.perPage));
    return pages;
  }, [items, picked, copies, skip, k.perPage]);
  const count = slots.reduce((n, p) => n + p.filter(Boolean).length, 0);
  const toggle = (c: string) => setPicked((p) => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });

  return (
    <div className="lb-root">
      <div className="lb-controls">
        <h1>{tt('Print labels', 'ラベルを印刷')}</h1>
        <div className="lb-row">
          {(Object.keys(kinds()) as Kind[]).map((key) => (
            <button key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>
              <b>{kinds()[key].name}</b>
              <span>{kinds()[key].size} · {tt(`${kinds()[key].perPage} per A4`, `A4に${kinds()[key].perPage}枚`)}</span>
            </button>
          ))}
        </div>
        <p className="lb-note">{k.note}</p>
        <div className="lb-row lb-opts">
          <label>{tt('Copies of each', '各作品の枚数')}<input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
          <label>{tt('Skip first slots', '最初の空き枠を飛ばす')}<input type="number" min={0} max={k.perPage - 1} value={skip} onChange={(e) => setSkip(Math.max(0, Math.min(k.perPage - 1, Number(e.target.value) || 0)))} /></label>
          <label className="lb-check"><input type="checkbox" checked={cuts} onChange={(e) => setCuts(e.target.checked)} />{tt('Cut lines', '切り取り線')}</label>
          <button className="lb-print" disabled={!count} onClick={() => window.print()}>Print {count} labels</button>
        </div>
        <details>
          <summary>Pieces ({picked.size} of {items.length})</summary>
          <div className="lb-row">
            <button onClick={() => setPicked(new Set(items.map((i) => i.cert)))}>{tt('All', 'すべて')}</button>
            <button onClick={() => setPicked(new Set(items.filter((i) => i.sealed && !i.demo).map((i) => i.cert)))}>{tt('Sealed only', '確定済みのみ')}</button>
            <button onClick={() => setPicked(new Set())}>{tt('None', 'なし')}</button>
          </div>
          <div className="lb-picks">
            {items.map((i) => (
              <label key={i.cert} className="lb-check">
                <input type="checkbox" checked={picked.has(i.cert)} onChange={() => toggle(i.cert)} />
                {i.cert} · {i.band || tt('Untitled', '無題')}{i.demo ? tt(' (sample)', '（見本）') : ''}{!i.sealed ? tt(' · not sealed', ' · 未確定') : ''}
              </label>
            ))}
          </div>
        </details>
        <p className="lb-note">{tt('In the print dialog choose A4, scale 100% (“Actual size”), and turn off headers and footers. Use “Skip first slots” to reuse a half-used sticker sheet.', '印刷画面で A4、倍率100%（「実際のサイズ」）を選び、ヘッダーとフッターをオフにしてください。使いかけのシールの台紙を使うときは「最初の空き枠を飛ばす」を使います。')}</p>
      </div>

      {slots.map((page, pi) => (
        <section key={pi} className={`lb-page lb-${kind}s${cuts ? ' cuts' : ''}`} style={{ gridTemplateColumns: `repeat(${k.cols}, auto)` }}>
          {page.map((it, i) => (it ? <Label key={i} it={it} kind={kind} host={host} /> : <div key={i} className={`lb lb-${kind} lb-blank`} />))}
        </section>
      ))}
      {!count && <p className="lb-note lb-controls">{tt('Choose at least one piece.', '少なくとも1点選んでください。')}</p>}
    </div>
  );
}
