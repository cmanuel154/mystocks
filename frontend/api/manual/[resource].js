/**
 * POST /api/manual/[resource]  →  product | stock | order
 * Manual data entry for non-integrated sales channels.
 */
import { getDb }                  from '../../lib/firebase.js';
import { getUserIdFromRequest }    from '../../lib/auth.js';
import { parseBody, requireFields } from '../../lib/utils.js';
import {
  fromManualOrder, fromManualProduct,
  writeOrder, writeProduct, writeStockAdjustment,
} from '../../lib/sync.js';

const MOCK_ANALYTICS = {
  period_days: 30, total_orders: 8, total_revenue: 1495000, avg_order_value: 299000,
  by_platform: {
    tiktok: { orders: 8, revenue: 1495000, cancelled: 1 },
    shopee: { orders: 0, revenue: 0, cancelled: 0 },
    manual: { orders: 0, revenue: 0, cancelled: 0 },
  },
  top_products: [
    { name: 'Foundation Porcelain Glow', revenue: 780000, units: 4, sku: 'FD-BEIGE-01' },
    { name: 'Lipstik Matte Red Velvet',  revenue: 595000, units: 7, sku: 'LM-RED-01'   },
    { name: 'Blush On Coral Crush',      revenue: 480000, units: 4, sku: 'BO-CORAL-01' },
    { name: 'Setting Spray Dewy Mist',   revenue: 380000, units: 4, sku: 'SS-MIST-01'  },
  ],
  product_count: 4, low_stock_count: 2, generated_at: new Date().toISOString(),
};

export default async function handler(req, res) {
  const resource = req.query.resource;

  // ── Merged from api/analytics/combined.js ────────────────────────────────
  if (resource === 'analytics') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (process.env.MOCK_MODE === 'true') return res.status(200).json(MOCK_ANALYTICS);

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const days  = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400 * 1000);

    try {
      const db = getDb();
      const [ordSnap, prodSnap] = await Promise.all([
        db.collection('orders').where('user_id', '==', userId).where('created_at', '>=', since).orderBy('created_at', 'desc').limit(2000).get(),
        db.collection('products').where('user_id', '==', userId).get(),
      ]);

      const orders   = ordSnap.docs.map(d => d.data());
      const products = prodSnap.docs.map(d => d.data());
      const byP      = {};
      let   revenue  = 0;
      let   doneN    = 0;
      const prodMap  = {};

      for (const o of orders) {
        const p = o.platform ?? 'unknown';
        byP[p] ??= { orders: 0, revenue: 0, cancelled: 0 };
        byP[p].orders++;
        const done = ['COMPLETED', 'DELIVERED'].includes(o.status);
        const canc = o.status === 'CANCELLED';
        if (done) { byP[p].revenue += o.total ?? 0; revenue += o.total ?? 0; doneN++; }
        if (canc)   byP[p].cancelled++;
        if (done) {
          for (const i of o.items ?? []) {
            const k = i.name ?? 'Unknown';
            prodMap[k] ??= { name: k, revenue: 0, units: 0, sku: i.sku ?? null };
            prodMap[k].revenue += (i.unit_price ?? 0) * (i.qty ?? 1);
            prodMap[k].units   += i.qty ?? 1;
          }
        }
      }

      const lowStock = products.filter(p => (p.variants ?? []).some(v => (v.stock ?? 0) < 5)).length;

      return res.status(200).json({
        period_days:     days,
        total_orders:    orders.length,
        total_revenue:   revenue,
        avg_order_value: doneN ? Math.round(revenue / doneN) : 0,
        by_platform:     byP,
        top_products:    Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        product_count:   products.length,
        low_stock_count: lowStock,
        generated_at:    new Date().toISOString(),
      });
    } catch (err) {
      console.error('[analytics/combined]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!['product', 'stock', 'order'].includes(resource))
    return res.status(404).json({ error: `Unknown manual resource: ${resource}` });

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = await parseBody(req);

  // ── POST /api/manual/product ─────────────────────────────────────────────────
  if (resource === 'product') {
    const { ok, missing } = requireFields(body, ['name']);
    if (!ok) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
    try {
      const data  = fromManualProduct(userId, body);
      const docId = await writeProduct(userId, data);
      return res.status(201).json({ success: true, product_id: docId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/manual/stock ───────────────────────────────────────────────────
  if (resource === 'stock') {
    const { ok, missing } = requireFields(body, ['qty_change']);
    if (!ok) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
    if (isNaN(Number(body.qty_change)))
      return res.status(400).json({ error: 'qty_change must be a number' });
    try {
      const movId = await writeStockAdjustment(userId, {
        product_id: body.product_id ?? null,
        sku:        body.sku        ?? null,
        qty_change: Number(body.qty_change),
        type:       ['restock','adjustment','manual'].includes(body.type) ? body.type : 'adjustment',
        note:       body.note ?? '',
      });
      return res.status(201).json({ success: true, movement_id: movId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/manual/order ───────────────────────────────────────────────────
  if (resource === 'order') {
    const { ok, missing } = requireFields(body, ['items', 'total']);
    if (!ok) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
    if (!Array.isArray(body.items) || !body.items.length)
      return res.status(400).json({ error: 'items must be a non-empty array' });
    for (const item of body.items) {
      if (!item.name) return res.status(400).json({ error: 'Each item must have a name' });
    }
    try {
      const data  = fromManualOrder(userId, body);
      const docId = await writeOrder(userId, data);
      return res.status(201).json({ success: true, order_id: docId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
