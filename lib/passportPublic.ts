import 'server-only';
import { db } from './server';
import { issuerAddress, issuerConfigured, loadLog, signEntry, CHAIN } from './passportServer';
import { PROTOCOL, type Anchor, type GcppEntry, type SignedEntry } from './gcpp';
import { DPP_VERSION, cleanDpp, prefill } from './dpp';
import { PUBLIC_ITEM_COLUMNS, certNo, type Item } from './types';

export type PassportBundle = {
  protocol: string;
  issuer: string;
  chain: string;
  cert: string;
  demo?: boolean;
  item: Pick<Item, 'band' | 'title' | 'year' | 'photos'> | null;
  entries: SignedEntry[];
  anchors: Anchor[];
};

export function parseCert(cert: string): number | null {
  const m = /^GC-(\d{1,8})$/i.exec(cert.trim());
  return m ? parseInt(m[1], 10) : null;
}

export async function getPassport(cert: string): Promise<PassportBundle | null> {
  const serial = parseCert(cert);
  if (!serial || !process.env.NEXT_PUBLIC_SUPABASE_URL || !issuerConfigured()) return null;
  const { data: it } = await db().from('items').select(PUBLIC_ITEM_COLUMNS).eq('serial', serial).eq('published', true).maybeSingle();
  if (!it) return null;
  const item = it as unknown as Item;
  let entries: SignedEntry[] = [];
  try {
    entries = await loadLog(item.id);
  } catch {
    return null;
  }
  if (!entries.length) return null;
  const ids = Array.from(new Set(entries.map((e) => e.anchor_id).filter(Boolean))) as number[];
  const { data: anchors } = ids.length ? await db().from('passport_anchors').select('*').in('id', ids) : { data: [] };
  return { protocol: PROTOCOL, issuer: issuerAddress(), chain: CHAIN, cert: certNo(item), item: { band: item.band, title: item.title, year: item.year, photos: item.photos }, entries, anchors: (anchors as Anchor[]) || [] };
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
export function demoPassport(): PassportBundle | null {
  if (!issuerConfigured()) return null;
  const demoItem = { band: 'Demo Band', title: 'World Tour', year: '1991', size: 'L', tag: 'Brockum', stitch: true, made_in: 'USA', cond: 'Excellent — light fade', dealer: 'Demo Dealer, Los Angeles', prov: 'Picked from a private collection in Pasadena.' } as Item;
  const d = prefill(demoItem);
  d.provenance.dealer_profile = 'Third-generation picker working the Rose Bowl and private estates.';
  d.condition.wear = 'Soft fade at the collar, small paint fleck on the left hem.';
  d.fingerprint.photos = [
    { label: 'Collar macro', sha256: 'a3f1c2e9b7d64e0f9a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef' },
    { label: 'Print crack macro', sha256: '5be0d0f8a2c94d7e8b1f3a6c9e2d5b8a7c4f1e0d3b6a9c2e5f8b1d4a7c0e3f69' },
  ];
  const steps: [GcppEntry['kind'], string, Record<string, unknown>][] = [
    ['event', '2027-01-18T19:20:00.000Z', { type: 'sourced', actor: 'Demo Dealer', place: 'Los Angeles, US', note: 'Inherited from the dealer. No price is recorded.' }],
    ['event', '2027-02-02T03:00:00.000Z', { type: 'catalogued', actor: 'Gallery Crypto', place: 'Tokyo, JP', note: 'Photographed and entered into the archive.' }],
    ['event', '2027-02-02T03:30:00.000Z', { type: 'fingerprinted', actor: 'Gallery Crypto', place: 'Tokyo, JP', note: 'Two macro areas hashed. NFC tag sewn into the collar.' }],
    ['seal', '2027-02-02T04:00:00.000Z', { schema: DPP_VERSION, version: 1, dpp: cleanDpp(d) }],
  ];
  const entries: SignedEntry[] = [];
  steps.forEach(([kind, at, data], i) => {
    const e: GcppEntry = { protocol: PROTOCOL, cert: 'GC-DEMO', seq: i + 1, kind, at, prev: entries[i - 1]?.hash ?? null, data };
    entries.push(signEntry(e));
  });
  return { protocol: PROTOCOL, issuer: issuerAddress(), chain: CHAIN, cert: 'GC-DEMO', demo: true, item: { band: 'Demo Band', title: 'World Tour', year: '1991', photos: [] }, entries, anchors: [] };
}
