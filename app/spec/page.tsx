import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import { DPP_SECTIONS, EVENT_TYPES } from '@/lib/dpp';
import { getLang } from '@/lib/lang';
import { makeT } from '@/lib/i18n';
import { dl } from '@/lib/dppJa';

export const metadata: Metadata = {
  title: 'GCPP/2 specification — Gallery Crypto',
  description: 'Gallery Crypto Provenance Protocol: one record, two signatures, one chain. Verifiable forever, with or without a blockchain.',
};

// 公開仕様書：シンプルな3つのルールと、誰でも実装できる検証手順
const Code = ({ children }: { children: string }) => <pre className="pl-code">{children}</pre>;

export default function Spec() {
  const lang = getLang();
  const t = makeT(lang);
  const ja = lang === 'ja';
  return (
    <MoShell title={t('One record. Two signatures. One chain.', '1つの記録、2つの署名、1本のつながり。')} kicker={t('Specification · GCPP/2 · Oct 2026', '仕様書 · GCPP/2 · 2026年10月')}>
      <p className="mo-lead">
        {t('GCPP (Gallery Crypto Provenance Protocol) proves where a one-of-a-kind object came from, what it is made of and everything that happened to it — in a form anyone can check, forever, without trusting Gallery Crypto, a marketplace or any single blockchain. It is small enough to fit on an NFC tag.', 'GCPP（Gallery Crypto Provenance Protocol）は、一点ものの実物がどこから来て、何でできていて、何が起きたかを証明します。Gallery Crypto もマーケットプレイスも、特定のブロックチェーンも信用せずに、誰でも、いつまでも確かめられる形で。NFCタグに収まるほど小さな仕組みです。')}
      </p>

      <h2 className="pl-h">{t('The three rules', '3つのルール')}</h2>
      <ol className="pl-layers">
        <li><span className="pl-n">1</span><h3>{t('One record', '1つの記録')}</h3><p>{t('Every fact is one small JSON object. Its fingerprint is SHA-256 of the canonical JSON (keys sorted, no spaces).', '1つの事実は1つの小さなJSONです。その指紋は、正規化したJSON（キーを並べ替え、空白なし）の SHA-256 です。')}</p></li>
        <li><span className="pl-n">2</span><h3>{t('Two signatures', '2つの署名')}</h3><p>{ja ? <>各指紋に、発行者のサーバーの鍵（Ed25519）<b>と</b>、端末の外に出せない創業者の端末の鍵（ECDSA P-256）で署名します。</> : <>Each fingerprint is signed by the issuer&apos;s server key (Ed25519) <b>and</b> a founder&apos;s device key (ECDSA P-256) that cannot leave its device.</>}</p></li>
        <li><span className="pl-n">3</span><h3>{t('One chain', '1本のつながり')}</h3><p>{t("Each record contains the previous record's fingerprint. Nothing can be removed, inserted or changed without breaking the chain.", '各記録は一つ前の記録の指紋を含みます。つながりを壊さずに、削除・差し込み・書き換えはできません。')}</p></li>
      </ol>
      <p className="mo-lead">{t('Everything else — keyring, anchors, offline proof, backups — follows from these three rules.', '鍵の台帳、刻印、オフラインの証明、バックアップ — ほかはすべて、この3つのルールから導かれます。')}</p>

      <h2 className="pl-h">1 · {t('Record', '記録')}</h2>
      <Code>{`{
  "protocol": "GCPP/2",
  "cert":     "GC-0007",            // the object
  "seq":      3,                    // 1, 2, 3 … per object
  "kind":     "seal" | "event",     // seal = full product passport, event = something happened
  "at":       "2027-02-02T04:00:00.000Z",
  "prev":     "<hash of seq 2>" | null,
  "signer":   "<founder device key, P-256, hex>",
  "data":     { … }                 // seal: { schema, version, dpp } · event: { type, actor, place, note, date? }
}
hash  = sha256( canonical(record) )
sig   = Ed25519.sign(  "GCPP/2:" + hash , issuer server key )
cosig = ECDSA_P256_SHA256.sign( "GCPP/2:" + hash , signer )   // 64-byte r||s`}</Code>
      <p>{t('Event types:', '出来事の種類：')} {EVENT_TYPES.map((e) => e.key).join(', ')}. {t('No prices and no personal data are ever written into a record.', '価格や個人情報を記録に書くことはありません。')}</p>

      <h2 className="pl-h">2 · {t('Keyring', '鍵の台帳')}</h2>
      <p>{t('Founder keys live in their own chain of records, signed the same way.', '創業者の鍵は、同じ方法で署名した専用の記録のつながりで管理します。')}</p>
      <Code>{`{ "protocol":"GCPP/2", "seq":n, "kind":"genesis"|"add"|"revoke", "key":"<P-256 hex>",
  "label":"…", "at":"…", "prev":"<hash>"|null, "signer":"<P-256 hex>" }

genesis  must be seq 1 and self-signed (signer == key)
add      must be signed by a key that is active at "at"
revoke   must be signed by an active key; at least one key stays active
active(k, t) = added(k) <= t  and  (not revoked  or  revoked(k) > t)`}</Code>
      <p>{t('A record is valid only if its signer was active at its time. Revoking a key never invalidates what it signed before. Verifiers remember the genesis hash; a different genesis is a warning.', '記録が有効なのは、その時点で署名した鍵が有効だった場合だけです。鍵を取り消しても、それまでに署名したものは無効になりません。検証する側は起点（genesis）のハッシュを覚えていて、違う起点なら警告になります。')}</p>

      <h2 className="pl-h">3 · {t('Verify (any language, ~60 lines)', '検証（どの言語でも約60行）')}</h2>
      <ol className="pl-road">
        <li><b>1</b> {ja ? <>発行者の鍵を <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a>（base58 の Ed25519、Solana のアドレスでもある）か、すでに信用している控えから取得します。</> : <>Get the issuer key from <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a> (base58 Ed25519, also a Solana address) — or from a copy you already trust.</>}</li>
        <li><b>2</b> {t('Verify the keyring in order with the rules above.', '上のルールで、鍵の台帳を順に検証します。')}</li>
        <li><b>3</b> {ja ? <>その実物の各記録を順に：ハッシュを計算し直し、<i>sig</i> を発行者の鍵で、<i>cosig</i> を <i>signer</i> で確かめ、<i>signer</i> が <i>at</i> の時点で有効だったか、<i>prev</i> と <i>seq</i> を確かめます。</> : <>For each record of the object, in order: recompute the hash, check <i>sig</i> with the issuer key, check <i>cosig</i> with <i>signer</i>, check <i>signer</i> was active at <i>at</i>, check <i>prev</i> and <i>seq</i>.</>}</li>
        <li><b>4</b> {t('Optional: for each anchor, recompute the Merkle root of its leaves and find it in the Solana memo of its transaction.', '任意：各刻印について、葉からマークルルートを計算し直し、その取引の Solana メモの中に見つけます。')}</li>
      </ol>
      <p>{t('Bundle for any object:', '実物ごとの一式：')} <a href="/api/passport/GC-DEMO-1">/api/passport/&lt;cert&gt;</a> · {t('keyring:', '鍵の台帳：')} <a href="/api/keyring">/api/keyring</a> · {t('reference code:', '参考実装：')} <span className="pp-mono">lib/gcpp.ts</span>, <span className="pp-mono">packages/gcpp-verify</span>.</p>

      <h2 className="pl-h">4 · {t('Anchor (optional)', '刻印（任意）')}</h2>
      <Code>{`leaves = hashes not yet anchored (records, keyring changes, daily snapshot fingerprint)
level  = sort(leaves); while len > 1: level = [ sha256(a + b) for each pair (last one paired with itself) ]
memo   = "GCPP/2 root:<root> n:<count>"   →  Solana Memo program, signed by the issuer key`}</Code>
      <p>{t('Anchors are written right after every change and once a day. The chain adds an outside timestamp; the proof never depends on it.', '刻印は変更のすぐあとと、毎日1回書き込みます。チェーンは外部の日時の証明を加えるもので、証明そのものはチェーンに頼りません。')}</p>

      <h2 className="pl-h">5 · {t('Offline proof — 174 bytes', 'オフラインの証明 — 174バイト')}</h2>
      <div className="tablewrap">
        <table className="pl-table">
          <thead><tr><th>{t('Bytes', 'バイト')}</th><th>{t('Field', '項目')}</th></tr></thead>
          <tbody>
            <tr><td>4</td><td>{t('object serial (0 = demo)', '実物の通し番号（0 = デモ）')}</td></tr>
            <tr><td>2</td><td>{t('record seq', '記録の順番')}</td></tr>
            <tr><td>4</td><td>{t('time, unix seconds', '日時（Unix秒）')}</td></tr>
            <tr><td>32</td><td>{t('record hash', '記録のハッシュ')}</td></tr>
            <tr><td>64</td><td>{t('issuer signature', '発行者の署名')}</td></tr>
            <tr><td>64</td><td>{t('founder signature', '創業者の署名')}</td></tr>
            <tr><td>4</td><td>{t('signer key id (first 4 bytes of sha256(key hex))', '署名した鍵のID（sha256(鍵の16進数) の先頭4バイト）')}</td></tr>
          </tbody>
        </table>
      </div>
      <p>{ja ? <><span className="pp-mono">/verify#g2.&lt;base64url&gt;</span> の形でQRコードやNFCタグに書き込みます。検証アプリは公開の鍵の台帳を端末に保存するので、電波のないスマホでも<b>本物</b>か<b>確認できず</b>かを答えられます。</> : <>Written as <span className="pp-mono">/verify#g2.&lt;base64url&gt;</span> into a QR code or an NFC tag. The verifier app keeps the public keyring on the device, so a phone with no signal can still say <b>authentic</b> or <b>not verified</b>.</>}</p>

      <h2 className="pl-h">6 · {t('Product passport (seal data)', '製品パスポート（確定のデータ）')}</h2>
      <p>{ja ? <>スキーマ <span className="pp-mono">gc-dpp-textile/0.1</span>。繊維製品のEUデジタル製品パスポートで想定される分類に沿い、来歴と物理的な指紋を加えています：</> : <>Schema <span className="pp-mono">gc-dpp-textile/0.1</span>, aligned with the categories expected in the EU Digital Product Passport for textiles, plus provenance and a physical fingerprint:</>}</p>
      <ul>
        {DPP_SECTIONS.map((s) => (
          <li key={s.key}><b>{dl(lang, s.title)}</b> — {s.fields.map((f) => dl(lang, f.label) + (f.required ? '*' : '')).join(ja ? '、' : ', ')}</li>
        ))}
      </ul>

      <h2 className="pl-h">7 · {t('Security model', 'セキュリティの仕組み')}</h2>
      <div className="tablewrap">
        <table className="pl-table">
          <thead><tr><th>{t('Layer', '層')}</th><th>{t('What it does', '役割')}</th></tr></thead>
          <tbody>
            <tr><td>{t('Sign-in', 'ログイン')}</td><td>{t('Password plus a second step (authenticator code or Face ID). Enforced by the database itself, not just the screen.', 'パスワードに加えて2段階目（認証アプリのコードか Face ID）。画面だけでなく、データベース自体が強制します。')}</td></tr>
            <tr><td>{t('Face ID per signature', '署名ごとの Face ID')}</td><td>{t("Every record and key change needs a fresh biometric check, bound to that record's hash and verified by the server.", '記録や鍵の変更のたびに、その記録のハッシュに結びついた新しい生体認証が必要で、サーバーが確かめます。')}</td></tr>
            <tr><td>{t('Device key', '端末の鍵')}</td><td>{t('Created inside the device as non-extractable. The page itself cannot read it. The device checks what it signs before signing.', '端末の中で取り出せない形で作ります。ページ自身も読めません。端末は署名する前に、署名する内容を確かめます。')}</td></tr>
            <tr><td>{t('Two signatures', '2つの署名')}</td><td>{t('A server breach or a stolen device alone cannot create a valid record.', 'サーバーへの侵入や端末の盗難だけでは、有効な記録は作れません。')}</td></tr>
            <tr><td>{t('Keyring', '鍵の台帳')}</td><td>{t('New devices only with an active key or the offline recovery key file.', '新しい端末は、有効な鍵かオフラインの復旧鍵ファイルがある場合だけ追加できます。')}</td></tr>
            <tr><td>{t('Append-only storage', '追記のみの保存')}</td><td>{t('The database refuses edits and deletes of signed records and key changes.', 'データベースは、署名済みの記録や鍵の変更の書き換え・削除を拒みます。')}</td></tr>
            <tr><td>{t('NFC tap', 'NFCタップ')}</td><td>{t('Each tap is checked on the server: the chip’s AES-CMAC one-time code (NTAG 424 DNA SUN) and a counter that must rise. Keys are per tag.', 'タップのたびにサーバーで確かめます。チップの AES-CMAC の使い捨てコード（NTAG 424 DNA の SUN）と、増えていなければならない回数。鍵はタグごとに異なります。')}</td></tr>
            <tr><td>{t('Anchors', '刻印')}</td><td>{t('Public timestamps on Solana after every change and daily.', '変更のたびと毎日、Solana に公開の日時の証明を残します。')}</td></tr>
            <tr><td>{t('Backups', 'バックアップ')}</td><td>{t("Daily snapshot to private storage; encrypted full backup (AES-256-GCM, PBKDF2 600k) made on the owner's device; verified restore that only adds what is missing.", '毎日、非公開の保管場所にスナップショット。暗号化した完全バックアップ（AES-256-GCM、PBKDF2 60万回）は持ち主の端末で作成。復元は検証したうえで、足りない分だけを追加します。')}</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="pl-h">8 · {t('Backup file', 'バックアップファイル')}</h2>
      <Code>{`{ "format":"gc-backup-enc/1", "created_at":"…",
  "kdf":    { "name":"PBKDF2", "hash":"SHA-256", "iterations":600000, "salt":"<b64>" },
  "cipher": { "name":"AES-GCM", "iv":"<b64>" },      // additional data = "gc-backup-enc/1"
  "data":   "<b64 ciphertext>",
  "sha256": "<fingerprint of the plaintext>" }
plaintext = { "format":"gc-backup/1", "issuer":"…", "tables": { …every table… } }`}</Code>
      <p>{t('Keep three copies in two places: a USB stick, a second cloud, and the passphrase on paper next to the recovery key — never in the same place as the file.', '3つの控えを2か所に：USBメモリ、別のクラウド、そしてパスフレーズは紙に書いて復旧鍵のそばに。ファイルと同じ場所には置かないでください。')}</p>

      <h2 className="pl-h">9 · {t('Next — GCPP/3', '次 — GCPP/3')}</h2>
      <ol className="pl-road">
        <li><b>{t('Chip', 'チップ')}</b> {t("Taps are already checked on the server (/tap). GCPP/3 adds the chip's one-time code to the proof itself, so the tap can be re-checked by anyone later.", 'タップは今もサーバーで確かめています（/tap）。GCPP/3 では、チップの使い捨てコードを証明そのものに加え、あとから誰でもタップを確かめ直せるようにします。')}</li>
        <li><b>{t('Dealers', 'ディーラー')}</b> {t('Dealers and artists hold their own keys and co-sign their own events (“sourced”, “processed”) — provenance signed by the people who made it.', 'ディーラーやアーティストが自分の鍵を持ち、自分の出来事（「入手」「加工」）に連名で署名します。来歴を、それをつくった人たち自身が署名します。')}</li>
        <li><b>{t('Owners', '所有者')}</b> {t('Owners re-scan and add wear with their own key; the record grows with the object.', '所有者が再スキャンし、自分の鍵で着用感を追加します。記録は実物とともに育ちます。')}</li>
        <li><b>{t('Post-quantum', '耐量子')}</b> {t('A third signature (ML-DSA) can be added without changing rules 1–3.', 'ルール1〜3を変えずに、3つ目の署名（ML-DSA）を加えられます。')}</li>
      </ol>
      <p className="mo-fine">{t('This specification is published so that anyone can verify, mirror or re-implement it. © Gallery Crypto, Tokyo.', 'この仕様書は、誰でも検証・複製・再実装できるように公開しています。© Gallery Crypto（東京）')}</p>
    </MoShell>
  );
}
