// EU デジタル製品パスポート（ESPR・繊維製品）で求められる見込みの項目に沿った記録の型。
// 繊維向けの細則は 2027 年採択の見込みで未確定のため、準備調査（2025）で示された6分類に合わせ、
// 一点物のヴィンテージに必要な「来歴」「指紋」を加えている。
import type { Item } from './types';

export type FieldType = 'text' | 'textarea' | 'number' | 'composition' | 'hashes';
export type Field = { key: string; label: string; type: FieldType; required?: boolean; hint?: string };
export type Section = { key: string; title: string; espr: string; fields: Field[] };

export const DPP_VERSION = 'gc-dpp-textile/0.1';

export const DPP_SECTIONS: Section[] = [
  {
    key: 'product', title: 'Product identity', espr: 'Unique identifier · product type',
    fields: [
      { key: 'name', label: 'Product name', type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'text', required: true, hint: 'T-shirt, long sleeve, hoodie…' },
      { key: 'original_label', label: 'Original label / maker', type: 'text', hint: 'e.g. Brockum, Giant, Hanes' },
      { key: 'year', label: 'Year of manufacture', type: 'text', required: true },
      { key: 'size', label: 'Size', type: 'text' },
      { key: 'issuer', label: 'Responsible party', type: 'text', required: true },
    ],
  },
  {
    key: 'materials', title: 'Material composition', espr: 'Fibre content · recycled & reused share',
    fields: [
      { key: 'composition', label: 'Fibres (%)', type: 'composition', required: true },
      { key: 'reused_pct', label: 'Reused share (%)', type: 'number', required: true, hint: 'A vintage garment kept in use is 100% reused.' },
      { key: 'recycled_pct', label: 'Recycled fibre (%)', type: 'number' },
      { key: 'certifications', label: 'Certifications', type: 'text' },
    ],
  },
  {
    key: 'origin', title: 'Origin & processes', espr: 'Key processes · country of each stage',
    fields: [
      { key: 'manufacture_country', label: 'Country of manufacture', type: 'text', required: true },
      { key: 'construction', label: 'Construction', type: 'text', hint: 'Single stitch, double stitch…' },
      { key: 'decoration', label: 'Print / decoration process', type: 'text', required: true, hint: 'Screen print, discharge, plastisol…' },
      { key: 'remake', label: 'Remake processes (Gallery Crypto)', type: 'textarea', hint: 'Leave empty if the piece is kept as found.' },
      { key: 'remake_country', label: 'Country of remake', type: 'text' },
    ],
  },
  {
    key: 'provenance', title: 'Provenance', espr: 'Supply-chain traceability (tier 1–2)',
    fields: [
      { key: 'dealer', label: 'Inherited from (dealer credit)', type: 'text', required: true },
      { key: 'dealer_profile', label: 'Dealer profile', type: 'textarea', hint: 'Shop, city, character — no prices.' },
      { key: 'sourced_country', label: 'Country sourced', type: 'text', required: true },
      { key: 'story', label: 'Story', type: 'textarea' },
    ],
  },
  {
    key: 'condition', title: 'Durability, care & repair', espr: 'Durability · care · repairability',
    fields: [
      { key: 'grade', label: 'Condition', type: 'text', required: true },
      { key: 'wear', label: 'Wear & marks (part of the piece)', type: 'textarea' },
      { key: 'care', label: 'Care instructions', type: 'textarea', required: true },
      { key: 'repairs', label: 'Repair history', type: 'textarea' },
    ],
  },
  {
    key: 'environment', title: 'Environment & substances', espr: 'Environmental indicators · substances of concern',
    fields: [
      { key: 'circularity', label: 'Circularity', type: 'textarea', required: true },
      { key: 'substances', label: 'Substances / treatments', type: 'textarea', required: true },
    ],
  },
  {
    key: 'end_of_life', title: 'End of life', espr: 'Resale · take-back · recycling',
    fields: [
      { key: 'resale', label: 'Resale', type: 'textarea', required: true },
      { key: 'recycling', label: 'Recycling route', type: 'text' },
    ],
  },
  {
    key: 'fingerprint', title: 'Physical fingerprint', espr: 'Gallery Crypto extension — 1:1 link to the object',
    fields: [
      { key: 'chip', label: 'NFC chip UID', type: 'text', hint: 'NTAG 424 DNA UID once the tag is sewn in.' },
      { key: 'photos', label: 'Macro photo hashes (SHA-256)', type: 'hashes', required: true, hint: 'Only the hash is recorded — the photo itself stays private or public, your choice.' },
    ],
  },
];

export type Composition = { fiber: string; pct: number }[];
export type PhotoHash = { label: string; sha256: string };
export type Dpp = Record<string, Record<string, string | number | Composition | PhotoHash[]>>;

// 作品の種類ごとの既定（デモのキャップなどは item に category・composition などを持つ）
type Extra = { category?: string; composition?: Composition; construction?: string; decoration?: string };
export function prefill(it: Item & Extra): Dpp {
  const cap = (it.category || '').toLowerCase() === 'cap';
  return {
    product: { name: [it.band, it.title].filter(Boolean).join(' — '), category: it.category || 'T-shirt', original_label: it.tag || '', year: it.year || '', size: (it.size || '').toUpperCase(), issuer: 'Gallery Crypto, Tokyo, Japan' },
    materials: { composition: it.composition || [{ fiber: 'Cotton', pct: 100 }], reused_pct: 100, recycled_pct: 0, certifications: '' },
    origin: { manufacture_country: it.made_in || '', construction: it.construction || (it.stitch ? 'Single stitch' : ''), decoration: it.decoration || 'Screen print', remake: '', remake_country: '' },
    provenance: { dealer: it.dealer || '', dealer_profile: '', sourced_country: 'United States', story: it.prov || '' },
    condition: { grade: it.cond || '', wear: '', care: cap ? 'Spot clean only. Keep the shape — do not machine wash or tumble dry.' : 'Wash cold, inside out. Hang dry. Do not iron the print.', repairs: '' },
    environment: { circularity: 'Reused garment kept in circulation — no new fibre produced for this piece.', substances: 'No new chemical treatment applied by Gallery Crypto.' },
    end_of_life: { resale: 'Resale keeps this passport: the record transfers with the piece.', recycling: cap ? 'Separate the strap and textile recycling' : 'Cotton textile recycling' },
    fingerprint: { chip: '', photos: [] },
  };
}

// 下書きと既定値を合わせる（下書きにある値を優先）
export function mergeDpp(base: Dpp, draft: Partial<Dpp> | null | undefined): Dpp {
  const out: Dpp = {};
  for (const s of DPP_SECTIONS) out[s.key] = { ...(base[s.key] || {}), ...((draft && draft[s.key]) || {}) };
  return out;
}

function filled(v: unknown, t: FieldType): boolean {
  if (t === 'composition') return Array.isArray(v) && v.length > 0 && Math.round((v as Composition).reduce((a, b) => a + (Number(b.pct) || 0), 0)) === 100;
  if (t === 'hashes') return Array.isArray(v) && v.length > 0;
  if (t === 'number') return v !== '' && v != null && !Number.isNaN(Number(v));
  return typeof v === 'string' ? v.trim().length > 0 : v != null;
}

export function completeness(d: Dpp): { done: number; total: number; missing: string[] } {
  const missing: string[] = [];
  let total = 0;
  for (const s of DPP_SECTIONS)
    for (const f of s.fields)
      if (f.required) {
        total++;
        if (!filled(d[s.key]?.[f.key], f.type)) missing.push(`${s.title}: ${f.label}${f.type === 'composition' ? ' (must add up to 100%)' : ''}`);
      }
  return { done: total - missing.length, total, missing };
}

// 署名する前に余計なものを落とし、型をそろえる
export function cleanDpp(d: Dpp): Dpp {
  const out: Dpp = {};
  for (const s of DPP_SECTIONS) {
    out[s.key] = {};
    for (const f of s.fields) {
      const v = d[s.key]?.[f.key];
      if (f.type === 'composition') out[s.key][f.key] = ((v as Composition) || []).filter((c) => c.fiber).map((c) => ({ fiber: String(c.fiber).trim(), pct: Number(c.pct) || 0 }));
      else if (f.type === 'hashes') out[s.key][f.key] = ((v as PhotoHash[]) || []).filter((h) => /^[0-9a-f]{64}$/.test(h.sha256)).map((h) => ({ label: String(h.label || '').trim(), sha256: h.sha256 }));
      else if (f.type === 'number') out[s.key][f.key] = Number(v) || 0;
      else out[s.key][f.key] = String(v ?? '').trim();
    }
  }
  return out;
}

export const EVENT_TYPES: { key: string; label: string; hint: string }[] = [
  { key: 'sourced', label: 'Sourced', hint: 'Inherited from a dealer — who, where.' },
  { key: 'catalogued', label: 'Catalogued', hint: 'Photographed and entered into the archive.' },
  { key: 'processed', label: 'Processed by artist', hint: 'Artist ID and what they did.' },
  { key: 'fingerprinted', label: 'Fingerprinted', hint: 'Macro photos hashed, chip sewn in.' },
  { key: 'exhibited', label: 'Exhibited', hint: 'Shown at an event or pop-up.' },
  { key: 'transferred', label: 'Ownership transferred', hint: 'Sold or claimed — no personal data is recorded.' },
  { key: 'rescanned', label: 'Re-scanned', hint: 'Owner update: condition, new wear.' },
  { key: 'repaired', label: 'Repaired', hint: 'What was repaired and by whom.' },
  { key: 'note', label: 'Note', hint: 'Anything else worth keeping.' },
];
export const eventLabel = (k: string) => EVENT_TYPES.find((e) => e.key === k)?.label || k;
