'use client';
import dynamic from 'next/dynamic';
import type { ViewerPiece } from './TeeViewer';

const TeeViewer = dynamic(() => import('./TeeViewer'), { ssr: false, loading: () => <div className="tv"><div className="tv-stage"><p className="tv-busy">Loading the model…</p></div></div> });
export default function TeeViewerLazy({ pieces }: { pieces: ViewerPiece[] }) {
  return <TeeViewer pieces={pieces} />;
}
