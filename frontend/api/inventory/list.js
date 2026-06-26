import { getDb } from '../../lib/firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const db   = getDb();
    const snap = await db.collection('products').get();
    const items = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id:          doc.id,
        name:        d.name        ?? d.item_name ?? '',
        sku:         d.sku         ?? '',
        total_stock: d.total_stock ?? 0,
        variants:    d.variants    ?? [],
        updated_at:  d.updated_at  ?? null,
      };
    });
    return res.status(200).json({ items });
  } catch (err) {
    console.error('[inventory/list] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
