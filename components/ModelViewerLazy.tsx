'use client';
import dynamic from 'next/dynamic';
import type { ModelInfo } from './ModelViewer';

const ModelViewer = dynamic(() => import('./ModelViewer'), {
  ssr: false,
  loading: () => (
    <div className="mv">
      <div className="mv-stage" />
      <p className="mv-busy">…</p>
    </div>
  ),
});

export default function ModelViewerLazy(p: { src: string; compact?: boolean; onInfo?: (i: ModelInfo) => void; onError?: (m: string) => void }) {
  return <ModelViewer {...p} />;
}
