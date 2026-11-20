'use client';
// ショールーム（3D）：NY の通り沿いにある、白く塗ったレンガ壁の古いストアフロントを借りたポップアップ。
// むき出しのコンクリートの床、白いプレスティン（型押し鉄板）の天井、鎖で吊った蛍光灯。中央にダートバイク。
// 服はハンガーに掛けず、鉄の額（シャドーボックス）にピンで留めるか、合板のテーブルに平置きで見せる。
// 窓の外は夜の通りで、開店を待つ人が並んでいる。床の丸（または作品）を押すと作品に近づき、横から詳細が開く。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type GPiece = { id: string; title: string; kind: 'garment' | 'cap' | 'art'; tex: string; code?: string };
export type GRoom = { key: string; pieces: GPiece[] };
export type GalleryApi = { goRoom: (i: number) => void; focus: (id: string | null) => void };
export type GState = { room: number; focus: string | null; moving: boolean; ready: boolean; lost?: boolean };

// 間口 10.4m × 奥行き 22m、天井 4.8m の細長い店。z が大きいほど通り側
const HX = 5.2, HZ = 11, CH = 4.8, EYE = 1.62;
const DOOR = 2.7; // 入口の扉の中心（x）

// ---- 素材（キャンバスで描く。どこかの作品の写しではない） ----
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a: number, b: number) => a + rnd() * (b - a);
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
function canvas(w: number, h: number, draw: Draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h); return c;
}
function tex(c: HTMLCanvasElement, rep?: [number, number]) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const DISP = '"Anton", "Oswald", Impact, "Arial Narrow", sans-serif';
const UI = '"Oswald", "Arial Narrow", "Helvetica Neue", sans-serif';

// 白く塗ったレンガ（ところどころ塗装がはげて赤いレンガがのぞく）
const brick = () => canvas(1024, 1024, (g, w, h) => {
  g.fillStyle = '#b9b6ae'; g.fillRect(0, 0, w, h);
  const rows = 16, bw = w / 8, bh = h / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 9; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, t = R(-9, 5);
    g.fillStyle = `rgb(${226 + t},${224 + t},${217 + t})`; g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x + 3, y + 3, bw - 6, 2);
    g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x + 3, y + bh - 7, bw - 6, 4);
    if (rnd() < 0.015) { g.fillStyle = `rgba(150,82,62,${R(0.18, 0.4)})`; g.beginPath(); g.ellipse(x + R(20, bw - 20), y + bh / 2, R(12, 26), R(4, 8), 0, 0, 7); g.fill(); }
  }
  for (let i = 0; i < 3200; i++) { g.fillStyle = `rgba(0,0,0,${R(0.015, 0.05)})`; g.fillRect(R(0, w), R(0, h), 1.5, 1.5); }
});
// 平らな左官壁（奥の壁。壁画を描く面）
const plaster = () => canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#efeeea'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${R(0.01, 0.035)})`; g.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 3)); }
});
// 使い込んだコンクリート（2m ごとの目地・ひび・塗料のしみ）
const concrete = () => canvas(1024, 1024, (g, w, h) => {
  g.fillStyle = '#a4a19b'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 170; k++) { const x = R(0, w), y = R(0, h), r = R(30, 220), cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `rgba(${rnd() < 0.5 ? '235,232,225' : '90,86,80'},${R(0.05, 0.16)})`); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, w, h); }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,40' : '255,255,255'},${R(0.03, 0.1)})`; g.fillRect(R(0, w), R(0, h), 1.5, 1.5); }
  for (let c = 0; c < 5; c++) { let x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += R(-30, 30); y += R(-30, 30); g.lineTo(x, y); } g.strokeStyle = `rgba(50,48,45,${R(0.25, 0.5)})`; g.lineWidth = R(0.8, 1.8); g.stroke(); }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${['250,250,248', '30,30,30', '180,40,30'][i % 3]},${R(0.25, 0.6)})`; g.beginPath(); g.arc(R(0, w), R(0, h), R(1, 5), 0, 7); g.fill(); }
  g.fillStyle = 'rgba(60,58,54,.75)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
});
// 白く塗ったプレスティンの天井板（四角い縁・中央の花形の型押し）
const tin = () => canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#efeee9'; g.fillRect(0, 0, w, h);
  const bev = (x: number, y: number, s: number, d: number) => {
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x, y, s, d); g.fillRect(x, y, d, s);
    g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(x, y + s - d, s, d); g.fillRect(x + s - d, y, d, s);
  };
  bev(0, 0, w, 10); bev(40, 40, w - 80, 7); bev(110, 110, w - 220, 5);
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(0, -46, 15, 34, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.1)'; g.beginPath(); g.ellipse(4, -42, 13, 30, 0, 0, 7); g.fill();
    g.restore();
  }
  g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.arc(cx + 3, cy + 3, 20, 0, 7); g.fill();
  g.fillStyle = '#f7f6f2'; g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill();
  for (const [x, y] of [[75, 75], [w - 75, 75], [75, h - 75], [w - 75, h - 75]]) { g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.arc(x + 2, y + 2, 9, 0, 7); g.fill(); g.fillStyle = '#fafaf7'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
});
// ペルシャ絨毯（バイクの下）
const rug = () => canvas(1024, 704, (g, w, h) => {
  g.fillStyle = '#7d1f1c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,10,10' : '200,120,90'},${R(0.04, 0.12)})`; g.fillRect(R(0, w), R(0, h), R(2, 6), 1.5); }
  const band = (m: number, t: number, col: string) => { g.strokeStyle = col; g.lineWidth = t; g.strokeRect(m, m, w - m * 2, h - m * 2); };
  band(18, 14, '#1d2a48'); band(54, 46, '#1d2a48'); band(54, 4, '#d8c79c'); band(100, 4, '#d8c79c');
  for (let x = 70; x < w - 60; x += 34) for (const y of [77, h - 77]) { g.fillStyle = '#c8a24a'; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 10, y); g.lineTo(x, y + 12); g.lineTo(x - 10, y); g.fill(); }
  for (let y = 100; y < h - 90; y += 34) for (const x of [77, w - 77]) { g.fillStyle = '#c8a24a'; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 10, y); g.lineTo(x, y + 12); g.lineTo(x - 10, y); g.fill(); }
  const cx = w / 2, cy = h / 2;
  g.fillStyle = '#1d2a48'; g.beginPath(); g.ellipse(cx, cy, 230, 150, 0, 0, 7); g.fill();
  g.fillStyle = '#d8c79c'; g.beginPath(); g.ellipse(cx, cy, 150, 96, 0, 0, 7); g.fill();
  g.fillStyle = '#7d1f1c'; g.beginPath(); g.ellipse(cx, cy, 120, 74, 0, 0, 7); g.fill();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillStyle = i % 2 ? '#c8a24a' : '#e9dfc4'; g.beginPath(); g.ellipse(cx + Math.cos(a) * 82, cy + Math.sin(a) * 50, 18, 9, a, 0, 7); g.fill(); }
  g.fillStyle = '#1d2a48'; g.beginPath(); g.arc(cx, cy, 26, 0, 7); g.fill();
  for (const [x, y] of [[150, 150], [w - 150, 150], [150, h - 150], [w - 150, h - 150]]) { g.fillStyle = '#1d2a48'; g.beginPath(); g.moveTo(x, y - 50); g.lineTo(x + 70, y); g.lineTo(x, y + 50); g.lineTo(x - 70, y); g.fill(); }
});
// アンプのグリルクロス
const grille = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 4) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); }
  for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(0,0,0,${R(0.1, 0.3)})`; g.fillRect(R(0, w), R(0, h), 2, 2); }
});
// 奥の壁に手で描いた壁画（自前の骸骨・星・文字）
const muralDraw: Draw = (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const ink = '#141414';
  const s = h * 0.78, cx = w * 0.13, cy = h * 0.5;
  g.fillStyle = ink;
  g.beginPath(); g.ellipse(cx, cy - s * 0.12, s * 0.42, s * 0.4, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(cx - s * 0.3, cy + s * 0.1); g.quadraticCurveTo(cx - s * 0.32, cy + s * 0.42, cx - s * 0.12, cy + s * 0.46); g.lineTo(cx + s * 0.12, cy + s * 0.46); g.quadraticCurveTo(cx + s * 0.32, cy + s * 0.42, cx + s * 0.3, cy + s * 0.1); g.fill();
  g.fillStyle = '#efeeea';
  for (const d of [-1, 1]) { g.beginPath(); g.ellipse(cx + d * s * 0.16, cy - s * 0.06, s * 0.12, s * 0.105, d * 0.25, 0, 7); g.fill(); }
  g.beginPath(); g.moveTo(cx, cy + s * 0.06); g.lineTo(cx - s * 0.06, cy + s * 0.18); g.lineTo(cx + s * 0.06, cy + s * 0.18); g.fill();
  for (let i = -3; i <= 3; i++) g.fillRect(cx + i * s * 0.065 - s * 0.026, cy + s * 0.27, s * 0.052, s * 0.14);
  g.fillStyle = ink;
  for (let i = 0; i < 6; i++) { g.fillRect(cx - s * 0.32 + i * s * 0.13, cy + s * 0.25, 2, s * 0.18); }
  // 星
  const star = (x: number, y: number, r: number) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
  g.fillStyle = ink; star(w * 0.27, h * 0.22, h * 0.07); star(w * 0.88, h * 0.2, h * 0.09); star(w * 0.95, h * 0.62, h * 0.05);
  g.fillStyle = '#b3261e'; star(w * 0.3, h * 0.74, h * 0.05);
  // 太い手書き風の文字と、垂れたインク
  g.fillStyle = ink; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  g.font = `400 ${Math.round(h * 0.44)}px ${DISP}`;
  const tx = w * 0.6, ty = h * 0.58;
  g.fillText('GALLERY CRYPTO', tx, ty);
  const tw = g.measureText('GALLERY CRYPTO').width;
  for (let i = 0; i < 22; i++) { const x = tx - tw / 2 + R(0, tw), L = R(h * 0.03, h * 0.2); g.fillRect(x, ty - 4, R(2, 5), L); g.beginPath(); g.arc(x + 1.5, ty - 4 + L, 3.5, 0, 7); g.fill(); }
  g.font = `500 ${Math.round(h * 0.085)}px ${UI}`;
  g.fillText('TOKYO  ★  LOS ANGELES  ★  ONE OF ONE  ★  EST. 2027', tx, h * 0.84);
  // 筆のかすれ
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${R(0.2, 0.8)})`; g.fillRect(R(0, w), R(0, h), R(1, 4), R(0.5, 1.5)); }
  g.globalCompositeOperation = 'source-over';
};
// 小さな解説カード（品番・作品名）
const cardDraw = (code: string, title: string): Draw => (g, w, h) => {
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8a8478'; g.font = `500 ${Math.round(h * 0.15)}px ${UI}`; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(code.toUpperCase(), w * 0.07, h * 0.14);
  g.fillStyle = '#151515'; g.font = `600 ${Math.round(h * 0.2)}px ${UI}`;
  let t = title; while (g.measureText(t).width > w * 0.86 && t.length > 4) t = t.slice(0, -2) + '…';
  g.fillText(t, w * 0.07, h * 0.42);
  g.fillStyle = '#b3261e'; g.fillRect(w * 0.07, h * 0.8, w * 0.1, 3);
};
// 赤いネオン（レジの上）
const neonDraw: Draw = (g, w, h) => {
  g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 600 ${Math.round(h * 0.56)}px ${UI}`;
  g.shadowColor = 'rgba(255,40,30,1)'; g.shadowBlur = h * 0.16; g.strokeStyle = '#ff3b2e'; g.lineWidth = h * 0.06; g.strokeText('ONE OF ONE', w / 2, h / 2);
  g.shadowBlur = h * 0.05; g.strokeStyle = '#ffd6cf'; g.lineWidth = h * 0.02; g.strokeText('ONE OF ONE', w / 2, h / 2);
};
// 窓ガラスのカッティング文字（外から読める向き）
const vinylDraw: Draw = (g, w, h) => {
  g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.fillStyle = 'rgba(250,250,247,.95)';
  g.font = `400 ${Math.round(h * 0.42)}px ${DISP}`; g.textBaseline = 'alphabetic'; g.fillText('GALLERY CRYPTO', w / 2, h * 0.56);
  g.font = `500 ${Math.round(h * 0.11)}px ${UI}`; g.fillText('ONE OF ONE  ·  TOKYO  ·  POP-UP STORE', w / 2, h * 0.82);
};
// バイクのタンク（白地に赤い線）
const tankTex = () => canvas(256, 128, (g, w, h) => { g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3261e'; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = '#1d2a48'; g.fillRect(0, h * 0.6, w, h * 0.05); });
const plateDraw: Draw = (g, w, h) => { g.fillStyle = '#f5f3ee'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.48, h * 0.46, 0, 0, 7); g.fill(); g.fillStyle = '#141414'; g.font = `400 ${Math.round(h * 0.62)}px ${DISP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('27', w / 2, h * 0.54); };
// 向かいの建物（夜）
const street = () => canvas(2048, 1024, (g, w, h) => {
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0b1020'); sky.addColorStop(0.6, '#262338'); sky.addColorStop(1, '#3b2c30'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  let x = 0;
  while (x < w) {
    const bw = R(180, 360), top = h * R(0.05, 0.4), hue = R(5, 25);
    g.fillStyle = `hsl(${hue},${R(18, 35)}%,${R(12, 20)}%)`; g.fillRect(x, top, bw, h - top);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, top, bw, 10);
    const cols = Math.floor(bw / 52), rows = Math.floor((h * 0.82 - top) / 70);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = rnd() < 0.35; g.fillStyle = on ? `rgba(255,${R(190, 225)},${R(120, 160)},${R(0.7, 1)})` : 'rgba(10,12,18,.85)';
      g.fillRect(x + 16 + c * 52, top + 26 + r * 70, 26, 42);
    }
    if (rnd() < 0.6) { g.strokeStyle = 'rgba(8,8,10,.9)'; g.lineWidth = 3; for (let r = 1; r < rows; r += 1) { const yy = top + 20 + r * 70; g.strokeRect(x + 10, yy + 48, bw * 0.45, 4); g.beginPath(); g.moveTo(x + 14, yy + 50); g.lineTo(x + bw * 0.45, yy - 20); g.stroke(); } }
    // 1階の店（明かり・看板）
    const sy = h * 0.82;
    g.fillStyle = `rgba(${['255,210,140', '160,220,255', '255,150,120'][Math.floor(R(0, 3))]},.85)`; g.fillRect(x + 12, sy + 20, bw - 24, h - sy - 20);
    g.fillStyle = 'rgba(20,20,24,.9)'; g.fillRect(x + 12, sy, bw - 24, 22);
    x += bw + R(0, 8);
  }
});
// 並んでいる人（店の明かりを正面から受けた、夜の立ち姿）
const personTex = (v: number) => canvas(256, 768, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const coat = ['#1f2026', '#33402f', '#4a2326', '#26344f', '#57514a', '#141414', '#6b5a3c'][v % 7];
  const jeans = ['#1e2a42', '#1c1c1e', '#33405a', '#2a2a2a'][v % 4], skin = ['#c9a285', '#8a5c43', '#e3c4a8', '#5c3c2b', '#b4825f'][v % 5];
  const hood = v % 3 === 1, cap = v % 3 === 2;
  const P = (pts: number[][]) => { g.beginPath(); g.moveTo(pts[0][0] * w, pts[0][1] * h); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * w, pts[i][1] * h); g.closePath(); g.fill(); };
  // 脚と靴
  g.fillStyle = jeans;
  P([[0.37, 0.54], [0.495, 0.54], [0.48, 0.93], [0.385, 0.93]]); P([[0.505, 0.54], [0.63, 0.54], [0.615, 0.93], [0.52, 0.93]]);
  g.fillStyle = v % 2 ? '#ecebe6' : '#151515';
  for (const x of [0.35, 0.51]) { g.beginPath(); g.ellipse((x + 0.07) * w, 0.945 * h, 0.085 * w, 0.018 * h, 0, 0, 7); g.fill(); }
  // 腕（体の横に下ろす）と手
  g.fillStyle = coat;
  P([[0.22, 0.24], [0.3, 0.22], [0.31, 0.5], [0.23, 0.52]]); P([[0.7, 0.22], [0.78, 0.24], [0.77, 0.52], [0.69, 0.5]]);
  g.fillStyle = skin; g.beginPath(); g.ellipse(0.27 * w, 0.535 * h, 0.035 * w, 0.02 * h, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0.73 * w, 0.535 * h, 0.035 * w, 0.02 * h, 0, 0, 7); g.fill();
  // 胴（丸い肩）
  g.fillStyle = coat; g.beginPath();
  g.moveTo(0.43 * w, 0.165 * h); g.quadraticCurveTo(0.25 * w, 0.17 * h, 0.24 * w, 0.25 * h);
  g.lineTo(0.27 * w, 0.57 * h); g.lineTo(0.73 * w, 0.57 * h); g.lineTo(0.76 * w, 0.25 * h);
  g.quadraticCurveTo(0.75 * w, 0.17 * h, 0.57 * w, 0.165 * h); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0.495 * w, 0.2 * h, 0.012 * w, 0.37 * h);
  // 首・頭・髪や帽子
  g.fillStyle = skin; g.fillRect(0.46 * w, 0.13 * h, 0.08 * w, 0.045 * h);
  g.beginPath(); g.ellipse(0.5 * w, 0.1 * h, 0.085 * w, 0.048 * h, 0, 0, 7); g.fill();
  g.fillStyle = hood ? coat : cap ? '#111' : ['#1a1410', '#3b2a1c', '#0d0d0d'][v % 3];
  if (hood) { g.beginPath(); g.ellipse(0.5 * w, 0.09 * h, 0.12 * w, 0.065 * h, 0, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(0.62 * w, 0.16 * h); g.lineTo(0.38 * w, 0.16 * h); g.closePath(); g.fill(); }
  else { g.beginPath(); g.ellipse(0.5 * w, 0.085 * h, 0.09 * w, 0.038 * h, 0, Math.PI, 0); g.fill(); if (cap) g.fillRect(0.5 * w, 0.078 * h, 0.13 * w, 0.012 * h); }
  // スマホを見ている人
  if (v % 4 === 0) { g.fillStyle = '#a9d6ff'; g.fillRect(0.6 * w, 0.4 * h, 0.07 * w, 0.045 * h); }
  // 下ほど暗く、片側に店の明かりのふち
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 0, 0, h); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
  const rim = g.createLinearGradient(0, 0, w, 0); rim.addColorStop(0, 'rgba(255,240,220,.22)'); rim.addColorStop(0.35, 'rgba(255,240,220,0)'); g.fillStyle = rim; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
});
const ringTex = () => canvas(256, 256, (g) => {
  const cg = g.createRadialGradient(128, 128, 60, 128, 128, 128); cg.addColorStop(0, 'rgba(255,240,210,.0)'); cg.addColorStop(0.8, 'rgba(255,245,230,.35)'); cg.addColorStop(1, 'rgba(255,245,230,0)');
  g.fillStyle = cg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(20,20,22,.10)'; g.beginPath(); g.arc(128, 128, 86, 0, 7); g.fill();
  g.strokeStyle = 'rgba(20,20,22,.9)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 88, 0, 7); g.stroke();
  g.fillStyle = '#b3261e'; g.beginPath(); g.arc(128, 128, 14, 0, 7); g.fill();
});
const glowTex = (r: number, gg: number, b: number) => canvas(256, 256, (g) => { const cg = g.createRadialGradient(128, 128, 0, 128, 128, 128); cg.addColorStop(0, `rgba(${r},${gg},${b},.55)`); cg.addColorStop(0.5, `rgba(${r},${gg},${b},.16)`); cg.addColorStop(1, `rgba(${r},${gg},${b},0)`); g.fillStyle = cg; g.fillRect(0, 0, 256, 256); });
const shadowTex = () => canvas(128, 128, (g) => { const cg = g.createRadialGradient(64, 64, 0, 64, 64, 64); cg.addColorStop(0, 'rgba(0,0,0,.55)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, 128, 128); });
const plyTex = () => canvas(512, 128, (g, w, h) => { g.fillStyle = '#c9a77c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(120,80,40,${R(0.06, 0.18)})`; g.lineWidth = R(0.5, 2); g.beginPath(); const y = R(0, h); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + R(-10, 10), w * 0.7, y + R(-10, 10), w, y + R(-6, 6)); g.stroke(); } });

export default function Gallery3D({ rooms, apiRef, onState, onPick }: { rooms: GRoom[]; apiRef: React.MutableRefObject<GalleryApi | null>; onState: (s: GState) => void; onPick: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const cb = useRef({ onState, onPick }); cb.current = { onState, onPick };
  const [coarse] = useState(() => typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const el = host.current!; seed = 11; let alive = true;
    const mobile = matchMedia('(max-width: 760px)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: mobile ? 'default' : 'high-performance', preserveDrawingBuffer: !mobile });
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 2));
    // スマホでは重い物理ベースの素材（クリアコートなど）を使わず、軽い素材に置き換える（iPhone の GPU とメモリを守る）
    const phys = (o: THREE.MeshPhysicalMaterialParameters) => {
      if (!mobile) return new THREE.MeshPhysicalMaterial(o);
      const { clearcoat, clearcoatRoughness, sheen, sheenColor, ...rest } = o; void clearcoat; void clearcoatRoughness; void sheen; void sheenColor;
      return new THREE.MeshStandardMaterial(rest as THREE.MeshStandardMaterialParameters);
    };
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    el.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cb.current.onState({ room: 0, focus: null, moving: false, ready: true, lost: true }); });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0f18);
    scene.add(new THREE.HemisphereLight(0xf3f5ff, 0x7c7870, 0.6));
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.42;
    const camera = new THREE.PerspectiveCamera(mobile ? 70 : 58, 1, 0.05, 140); camera.rotation.order = 'YXZ'; scene.add(camera);

    // 書体が読み込めたら、文字を描いた素材を描き直す
    const late: (() => void)[] = [];
    const textTex = (w: number, h: number, draw: Draw) => {
      const c = canvas(w, h, draw), t = tex(c);
      late.push(() => { const g = c.getContext('2d')!; g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; });
      return t;
    };

    // ---- 素材 ----
    const brickC = brick(), plasterC = plaster(), floorC = concrete(), tinC = tin();
    const brickMat = (rx: number, ry: number) => new THREE.MeshStandardMaterial({ map: tex(brickC, [rx, ry]), roughness: 0.9 });
    const plasterMat = (rx: number, ry: number) => new THREE.MeshStandardMaterial({ map: tex(plasterC, [rx, ry]), roughness: 0.92 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex(floorC, [HX, HZ]), roughness: 0.42, envMapIntensity: 0.9, transparent: !mobile, opacity: mobile ? 1 : 0.9 });
    const ceilMat = new THREE.MeshStandardMaterial({ map: tex(tinC, [HX * 2 / 0.6, HZ * 2 / 0.6]), roughness: 0.55, metalness: 0.15 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.45, metalness: 0.7 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdadde1, metalness: 1, roughness: 0.16 });
    const black = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.55 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.35, metalness: 0.3 });
    const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.62, 1.7), toneMapped: false });
    const plyMat = new THREE.MeshStandardMaterial({ map: tex(plyTex()), roughness: 0.7 });
    const shadowT = tex(shadowTex()), ringT = tex(ringTex()), poolT = tex(glowTex(255, 236, 205)), lampT = tex(glowTex(255, 196, 130));
    const TEXMAX = mobile ? 512 : 1024;
    const loadTex = (url: string, done: (t: THREE.Texture, aspect: number) => void, key = false) => {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
      im.onload = () => {
        if (!alive) return;
        const w = im.naturalWidth || 720, h = im.naturalHeight || 660, k = Math.min(1, TEXMAX / Math.max(w, h));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        try { c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); } catch { return; }
        // 棚に置く写真（キャップ）は、四隅の背景色を抜いて切り抜きにする
        if (key && !url.startsWith('data:image/svg')) { try {
          const cx2 = c.getContext('2d', { willReadFrequently: true })!, id = cx2.getImageData(0, 0, c.width, c.height), q = id.data, W2 = c.width, H2 = c.height;
          let br = 0, bgc = 0, bb = 0; for (const i of [0, W2 - 1, (H2 - 1) * W2, H2 * W2 - 1]) { br += q[i * 4] / 4; bgc += q[i * 4 + 1] / 4; bb += q[i * 4 + 2] / 4; }
          for (let i = 0; i < q.length; i += 4) { const dd = Math.hypot(q[i] - br, q[i + 1] - bgc, q[i + 2] - bb); q[i + 3] = Math.max(0, Math.min(255, (dd - 22) * 8)); }
          cx2.putImageData(id, 0, 0);
        } catch { /* 読めない画像はそのまま */ } }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = mobile ? 2 : 8; done(t, w / h);
      };
      im.src = url;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, parent: THREE.Object3D, seg = 10) => {
      const d = b.clone().sub(a), L = d.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), m);
      c.position.copy(a).addScaledVector(d, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(c); return c;
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const floorShadow = (x: number, z: number, w: number, d: number, o = 0.5) => { const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: o })); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.006, z); scene.add(sh); };
    const pool = (parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, t = poolT, o = 0.55) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: o })); p.position.set(x, y, z); parent.add(p); return p; };
    const obstacles: { x: number; z: number; r: number }[] = [];

    // ---- 建物：床・天井・壁 ----
    const floorGeo = new THREE.PlaneGeometry(HX * 2, HZ * 2);
    if (!mobile) { const rf = new Reflector(floorGeo, { textureWidth: 1024, textureHeight: 1024, color: 0x7d7b77 }); rf.rotation.x = -Math.PI / 2; rf.position.y = -0.002; scene.add(rf); }
    const fl = new THREE.Mesh(floorGeo, floorMat); fl.rotation.x = -Math.PI / 2; scene.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), ceilMat); ce.rotation.x = Math.PI / 2; ce.position.y = CH; scene.add(ce);
    box(0.2, CH, HZ * 2, brickMat(HZ * 2 / 1.6, CH / 1.2), -HX - 0.1, CH / 2, 0, scene);
    box(0.2, CH, HZ * 2, brickMat(HZ * 2 / 1.6, CH / 1.2), HX + 0.1, CH / 2, 0, scene);
    box(HX * 2, CH, 0.2, plasterMat(5, 2), 0, CH / 2, -HZ - 0.1, scene);
    // 天井の回り縁と、むき出しの白い鉄骨（梁）
    for (const s of [-1, 1]) box(0.16, 0.16, HZ * 2, white, s * (HX - 0.08), CH - 0.08, 0, scene);
    box(HX * 2, 0.16, 0.16, white, 0, CH - 0.08, -HZ + 0.08, scene);
    for (let z = -HZ + 3.5; z < HZ - 1; z += 4.4) { box(HX * 2, 0.36, 0.14, white, 0, CH - 0.18, z, scene); box(HX * 2, 0.03, 0.34, white, 0, CH - 0.37, z, scene); }
    // 壁際の黒い幅木と、壁を這う電線管
    for (const s of [-1, 1]) { box(0.03, 0.12, HZ * 2, black, s * (HX - 0.015), 0.06, 0, scene); rod(V(s * (HX - 0.05), 0.34, -HZ), V(s * (HX - 0.05), 0.34, HZ - 0.5), 0.016, chrome, scene, 6); }

    // ---- 通りに面したストアフロント：腰板・ガラス・鉄の方立て・扉・欄間 ----
    {
      const z = HZ;
      box(HX * 2, 0.5, 0.12, black, 0, 0.25, z, scene);
      box(HX * 2, 0.22, 0.2, black, 0, 3.45, z, scene);
      box(HX * 2, CH - 3.56, 0.2, brickMat(HX * 2 / 1.6, (CH - 3.56) / 1.2), 0, 3.56 + (CH - 3.56) / 2, z + 0.05, scene);
      for (const x of [-HX, -HX / 2 - 0.6, DOOR - 0.75, DOOR + 0.75, HX]) box(0.08, 2.9, 0.12, black, Math.max(-HX + 0.04, Math.min(HX - 0.04, x)), 1.95, z, scene);
      const glass = phys({ color: 0xd9e3ea, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0, side: THREE.DoubleSide });
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, 2.9), glass); gl.position.set(0, 1.95, z - 0.01); scene.add(gl);
      box(0.04, 0.04, 0.9, chrome, DOOR - 0.45, 1.1, z - 0.06, scene);
      box(1.5, 0.06, 0.12, black, DOOR, 0.53, z, scene);
      // 窓の文字（外から読める向き。店の中からは裏返しに見える）
      const vinyl = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: textTex(1024, 256, vinylDraw), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      vinyl.position.set(-HX / 2 - 0.3, 2.35, z + 0.02); scene.add(vinyl);
      // 歩道・縁石・車道・向かいの建物
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.6), new THREE.MeshStandardMaterial({ map: tex(concrete(), [20, 1.2]), roughness: 0.9, color: 0x9a9890 })); walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.01, z + 1.8); scene.add(walk);
      box(60, 0.15, 0.25, new THREE.MeshStandardMaterial({ color: 0x77756f, roughness: 0.9 }), 0, -0.08, z + 3.6, scene);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), new THREE.MeshBasicMaterial({ color: 0x17171b })); road.rotation.x = -Math.PI / 2; road.position.set(0, -0.15, z + 10.6); scene.add(road);
      for (const dz of [-0.08, 0.08]) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.08), new THREE.MeshBasicMaterial({ color: 0x9c8a3a })); ln.rotation.x = -Math.PI / 2; ln.position.set(0, -0.14, z + 10.6 + dz); scene.add(ln); }
      const back = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshBasicMaterial({ map: tex(street()) })); back.position.set(0, 16 - 0.15, z + 17.6); back.rotation.y = Math.PI; scene.add(back);
      // 街灯
      rod(V(7.6, -0.1, z + 3.3), V(7.6, 5.2, z + 3.3), 0.06, black, scene, 8); rod(V(7.6, 5.2, z + 3.3), V(6.4, 5.4, z + 3.3), 0.04, black, scene, 6);
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lampT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lamp.position.set(6.4, 5.2, z + 3.3); lamp.scale.setScalar(4); scene.add(lamp);
      // 開店を待つ行列と、ベルベットロープ
      const ppl = [0, 1, 2, 3, 4, 5, 6].map((v) => tex(personTex(v)));
      let px = DOOR - 1.2, k = 0;
      while (px > -HX - 9 && k < (mobile ? 5 : 16)) {
        const hs = R(0.92, 1.06);
        const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * hs, 1.86 * hs), new THREE.MeshBasicMaterial({ map: ppl[(k * 5 + 2) % 7], transparent: true, alphaTest: 0.5, color: 0x9c9890 }));
        pp.position.set(px, 0.93 * hs, z + 1.15 + (k % 2) * 0.25); pp.rotation.y = Math.PI + R(-0.35, 0.35); scene.add(pp);
        px -= R(0.55, 0.95); k++;
      }
      for (let x = DOOR - 0.9; x > -HX - 8; x -= 1.6) {
        rod(V(x, -0.01, z + 0.55), V(x, 0.95, z + 0.55), 0.025, chrome, scene, 8);
        const nb = x - 1.6; if (nb > -HX - 8) rod(V(x, 0.86, z + 0.55), V(nb, 0.86, z + 0.55), 0.018, new THREE.MeshStandardMaterial({ color: 0x5a0f12, roughness: 0.8 }), scene, 6);
      }
    }

    // ---- 照明：鎖で吊った蛍光灯・ダクトのスポット ----
    for (const x of [-2.6, 2.6]) for (let z = -HZ + 1.6; z < HZ - 1; z += mobile ? 4.8 : 2.4) {
      box(0.18, 0.07, 1.3, white, x, CH - 0.85, z, scene);
      box(0.06, 0.03, 1.2, tube, x - 0.04, CH - 0.9, z, scene); box(0.06, 0.03, 1.2, tube, x + 0.04, CH - 0.9, z, scene);
      for (const dz of [-0.55, 0.55]) rod(V(x, CH - 0.82, z + dz), V(x, CH - 0.37, z + dz), 0.006, steel, scene, 4);
    }
    for (const z of [-8, -3, 2, 7]) { const pl = new THREE.PointLight(0xf4f7ff, 7, 13, 1.5); pl.position.set(0, CH - 1.1, z); scene.add(pl); }
    for (const s of [-1, 1]) box(0.05, 0.05, HZ * 2 - 2, black, s * (HX - 0.9), CH - 0.3, -1, scene);
    box(HX * 2 - 1.6, 0.05, 0.05, black, 0, CH - 0.3, -HZ + 0.9, scene);
    const spotHead = (from: THREE.Vector3, to: THREE.Vector3) => {
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 12), black); head.position.copy(from); scene.add(head);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      rod(from, V(from.x, CH - 0.3, from.z), 0.012, black, scene, 4);
    };

    // ---- 作品の展示：左右の壁（鉄の額にピン留め）・中央の長いテーブル（平置き）・奥の壁 ----
    type Zone = { center: THREE.Vector3; normal: THREE.Vector3; dist: number };
    const zones: Zone[] = [];
    const hits: THREE.Object3D[] = [];
    const rings: THREE.Sprite[] = [];
    const spots: { id: string; room: number; pos: THREE.Vector3; normal: THREE.Vector3; d: number }[] = [];
    const ZDEF: { kind: 'wall' | 'table'; pos: THREE.Vector3; ry: number; max: number; dist: number; rack?: boolean }[] = [
      { kind: 'wall' as const, pos: V(-HX, 0, -2.2), ry: Math.PI / 2, max: 11.5, dist: mobile ? 7.2 : 5.6 },
      { kind: 'wall' as const, pos: V(0, 0, -5.9), ry: 0, max: 7.4, dist: mobile ? 6.4 : 4.8, rack: true },
      { kind: 'wall' as const, pos: V(HX, 0, -2.2), ry: -Math.PI / 2, max: 11.5, dist: mobile ? 7.2 : 5.6 },
      { kind: 'wall' as const, pos: V(0, 0, -HZ), ry: 0, max: 8.6, dist: mobile ? 9.0 : 7.2 },
    ];
    const card = (parent: THREE.Object3D, x: number, y: number, z: number, p: GPiece) => {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: textTex(512, 256, cardDraw(p.code || 'GC', p.title)), roughness: 0.8 }));
      c.position.set(x, y, z); parent.add(c); return c;
    };
    const tableTop = 0.88;
    rooms.forEach((room, ri) => {
      const Z = ZDEF[ri % ZDEF.length];
      const g = new THREE.Group(); g.position.copy(Z.pos); g.rotation.y = Z.ry; scene.add(g);
      const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), Z.ry);
      const n = room.pieces.length;
      const fw = Math.min(Z.max, Math.max(4, n * 1.85 + 0.8));
      const xs = room.pieces.map((_, k) => (n === 1 ? 0 : -fw / 2 + 0.9 + (k * (fw - 1.8)) / (n - 1)));
      if (Z.kind === 'table') {
        // 合板の天板と黒い鉄の脚。作品は斜めの台に平置き
        const L = fw + 0.4;
        zones.push({ center: Z.pos.clone().setY(tableTop), normal, dist: Z.dist });
        box(L, 0.05, 1.3, plyMat, 0, tableTop - 0.025, 0, g);
        box(L, 0.03, 1.3, black, 0, tableTop - 0.065, 0, g);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, tableTop - 0.08, 0.05, steel, sx * (L / 2 - 0.12), (tableTop - 0.08) / 2, sz * 0.55, g);
        for (const sx of [-1, 1]) box(0.04, 0.04, 1.1, steel, sx * (L / 2 - 0.12), 0.18, 0, g);
        box(L - 0.24, 0.04, 0.04, steel, 0, 0.18, 0, g);
        floorShadow(Z.pos.x, Z.pos.z, L * 1.15, 2.0, 0.55);
        for (let x = -L / 2 + 0.45; x <= L / 2 - 0.4; x += 0.9) obstacles.push({ x: Z.pos.x + x, z: Z.pos.z, r: 1.05 });
        const tilt = 0.5;
        room.pieces.forEach((p, k) => {
          const x = xs[k], maxH = 0.86, maxW = Math.min(1.25, (fw - 0.6) / Math.max(1, n) + 0.1);
          const piv = new THREE.Group(); piv.position.set(x, tableTop + 0.02, 0.25); piv.rotation.x = -Math.PI / 2 + tilt; g.add(piv);
          const board = box(1, 1, 0.025, plyMat, 0, 0, -0.016, piv);
          const mat = new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 0.9, transparent: true, alphaTest: 0.04 });
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.userData.id = p.id; piv.add(plane); hits.push(plane);
          const prop = box(0.5, 0.05, 0.05, black, 0, 0, 0, piv);
          const fit = (a: number) => {
            let w = maxH * a, h = maxH; if (w > maxW) { w = maxW; h = w / a; }
            plane.scale.set(w, h, 1); board.scale.set(w + 0.1, h + 0.1, 1);
            plane.position.set(0, h / 2 + 0.05, 0.002); board.position.set(0, h / 2 + 0.05, -0.016);
            prop.position.set(0, h * 0.85 + 0.05, -0.05); prop.scale.set(w / 0.5, 1, 1);
          };
          fit(1);
          if (p.tex) loadTex(p.tex, (t, a) => { mat.map = t; mat.needsUpdate = true; fit(a); }, p.kind === 'cap');
          card(g, x, tableTop + 0.003, 0.56, p).rotation.x = -Math.PI / 2;
          const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0.95 }));
          ring.position.set(x, tableTop + 0.12, 0.72); ring.scale.setScalar(0.26); ring.userData.id = p.id; ring.userData.base = 0.26; g.add(ring); hits.push(ring); rings.push(ring);
          g.updateMatrixWorld(true);
          const wp = new THREE.Vector3(x, tableTop + 0.25, -0.15); g.localToWorld(wp);
          spots.push({ id: p.id, room: ri, pos: wp, normal, d: mobile ? 2.1 : 1.7 });
        });
        return;
      }
      // 壁：作品ごとに額と、上から当てたスポットの光だまり
      zones.push({ center: Z.pos.clone().setY(1.7), normal, dist: Z.dist });
      const onBack = Math.abs(Z.ry) < 0.01;
      const RAILY = 2.5;
      // ラック：服があれば壁付けの銀のバー（腕木つき）と下の二段の鉄の棚、キャップがあれば三段の鉄の棚
      {
        const gx = room.pieces.map((q, k) => (q.kind === 'garment' ? xs[k] : null)).filter((v): v is number => v !== null);
        if (gx.length) {
          const x0 = Math.min(...gx) - 0.75, x1 = Math.max(...gx) + 0.75, mid = (x0 + x1) / 2, len = x1 - x0;
          rod(V(x0, RAILY, 0.345), V(x1, RAILY, 0.345), 0.018, chrome, g, 10);
          if (Z.rack) {
            // 床置きのラック：左右の支柱・脚・キャスター（壁はなく、まわりを歩ける）
            for (const ex of [x0, x1]) {
              rod(V(ex, 0.12, 0.345), V(ex, RAILY + 0.02, 0.345), 0.02, chrome, g, 8);
              rod(V(ex, 0.12, -0.05), V(ex, 0.12, 0.74), 0.018, chrome, g, 6);
              for (const ez of [-0.05, 0.74]) { const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14), black); cw.rotation.x = Math.PI / 2; cw.position.set(ex, 0.05, ez); g.add(cw); }
            }
            for (let t = x0; t <= x1; t += 0.8) obstacles.push({ x: Z.pos.x + t, z: Z.pos.z + 0.35, r: 0.75 });
            floorShadow(Z.pos.x + mid, Z.pos.z + 0.35, len * 1.1, 1.6, 0.5);
          }
          for (const bx of [x0 + 0.05, mid, x1 - 0.05]) { rod(V(bx, RAILY, 0.0), V(bx, RAILY, 0.345), 0.012, chrome, g, 6); box(0.08, 0.14, 0.02, chrome, bx, RAILY, 0.01, g); }
          // 下の棚：たたんだ服とスニーカーの箱
          for (const y of [0.28, 0.62]) box(len, 0.03, 0.42, steel, mid, y, 0.23, g);
          for (const ex of [x0, x1]) for (const ez of [0.04, 0.42]) box(0.03, 0.66, 0.03, steel, ex, 0.33, ez, g);
          const foldCols = [0x2b2d33, 0xcbc4b6, 0x4f5f74, 0x8a2a24, 0xe8e4da, 0x5c6b4a];
          for (let k = 0, xx = x0 + 0.35; xx < x1 - 0.3; xx += 0.62, k++) for (let st = 0; st < 3; st++) { const f2 = box(0.42, 0.07, 0.32, new THREE.MeshStandardMaterial({ color: foldCols[(k + st * 2) % foldCols.length], roughness: 0.9 }), xx, 0.66 + st * 0.075, 0.24, g); f2.rotation.y = (st - 1) * 0.04; }
          for (let xx = x0 + 0.3; xx < x1 - 0.3; xx += 0.5) box(0.38, 0.13, 0.26, new THREE.MeshStandardMaterial({ color: 0xd8c3a0, roughness: 0.8 }), xx, 0.36, 0.24, g);
        }
        const cx = room.pieces.map((q, k) => (q.kind === 'cap' ? xs[k] : null)).filter((v): v is number => v !== null);
        if (cx.length) {
          const x0 = Math.min(...cx) - 0.55, x1 = Math.max(...cx) + 0.55, mid = (x0 + x1) / 2, len = x1 - x0;
          for (const ex of [x0, x1]) for (const ez of [0.03, 0.34]) box(0.03, 2.3, 0.03, steel, ex, 1.15, ez, g);
          for (const y of [0.4, 0.9, 2.1]) box(len, 0.03, 0.34, steel, mid, y, 0.18, g);
          box(len, 2.3, 0.01, new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.9 }), mid, 1.15, 0.005, g);
          // 下の段：キャップの箱と、重ねた在庫
          const boxM = [0xf1eee6, 0x1d1d1f, 0xc23b2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
          for (let xx = x0 + 0.3, k = 0; xx < x1 - 0.25; xx += 0.42, k++) { for (let st = 0; st < 2; st++) box(0.34, 0.2, 0.28, boxM[(k + st) % 3], xx, 0.52 + st * 0.205, 0.18, g); box(0.34, 0.26, 0.28, boxM[(k + 1) % 2], xx, 0.15, 0.18, g); }
        }
      }
      room.pieces.forEach((p, k) => {
        const x = xs[k];
        const maxH = p.kind === 'garment' ? 1.3 : p.kind === 'cap' ? 0.66 : 1.05;
        const cy = onBack ? 1.62 : p.kind === 'cap' ? 1.5 : 1.78;
        const maxW = Math.min(1.45, (fw - 1.0) / Math.max(1, n) + 0.15);
        const mat = new THREE.MeshStandardMaterial({ color: p.kind === 'art' ? 0xdcd6cc : 0xf2eee8, roughness: 0.9, transparent: true, alphaTest: 0.04 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.userData.id = p.id; hits.push(plane);
        const z = p.kind === 'cap' ? 0.3 : 0.16;
        plane.position.set(x, cy, z); g.add(plane);
        const lp = pool(g, x, cy + 0.35, 0.03, 2.2, 3.0); lp.visible = !Z.rack;
        // 額：服は奥行きのある鉄のシャドーボックス（白い裏板にピン留め）、絵や写真は白いマットの黒い額
        const fr = new THREE.Group(); fr.position.set(x, cy, 0); g.add(fr);
        const back = box(1, 1, 0.02, white, 0, 0, 0.06, fr);
        const edges = [box(1, 0.04, 0.16, black, 0, 0, 0.1, fr), box(1, 0.04, 0.16, black, 0, 0, 0.1, fr), box(0.04, 1, 0.16, black, 0, 0, 0.1, fr), box(0.04, 1, 0.16, black, 0, 0, 0.1, fr)];
        const pins = p.kind === 'garment' ? [0, 1].map(() => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), chrome); fr.add(s); return s; }) : [];
        let shelf: THREE.Mesh | null = null;
        if (p.kind === 'cap') { shelf = box(0.9, 0.035, 0.32, steel, x, cy - maxH / 2 - 0.02, 0.17, g); fr.visible = false; }
        // 服はラックに掛ける：額をやめ、木のハンガーで銀のバーから吊るす
        let hanger: THREE.Group | null = null;
        if (p.kind === 'garment') {
          fr.visible = false; plane.position.z = 0.34;
          hanger = new THREE.Group(); g.add(hanger);
          const hb = box(0.46, 0.028, 0.02, new THREE.MeshStandardMaterial({ color: 0x9c6b37, roughness: 0.5 }), 0, 0, 0, hanger); hb.rotation.z = 0;
          rod(V(0, 0.014, 0), V(0, 0.09, 0), 0.006, chrome, hanger, 4);
          const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 16, Math.PI * 1.3), chrome); hook.position.set(0, 0.11, 0); hanger.add(hook);
        }
        const fit = (a: number) => {
          let w = maxH * a, h = maxH; if (w > maxW) { w = maxW; h = w / a; }
          plane.scale.set(w, h, 1);
          const pad = p.kind === 'garment' ? 0.16 : 0.12, W = w + pad * 2, H = h + pad * 2;
          back.scale.set(W, H, 1);
          edges[0].scale.set(W + 0.04, 1, 1); edges[0].position.set(0, H / 2, 0.1);
          edges[1].scale.set(W + 0.04, 1, 1); edges[1].position.set(0, -H / 2, 0.1);
          edges[2].scale.set(1, H, 1); edges[2].position.set(-W / 2, 0, 0.1);
          edges[3].scale.set(1, H, 1); edges[3].position.set(W / 2, 0, 0.1);
          pins.forEach((s, i) => s.position.set((i ? 1 : -1) * w * 0.3, h / 2 - h * 0.07, z + 0.01));
          if (shelf) plane.position.y = cy - maxH / 2 + h / 2;
          if (hanger) { plane.position.y = RAILY - 0.14 - h / 2; hanger.position.set(x, RAILY - 0.12, 0.345); }
          lb.position.set(x + W / 2 + 0.22, cy - H / 2 + 0.1, 0.02);
          lp.scale.set(W / 1.2, H / 1.3, 1);
        };
        const lb = card(g, x, cy, 0.02, p);
        fit(1);
        if (p.tex) loadTex(p.tex, (t, a) => { mat.map = t; mat.needsUpdate = true; fit(a); }, p.kind === 'cap');
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0.95 }));
        ring.position.set(x, p.kind === 'garment' ? 0.95 : p.kind === 'cap' ? 0.62 : 0.62, p.kind === 'garment' ? 0.52 : 0.38); ring.scale.setScalar(0.32); ring.userData.id = p.id; ring.userData.base = 0.32; g.add(ring); hits.push(ring); rings.push(ring);
        g.updateMatrixWorld(true);
        const wp = new THREE.Vector3(x, cy, z); g.localToWorld(wp);
        spots.push({ id: p.id, room: ri, pos: wp, normal, d: mobile ? 3.0 : 2.5 });
        // 天井のダクトから作品に向けたスポット
        const from = onBack ? V(wp.x, CH - 0.55, -HZ + 0.9) : V(Math.sign(wp.x) * (HX - 0.9), CH - 0.55, wp.z);
        spotHead(from, wp);
      });
    });

    // ---- 店の真ん中：キャンディ塗装のローライダー（油圧で前輪を持ち上げた姿勢。ときどき上下に弾む） ----
    let carTick: ((now: number) => void) | null = null;
    {
      const CX = 0, CZ = 3.4, L = 5.3, W = 1.94;
      const car = new THREE.Group(); car.position.set(CX, 0, CZ); car.rotation.y = -0.38; scene.add(car);
      const body = new THREE.Group(); car.add(body); // 油圧で傾く部分
      const paint = phys({ color: 0x5c0b2e, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: new THREE.Color(0xff5a8a) });
      const glassM = phys({ color: 0x0d1014, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.86 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.25 });
      const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c });
      // 横から見た車体の輪郭（長いボンネット・低い屋根・長いトランク。車輪の上はアーチで切り欠く）
      const RW = 0.43, FXw = 1.62, RXw = -1.58;
      const sh = new THREE.Shape();
      sh.moveTo(L / 2, 0.3);
      sh.lineTo(L / 2, 0.62); sh.quadraticCurveTo(L / 2 - 0.05, 0.72, L / 2 - 0.3, 0.74);
      sh.lineTo(0.95, 0.8); sh.lineTo(0.35, 1.22); sh.quadraticCurveTo(0.25, 1.27, 0.1, 1.27);
      sh.lineTo(-0.95, 1.27); sh.quadraticCurveTo(-1.08, 1.26, -1.15, 1.2); sh.lineTo(-1.62, 0.83);
      sh.lineTo(-L / 2 + 0.25, 0.79); sh.quadraticCurveTo(-L / 2, 0.76, -L / 2, 0.6); sh.lineTo(-L / 2, 0.3);
      sh.lineTo(RXw - RW - 0.06, 0.3); sh.absarc(RXw, 0.3, RW + 0.06, Math.PI, 0, true);
      sh.lineTo(FXw - RW - 0.06, 0.3); sh.absarc(FXw, 0.3, RW + 0.06, Math.PI, 0, true);
      sh.lineTo(L / 2, 0.3);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 24 });
      bg.translate(0, 0, -(W - 0.12) / 2);
      const shell = new THREE.Mesh(bg, paint); body.add(shell);
      // 窓（左右・前・後ろ）
      const win = new THREE.Shape(); win.moveTo(0.88, 0.86); win.lineTo(0.33, 1.18); win.lineTo(-0.92, 1.18); win.lineTo(-1.45, 0.86); win.lineTo(0.88, 0.86);
      for (const sZ of [-1, 1]) { const wm = new THREE.Mesh(new THREE.ShapeGeometry(win), glassM); wm.position.z = sZ * (W / 2 + 0.005); if (sZ < 0) wm.rotation.y = Math.PI, wm.position.x = 0, wm.scale.x = -1; body.add(wm); }
      const ws = box(0.66, 0.012, W - 0.3, glassM, 0.64, 1.02, 0, body); ws.rotation.z = -0.62;
      const rw = box(0.6, 0.012, W - 0.3, glassM, -1.4, 1.03, 0, body); rw.rotation.z = 0.68;
      // B ピラーなしのハードトップ：窓の真ん中に細いクロームの縁
      for (const sZ of [-1, 1]) { rod(V(0.88, 0.86, sZ * (W / 2 + 0.012)), V(-1.45, 0.86, sZ * (W / 2 + 0.012)), 0.012, chrome, body, 6); rod(V(0.33, 1.19, sZ * (W / 2 + 0.012)), V(-0.92, 1.19, sZ * (W / 2 + 0.012)), 0.01, chrome, body, 6); }
      // クロームのバンパー・サイドモール・グリル・ライト
      for (const [bx, d] of [[L / 2 + 0.04, 1], [-L / 2 - 0.04, -1]] as [number, number][]) {
        const bump = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, W - 0.05, 6, 12), chrome); bump.rotation.x = Math.PI / 2; bump.position.set(bx, 0.36, 0); body.add(bump);
        for (const sZ of [-1, 1]) { const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), chrome); tip.position.set(bx - d * 0.08, 0.36, sZ * (W / 2 - 0.02)); body.add(tip); }
      }
      for (const sZ of [-1, 1]) rod(V(L / 2 - 0.15, 0.56, sZ * (W / 2 + 0.035)), V(-L / 2 + 0.15, 0.56, sZ * (W / 2 + 0.035)), 0.016, chrome, body, 6);
      // 金のピンストライプ（ボンネットとトランクの上を細く）
      for (const sZ of [-1, 1]) { const ps = new THREE.CatmullRomCurve3([V(L / 2 - 0.25, 0.745, sZ * 0.55), V(1.9, 0.765, sZ * 0.42), V(1.2, 0.79, sZ * 0.5)]); body.add(new THREE.Mesh(new THREE.TubeGeometry(ps, 24, 0.006, 5), gold)); const pt = new THREE.CatmullRomCurve3([V(-L / 2 + 0.25, 0.79, sZ * 0.55), V(-2.1, 0.81, sZ * 0.4), V(-1.7, 0.83, sZ * 0.5)]); body.add(new THREE.Mesh(new THREE.TubeGeometry(pt, 24, 0.006, 5), gold)); }
      const grille = new THREE.Group(); grille.position.set(L / 2 + 0.07, 0.52, 0); body.add(grille);
      box(0.03, 0.2, W - 0.55, chrome, 0, 0, 0, grille); for (let i = 0; i < 14; i++) box(0.035, 0.18, 0.012, black, 0.006, 0, -(W - 0.7) / 2 + i * ((W - 0.7) / 13), grille);
      for (const sZ of [-1, 1]) for (const dz of [0, 0.2]) { const hl = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), glow(0xfff6dd)); hl.position.set(L / 2 + 0.065, 0.62, sZ * (W / 2 - 0.2 - dz)); hl.rotation.y = Math.PI / 2; body.add(hl); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), chrome); rim.position.copy(hl.position); rim.rotation.y = Math.PI / 2; body.add(rim); }
      for (const sZ of [-1, 1]) for (const dz of [0, 0.18]) { const tl = new THREE.Mesh(new THREE.CircleGeometry(0.06, 18), glow(0xff2a2a)); tl.position.set(-L / 2 - 0.065, 0.6, sZ * (W / 2 - 0.22 - dz)); tl.rotation.y = -Math.PI / 2; body.add(tl); }
      // 室内：白いタックロールのベンチシートとステアリング（窓越しに見える）
      const seatM = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.7 });
      box(0.5, 0.18, W - 0.35, seatM, 0.0, 0.62, 0, body); box(0.12, 0.38, W - 0.35, seatM, -0.22, 0.86, 0, body);
      box(0.5, 0.18, W - 0.35, seatM, -0.95, 0.62, 0, body); box(0.12, 0.38, W - 0.35, seatM, -1.17, 0.86, 0, body);
      const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 32), chrome); wheelS.position.set(0.5, 0.92, 0.38); wheelS.rotation.set(0, Math.PI / 2, 0.45); body.add(wheelS);
      // ワイヤーホイール＋ホワイトリボンのタイヤ（細く小径）
      const tireM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }), wwM = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.7 });
      const wheel = (wx: number, sZ: number) => {
        const w = new THREE.Group(); w.position.set(wx, RW, sZ * (W / 2 - 0.12)); car.add(w);
        const tire = new THREE.Mesh(new THREE.TorusGeometry(RW - 0.09, 0.09, 16, 48), tireM); w.add(tire);
        const ww = new THREE.Mesh(new THREE.TorusGeometry(RW - 0.1, 0.03, 8, 48), wwM); ww.position.z = sZ * 0.07; w.add(ww);
        const rimR = RW - 0.17; const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.02, 8, 48), chrome); rim.position.z = sZ * 0.05; w.add(rim);
        const dish = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 0.04, 40, 1, true), chrome); dish.rotation.x = Math.PI / 2; w.add(dish);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.14, 16), chrome); hub.rotation.x = Math.PI / 2; hub.position.z = sZ * 0.05; w.add(hub);
        const knock = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.06, 3), gold); knock.rotation.x = sZ * Math.PI / 2; knock.position.z = sZ * 0.13; w.add(knock);
        const nS = mobile ? 14 : 48;
        for (let i = 0; i < nS; i++) { const a2 = (i / nS) * Math.PI * 2, cross = (i % 2 ? 1 : -1) * 0.04; rod(V(Math.cos(a2) * 0.04, Math.sin(a2) * 0.04, sZ * (0.05 + cross)), V(Math.cos(a2 + 0.35) * rimR, Math.sin(a2 + 0.35) * rimR, sZ * 0.02), 0.0035, chrome, w, 3); }
        return w;
      };
      const wheels = [wheel(FXw, -1), wheel(FXw, 1), wheel(RXw, -1), wheel(RXw, 1)];
      body.position.y = 0.0;
      // 床：黒い艶の円台と、映り込みの影
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.1, 0.08, 64), phys({ color: 0x111113, roughness: 0.15, clearcoat: 1 })); plinth.position.set(CX, 0.04, CZ); scene.add(plinth);
      const ringL = new THREE.Mesh(new THREE.TorusGeometry(3.07, 0.012, 6, 96), glow(0xffffff)); ringL.rotation.x = Math.PI / 2; ringL.position.set(CX, 0.085, CZ); scene.add(ringL);
      car.position.y = 0.08;
      floorShadow(CX, CZ, 5.8, 2.8, 0.55);
      for (let t = -2.4; t <= 2.4; t += 0.8) obstacles.push({ x: CX + Math.cos(-0.38) * t * 1, z: CZ - Math.sin(-0.38) * t, r: 1.25 });
      obstacles.push({ x: CX, z: CZ, r: 3.15 });
      // 油圧：前を持ち上げたまま、数秒ごとにぽんと弾む
      carTick = (now: number) => {
        const t = now / 1000, ph = (t % 6) / 6;
        const hop = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) * 0.16 : 0;
        const lift = 0.22 + hop + Math.sin(t * 1.3) * 0.01;
        body.rotation.z = Math.atan2(lift, 3.2) * 0.9; body.rotation.x = Math.sin(t * 0.9) * 0.012 + 0.03;
        body.position.y = 0.06 + lift * 0.45;
        wheels[0].position.y = wheels[1].position.y = RW + lift * 0.25;
      };
      const sp = new THREE.SpotLight(0xffffff, 40, 11, 0.55, 0.6, 1.2); sp.position.set(CX + 1.2, CH - 0.4, CZ + 2.0); sp.target.position.set(CX, 0.5, CZ); scene.add(sp, sp.target);
      const sp2 = new THREE.SpotLight(0xffd9ec, 22, 11, 0.6, 0.7, 1.2); sp2.position.set(CX - 1.6, CH - 0.4, CZ - 2.2); sp2.target.position.set(CX, 0.5, CZ); if (!mobile) scene.add(sp2, sp2.target);
      spotHead(V(CX + 1.2, CH - 0.4, CZ + 2.0), V(CX, 0.5, CZ)); spotHead(V(CX - 1.6, CH - 0.4, CZ - 2.2), V(CX, 0.5, CZ));
    }

    // ---- 入口の左：積んだギターアンプとロードケース ----
    {
      const gT = tex(grille());
      const grilleMat = new THREE.MeshStandardMaterial({ map: gT, roughness: 0.95 });
      const amp = (ax: number, az: number, ry: number) => {
        const a = new THREE.Group(); a.position.set(ax, 0, az); a.rotation.y = ry; scene.add(a);
        for (let i = 0; i < 2; i++) {
          box(0.78, 0.78, 0.38, black, 0, 0.39 + i * 0.8, 0, a);
          box(0.68, 0.68, 0.01, grilleMat, 0, 0.39 + i * 0.8, 0.195, a);
          box(0.7, 0.012, 0.012, white, 0, 0.39 + i * 0.8 + 0.345, 0.2, a); box(0.7, 0.012, 0.012, white, 0, 0.39 + i * 0.8 - 0.345, 0.2, a);
        }
        box(0.78, 0.28, 0.32, black, 0, 1.75, 0, a);
        box(0.72, 0.1, 0.01, new THREE.MeshStandardMaterial({ color: 0xb59b5c, metalness: 0.6, roughness: 0.4 }), 0, 1.72, 0.165, a);
        for (let i = 0; i < 5; i++) { const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10), black); kn.rotation.x = Math.PI / 2; kn.position.set(-0.24 + i * 0.12, 1.72, 0.18); a.add(kn); }
        floorShadow(ax, az, 1.2, 0.9, 0.6); obstacles.push({ x: ax, z: az, r: 0.75 });
      };
      amp(-HX + 0.55, HZ - 2.4, 0.5); amp(-HX + 1.45, HZ - 1.6, 0.35);
      const rc = (cx: number, cy: number, cz: number, w: number, h: number, d: number, ry: number) => {
        const c = new THREE.Group(); c.position.set(cx, cy, cz); c.rotation.y = ry; scene.add(c);
        box(w, h, d, black, 0, h / 2, 0, c);
        for (const sx of [-1, 1]) for (const sy of [0, 1]) box(0.012, 0.012, d + 0.01, chrome, sx * w / 2, sy * h, 0, c);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.012, h, 0.012, chrome, sx * w / 2, h / 2, sz * d / 2, c);
      };
      rc(-HX + 0.7, 0, HZ - 4.0, 0.9, 0.55, 0.6, 1.4); rc(-HX + 0.7, 0.55, HZ - 4.0, 0.8, 0.45, 0.55, 1.5);
      obstacles.push({ x: -HX + 0.7, z: HZ - 4.0, r: 0.7 });
    }

    // ---- 入口の右：レジカウンターと赤いネオン ----
    {
      const cx = HX - 1.05, cz = 6.6;
      const bead = canvas(512, 128, (g, w, h) => { g.fillStyle = '#1a1a1c'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 28) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 2, 0, 2, h); } });
      box(0.8, 1.0, 2.8, new THREE.MeshStandardMaterial({ map: tex(bead, [1, 1]), roughness: 0.5 }), cx, 0.5, cz, scene);
      box(0.92, 0.05, 2.92, plyMat, cx, 1.025, cz, scene);
      const reg = box(0.3, 0.22, 0.26, black, cx + 0.05, 1.16, cz - 0.6, scene); reg.rotation.y = -0.3;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ color: 0x9cc8ff })); scr.position.set(cx - 0.08, 1.2, cz - 0.62); scr.rotation.y = -Math.PI / 2 - 0.3; scene.add(scr);
      for (let i = 0; i < 4; i++) { const bag = box(0.34, 0.42, 0.12, new THREE.MeshStandardMaterial({ color: 0xf5f4ef, roughness: 0.85 }), cx, 1.26, cz + 0.6 + i * 0.13, scene); bag.rotation.y = R(-0.15, 0.15); }
      floorShadow(cx, cz, 1.4, 3.4, 0.55); for (let z = cz - 1.2; z <= cz + 1.2; z += 0.8) obstacles.push({ x: cx, z, r: 0.75 });
      const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: textTex(1024, 256, neonDraw), transparent: true, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false }));
      neon.position.set(HX - 0.06, 2.95, cz); neon.rotation.y = -Math.PI / 2; scene.add(neon);
      pool(scene, HX - 0.04, 2.95, cz, 3.6, 2.2, tex(glowTex(255, 60, 40)), 0.5).rotation.y = -Math.PI / 2;
    }

    // ---- 奥の壁の壁画 ----
    {
      const hasBack = rooms.length >= 4;
      const mw = 9.4, mh = hasBack ? 1.9 : 2.6;
      const mur = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshStandardMaterial({ map: textTex(2048, Math.round((2048 * mh) / mw), muralDraw), transparent: true, roughness: 0.95 }));
      mur.position.set(0, hasBack ? 3.62 : 2.75, -HZ + 0.012); scene.add(mur);
    }

    // 書体の読み込みを待って文字を描き直す
    const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fontsReady) Promise.all([fontsReady.load(`400 100px ${DISP}`), fontsReady.load(`600 40px ${UI}`), fontsReady.load(`italic 600 40px ${UI}`)]).catch(() => null).then(() => { if (alive) late.forEach((f) => f()); });

    // 光る管とネオンはブルームで少しにじませ、影を落とす（PC）
    let composer: EffectComposer | null = null;
    if (!mobile) {
      composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
      composer.addPass(new RenderPass(scene, camera));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const top = new THREE.DirectionalLight(0xf6f8ff, 0.7); top.position.set(-2.5, CH + 7, 3); top.target.position.set(0, 0, -1); scene.add(top, top.target);
      top.castShadow = true; top.shadow.mapSize.set(2048, 2048); top.shadow.bias = -0.0004; top.shadow.normalBias = 0.02; top.shadow.radius = 4;
      Object.assign(top.shadow.camera, { left: -HX - 1, right: HX + 1, top: HZ + 1, bottom: -HZ - 1, near: 1, far: 40 }); top.shadow.camera.updateProjectionMatrix();
      scene.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const g2 = m.geometry as THREE.BufferGeometry; g2.computeBoundingSphere?.(); const r = g2.boundingSphere?.radius ?? 0;
        const sc = Math.max(m.scale.x, m.scale.y, m.scale.z) * r;
        m.receiveShadow = true;
        m.castShadow = sc < 6 && !(m.material as THREE.Material).transparent && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      });
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.45, 1.15));
      composer.addPass(new OutputPass());
    }

    // ---- 歩く：位置と向き。目標があればそこへ歩いて向く ----
    const pos = new THREE.Vector3(0.9, EYE, HZ - 2.2);
    let yaw = 0.1, pitch = -0.05; // yaw=0 で奥（-z）を向く
    let goal: { p: THREE.Vector3; yaw: number; pitch: number } | null = null;
    const st = { room: 0, focus: null as string | null };
    const emit = () => cb.current.onState({ room: st.room, focus: st.focus, moving: !!goal, ready: true });
    const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
    const pitchTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.y - from.y, Math.hypot(to.x - from.x, to.z - from.z));
    const clampIn = (p: THREE.Vector3) => { p.x = Math.max(-HX + 0.8, Math.min(HX - 0.8, p.x)); p.z = Math.max(-HZ + 0.8, Math.min(HZ - 0.8, p.z)); return p; };
    const viewZone = (i: number) => {
      const z = zones[i]; if (!z) return;
      const p = clampIn(z.center.clone().addScaledVector(z.normal, z.dist)); p.y = EYE;
      goal = { p, yaw: yawTo(p, z.center), pitch: Math.max(-0.45, pitchTo(p, z.center)) };
    };
    const goRoom = (i: number) => { i = Math.max(0, Math.min(zones.length - 1, i)); st.focus = null; st.room = i; viewZone(i); emit(); };
    const focus = (id: string | null) => {
      if (!id) { st.focus = null; emit(); const z = zones[st.room]; if (z) { const back = clampIn(z.center.clone().addScaledVector(z.normal, z.dist * 0.7)); goal = { p: new THREE.Vector3(pos.x, EYE, pos.z).lerp(back.setY(EYE), 0.6), yaw, pitch: Math.max(-0.3, pitch * 0.5) }; } return; }
      const s = spots.find((x) => x.id === id); if (!s) return;
      const p = s.pos.clone().addScaledVector(s.normal, s.d); p.y = EYE;
      // PC は右に詳細が出るので、作品が左寄りに見えるよう少し右に立つ
      if (!mobile) p.add(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), s.normal).multiplyScalar(-0.6));
      clampIn(p);
      const look = s.pos.clone(); if (mobile) look.y -= 0.45;
      goal = { p, yaw: yawTo(p, look), pitch: pitchTo(p, look) };
      st.focus = id; st.room = s.room; emit();
    };
    apiRef.current = { goRoom, focus };
    camera.position.copy(pos);

    // ---- 操作 ----
    const keys = new Set<string>();
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null, last = { x: 0, y: 0 }, moved = 0, hover: string | null = null;
    const cast = (cx: number, cy: number): { id?: string; floor?: THREE.Vector3 } | null => {
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(hits, false)[0]; if (h) return { id: h.object.userData.id as string };
      const f = ray.intersectObject(fl, false)[0]; if (f) return { floor: f.point };
      return null;
    };
    const pd = (e: PointerEvent) => { if (e.target !== renderer.domElement) return; down = { x: e.clientX, y: e.clientY }; last = { x: e.clientX, y: e.clientY }; moved = 0; };
    const pmv = (e: PointerEvent) => {
      if (down) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) { yaw += dx * 0.0042; pitch = Math.max(-0.75, Math.min(0.6, pitch + dy * 0.003)); if (goal) goal = null; }
      } else if (e.pointerType === 'mouse' && e.target === renderer.domElement) {
        const h = cast(e.clientX, e.clientY); hover = h?.id ?? null;
        renderer.domElement.style.cursor = hover ? 'pointer' : h?.floor ? 'crosshair' : 'grab';
      }
    };
    const pu = (e: PointerEvent) => {
      if (!down) return;
      if (moved < 8) {
        const h = cast(e.clientX, e.clientY);
        if (h?.id) cb.current.onPick(h.id);
        else if (h?.floor) {
          // 床を押すと、そこまで歩く
          const p = clampIn(h.floor.clone()); p.y = EYE;
          goal = { p, yaw: yawTo(pos, p), pitch: -0.05 }; st.focus = null; emit();
        }
      }
      down = null;
    };
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()); if (e.key === 'Escape') focus(null); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    renderer.domElement.style.cursor = 'grab'; renderer.domElement.style.touchAction = 'none';
    addEventListener('pointerdown', pd); addEventListener('pointermove', pmv); addEventListener('pointerup', pu); addEventListener('keydown', kd); addEventListener('keyup', ku);
    // スマホの左下のスティック
    const joy = { x: 0, y: 0, id: -1, cx: 0, cy: 0 };
    const sEl = stick.current;
    const js = (e: PointerEvent) => { if (!sEl) return; e.stopPropagation(); joy.id = e.pointerId; const r = sEl.getBoundingClientRect(); joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; sEl.setPointerCapture(e.pointerId); jm(e); };
    const jm = (e: PointerEvent) => { if (e.pointerId !== joy.id || !sEl) return; const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy, L = Math.min(1, Math.hypot(dx, dy) / 46), a = Math.atan2(dy, dx); joy.x = Math.cos(a) * L; joy.y = Math.sin(a) * L; (sEl.firstElementChild as HTMLElement).style.transform = `translate(${joy.x * 34}px, ${joy.y * 34}px)`; if (L > 0.1) { goal = null; if (st.focus) { st.focus = null; emit(); } } };
    const je = (e: PointerEvent) => { if (e.pointerId !== joy.id || !sEl) return; joy.id = -1; joy.x = joy.y = 0; (sEl.firstElementChild as HTMLElement).style.transform = ''; };
    sEl?.addEventListener('pointerdown', js); sEl?.addEventListener('pointermove', jm); sEl?.addEventListener('pointerup', je); sEl?.addEventListener('pointercancel', je);

    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); composer?.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); addEventListener('resize', size);

    // ---- 毎フレーム ----
    let raf = 0, prev = performance.now(), first = true, zoneT = 0;
    const fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (!reduce) carTick?.(now);
      let mx = 0, mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz += 1;
      if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
      if (keys.has('a')) mx -= 1;
      if (keys.has('d')) mx += 1;
      if (keys.has('arrowleft')) yaw += dt * 1.6;
      if (keys.has('arrowright')) yaw -= dt * 1.6;
      mx += joy.x; mz += -joy.y;
      if (mx || mz) { goal = null; if (st.focus) { st.focus = null; emit(); } }
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const sp = (keys.has('shift') ? 5.2 : 3.0) * dt;
      pos.addScaledVector(fwd, mz * sp).addScaledVector(right, mx * sp);
      if (goal) {
        const k = 1 - Math.pow(0.02, dt);
        pos.lerp(goal.p, k); yaw += angDiff(yaw, goal.yaw) * k; pitch += (goal.pitch - pitch) * k;
        if (pos.distanceTo(goal.p) < 0.02 && Math.abs(angDiff(yaw, goal.yaw)) < 0.003) { goal = null; emit(); }
      }
      // 壁と什器にぶつからない（作品を見に寄るときは、テーブルの縁まで近づける）
      clampIn(pos);
      if (!goal) for (const o of obstacles) { const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz); if (d < o.r && d > 1e-4) { pos.x = o.x + (dx / d) * o.r; pos.z = o.z + (dz / d) * o.r; } }
      const walking = mx || mz || goal ? 1 : 0;
      const bob = reduce ? 0 : Math.sin(now / 160) * 0.012 * walking;
      camera.position.set(pos.x, EYE + bob, pos.z);
      camera.rotation.set(pitch, yaw, 0);
      if (!st.focus && !goal && (zoneT += dt) > 0.25) {
        zoneT = 0; let best = st.room, bs = -1e9;
        zones.forEach((z, i) => { const to = z.center.clone().sub(pos); const d = to.length(); to.y = 0; to.normalize(); const sc = to.dot(fwd) * 2 - d * 0.08; if (sc > bs) { bs = sc; best = i; } });
        if (best !== st.room) { st.room = best; emit(); }
      }
      rings.forEach((r, i) => { const on = r.userData.id === hover || r.userData.id === st.focus; const s = r.userData.base * (on ? 1.25 : 1 + Math.sin(now / 700 + i) * 0.06); r.scale.setScalar(r.scale.x + (s - r.scale.x) * 0.2); (r.material as THREE.SpriteMaterial).opacity = st.focus && !on ? 0.35 : 0.95; });
      if (composer) composer.render(); else renderer.render(scene, camera);
      if (first) { first = false; emit(); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointerdown', pd); removeEventListener('pointermove', pmv); removeEventListener('pointerup', pu); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      sEl?.removeEventListener('pointerdown', js); sEl?.removeEventListener('pointermove', jm); sEl?.removeEventListener('pointerup', je); sEl?.removeEventListener('pointercancel', je);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach((x) => x.dispose()); });
      pm.dispose(); composer?.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); apiRef.current = null;
    };
  }, [rooms, apiRef]);

  return (
    <div className="gr-3d" ref={host}>
      {coarse && <div className="gr-stick" ref={stick} aria-label="move"><i /></div>}
    </div>
  );
}
