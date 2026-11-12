'use client';
// 試作アプリ：写真から3D／ゴーストマネキン。ログイン不要・写真はこの端末の中だけで処理（どこにも送らない）。
import { useState } from 'react';
import dynamic from 'next/dynamic';
import GhostMannequin from '@/components/GhostMannequin';
import { LangToggle, tt, useLang } from '@/components/Lang';

const PhotoTo3D = dynamic(() => import('@/components/PhotoTo3D'), { ssr: false, loading: () => <p className="status">…</p> });

type Mode = '3d' | 'ghost';

export default function Studio() {
  useLang();
  const [mode, setMode] = useState<Mode>('3d');
  return (
    <main className="adm studio">
      <header className="studio-hd">
        <p className="studio-logo notranslate" translate="no">GALLERY CRYPTO <span>STUDIO</span></p>
        <LangToggle />
      </header>
      <p className="studio-lead">{tt(
        'A test version. Photos are processed only on this device and never uploaded. Save the results with the download buttons.',
        '試作版です。写真はこの端末の中だけで処理し、どこにも送りません。できたものはダウンロードボタンで保存してください。',
      )}</p>
      <div className="adm-tabs">
        <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>{tt('Photo to 3D', '写真から3D')}</button>
        <button aria-pressed={mode === 'ghost'} onClick={() => setMode('ghost')}>{tt('Ghost mannequin', 'ゴーストマネキン')}</button>
      </div>
      {mode === '3d' ? (
        <div className="sec">
          <h4>{tt('Photo to 3D', '写真から3D')}</h4>
          <PhotoTo3D />
        </div>
      ) : (
        <GhostMannequin />
      )}
    </main>
  );
}
