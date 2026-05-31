# MyStocks — Phase 1: AI-Ready Marketplace Dashboard

Unified TikTok Shop + Shopee + manual-entry dashboard.
Structured for AI analysis in Phase 2 (Gemini API).

---

## Architecture

```
mystocks-dashboard.vercel.app
├── /               React/Vite SPA (Tailwind CSS)
├── /api/auth/*     JWT + OAuth serverless functions
├── /api/tiktok/*   TikTok Shop data endpoints
├── /api/shopee/*   Shopee stubs (Phase 2)
├── /api/manual/*   Manual order/product/stock entry
├── /api/analytics/ Combined cross-platform analytics
└── /api/cron/*     Nightly BigQuery sync (01:00 WIB)

Firebase Firestore  (api-maps-188304)
  orders/{userId_platform_orderId}
  products/{userId_platform_productId}
  customers/{userId_buyerKey}
  stock_movements/{autoId}
  sync_logs/{autoId}
  users/{userId}/tiktok → OAuth tokens

BigQuery  (api-maps-188304.mystocks)
  orders, products, customers, stock_movements
  → Nightly mirror of Firestore, used for Phase 2 AI queries
```

---

## Quick Start (local)

```bash
cd frontend
npm install
vercel dev     # serves React + /api/* on one port (usually 3000)
```

> Use `vercel dev`, **not** `npm run dev` — Vite alone cannot run serverless functions.

---

## Setup Checklist

### 1. Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Select project **api-maps-188304** (already exists)
3. Enable **Firestore** (if not done):
   - Database → Create database → Production mode → Choose region (asia-southeast2 for Jakarta)
4. Get service account credentials:
   - Project Settings → Service Accounts → **Generate new private key** → download JSON
5. Apply Firestore security rules (see below)

### 2. BigQuery dataset

In [console.cloud.google.com](https://console.cloud.google.com) for project **api-maps-188304**:

```bash
# Option A: Console
BigQuery → +Add → Create dataset → Dataset ID: mystocks → Location: US

# Option B: CLI
bq --project_id=api-maps-188304 mk --dataset mystocks
```

Grant the Firebase service account BigQuery permissions:
- IAM → Find the service account email → Add roles:
  - **BigQuery Data Editor**
  - **BigQuery Job User**

Tables are auto-created on first nightly sync.

### 3. Vercel environment variables

In [Vercel dashboard](https://vercel.com) → mystocks-dashboard → **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `TIKTOK_CLIENT_KEY` | `sbawhr9bjv3gnf8l39` |
| `TIKTOK_CLIENT_SECRET` | `bQATj1cRKFeC8MqkgH2xBWYQplmY8EOj` |
| `TIKTOK_REDIRECT_URI` | `https://mystocks-dashboard.vercel.app/api/auth/tiktok/callback` |
| `TIKTOK_SCOPES` | `order.read,product.read,product.write,shop.read,merchant_info.read` |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FIREBASE_PROJECT_ID` | `api-maps-188304` |
| `FIREBASE_CLIENT_EMAIL` | From service account JSON (`client_email` field) |
| `FIREBASE_PRIVATE_KEY` | From service account JSON (`private_key` field, keep the `\n` characters) |
| `FRONTEND_URL` | `https://mystocks-dashboard.vercel.app` |
| `MOCK_MODE` | `false` |
| `GEMINI_API_KEY` | _(leave empty for now — Phase 2)_ |

After adding all vars → **Redeploy** (Deployments → ⋯ → Redeploy).

### 4. TikTok Sandbox portal

In [partner.tiktok.com](https://partner.tiktok.com) → Your App → **Sandbox tab** → Login Kit → Redirect URIs:

Add this exact URI:
```
https://mystocks-dashboard.vercel.app/api/auth/tiktok/callback
```

Also add for local dev (if using `vercel dev`):
```
http://localhost:3000/api/auth/tiktok/callback
```

### 5. Firestore security rules

In Firebase Console → Firestore → Rules, paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User tokens — private
    match /users/{userId}/{document=**} {
      allow read, write: if false; // server-only via Admin SDK
    }

    // All data collections — server-only
    match /orders/{docId} {
      allow read, write: if false;
    }
    match /products/{docId} {
      allow read, write: if false;
    }
    match /customers/{docId} {
      allow read, write: if false;
    }
    match /stock_movements/{docId} {
      allow read, write: if false;
    }
    match /sync_logs/{docId} {
      allow read, write: if false;
    }
  }
}
```

All access goes through the Admin SDK in serverless functions — no client SDK is used.

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/session` | Session status (`tiktokConnected`, `shop`, `user`) |
| `GET` | `/api/auth/tiktok` | Start TikTok OAuth |
| `GET` | `/api/auth/tiktok/callback` | OAuth callback → sets JWT cookie → redirects to `/dashboard` |
| `POST` | `/api/auth/tiktok/disconnect` | Clear TikTok tokens |
| `GET` | `/api/auth/shopee` | Shopee OAuth _(stub — coming soon)_ |
| `POST` | `/api/auth/logout` | Destroy JWT cookie |

### TikTok Shop

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tiktok/orders` | Orders (`?page=1&pageSize=20`) |
| `GET` | `/api/tiktok/products` | Product listings |
| `GET` | `/api/tiktok/inventory` | Stock levels |
| `GET` | `/api/tiktok/analytics` | Revenue, top products |

> Every fetch also persists to Firestore and writes a `sync_log`.

### Shopee _(Phase 1 stubs)_

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/shopee/orders` | `{ orders: [], _notice: "coming soon" }` |
| `GET` | `/api/shopee/products` | `{ products: [], _notice: "coming soon" }` |

### Manual Entry

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/manual/order` | `{ buyer_name, items[{name,qty,unit_price}], total }` |
| `POST` | `/api/manual/product` | `{ name, sku?, variants?, category? }` |
| `POST` | `/api/manual/stock` | `{ product_id?, sku?, qty_change, type?, note? }` |

### Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analytics/combined` | Merged stats (`?days=30`) |

### Cron

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/cron/bigquery-sync` | Manual trigger (`?secret=CRON_SECRET`) |

---

## Firestore Schema

### `orders/{userId_platform_orderId}`
```
user_id, platform, platform_order_id, buyer_id, buyer_name, buyer_region,
items[{product_id, sku, name, variant, qty, unit_price}],
subtotal, shipping, total, currency, status, created_at, synced_at
```

### `products/{userId_platform_productId}`
```
user_id, platform, platform_product_id, sku, name, category,
variants[{name, sku, cost_price, sell_price, stock}],
images[], is_active, created_at, updated_at
```

### `customers/{userId_buyerKey}`
```
user_id, platforms[], platform_ids{tiktok,shopee}, name,
total_orders, total_spend, avg_order_value,
first_order_at, last_order_at, tags[], updated_at
```

### `stock_movements/{autoId}`
```
user_id, product_id, sku, type, qty_change, qty_after,
platform, order_id, note, created_at
```

### `sync_logs/{autoId}`
```
user_id, platform, type, status, records_synced, error_message, created_at
```

---

## BigQuery

Dataset: `mystocks` in project `api-maps-188304`

Tables mirror Firestore (nightly push at 01:00 WIB / 18:00 UTC):
- `orders` — full order history with `items_json` (JSON string)
- `products` — product catalog with `variants_json`
- `customers` — customer aggregates
- `stock_movements` — full movement log

**Phase 2 AI queries will run directly on BigQuery** using Gemini's
function calling / SQL generation capabilities.

---

## Phase 2 Roadmap

- [ ] Activate Gemini API (`GEMINI_API_KEY`)
- [ ] `/api/ai/insights` — natural language query over BigQuery
- [ ] `/api/ai/restock` — AI restock recommendations
- [ ] Activate Shopee integration (`SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`)
- [ ] Multi-user auth (email/password or Google SSO)
- [ ] Looker Studio / Data Studio dashboard connected to BigQuery
