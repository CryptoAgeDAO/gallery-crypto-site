// キャップの刺繍・プリント（架空のバンドのオリジナル図柄）と、生地の凹凸
import * as THREE from 'three';
import type { CapSpec } from './capGeometry';

type Ink = { ink: string; accent: string };

function symbol(c: CanvasRenderingContext2D, art: string, cx: number, cy: number, s: number, { ink, accent }: Ink, lw: number) {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = lw;
  const P = (x: number, y: number) => [cx + x * s, cy + y * s] as const;
  switch (art) {
    case 'sun': {
      c.beginPath(); c.arc(cx, cy, 0.42 * s, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = accent;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        c.beginPath(); c.moveTo(...P(0.56 * Math.cos(a), 0.56 * Math.sin(a))); c.lineTo(...P(0.78 * Math.cos(a), 0.78 * Math.sin(a))); c.stroke();
      }
      break;
    }
    case 'arch': {
      c.beginPath(); c.moveTo(...P(-0.5, 0.55)); c.lineTo(...P(-0.5, -0.05)); c.arc(cx, cy - 0.05 * s, 0.5 * s, Math.PI, 0); c.lineTo(...P(0.5, 0.55)); c.stroke();
      c.strokeStyle = accent;
      c.beginPath(); c.moveTo(...P(-0.28, 0.55)); c.lineTo(...P(-0.28, 0.02)); c.arc(cx, cy + 0.02 * s, 0.28 * s, Math.PI, 0); c.lineTo(...P(0.28, 0.55)); c.stroke();
      c.strokeStyle = ink;
      c.beginPath(); c.moveTo(...P(-0.7, 0.55)); c.lineTo(...P(0.7, 0.55)); c.stroke();
      break;
    }
    case 'orbit': {
      c.beginPath(); c.arc(cx, cy, 0.26 * s, 0, Math.PI * 2); c.fill();
      c.strokeStyle = accent;
      c.save(); c.translate(cx, cy); c.rotate(-0.3); c.beginPath(); c.ellipse(0, 0, 0.78 * s, 0.26 * s, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      c.fillStyle = accent; c.beginPath(); c.arc(...P(0.66, -0.3), 0.07 * s, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'road': {
      c.beginPath(); c.moveTo(...P(0, -0.6)); c.lineTo(...P(-0.5, 0.6)); c.lineTo(...P(0.5, 0.6)); c.closePath(); c.stroke();
      c.strokeStyle = accent;
      for (const [a, b] of [[-0.42, -0.24], [-0.06, 0.12], [0.3, 0.5]]) { c.beginPath(); c.moveTo(...P(0, a)); c.lineTo(...P(0, b)); c.stroke(); }
      break;
    }
    case 'eye': {
      c.beginPath(); c.moveTo(...P(-0.8, 0)); c.quadraticCurveTo(...P(0, -0.7), ...P(0.8, 0)); c.quadraticCurveTo(...P(0, 0.7), ...P(-0.8, 0)); c.closePath(); c.stroke();
      c.fillStyle = accent; c.beginPath(); c.arc(cx, cy, 0.25 * s, 0, Math.PI * 2); c.fill();
      c.fillStyle = ink; c.beginPath(); c.arc(cx, cy, 0.1 * s, 0, Math.PI * 2); c.fill();
      break;
    }
    default: {
      c.beginPath();
      [[-0.6, 0.45], [-0.5, -0.4], [-0.22, 0.02], [0, -0.55], [0.22, 0.02], [0.5, -0.4], [0.6, 0.45]].forEach(([x, y], i) => (i ? c.lineTo(...P(x, y)) : c.moveTo(...P(x, y))));
      c.closePath(); c.stroke();
      c.strokeStyle = accent; c.beginPath(); c.moveTo(...P(-0.6, 0.65)); c.lineTo(...P(0.6, 0.65)); c.stroke();
    }
  }
}

function arcText(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, size: number, spread: number) {
  c.save();
  c.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const chars = [...text];
  const step = spread / Math.max(1, chars.length - 1);
  chars.forEach((ch, i) => {
    const a = -spread / 2 + i * step;
    c.save();
    c.translate(cx + r * Math.sin(a), cy - r * Math.cos(a) + r);
    c.rotate(a);
    c.fillText(ch, 0, 0);
    c.restore();
  });
  c.restore();
}

// 前面：テクスチャの (0.5, y) が前中心。y は下（つば側）が 1
export function frontArt(c: CanvasRenderingContext2D, w: number, h: number, spec: CapSpec, band: string, title: string, year: string, bump: boolean) {
  const ink = bump ? '#fff' : spec.thread, accent = bump ? '#fff' : spec.accent;
  const cx = w / 2;
  c.fillStyle = ink;
  c.strokeStyle = ink;
  const name = band.toUpperCase();
  arcText(c, name, cx, h * 0.27, w * 0.9, w * 0.052, Math.min(0.42, 0.034 * name.length));
  symbol(c, spec.art, cx, h * 0.5, w * 0.11, { ink, accent }, w * 0.012);
  c.fillStyle = accent;
  c.font = `italic 600 ${w * 0.036}px Georgia, serif`;
  c.textAlign = 'center';
  c.fillText(title, cx, h * 0.68);
  c.fillStyle = ink;
  c.font = `700 ${w * 0.024}px Arial, sans-serif`;
  c.fillText(`${year} · TOUR`.split('').join(String.fromCharCode(8202)), cx, h * 0.74);
}

export function backArt(c: CanvasRenderingContext2D, w: number, h: number, spec: CapSpec, year: string, bump: boolean) {
  c.fillStyle = bump ? '#fff' : spec.thread;
  c.font = `700 ${w * 0.03}px Arial, sans-serif`;
  c.textAlign = 'center';
  c.fillText(`EST. ${year}`, w / 2, h * 0.37);
}

// 生地の色：綾織・コーデュロイ・帆布のこまかな地模様
function base(c: CanvasRenderingContext2D, w: number, h: number, color: string, fabric: CapSpec['fabric']) {
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  c.globalAlpha = 0.07;
  c.strokeStyle = '#000';
  c.lineWidth = 1;
  if (fabric === 'cord') for (let x = 0; x < w; x += 7) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  else for (let k = -h; k < w; k += 5) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); }
  c.globalAlpha = 1;
}

// 刺繍の凹凸：図柄の部分を盛り上げ、サテン縫いの斜めの糸目を入れる
function stitchBump(draw: (c: CanvasRenderingContext2D) => void, w: number, h: number, fabric: CapSpec['fabric'], flat: boolean) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgb(110,110,110)';
  c.fillRect(0, 0, w, h);
  c.globalAlpha = 0.5;
  c.strokeStyle = fabric === 'cord' ? '#fff' : '#9a9a9a';
  c.lineWidth = fabric === 'cord' ? 3 : 1;
  if (fabric === 'cord') for (let x = 0; x < w; x += 7) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  else for (let k = -h; k < w; k += 4) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); }
  c.globalAlpha = 1;
  if (!flat) {
    const m = document.createElement('canvas');
    m.width = w; m.height = h;
    const mc = m.getContext('2d')!;
    draw(mc);
    mc.globalCompositeOperation = 'source-atop';
    mc.strokeStyle = '#b8b8b8';
    mc.lineWidth = 1.2;
    for (let k = -h; k < w; k += 3.2) { mc.beginPath(); mc.moveTo(k, h); mc.lineTo(k + h * 0.5, 0); mc.stroke(); }
    c.drawImage(m, 0, 0);
  }
  return cv;
}

const toTex = (cv: HTMLCanvasElement, color: boolean, aniso: number) => {
  const t = new THREE.CanvasTexture(cv);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
};

export function capTextures(spec: CapSpec, band: string, title: string, year: string, aniso: number) {
  const W = 2048, H = 2048;
  const mk = (bg: string, art?: (c: CanvasRenderingContext2D, bump: boolean) => void) => {
    const col = document.createElement('canvas');
    col.width = W; col.height = H;
    const cc = col.getContext('2d')!;
    base(cc, W, H, bg, spec.fabric);
    // y は上がてっぺん：テクスチャの v は下から上なので、上下を反転して描く
    if (art) art(cc, false);
    const bump = stitchBump((c) => art?.(c, true), 1024, 1024, spec.fabric, !art || Boolean(spec.print));
    return { map: toTex(col, true, aniso), bump: toTex(bump, false, aniso) };
  };
  const frontBg = spec.style === 'trucker' && spec.front ? spec.front : spec.crown;
  const front = mk(frontBg, (c, b) => {
    const s = b ? 0.5 : 1;
    c.save(); c.scale(s, s);
    // 前の刺繍は帽体の下半分（つば寄り）に
    c.translate(0, H * 0.13);
    frontArt(c, W, H, spec, band, title, year, b);
    c.restore();
  });
  const back = mk(spec.crown, (c, b) => { const s = b ? 0.5 : 1; c.save(); c.scale(s, s); backArt(c, W, H, spec, year, b); c.restore(); });
  const plain = mk(spec.crown);
  return { front, back, plain };
}

// トラッカーのメッシュ（六角の穴）
export function meshAlpha() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#000';
  const hex = (x: number, y: number, r: number) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } c.closePath(); c.fill(); };
  for (const [x, y] of [[16, 16], [48, 16], [0, 44], [32, 44], [64, 44]]) hex(x, y, 11.5);
  hex(16, 72, 11.5); hex(48, 72, 11.5);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 18);
  return t;
}
