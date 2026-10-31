import 'server-only';
import { db } from './server';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { ensureIssuer, issuerAddress, issuerConfigured, loadKeyring, loadLog, serverSign, demoSeed } from './passportServer';
import { getChains } from './chains';
import { PROTOCOL, bytesToHex, sigMessage, type Anchor, type GcppEntry, type KeyEntry, type SignedEntry, type SignedKey } from './gcpp';
import { DPP_VERSION, cleanDpp, prefill } from './dpp';
import { PUBLIC_ITEM_COLUMNS, certNo, type Item } from './types';
import { DEMO_ITEMS, demoCert } from './demoData';

export type PassportBundle = {
  protocol: string;
  issuer: string;
  chain: string;
  cert: string;
  demo?: boolean;
  item: Pick<Item, 'band' | 'title' | 'year' | 'photos'> | null;
  entries: SignedEntry[];
  keyring: SignedKey[];
  anchors: Anchor[];
};

// 公開の鍵の台帳（オフライン検証の元になる）
export async function publicKeyring(): Promise<{ protocol: string; issuer: string; chain: string; keyring: SignedKey[]; anchors: Anchor[] } | null> {
  if (!issuerConfigured()) return null;
  await ensureIssuer();
  let keyring: SignedKey[] = [];
  try { keyring = await loadKeyring(); } catch {}
  const ids = Array.from(new Set(keyring.map((k) => k.anchor_id).filter(Boolean))) as number[];
  const { data: anchors } = ids.length ? await db().from('passport_anchors').select('*').in('id', ids) : { data: [] };
  return { protocol: PROTOCOL, issuer: issuerAddress(), chain: (await getChains()).solana, keyring, anchors: (anchors as Anchor[]) || [] };
}

export function parseCert(cert: string): number | null {
  const m = /^GC-(\d{1,8})$/i.exec(cert.trim());
  return m ? parseInt(m[1], 10) : null;
}

export async function getPassport(cert: string): Promise<PassportBundle | null> {
  const serial = parseCert(cert);
  if (!serial || !process.env.NEXT_PUBLIC_SUPABASE_URL || !issuerConfigured()) return null;
  await ensureIssuer();
  const { data: it } = await db().from('items').select(PUBLIC_ITEM_COLUMNS).eq('serial', serial).eq('published', true).maybeSingle();
  if (!it) return null;
  const item = it as unknown as Item;
  let entries: SignedEntry[] = [];
  let keyring: SignedKey[] = [];
  try {
    entries = await loadLog(item.id);
    keyring = await loadKeyring();
  } catch {
    return null;
  }
  if (!entries.length) return null;
  const ids = Array.from(new Set([...entries, ...keyring].map((e) => e.anchor_id).filter(Boolean))) as number[];
  const { data: anchors } = ids.length ? await db().from('passport_anchors').select('*').in('id', ids) : { data: [] };
  return { protocol: PROTOCOL, issuer: issuerAddress(), chain: (await getChains()).solana, cert: certNo(item), item: { band: item.band, title: item.title, year: item.year, photos: item.photos }, entries, keyring, anchors: (anchors as Anchor[]) || [] };
}

// 公開中で、確定済みの記録がある作品の番号（カタログからリンクするため）
export async function sealedSerials(): Promise<number[]> {
  try {
    const { data, error } = await db().from('passport_log').select('cert').eq('kind', 'seal');
    if (error || !data) return [];
    return Array.from(new Set((data as { cert: string }[]).map((r) => parseCert(r.cert)).filter((n): n is number => !!n)));
  } catch {
    return [];
  }
}

export async function listSealed(limit = 12): Promise<{ cert: string; band: string; title: string; photo: string; versions: number }[]> {
  try {
    const { data } = await db().from('passport_log').select('cert,item_id,kind').order('id', { ascending: false }).limit(500);
    const rows = (data as { cert: string; item_id: string; kind: string }[]) || [];
    const ids = Array.from(new Set(rows.filter((r) => r.kind === 'seal').map((r) => r.item_id)));
    if (!ids.length) return [];
    const { data: items } = await db().from('items').select('id,serial,band,title,photos').in('id', ids).eq('published', true);
    return ((items as Item[]) || []).slice(0, limit).map((i) => ({ cert: certNo(i), band: i.band, title: i.title, photo: i.photos?.[0] || '', versions: rows.filter((r) => r.item_id === i.id).length }));
  } catch {
    return [];
  }
}

// 申請・説明用のデモ記録。保存せず、その場で本物の鍵で署名する（日時を固定しているので毎回同じ署名になる）
export function parseDemo(cert: string): number | null {
  const m = /^GC-DEMO(?:-([1-6]))?$/i.exec(cert.trim());
  return m ? Number(m[1] || 1) : null;
}

export async function demoPassport(n = 1): Promise<PassportBundle | null> {
  if (!issuerConfigured()) return null;
  await ensureIssuer();
  const demoItem = DEMO_ITEMS[Math.min(Math.max(n, 1), DEMO_ITEMS.length) - 1];
  const cert = demoCert(demoItem.n);
  const d = prefill(demoItem);
  d.provenance.dealer_profile = 'Third-generation picker working the Rose Bowl and private estates.';
  d.condition.wear = 'Soft fade on the crown, light wear on the brim edge.';
  d.fingerprint.photos = [{ label: 'Embroidery macro (photo 2)', sha256: demoItem.macroHash }];
  const steps: [GcppEntry['kind'], string, Record<string, unknown>][] = [
    ['event', '2027-01-18T19:20:00.000Z', { type: 'sourced', actor: 'Demo Dealer', place: 'Los Angeles, US', note: `${demoItem.band} ${demoItem.year} tour cap, inherited from the dealer. No price is recorded.` }],
    ['event', '2027-02-02T03:00:00.000Z', { type: 'catalogued', actor: 'Gallery Crypto', place: 'Tokyo, JP', note: 'Photographed and entered into the archive.' }],
    ['event', '2027-02-02T03:30:00.000Z', { type: 'fingerprinted', actor: 'Gallery Crypto', place: 'Tokyo, JP', note: 'Embroidery macro photographed and hashed. NFC tag sewn inside the back.' }],
    ['seal', '2027-02-02T04:00:00.000Z', { schema: DPP_VERSION, version: 1, dpp: cleanDpp(d) }],
  ];
  // デモ用の創業者の鍵（本物の台帳とは別。サーバーの鍵から導くので毎回同じ）
  const priv = demoSeed();
  const founder = bytesToHex(p256.getPublicKey(priv, false));
  const cosign = (hash: string) => p256.sign(sha256(sigMessage(hash)), priv).toCompactHex();
  const g: KeyEntry = { protocol: PROTOCOL, seq: 1, kind: 'genesis', key: founder, label: 'Demo founder key', at: '2027-01-01T00:00:00.000Z', prev: null, signer: founder };
  const gs = serverSign(g);
  const keyring: SignedKey[] = [{ entry: g, ...gs, cosig: cosign(gs.hash) }];
  const entries: SignedEntry[] = [];
  steps.forEach(([kind, at, data], i) => {
    const e: GcppEntry = { protocol: PROTOCOL, cert, seq: i + 1, kind, at, prev: entries[i - 1]?.hash ?? null, signer: founder, data };
    const sv = serverSign(e);
    entries.push({ entry: e, ...sv, cosig: cosign(sv.hash) });
  });
  return { protocol: PROTOCOL, issuer: issuerAddress(), chain: (await getChains()).solana, cert, demo: true, item: { band: demoItem.band, title: demoItem.title, year: demoItem.year, photos: demoItem.photos }, entries, keyring, anchors: [] };
}
