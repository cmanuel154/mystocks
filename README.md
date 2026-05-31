# Marketplace Dashboard

A unified dashboard to manage **TikTok Shop** and **Shopee** seller accounts from one place.  
Core feature: update stock/inventory **once** and sync to both marketplaces simultaneously.

---

## Tech Stack

| Layer    | Technology                    |
|----------|-------------------------------|
| Backend  | Node.js + Express             |
| Frontend | React 18 + Tailwind CSS + Vite |
| Database | PostgreSQL via Supabase (free) |
| Auth     | Session-based (express-session)|

---

## Project Structure

```
Dashboard Marketplace/
├── backend/
│   ├── server.js              ← Express app + route wiring
│   ├── .env.example           ← Copy to .env and fill in credentials
│   ├── middleware/auth.js     ← Session guard + TikTok token refresh
│   ├── utils/tiktok.js        ← HMAC-SHA256 signing for TikTok Shop API v202309
│   ├── utils/shopee.js        ← HMAC-SHA256 signing for Shopee Open Platform v2
│   └── routes/
│       ├── auth.js            ← OAuth 2.0 flows for both platforms
│       ├── orders.js          ← Read orders (TikTok + Shopee merged)
│       ├── products.js        ← Read products (both platforms)
│       └── inventory.js       ← CRITICAL: stock sync engine
└── frontend/
    └── src/
        ├── context/AuthContext.jsx    ← Session state + connect/disconnect helpers
        ├── pages/
        │   ├── Login.jsx             ← Connect TikTok + Shopee OAuth buttons
        │   ├── Dashboard.jsx         ← KPI stats + recent orders
        │   ├── Orders.jsx            ← Unified order list with filters
        │   ├── Products.jsx          ← Product grid across both platforms
        │   └── Inventory.jsx         ← Stock table with live sync status
        └── components/
            └── StockSyncModal.jsx    ← Update qty → push to both platforms
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your credentials in .env (see sections below)
npm run dev
```

The backend runs on **http://localhost:3001**.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on **http://localhost:3000** and proxies API calls to `:3001`.

---

## Mock Mode (No API Keys Needed)

Set `MOCK_MODE=true` in `backend/.env` (the default).

Mock mode injects fake session tokens and returns realistic sample data for all
endpoints. The full UI is functional — you can test the inventory sync flow,
browse orders, and view products without real API credentials.

---

## Getting API Credentials

### TikTok Shop

1. Go to [TikTok Partner Center](https://partner.tiktok.com/account/appmanage)
2. Create a new app → select "TikTok Shop"
3. Add the required scopes:
   `order.read`, `product.read`, `product.write`, `inventory.read`, `inventory.write`, `shop.read`, `merchant_info.read`
4. Set the redirect URI to `http://localhost:3001/auth/tiktok/callback`
5. Copy `App Key` → `TIKTOK_CLIENT_KEY` and `App Secret` → `TIKTOK_CLIENT_SECRET`

> **Note:** TikTok Shop API requires app review/approval before live access is granted.
> Use `MOCK_MODE=true` while waiting for approval.

### Shopee Open Platform

1. Go to [Shopee Open Platform](https://open.shopee.com/developer/apps)
2. Create a new app → add the required APIs
3. Set redirect URI to `http://localhost:3001/auth/shopee/callback`
4. Copy `Partner ID` → `SHOPEE_PARTNER_ID` and `Partner Key` → `SHOPEE_PARTNER_KEY`
5. Set `SHOPEE_ENV=sandbox` for testing, `production` for live traffic

---

## Environment Variables

```env
# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=http://localhost:3001/auth/tiktok/callback

# Shopee
SHOPEE_PARTNER_ID=
SHOPEE_PARTNER_KEY=
SHOPEE_REDIRECT_URI=http://localhost:3001/auth/shopee/callback
SHOPEE_ENV=sandbox

# App
SESSION_SECRET=change_this_in_production_use_a_long_random_string
PORT=3001
FRONTEND_URL=http://localhost:3000

# Set to "true" to use mock data without real API credentials
MOCK_MODE=true

# Optional – Supabase for persistent token storage
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

---

## Inventory Sync Flow

```
User sets new quantity in Inventory page
         │
         ▼
POST /api/inventory/sync
  { sku, quantity, tiktok_product_id, shopee_item_id }
         │
   ┌─────┴─────┐
   │           │
TikTok       Shopee
PUT /product  POST /product
/inventory    /update_stock
   │           │
   └─────┬─────┘
         ▼
{ tiktok: { success }, shopee: { success } }
         │
         ▼
Live sync status badges shown in UI
```

---

## API Endpoints

| Method | Path                        | Description                         |
|--------|-----------------------------|-------------------------------------|
| GET    | `/api/session`              | Check which platforms are connected |
| GET    | `/auth/tiktok`              | Start TikTok OAuth flow             |
| GET    | `/auth/shopee`              | Start Shopee OAuth flow             |
| GET    | `/api/orders`               | Unified order list                  |
| GET    | `/api/products`             | Product list (both platforms)       |
| GET    | `/api/inventory`            | Unified inventory by SKU            |
| POST   | `/api/inventory/sync`       | Sync stock to both platforms        |
| POST   | `/api/inventory/sync-bulk`  | Bulk sync multiple SKUs             |
| POST   | `/api/logout`               | Clear session                       |

All error responses follow: `{ error, code, platform }`

---

## Supabase (Optional)

For persistent OAuth token storage (so tokens survive server restarts):

1. Create a free project at [supabase.com](https://supabase.com)
2. Create a `sessions` table (or use any KV-style approach)
3. Wire `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `.env`
4. Update `server.js` to use a Supabase-backed session store

---

## TODO Before Production

- [ ] Implement TikTok token refresh in `middleware/auth.js`
- [ ] Add Supabase session store for persistent tokens
- [ ] Handle TikTok + Shopee API pagination for large catalogs
- [ ] Add HTTPS / reverse proxy (nginx/Caddy) in production
- [ ] Set `SESSION_SECRET` to a cryptographically random value
- [ ] Set `cookie.secure = true` in `server.js` when behind HTTPS
- [ ] Add rate limiting middleware (e.g., `express-rate-limit`)
- [ ] Build SKU auto-matching logic for cross-platform merging
