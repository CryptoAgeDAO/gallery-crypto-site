'use client';
import dynamic from 'next/dynamic';
import { useLang } from './Lang';

function Loading() {
  const { t } = useLang();
  return <div className="st3"><div className="st3-stage"><p className="tv-busy">{t('Loading 3D…', '3Dを読み込み中…')}</p></div></div>;
}

const SolanaTree3D = dynamic(() => import('./SolanaTree3D'), { ssr: false, loading: () => <Loading /> });
export default function SolanaTree3DLazy() {
  const { lang } = useLang();
  return <SolanaTree3D key={lang} />;
}
