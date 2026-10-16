# Gallery Crypto — Founder's Archive

The public site (English) for the band-tee archive and the 2027 presale draw, plus an admin screen (Japanese).

- `/` — public site: archive, presale draw entries, provenance, contact form
- `/admin` — admin screen: add photos (including from the iPhone camera), view entries and messages, edit site text
- `/legal` — 特定商取引法に基づく表記 (rewrite the parts marked [ ])

Built with Next.js, Supabase (database, photo storage, login) and Vercel (hosting). Everything runs within the free plans.

---

## Setup (about 30 minutes, no coding)

### 1. Supabase (database)

1. Create a free account at https://supabase.com, then click **New project**.
   - Name: `gallery-crypto`
   - Region: `Northeast Asia (Tokyo)`
   - Database password: anything (keep it somewhere safe)
2. Open **SQL Editor** from the left menu.
3. Paste the whole of `supabase/schema.sql`.
4. **Change `you@example.com` on the last line to your own email address**, then click **Run**.
5. Go to **Authentication → Users → Add user → Send invitation** and enter the same email address.
6. Go to **Authentication → Sign In / Providers** and turn **Allow new users to sign up** off. This stops anyone else from creating an account.
7. Go to **Project Settings → API** and copy these two values:
   - `Project URL`
   - `anon public` key

### 2. Vercel (publishing)

1. Sign in at https://vercel.com with your GitHub account.
2. Choose **Add New → Project** and import the `gallery-crypto-site` repository.
3. Under **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key |

4. Click **Deploy**. After a minute or two you get a URL like `https://gallery-crypto-site.vercel.app`.
5. Back in Supabase, open **Authentication → URL Configuration**:
   - Set **Site URL** to that URL.
   - Add `https://<that URL>/admin` under **Redirect URLs**.

### 3. Adding pieces from your iPhone

1. Open `https://<your URL>/admin` in Safari and enter your email address. Open the login link you receive in the same Safari.
2. To add pieces:
   - **Choose photos**: one photo = one piece, saved as an unpublished draft.
   - **Take a photo**: shoot the piece and fill in its details straight away.
3. Tap a draft, enter the band name, year and so on, tick **Publish on site**, then save. It appears on the public site within a minute.
4. Tip: in Safari, use Share → **Add to Home Screen** to open the admin screen like an app.

### 4. Custom domain (optional)

Buy a domain (for example `gallerycrypto.com`), add it under Vercel **Settings → Domains**, and set it at your registrar as instructed. Then update the Supabase Site URL and Redirect URLs to match.

---

## Security notes

- Photos and the public fields can be seen by anyone. **Never put purchase prices or similar into the provenance text.**
- Rank is shown only in the admin screen. The database blocks it from public visitors.
- Only email addresses in the `admins` table can add, edit or delete pieces, and read entries and messages.
- To add another admin, run this in the Supabase SQL Editor and also invite them under Authentication → Users:
  ```sql
  insert into admins values ('someone@example.com')
  ```

## Later additions (planned)

- **2027**: card payments with Stripe (with Apple Pay), and an email notice when a buyer wins the draw
- **Solana devnet → mainnet**: record a provenance certificate for each piece (the "Network: Solana (test network)" shown on the site is a preview)
- **Draw**: Solana VRF (verifiable random numbers) and publishing the results

## Development

```bash
npm install
cp .env.example .env.local   # fill in the two values
npm run dev                  # http://localhost:3000
```
