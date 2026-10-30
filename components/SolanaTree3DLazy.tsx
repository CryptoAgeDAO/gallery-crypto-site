'use client';
import dynamic from 'next/dynamic';

const SolanaTree3D = dynamic(() => import('./SolanaTree3D'), { ssr: false, loading: () => <div className="st3"><div className="st3-stage"><p className="tv-busy">Loading 3D…</p></div></div> });
export default function SolanaTree3DLazy() {
  return <SolanaTree3D />;
}
