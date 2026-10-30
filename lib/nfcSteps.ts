// NFC タグから証明までの流れ（2D の図・3D の図・説明文で共用）
export type NfcStep = { k: string; n: number; title: string; short: string; body: string; tech: string; next?: boolean };

export const NFC_STEPS: NfcStep[] = [
  {
    k: 'piece', n: 1, title: 'The piece', short: 'NFC tag inside the back',
    body: 'A small woven tag is sewn inside the back of the cap, along the seam tape above the strap. Inside it: a copper antenna and an NTAG 424 DNA chip holding a secret key that can never be read out.',
    tech: 'NTAG 424 DNA · AES-128 · 13.56 MHz',
  },
  {
    k: 'tap', n: 2, title: 'Tap', short: 'Any phone, no app',
    body: 'Touching a phone powers the chip — no battery, no app. The chip answers with a link that carries a fresh one-time code.',
    tech: '/passport/GC-0007 ?e=<counter> &c=<one-time code>',
  },
  {
    k: 'chip', n: 3, title: 'Chip check', short: 'One-time code',
    body: 'The server checks the one-time code with the chip’s key. A copied tag can only replay an old code, so it fails.',
    tech: 'SUN message · CMAC · counter must rise', next: true,
  },
  {
    k: 'record', n: 4, title: 'Signed record', short: 'Two signatures, one chain',
    body: 'The passport opens. Each record is signed twice — by the server key and by a founder’s device key — and linked to the one before.',
    tech: 'SHA-256 · Ed25519 + ECDSA P-256 · GCPP/2',
  },
  {
    k: 'anchor', n: 5, title: 'Public anchor', short: 'Timestamp on Solana',
    body: 'Records are rolled into one fingerprint and written to Solana. Anyone can check the time; the proof never depends on the chain.',
    tech: 'Merkle root · Solana memo',
  },
  {
    k: 'offline', n: 6, title: 'Offline', short: 'Hang-tag QR, no signal',
    body: 'The QR on the hang tag carries a 174-byte proof. The verifier checks it on the phone with saved public keys — even with no signal.',
    tech: '/verify#g2.<174 bytes>',
  },
];

export const TAG_LAYERS = [
  { k: 'face', title: 'Woven face', body: 'Cut from the cap’s own fabric and stamped with its number. Its top edge is sewn into the seam tape.' },
  { k: 'inlay', title: 'Antenna + chip', body: 'Copper coil on a thin film, powered by the phone’s field. The chip’s key never leaves it.' },
  { k: 'back', title: 'Sealed backing', body: 'Heat-sealed. Pulling the label apart breaks the antenna, so a moved tag stops answering.' },
];
