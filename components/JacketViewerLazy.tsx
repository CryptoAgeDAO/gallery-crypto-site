'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { JacketPiece } from './JacketViewer';
import type { ViewerPiece } from './TeeViewer';

const loading = () => <div className="tv"><div className="tv-stage"><p className="tv-busy">Loading the model…</p></div></div>;
const JacketViewer = dynamic(() => import('./JacketViewer'), { ssr: false, loading });
const TeeViewer = dynamic(() => import('./TeeViewer'), { ssr: false, loading });

// 3D モックアップ：MA-1（既定）とバンド T を切り替える
export default function Demo3D({ jacket, pieces }: { jacket: JacketPiece; pieces: ViewerPiece[] }) {
  const [k, setK] = useState<'ma1' | 'tee'>('ma1');
  return (
    <>
      <div className="tv-views tv-tabs" role="tablist" aria-label="Garment">
        <button role="tab" aria-selected={k === 'ma1'} aria-pressed={k === 'ma1'} onClick={() => setK('ma1')}>MA-1 flight jacket</button>
        <button role="tab" aria-selected={k === 'tee'} aria-pressed={k === 'tee'} onClick={() => setK('tee')}>Band tee</button>
      </div>
      {k === 'ma1' ? <JacketViewer piece={jacket} /> : <TeeViewer pieces={pieces} />}
    </>
  );
}
