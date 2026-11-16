// 場所ごとの環境音（録音は使わず、その場で合成）：店＝低いハム、街＝雨、森＝風と虫の声、山頂＝高い風。
export type Amb = { setZone: (z: number) => void; setOn: (on: boolean) => void; close: () => void };

export function makeAmbience(): Amb | null {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0.0; master.connect(ac.destination);
  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = () => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(); return s; };
  const layer = (build: (out: GainNode) => void) => { const g = ac.createGain(); g.gain.value = 0; g.connect(master); build(g); return g; };
  // 店：低い蛍光灯のハム
  const hum = layer((g) => { for (const f of [50, 100, 150]) { const o = ac.createOscillator(); o.frequency.value = f; const og = ac.createGain(); og.gain.value = f === 50 ? 0.05 : 0.02; o.connect(og).connect(g); o.start(); } const n = src(); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; const ng = ac.createGain(); ng.gain.value = 0.05; n.connect(lp).connect(ng).connect(g); });
  // 街：雨（高めのざー）と遠い車の低音
  const rain = layer((g) => { const n = src(); const bp = ac.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1400; const ng = ac.createGain(); ng.gain.value = 0.22; n.connect(bp).connect(ng).connect(g); const n2 = src(); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120; const g2 = ac.createGain(); g2.gain.value = 0.25; n2.connect(lp).connect(g2).connect(g); });
  // 森：揺れる風と、ときどき虫の声
  const forest = layer((g) => {
    const n = src(); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6; const ng = ac.createGain(); ng.gain.value = 0.12;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.15; const lg = ac.createGain(); lg.gain.value = 0.08; lfo.connect(lg).connect(ng.gain); lfo.start();
    n.connect(bp).connect(ng).connect(g);
    const chirp = ac.createOscillator(); chirp.frequency.value = 4200; const cg = ac.createGain(); cg.gain.value = 0; const am = ac.createOscillator(); am.frequency.value = 18; const ag = ac.createGain(); ag.gain.value = 0.012; am.connect(ag).connect(cg.gain); chirp.connect(cg).connect(g); chirp.start(); am.start();
  });
  // 山頂：高く細い風
  const wind = layer((g) => { const n = src(); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2; const ng = ac.createGain(); ng.gain.value = 0.18; const lfo = ac.createOscillator(); lfo.frequency.value = 0.09; const lg = ac.createGain(); lg.gain.value = 400; lfo.connect(lg).connect(bp.frequency); lfo.start(); n.connect(bp).connect(ng).connect(g); });
  const layers = [hum, rain, forest, wind];
  let on = true;
  return {
    setZone: (z) => { const t = ac.currentTime; layers.forEach((l, i) => l.gain.setTargetAtTime(i === z ? 1 : 0, t, 1.2)); },
    setOn: (v) => { on = v; if (ac.state === 'suspended') ac.resume(); master.gain.setTargetAtTime(on ? 0.6 : 0, ac.currentTime, 0.4); },
    close: () => { ac.close(); },
  };
}
