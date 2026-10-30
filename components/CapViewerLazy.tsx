'use client';
import dynamic from 'next/dynamic';
import type { CapPiece } from './CapViewer';

const CapViewer = dynamic(() => import('./CapViewer'), { ssr: false, loading: () => <div className="tv"><div className="tv-stage"><p className="tv-busy">Loading the model…</p></div></div> });
export default function CapViewerLazy({ pieces, compact }: { pieces: CapPiece[]; compact?: boolean }) {
  return <CapViewer pieces={pieces} compact={compact} />;
}
