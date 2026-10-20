# House Hub

A mobile-friendly web app for running a shared house: tenants and landlords,
expense claims with receipt photos, who-owes-whom balances, a maintenance
calendar with contractors, municipal/utility bill splitting, meter readings,
and separate ledgers (e.g. a car being paid off) that sync with Google Sheets
or spreadsheet files.

It is a static React site with Firebase (Auth + Firestore) as the backend, so
it runs from **GitHub Pages** or any small web server such as a **Raspberry
Pi**, on Firebase's free Spark plan.

## Features

| Area | What it does |
| --- | --- |
| Household | Members with roles (landlord / tenant), room, move-in/out dates, utility weight. Sign-in is by email: a landlord adds someone's email and they get access when they sign in with it. |
| Expenses | Claims with category (dogs, electronics, pool, …), date, payer, receipt photos and an equal / by-shares / exact split. Anyone charged can dispute their share; disputed claims are left out of balances until a landlord resolves them. |
| Balances | Net position per member and the fewest payments that settle everyone up. Record payments (settlements). |
| Calendar | Month grid + agenda of contractor visits and household jobs, with weekly / fortnightly / monthly repeats. |
| Contractors | Plumbers, electricians, pool service… with tap-to-call and WhatsApp links. |
| Utilities | Bills (photo of the bill attached) split equally, by weight, by **days lived in the house × weight**, or by **sub-meter usage**. Each bill creates a matching expense so it flows into balances. Meter readings log usage per day between readings. |
| Ledgers | Separate running totals that don't affect balances, each optionally tied to one tenant, with a target and progress bar. Landlords add entries (or copy one from an expense). Tenants send entry **requests with a receipt photo**, which a landlord approves or rejects. Sync with a Google Sheet (push / pull), upload `.xlsx`/`.csv`, download `.xlsx`. |
| Currency | Everything is recorded in **rand (ZAR)**. Landlords also see amounts in their own currency (EUR by default, changeable) at the daily ECB rate from [Frankfurter](https://frankfurter.dev) or a fixed estimate they enter. |

### Who can do what

Enforced by `firestore.rules`, not just hidden in the UI.

| | Landlord | Tenant |
| --- | --- | --- |
| Members, settings, currency | manage | read |
| Calendar, contractors, utility bills, meter readings | manage | read |
| Expense claims | manage all | add/edit/delete **own** claims (that they paid), dispute claims they're charged for |
| Payments (settlements) | manage all | record payments they made or received; delete their own |
| Ledgers | manage all, approve/reject requests, sheet sync | read ledgers linked to them; request entries with a receipt photo; withdraw unreviewed requests |

## Tech

- React 19 + TypeScript + Vite, react-router (hash routing, so it works from any sub-path)
- Bootstrap 5 / react-bootstrap / bootstrap-icons
- Firebase Auth (Google, or email + password with email verification) and Firestore (with offline cache)
- Receipt photos are resized in the browser and stored inside Firestore documents (≤ ~650 KB each), so no Cloud Storage / Blaze plan is needed
- SheetJS for `.xlsx`/`.csv`; the Google Sheets REST API with the landlord's own Google OAuth token for sheet sync

## Setup

### 1. Firebase project (`osiris-ef879`)

1. **Register a web app:** Firebase console › Project settings › Your apps › Add app › Web. Copy the config.
2. **Firestore:** Build › Firestore Database › Create database (production mode, a region near you, e.g. `africa-south1` or `europe-west`).
3. **Auth:** Build › Authentication › Sign-in method › enable **Google** and **Email/Password**.
4. **Authorized domains:** Authentication › Settings › Authorized domains › add your GitHub Pages host (`<user>.github.io`) and the Pi's hostname.
5. **Deploy the security rules:** `npm run deploy:rules` (uses `.firebaserc`, i.e. `osiris-ef879`).

### 2. Local development

```bash
cp env-template.txt .env.local   # then fill in the VITE_FIREBASE_* values
npm install
npm run dev                      # http://localhost:5070
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5070 (also exposed on your LAN) |
| `npm test` | Unit tests (splits, balances, bill splitting, recurrence, spreadsheet mapping) |
| `npm run lint` | oxlint |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built `dist/` on port 5070 |
| `npm run deploy:rules` | Deploy `firestore.rules` / `firestore.indexes.json` |

### 3. First household

The first person to sign in clicks **I'm a landlord – create a household** and
becomes its landlord. They then add everyone else under **Household** (name,
sign-in email, role, room, utility weight, move-in date). People without an
email can still be added; they appear in splits but can't sign in.

`seed/household.example.json` shows the shape of a household document if you
would rather create it in the Firebase console.

### 4. Hosting

**GitHub Pages.** Push to `main`; `.github/workflows/deploy.yml` tests,
builds and deploys. In the repo: Settings › Pages › Source: *GitHub Actions*,
and add the six `VITE_FIREBASE_*` values as repository secrets.

**Raspberry Pi.** Build on any machine and copy `dist/` over, or build on the Pi
(Node 22). Serve `dist/` with any static server, e.g. Caddy:

```
house.local {
    root * /srv/house-hub
    file_server
}
```

Use HTTPS (Caddy's `tls internal` on a LAN is enough): Google sign-in
popups and the offline cache want a secure context. Add the Pi's hostname to
Firebase's authorized domains.

### 5. Google Sheets sync (optional)

Ledgers can mirror to a Google Sheet. The app uses the landlord's own Google
account (no server, no API key):

1. Google Cloud console for `osiris-ef879` › APIs & Services › **enable the
   Google Sheets API**.
2. OAuth consent screen › add the scope `.../auth/spreadsheets`. While the app is
   unverified, either keep it in *Testing* and add each landlord as a test user,
   or publish it and click through Google's "unverified app" warning.
3. In a ledger, paste the sheet link and click **Connect & link**. The first
   connection each session opens a Google popup; after that, changes push
   automatically. **Pull changes from sheet** reads edits made in the sheet
   (rows without an Id are added, changed rows updated, deleted rows removed),
   shows a preview, then writes back so new rows get Ids.

Sheet layout: `Date | Description | Category | Who | Amount (ZAR) | Notes | Id`
in columns A–G, plus a Total / Target summary in I1:J3. Uploaded files use the
same headers (Date, Description and Amount are required; common aliases such
as *Item*, *Cost*, *Day* also work; dates may be `YYYY-MM-DD` or day-first
`DD/MM/YYYY`).

## Data model

All under `households/{householdId}`:

| Path | Notes |
| --- | --- |
| *(the household doc)* | `name`, `currency` (ZAR), `landlordCurrency`, `exchangeRate`, `rateSource`, `members` map, plus `memberEmails` / `landlordEmails` derived from it for rules and queries |
| `expenses/{id}` | amounts in integer cents; `allocations` = cents owed per member, always summing to `amountCents`; `billId` when generated from a bill |
| `receipts/{id}` | compressed JPEG data URL |
| `settlements/{id}` | payment `from` → `to` |
| `events/{id}`, `contractors/{id}` | calendar |
| `bills/{id}`, `meterReadings/{id}` | utilities; `meterReadings.source` is `manual` or the name of an automated collector |
| `ledgers/{id}`, `ledgerEntries/{id}` | entries carry `ledgerId` and the tenant's email (for rules); `status` is `approved` / `pending` / `rejected` |

## Roadmap

- **Smart meters:** a small collector on the Pi that reads the meter (or its
  cloud API) and writes `meterReadings` with `source: "pi-collector"` using a
  Firebase service account.
- **Reading bills and receipts automatically:** photo → amounts/period via an
  AI vision model, filled into the forms for review.
