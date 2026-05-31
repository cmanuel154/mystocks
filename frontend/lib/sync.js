/**
 * lib/sync.js — Central Firestore writer.
 *
 * All platform data is normalised here before touching Firestore.
 * Every writeOrder call:
 *   1. Writes the order document (merge-safe dedup)
 *   2. Upserts the customer record
 *   3. Fire-and-forgets stock_movements for each item
 * Every writeProducts call batch-writes with ≤400 docs per batch.
 * writeSyncLog is called after every platform sync.
 */

import { getDb }      from './firebase.js';
import { FieldValue }  from 'firebase-admin/firestore';

// ── Deterministic document IDs ────────────────────────────────────────────────

export const makeOrderId    = (u, p, id) => `${u}_${p}_${id}`;
export const makeProductId  = (u, p, id) => `${u}_${p}_${id}`;
export const makeCustomerId = (u, buyerId, name) => {
  const key = buyerId ?? String(name ?? 'unknown').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `${u}_${key}`;
};

// ── Normalisers ───────────────────────────────────────────────────────────────

export function fromTikTokOrder(userId, o) {
  return {
    user_id:           userId,
    platform:          'tiktok',
    platform_order_id: o.id,
    buyer_id:          o.buyer_id    ?? null,
    buyer_name:        o.buyer       ?? null,
    buyer_region:      o.buyer_region ?? null,
    items: (o.items ?? []).map(i => ({
      product_id: i.product_id ?? null,
      sku:        i.sku        ?? null,
      name:       i.name       ?? null,
      variant:    i.variant    ?? null,
      qty:        i.qty        ?? 1,
      unit_price: i.price      ?? 0,
    })),
    subtotal:   o.total    ?? 0,
    shipping:   o.shipping ?? 0,
    total:      o.total    ?? 0,
    currency:   o.currency ?? 'IDR',
    status:     o.status,
    created_at: o.created_at ? new Date(o.created_at) : new Date(),
    synced_at:  new Date(),
  };
}

export function fromTikTokProduct(userId, p) {
  return {
    user_id:             userId,
    platform:            'tiktok',
    platform_product_id: p.id,
    sku:                 p.sku      ?? null,
    name:                p.name,
    category:            p.category ?? null,
    variants: [{
      name:       'default',
      sku:        p.sku   ?? null,
      cost_price: null,
      sell_price: p.price ?? 0,
      stock:      p.stock ?? 0,
    }],
    images:     p.image ? [p.image] : [],
    is_active:  p.status === 'ACTIVATE',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

export function fromManualOrder(userId, b) {
  const now = new Date();
  return {
    user_id:           userId,
    platform:          'manual',
    platform_order_id: `manual-${Date.now()}`,
    buyer_id:          null,
    buyer_name:        b.buyer_name   ?? null,
    buyer_region:      b.buyer_region ?? null,
    items: (b.items ?? []).map(i => ({
      product_id: i.product_id ?? null,
      sku:        i.sku        ?? null,
      name:       i.name,
      variant:    i.variant    ?? null,
      qty:        Number(i.qty)        || 1,
      unit_price: Number(i.unit_price) || 0,
    })),
    subtotal:   Number(b.subtotal)  || 0,
    shipping:   Number(b.shipping)  || 0,
    total:      Number(b.total)     || 0,
    currency:   b.currency ?? 'IDR',
    status:     b.status   ?? 'COMPLETED',
    created_at: b.created_at ? new Date(b.created_at) : now,
    synced_at:  now,
  };
}

export function fromManualProduct(userId, b) {
  const now = new Date();
  return {
    user_id:             userId,
    platform:            'manual',
    platform_product_id: `manual-${Date.now()}`,
    sku:      b.sku      ?? null,
    name:     b.name,
    category: b.category ?? null,
    variants: (b.variants ?? []).map(v => ({
      name:       v.name       ?? 'default',
      sku:        v.sku        ?? b.sku ?? null,
      cost_price: Number(v.cost_price) || null,
      sell_price: Number(v.sell_price) || 0,
      stock:      Number(v.stock)      || 0,
    })),
    images:    b.images ?? [],
    is_active: b.is_active !== false,
    created_at: now,
    updated_at: now,
  };
}

// ── Write helpers ─────────────────────────────────────────────────────────────

/** Write one order + customer upsert. Stock movements run async. */
export async function writeOrder(userId, order) {
  const db    = getDb();
  const docId = makeOrderId(userId, order.platform, order.platform_order_id);
  const batch = db.batch();

  batch.set(db.collection('orders').doc(docId), order, { merge: true });

  const custId  = makeCustomerId(userId, order.buyer_id, order.buyer_name);
  batch.set(db.collection('customers').doc(custId), {
    user_id:      userId,
    platforms:    FieldValue.arrayUnion(order.platform),
    platform_ids: { [order.platform]: order.buyer_id ?? null },
    name:         order.buyer_name,
    total_orders: FieldValue.increment(1),
    total_spend:  FieldValue.increment(order.total ?? 0),
    last_order_at: order.created_at,
    tags:         [],
    updated_at:   new Date(),
  }, { merge: true });

  await batch.commit();

  // Stock movements — non-critical, run in background
  _writeMovements(userId, order, docId).catch(
    err => console.error('[sync] movements error:', err.message)
  );

  return docId;
}

/** Batch-write multiple orders. */
export async function writeOrders(userId, orders) {
  await Promise.all(
    orders.map(o => writeOrder(userId, o).catch(
      err => console.error('[sync] writeOrder failed:', o.platform_order_id, err.message)
    ))
  );
}

/** Write one product document. */
export async function writeProduct(userId, product) {
  const db    = getDb();
  const docId = makeProductId(userId, product.platform, product.platform_product_id);
  await db.collection('products').doc(docId).set(product, { merge: true });
  return docId;
}

/** Batch-write products (≤400 per Firestore batch). */
export async function writeProducts(userId, products) {
  const db = getDb();
  for (let i = 0; i < products.length; i += 400) {
    const batch = db.batch();
    for (const p of products.slice(i, i + 400)) {
      const docId = makeProductId(userId, p.platform, p.platform_product_id);
      batch.set(db.collection('products').doc(docId), p, { merge: true });
    }
    await batch.commit();
  }
}

/** Record a manual stock adjustment. Updates product.variants[0].stock if product_id given. */
export async function writeStockAdjustment(userId, { product_id, sku, qty_change, type = 'adjustment', note = '' }) {
  const db  = getDb();
  const ref = db.collection('stock_movements').doc();
  await ref.set({
    user_id:    userId,
    product_id: product_id ?? null,
    sku:        sku        ?? null,
    type,
    qty_change: Number(qty_change),
    qty_after:  null,
    platform:   'manual',
    order_id:   null,
    note,
    created_at: new Date(),
  });
  if (product_id) {
    db.collection('products').doc(product_id)
      .update({ 'variants.0.stock': FieldValue.increment(Number(qty_change)), updated_at: new Date() })
      .catch(() => {});
  }
  return ref.id;
}

/** Write a sync log entry after every platform fetch. */
export async function writeSyncLog({ userId, platform, type, status, recordsSynced = 0, errorMessage = null }) {
  const ref = getDb().collection('sync_logs').doc();
  await ref.set({ user_id: userId, platform, type, status, records_synced: recordsSynced, error_message: errorMessage, created_at: new Date() });
  return ref.id;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _writeMovements(userId, order, orderDocId) {
  if (!order.items?.length) return;
  const db    = getDb();
  const batch = db.batch();
  const now   = new Date();
  for (const item of order.items) {
    const ref = db.collection('stock_movements').doc();
    batch.set(ref, {
      user_id:    userId,
      product_id: item.product_id ? makeProductId(userId, order.platform, item.product_id) : null,
      sku:        item.sku ?? null,
      type:       'sale',
      qty_change: -(item.qty ?? 1),
      qty_after:  null,
      platform:   order.platform,
      order_id:   orderDocId,
      note:       `Auto from ${order.platform} order ${order.platform_order_id}`,
      created_at: now,
    });
  }
  await batch.commit();
}
