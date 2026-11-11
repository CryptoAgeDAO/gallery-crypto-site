'use client';
// ゲーム風の画面要素（公開ページだけ）：起動画面・レーダー・時計・目標表示・達成バナー・Q/E でセクション移動。
// 見た目の雰囲気だけを取り入れたオリジナル。特定のゲームのロゴ・書体・絵柄は使わない。
import { useEffect, useRef, useState } from 'react';
import { useLang } from './Lang';

export type HudSection = { id: string; label: string; goal: string };

// 達成バナーを出す（フォーム送信の成功時などに呼ぶ）
export function hudBanner(title: string, sub?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('gx-banner', { detail: { title, sub } }));
}

function Boot() {
  const { t } = useLang();
  const [on, setOn] = useState(false);
  const [p, setP] = useState(0);
  const [tip, setTip] = useState(0);
  const tips = [
    t('Every piece is one of a kind. There is no second copy.', 'すべての作品は一点もの。2枚目はありません。'),
    t('Tap the tag sewn inside a piece to open its passport.', '作品の内側のタグをタップすると、来歴パスポートが開きます。'),
    t('The draw is free. No purchase, no wallet.', '抽選は無料。購入もウォレットも不要です。'),
    t('Press Q / E to move between sections.', 'Q / E キーでセクションを移動できます。'),
  ];
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('gx-boot') === '1';
      sessionStorage.setItem('gx-boot', '1');
    } catch {}
    if (seen) return;
    const fast = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setOn(true);
    setTip(Math.floor(Math.random() * 4));
    const dur = fast ? 300 : 2200;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(step);
      else setTimeout(() => setOn(false), 260);
    };
    raf = requestAnimationFrame(step);
    const skip = () => setOn(false);
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', skip);
    };
  }, []);
  if (!on) return null;
  return (
    <div className="gx-boot" role="presentation" onClick={() => setOn(false)}>
      <div className="gx-boot-in">
        <p className="gx-boot-k">{t('Now loading', 'ロード中')}</p>
        <p className="gx-boot-t">
          <span>Gallery</span>
          <span>Crypto</span>
        </p>
        <p className="gx-boot-s">{t('Art & fashion, built with digital tools', 'デジタルでつくる、アートとファッション')}</p>
      </div>
      <div className="gx-boot-ft">
        <p className="gx-boot-tip">
          <b>{t('Tip', 'ヒント')}</b>
          {tips[tip]}
        </p>
        <div className="gx-boot-bar" aria-hidden>
          <i style={{ transform: `scaleX(${p})` }} />
        </div>
        <p className="gx-boot-skip">{t('Tap or press any key to skip', 'タップ または キーでスキップ')}</p>
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const f = () => setNow(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date()));
    f();
    const id = setInterval(f, 15000);
    return () => clearInterval(id);
  }, []);
  return <span className="gx-clock">{now}</span>;
}

export default function GameHud({ sections = [], stats = [], goal }: { sections?: HudSection[]; stats?: string[]; goal?: string }) {
  const { t } = useLang();
  const [cur, setCur] = useState(-1);
  const [heading, setHeading] = useState(0);
  const [banner, setBanner] = useState<{ title: string; sub?: string; k: number } | null>(null);
  const curRef = useRef(-1);
  curRef.current = cur;

  // いま見ているセクション（目標表示とレーダーの位置に使う）
  useEffect(() => {
    if (!sections.length) return;
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const pick = () => {
      const mid = window.innerHeight * 0.45;
      let best = -1;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top < mid) best = sections.findIndex((s) => s.id === el.id) ?? i;
      });
      setCur(best);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setHeading(max > 0 ? (window.scrollY / max) * 360 : 0);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, [sections]);

  // Q / E（または [ / ]）で前後のセクションへ
  useEffect(() => {
    if (!sections.length) return;
    const k = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (tg && (tg.closest('input,textarea,select,[contenteditable="true"]') || tg.closest('[role="dialog"]'))) return;
      const key = e.key.toLowerCase();
      const d = key === 'e' || key === ']' ? 1 : key === 'q' || key === '[' ? -1 : 0;
      if (!d) return;
      const n = Math.max(-1, Math.min(sections.length - 1, curRef.current + d));
      if (n < 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      else document.getElementById(sections[n].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sections]);

  useEffect(() => {
    let tm: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ title: string; sub?: string }>).detail;
      setBanner({ ...d, k: Date.now() });
      clearTimeout(tm);
      tm = setTimeout(() => setBanner(null), 3200);
    };
    window.addEventListener('gx-banner', on);
    return () => {
      window.removeEventListener('gx-banner', on);
      clearTimeout(tm);
    };
  }, []);

  const objective = goal || (cur >= 0 ? sections[cur]?.goal : t('Scroll down, or press E, to explore', '下へスクロール、または E キーで進む'));
  const n = sections.length;

  return (
    <>
      <Boot />
      <aside className="gx-hud" aria-label={t('Status', 'ステータス')}>
        <button
          type="button"
          className="gx-radar"
          aria-label={t('Back to top', 'ページの先頭へ')}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className="gx-sweep" aria-hidden />
          <span className="gx-ring" aria-hidden />
          {sections.map((s, i) => {
            const a = ((i + 0.5) / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
            const r = 34;
            return (
              <span
                key={s.id}
                className={`gx-blip${i === cur ? ' on' : ''}`}
                style={{ left: `${50 + r * Math.cos(a)}%`, top: `${50 + r * Math.sin(a)}%` }}
                aria-hidden
              />
            );
          })}
          <span className="gx-me" style={{ transform: `translate(-50%,-50%) rotate(${heading}deg)` }} aria-hidden />
          <span className="gx-n" aria-hidden>N</span>
        </button>
        <div className="gx-stat">
          <Clock />
          {stats.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </aside>
      <div className="gx-obj" role="status" aria-live="polite">
        <span className="gx-obj-k">{t('Objective', '目標')}</span>
        <span className="gx-obj-t">{objective}</span>
        {n > 0 && (
          <span className="gx-obj-keys" aria-hidden>
            <kbd>Q</kbd>
            <kbd>E</kbd>
          </span>
        )}
      </div>
      {banner && (
        <div className="gx-banner" key={banner.k} role="alert">
          <p className="gx-banner-t">{banner.title}</p>
          {banner.sub && <p className="gx-banner-s">{banner.sub}</p>}
        </div>
      )}
    </>
  );
}
