'use client';

import { useEffect, useState } from 'react';
import { audioUrl } from '@/lib/supabase';
import type { Item } from '@/lib/types';

// 1曲ずつ再生する小さなプレーヤー（画面下のバーで停止）
type Now = { id: string; label: string } | null;
let player: HTMLAudioElement | null = null;
let now: Now = null;
const subs = new Set<(n: Now) => void>();
const emit = () => subs.forEach((f) => f(now));

function audio(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.crossOrigin = 'anonymous'; // スペクトラム表示のため（公開ストレージはCORS可）
    player.addEventListener('ended', stopMusic);
  }
  return player;
}

// プレーヤー画面用：再生位置・音量・周波数データ
let ac: AudioContext | null = null;
let an: AnalyserNode | null = null;
export function musicTime(): { t: number; d: number } {
  return player ? { t: player.currentTime || 0, d: player.duration || 0 } : { t: 0, d: 0 };
}
export function seekMusic(r: number) {
  if (player && player.duration) player.currentTime = Math.max(0, Math.min(1, r)) * player.duration;
}
export function setMusicVolume(v: number) {
  audio().volume = Math.max(0, Math.min(1, v));
}
export function musicSpectrum(out: Uint8Array): boolean {
  if (!player || !now) return false;
  try {
    if (!ac) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return false;
      ac = new C();
      const src = ac.createMediaElementSource(player);
      an = ac.createAnalyser();
      an.fftSize = 64;
      src.connect(an);
      an.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    an!.getByteFrequencyData(out);
    return true;
  } catch {
    return false;
  }
}

export function stopMusic() {
  if (player) player.pause();
  now = null;
  emit();
}

export async function toggleMusic(it: Item): Promise<boolean> {
  if (now?.id === it.id) {
    stopMusic();
    return true;
  }
  const a = audio();
  a.src = audioUrl(it.audio_path);
  try {
    await a.play();
    now = { id: it.id, label: [it.band || 'Untitled', it.audio_name].filter(Boolean).join(' — ') };
    emit();
    return true;
  } catch {
    stopMusic();
    return false;
  }
}

export function useNowPlaying(): Now {
  const [n, setN] = useState<Now>(now);
  useEffect(() => {
    subs.add(setN);
    return () => {
      subs.delete(setN);
    };
  }, []);
  return n;
}

export function PlayButton({ it }: { it: Item }) {
  const n = useNowPlaying();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const playing = n?.id === it.id;
  return (
    <>
      <button
        className="mo-btn ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(!(await toggleMusic(it)));
          setBusy(false);
        }}
      >
        {busy ? 'Loading…' : playing ? '■ Stop' : '▶ Play'}
      </button>
      {err && <span className="mo-err">This track could not be played.</span>}
    </>
  );
}

export function MusicBar() {
  const n = useNowPlaying();
  if (!n) return null;
  return (
    <div className="mbar" role="status">
      <span className="eq" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="mt">{n.label}</span>
      <button onClick={stopMusic}>Stop</button>
    </div>
  );
}
