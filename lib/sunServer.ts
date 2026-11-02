// サーバー専用：NFC タグのタップを確かめる（鍵の用意・タグと商品の結びつけ・回数の記録）
import 'server-only';
import { createHash } from 'node:crypto';
import { db } from './server';
import { ensureIssuer, issuerConfigured, issuerSeedForChains, serverMac } from './passportServer';
import { decryptPicc, isHexLen, keyFromHex, macMatches } from './sun';

export type TapStatus = 'authentic' | 'replayed' | 'unlinked' | 'invalid' | 'unconfigured' | 'error';
export type TapResult = { status: TapStatus; uid?: string; counter?: number; cert?: string; token?: string };

// 鍵：環境変数で渡されていればそれを使う（工場で鍵を書き込んでもらう場合など）。
// なければ発行者の秘密から導く（サーバーの外に保存しない。タグに書き込むときは管理画面から確認する）
const seedHex = () => Buffer.from(issuerSeedForChains()).toString('hex');
const derive = (label: string) => createHash('sha256').update(`GCPP SUN|${label}|${seedHex()}`).digest().subarray(0, 16);

export function sunMetaKey(): Buffer {
  return process.env.GC_SUN_META_KEY ? keyFromHex(process.env.GC_SUN_META_KEY) : derive('meta');
}
// タグごとに違う鍵（1枚の鍵が漏れても他のタグは守られる）
export function sunFileKey(uid: string): Buffer {
  return process.env.GC_SUN_FILE_KEY ? keyFromHex(process.env.GC_SUN_FILE_KEY) : derive(`file|${uid.toUpperCase()}`);
}

const normUid = (s: string) => s.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

// 確定した記録（seal）の fingerprint.chip から、そのタグの商品番号を探す
export async function certForUid(uid: string): Promise<string> {
  const { data, error } = await db()
    .from('passport_log')
    .select('cert, chip:entry->data->dpp->fingerprint->>chip')
    .eq('kind', 'seal')
    .not('entry->data->dpp->fingerprint->>chip', 'is', null)
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  const hit = (data as { cert: string; chip: string | null }[]).find((r) => r.chip && normUid(r.chip) === uid);
  return hit?.cert || '';
}

// パスポートに「いまタップで確かめた」と出すための短時間の印（ページを開き直しても使える。10分有効）
export function tapToken(cert: string, counter: number, at = Date.now()): string {
  return `${counter}.${at}.${serverMac(`sun-tap|${cert}|${counter}|${at}`).slice(0, 32)}`;
}
export function readTapToken(cert: string, token: string | undefined): { counter: number; at: number } | null {
  const m = /^(\d+)\.(\d+)\.([0-9a-f]{32})$/.exec(token || '');
  if (!m) return null;
  const counter = Number(m[1]);
  const at = Number(m[2]);
  if (Date.now() - at > 10 * 60_000 || at > Date.now() + 60_000) return null;
  return tapToken(cert, counter, at) === token ? { counter, at } : null;
}

export async function verifyTap(e: unknown, c: unknown): Promise<TapResult> {
  if (!isHexLen(e, 32) || !isHexLen(c, 16)) return { status: 'invalid' };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !issuerConfigured()) return { status: 'unconfigured' };
  try {
    await ensureIssuer();
    const picc = decryptPicc(sunMetaKey(), e);
    if (!picc || !macMatches(sunFileKey(picc.uid), picc, c)) return { status: 'invalid' };
    const cert = await certForUid(picc.uid);
    const { data, error } = await db().rpc('gc_sun_accept', { p_uid: picc.uid, p_ctr: picc.counter, p_cert: cert });
    if (error) throw new Error(error.message);
    if (!data) return { status: 'replayed', uid: picc.uid, counter: picc.counter, cert };
    if (!cert) return { status: 'unlinked', uid: picc.uid, counter: picc.counter };
    return { status: 'authentic', uid: picc.uid, counter: picc.counter, cert, token: tapToken(cert, picc.counter) };
  } catch (err) {
    console.error('sun verify', (err as Error).message);
    return { status: 'error' };
  }
}
