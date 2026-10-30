'use client';
import dynamic from 'next/dynamic';
import type { CapPiece } from './CapViewer';

const CapViewer = dynamic(() => import('./CapViewer'), { ssr: false, loading: () => <div className="tv"><div className="tv-stage"><p className="tv-busy">Loading the model…</p></div></div> });
export default function CapViewerLazy({ pieces }: { pieces: CapPiece[] }) {
  return <CapViewer pieces={pieces} />;
}
