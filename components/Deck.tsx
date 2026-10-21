'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, type Item, type Settings } from '@/lib/types';
import { sfx } from '@/lib/sfx';
import { stopMusic, toggleMusic, useNowPlaying } from '@/components/Music';

// アーカイブを「1990年代の機械」として見せる：CDプレーヤーの表示窓とボタン、SF端末のモニターと探知機。
// 1着＝1トラック。▶で音源を再生、OPENで詳細、EJECTで抽選へ。メーカーのロゴやゲームの素材は使っていない。

type Track = { it: Item | null; n: number };
const TEE_PATH = 'M30 8 L40 5 Q50 15 60 5 L70 8 L93 23 L84 39 L74 33 L74 95 Q50 98 26 95 L26 33 L16 39 L7 23 Z';
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function Wire({ className }: { className?: string }) {
  // 鍵つきトラックのワイヤーフレーム（スキャン中の輪郭）
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <path d={TEE_PATH} />
      {[20, 32, 44, 56, 68, 80, 92].map((y) => (
        <line key={y} x1="0" x2="100" y1={y} y2={y} />
      ))}
      {[30, 40, 50, 60, 70].map((x) => (
        <line key={x} x1={x} x2={x} y1="0" y2="100" />
      ))}
    </svg>
  );
}

export default function Deck({ items, s, onOpen }: { items: Item[]; s: Settings; onOpen: (it: Item) => void }) {
  const tracks: Track[] = useMemo(() => {
    const total = Math.max(12, items.length + (items.length % 2 ? 1 : 2));
    return Array.from({ length: total }, (_, i) => ({ it: items[i] || null, n: i + 1 }));
  }, [items]);
  const [cur, setCur] = useState(0);
  const [ph, setPh] = useState(0);
  const [msg, setMsg] = useState('');
  const [power, setPower] = useState<'off' | 'test' | 'on'>('on');
  const ref = useRef<HTMLElement>(null);
  const now = useNowPlaying();
  const tr = tracks[cur];
  const it = tr.it;
  const playing = !!it && now?.id === it.id;

  // 電源オンの演出（同じタブで1回だけ）：表示窓が全点灯 → READY
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('gc-deck') === '1';
    } catch {}
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPower('off');
    const el = ref.current;
    if (!el) return;
    const ts: number[] = [];
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        sessionStorage.setItem('gc-deck', '1');
      } catch {}
      sfx('boot-hum');
      ts.push(window.setTimeout(() => setPower('test'), 350), window.setTimeout(() => (setPower('on'), sfx('servo')), 1300));
    }, { threshold: 0.35 });
    io.observe(el);
    return () => {
      io.disconnect();
      ts.forEach(clearTimeout);
    };
  }, []);

  // 表示窓の一時メッセージ
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 1600);
    return () => clearTimeout(t);
  }, [msg]);

  const go = (i: number) => {
    const n = (i + tracks.length) % tracks.length;
    sfx('seek');
    setCur(n);
    setPh(0);
    if (!tracks[n].it) setTimeout(() => sfx('ping'), 120);
  };
  const play = async () => {
    sfx('thunk');
    if (!it) return setMsg('LOCKED');
    if (!it.audio_path) return setMsg(it.listen ? 'OPEN TO LISTEN' : 'NO AUDIO');
    sfx('servo');
    const ok = await toggleMusic(it);
    if (!ok) setMsg('READ ERROR');
  };
  const stop = () => {
    sfx('thunk');
    stopMusic();
    setMsg('STOP');
  };
  const open = () => {
    sfx('thunk');
    if (it) onOpen(it);
    else setMsg('LOCKED');
  };
  const eject = () => {
    sfx('tray');
    setMsg('ENTER DRAW');
    setTimeout(() => document.getElementById('presale')?.scrollIntoView({ behavior: 'smooth' }), 500);
  };

  const photos = it?.photos || [];
  const title = it ? [it.band || 'Untitled', it.title].filter(Boolean).join(' — ') : 'Locked — arriving 2027';
  const data: [string, string][] = it
    ? ([
        ['Serial', certNo(it)],
        ['Era', ERA_LABEL[it.era] || '—'],
        ['Year', it.year || '—'],
        ['Size', it.size ? it.size.toUpperCase() : '—'],
        ['Origin', it.made_in || '—'],
        ['Stitch', it.stitch ? 'Single' : '—'],
        ['Cond.', it.cond || '—'],
      ] as [string, string][])
    : [
        ['Serial', `GC-${pad(tr.n, 4)}`],
        ['Status', 'Locked'],
        ['Scan', 'In progress'],
        ['Release', '2027'],
      ];
  const lcd = power === 'test';

  return (
    <section className={`dk power-${power}`} id="archive" aria-label="Archive" ref={ref}>
      <div className="dk-unit">
        <div className="dk-plate">
          <span className="dk-brand">
            <b>Gallery Crypto</b> GC-96 Archive Unit
          </span>
          <span className="dk-pwr">
            <i className="dk-led" /> Power
          </span>
        </div>

        <div className="dk-vfd" aria-live="polite">
          <span className="dk-trk">
            <i>Track</i>
            {lcd ? '88/88' : `${pad(tr.n)}/${pad(tracks.length)}`}
          </span>
          <span className="dk-mq">
            <span key={cur + msg}>{lcd ? '8888888888888888888888' : msg || title}</span>
          </span>
          <span className="dk-yr">
            <i>Year</i>
            {lcd ? '8888' : it?.year || '----'}
          </span>
          <span className="dk-ind" aria-hidden>
            <b className={it ? 'on' : ''}>Disc</b>
            <b className={playing ? 'on' : ''}>Play</b>
            <b className={it?.audio_path ? 'on' : ''}>Audio</b>
            <b className={!it ? 'on' : ''}>Lock</b>
            <b className="on">Scan</b>
          </span>
        </div>

        <div className="dk-body">
          <div className="dk-mon">
            <div className="dk-scr">
              {it && photos.length ? (
                <img key={photos[ph]} src={photoUrl(photos[ph])} alt={title} />
              ) : (
                <Wire className="dk-wire" />
              )}
              <span className="dk-sweep" aria-hidden />
              <span className="dk-hud tl" aria-hidden>
                REC ● {it ? certNo(it) : 'NO SIGNAL'}
              </span>
              <span className="dk-hud br" aria-hidden>
                {it ? `IMG ${ph + 1}/${Math.max(1, photos.length)}` : 'SCANNING'}
              </span>
              <span className="dk-radar" aria-hidden>
                <i />
                {tracks.slice(0, 8).map((t, i) => (
                  <b key={i} className={t.it ? 'f' : ''} style={{ transform: `rotate(${i * 45 + 20}deg) translateY(-${10 + (i % 3) * 7}px)` }} />
                ))}
              </span>
            </div>
            {photos.length > 1 && (
              <div className="dk-ph">
                {photos.map((p, i) => (
                  <button key={p} aria-label={`Image ${i + 1}`} aria-pressed={i === ph} onClick={() => (sfx('seek'), setPh(i))}>
                    {pad(i + 1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="dk-side">
            <dl className="dk-data">
              {data.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {it?.prov && <p className="dk-prov">{it.prov}</p>}
            {!it && <p className="dk-prov">This track is still locked. The pieces are being photographed one by one — enter the free draw to be first in line.</p>}

            <div className="dk-mid">
              <span className={`dk-disc${playing ? ' spin' : ''}`} aria-hidden>
                {it && photos[0] ? <img src={photoUrl(photos[0])} alt="" /> : <i />}
              </span>
              <span className={`dk-vu${playing ? ' live' : ''}`} aria-hidden>
                {Array.from({ length: 12 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${(i % 4) * 0.11}s` }} />
                ))}
              </span>
            </div>

            <div className="dk-keys">
              <button onClick={() => go(cur - 1)} aria-label="Previous track">
                <span>⏮︎</span>
                <small>Prev</small>
              </button>
              <button className="main" onClick={play} aria-label={playing ? 'Pause' : 'Play'}>
                <span>{playing ? '❚❚' : '▶︎'}</span>
                <small>Play</small>
              </button>
              <button onClick={stop} aria-label="Stop">
                <span>■︎</span>
                <small>Stop</small>
              </button>
              <button onClick={() => go(cur + 1)} aria-label="Next track">
                <span>⏭︎</span>
                <small>Next</small>
              </button>
              <button onClick={open} aria-label="Open details">
                <span>◉︎</span>
                <small>Open</small>
              </button>
              <button className="ej" onClick={eject} aria-label="Enter the draw">
                <span>⏏︎</span>
                <small>Draw</small>
              </button>
            </div>
          </div>
        </div>

        <ol className="dk-list" aria-label="Tracks">
          {tracks.map((t, i) => (
            <li key={t.it?.id || `l${i}`}>
              <button aria-current={i === cur} onClick={() => go(i)}>
                <span className="n">{pad(t.n)}</span>
                <span className="t">{t.it ? t.it.band || 'Untitled' : '— locked —'}</span>
                <span className="y">{t.it?.year || '----'}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="dk-foot">
          <span>{s.launch}</span>
          <span>Made in Tokyo</span>
        </p>
      </div>
    </section>
  );
}
