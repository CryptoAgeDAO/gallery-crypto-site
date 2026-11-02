// NFC タグから証明までの流れ（2D の図・3D の図・説明文で共用）。日本語は nfcSteps(lang) / tagLayers(lang) で取り出す
import type { Lang } from './i18n';

export type NfcStep = { k: string; n: number; title: string; short: string; body: string; tech: string; next?: boolean };
type Ja = { title: string; short: string; body: string };

const STEPS: (NfcStep & { ja: Ja })[] = [
  {
    k: 'piece', n: 1, title: 'The piece', short: 'NFC tag inside the back',
    body: 'A small woven tag is sewn inside the back of the cap, along the seam tape above the strap. Inside it: a copper antenna and an NTAG 424 DNA chip holding a secret key that can never be read out.',
    tech: 'NTAG 424 DNA · AES-128 · 13.56 MHz',
    ja: { title: '作品', short: '後ろの内側にNFCタグ', body: 'キャップの後ろの内側、ストラップの上の縫い目テープに沿って、小さな織りタグを縫い込みます。中には銅のアンテナと NTAG 424 DNA チップ。チップの秘密鍵は決して読み出せません。' },
  },
  {
    k: 'tap', n: 2, title: 'Tap', short: 'Any phone, no app',
    body: 'Touching a phone powers the chip — no battery, no app. The chip answers with a link that carries a fresh one-time code.',
    tech: '/tap ?e=<UID + counter, encrypted> &c=<one-time code>',
    ja: { title: 'タップ', short: 'どのスマホでも・アプリ不要', body: 'スマホを近づけるとチップに電気が届きます。電池もアプリも要りません。チップは、新しい使い捨てコードの入ったリンクを返します。' },
  },
  {
    k: 'chip', n: 3, title: 'Chip check', short: 'One-time code',
    body: 'The server checks the one-time code with the chip’s key and makes sure the tap counter went up. A copied tag can only replay an old code, so it fails.',
    tech: 'SUN message · AES-CMAC · counter must rise',
    ja: { title: 'チップの確認', short: '使い捨てコード', body: 'サーバーがチップの鍵で使い捨てコードを確かめ、タップの回数が増えていることを確認します。コピーしたタグは古いコードを繰り返すことしかできないので、通りません。' },
  },
  {
    k: 'record', n: 4, title: 'Signed record', short: 'Two signatures, one chain',
    body: 'The passport opens. Each record is signed twice — by the server key and by a founder’s device key — and linked to the one before.',
    tech: 'SHA-256 · Ed25519 + ECDSA P-256 · GCPP/2',
    ja: { title: '署名つきの記録', short: '2つの署名・1本のつながり', body: 'パスポートが開きます。各記録はサーバーの鍵と創業者の端末の鍵で二重に署名され、一つ前の記録とつながっています。' },
  },
  {
    k: 'anchor', n: 5, title: 'Public anchor', short: 'Timestamp on Solana',
    body: 'Records are rolled into one fingerprint and written to Solana. Anyone can check the time; the proof never depends on the chain.',
    tech: 'Merkle root · Solana memo',
    ja: { title: '公開の刻印', short: 'Solana に日時を刻む', body: '記録を1つの指紋にまとめて Solana に書き込みます。日時は誰でも確かめられ、証明そのものはチェーンに頼りません。' },
  },
  {
    k: 'offline', n: 6, title: 'Offline', short: 'Hang-tag QR, no signal',
    body: 'The QR on the hang tag carries a 174-byte proof. The verifier checks it on the phone with saved public keys — even with no signal.',
    tech: '/verify#g2.<174 bytes>',
    ja: { title: 'オフライン', short: '下げ札のQR・電波なし', body: '下げ札のQRには174バイトの証明が入っています。検証ツールが、保存した公開鍵でスマホの中だけで確かめます。電波がなくても使えます。' },
  },
];

const LAYERS = [
  { k: 'face', title: 'Woven face', body: 'Cut from the cap’s own fabric and stamped with its number. Its top edge is sewn into the seam tape.', ja: { title: '織りの表面', body: 'キャップと同じ生地から切り出し、番号を刻印。上の端を縫い目テープに縫い込みます。' } },
  { k: 'inlay', title: 'Antenna + chip', body: 'Copper coil on a thin film, powered by the phone’s field. The chip’s key never leaves it.', ja: { title: 'アンテナ＋チップ', body: '薄いフィルムの上の銅のコイル。スマホの電波で動きます。チップの鍵は外に出ません。' } },
  { k: 'back', title: 'Sealed backing', body: 'Heat-sealed. Pulling the label apart breaks the antenna, so a moved tag stops answering.', ja: { title: '密封した裏地', body: '熱で密封。ラベルを剥がすとアンテナが切れるので、付け替えたタグは応答しなくなります。' } },
];

export const nfcSteps = (lang: Lang = 'en'): NfcStep[] => STEPS.map(({ ja, ...s }) => (lang === 'ja' ? { ...s, ...ja } : s));
export const tagLayers = (lang: Lang = 'en') => LAYERS.map(({ ja, ...l }) => (lang === 'ja' ? { ...l, ...ja } : l));
export const NFC_STEPS = nfcSteps('en');
export const TAG_LAYERS = tagLayers('en');
