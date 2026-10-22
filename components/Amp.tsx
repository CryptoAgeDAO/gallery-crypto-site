'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { photoUrl } from '@/lib/supabase';
import { certNo, type Item, type Settings } from '@/lib/types';
import { sfx } from '@/lib/sfx';
import { musicSpectrum, musicTime, seekMusic, setMusicVolume, stopMusic, toggleMusic, useNowPlaying } from '@/components/Music';

// アーカイブを、1990年代末のパソコン用音楽プレーヤー風に見せる。
// 本体（時間表示・流れる曲名・スペクトラム・音量・再生キー）＋プレイリスト。押して何も起きない飾りの部品は置かない。
// 1着＝1曲。既存ソフトの名前・ロゴ・スキン画像は使わず、すべてこのサイト用。

type Track = { it: Item | null; n: number };
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export default function Amp({ items, s, onOpen }: { items: Item[]; s: Settings; onOpen: (it: Item) => void }) {
  const tracks: Track[] = useMemo(() => {
    const total = Math.max(12, items.length);
    return Array.from({ length: total }, (_, i) => ({ it: items[i] || null, n: i + 1 }));
  }, [items]);
  const [cur, setCur] = useState(0);
  const [msg, setMsg] = useState('');
  const [vol, setVol] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [pl, setPl] = useState(true);
  const [time, setTime] = useState({ t: 0, d: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const now = useNowPlaying();
  const tr = tracks[cur];
  const it = tr.it;
  const playing = !!now && !!it && now.id === it.id;

  useEffect(() => setMusicVolume(vol), [vol]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 1800);
    return () => clearTimeout(t);
  }, [msg]);

  // スペクトラム表示と時間表示（再生中は実際の音、止まっているときは静かな待機表示）
  useEffect(() => {
    const c = canvas.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const buf = new Uint8Array(32);
    let raf = 0;
    let fake = 0;
    const draw = () => {
      const W = c.width, H = c.height;
      x.fillStyle = '#000';
      x.fillRect(0, 0, W, H);
      const live = !!now && musicSpectrum(buf);
      if (!live && now) {
        fake += 0.12;
        for (let i = 0; i < 32; i++) buf[i] = 120 + 110 * Math.sin(fake + i * 0.7) * Math.sin(fake * 0.6 + i * 0.13);
      }
      const n = 19, bw = Math.floor(W / n);
      for (let i = 0; i < n; i++) {
        const v = now ? (buf[Math.floor((i / n) * 24)] || 0) / 255 : 0;
        const h = Math.max(1, Math.round(v * (H - 2)));
        for (let y = 0; y < h; y += 2) {
          const r = y / H;
          x.fillStyle = r > 0.8 ? '#ff3b1f' : r > 0.55 ? '#f6d21c' : '#2ee04a';
          x.fillRect(i * bw + 1, H - 1 - y, bw - 2, 1);
        }
        if (now) {
          x.fillStyle = '#c8c8c8';
          x.fillRect(i * bw + 1, H - 2 - h, bw - 2, 1);
        }
      }
      if (!now) {
        x.fillStyle = '#1f5a2a';
        x.fillRect(0, H - 1, W, 1);
      }
      if (now) {
        setTime(musicTime());
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [now]);

  const select = (i: number) => {
    const n = (i + tracks.length) % tracks.length;
    sfx('tick');
    setCur(n);
    if (now) stopMusic();
  };
  const next = () => {
    if (shuffle && items.length > 1) select(Math.floor(Math.random() * items.length));
    else select(cur + 1);
  };
  const play = async () => {
    sfx('select');
    if (!it) return setMsg('*** TRACK LOCKED — ARRIVING 2027 ***');
    if (!it.audio_path) return setMsg(it.listen ? '*** NO FILE — OPEN TO LISTEN ***' : '*** NO AUDIO FOR THIS TRACK ***');
    if (playing) return;
    const ok = await toggleMusic(it);
    if (!ok) setMsg('*** ERROR OPENING FILE ***');
  };
  const stop = () => {
    sfx('tick');
    stopMusic();
  };
  const eject = () => {
    sfx('open');
    if (it) onOpen(it);
    else document.getElementById('presale')?.scrollIntoView({ behavior: 'smooth' });
  };

  const title = msg || (it ? `${tr.n}. ${[it.band || 'Untitled', it.title].filter(Boolean).join(' - ')} (${it.year || '----'})` : `${tr.n}. *** Locked track — arriving 2027 — enter the free draw ***`);
  const mm = Math.floor(time.t / 60), ss = Math.floor(time.t % 60);
  const pos = time.d ? time.t / time.d : 0;

  return (
    <section className="wa" id="archive" aria-label="Archive">
      <div className="wa-stack">
        {/* 本体 */}
        <div className="wa-win wa-main">
          <div className="wa-title">
            <span className="wa-ttl">Gallery Crypto</span>
          </div>
          <div className="wa-body">
            <div className="wa-lcd">
              <div className="wa-left">
                <span className="wa-state" aria-hidden>
                  {playing ? '▶' : '■'}
                </span>
                <span className="wa-time" aria-label="Time">
                  {playing ? `${pad(mm)}:${pad(ss)}` : '00:00'}
                </span>
                <canvas ref={canvas} className="wa-spec" width={76} height={18} aria-hidden />
              </div>
              <div className="wa-right">
                <div className="wa-marq" aria-live="polite">
                  <span key={title}>{title}</span>
                </div>
                <div className="wa-sliders">
                  <label className="wa-vol" aria-label="Volume">
                    <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(+e.target.value)} />
                  </label>
                  <button className={`wa-tog${pl ? ' on' : ''}`} onClick={() => (sfx('tick'), setPl(!pl))}>
                    PL
                  </button>
                </div>
              </div>
            </div>
            <label className="wa-seek" aria-label="Seek">
              <input type="range" min={0} max={1} step={0.001} value={pos} disabled={!playing} onChange={(e) => seekMusic(+e.target.value)} />
            </label>
            <div className="wa-keys">
              <button onClick={() => select(cur - 1)} aria-label="Previous">
                <i className="k-prev" />
              </button>
              <button onClick={play} aria-label="Play">
                <i className="k-play" />
              </button>
              <button onClick={stop} aria-label="Stop">
                <i className="k-stop" />
              </button>
              <button onClick={next} aria-label="Next">
                <i className="k-next" />
              </button>
              <button className="wa-ej" onClick={eject} aria-label={it ? 'Open details' : 'Enter the draw'}>
                <i className="k-eject" />
              </button>
              {items.length > 1 && (
              <button className={`wa-tog wide${shuffle ? ' on' : ''}`} onClick={() => (sfx('tick'), setShuffle(!shuffle))}>
                Shuffle
              </button>
              )}
            </div>
          </div>
        </div>


        {/* プレイリスト */}
        {pl && (
          <div className="wa-win wa-pl">
            <div className="wa-title">
              <span className="wa-ttl">Gallery Crypto Playlist</span>
            </div>
            <div className="wa-body">
              <ol className="wa-list">
                {tracks.map((t, i) => (
                  <li key={t.it?.id || `l${i}`}>
                    <button
                      className={`${i === cur ? 'sel' : ''}${t.it && now?.id === t.it.id ? ' now' : ''}${t.it ? '' : ' lock'}`}
                      onClick={() => select(i)}
                      onDoubleClick={() => {
                        setCur(i);
                        if (t.it) onOpen(t.it);
                      }}
                    >
                      <span className="t">
                        {t.n}. {t.it ? [t.it.band || 'Untitled', t.it.title].filter(Boolean).join(' - ') : '[locked] arriving 2027'}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="wa-plfoot">
                <span className="wa-tog" onClick={eject} role="button" tabIndex={0}>
                  {it ? 'Open' : 'Draw'}
                </span>
                <span className="wa-plinfo">
                  {it ? certNo(it) : `GC-${pad(tr.n, 4)}`} · {items.length}/{tracks.length} · {s.launch}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="wa-art" aria-label="Now selected">
        <div className="wa-artbox">
          {it?.photos?.[0] ? <img src={photoUrl(it.photos[0])} alt={[it.band, it.title].filter(Boolean).join(' ')} /> : <span>No artwork<br />Track locked</span>}
        </div>
        <p>
          Double-click a track — or press <b>⏏</b> — to open it.
        </p>
      </aside>
    </section>
  );
}
