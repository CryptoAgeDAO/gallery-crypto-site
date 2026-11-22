'use client';
// 3Dキャプチャの撮影画面：服のまわりを一周しながら、向きごとに自動で撮る。
//   ・AI（u2netp・この端末内）が服の形をその場で見分けて、取り込まれる範囲を色で重ねて見せる
//   ・スマホの向きのセンサーで、どの方向まで撮れたかを輪で表示（10°ごと・36方向）
//   ・はみ出し・遠すぎ・近すぎ・ぶれ・傾き・速すぎを見て、条件がそろった時だけ撮る
//   ・撮るたびに立体を小さく彫り直して、右下に「育っていく3D」を見せる
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { tt } from '../Lang';
import { loadMatte, saliency, matte } from '@/lib/scan/matte';
import { carve, surface, type View } from '@/lib/scan/hull';
import { canSpeak, speak, hush } from '@/lib/voice';
import { segment } from '../scanSegment';

export type Shot = { img: HTMLCanvasElement; mask: Uint8ClampedArray | null; phi: number | null; ai: boolean };
const BINS = 36, MAXPX = 1100;
type Cond = { ok: boolean; key: string; en: string; ja: string };

const grab = (v: HTMLVideoElement) => { const k = Math.min(1, MAXPX / Math.max(v.videoWidth, v.videoHeight)); const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); return c; };
// カメラの向き（方位）：端末の回転からカメラの向く方向を求める（縦持ち・横持ちどちらでも）
function bearing(a: number, b: number, g: number) {
  const d = Math.PI / 180, ca = Math.cos(a * d), sa = Math.sin(a * d), cb = Math.cos(b * d), sb = Math.sin(b * d), cg = Math.cos(g * d), sg = Math.sin(g * d);
  // R = Rz(a)·Rx(b)·Ry(g) の3列目（端末のz）を反転 = カメラの向き
  const vx = -(ca * sg + sa * sb * cg), vy = -(sa * sg - ca * sb * cg), vz = -(cb * cg);
  return { yaw: Math.atan2(vx, vy) / d, pitch: Math.asin(Math.max(-1, Math.min(1, vz))) / d };
}

export default function Capture({ onDone, onCancel }: { onDone: (shots: Shot[], sensor: boolean) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const mini = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const shots = useRef<Shot[]>([]);
  const bins = useRef<boolean[]>(Array(BINS).fill(false));
  const sens = useRef<{ yaw: number | null; pitch: number; rate: number; seen: boolean; y0: number | null }>({ yaw: null, pitch: 0, rate: 0, seen: false, y0: null });
  const live = useRef<{ area: number; edge: boolean; sharp: number; sharpRef: number; cx: number; ok: boolean; ai: boolean }>({ area: 0, edge: false, sharp: 0, sharpRef: 0, cx: 0.5, ok: false, ai: false });
  const [conds, setConds] = useState<Cond[]>([]);
  const [count, setCount] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [ai, setAi] = useState<'loading' | 'on' | 'off'>('loading');
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  // 音声ガイド：画面を見なくても撮れるように、直すことと進み具合を声で
  const [voice, setVoice] = useState(true);
  const voiceR = useRef(voice); voiceR.current = voice;
  const badSince = useRef<{ key: string; at: number; said: string }>({ key: '', at: 0, said: '' });
  const told = useRef(0);
  const lastShot = useRef(0);
  const miniApi = useRef<{ set: (g: THREE.BufferGeometry | null) => void } | null>(null);

  // カメラ・センサー
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s; if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => null); }
      } catch { setErr(tt('The camera could not be opened. Allow camera access, or choose photos or a video instead.', 'カメラを開けませんでした。カメラの使用を許可するか、写真・動画を選んで取り込んでください。')); }
    })();
    loadMatte().then(() => alive && setAi('on')).catch(() => alive && setAi('off'));
    const onO = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const r = bearing(e.alpha, e.beta, e.gamma); // ジャイロの回転から（北でなくてよい：最初の1枚からの差だけを使う）
      sens.current.seen = true; sens.current.pitch = r.pitch; sens.current.yaw = r.yaw;
    };
    const onM = (e: DeviceMotionEvent) => { const r = e.rotationRate; if (r) sens.current.rate = Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0); };
    addEventListener('deviceorientation', onO); addEventListener('devicemotion', onM);
    return () => { alive = false; hush(); removeEventListener('deviceorientation', onO); removeEventListener('devicemotion', onM); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, []);

  // 育っていく3D（小さな表示）
  useEffect(() => {
    const el = mini.current; if (!el) return;
    let r: THREE.WebGLRenderer; try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return; }
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(el.clientWidth, el.clientHeight); el.appendChild(r.domElement);
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(1, 2, 2); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(30, el.clientWidth / el.clientHeight, 0.01, 20); cam.position.set(0, 0.55, 3); cam.lookAt(0, 0.45, 0);
    const holder = new THREE.Group(); sc.add(holder);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9fd8b8, roughness: 0.6, metalness: 0.05, flatShading: false });
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); holder.rotation.y += 0.012; r.render(sc, cam); }; loop();
    miniApi.current = { set: (g) => { holder.children.forEach((c) => (c as THREE.Mesh).geometry?.dispose()); holder.clear(); if (g) holder.add(new THREE.Mesh(g, mat)); } };
    return () => { cancelAnimationFrame(raf); r.dispose(); mat.dispose(); el.innerHTML = ''; miniApi.current = null; };
  }, []);

  const rebuildMini = useCallback(() => {
    const vs: View[] = shots.current.filter((s) => s.mask && s.phi != null).map((s) => ({ img: s.img, mask: s.mask!, w: s.img.width, h: s.img.height, phi: s.phi! }));
    if (vs.length < 3) return;
    const h = carve(vs, 40); if (!h) return;
    miniApi.current?.set(surface(h, 1));
  }, []);

  // 1枚撮る（切り抜きはあとから順に）
  const take = useCallback((force = false) => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const S = sens.current;
    let phi: number | null = null, bin = -1;
    if (S.seen && S.yaw != null) {
      if (S.y0 == null) S.y0 = S.yaw;
      const d = ((S.yaw - S.y0) % 360 + 360) % 360; bin = Math.min(BINS - 1, Math.floor(d / (360 / BINS)));
      if (bins.current[bin] && !force) return;
      phi = -(d * Math.PI) / 180; // 時計回りに回る＝カメラの位置が時計回り
    }
    const shot: Shot = { img: grab(v), mask: null, phi, ai: false };
    shots.current.push(shot); if (bin >= 0) bins.current[bin] = true; lastShot.current = performance.now();
    setCount(shots.current.length);
    if (voiceR.current && canSpeak()) {
      const n = shots.current.length, f = bins.current.filter(Boolean).length / BINS;
      const ms = S.seen ? [[0.25, tt('A quarter done.', '4分の1まで撮れました。')], [0.5, tt('Halfway. Keep going.', '半分です。そのまま進んで。')], [0.75, tt('Three quarters. Almost there.', 'あと4分の1です。')], [0.95, tt('Full lap done. Press finish.', '一周撮れました。完了を押してください。')]] as [number, string][] : [];
      const m = ms.filter(([t]) => f >= t).pop();
      if (n === 1) speak(tt('Front captured. Now walk slowly around the piece.', '正面を撮りました。服のまわりをゆっくり歩いてください。'), { urgent: true });
      else if (m && told.current < m[0]) { told.current = m[0]; speak(m[1], { urgent: true }); }
    }
    try { navigator.vibrate?.(10); } catch { /* 無視 */ }
    matte(shot.img).then((r) => { shot.mask = r.mask; shot.ai = r.ai; rebuildMini(); });
  }, [rebuildMini]);

  // 毎フレーム：服の形の見張り・条件・自動撮影
  useEffect(() => {
    let raf = 0, busy = false, lastAi = 0;
    const small = document.createElement('canvas'); small.width = 160; small.height = 160; const sg = small.getContext('2d', { willReadFrequently: true })!;
    const tint = document.createElement('canvas'); tint.width = 320; tint.height = 320; const tg = tint.getContext('2d')!;
    let lastSal: Float32Array | null = null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = video.current, o = over.current; if (!v || !o || !v.videoWidth) return;
      const now = performance.now();
      if (!busy && now - lastAi > 280) {
        busy = true; lastAi = now;
        // ぶれ：小さくした画像のラプラシアンの分散
        sg.drawImage(v, 0, 0, 160, 160); const d = sg.getImageData(0, 0, 160, 160).data; let s = 0, s2 = 0, n = 0;
        for (let y = 1; y < 159; y++) for (let x = 1; x < 159; x++) { const i = (y * 160 + x) * 4, L = (q: number) => d[q] * 0.3 + d[q + 1] * 0.59 + d[q + 2] * 0.11; const lap = 4 * L(i) - L(i - 4) - L(i + 4) - L(i - 640) - L(i + 640); s += lap; s2 += lap * lap; n++; }
        const sharp = s2 / n - (s / n) ** 2; live.current.sharp = sharp; live.current.sharpRef = live.current.sharpRef ? live.current.sharpRef * 0.95 + sharp * 0.05 : sharp;
        saliency(v, v.videoWidth, v.videoHeight).then((sal) => {
          lastSal = sal; let a = 0, e = false, sx = 0;
          for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) { if (sal[y * 320 + x] > 0.5) { a++; sx += x; if (x < 3 || x > 316 || y < 3 || y > 316) e = true; } }
          live.current.area = a / (320 * 320); live.current.edge = e; live.current.cx = a ? sx / a / 320 : 0.5; live.current.ai = true;
        }).catch(() => {
          // AIが使えないとき：色の差で小さく切り抜いて同じ判定
          live.current.ai = false;
          const c = document.createElement('canvas'); c.width = 160; c.height = Math.round(160 * v.videoHeight / v.videoWidth); c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
          const L = { img: c, data: c.getContext('2d')!.getImageData(0, 0, c.width, c.height), mask: new Uint8ClampedArray(c.width * c.height).fill(255), w: c.width, h: c.height };
          segment(L, 9); let a = 0, e = false, sx = 0; const W = c.width, H = c.height;
          const sal = new Float32Array(320 * 320);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L.mask[y * W + x] > 127) { a++; sx += x; if (x < 2 || x > W - 3 || y < 2 || y > H - 3) e = true; }
          for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) sal[y * 320 + x] = L.mask[Math.floor(y * H / 320) * W + Math.floor(x * W / 320)] / 255;
          lastSal = sal; live.current.area = a / (W * H); live.current.edge = e; live.current.cx = a ? sx / a / W : 0.5;
        }).finally(() => { busy = false; });
      }
      // 取り込まれる範囲を色で重ねる
      const W = o.clientWidth, H = o.clientHeight; if (o.width !== W) { o.width = W; o.height = H; }
      const g = o.getContext('2d')!; g.clearRect(0, 0, W, H);
      const vr = v.videoWidth / v.videoHeight, br = W / H; let dw = W, dh = H, dx = 0, dy = 0; if (vr > br) { dw = H * vr; dx = (W - dw) / 2; } else { dh = W / vr; dy = (H - dh) / 2; }
      if (lastSal) { const id = tg.createImageData(320, 320); for (let i = 0; i < 320 * 320; i++) { const a = lastSal[i] > 0.5 ? 120 : 0; id.data[i * 4] = 80; id.data[i * 4 + 1] = 230; id.data[i * 4 + 2] = 160; id.data[i * 4 + 3] = a; } tg.putImageData(id, 0, 0); g.drawImage(tint, dx, dy, dw, dh); }
      // 条件
      const S = sens.current, Lv = live.current;
      const c: Cond[] = [
        { ok: Lv.area > 0.06, key: 'near', en: 'Move closer', ja: 'もう少し近づいて' },
        { ok: Lv.area < 0.72 && !Lv.edge, key: 'far', en: 'Step back — keep the whole piece in frame', ja: '少し下がって、服全体を画面に入れて' },
        { ok: Math.abs(Lv.cx - 0.5) < 0.18, key: 'center', en: 'Keep the piece in the middle', ja: '服を画面の真ん中に' },
        { ok: !S.seen || Math.abs(S.pitch) < 28, key: 'level', en: 'Hold the phone level, pointing straight at the piece', ja: 'スマホをまっすぐ服に向けて（傾けすぎない）' },
        { ok: !S.seen || S.rate < 70, key: 'slow', en: 'Move more slowly', ja: 'もう少しゆっくり' },
        { ok: Lv.sharp > Math.max(18, Lv.sharpRef * 0.55), key: 'sharp', en: 'Hold still — the image is blurred', ja: 'ぶれています。少し止まって' },
      ];
      const ok = c.every((x) => x.ok); Lv.ok = ok;
      // 直してほしいことが1.2秒続いたら声で（同じことは繰り返しすぎない）
      const b0 = c.find((x) => !x.ok);
      if (b0) { if (badSince.current.key !== b0.key) badSince.current = { key: b0.key, at: now, said: badSince.current.said }; else if (voiceR.current && now - badSince.current.at > 1200 && badSince.current.said !== b0.key + Math.floor(now / 6000)) { badSince.current.said = b0.key + Math.floor(now / 6000); speak(tt(b0.en, b0.ja), { gap: 5000 }); } }
      else badSince.current.key = '';
      if (Math.round(now / 150) % 2 === 0) { setConds(c); if (S.seen && S.yaw != null) setHeading(S.y0 == null ? 0 : ((S.yaw - S.y0) % 360 + 360) % 360); }
      // 自動撮影：センサーがあれば向きの空いている所で、なければ0.8秒ごと
      if (auto && ok && now - lastShot.current > (S.seen ? 250 : 800)) take();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [auto, take]);

  const finish = async () => {
    const sensor = sens.current.seen;
    const list = shots.current.slice();
    if (list.length < 6) { setErr(tt('Too few shots — keep walking around the piece.', 'まだ枚数が少なすぎます。服のまわりを回り続けてください。')); return; }
    // センサーがないときは、撮った順に一周を等分
    if (!sensor) list.forEach((s, i) => { s.phi = -(i / list.length) * Math.PI * 2; });
    onDone(list, sensor);
  };

  const filled = bins.current.filter(Boolean).length;
  const bad = conds.find((c) => !c.ok);
  return (
    <section className="cap">
      <div className="cap-live">
        <video ref={video} playsInline muted />
        <canvas ref={over} className="cap-over" />
        <div className="cap-frame" aria-hidden />
        <svg className="cap-ring" viewBox="-60 -60 120 120" aria-hidden>
          {Array.from({ length: BINS }, (_, k) => { const a0 = (k / BINS) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 0.8) / BINS) * Math.PI * 2 - Math.PI / 2; return <path key={k} d={`M${Math.cos(a0) * 50} ${Math.sin(a0) * 50} A50 50 0 0 1 ${Math.cos(a1) * 50} ${Math.sin(a1) * 50}`} className={bins.current[k] ? 'on' : ''} />; })}
          {heading != null && <circle cx={Math.cos((heading / 180) * Math.PI - Math.PI / 2) * 50} cy={Math.sin((heading / 180) * Math.PI - Math.PI / 2) * 50} r={5} className="cap-dot" />}
          <text x="0" y="6" textAnchor="middle">{sens.current.seen ? `${Math.round((filled / BINS) * 100)}%` : count}</text>
        </svg>
        <p className={`cap-msg ${bad ? 'warn' : 'go'}`}>{err || (bad ? tt(bad.en, bad.ja) : count === 0 ? tt('Start from the front of the piece', 'まず服の正面から') : tt('Good — walk slowly around the piece', 'いい感じです。服のまわりをゆっくり一周'))}</p>
        <div className="cap-mini" ref={mini}><span>{sens.current.seen ? tt('3D so far', 'いまの3D') : tt('3D after the lap', '一周後に3D')}</span></div>
        <p className="cap-badge">{ai === 'on' ? tt('AI cut-out on', 'AI切り抜き ON') : ai === 'loading' ? tt('Loading AI…', 'AIを準備中…') : tt('Colour cut-out', '色で切り抜き')} · {sens.current.seen ? tt('Orientation sensor on', '向きセンサー ON') : tt('No orientation sensor — one lap, even pace', '向きセンサーなし：一定の速さで一周')}</p>
      </div>
      <div className="cap-bar">
        <button className="ss-btn" onClick={finish}>{filled >= BINS * 0.75 || count >= 24 ? tt('Done — build 3D', '撮影完了 → 3Dにする') : tt(`Finish (${count})`, `ここで終える（${count}枚）`)}</button>
        <button className="ss-btn ghost" onClick={() => take(true)}>{tt('Take one now', '今の向きで1枚')}</button>
        {canSpeak() && <button className="cap-voice" aria-pressed={voice} onClick={() => { setVoice((v) => { if (v) hush(); return !v; }); }}>{voice ? tt('Voice guide on', '音声ガイド ON') : tt('Voice guide off', '音声ガイド OFF')}</button>}
        <button className="ss-chip" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>{auto ? tt('Auto capture on', '自動撮影 ON') : tt('Auto capture off', '自動撮影 OFF')}</button>
        <button className="ss-link" onClick={onCancel}>{tt('Cancel', 'やめる')}</button>
      </div>
      <ul className="cap-tips">
        <li>{tt('Hang the piece on a hanger from a door frame or hook, or put it on a torso, so you can walk all the way round.', 'ハンガーでドア枠やフックに吊るすか、トルソーに着せて、まわりを一周できるようにします。')}</li>
        <li>{tt('Keep the same distance and height the whole way. Even light, no strong shadows.', '一周のあいだ、距離と高さを同じに。光はなるべく均一に（強い影を避ける）。')}</li>
        <li>{tt('The green overlay is what will be captured. Shots are taken automatically when everything is right.', '緑の部分が取り込まれる範囲です。条件がそろうと自動で撮ります。')}</li>
      </ul>
    </section>
  );
}
