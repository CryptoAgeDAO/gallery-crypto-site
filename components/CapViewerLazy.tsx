'use client';
import dynamic from 'next/dynamic';
import { useLang } from './Lang';

function Loading() {
  const { t } = useLang();
  return <div className="tv"><div className="tv-stage"><p className="tv-busy">{t('Loading the model…', 'モデルを読み込み中…')}</p></div></div>;
}
import type { CapPiece } from './CapViewer';

const CapViewer = dynamic(() => import('./CapViewer'), { ssr: false, loading: () => <Loading /> });
// 言語を切り替えたら、3Dの中の文字も作り直すために作り直す
export default function CapViewerLazy({ pieces, compact }: { pieces: CapPiece[]; compact?: boolean }) {
  const { lang } = useLang();
  return <CapViewer key={lang} pieces={pieces} compact={compact} />;
}
