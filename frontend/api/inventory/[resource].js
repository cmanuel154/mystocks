import { getDb }        from '../../lib/firebase.js';
import { FieldValue }   from 'firebase-admin/firestore';
import { getUserIdFromRequest } from '../../lib/auth.js';
import { getShopeeToken, shopeeRequest } from '../../lib/shopeeApi.js';
import { getTikTokToken, tiktokRequest } from '../../lib/tiktokApi.js';
import { getMasterStok, getLogMasuk } from '../../lib/googleSheets.js';

// ── Derived calculations ───────────────────────────────────────────────────────
function calc(doc) {
  const initial_stock = doc.initial_stock ?? 0;
  const total_in      = doc.total_in      ?? 0;
  const total_out     = doc.total_out     ?? 0;
  const current_stock = initial_stock + total_in - total_out;
  const shopee_pct    = doc.shopee_pct ?? 80;
  const tiktok_pct    = 100 - shopee_pct;
  const shopee_qty    = Math.max(0, Math.floor(current_stock * shopee_pct / 100));
  const tiktok_qty    = Math.max(0, current_stock - shopee_qty);
  const status        = current_stock <= 0 ? 'HABIS'
                      : current_stock < (doc.min_stock ?? 0) ? 'RESTOK'
                      : 'AMAN';
  return { ...doc, current_stock, shopee_pct, tiktok_pct, shopee_qty, tiktok_qty, status };
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED = [
  { sku:'RL-001',  name:'Regular Lashes G1',      initial_stock:51,  total_in:375, total_out:51,  min_stock:100 },
  { sku:'RL-002',  name:'Regular Lashes G2',      initial_stock:0,   total_in:0,   total_out:0,   min_stock:50  },
  { sku:'RL-003',  name:'Regular Lashes G3',      initial_stock:116, total_in:0,   total_out:75,  min_stock:50  },
  { sku:'RL-004',  name:'Regular Lashes G4',      initial_stock:0,   total_in:875, total_out:0,   min_stock:500 },
  { sku:'RL-005',  name:'Regular Lashes G5',      initial_stock:6,   total_in:575, total_out:6,   min_stock:250 },
  { sku:'RL-007',  name:'Regular Lashes G7',      initial_stock:61,  total_in:0,   total_out:61,  min_stock:50  },
  { sku:'RL-010',  name:'Regular Lashes G10',     initial_stock:321, total_in:0,   total_out:321, min_stock:500 },
  { sku:'RL-0103', name:'Regular Lashes G103D',   initial_stock:0,   total_in:1000,total_out:114, min_stock:500 },
  { sku:'RL-038',  name:'Regular Lashes G38',     initial_stock:0,   total_in:675, total_out:0,   min_stock:500 },
  { sku:'PL-10',   name:'Premium Lashes G10 isi5',initial_stock:29,  total_in:0,   total_out:29,  min_stock:10  },
  { sku:'PL-11',   name:'Premium Lashes G11',     initial_stock:63,  total_in:0,   total_out:7,   min_stock:10  },
  { sku:'PL-51',   name:'Premium Lashes V51',     initial_stock:0,   total_in:371, total_out:98,  min_stock:10  },
  { sku:'PL-27',   name:'Premium Lashes G27',     initial_stock:0,   total_in:142, total_out:14,  min_stock:10  },
  { sku:'PL-46',   name:'Premium Lashes G46',     initial_stock:3,   total_in:113, total_out:39,  min_stock:10  },
  { sku:'PL-32',   name:'Premium Lashes 3DG2',    initial_stock:0,   total_in:0,   total_out:0,   min_stock:5   },
  { sku:'GG-LB',   name:'GGRG Lower Barbie',      initial_stock:0,   total_in:15,  total_out:0,   min_stock:5   },
  { sku:'GG-LL',   name:'GGRG LL01',              initial_stock:0,   total_in:20,  total_out:1,   min_stock:5   },
  { sku:'GG-32',   name:'GGRG M32',               initial_stock:0,   total_in:30,  total_out:0,   min_stock:5   },
  { sku:'GG-ID',   name:'GGRG Idol',              initial_stock:0,   total_in:10,  total_out:0,   min_stock:5   },
  { sku:'GG-59',   name:'GGRG M59',               initial_stock:2,   total_in:15,  total_out:0,   min_stock:5   },
  { sku:'GG-27',   name:'GGRG NN27',              initial_stock:18,  total_in:20,  total_out:4,   min_stock:5   },
  { sku:'GG-01',   name:'GGRG Cartoon',           initial_stock:3,   total_in:0,   total_out:3,   min_stock:5   },
  { sku:'GG-35',   name:'GGRG M35',               initial_stock:0,   total_in:30,  total_out:1,   min_stock:5   },
  { sku:'GG-37',   name:'GGRG M37',               initial_stock:0,   total_in:30,  total_out:16,  min_stock:5   },
  { sku:'GG-40',   name:'GGRG M40',               initial_stock:0,   total_in:15,  total_out:1,   min_stock:5   },
  { sku:'GG-11',   name:'GGRG FK11',              initial_stock:2,   total_in:20,  total_out:6,   min_stock:5   },
  { sku:'GG-26',   name:'GGRG FK26',              initial_stock:0,   total_in:40,  total_out:5,   min_stock:5   },
  { sku:'HQ-01',   name:'Haquhara Peach',         initial_stock:60,  total_in:0,   total_out:31,  min_stock:10  },
  { sku:'HQ-02',   name:'Haquhara Orange',        initial_stock:51,  total_in:0,   total_out:16,  min_stock:10  },
  { sku:'RD-01',   name:'Ruhee Hibrow',           initial_stock:45,  total_in:171, total_out:36,  min_stock:50  },
  { sku:'KK-01',   name:'Kylise Marylin',         initial_stock:54,  total_in:0,   total_out:3,   min_stock:18  },
  { sku:'KK-02',   name:'Kylise Dara',            initial_stock:26,  total_in:0,   total_out:3,   min_stock:19  },
  { sku:'KK-03',   name:'Kylise Nova',            initial_stock:146, total_in:0,   total_out:7,   min_stock:20  },
  { sku:'KK-04',   name:'Kylise Zahra',           initial_stock:0,   total_in:0,   total_out:0,   min_stock:21  },
  { sku:'KK-05',   name:'Kylise Sveta',           initial_stock:0,   total_in:0,   total_out:0,   min_stock:21  },
  { sku:'HP',      name:'Hojo Pink',              initial_stock:17,  total_in:0,   total_out:0,   min_stock:10  },
  { sku:'HG',      name:'Hojo Gold',              initial_stock:31,  total_in:0,   total_out:1,   min_stock:10  },
  { sku:'HS',      name:'Hojo Silver',            initial_stock:18,  total_in:0,   total_out:2,   min_stock:10  },
  { sku:'BB-011',  name:'Beauty Blender 1pcs',    initial_stock:250, total_in:0,   total_out:38,  min_stock:5   },
  { sku:'BB-012',  name:'Beauty Blender 2pcs',    initial_stock:100, total_in:0,   total_out:60,  min_stock:5   },
  { sku:'BB-013',  name:'Beauty Blender 3pcs',    initial_stock:100, total_in:0,   total_out:60,  min_stock:5   },
  { sku:'EL-01',   name:'Eyelid 3M',              initial_stock:200, total_in:0,   total_out:84,  min_stock:50  },
  { sku:'EL-02',   name:'Eyelid Jaring',          initial_stock:200, total_in:0,   total_out:79,  min_stock:50  },
  { sku:'LB',      name:'Lakban',                 initial_stock:51,  total_in:0,   total_out:0,   min_stock:5   },
  { sku:'PK',      name:'Polymailer Kecil',       initial_stock:1,  total_in:0,   total_out:0,   min_stock:5   },
  { sku:'PB',      name:'Polymailer Besar',       initial_stock:0,   total_in:0,   total_out:0,   min_stock:27  },
  { sku:'ZL',      name:'Ziplock',                initial_stock:100, total_in:0,   total_out:0,   min_stock:10  },
  { sku:'KR',      name:'Kertas Resi',            initial_stock:39,  total_in:0,   total_out:0,   min_stock:5   },
  { sku:'KD-20',   name:'Kardus 20',              initial_stock:15,  total_in:0,   total_out:0,   min_stock:5   },
  { sku:'KD-10',   name:'Kardus 10',              initial_stock:50,  total_in:0,   total_out:0,   min_stock:10  },
  { sku:'KD-5',    name:'Kardus 5',               initial_stock:100, total_in:0,   total_out:0,   min_stock:20  },
  { sku:'KD-BB',   name:'Kardus BB',              initial_stock:50,  total_in:0,   total_out:0,   min_stock:20  },
].map(s => ({ shopee_pct: 80, shopee_item_id: '', tiktok_product_id: '', ...s }));

async function syncSkuToShopee(item, userId) {
  if (!item.shopee_item_id) return null;
  try {
    const tokenData = await getShopeeToken(userId);
    if (!tokenData) return { error: 'Shopee not connected' };
    const data = await shopeeRequest('/api/v2/product/update_stock', {
      item_id:    Number(item.shopee_item_id),
      stock_list: [{ model_id: 0, normal_stock: item.shopee_qty }],
    }, tokenData.accessToken, tokenData.shopId);
    return data;
  } catch (err) {
    console.warn(`[Inventory] Shopee sync failed for ${item.sku}:`, err.message);
    return { error: err.message };
  }
}

export default async function handler(req, res) {
  const { resource } = req.query;
  const db = getDb();
  const userId = getUserIdFromRequest(req);

  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  // ── GET /api/inventory/list ──────────────────────────────────────────────────
  if (resource === 'list') {
    const snap = await db.collection('inventory').get();

    if (snap.empty) {
      console.log('[Inventory] Seeding initial data…');
      const batch = db.batch();
      for (const s of SEED) {
        batch.set(db.collection('inventory').doc(s.sku), { ...s, created_at: FieldValue.serverTimestamp() });
      }
      await batch.commit();
      const seeded = SEED.map(s => calc(s));
      return res.status(200).json({ items: seeded, seeded: true });
    }

    const items = snap.docs.map(d => calc(d.data())).sort((a, b) => a.sku.localeCompare(b.sku));
    return res.status(200).json({ items });
  }

  // ── POST /api/inventory/stock-in ─────────────────────────────────────────────
  if (resource === 'stock-in') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { sku, qty, date, supplier, harga_beli, shipping_per_pcs, packing, admin } = req.body ?? {};
    if (!sku || !qty) return res.status(400).json({ error: 'sku and qty required' });

    const hpp_per_pcs = (Number(harga_beli) || 0) + (Number(shipping_per_pcs) || 0)
                      + (Number(packing) || 0) + (Number(admin) || 0);

    const ref = db.collection('inventory').doc(sku);
    const inventoryUpdate = { total_in: FieldValue.increment(Number(qty)) };
    if (hpp_per_pcs > 0) {
      inventoryUpdate.latest_hpp         = hpp_per_pcs;
      inventoryUpdate.latest_harga_beli  = Number(harga_beli) || 0;
    }
    await ref.update(inventoryUpdate);

    await db.collection('stock_logs').add({
      sku, type: 'IN', qty: Number(qty),
      date:             date ?? new Date().toISOString().slice(0, 10),
      supplier:         supplier ?? '',
      harga_beli:       Number(harga_beli)       || 0,
      shipping_per_pcs: Number(shipping_per_pcs) || 0,
      packing:          Number(packing)          || 0,
      admin:            Number(admin)            || 0,
      hpp_per_pcs,
      created_at: FieldValue.serverTimestamp(),
    });

    const updated = calc((await ref.get()).data());

    let shopeeResult = null;
    if (updated.shopee_item_id) shopeeResult = await syncSkuToShopee(updated, userId);

    return res.status(200).json({ item: updated, shopee: shopeeResult });
  }

  // ── PUT /api/inventory/settings ──────────────────────────────────────────────
  if (resource === 'settings') {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
    const { sku, initial_stock, min_stock, shopee_pct, shopee_item_id } = req.body ?? {};
    if (!sku) return res.status(400).json({ error: 'sku required' });

    const updates = {};
    if (initial_stock  !== undefined) updates.initial_stock  = Number(initial_stock);
    if (min_stock      !== undefined) updates.min_stock      = Number(min_stock);
    if (shopee_pct     !== undefined) updates.shopee_pct     = Number(shopee_pct);
    if (shopee_item_id !== undefined) updates.shopee_item_id = shopee_item_id;

    const ref = db.collection('inventory').doc(sku);
    await ref.update({ ...updates, updated_at: FieldValue.serverTimestamp() });

    const updated = calc((await ref.get()).data());
    if (updated.shopee_item_id) await syncSkuToShopee(updated, userId);

    return res.status(200).json({ item: updated });
  }

  // ── POST /api/inventory/sync-shopee ──────────────────────────────────────────
  if (resource === 'sync-shopee') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const snap = await db.collection('inventory').get();
    const items = snap.docs.map(d => calc(d.data())).filter(i => i.shopee_item_id);

    let synced = 0;
    const errors = [];
    for (const item of items) {
      const result = await syncSkuToShopee(item, userId);
      if (result?.error) errors.push({ sku: item.sku, error: result.error });
      else synced++;
    }
    return res.status(200).json({ synced, total: items.length, errors });
  }

  // ── GET /api/inventory/sync-sheets ─────────────────────────────────────────
  if (resource === 'sync-sheets') {
    const errors = [];

    let masterRows, logRows;
    try {
      [masterRows, logRows] = await Promise.all([getMasterStok(), getLogMasuk()]);
    } catch (err) {
      return res.status(500).json({ error: `Google Sheets fetch failed: ${err.message}` });
    }
    console.log(`[Sheets sync] master=${masterRows.length} rows, logs=${logRows.length} rows`);

    const totalInMap = {};
    const latestHppMap = {};
    const latestHargaBeliMap = {};
    for (const row of logRows) {
      if (!row.sku) continue;
      totalInMap[row.sku]         = (totalInMap[row.sku] ?? 0) + row.jumlah_masuk;
      if (row.hpp_per_pcs > 0)    latestHppMap[row.sku] = row.hpp_per_pcs;
      if (row.harga_beli > 0)     latestHargaBeliMap[row.sku] = row.harga_beli;
    }

    let synced_skus = 0;
    const updatedDocs = [];
    for (const row of masterRows) {
      try {
        const total_in      = totalInMap[row.sku] ?? 0;
        const existing      = (await db.collection('inventory').doc(row.sku).get()).data() ?? {};
        const total_out     = existing.total_out ?? 0;
        const current_stock = row.stok_awal + total_in - total_out;
        const shopee_pct    = existing.shopee_pct ?? 80;
        const tiktok_pct    = 100 - shopee_pct;
        const shopee_qty    = Math.floor(total_in * shopee_pct / 100);
        const tiktok_qty    = Math.floor(total_in * tiktok_pct / 100);
        const status        = current_stock <= 0 ? 'HABIS'
                            : current_stock < (existing.min_stock ?? 10) ? 'RESTOK'
                            : 'AMAN';

        const doc = {
          sku:           row.sku,
          name:          row.nama_produk,
          harga_jual:    row.harga_jual,
          shopee_qty,
          tiktok_qty,
          lokasi_rak:    row.lokasi_rak,
          initial_stock: row.stok_awal,
          stok_awal:     row.stok_awal,
          total_in,
          current_stock,
          shopee_pct,
          tiktok_pct,
          min_stock:     existing.min_stock ?? 10,
          status,
          shopee_item_id: existing.shopee_item_id ?? '',
          source:        'google_sheets',
          last_synced_at: FieldValue.serverTimestamp(),
        };
        if (latestHppMap[row.sku])       doc.latest_hpp = latestHppMap[row.sku];
        if (latestHargaBeliMap[row.sku]) doc.latest_harga_beli = latestHargaBeliMap[row.sku];

        await db.collection('inventory').doc(row.sku).set(doc, { merge: true });
        synced_skus++;
        updatedDocs.push(doc);
      } catch (err) {
        errors.push(`SKU ${row.sku}: ${err.message}`);
      }
    }

    let synced_logs = 0;
    for (const row of logRows) {
      try {
        const docId = `${row.sku}_${row.tanggal.replace(/\//g, '-')}`;
        await db.collection('stock_logs').doc(docId).set({
          sku: row.sku, type: 'IN', qty: row.jumlah_masuk,
          date: row.tanggal, supplier: row.supplier,
          harga_beli: row.harga_beli, shipping_per_pcs: row.shipping_per_pcs,
          packing: row.packing, admin: row.admin, hpp_per_pcs: row.hpp_per_pcs,
          source: 'google_sheets',
        }, { merge: true });
        synced_logs++;
      } catch (err) {
        errors.push(`Log ${row.sku} ${row.tanggal}: ${err.message}`);
      }
    }

    let shopee_pushed = 0;
    const shopee_errors = [];
    for (const doc of updatedDocs) {
      if (!doc.shopee_item_id) continue;
      const result = await syncSkuToShopee(doc, userId);
      if (result?.error) shopee_errors.push({ sku: doc.sku, error: result.error });
      else shopee_pushed++;
    }

    console.log(`[Sheets sync] done — skus=${synced_skus}, logs=${synced_logs}, shopee=${shopee_pushed}, errors=${errors.length}`);
    return res.status(200).json({ synced_skus, synced_logs, shopee_pushed, shopee_errors, errors });
  }

  return res.status(404).json({ error: `Unknown resource: ${resource}` });
}
