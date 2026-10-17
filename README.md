# Gallery Crypto — Founder's Archive

バンドTアーカイブの公開サイト（英語）と、2027年プレセールの抽選・決済、管理画面（日本語）です。

- `/` — 公開サイト：アーカイブ、抽選エントリー、来歴、問い合わせ。一般販売中は「Buy now」
- `/admin` — 管理画面：写真の登録（iPhone のカメラ可）、価格、当選者の選定、注文、問い合わせ、サイト設定
- `/buy/…` — 抽選の当選者専用の購入ページ（1回限り）
- `/thanks` — 支払い完了ページ
- `/legal` — 特定商取引法に基づく表記（[ ] の部分を書き換え）

各商品はホログラムのトレーディングカードとして表示され、指やカーソルで3Dに傾き、開くと裏面が来歴証明書になります。8ビット風の効果音（右上で ON/OFF）と、商品ごとの音楽（試聴リンク・権利のある音源ファイル）にも対応しています。

仕組み：Next.js ＋ Supabase（データベース・写真・ログイン）＋ Stripe（カード決済）＋ Vercel（公開）。Stripe 以外は無料プランの範囲で動きます。Stripe は売れたときだけ手数料がかかります。

---

## いちばん簡単な始め方（iPhone だけでできます）

1. **Vercel**：vercel.com に GitHub でログイン →「Add New → Project」→ `gallery-crypto-site` を「Import」→ そのまま「Deploy」。
2. **データベースをつなぐ**：できたプロジェクトの「Storage」→「Create Database」→「Supabase」→ リージョン Tokyo で作成し、このプロジェクトに接続。キーは自動で入ります。
3. **表を作る**：Supabase の画面（Storage の「Open in Supabase」）→「SQL Editor」→ `supabase/setup_all.sql` の中身を全部貼って「Run」。
4. **ログイン設定**：Supabase の「Authentication」で
   - Users → Add user → Send invitation：管理者メール（conductor80s@gmail.com）
   - Sign In / Providers：「Allow new users to sign up」をオフ
   - URL Configuration：Site URL に Vercel の URL、Redirect URLs に `その URL/admin`
5. Vercel の「Deployments」→ 最新の「…」→「Redeploy」。完了したら `その URL/admin` から写真を登録できます。

下の「セットアップ」は、パソコンで手動で設定する場合の詳しい手順です。

## セットアップ

### 1. Supabase（データベース）

1. https://supabase.com で無料登録し、「**New project**」。
   - Name：`gallery-crypto`
   - Region：`Northeast Asia (Tokyo)`
   - Database password：任意（控えておく）
2. 左メニュー「**SQL Editor**」を開き、`supabase/schema.sql` の中身を全部貼り付けます。
3. **最後の行の `you@example.com` をご自身のメールアドレスに書き換えて**から「**Run**」。
4. 続けて `supabase/002_stripe.sql`（決済）、`supabase/003_cards_sound.sql`（音楽）の順に、同じように貼り付けて「**Run**」。
5. 「**Authentication → Users → Add user → Send invitation**」で同じメールアドレスを登録。
6. 「**Authentication → Sign In / Providers**」で「**Allow new users to sign up**」をオフ（他人がアカウントを作れないように）。
7. 「**Project Settings → API**」から次をコピー：
   - `Project URL`
   - `anon public` キー
   - `service_role` キー（**絶対に公開しない鍵**。Vercel の環境変数にだけ入れます）

### 2. Vercel（公開）

1. https://vercel.com に GitHub アカウントでログイン。
2. 「**Add New → Project**」で `gallery-crypto-site` リポジトリを選択。
3. 「**Environment Variables**」に追加：

   | 名前 | 値 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public キー |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role キー |
   | `NEXT_PUBLIC_SITE_URL` | 公開後のURL（例 `https://gallery-crypto-site.vercel.app`。最初は空でも可） |

4. 「**Deploy**」。1〜2分で URL ができます。
5. Supabase に戻り「**Authentication → URL Configuration**」：
   - **Site URL** にその URL
   - **Redirect URLs** に `https://<そのURL>/admin`

### 3. Stripe（カード決済）— 販売開始の前までに

1. https://stripe.com で無料登録し、本人確認と入金先（日本の銀行口座）を登録。個人事業主として登録できます。お客さまは米ドルで支払い、円に換えて入金されます。
2. まずは「**テストモード**」のまま進めます。
3. 「開発者 → API キー」の **シークレットキー**（`sk_test_…`）をコピー。
4. 「開発者 → Webhook → エンドポイントを追加」
   - URL：`https://<あなたのURL>/api/stripe/webhook`
   - イベント：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.expired`
   - 作成後の **署名シークレット**（`whsec_…`）をコピー。
5. Vercel の環境変数に追加して「**Deployments → Redeploy**」：

   | 名前 | 値 |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_test_…`（本番では `sk_live_…`） |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |

6. **テスト購入**：
   - 管理画面で1着に価格を入れます。
   - 自分のメールで抽選にエントリーし、「抽選エントリー」タブで「当選にする」→「リンクをコピー」。
   - リンクを開いて、カード番号 `4242 4242 4242 4242`、有効期限は未来の日付、CVC は何でもで支払います。
   - 「注文」タブに入り、商品が SOLD になれば成功。テスト後は商品の「売約済み」を外しておきます。
7. 本番に切り替えるとき：Stripe を本番モードにし、本番のシークレットキーと、本番側で作り直した Webhook の署名シークレットに差し替えて Redeploy。

### 4. iPhone から登録

1. Safari で `https://<あなたのURL>/admin` を開き、メールアドレスを入力。届いたリンクを同じ Safari で開きます。
2. 「**写真を選ぶ**」（1枚＝1着の下書き）か「**カメラで撮る**」（撮ってすぐ入力）。
3. 下書きをタップしてバンド名・年などを入れ、「サイトに公開」にチェックして保存。1分以内に公開サイトに出ます。
4. Safari の共有 →「**ホーム画面に追加**」で、アプリのように開けます。

### 5. 独自ドメイン（任意）

ドメイン（例 `gallerycrypto.com`）を取得し、Vercel の「**Settings → Domains**」に追加。その後 Supabase の Site URL / Redirect URLs、Stripe の Webhook URL、環境変数 `NEXT_PUBLIC_SITE_URL` を新しいドメインに合わせます。

---

## 販売の流れ

| 時期 | 管理画面での操作 | お客さまに見えるもの |
|---|---|---|
| 〜2026年 | 写真と情報を登録・公開 | アーカイブと無料の抽選エントリー |
| 2027年1月 抽選 | 各着に価格（米ドル）を入力 →「抽選エントリー」で当選者を「当選にする」→「メール作成」で購入リンクを送る | 当選者だけが自分のリンクから購入（1回限り） |
| 一般販売 | 「サイト設定」で「一般販売を開始する」をオン | 価格のある全商品に「Buy now」。売れた商品は自動で SOLD |

- 決済画面を開いてから30分は、その商品を他の人が買えないよう確保します（二重販売の防止）。支払わずに閉じた場合は30分後に自動で戻ります。
- 送料は「サイト設定」で1注文あたりの金額を設定します（0 で送料無料）。
- 発送したら「注文」タブで「発送済みにする」。返金は Stripe の管理画面から行います。
- 手数料は Stripe の料金表で確認してください。海外カードや通貨換算には追加の手数料がかかります。

## 音楽について

- 商品ごとに「試聴リンク」（Spotify・Apple Music・YouTube）と「音源ファイル」を設定できます。
- 市販の CD・配信の曲をサイトで流すには、作詞・作曲の権利（JASRAC など）と原盤の権利（レーベル）の両方の許諾が必要です。許諾のない曲は試聴リンクを使ってください。音源ファイルは、ご自身で制作したものや利用許諾を得たものだけにしてください。

## 安全のために

- 写真と公開項目は誰でも見られます。**仕入れ値などは来歴欄に書かないでください。**
- ランクは管理画面にだけ表示され、公開サイトからはデータベース側で読めないようにしてあります。
- 管理者（admins に登録したメール）だけが、商品の追加・編集・削除と、エントリー・注文・問い合わせの閲覧ができます。
- 価格はサーバーがデータベースから読み直して Stripe に渡すため、ブラウザ側で書き換えても変わりません。カード情報はこのサイトを通らず、Stripe の画面で直接入力されます。
- `SUPABASE_SERVICE_ROLE_KEY` と `STRIPE_SECRET_KEY` は Vercel の環境変数にだけ置き、GitHub やメールに書かないでください。
- 管理者を増やすとき：SQL Editor で `insert into admins values ('someone@example.com');` を実行し、Authentication → Users でも招待します。

## 今後の追加（予定）

- 当選・発送の案内メールの自動送信（今は管理画面の「メール作成」から手動）
- **Solana devnet → mainnet**：各着の来歴証明書を記録（サイトの「Network: Solana (test network)」は予告表示）
- **抽選**：Solana の検証可能な乱数（VRF）による当選者選定と結果の公開

## 開発

```bash
npm install
cp .env.example .env.local   # 値を入れる
npm run dev                  # http://localhost:3000
```
