import { photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, usd, type Item } from '@/lib/types';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// 証明書の記録ID（Solana に記録するまでは見本表示）
export function recId(id: string): string {
  let h = 2166136261;
  let o = '';
  for (let i = 0; i < 44; i++) {
    h ^= id.charCodeAt(i % id.length) + i * 31;
    h = Math.imul(h, 16777619) >>> 0;
    o += B58[h % 58];
  }
  return o.slice(0, 6) + '…' + o.slice(-6);
}

const hasSound = (it: Item) => Boolean(it.audio_path || it.listen);

export function CardFront({ it, saleOpen, big }: { it: Item; saleOpen: boolean; big?: boolean }) {
  const ph = it.photos || [];
  const stats = (
    [
      ['YR', it.year],
      ['SZ', it.size ? it.size.toUpperCase() : ''],
      ['TAG', it.tag],
      ['', it.stitch ? 'SINGLE ST.' : ''],
    ] as [string, string][]
  )
    .filter((r) => r[1])
    .slice(0, 3);
  const right = it.sold ? 'Sold' : saleOpen && it.price_usd ? <b>{usd(it.price_usd)}</b> : '2027';
  return (
    <div className="tc-in">
      <div className="tc-face">
        <div className="tc-top">
          <span>{certNo(it)}</span>
          <span className="tc-era">{ERA_LABEL[it.era] || '—'}</span>
        </div>
        <div className="tc-art">
          {ph.length ? (
            <>
              <img id={big ? 'pv-main' : undefined} src={photoUrl(ph[0])} alt={`${it.band} ${it.title}`.trim()} loading={big ? undefined : 'lazy'} />
              {ph[1] && !big && <img className="alt" src={photoUrl(ph[1])} alt="" loading="lazy" />}
            </>
          ) : (
            <span className="noimg">No image</span>
          )}
        </div>
        <div className="tc-name">{it.band || 'Untitled'}</div>
        <div className="tc-sub">{it.title || (it.made_in ? `Made in ${it.made_in}` : 'Vintage band tee')}</div>
        <div className="tc-stats">
          {stats.map(([k, v]) => (
            <span key={k + v}>
              {k && <i>{k}</i>}
              {v}
            </span>
          ))}
        </div>
        <div className="tc-ft">
          <span>1 of 1{hasSound(it) ? ' · ♪' : ''}</span>
          <span>{right}</span>
        </div>
      </div>
      {it.sold && <span className="tc-stamp">Sold</span>}
      <div className="tc-holo" />
      <div className="tc-glare" />
      <div className="tc-glint" />
      <span className="tc-seal">1/1</span>
    </div>
  );
}

export function CardBack({ it }: { it: Item }) {
  const rows: [string, string][] = [
    ['No.', certNo(it)],
    ['Piece', [it.band, it.year].filter(Boolean).join(' · ') || '—'],
    ['From', it.dealer || "Founder's collection"],
    ['Chain', 'Solana · test'],
    ['Record', recId(it.id)],
  ];
  return (
    <div className="tc-in">
      <div className="tc-face tc-back">
        <div className="tc-top">
          <span>Provenance</span>
          <span className="tc-era">Preview</span>
        </div>
        <div className="tc-mark">
          Gallery
          <br />
          Crypto
        </div>
        <dl className="tc-cert">
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="tc-ft">
          <span>Issued at purchase</span>
          <span>1 of 1</span>
        </div>
      </div>
      <div className="tc-holo" />
      <div className="tc-glare" />
      <div className="tc-glint" />
    </div>
  );
}
