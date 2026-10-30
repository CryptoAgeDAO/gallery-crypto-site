'use client';
import dynamic from 'next/dynamic';

const NfcSystem3D = dynamic(() => import('./NfcSystem3D'), { ssr: false, loading: () => <div className="tv"><div className="tv-stage"><p className="tv-busy">Loading 3D…</p></div></div> });
export default function NfcSystem3DLazy() {
  return <NfcSystem3D />;
}
