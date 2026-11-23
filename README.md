# Padma Agro Farm ERP v2

Farm management ERP for Padma Agro Farm: mango orchard with direct-to-customer courier sales, plus sheep, kali dal and vegetables. Includes a website order API.

## Run

```bash
npm install
npm run build
npm start            # http://localhost:3001  (serves the app + API)
```

Development with hot reload: `npm run dev` (app on :5173, API on :3001).

On first start the server prints a random **admin password** once (or set `ADMIN_PASSWORD` before the very first start). Lost it? Stop the server and run `npm run reset-password` (or `npm run reset-password -- YourNewPassword`). Change it any time in Settings.
**On a host without a terminal:** set the environment variable `ADMIN_PASSWORD` (8+ characters). It is applied on every start, so redeploy/restart and sign in with it. (While it is set, a password changed in Settings is replaced by it on the next restart.)
Your local password does not carry over to a server: the server creates its own fresh `data/db.json`.
Data is stored in `data/db.json` (back this file up). Run `npm test` for the API test suite.

## First setup (10 minutes)

1. **Settings** → set a price per kg for each variety, packaging and delivery rules.
2. **Expenses & Investment** → add your land lease as *Investment*, then running costs as *Operating*.
3. **Settings → Website order API** → copy the API key into your website.

## Modules

| Module | Purpose |
|---|---|
| Dashboard | Stock, open parcels, profit, break-even progress |
| Harvest & Stock | Daily plucking, Grade A/B split, live stock per variety |
| Orders & Courier | Website inbox, editable orders, labels, courier CSV, payment verification |
| COD Settlements | Record courier payouts; the deduction becomes a real cost |
| Expenses & Investment | One editable ledger: Investment / Operating / Other income |
| Investment Analysis | Break-even, ROI, editable season projection, what-if grid, cost per block |
| Settings & API | Prices, rules, blocks, API key, origins, password |

## Website API

| Endpoint | Auth |
|---|---|
| `GET /api/public/catalog` | none |
| `POST /api/public/quote` | none |
| `POST /api/public/orders` | `x-api-key` |
| `GET /api/public/orders/:id?phone=01XXXXXXXXX` | phone match |

Prices, packaging and delivery are always calculated server-side. Send `externalId` so retries never create duplicates.
Prepaid methods (bKash/Nagad…) require `paymentRef`; those orders wait in the inbox until you verify the transaction.
A sample page is at `/examples/order-form.html`.

## Deploying

Put it behind HTTPS (Caddy/nginx/Cloudflare Tunnel) on a VPS. Set `PORT`, `DATA_DIR` and `ADMIN_PASSWORD` as needed.
Orders are held in a JSON file, fine for one orchard; move to SQLite/Postgres if you outgrow it.

## Hosting notes

The app is one long-running Node server that saves to a file, so it needs a host with a **persistent disk**: a VPS, Render (with a disk), Railway (with a volume) or Fly.io (with a volume). Set `DATA_DIR` to the disk's path and `ADMIN_PASSWORD`.
It does **not** work properly on Vercel or Netlify functions: their file system is temporary, so orders and expenses would disappear.
