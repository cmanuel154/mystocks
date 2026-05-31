/**
 * lib/bigquery.js — BigQuery client and nightly Firestore mirror.
 *
 * Uses the same GCP service account as Firebase Admin.
 * The service account needs:
 *   BigQuery Data Editor + BigQuery Job User
 * in project api-maps-188304.
 */

import { BigQuery } from '@google-cloud/bigquery';

const DATASET = 'mystocks';
let _bq = null;

export function getBigQuery() {
  if (_bq) return _bq;
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID) { const e = new Error('BQ env vars not set'); e.code = 'BQ_NOT_CONFIGURED'; throw e; }
  _bq = new BigQuery({
    projectId: FIREBASE_PROJECT_ID,
    location:  'asia-southeast2',
    credentials: { client_email: FIREBASE_CLIENT_EMAIL, private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  });
  return _bq;
}

// ── Table schemas ─────────────────────────────────────────────────────────────

const SCHEMAS = {
  orders: [
    { name:'order_id',           type:'STRING'    }, { name:'user_id',           type:'STRING'    },
    { name:'platform',           type:'STRING'    }, { name:'platform_order_id', type:'STRING'    },
    { name:'buyer_id',           type:'STRING'    }, { name:'buyer_name',        type:'STRING'    },
    { name:'buyer_region',       type:'STRING'    }, { name:'items_json',        type:'STRING'    },
    { name:'subtotal',           type:'FLOAT64'   }, { name:'shipping',          type:'FLOAT64'   },
    { name:'total',              type:'FLOAT64'   }, { name:'currency',          type:'STRING'    },
    { name:'status',             type:'STRING'    }, { name:'created_at',        type:'TIMESTAMP' },
    { name:'synced_at',          type:'TIMESTAMP' }, { name:'exported_at',       type:'TIMESTAMP' },
  ],
  products: [
    { name:'product_id',          type:'STRING'    }, { name:'user_id',            type:'STRING'    },
    { name:'platform',            type:'STRING'    }, { name:'platform_product_id',type:'STRING'    },
    { name:'sku',                 type:'STRING'    }, { name:'name',               type:'STRING'    },
    { name:'category',            type:'STRING'    }, { name:'variants_json',      type:'STRING'    },
    { name:'total_stock',         type:'INT64'     }, { name:'is_active',          type:'BOOL'      },
    { name:'created_at',          type:'TIMESTAMP' }, { name:'updated_at',         type:'TIMESTAMP' },
    { name:'exported_at',         type:'TIMESTAMP' },
  ],
  customers: [
    { name:'customer_id',    type:'STRING'    }, { name:'user_id',        type:'STRING'    },
    { name:'name',           type:'STRING'    }, { name:'platforms_json', type:'STRING'    },
    { name:'total_orders',   type:'INT64'     }, { name:'total_spend',    type:'FLOAT64'   },
    { name:'last_order_at',  type:'TIMESTAMP' }, { name:'updated_at',     type:'TIMESTAMP' },
    { name:'exported_at',    type:'TIMESTAMP' },
  ],
  stock_movements: [
    { name:'movement_id', type:'STRING'    }, { name:'user_id',     type:'STRING'    },
    { name:'product_id',  type:'STRING'    }, { name:'sku',         type:'STRING'    },
    { name:'type',        type:'STRING'    }, { name:'qty_change',  type:'INT64'     },
    { name:'qty_after',   type:'INT64'     }, { name:'platform',    type:'STRING'    },
    { name:'order_id',    type:'STRING'    }, { name:'note',        type:'STRING'    },
    { name:'created_at',  type:'TIMESTAMP' }, { name:'exported_at', type:'TIMESTAMP' },
  ],
  sync_logs: [
    { name:'log_id',          type:'STRING'    }, { name:'user_id',        type:'STRING'    },
    { name:'platform',        type:'STRING'    }, { name:'type',           type:'STRING'    },
    { name:'status',          type:'STRING'    }, { name:'records_synced', type:'INT64'     },
    { name:'error_message',   type:'STRING'    }, { name:'created_at',     type:'TIMESTAMP' },
    { name:'exported_at',     type:'TIMESTAMP' },
  ],
};

export async function ensureSchema() {
  const bq = getBigQuery();
  const [datasets] = await bq.getDatasets();
  if (!datasets.find(d => d.id === DATASET)) {
    await bq.createDataset(DATASET, { location: 'asia-southeast2' });
    console.log('[BQ] Dataset created:', DATASET);
  }
  const ds = bq.dataset(DATASET);
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const [exists] = await ds.table(name).exists();
    if (!exists) { await ds.table(name).create({ schema }); console.log('[BQ] Table created:', name); }
  }
}

const _ts = v => v?.toDate ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : null;
const now  = () => new Date().toISOString();

async function _insert(tableName, rows) {
  if (!rows.length) return 0;
  await getBigQuery().dataset(DATASET).table(tableName)
    .insert(rows, { skipInvalidRows: true, ignoreUnknownValues: true });
  return rows.length;
}

export async function syncOrdersToBQ(docs) {
  const exp = now();
  return _insert('orders', docs.map(([id, o]) => ({
    order_id: id, user_id: o.user_id, platform: o.platform, platform_order_id: o.platform_order_id,
    buyer_id: o.buyer_id ?? null, buyer_name: o.buyer_name ?? null, buyer_region: o.buyer_region ?? null,
    items_json: JSON.stringify(o.items ?? []),
    subtotal: o.subtotal??0, shipping: o.shipping??0, total: o.total??0, currency: o.currency??'IDR',
    status: o.status, created_at: _ts(o.created_at), synced_at: _ts(o.synced_at), exported_at: exp,
  })));
}

export async function syncProductsToBQ(docs) {
  const exp = now();
  return _insert('products', docs.map(([id, p]) => ({
    product_id: id, user_id: p.user_id, platform: p.platform, platform_product_id: p.platform_product_id,
    sku: p.sku??null, name: p.name, category: p.category??null,
    variants_json: JSON.stringify(p.variants??[]),
    total_stock: (p.variants??[]).reduce((s,v) => s+(v.stock??0), 0),
    is_active: p.is_active!==false,
    created_at: _ts(p.created_at), updated_at: _ts(p.updated_at), exported_at: exp,
  })));
}

export async function syncCustomersToBQ(docs) {
  const exp = now();
  return _insert('customers', docs.map(([id, c]) => ({
    customer_id: id, user_id: c.user_id, name: c.name??null,
    platforms_json: JSON.stringify(c.platforms??[]),
    total_orders: c.total_orders??0, total_spend: c.total_spend??0,
    last_order_at: _ts(c.last_order_at), updated_at: _ts(c.updated_at), exported_at: exp,
  })));
}

export async function syncMovementsToBQ(docs) {
  const exp = now();
  return _insert('stock_movements', docs.map(([id, m]) => ({
    movement_id: id, user_id: m.user_id, product_id: m.product_id??null, sku: m.sku??null,
    type: m.type, qty_change: m.qty_change??0, qty_after: m.qty_after??null,
    platform: m.platform??null, order_id: m.order_id??null, note: m.note??null,
    created_at: _ts(m.created_at), exported_at: exp,
  })));
}

export async function runNightlySync(userId) {
  const { getDb } = await import('./firebase.js');
  const db    = getDb();
  const since = new Date(Date.now() - 25 * 3600 * 1000);
  const rpt   = { orders: 0, products: 0, customers: 0, movements: 0, errors: [] };

  await ensureSchema();

  const _q = async (col, field) => {
    const snap = await db.collection(col).where('user_id','==',userId).where(field,'>=',since).limit(1000).get();
    return snap.docs.map(d => [d.id, d.data()]);
  };

  try { rpt.orders    = await syncOrdersToBQ(   await _q('orders',          'synced_at')); } catch(e) { rpt.errors.push('orders: '+e.message); }
  try { rpt.products  = await syncProductsToBQ( await _q('products',        'updated_at')); } catch(e) { rpt.errors.push('products: '+e.message); }
  try { rpt.customers = await syncCustomersToBQ(await _q('customers',       'updated_at')); } catch(e) { rpt.errors.push('customers: '+e.message); }
  try { rpt.movements = await syncMovementsToBQ(await _q('stock_movements', 'created_at')); } catch(e) { rpt.errors.push('movements: '+e.message); }

  return rpt;
}
