'use client';
// 試作アプリ：写真から3D／ゴーストマネキン。ログイン不要・写真はこの端末の中だけで処理（どこにも送らない）。
import { useState } from 'react';
import dynamic from 'next/dynamic';
import GhostMannequin from '@/components/GhostMannequin';
import { LangToggle, tt, useLang } from '@/components/Lang';

const PhotoStudio = dynamic(() => import('@/components/PhotoStudio'), { ssr: false, loading: () => <p className="status">…</p> });
const AIImport = dynamic(() => import('@/components/AIImport'), { ssr: false, loading: () => <p className="status">…</p> });
const PhotoTo3D = dynamic(() => import('@/components/PhotoTo3D'), { ssr: false, loading: () => <p className="status">…</p> });

type Mode = 'photo' | 'ai' | '3d' | 'ghost';

export default function Studio() {
  useLang();
  const [mode, setMode] = useState<Mode>('photo');
  return (
    <main className="adm studio">
      <header className="studio-hd">
        <p className="studio-logo notranslate" translate="no">GALLERY CRYPTO <span>STUDIO</span></p>
        <LangToggle />
      </header>
      <p className="studio-lead">{tt(
        'A test version. Photos are processed on this device. Only “Make 3D with AI” sends the cut-out garment image to the 3D AI. Save results with the download buttons.',
        '試作版です。写真はこの端末の中で処理します。「AIで3Dをつくる」を押したときだけ、切り抜いた服の画像を3D AIに送ります。できたものはダウンロードボタンで保存してください。',
      )}</p>
      <div className="adm-tabs">
        <button aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>{tt('Photo studio', 'フォトスタジオ')}</button>
        <button aria-pressed={mode === 'ai'} onClick={() => setMode('ai')}>{tt('AI import', 'AI取り込み')}</button>
        <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>{tt('Photo to 3D', '写真から3D')}</button>
        <button aria-pressed={mode === 'ghost'} onClick={() => setMode('ghost')}>{tt('Ghost mannequin', 'ゴーストマネキン')}</button>
      </div>
      {mode === 'photo' ? (
        <div className="sec">
          <h4>{tt('Photo studio', 'フォトスタジオ')}</h4>
          <PhotoStudio />
        </div>
      ) : mode === 'ai' ? (
        <div className="sec">
          <h4>{tt('AI import', 'AI取り込み')}</h4>
          <AIImport />
        </div>
      ) : mode === '3d' ? (
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
