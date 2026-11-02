import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import NfcDiagram from '@/components/NfcDiagram';
import NfcSystem3DLazy from '@/components/NfcSystem3DLazy';
import SolanaTree3DLazy from '@/components/SolanaTree3DLazy';
import CapViewerLazy from '@/components/CapViewerLazy';
import { DEMO_ITEMS, demoCert } from '@/lib/demoData';
import GcIcon, { IconRow, SvgIcon } from '@/components/GcIcon';
import { getLang } from '@/lib/lang';
import { makeT, type T } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'How the NFC tag and Solana work — Gallery Crypto',
  description: 'What is inside the NFC tag, what one tap does, what goes on Solana and what never does, and how to check every piece yourself.',
};

// 記録をまとめて1つの指紋（ルート）にし、Solana に書く流れの図
function TreeFigure({ t }: { t: T }) {
  const INK = '#111111', MUTE = '#6B6862', LINE = '#B9B4AB', CU = '#C47A45';
  const SANS = 'Archivo, "Noto Sans JP", sans-serif', MONO = '"JetBrains Mono", monospace';
  const leaves = [t('Sourced', '入手'), t('Catalogued', '登録'), t('Fingerprinted', '指紋の記録'), t('Sealed', '確定')];
  return (
    <svg className="sol-fig" viewBox="0 0 760 330" role="img" aria-label={t('Four records each get a fingerprint. Pairs are combined until one root fingerprint is left. Only that root is written to Solana.', '4つの記録それぞれに指紋を作り、2つずつ組み合わせて最後に1つのルートの指紋にします。Solana に書くのはそのルートだけです。')}>
      {leaves.map((l, i) => {
        const x = 20 + i * 185;
        return (
          <g key={l}>
            <rect x={x} y={232} width={165} height={78} fill="#fff" stroke={INK} />
            <SvgIcon name="fingerprint" x={x + 12} y={244} size={34} />
            <text x={x + 56} y={258} fontFamily={SANS} fontSize="13" fill={INK}>{t('Record', '記録')} {i + 1}</text>
            <text x={x + 56} y={276} fontFamily={SANS} fontSize="11.5" fill={MUTE}>{l}</text>
            <text x={x + 12} y={300} fontFamily={MONO} fontSize="10" fill={MUTE}>{['a1f4…', '9c02…', '47de…', 'e8b3…'][i]}</text>
            <line x1={x + 82} y1={232} x2={i < 2 ? 195 : 565} y2={170} stroke={LINE} />
          </g>
        );
      })}
      {[195, 565].map((x, i) => (
        <g key={x}>
          <rect x={x - 70} y={130} width={140} height={40} fill="#fff" stroke={INK} />
          <text x={x} y={155} textAnchor="middle" fontFamily={MONO} fontSize="11" fill={INK}>{i ? t('combine 3 + 4', '3 と 4 を組み合わせ') : t('combine 1 + 2', '1 と 2 を組み合わせ')}</text>
          <line x1={x} y1={130} x2={380} y2={82} stroke={LINE} />
        </g>
      ))}
      <rect x={250} y={30} width={260} height={52} fill={INK} />
      <text x={380} y={52} textAnchor="middle" fontFamily={SANS} fontSize="12" letterSpacing="2" fill="#FAFAF8">{t('ONE ROOT FINGERPRINT', '1つのルートの指紋')}</text>
      <text x={380} y={71} textAnchor="middle" fontFamily={MONO} fontSize="11" fill="#D9D4CA">5f2e9a…c41b · 32 bytes</text>
      <path d="M510 56 H600" stroke={CU} strokeWidth="1.5" markerEnd="url(#solA)" />
      <defs><marker id="solA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill={CU} /></marker></defs>
      <SvgIcon name="ledger" x={612} y={26} size={52} tone="copper" />
      <text x={612} y={98} fontFamily={SANS} fontSize="12.5" fill={INK}>Solana</text>
      <text x={612} y={115} fontFamily={SANS} fontSize="11.5" fill={MUTE}>{t('memo, signed by our', 'メモ。発行者の')}</text>
      <text x={612} y={130} fontFamily={SANS} fontSize="11.5" fill={MUTE}>{t('issuer address', 'アドレスが署名')}</text>
    </svg>
  );
}

const faq = (t: T): [string, string][] => [
  [t('Can someone copy the tag?', 'タグはコピーできますか？'), t('They can copy the link it showed last time, but not the chip’s secret key. Every tap makes a new one-time code with a counter that only goes up, so an old code replayed by a copy is rejected. The site checks the code and the counter on every tap, then opens the passport marked “Chip verified just now”.', '前回表示したリンクはコピーできても、チップの秘密鍵はコピーできません。タップのたびに、増えるだけの回数と新しい使い捨てコードが出るので、コピーが古いコードを繰り返しても断られます。サイトはタップのたびにコードと回数を確かめ、「いまタップでチップを確認しました」と表示してパスポートを開きます。')],
  [t('Can the tag be moved to another cap?', 'タグを別のキャップに付け替えられますか？'), t('The antenna is printed so that peeling the label off tears it, and the tag stops answering. The record also holds macro photos of this cap’s own thread and wear — a different cap does not match them.', 'アンテナはラベルを剥がすと切れるように作られていて、タグは応答しなくなります。記録にはこのキャップ自身の糸や着用感の接写写真も入っているので、別のキャップとは一致しません。')],
  [t('Does the tag track me?', 'タグで追跡されますか？'), t('No. The tag holds a link and nothing else, and a tap opens a normal web page. The record never stores who tapped, when, or where.', 'いいえ。タグに入っているのはリンクだけで、タップすると普通のウェブページが開きます。誰が、いつ、どこでタップしたかは記録に残りません。')],
  [t('Does it need charging or an app?', '充電やアプリは必要ですか？'), t('No battery, no app. The phone’s own NFC field powers the chip for the moment it is read.', '電池もアプリも不要です。読み取る瞬間だけ、スマホのNFCの電波がチップを動かします。')],
  [t('What if Gallery Crypto or this website closes?', 'Gallery Crypto やこのサイトがなくなったら？'), t('Download the proof file from any passport. It checks with the public keys alone, and the Solana timestamps stay public. Nothing depends on us staying online.', 'どのパスポートからも証明ファイルをダウンロードできます。公開鍵だけで確かめられ、Solana の日時の証明も公開されたまま残ります。私たちが存続していなくても困ることはありません。')],
  [t('Can I wash the cap?', 'キャップは洗えますか？'), t('Spot clean, as with any vintage cap. The tag is sealed against sweat and light moisture; avoid machine washing and tumble drying.', 'ほかのヴィンテージキャップと同じく、部分洗いにしてください。タグは汗や軽い湿気には耐えるよう密封していますが、洗濯機と乾燥機は避けてください。')],
];

export default function NfcPage() {
  const lang = getLang();
  const t = makeT(lang);
  const FAQ = faq(t);
  return (
    <MoShell title={t('One tap, one proof', 'ワンタップで、ひとつの証明')} kicker={t('Demo · NFC tag and Solana', 'デモ · NFCタグと Solana')}>
      <p className="mo-lead">{t('Every piece carries a small NFC tag sewn inside it — on a cap, inside the back. Tap it with any phone and the piece proves itself: two signatures, an unbroken chain of records, and a public timestamp on Solana. No app, no account, and it still works with no signal.', 'すべての作品の内側に、小さなNFCタグを縫い込んでいます（キャップなら後ろの内側）。どのスマホでもタップすれば、作品が自分で証明します。2つの署名、途切れない記録のつながり、Solana の公開の日時の証明。アプリもアカウントも不要で、電波がなくても使えます。')}</p>

      <nav className="sol-toc" aria-label={t('On this page', 'このページの内容')}>
        <a href="#glance"><GcIcon name="tree" size={36} />{t('The system at a glance', '仕組みのひと目でわかる図')}</a>
        <a href="#tag"><GcIcon name="chip" size={36} tone="copper" />{t('Inside the tag', 'タグの中')}</a>
        <a href="#tap"><GcIcon name="tap" size={36} />{t('What one tap does', '1回のタップで起きること')}</a>
        <a href="#solana"><GcIcon name="ledger" size={36} />{t('Solana, in plain words', 'Solana をやさしく')}</a>
        <a href="#check"><GcIcon name="search" size={36} />{t('Check it yourself', 'ご自身で確かめる')}</a>
        <a href="#faq"><GcIcon name="eye" size={36} />{t('Questions', 'よくある質問')}</a>
      </nav>

      <h2 className="pl-h" id="glance">{t('The system at a glance', '仕組みのひと目でわかる図')}</h2>
      <NfcDiagram lang={lang} />

      <h2 className="pl-h" id="tag">{t('Inside the tag', 'タグの中')}</h2>
      <p className="mo-lead">{t('A woven label about the size of a stamp, cut from the cap’s own fabric. Inside it sits an NFC inlay — a coil of copper and a chip thinner than paper.', '切手ほどの大きさの織りラベルで、キャップと同じ生地から切り出しています。中には、銅のコイルと紙より薄いチップでできたNFCインレイが入っています。')}</p>
      <div className="pp-3d">
        <CapViewerLazy compact pieces={[{ n: 1, band: DEMO_ITEMS[0].band, title: DEMO_ITEMS[0].title, year: DEMO_ITEMS[0].year, cert: demoCert(1), cap: DEMO_ITEMS[0].cap, qr: '' }]} />
      </div>
      <div className="sol-grid">
        <IconRow name="chip" tone="copper" title={t('NTAG 424 DNA chip', 'NTAG 424 DNA チップ')}>{t('An NFC chip made for proving authenticity. It holds a secret AES-128 key that can be used but never read out — not even by us.', '本物の証明のために作られたNFCチップです。AES-128 の秘密鍵を持ち、使うことはできても読み出すことは決してできません。私たちにもできません。')}</IconRow>
        <IconRow name="antenna" title={t('Copper antenna, no battery', '銅のアンテナ・電池なし')}>{t('The coil catches the phone’s field (13.56 MHz) and powers the chip for the instant it is read. Nothing to charge, nothing to wear out.', 'コイルがスマホの電波（13.56 MHz）を受け、読み取る瞬間だけチップを動かします。充電も消耗もありません。')}</IconRow>
        <IconRow name="lock" title={t('A code that is never the same', '毎回ちがうコード')}>{t('Each tap, the chip counts up by one and signs the count with its key. The phone receives a link carrying that one-time code.', 'タップのたびにチップは回数を1つ増やし、その回数を鍵で署名します。スマホはその使い捨てコードの入ったリンクを受け取ります。')}</IconRow>
        <IconRow name="copy" title={t('Copies fail', 'コピーは通らない')}>{t('A copied tag can only repeat an old code. The counter has already moved on, so the check rejects it.', 'コピーしたタグは古いコードを繰り返すことしかできません。回数はもう先に進んでいるので、確認で断られます。')}</IconRow>
        <IconRow name="move" title={t('Moving it breaks it', '付け替えると壊れる')}>{t('The antenna tears if the label is peeled away, and a torn tag stops answering. It is sewn in, not stuck on.', 'ラベルを剥がすとアンテナが切れ、切れたタグは応答しなくなります。貼るのではなく、縫い込んでいます。')}</IconRow>
        <IconRow name="eye" title={t('No personal data', '個人情報なし')}>{t('The tag stores one link. Who owns the piece, what it cost and who tapped it are never on the tag or in the record.', 'タグに入っているのはリンク1つだけです。持ち主、価格、タップした人は、タグにも記録にも残りません。')}</IconRow>
      </div>

      <h2 className="pl-h">{t('In 3D', '3Dで見る')}</h2>
      <p className="mo-lead">{t('Open the label layer by layer, then follow a tap through the whole system.', 'ラベルを1層ずつ開き、タップが仕組み全体をどう通るかをたどってください。')}</p>
      <NfcSystem3DLazy />

      <h2 className="pl-h" id="tap">{t('What one tap does — in about two seconds', '1回のタップで起きること — 約2秒')}</h2>
      <ol className="sol-steps">
        <li><GcIcon name="antenna" size={52} /><div><b>{t('1 · The phone wakes the chip', '1 · スマホがチップを起こす')}</b><span>{t('Hold the phone near the tag. Its field powers the chip.', 'スマホをタグに近づけると、その電波がチップを動かします。')}</span></div></li>
        <li><GcIcon name="chip" size={52} tone="copper" /><div><b>{t('2 · The chip makes a one-time code', '2 · チップが使い捨てコードを作る')}</b><span>{t('It counts up and signs the count. Our server checks the code and makes sure the counter went up.', '回数を増やして、その回数に署名します。サーバーがコードを確かめ、回数が増えていることを確認します。')}</span></div></li>
        <li><GcIcon name="tap" size={52} /><div><b>{t('3 · The passport opens', '3 · パスポートが開く')}</b><span>{t('The phone shows a notification and opens the piece’s page, marked “Chip verified just now”. No app.', 'スマホに通知が出て、「いまタップでチップを確認しました」の印つきで作品のページが開きます。アプリは不要です。')}</span></div></li>
        <li><GcIcon name="shield" size={52} tone="ok" /><div><b>{t('4 · Your phone checks the signatures', '4 · スマホが署名を確かめる')}</b><span>{t('Every record is checked in your browser: our server key, a founder’s device key, and the chain from one record to the next.', 'すべての記録をブラウザの中で確かめます。サーバーの鍵、創業者の端末の鍵、そして記録どうしのつながり。')}</span></div></li>
        <li><GcIcon name="clock" size={52} /><div><b>{t('5 · The timestamp is public', '5 · 日時の証明は公開')}</b><span>{t('Each record is covered by a fingerprint written to Solana. Anyone can look it up.', '各記録は Solana に書き込んだ指紋でカバーされています。誰でも調べられます。')}</span></div></li>
      </ol>
      <div className="sol-phones">
        <IconRow name="phone" title={t('iPhone', 'iPhone')}>{t('iPhone XS or later reads tags with no setup. Hold the top edge of the phone near the tag.', 'iPhone XS 以降は設定なしでタグを読めます。スマホの上の端をタグに近づけてください。')}</IconRow>
        <IconRow name="phone" title={t('Android', 'Android')}>{t('Turn on NFC in Settings if it is off. Hold the middle of the back of the phone near the tag.', 'NFCがオフなら、設定でオンにしてください。スマホの背面の中央をタグに近づけてください。')}</IconRow>
        <IconRow name="qr" title={t('No NFC?', 'NFCがない場合')}>{t('Scan the QR on the hang tag with the camera. It opens the same passport.', '下げ札のQRをカメラで読み取ってください。同じパスポートが開きます。')}</IconRow>
      </div>

      <h2 className="pl-h" id="solana">{t('Solana, in plain words', 'Solana をやさしく')}</h2>
      <p className="mo-lead">{t('Solana is a public record-keeping network that nobody owns and nobody can rewrite. We use it for one thing only: a timestamp that proves our records existed, unchanged, at a certain moment.', 'Solana は、誰のものでもなく、誰にも書き換えられない公開の記録ネットワークです。私たちが使うのは1つの目的だけ。記録がある時点で、変わらずに存在していたことを示す日時の証明です。')}</p>
      <SolanaTree3DLazy />
      <details className="pp-more">
        <summary>{t('Show the same thing as a flat diagram', '同じ内容を平面の図で見る')}</summary>
        <div className="sol-figwrap"><TreeFigure t={t} /></div>
      </details>
      <div className="sol-two">
        <div>
          <p className="sol-h"><GcIcon name="shield" size={30} tone="ok" /> {t('On Solana', 'Solana に書くもの')}</p>
          <ul className="sol-list ok">
            <li>{t('One 32-byte fingerprint per batch of records (a “Merkle root”)', 'まとめた記録ごとに32バイトの指紋1つ（「マークルルート」）')}</li>
            <li>{t('How many records the batch covers', 'まとめた記録の件数')}</li>
            <li>{t('The time Solana accepted it', 'Solana が受け付けた日時')}</li>
            <li>{t('Our issuer address, which signed it', '署名した発行者のアドレス')}</li>
          </ul>
        </div>
        <div>
          <p className="sol-h"><GcIcon name="lock" size={30} tone="ng" /> {t('Never on Solana', 'Solana に決して書かないもの')}</p>
          <ul className="sol-list ng">
            <li>{t('Names of owners or buyers', '持ち主や購入者の名前')}</li>
            <li>{t('Prices, payments or addresses', '価格・支払い・住所')}</li>
            <li>{t('Photos or product details', '写真や商品の詳細')}</li>
            <li>{t('Anything that could identify a person', '個人を特定できるもの')}</li>
          </ul>
        </div>
      </div>
      <div className="sol-grid">
        <IconRow name="fingerprint" title={t('Fingerprints, not data', 'データではなく指紋')}>{t('A fingerprint (SHA-256) can be made from a record, but the record can never be rebuilt from it. Change one letter and the fingerprint changes completely.', '記録から指紋（SHA-256）は作れますが、指紋から記録を復元することはできません。1文字変えるだけで、指紋はまったく別のものになります。')}</IconRow>
        <IconRow name="tree" title={t('Many records, one entry', '多くの記録を1件に')}>{t('Fingerprints are paired and combined until one root is left. One Solana entry then covers every record in the batch.', '指紋を2つずつ組み合わせ、最後に1つのルートにします。Solana への1件の書き込みで、まとめたすべての記録をカバーします。')}</IconRow>
        <IconRow name="clock" title={t('After every change, and daily', '変更のたびと毎日')}>{t('A batch is written right after each new record and once a day at 03:00 Tokyo time.', '新しい記録のすぐあとと、毎日1回（日本時間の午前3時）に書き込みます。')}</IconRow>
        <IconRow name="ledger" title={t('Cheap and fast', '安くて速い')}>{t('An entry costs Solana’s base fee — 0.000005 SOL, a tiny fraction of a cent — and is confirmed in seconds.', '1件の費用は Solana の基本手数料（0.000005 SOL、1セントのごく一部）で、数秒で確定します。')}</IconRow>
        <IconRow name="founder" title={t('One key, two jobs', '1つの鍵に2つの役目')}>{t('Our issuer key signs every record and is also our Solana address, so the same key you check on a passport is the one you see on Solana.', '発行者の鍵はすべての記録に署名し、同時に Solana のアドレスでもあります。パスポートで確かめる鍵と、Solana で見える鍵は同じものです。')}</IconRow>
        <IconRow name="offline" title={t('Optional by design', 'あえて補助に')}>{t('If Solana ever stopped, every passport would still verify with its signatures. The chain adds an outside witness; it is never the only proof.', 'Solana が止まっても、すべてのパスポートは署名だけで確かめられます。チェーンは外部の証人を加えるもので、唯一の証明ではありません。')}</IconRow>
      </div>
      <p className="sol-status"><GcIcon name="warn" size={30} tone="copper" /> <span><b>{t('Now:', '現在：')}</b> {t('entries go to Solana’s test network (devnet) while we prepare launch, and every tap checks the chip’s one-time code.', '開始の準備中のため Solana のテスト網（devnet）に書き込んでいます。タップのたびに、チップの使い捨てコードを確かめています。')} <b>{t('Next:', '次：')}</b> {t('Solana mainnet for every real piece.', 'すべての本物の作品を Solana のメインネットに。')}</span></p>

      <h2 className="pl-h" id="check">{t('Check it yourself', 'ご自身で確かめる')}</h2>
      <ol className="sol-steps">
        <li><GcIcon name="tap" size={52} /><div><b>{t('1 · Open a passport', '1 · パスポートを開く')}</b><span>{t('Tap the tag, scan the hang-tag QR, or open', 'タグをタップするか、下げ札のQRを読み取るか、')} <a href="/passport/GC-DEMO-1">{t('the demo passport', 'デモのパスポート')}</a>{t('.', 'を開いてください。')}</span></div></li>
        <li><GcIcon name="shield" size={52} tone="ok" /><div><b>{t('2 · Read the five answers at the top', '2 · 上の5つの答えを読む')}</b><span>{t('The tag, signed by Gallery Crypto, approved by a founder, nothing changed, public timestamp — each with a clear ✓ or ✕.', 'タグ、Gallery Crypto の署名、創業者の承認、書き換えなし、公開の日時の証明。それぞれ ✓ か ✕ ではっきり示します。')}</span></div></li>
        <li><GcIcon name="search" size={52} /><div><b>{t('3 · Press “Check on Solana”', '3 · 「Solana で確かめる」を押す')}</b><span>{t('In the Public timestamp box. Your browser asks a public Solana node directly and confirms our root is in that entry.', 'ブロックチェーンへの刻印の欄にあります。ブラウザが公開の Solana ノードに直接問い合わせ、その書き込みに私たちのルートが入っていることを確認します。')}</span></div></li>
        <li><GcIcon name="ledger" size={52} tone="copper" /><div><b>{t('4 · Or look it up in an explorer', '4 · またはエクスプローラーで調べる')}</b><span>{t('Press “Explorer”. Find the memo starting', '「エクスプローラー」を押して、')} <code>GCPP/2 root:</code> {t('and compare it with the root shown on the passport.', 'で始まるメモを探し、パスポートに表示されたルートと比べてください。')}</span></div></li>
        <li><GcIcon name="download" size={52} /><div><b>{t('5 · Keep a copy', '5 · 控えを保存する')}</b><span>{t('Download the proof file. It checks offline at', '証明ファイルをダウンロードしてください。このサイトがなくなっても、')} <a href="/verify">/verify</a>{t(', even if this site is gone.', ' でオフラインで確かめられます。')}</span></div></li>
      </ol>

      <h2 className="pl-h" id="faq">{t('Questions', 'よくある質問')}</h2>
      <div className="sol-faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>

      <p className="mo-links">
        <a href="/demo/3d">{t('See the tag inside the cap in 3D →', 'キャップの中のタグを3Dで見る →')}</a>
        <a href="/passport/GC-DEMO-1">{t('Open the demo passport →', 'デモのパスポートを開く →')}</a>
        <a href="/ledger">{t('See every real write to Solana →', 'Solana への本物の書き込みをすべて見る →')}</a>
        <a href="/spec">{t('Read the full specification →', '仕様書をすべて読む →')}</a>
      </p>
    </MoShell>
  );
}
