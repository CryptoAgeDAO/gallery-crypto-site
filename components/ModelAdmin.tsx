'use client';
// 管理画面：作品ごとに3Dモデル（CLO 3D から書き出した .glb）を登録・差し替え・削除する
import { useCallback, useEffect, useState } from 'react';
import { supabase, modelUrl } from '@/lib/supabase';
import { MODELS_SQL } from '@/lib/modelsSql';
import ModelViewerLazy from './ModelViewerLazy';
import type { ModelInfo } from './ModelViewer';
import { tt } from './Lang';

type Row = { item_id: string; path: string; name: string; bytes: number; updated_at: string };
const MAX = 50 * 1024 * 1024;
const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + ' MB';

export default function ModelAdmin({ itemId }: { itemId?: string }) {
  const db = supabase()!;
  const [row, setRow] = useState<Row | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState<{ file: File; url: string } | null>(null);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [bad, setBad] = useState('');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!itemId) return;
    const { data, error } = await db.from('item_models').select('*').eq('item_id', itemId).maybeSingle();
    if (error) {
      // テーブルがまだない（初回）
      if (/item_models|relation|schema cache/i.test(error.message)) setMissing(true);
      else setSt(tt('Could not load: ', '読み込めませんでした：') + error.message);
      return;
    }
    setMissing(false);
    setRow((data as Row) || null);
  }, [db, itemId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);

  const setup = async () => {
    setSt(tt('Setting up…', '準備中…'));
    const { data } = await db.auth.getSession();
    const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setSt(tt('Ready — you can add 3D models now', '準備できました — 3Dモデルを追加できます')); setTimeout(load, 800); }
    else setSt(tt('Automatic setup failed: ', '自動セットアップに失敗しました：') + (j.error || r.status) + tt(' — copy the setup code below and run it in Supabase.', ' — 下のコードを Supabase の SQL エディタで実行してください。'));
  };

  const pick = (file?: File) => {
    setSt(''); setBad(''); setInfo(null);
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'glb') { setSt(tt('Choose a .glb file. In CLO: File ▸ Export ▸ glTF 2.0 and pick GLB.', '.glb ファイルを選んでください。CLO の「ファイル ▸ エクスポート ▸ glTF 2.0」で GLB を選んで書き出します。')); return; }
    if (file.size > MAX) { setSt(tt(`The file is ${mb(file.size)} — over 50 MB. Lower the texture size or particle distance in CLO and export again.`, `ファイルが ${mb(file.size)} あり、50MB を超えています。CLO でテクスチャの解像度を下げるか、粒子間距離を広げて書き出し直してください。`)); return; }
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft({ file, url: URL.createObjectURL(file) });
  };

  // 大きさの確認（単位の間違いを見つける）
  const scaleNote = (i: ModelInfo) => {
    const h = Math.max(...i.size);
    if (h > 5) return tt(`The model is ${h.toFixed(1)} units tall — the unit is probably millimetres or centimetres. In CLO's export, set Scale to metres.`, `高さが ${h.toFixed(1)} 単位あります。単位がミリかセンチになっている可能性があります。CLO の書き出し設定で「スケール」をメートルにしてください。`);
    if (h < 0.1) return tt('The model is very small — check the export scale (metres).', 'モデルがとても小さいです。書き出しのスケール（メートル）を確認してください。');
    return '';
  };

  const publish = async () => {
    if (!draft || !itemId) return;
    setBusy(true);
    setSt(tt('Uploading…', 'アップロード中…'));
    try {
      const path = `${itemId}/${crypto.randomUUID()}.glb`;
      const up = await db.storage.from('models').upload(path, draft.file, { contentType: 'model/gltf-binary', cacheControl: '31536000' });
      if (up.error) throw up.error;
      const { error } = await db.from('item_models').upsert({ item_id: itemId, path, name: draft.file.name, bytes: draft.file.size, source: 'clo3d', updated_at: new Date().toISOString() });
      if (error) { await db.storage.from('models').remove([path]); throw error; }
      if (row?.path) await db.storage.from('models').remove([row.path]);
      URL.revokeObjectURL(draft.url);
      setDraft(null);
      setSt(tt('Published — the piece now opens in 3D on the site', '公開しました — サイトの作品ページが3Dで開きます'));
      await load();
    } catch (e) {
      setSt(tt('Error: ', 'エラー：') + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row || !itemId) return;
    if (!confirm(tt('Remove the 3D model from this piece?', 'この作品の3Dモデルを外しますか？'))) return;
    setBusy(true);
    const { error } = await db.from('item_models').delete().eq('item_id', itemId);
    if (!error) await db.storage.from('models').remove([row.path]);
    setBusy(false);
    setSt(error ? tt('Error: ', 'エラー：') + error.message : tt('Removed', '外しました'));
    load();
  };

  return (
    <div className="sec wide m3d" style={{ gridColumn: '1/-1' }}>
      <h4>{tt('3D model (.glb from CLO 3D)', '3Dモデル（CLO 3D から書き出した .glb）')}</h4>
      {!itemId ? (
        <p className="note">{tt('Save the piece first, then open it again to add its 3D model.', 'まず作品を保存し、もう一度開いてから3Dモデルを追加してください。')}</p>
      ) : missing ? (
        <>
          <p>{tt('One-time setup is needed before the first 3D model.', '最初の1回だけ、3Dモデル用の準備が必要です。')}</p>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn primary" onClick={setup}>{tt('Prepare 3D (once)', '3Dの準備（1回だけ）')}</button>
            <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(MODELS_SQL); setSt(tt('Setup code copied', 'セットアップのコードをコピーしました')); } catch { setSt(tt('Could not copy', 'コピーできませんでした')); } }}>{tt('Copy setup code', 'セットアップのコードをコピー')}</button>
          </div>
        </>
      ) : (
        <>
          <ol>
            <li>{tt('In CLO: File ▸ Export ▸ glTF 2.0 (GLTF/GLB), choose GLB.', 'CLO で「ファイル ▸ エクスポート ▸ glTF 2.0（GLTF/GLB）」を開き、形式は GLB。')}</li>
            <li>{tt('Untick the avatar, choose Single Object, Thick, Combined UV + diffuse colour on texture, Scale: metres.', 'アバターのチェックを外す／単一オブジェクト／厚みあり／統合UV＋テクスチャに色を焼き込む／スケールはメートル。')}</li>
            <li>{tt('Choose the file below, check it turns correctly, then press Publish.', '下でファイルを選び、プレビューで回して確認してから「サイトに公開」。')}</li>
          </ol>
          {draft ? (
            <>
              <p className="m3d-meta">{tt('Preview (not public yet)', 'プレビュー（まだ非公開）')} · {draft.file.name} · {mb(draft.file.size)}</p>
              <ModelViewerLazy src={draft.url} compact onInfo={(i) => { setInfo(i); setBad(scaleNote(i)); }} onError={(m) => setBad(tt('This file could not be opened: ', 'このファイルを開けませんでした：') + m)} />
              {info && (
                <p className="m3d-meta">
                  {tt('Meshes', 'メッシュ')} {info.meshes} · {tt('Triangles', '三角形')} {info.triangles.toLocaleString()} · {tt('Textures', 'テクスチャ')} {info.textures} · {tt('Size', '大きさ')} {info.size.map((v) => v.toFixed(2)).join(' × ')} m
                </p>
              )}
              {bad && <p className="note" style={{ color: '#b3261e' }}>{bad}</p>}
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="btn primary" disabled={busy || !info} onClick={publish}>{row ? tt('Replace on the site', 'サイトの3Dを差し替える') : tt('Publish to the site', 'サイトに公開')}</button>
                <button type="button" className="btn" disabled={busy} onClick={() => { URL.revokeObjectURL(draft.url); setDraft(null); setInfo(null); setBad(''); }}>{tt('Cancel', 'やめる')}</button>
              </div>
            </>
          ) : row ? (
            <>
              <p className="m3d-meta">{tt('On the site', 'サイトに公開中')} · {row.name} · {mb(row.bytes)} · {new Date(row.updated_at).toLocaleDateString(tt('en-US', 'ja-JP'))}</p>
              <ModelViewerLazy src={modelUrl(row.path)} compact />
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                <label className="btn" style={{ cursor: 'pointer' }}>
                  {tt('Replace with a new .glb', '新しい .glb に差し替える')}
                  <input type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <button type="button" className="btn" disabled={busy} onClick={remove}>{tt('Remove 3D', '3Dを外す')}</button>
              </div>
            </>
          ) : (
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <label className="btn primary" style={{ cursor: 'pointer' }}>
                {tt('Choose a .glb file', '.glb ファイルを選ぶ')}
                <input type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <span className="note">{tt('No 3D model yet · up to 50 MB', '3Dモデルはまだありません・50MBまで')}</span>
            </div>
          )}
        </>
      )}
      {st && <p className="status">{st}</p>}
    </div>
  );
}
