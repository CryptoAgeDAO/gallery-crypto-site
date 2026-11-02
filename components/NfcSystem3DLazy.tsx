'use client';
import dynamic from 'next/dynamic';
import { useLang } from './Lang';

function Loading() {
  const { t } = useLang();
  return <div className="tv"><div className="tv-stage"><p className="tv-busy">{t('Loading 3D…', '3Dを読み込み中…')}</p></div></div>;
}

const NfcSystem3D = dynamic(() => import('./NfcSystem3D'), { ssr: false, loading: () => <Loading /> });
export default function NfcSystem3DLazy() {
  const { lang } = useLang();
  return <NfcSystem3D key={lang} />;
}
