// サーバー専用：署名のたびの顔認証（パスキー / WebAuthn）。登録と照合。
import 'server-only';
import {
  generateRegistrationOptions, verifyRegistrationResponse, verifyAuthenticationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON, type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { db } from './server';
import { serverMac, loadKeyring, issuerAddress, ensureIssuer } from './passportServer';
import { hexToBytes, sha256hex, verifyCosig, verifyKeyring, keyActive } from './gcpp';

type Row = { id: number; credential_id: string; public_key: string; counter: number; transports: string[]; label: string; created_at: string; last_used_at: string | null };

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const unb64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

export function rpOf(req: Request) {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host).split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim();
  return { rpID: host.replace(/:\d+$/, ''), origin: `${proto}://${host}` };
}

export async function listPasskeys(): Promise<Row[]> {
  const { data, error } = await db().from('passport_passkeys').select('*').order('id');
  if (error) throw error;
  return (data as Row[]) || [];
}

// 登録を許す条件：最初の1つ（鍵の台帳もまだ空）か、有効な創業者の鍵（端末または復旧鍵）の署名があること
export const passkeyAuthHash = (credentialId: string) => sha256hex(`passkey|${credentialId}`);

export async function registrationOptions(req: Request, email: string) {
  await ensureIssuer();
  const { rpID } = rpOf(req);
  const existing = await listPasskeys();
  const challenge = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const exp = Date.now() + 5 * 60_000;
  const options = await generateRegistrationOptions({
    rpName: 'Gallery Crypto Admin',
    rpID,
    userName: email,
    userDisplayName: email,
    challenge: unb64u(challenge),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required', authenticatorAttachment: 'platform' },
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports as AuthenticatorTransportFuture[] })),
  });
  return { options, challenge, exp, token: serverMac(`reg|${challenge}|${exp}`) };
}

export async function registerPasskey(req: Request, b: { response: RegistrationResponseJSON; challenge: string; exp: number; token: string; label?: string; authKey?: string; authSig?: string }) {
  await ensureIssuer();
  if (!b.challenge || serverMac(`reg|${b.challenge}|${b.exp}`) !== b.token || Date.now() > Number(b.exp)) throw new Error('This request expired — try again');
  const existing = await listPasskeys();
  const list = await loadKeyring();
  if (existing.length || list.length) {
    const ring = verifyKeyring(list, issuerAddress());
    if (!ring.ok || !b.authKey || !b.authSig || !keyActive(ring.keys, b.authKey, new Date().toISOString()) || !verifyCosig(passkeyAuthHash(b.response.id), b.authSig, b.authKey))
      throw new Error('A new Face ID must be approved by an active founder key (this device or the recovery key file)');
  }
  const { rpID, origin } = rpOf(req);
  const v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: b.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  if (!v.verified || !v.registrationInfo) throw new Error('Face ID registration could not be verified');
  const c = v.registrationInfo.credential;
  const { error } = await db().from('passport_passkeys').insert({
    credential_id: c.id, public_key: b64u(c.publicKey), counter: c.counter, transports: c.transports || [], label: String(b.label || 'Face ID').slice(0, 60),
  });
  if (error) throw new Error(error.code === '23505' ? 'This Face ID is already registered' : error.message);
}

// 記録のハッシュそのものを「顔認証の問いかけ」にする → その記録のためだけの顔認証になる
export async function assertionOptions(req: Request, hash: string) {
  const list = await listPasskeys();
  if (!list.length) return null;
  return {
    challenge: b64u(hexToBytes(hash)),
    rpId: rpOf(req).rpID,
    allowCredentials: list.map((c) => ({ id: c.credential_id, type: 'public-key' as const, transports: c.transports as AuthenticatorTransportFuture[] })),
    userVerification: 'required' as const,
    timeout: 60_000,
  };
}

export async function requireFace(req: Request, hash: string, response: AuthenticationResponseJSON | undefined) {
  const list = await listPasskeys();
  if (!list.length) throw new Error('passkey-required');
  if (!response?.id) throw new Error('Face ID is required to sign');
  const row = list.find((c) => c.credential_id === response.id);
  if (!row) throw new Error('This Face ID is not registered');
  const { rpID, origin } = rpOf(req);
  const v = await verifyAuthenticationResponse({
    response, expectedChallenge: b64u(hexToBytes(hash)), expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
    credential: { id: row.credential_id, publicKey: unb64u(row.public_key), counter: Number(row.counter), transports: row.transports as AuthenticatorTransportFuture[] },
  });
  if (!v.verified || !v.authenticationInfo.userVerified) throw new Error('Face ID did not match');
  await db().from('passport_passkeys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', row.id);
}
