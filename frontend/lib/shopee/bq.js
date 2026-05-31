/**
 * lib/shopee/bq.js — BigQuery sync helpers for Shopee-specific tables.
 * Strategy: DELETE existing rows for shop_id, then streaming INSERT new rows.
 * DELETE is best-effort — if it fails (permissions/billing), INSERT still runs.
 */

import { getBigQuery } from '../bigquery.js';

const DATASET = 'mystocks';

const SHOPEE_SCHEMAS = {
  shopee_orders: [
    { name: 'order_sn',          type: 'STRING'    },
    { name: 'shop_id',           type: 'STRING'    },
    { name: 'user_id',           type: 'STRING'    },
    { name: 'order_status',      type: 'STRING'    },
    { name: 'total_amount',      type: 'FLOAT64'   },
    { name: 'currency',          type: 'STRING'    },
    { name: 'create_time',       type: 'TIMESTAMP' },
    { name: 'update_time',       type: 'TIMESTAMP' },
    { name: 'buyer_username',    type: 'STRING'    },
    { name: 'recipient_address', type: 'STRING'    },
    { name: 'item_list',         type: 'STRING'    },
    { name: 'synced_at',         type: 'TIMESTAMP' },
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
      query:    `DELETE FROM ${fullTable} WHERE shop_id = '${String(shopId).replace(/'/g, "\\'")}'`,
      location: 'asia-southeast2',
    });
    await job.getQueryResults();
    console.log(`[Shopee BQ] DELETE shop_id=${shopId} from ${tableName} — OK`);
  } catch (err) {
    console.warn(`[Shopee BQ] DELETE skipped (${err.message})`);
  }

  // Step 2: INSERT via query job in batches of 50 rows
  const schema    = SHOPEE_SCHEMAS[tableName];
  const cols      = schema.map(f => f.name).join(', ');
  const batchSize = 50;
  let inserted    = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch     = rows.slice(i, i + batchSize);
    const valueRows = batch.map(row => {
      const vals = schema.map(f => {
        const v = row[f.name];
        if (v === null || v === undefined) return 'NULL';
        if (f.type === 'STRING')    return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
        if (f.type === 'TIMESTAMP') return v ? `TIMESTAMP('${v}')` : 'NULL';
        if (f.type === 'DATE')      return v ? `DATE('${v}')` : 'NULL';
        if (f.type === 'FLOAT64')   return isNaN(Number(v)) ? '0.0' : String(Number(v));
        if (f.type === 'INT64')     return String(parseInt(v, 10) || 0);
        if (f.type === 'BOOL')      return v ? 'TRUE' : 'FALSE';
        return `'${String(v)}'`;
      });
      return `SELECT ${vals.join(', ')}`;
    });

    const query = `INSERT INTO ${fullTable} (${cols})\n${valueRows.join('\nUNION ALL\n')}`;
    const [job] = await bq.createQueryJob({ query, location: 'asia-southeast2' });
    await job.getQueryResults();
    inserted += batch.length;
    console.log(`[Shopee BQ] Inserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} rows into ${tableName}`);
  }

  return inserted;
}

// ── Public sync helpers ───────────────────────────────────────────────────────

export async function syncShopeeOrders(orders, shopId, userId) {
  const synced_at = _now();
  const rows = orders.map(o => ({
    order_sn:          String(o.order_sn ?? ''),
    shop_id:           String(shopId),
    user_id:           userId,
    order_status:      o.order_status ?? '',
    total_amount:      Number(o.total_amount ?? 0),
    currency:          o.currency ?? 'IDR',
    create_time:       _ts(o.create_time),
    update_time:       _ts(o.update_time),
    buyer_username:    o.buyer_username ?? '',
    recipient_address: JSON.stringify(o.recipient_address ?? {}),
    item_list:         JSON.stringify(o.item_list ?? []),
    synced_at,
  }));
  return deleteAndInsert('shopee_orders', rows, shopId);
}

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
