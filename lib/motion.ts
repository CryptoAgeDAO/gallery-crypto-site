// トレーディングカードの動き（ブラウザ専用）。
// .tc 要素にばね付きの傾き・ホロの光をつけ、詳細カード（#flip）はドラッグで回転・タップで裏返す。
import { sfx } from './sfx';

type CardState = { rx: number; ry: number; vx: number; vy: number; tx: number; ty: number; px: number; py: number; sc: number; hover: boolean; seed: number };
type FlipState = {
  el: HTMLElement; inn: HTMLElement; sides: NodeListOf<HTMLElement>;
  a: number; va: number; ta: number; x: number; vx: number; tx: number;
  drag: null | { x: number; y: number; a: number; moved: boolean; lx: number; lt: number; v: number };
  side: number; onSide?: (side: number) => void;
};

const RM = typeof window !== 'undefined' && !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const CS = new WeakMap<HTMLElement, CardState>();
const vis = new Set<HTMLElement>();
let io: IntersectionObserver | null = null;
let F: FlipState | null = null;
let raf = 0;
let seedN = 0;
let started = false;

function stateOf(c: HTMLElement): CardState {
  let s = CS.get(c);
  if (!s) {
    s = { rx: 0, ry: 0, vx: 0, vy: 0, tx: 0, ty: 0, px: 0.5, py: 0.5, sc: 1, hover: false, seed: seedN++ * 1.7 };
    CS.set(c, s);
  }
  return s;
}

function kick() {
  if (!raf && !RM) raf = requestAnimationFrame(tick);
}

function apply(el: HTMLElement, rx: number, ry: number, hyp: number, ang: number, mx: number, my: number, sc: number | null) {
  const st = el.style;
  st.setProperty('--rx', rx.toFixed(2) + 'deg');
  st.setProperty('--ry', ry.toFixed(2) + 'deg');
  st.setProperty('--hyp', hyp.toFixed(3));
  st.setProperty('--ang', ang.toFixed(1));
  st.setProperty('--mx', mx.toFixed(1) + '%');
  st.setProperty('--my', my.toFixed(1) + '%');
  st.setProperty('--sx', (-ry * 1.3).toFixed(1));
  st.setProperty('--sy', (rx * 1.3).toFixed(1));
  if (sc != null) st.setProperty('--s', sc.toFixed(3));
}

function tick(t: number) {
  raf = 0;
  vis.forEach((c) => {
    if (!c.isConnected) {
      vis.delete(c);
      return;
    }
    const s = stateOf(c);
    if (s.hover) {
      s.tx = (0.5 - s.py) * 34;
      s.ty = (s.px - 0.5) * 44;
    } else {
      s.tx = Math.sin(t / 1500 + s.seed) * 7;
      s.ty = Math.sin(t / 2100 + s.seed * 1.3) * 12;
    }
    s.vx = (s.vx + (s.tx - s.rx) * 0.09) * 0.8;
    s.vy = (s.vy + (s.ty - s.ry) * 0.09) * 0.8;
    s.rx += s.vx;
    s.ry += s.vy;
    s.sc += ((s.hover ? 1.08 : 1) - s.sc) * 0.15;
    const hyp = Math.min(1, Math.sqrt(s.rx * s.rx + s.ry * s.ry) / 14);
    apply(c, s.rx, s.ry, hyp, s.ry * 9 - s.rx * 4, 50 + s.ry * 2.8, 50 - s.rx * 2.8, s.sc);
  });
  if (F) {
    if (!F.el.isConnected) F = null;
    else flipStep();
  }
  if (vis.size || F) kick();
}

function pos(c: HTMLElement, e: PointerEvent) {
  const r = c.getBoundingClientRect();
  const s = stateOf(c);
  if (!s.hover) sfx('tick');
  s.hover = true;
  s.px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  s.py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  vis.add(c);
  kick();
}

function unhover(c: HTMLElement) {
  stateOf(c).hover = false;
}

function flipStep() {
  const f = F!;
  if (!f.drag) {
    f.va = (f.va + (f.ta - f.a) * 0.045) * 0.86;
    f.a += f.va;
    f.vx = (f.vx + (f.tx - f.x) * 0.07) * 0.82;
    f.x += f.vx;
  }
  if (RM) {
    f.a = f.ta;
    f.x = f.tx;
  }
  f.inn.style.transform = `rotateX(${f.x.toFixed(2)}deg) rotateY(${f.a.toFixed(2)}deg)`;
  const tl = Math.sin((f.a * Math.PI) / 180);
  const hyp = Math.min(1, Math.abs(tl) * 1.5 + Math.abs(f.x) / 18 + Math.min(0.6, Math.abs(f.va) / 6));
  f.sides.forEach((c) => apply(c, 0, 0, hyp, f.a * 1.5, 50 + tl * 48, 50 - f.x * 2.2, null));
  const side = Math.round(f.ta / 180) & 1;
  if (side !== f.side) {
    f.side = side;
    sfx('flip');
    f.onSide?.(side);
  }
}

const closestCard = (t: EventTarget | null) => (t instanceof Element ? (t.closest('.tc:not(.big)') as HTMLElement | null) : null);

function endDrag(cancel: boolean) {
  if (!(F && F.drag)) return;
  const d = F.drag;
  F.drag = null;
  F.el.classList.remove('drag');
  if (!d.moved && !cancel) F.ta = Math.round(F.a / 180) * 180 + 180;
  else {
    const proj = F.a + d.v * 0.7 * 240;
    F.ta = Math.round(proj / 180) * 180;
    F.va = d.v * 12;
  }
  F.tx = 0;
  kick();
}

function start() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target instanceof Element ? e.target.closest('#flip') : null;
    if (el && F && !RM) {
      F.drag = { x: e.clientX, y: e.clientY, a: F.a, moved: false, lx: e.clientX, lt: performance.now(), v: 0 };
      el.classList.add('drag');
      kick();
    }
    const c = closestCard(e.target);
    if (c && !RM) pos(c, e);
  });
  document.addEventListener(
    'pointermove',
    (e) => {
      if (F && F.drag) {
        const d = F.drag;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        const now = performance.now();
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) d.moved = true;
        F.a = d.a + dx * 0.7;
        F.x = Math.max(-22, Math.min(22, -dy * 0.18));
        d.v = (e.clientX - d.lx) / Math.max(1, now - d.lt);
        d.lx = e.clientX;
        d.lt = now;
        kick();
        return;
      }
      if (RM) return;
      const c = closestCard(e.target);
      if (c) pos(c, e);
    },
    { passive: true },
  );
  document.addEventListener('pointerup', (e) => {
    endDrag(false);
    if (e.pointerType !== 'mouse') {
      const c = closestCard(e.target);
      if (c) unhover(c);
    }
  });
  document.addEventListener('pointercancel', (e) => {
    endDrag(true);
    const c = closestCard(e.target);
    if (c) unhover(c);
  });
  document.addEventListener('pointerout', (e) => {
    const c = closestCard(e.target);
    if (c && !(e.relatedTarget instanceof Node && c.contains(e.relatedTarget))) unhover(c);
  });
}

/** 画面内の .tc カードを動かし始める（描画のたびに呼んでよい） */
export function watchCards() {
  start();
  if (RM) return;
  const cs = document.querySelectorAll<HTMLElement>('.tc:not(.big)');
  if (!('IntersectionObserver' in window)) cs.forEach((c) => vis.add(c));
  else {
    if (!io)
      io = new IntersectionObserver(
        (es) => {
          es.forEach((e) => {
            if (e.isIntersecting) vis.add(e.target as HTMLElement);
            else vis.delete(e.target as HTMLElement);
          });
          kick();
        },
        { rootMargin: '80px' },
      );
    cs.forEach((c) => {
      if (!c.dataset.w) {
        c.dataset.w = '1';
        io!.observe(c);
      }
    });
  }
  kick();
}

/** 詳細カード：回転しながら登場。onSide は表(0)・裏(1)が変わったときに呼ばれる */
export function startFlip(el: HTMLElement, onSide?: (side: number) => void) {
  start();
  const inn = el.querySelector<HTMLElement>('.flip-in');
  if (!inn) return;
  F = { el, inn, sides: el.querySelectorAll<HTMLElement>('.tc'), a: RM ? 0 : -720, va: 0, ta: 0, x: RM ? 0 : 22, vx: 0, tx: 0, drag: null, side: 0, onSide };
  flipStep();
  kick();
}

/** 表 ⇄ 裏 */
export function flipOver() {
  if (!F) return;
  F.ta = Math.round(F.ta / 180) * 180 + 180;
  kick();
  if (RM) flipStep();
}

/** 表に戻す */
export function flipFront() {
  if (F && Math.round(F.ta / 180) & 1) flipOver();
}

export function stopFlip() {
  F = null;
}
