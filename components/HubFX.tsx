'use client';
// トップの「動き」：ショールームの回転台、スペックのメーター、締切までのカウントダウン、抽選の演出、スクロールで現れる要素。
// 動きを減らす設定（prefers-reduced-motion）のときは静かに表示する。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project } from '@/lib/hub';
import { ProjectPic } from './HubArt';
import { useLang } from './Lang';

export const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// data-rv の要素を、画面に入ったときにすべり込ませる
export function useReveal(dep: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-rv]:not(.in)'));
    if (calm() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e, i) => { e.style.setProperty('--d', `${(i % 6) * 70}ms`); io.observe(e); });
    return () => io.disconnect();
  }, [dep]);
}

// 回転台：作品を順番に入れ替えながら、光が走るショールーム
export function Showroom({ ps, onOpen }: { ps: Project[]; onOpen: (p: Project) => void }) {
  const { t } = useLang();
  const [i, setI] = useState(0);
  const [tilt, setTilt] = useState<[number, number]>([0, 0]);
  useEffect(() => { if (calm()) return; const h = setInterval(() => setI((v) => (v + 1) % ps.length), 4200); return () => clearInterval(h); }, [ps.length]);
  const p = ps[i];
  return (
    <div className="gt-show" onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTilt([((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2]); }} onPointerLeave={() => setTilt([0, 0])}>
      <div className="gt-beams" aria-hidden><i /><i /><i /></div>
      <div className="gt-floor" aria-hidden />
      <button className="gt-stage" onClick={() => onOpen(p)} aria-label={p.title} style={{ ['--rx' as string]: `${-tilt[1] * 6}deg`, ['--ry' as string]: `${tilt[0] * 14}deg` }}>
        {ps.map((q, k) => <span key={q.id} className={`gt-piece ${k === i ? 'on' : ''}`}><ProjectPic p={q} /></span>)}
        <span className="gt-refl" aria-hidden>{ps.map((q, k) => <span key={q.id} className={`gt-piece ${k === i ? 'on' : ''}`}><ProjectPic p={q} /></span>)}</span>
      </button>
      <div className="gt-plate" key={p.id}>
        <span className="gt-plate-n">{p.code}</span>
        <b>{p.title}</b>
        <span>{p.sub}</span>
      </div>
      <div className="gt-dots">{ps.map((q, k) => <button key={q.id} aria-label={q.title} aria-pressed={k === i} onClick={() => setI(k)} />)}</div>
      <span className="gt-hint">{t('Tap the piece to inspect', '作品をタップして詳しく')}</span>
    </div>
  );
}

// スペック：作品の特徴を、メーターで（数値は見本データから計算）
export function specs(p: Project): { k: [string, string]; v: number; label: string }[] {
  const y = parseInt(p.year, 10) || 2000;
  const age = Math.max(0, 2027 - y);
  const ed = /edition of (\d+)|(\d+) pieces/i.exec(p.sub + ' ' + p.facts.map((f) => f[1]).join(' '));
  const n = ed ? parseInt(ed[1] || ed[2], 10) : 1;
  const cond = (p.facts.find((f) => /Condition/.test(f[0]))?.[1] || '').trim();
  const c = /^Excellent|^A\b/.test(cond) ? 0.92 : /^Very good/.test(cond) ? 0.82 : /^B\b/.test(cond) ? 0.62 : 0.75;
  return [
    { k: ['Rarity', '希少性'], v: Math.min(1, 1 / Math.sqrt(n)) * 0.9 + 0.1, label: n === 1 ? '1/1' : `1/${n}` },
    { k: ['Age', '年代'], v: Math.min(1, age / 45), label: age ? `${age}y` : 'NEW' },
    { k: ['Condition', '状態'], v: c, label: /^Excellent/.test(cond) ? 'S' : /^Very good/.test(cond) ? 'A' : /^[AB]\b/.test(cond) ? cond[0] : '—' },
    { k: ['Record', '記録'], v: Math.min(1, (p.log.length + (p.passport ? 2 : 0)) / 6), label: p.passport ? 'CHAIN' : `${p.log.length}` },
  ];
}
export function Meters({ p, big }: { p: Project; big?: boolean }) {
  const { lang } = useLang();
  return (
    <span className={`gt-meters ${big ? 'big' : ''}`}>
      {specs(p).map((s) => (
        <span key={s.k[0]} className="gt-m">
          <em>{lang === 'ja' ? s.k[1] : s.k[0]}</em>
          <i><b style={{ ['--v' as string]: s.v }} /></i>
          <small>{s.label}</small>
        </span>
      ))}
    </span>
  );
}

// 締切までのカウントダウン（日本時間の23:59まで）
export function Countdown({ until }: { until: string }) {
  const { t } = useLang();
  const end = new Date(`${until}T23:59:59+09:00`).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const d = Math.max(0, end - now);
  if (!isFinite(end)) return null;
  const dd = Math.floor(d / 86400000), hh = Math.floor(d / 3600000) % 24, mm = Math.floor(d / 60000) % 60, ss = Math.floor(d / 1000) % 60;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="gt-cd" aria-label={t('Time left to enter', '締切まで')}>
      <em>{t('Entry closes in', '締切まで')}</em>
      <b>{dd}<small>{t('d', '日')}</small> {p2(hh)}:{p2(mm)}:<span className="s">{p2(ss)}</span></b>
    </span>
  );
}

// 抽選の演出：3・2・1 → 番号がくるくる回って止まる
export function DrawShow({ run, onDone }: { run: () => Promise<{ n: number; first: string[] }>; onDone: () => void }) {
  const { t } = useLang();
  const [phase, setPhase] = useState<number | 'go' | 'roll' | 'done'>(3);
  const [res, setRes] = useState<{ n: number; first: string[] } | null>(null);
  const [roll, setRoll] = useState('000');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fast = calm();
    const seq = async () => {
      const job = run();
      if (!fast) for (const k of [3, 2, 1]) { setPhase(k); await new Promise((r) => setTimeout(r, 650)); }
      setPhase('go');
      const r = await job;
      setRes(r);
      if (!fast) {
        setPhase('roll');
        const t0 = Date.now();
        await new Promise<void>((done) => { const h = setInterval(() => { setRoll(String(Math.floor(Math.random() * 999)).padStart(3, '0')); if (Date.now() - t0 > 1100) { clearInterval(h); done(); } }, 45); });
      }
      setPhase('done');
    };
    seq();
  }, [run]);
  return createPortal(
    <div className="gt-draw" role="dialog" aria-modal="true" aria-label={t('Draw', '抽選')}>
      <div className="gt-draw-in">
        {typeof phase === 'number' && <b className="gt-count" key={phase}>{phase}</b>}
        {phase === 'go' && <b className="gt-count go">{t('DRAW', '抽選')}</b>}
        {phase === 'roll' && <b className="gt-roll">No.{roll}</b>}
        {phase === 'done' && res && (
          <div className="gt-res">
            <em>{t('Result', '結果')}</em>
            <b>{t(`${res.n} winners`, `当選 ${res.n} 名`)}</b>
            <ol>{res.first.map((x, i) => <li key={i} style={{ ['--d' as string]: `${i * 90}ms` }}>{x}</li>)}</ol>
            <button className="gt-go" onClick={onDone} autoFocus>{t('See the list', '一覧を見る')}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
