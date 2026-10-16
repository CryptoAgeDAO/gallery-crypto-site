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
    player.addEventListener('ended', stopMusic);
  }
  return player;
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
        className="btn pub"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(!(await toggleMusic(it)));
          setBusy(false);
        }}
      >
        {busy ? 'Loading…' : playing ? '■ Stop' : '▶ Play'}
      </button>
      {err && <span className="status-err">This track could not be played.</span>}
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
