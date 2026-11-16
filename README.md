# SIL Card Manager

Upload photos of business cards in batches. A free vision model (Google Gemini 3.8 Flash, falling back to Gemini 3.5 Flash-Lite and then Groq Qwen 3.8) pulls every detail off each card into a table. From there you can copy it into Google Sheets in one click, or download Excel or CSV. Cards are organised into **events** that teammates can collaborate on, and every row records who added it.

## Features

- **Google sign-in** (Auth.js). Optionally restrict sign-in to your company's email domains.
- **Events**: each one has a creator and an owner. The owner can invite people by email as Editor or Viewer, change roles, remove people and transfer ownership. Every user also gets a private **My Cards** space.
- **Batch upload**: drag and drop or pick many photos (JPG/PNG/WEBP/HEIC). On phones you can also take photos directly.
  - The browser converts HEIC, fixes rotation and shrinks each photo before uploading.
  - There's a progress bar for each file and one for the whole batch.
  - **Process cards** only unlocks after every upload has finished.
- **AI extraction**: reads name parts, title, department, company, tagline, all emails and phones (sorted into mobile, office, fax and other, then normalised), website, the full address plus its parts, social handles, any other printed text, and the card's language.
  - Several cards in one photo become several rows.
  - Rate limits are retried automatically, then it falls back to Groq.
  - If you close the tab mid-batch, unprocessed cards come back on your next visit.
- **Contacts table**:
  - Search, sort, show or hide columns, and edit inline.
  - Open a side-by-side review of the card image next to all its fields.
  - Contacts that look like the same person scanned twice are flagged.
  - **Added By** and **Added At** columns.
- **Export**: *Copy for Google Sheets* (tab-separated text that pastes as columns), **Excel (.xlsx)** and **CSV**.

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Database (Postgres)

You can use any Postgres. Free options are [Supabase](https://supabase.com) or [Neon](https://neon.tech). A local Postgres works too.

- Put the connection string in `DATABASE_URL`.
- On Supabase, use the **pooler** connection string for serverless hosting.

Then create the tables:

```bash
npm run db:migrate
```

### 3. Google login

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), go to **Create credentials → OAuth client ID → Web application**.
2. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-DOMAIN/api/auth/callback/google`
3. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
4. Set `AUTH_SECRET` to a random string: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. (Do not use `npx auth secret`, because that package now belongs to Better Auth.)
5. Optional: to limit sign-in to certain domains, set `ALLOWED_EMAIL_DOMAINS=yourcompany.com`.

### 4. Vision model (free)

- `GEMINI_API_KEY`: get a free key at <https://aistudio.google.com/apikey>.
- `GEMINI_MODELS`: the models to try, in order. The default is `gemini-3.8-flash,gemini-3.5-flash-lite`. When a model hits its free quota, the app moves on to the next one and comes back after the quota resets.
- Optional `GROQ_API_KEY`: a free key from <https://console.groq.com/keys>. It's the last resort, using `qwen/qwen3.8-27b`.
- Optional `DEFAULT_PHONE_COUNTRY` (e.g. `IN`): used to format phone numbers printed without a country code.

> **Privacy note:** on Google's *free* tier, prompts and images may be used to improve Google's products. Business cards contain personal data. Enabling billing on the same key (about $0.0003 per card) stops that, and no code changes are needed.

### 5. Image storage

- **Local dev:** leave the `SUPABASE_*` variables empty. Images are saved to `./uploads`.
- **Production (e.g. Vercel):** create a **private** bucket called `cards` in Supabase Storage. Then set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the new `sb_secret_...` key from **Project Settings → API Keys**).

### 6. Run

```bash
npm run dev        # http://localhost:3000
```

## Deploying to Vercel (free)

1. Push the repo and import it in Vercel.
2. Add every variable from `.env.local` to the project.
3. Add the production callback URL to the Google OAuth client.

Each card is processed in its own short request, so this fits within Vercel's free time limits.

## Using it

1. **New event** → give it a name and an optional date.
2. **Upload cards** → drop your photos and wait for the batch bar to reach 100%, then click **Process cards**. Rows appear as each card is read.
3. **Contacts** → review and fix any field, then click **Copy for Google Sheets**, click cell A1 in your sheet and paste. You can also use **Download → Excel**.
4. **Members** → add teammates' Google emails. Each person's uploads show their name in **Added By**.

Free-tier throughput: Google no longer publishes fixed free limits. You can see your project's limits in AI Studio. Recent reports put Gemini 3.8 Flash at about 5 requests/minute and 20/day, and 3.5 Flash-Lite at about 10–15/minute and 500/day. The app processes two cards at a time and uses the best model that still has quota. If every model's quota is used up, the card is marked failed with a "retry in N min" message.

## Project layout

```
db/schema.sql                 Postgres schema (npm run db:migrate)
src/auth.ts                   Google sign-in config
src/lib/users.ts              On login: create the user, activate pending invites, create "My Cards"
src/lib/extract/              Vision prompt, Gemini (Interactions API) / Groq calls, model fallback, normalisation
src/lib/fields.ts             Column definitions shared by the table, copy and export
src/app/api/...               REST routes (events, members, batches, images, extract, contacts, export)
src/components/Uploader.tsx   Batch upload, progress bars, process queue
src/components/ContactsTable.tsx  Table, inline edit, review modal, copy and download
src/components/MembersPanel.tsx   Invites, roles, ownership transfer
```
