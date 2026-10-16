export type Settings = {
  headline: string;
  lead: string;
  launch: string;
  instagram: string;
  email: string;
};

export type Item = {
  id: string;
  serial: number;
  photos: string[];
  band: string;
  title: string;
  year: string;
  era: string;
  size: string;
  tag: string;
  stitch: boolean;
  made_in: string;
  cond: string;
  prov: string;
  dealer: string;
  published: boolean;
  created_at: string;
  rank?: string;
};

export const PUBLIC_ITEM_COLUMNS =
  'id,serial,photos,band,title,year,era,size,tag,stitch,made_in,cond,prov,dealer,published,created_at';

export const DEFAULT_SETTINGS: Settings = {
  headline: "Founder's Archive",
  lead:
    "A personal archive of American band tees from the '80s to the 2000s, collected over the years by the founder of Gallery Crypto. Every piece is recorded with its provenance, and the whole collection goes on sale together in 2027.",
  launch: 'On sale in 2027 · Lottery release',
  instagram: '',
  email: '',
};

export const ERA_LABEL: Record<string, string> = { '80s': '80s', '90s': '90s', '00s': '2000s', other: 'Other' };

export function eraOf(year: string): string {
  const y = parseInt(year, 10);
  if (!y) return '';
  if (y >= 1980 && y < 1990) return '80s';
  if (y >= 1990 && y < 2000) return '90s';
  if (y >= 2000 && y < 2010) return '00s';
  return 'other';
}

export function certNo(it: Pick<Item, 'serial'>): string {
  return 'GC-' + String(it.serial).padStart(4, '0');
}

export function metaLine(it: Item): string {
  const p: string[] = [];
  if (it.year) p.push(it.year);
  if (it.size) p.push(String(it.size).toUpperCase());
  if (it.made_in) p.push(it.made_in);
  if (it.stitch) p.push('Single stitch');
  return p.join(' · ');
}
