/**
 * lib/shopee/bq.js — BigQuery sync helpers for Shopee-specific tables.
 * Strategy: DELETE existing rows for shop_id, then streaming INSERT new rows.
 * DELETE is best-effort — if it fails (permissions/billing), INSERT still runs.
 */

import { BigQuery } from '@google-cloud/bigquery';
import { getBigQuery } from '../bigquery.js';

const DATASET = 'mystocks';

// Guards the one-time `ALTER TABLE ... ADD COLUMN IF NOT EXISTS escrow_amount` migration so it
// only runs once per cold start.
let migrationDone = false;

const SHOPEE_SCHEMAS = {
  // One row per order line item — powers the Analytics / stock velocity page.
  shopee_orders: [
    { name: 'order_id',     type: 'STRING'    },
    { name: 'platform',     type: 'STRING'    },
    { name: 'order_date',   type: 'TIMESTAMP' },
    { name: 'product_name', type: 'STRING'    },
    { name: 'variant',      type: 'STRING'    },
    { name: 'sku',          type: 'STRING'    },
    { name: 'qty',          type: 'INT64'     },
    { name: 'item_price',   type: 'FLOAT64'   },
    { name: 'revenue',      type: 'FLOAT64'   },
    { name: 'escrow_amount', type: 'FLOAT64'  },
    { name: 'completed_date', type: 'TIMESTAMP' },
    { name: 'status',       type: 'STRING'    },
    { name: 'shop_id',      type: 'STRING'    },
    { name: 'synced_at',    type: 'TIMESTAMP' },
  ],
  shopee_products: [
    { name: 'item_id',       type: 'STRING'    },
    { name: 'shop_id',       type: 'STRING'    },
    { name: 'user_id',       type: 'STRING'    },
    { name: 'item_name',     type: 'STRING'    },
    { name: 'item_status',   type: 'STRING'    },
    { name: 'current_price', type: 'FLOAT64'   },
    { name: 'stock',         type: 'INT64'     },
    { name: 'category_id',   type: 'STRING'    },
    { name: 'create_time',   type: 'TIMESTAMP' },
    { name: 'update_time',   type: 'TIMESTAMP' },
    { name: 'image_url',     type: 'STRING'    },
    { name: 'synced_at',     type: 'TIMESTAMP' },
  ],
  shopee_wallet: [
    { name: 'id',             type: 'STRING'    },
    { name: 'shop_id',        type: 'STRING'    },
    { name: 'user_id',        type: 'STRING'    },
    { name: 'balance',        type: 'FLOAT64'   },
    { name: 'currency',       type: 'STRING'    },
    { name: 'snapshotted_at', type: 'TIMESTAMP' },
    { name: 'synced_at',      type: 'TIMESTAMP' },
  ],
  shopee_transactions: [
    { name: 'transaction_id',   type: 'STRING'    },
    { name: 'shop_id',          type: 'STRING'    },
    { name: 'user_id',          type: 'STRING'    },
    { name: 'transaction_type', type: 'STRING'    },
    { name: 'amount',           type: 'FLOAT64'   },
    { name: 'currency',         type: 'STRING'    },
    { name: 'create_time',      type: 'TIMESTAMP' },
    { name: 'order_sn',         type: 'STRING'    },
    { name: 'synced_at',        type: 'TIMESTAMP' },
  ],
  shopee_escrow: [
    { name: 'order_sn',      type: 'STRING'    },
    { name: 'shop_id',       type: 'STRING'    },
    { name: 'user_id',       type: 'STRING'    },
    { name: 'escrow_amount', type: 'FLOAT64'   },
    { name: 'currency',      type: 'STRING'    },
    { name: 'release_time',  type: 'TIMESTAMP' },
    { name: 'synced_at',     type: 'TIMESTAMP' },
  ],
  // Cash-basis escrow/finance snapshot per order — populated by the escrow backfill cron.
  shopee_order_finance: [
    { name: 'order_sn',       type: 'STRING'    },
    { name: 'shop_id',        type: 'STRING'    },
    { name: 'escrow_amount',  type: 'FLOAT64'   },
    { name: 'completed_date', type: 'TIMESTAMP' },
    { name: 'synced_at',      type: 'TIMESTAMP' },
  ],
  shopee_product_analytics: [
    { name: 'id',              type: 'STRING'    },
    { name: 'item_id',         type: 'STRING'    },
    { name: 'shop_id',         type: 'STRING'    },
    { name: 'user_id',         type: 'STRING'    },
    { name: 'date',            type: 'DATE'      },
    { name: 'impressions',     type: 'INT64'     },
    { name: 'product_views',   type: 'INT64'     },
    { name: 'add_to_cart',     type: 'INT64'     },
    { name: 'purchases',       type: 'INT64'     },
    { name: 'conversion_rate', type: 'FLOAT64'   },
    { name: 'revenue',         type: 'FLOAT64'   },
    { name: 'synced_at',       type: 'TIMESTAMP' },
  ],
};

export async function ensureShopeeSchema() {
  const bq = getBigQuery();
  const ds = bq.dataset(DATASET);
  for (const [name, schema] of Object.entries(SHOPEE_SCHEMAS)) {
    const [exists] = await ds.table(name).exists();
    if (!exists) {
      await ds.table(name).create({ schema });
      console.log('[Shopee BQ] Table created:', name);
    }
  }
}

const _ts  = v => v ? new Date(typeof v === 'number' ? v * 1000 : v).toISOString() : null;
const _now = () => new Date().toISOString();

/** INSERT rows via parameterized query job (no streaming API needed), in batches of 500. */
async function _insertViaQuery(fullTable, schema, rows) {
  if (!rows.length) return 0;

  const bq        = getBigQuery();
  const cols      = schema.map(f => f.name).join(', ');
  const batchSize = 500;
  let inserted    = 0;

  const structType = {};
  for (const f of schema) structType[f.name] = f.type;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const paramRows = batch.map(row => {
      const r = {};
      for (const f of schema) {
        const v = row[f.name];
        if (v === null || v === undefined) { r[f.name] = null; continue; }
        switch (f.type) {
          case 'FLOAT64':   r[f.name] = isNaN(Number(v)) ? 0 : Number(v); break;
          case 'INT64':     r[f.name] = parseInt(v, 10) || 0; break;
          case 'BOOL':      r[f.name] = Boolean(v); break;
          case 'TIMESTAMP': r[f.name] = BigQuery.timestamp(v); break;
          case 'DATE':      r[f.name] = BigQuery.date(v); break;
          default:          r[f.name] = String(v);
        }
      }
      return r;
    });

    const query = `INSERT INTO ${fullTable} (${cols}) SELECT ${cols} FROM UNNEST(@rows)`;
    const [job] = await bq.createQueryJob({
      query,
      params:   { rows: paramRows },
      types:    { rows: [structType] },
      location: 'asia-southeast2',
    });
    await job.getQueryResults();
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Delete existing rows for shopId then INSERT via query job (no streaming API needed).
 */
async function deleteAndInsert(tableName, rows, shopId) {
  if (!rows.length) return 0;

  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.${tableName}\``;

  await ensureShopeeSchema();

  // Step 1: DELETE existing rows (best-effort)
  try {
    const [job] = await bq.createQueryJob({
      query:    `DELETE FROM ${fullTable} WHERE shop_id = @shopId`,
      params:   { shopId: String(shopId) },
      location: 'asia-southeast2',
    });
    await job.getQueryResults();
    console.log(`[Shopee BQ] DELETE shop_id=${shopId} from ${tableName} — OK`);
  } catch (err) {
    console.warn(`[Shopee BQ] DELETE skipped (${err.message})`);
  }

  const inserted = await _insertViaQuery(fullTable, SHOPEE_SCHEMAS[tableName], rows);
  console.log(`[Shopee BQ] Inserted ${inserted} rows into ${tableName}`);
  return inserted;
}

/**
 * CREATE OR REPLACE TABLE shopee_orders with the unified per-line-item schema.
 * One-time migration — drops any existing data in the table.
 */
export async function recreateShopeeOrdersTable() {
  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.shopee_orders\``;
  const cols      = SHOPEE_SCHEMAS.shopee_orders.map(f => `${f.name} ${f.type}`).join(',\n  ');

  const [job] = await bq.createQueryJob({
    query:    `CREATE OR REPLACE TABLE ${fullTable} (\n  ${cols}\n)`,
    location: 'asia-southeast2',
  });
  await job.getQueryResults();
  console.log('[Shopee BQ] shopee_orders recreated with unified schema');
}

/**
 * Upsert order line-item rows into shopee_orders: DELETE WHERE order_id IN (orderSns), then INSERT rows.
 * `rows` are plain objects matching SHOPEE_SCHEMAS.shopee_orders minus `synced_at` (stamped here).
 */
export async function upsertShopeeOrderRows(rows, orderSns) {
  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.shopee_orders\``;
  const synced_at = _now();

  if (!migrationDone) {
    try {
      await bq.dataset(DATASET).table('shopee_orders').query(`
        ALTER TABLE ${fullTable}
        ADD COLUMN IF NOT EXISTS escrow_amount FLOAT64,
        ADD COLUMN IF NOT EXISTS completed_date TIMESTAMP
      `);
    } catch (e) {
      // column may already exist, ignore
    }
    migrationDone = true;
  }

  if (orderSns.length) {
    try {
      const [job] = await bq.createQueryJob({
        query:    `DELETE FROM ${fullTable} WHERE order_id IN UNNEST(@orderSns)`,
        params:   { orderSns: orderSns.map(String) },
        types:    { orderSns: ['STRING'] },
        location: 'asia-southeast2',
      });
      await job.getQueryResults();
    } catch (err) {
      console.warn(`[BQ Sync] DELETE skipped (${err.message})`);
    }
  }

  const inserted = await _insertViaQuery(
    fullTable,
    SHOPEE_SCHEMAS.shopee_orders,
    rows.map(r => ({ ...r, synced_at })),
  );
  console.log(`[BQ Sync] inserted ${inserted} rows into shopee_orders`);
  return inserted;
}

/**
 * Upsert escrow/finance snapshot rows into shopee_order_finance:
 * DELETE WHERE order_sn IN (orderSns) AND shop_id = shopId, then INSERT rows.
 * `rows` are plain objects matching SHOPEE_SCHEMAS.shopee_order_finance.
 */
export async function upsertEscrowRows(rows, orderSns, shopId) {
  if (!rows.length) return { inserted: 0 };

  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.shopee_order_finance\``;

  await ensureShopeeSchema();

  try {
    const [job] = await bq.createQueryJob({
      query:    `DELETE FROM ${fullTable} WHERE order_sn IN UNNEST(@orderSns) AND shop_id = @shopId`,
      params:   { orderSns: orderSns.map(String), shopId: String(shopId) },
      types:    { orderSns: ['STRING'], shopId: 'STRING' },
      location: 'asia-southeast2',
    });
    await job.getQueryResults();
  } catch (err) {
    console.warn(`[Shopee BQ] DELETE skipped (${err.message})`);
  }

  const inserted = await _insertViaQuery(fullTable, SHOPEE_SCHEMAS.shopee_order_finance, rows);
  console.log(`[Shopee BQ] inserted ${inserted} rows into shopee_order_finance`);
  return { inserted };
}

/**
 * Import historical order line-items parsed from Shopee CSV/XLSX exports.
 * Orders whose order_id already exists in shopee_orders are skipped entirely
 * (never overwritten) — only brand-new order_ids are inserted.
 * `rows` are plain objects matching SHOPEE_SCHEMAS.shopee_orders minus `synced_at`.
 */
export async function importHistoricalOrderRows(rows) {
  const totalParsed = rows.length;
  if (!totalParsed) return { totalParsed: 0, skippedDuplicates: 0, inserted: 0 };

  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.shopee_orders\``;

  const orderIds = [...new Set(rows.map(r => r.order_id))];

  const [job] = await bq.createQueryJob({
    query:    `SELECT DISTINCT order_id FROM ${fullTable} WHERE order_id IN UNNEST(@orderIds)`,
    params:   { orderIds },
    types:    { orderIds: ['STRING'] },
    location: 'asia-southeast2',
  });
  const [existingRows] = await job.getQueryResults();
  const existingIds = new Set(existingRows.map(r => r.order_id));

  const newRows = rows.filter(r => !existingIds.has(r.order_id));
  const skippedDuplicates = totalParsed - newRows.length;

  const synced_at = _now();
  const inserted = await _insertViaQuery(
    fullTable,
    SHOPEE_SCHEMAS.shopee_orders,
    newRows.map(r => ({ ...r, synced_at })),
  );

  return { totalParsed, skippedDuplicates, inserted };
}

// ── Public sync helpers ───────────────────────────────────────────────────────

export async function syncShopeeProducts(products, shopId, userId) {
  const synced_at = _now();
  const rows = products.map(p => ({
    item_id:       String(p.item_id ?? ''),
    shop_id:       String(shopId),
    user_id:       userId,
    item_name:     p.item_name ?? '',
    item_status:   p.item_status ?? '',
    current_price: Number(p.price_info?.[0]?.current_price ?? p.current_price ?? 0),
    stock:         parseInt(p.stock_info_v2?.summary_info?.total_reserved_stock ?? p.stock ?? 0),
    category_id:   String(p.category_id ?? ''),
    create_time:   _ts(p.create_time),
    update_time:   _ts(p.update_time),
    image_url:     p.image?.image_url_list?.[0] ?? '',
    synced_at,
  }));
  return deleteAndInsert('shopee_products', rows, shopId);
}

export async function syncShopeeWallet(wallet, shopId, userId) {
  const row = {
    id:             `${shopId}_${Date.now()}`,
    shop_id:        String(shopId),
    user_id:        userId,
    balance:        Number(wallet.wallet_balance ?? 0),
    currency:       wallet.currency ?? 'IDR',
    snapshotted_at: _now(),
    synced_at:      _now(),
  };
  return deleteAndInsert('shopee_wallet', [row], shopId);
}

export async function syncShopeeTransactions(transactions, shopId, userId) {
  const synced_at = _now();
  const rows = transactions.map(t => ({
    transaction_id:   String(t.transaction_id ?? `${shopId}_${t.create_time}`),
    shop_id:          String(shopId),
    user_id:          userId,
    transaction_type: t.transaction_type ?? '',
    amount:           Number(t.amount ?? 0),
    currency:         t.currency ?? 'IDR',
    create_time:      _ts(t.create_time),
    order_sn:         t.order_sn ?? '',
    synced_at,
  }));
  return deleteAndInsert('shopee_transactions', rows, shopId);
}

export async function syncShopeeEscrow(escrows, shopId, userId) {
  const synced_at = _now();
  const rows = escrows.map(e => ({
    order_sn:      String(e.order_sn ?? ''),
    shop_id:       String(shopId),
    user_id:       userId,
    escrow_amount: Number(e.escrow_amount ?? 0),
    currency:      e.currency ?? 'IDR',
    release_time:  _ts(e.release_time),
    synced_at,
  }));
  return deleteAndInsert('shopee_escrow', rows, shopId);
}

export async function syncShopeeAnalytics(analytics, shopId, userId) {
  const synced_at = _now();
  const rows = analytics.map(a => ({
    id:              `${a.item_id}_${a.date}`,
    item_id:         String(a.item_id ?? ''),
    shop_id:         String(shopId),
    user_id:         userId,
    date:            a.date ?? '',
    impressions:     parseInt(a.impressions ?? 0),
    product_views:   parseInt(a.product_views ?? 0),
    add_to_cart:     parseInt(a.add_to_cart ?? 0),
    purchases:       parseInt(a.purchases ?? 0),
    conversion_rate: Number(a.conversion_rate ?? 0),
    revenue:         Number(a.revenue ?? 0),
    synced_at,
  }));
  return deleteAndInsert('shopee_product_analytics', rows, shopId);
}

// ── Financial Report queries ────────────────────────────────────────────────
// Excludes CANCELLED/UNPAID orders (uppercase — matches Shopee order_status values
// as stored by flattenOrderToRows, same convention as the stock-velocity query).

/** Gross revenue, order/item totals, and avg order value for orders completed within [fromDate, toDate] (inclusive, 'YYYY-MM-DD'). */
export async function getFinancialSummary(shopId, fromDate, toDate) {
  const bq           = getBigQuery();
  const project      = process.env.FIREBASE_PROJECT_ID;
  const ordersTable  = `\`${project}.${DATASET}.shopee_orders\``;
  const financeTable = `\`${project}.${DATASET}.shopee_order_finance\``;

  const query = `SELECT
  ROUND(SUM(o.order_revenue), 0) as gross_revenue,
  ROUND(SUM(f.escrow_amount), 0) as net_payout,
  COUNT(DISTINCT o.order_id) as total_orders,
  ROUND(SUM(o.qty), 0) as total_items,
  ROUND(AVG(o.order_revenue), 0) as avg_order_value
FROM (
  SELECT
    order_id,
    MAX(revenue) as order_revenue,
    SUM(qty) as qty
  FROM ${ordersTable}
  WHERE shop_id = @shopId
    AND status NOT IN ('CANCELLED', 'UNPAID', 'Batal')
  GROUP BY order_id
) o
INNER JOIN (
  SELECT order_sn, escrow_amount, completed_date
  FROM ${financeTable}
  WHERE shop_id = @shopId
    AND DATE(completed_date, 'Asia/Jakarta') >= @fromDate
    AND DATE(completed_date, 'Asia/Jakarta') <= @toDate
) f ON o.order_id = f.order_sn`;

  const safeFrom   = fromDate.replace(/[^0-9-]/g, '');
  const safeTo     = toDate.replace(/[^0-9-]/g, '');
  const safeShopId = String(shopId).replace(/[^0-9]/g, '');
  const queryWithDates = query
    .replaceAll('@fromDate', `DATE('${safeFrom}')`)
    .replaceAll('@toDate',   `DATE('${safeTo}')`)
    .replaceAll('@shopId',   `'${safeShopId}'`);
  const [job] = await bq.createQueryJob({
    query:    queryWithDates,
    location: 'asia-southeast2',
  });
  const [rows] = await job.getQueryResults();
  const row = rows[0] ?? {};
  return {
    gross_revenue:   Number(row.gross_revenue ?? 0),
    net_payout:      Number(row.net_payout ?? 0),
    total_orders:    Number(row.total_orders ?? 0),
    total_items:     Number(row.total_items ?? 0),
    avg_order_value: Number(row.avg_order_value ?? 0),
  };
}

/** Whitelisted SQL fragments for trend bucketing — never interpolate `granularity` directly. */
const TREND_PERIOD_EXPR = {
  daily:   "FORMAT_TIMESTAMP('%Y-%m-%d', f.completed_date , 'Asia/Jakarta')",
  weekly:  "FORMAT_DATE('%G-W%V', DATE(f.completed_date , 'Asia/Jakarta'))",
  monthly: "FORMAT_TIMESTAMP('%Y-%m', f.completed_date , 'Asia/Jakarta')",
  yearly:  "FORMAT_TIMESTAMP('%Y', f.completed_date , 'Asia/Jakarta')",
};

/** Revenue/order/item trend bucketed by `granularity` for orders completed within [fromDate, toDate] (inclusive, 'YYYY-MM-DD'). */
export async function getFinancialTrend(shopId, fromDate, toDate, granularity) {
  const bq           = getBigQuery();
  const project      = process.env.FIREBASE_PROJECT_ID;
  const ordersTable  = `\`${project}.${DATASET}.shopee_orders\``;
  const financeTable = `\`${project}.${DATASET}.shopee_order_finance\``;
  const periodExpr   = TREND_PERIOD_EXPR[granularity] ?? TREND_PERIOD_EXPR.monthly;

  const query = `SELECT
  ${periodExpr} as period,
  ROUND(SUM(o.order_revenue), 0) as gross_revenue,
  ROUND(SUM(f.escrow_amount), 0) as net_payout,
  COUNT(DISTINCT o.order_id) as orders,
  SUM(o.qty) as items_sold
FROM (
  SELECT order_id, MAX(revenue) as order_revenue, SUM(qty) as qty
  FROM ${ordersTable}
  WHERE shop_id = @shopId
    AND status NOT IN ('CANCELLED', 'UNPAID', 'Batal')
  GROUP BY order_id
) o
INNER JOIN (
  SELECT order_sn, escrow_amount, completed_date
  FROM ${financeTable}
  WHERE shop_id = @shopId
    AND DATE(completed_date, 'Asia/Jakarta') >= @fromDate
    AND DATE(completed_date, 'Asia/Jakarta') <= @toDate
) f ON o.order_id = f.order_sn
GROUP BY period
ORDER BY period ASC`;

  const safeFrom   = fromDate.replace(/[^0-9-]/g, '');
  const safeTo     = toDate.replace(/[^0-9-]/g, '');
  const safeShopId = String(shopId).replace(/[^0-9]/g, '');
  const queryWithDates = query
    .replaceAll('@fromDate', `DATE('${safeFrom}')`)
    .replaceAll('@toDate',   `DATE('${safeTo}')`)
    .replaceAll('@shopId',   `'${safeShopId}'`);
  const [job] = await bq.createQueryJob({
    query:    queryWithDates,
    location: 'asia-southeast2',
  });
  const [rows] = await job.getQueryResults();
  return rows.map(r => ({
    period:        r.period,
    gross_revenue: Number(r.gross_revenue ?? 0),
    net_payout:    Number(r.net_payout ?? 0),
    orders:        Number(r.orders ?? 0),
    items_sold:    Number(r.items_sold ?? 0),
  }));
}

/** Revenue and quantity sold grouped by SKU for orders within [fromDate, toDate] (inclusive, 'YYYY-MM-DD'), sorted by revenue descending. */
export async function getRevenueBySku(shopId, fromDate, toDate) {
  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.shopee_orders\``;

  const query = `SELECT
  sku,
  product_name,
  ROUND(SUM(item_price * qty), 0) as revenue,
  SUM(qty) as qty_sold
FROM ${fullTable}
WHERE shop_id = @shopId
  AND status NOT IN ('CANCELLED', 'UNPAID', 'Batal')
  AND DATE(order_date) >= @fromDate
  AND DATE(order_date) <= @toDate
GROUP BY sku, product_name
ORDER BY revenue DESC`;

  const safeFrom   = fromDate.replace(/[^0-9-]/g, '');
  const safeTo     = toDate.replace(/[^0-9-]/g, '');
  const safeShopId = String(shopId).replace(/[^0-9]/g, '');
  const queryWithDates = query
    .replaceAll('@fromDate', `DATE('${safeFrom}')`)
    .replaceAll('@toDate',   `DATE('${safeTo}')`)
    .replaceAll('@shopId',   `'${safeShopId}'`);
  const [job] = await bq.createQueryJob({
    query:    queryWithDates,
    location: 'asia-southeast2',
  });
  const [rows] = await job.getQueryResults();
  return rows.map(r => ({
    sku:          r.sku,
    product_name: r.product_name,
    revenue:      Number(r.revenue ?? 0),
    qty_sold:     Number(r.qty_sold ?? 0),
  }));
}

/** Top `limit` orders by revenue for orders within [fromDate, toDate] (inclusive, 'YYYY-MM-DD'). */
export async function getTopOrdersByRevenue(shopId, fromDate, toDate, limit = 10) {
  const bq        = getBigQuery();
  const project   = process.env.FIREBASE_PROJECT_ID;
  const fullTable = `\`${project}.${DATASET}.shopee_orders\``;

  const query = `SELECT
  order_id,
  order_date,
  product_name,
  sku,
  qty,
  revenue,
  status
FROM ${fullTable}
WHERE shop_id = @shopId
  AND status NOT IN ('CANCELLED', 'UNPAID', 'Batal')
  AND DATE(order_date) >= @fromDate
  AND DATE(order_date) <= @toDate
ORDER BY revenue DESC
LIMIT @limitVal`;

  const safeFrom   = fromDate.replace(/[^0-9-]/g, '');
  const safeTo     = toDate.replace(/[^0-9-]/g, '');
  const safeShopId = String(shopId).replace(/[^0-9]/g, '');
  const queryWithDates = query
    .replaceAll('@fromDate', `DATE('${safeFrom}')`)
    .replaceAll('@toDate',   `DATE('${safeTo}')`)
    .replaceAll('@shopId',   `'${safeShopId}'`)
    .replaceAll('@limitVal', parseInt(limit, 10) || 10);
  const [job] = await bq.createQueryJob({
    query:    queryWithDates,
    location: 'asia-southeast2',
  });
  const [rows] = await job.getQueryResults();
  return rows.map(r => ({
    order_id:     r.order_id,
    order_date:   r.order_date?.value ?? r.order_date,
    product_name: r.product_name,
    sku:          r.sku,
    qty:          Number(r.qty ?? 0),
    revenue:      Number(r.revenue ?? 0),
    status:       r.status,
  }));
}
