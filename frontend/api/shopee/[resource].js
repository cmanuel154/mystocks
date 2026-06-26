const crypto          = require('crypto');
const { getDb }       = require('../../lib/firebase.js');
const { getBigQuery } = require('../../lib/bigquery.js');
const { FieldValue }  = require('firebase-admin/firestore');
const { getValidToken }  = require('../../lib/shopee/getValidToken.js');
const { shopeeGet, shopeePost } = require('../../lib/shopee/api.js');
const {
  syncShopeeProducts,
  syncShopeeWallet, syncShopeeTransactions, syncShopeeEscrow,
  syncShopeeAnalytics,
  upsertShopeeOrderRows,
  getFinancialSummary, getFinancialTrend, getRevenueBySku,
} = require('../../lib/shopee/bq.js');
const { flattenOrderToRows, runEscrowBackfill } = require('../../lib/shopee/sync.js');

const SHOPEE_USER_ID = 'test_user'; // hardcoded until Phase 1.5 multi-tenant

async function _logSync(type, recordsSynced, errorMessage = null) {
  try {
    await getDb().collection('sync_logs').add({
      user_id: SHOPEE_USER_ID, platform: 'shopee', type,
      records_synced: recordsSynced,
      status: errorMessage ? 'error' : 'success',
      error_message: errorMessage ?? null,
      created_at: FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('[Shopee sync] log write failed:', e.message); }
}

module.exports = async function handler(req, res) {
  const { resource } = req.query;

  if (resource === 'status') {
    return res.status(200).json({
      status:      'ok',
      partner_id:  Number(process.env.SHOPEE_PARTNER_ID) || 2034402,
      shop_id:     Number(process.env.SHOPEE_SHOP_ID)    || 227533197,
      environment: 'sandbox',
    });
  }

  if (resource === 'auth') {
    const partner_id  = Number(process.env.SHOPEE_PARTNER_ID);
    const partner_key = process.env.SHOPEE_PARTNER_KEY;
    const redirect    = process.env.SHOPEE_REDIRECT_URL;
    const base_url    = 'https://partner.shopeemobile.com';
    const path        = '/api/v2/shop/auth_partner';
    const timestamp   = Math.floor(Date.now() / 1000);

    const base_string = `${partner_id}${path}${timestamp}`;
    const sign        = crypto.createHmac('sha256', partner_key).update(base_string).digest('hex');

    console.log('[Shopee auth] base_string:', base_string);
    console.log('[Shopee auth] partner_key_length:', partner_key.length);
    console.log('[Shopee auth] sign:', sign);

    const url = `${base_url}${path}?partner_id=${partner_id}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect)}`;
    return res.redirect(302, url);
  }

  if (resource === 'token-test') {
    const partner_id  = Number(process.env.SHOPEE_PARTNER_ID);
    const partner_key = process.env.SHOPEE_PARTNER_KEY;
    const base_url    = 'https://partner.shopeemobile.com';
    const path        = '/api/v2/shop/get_shop_info';
    const timestamp   = Math.floor(Date.now() / 1000);

    let access_token, shop_id;
    try {
      ({ access_token, shop_id } = await getValidToken(SHOPEE_USER_ID));
      shop_id = Number(shop_id);
    } catch (err) {
      return res.status(401).json({ error: err.message, code: err.code });
    }

    const base_string = `${partner_id}${path}${timestamp}${access_token}${shop_id}`;
    const sign        = crypto.createHmac('sha256', partner_key).update(base_string).digest('hex');
    const url         = `${base_url}${path}?partner_id=${partner_id}&timestamp=${timestamp}&sign=${sign}&shop_id=${shop_id}&access_token=${encodeURIComponent(access_token)}`;

    console.log('[Shopee token-test] userId:', SHOPEE_USER_ID, '| shop_id:', shop_id);
    try {
      const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const responseText = await resp.text();
      let data;
      try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
      return res.status(200).json({ http_status: resp.status, url, response: data });
    } catch (err) {
      console.error('[Shopee token-test] fetch failed');
      console.error('[Shopee token-test] message:', err.message);
      console.error('[Shopee token-test] code:   ', err.code);
      console.error('[Shopee token-test] cause:  ', err.cause);
      console.error('[Shopee token-test] url:    ', url);
      return res.status(500).json({ error: err.message, code: err.code, cause: String(err.cause ?? ''), url });
    }
  }

  if (resource === 'orders' || resource === 'products') {
    const partner_id  = Number(process.env.SHOPEE_PARTNER_ID);
    const partner_key = process.env.SHOPEE_PARTNER_KEY;
    const base_url    = 'https://partner.shopeemobile.com';
    const timestamp   = Math.floor(Date.now() / 1000);

    let access_token, shop_id;
    try {
      ({ access_token, shop_id } = await getValidToken(SHOPEE_USER_ID));
      shop_id = Number(shop_id);
    } catch (err) {
      return res.status(401).json({ error: err.message, code: err.code });
    }

    let path, params;

    if (resource === 'orders') {
      path = '/api/v2/order/get_order_list';
      const time_from = timestamp - (14 * 24 * 60 * 60);
      params = new URLSearchParams({
        partner_id, timestamp, shop_id, access_token,
        time_range_field: 'create_time',
        time_from,
        time_to:   timestamp,
        page_size: 10,
      });
    } else {
      path = '/api/v2/product/get_item_list';
      params = new URLSearchParams({
        partner_id, timestamp, shop_id, access_token,
        offset:      0,
        page_size:   10,
        item_status: 'NORMAL',
      });
    }

    const base_string = `${partner_id}${path}${timestamp}${access_token}${shop_id}`;
    const sign        = crypto.createHmac('sha256', partner_key).update(base_string).digest('hex');
    params.set('sign', sign);

    const url = `${base_url}${path}?${params.toString()}`;
    console.log(`[Shopee ${resource}] base_string:`, base_string);
    console.log(`[Shopee ${resource}] sign:`, sign);
    console.log(`[Shopee ${resource}] GET`, url);

    try {
      const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const responseText = await resp.text();
      let data;
      try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }
      return res.status(200).json({
        debug: { base_string, sign, shop_id, access_token_length: access_token.length },
        http_status: resp.status,
        url,
        response: data,
      });
    } catch (err) {
      console.error(`[Shopee ${resource}] fetch failed`);
      console.error(`[Shopee ${resource}] message:`, err.message);
      console.error(`[Shopee ${resource}] code:   `, err.code);
      console.error(`[Shopee ${resource}] cause:  `, err.cause);
      console.error(`[Shopee ${resource}] url:    `, url);
      return res.status(500).json({ error: err.message, code: err.code, cause: String(err.cause ?? ''), url });
    }
  }

  if (resource === 'debug-sign') {
    const partner_id  = Number(process.env.SHOPEE_PARTNER_ID);
    const partner_key = process.env.SHOPEE_PARTNER_KEY;
    const { code, shop_id = '227533197' } = req.query;
    const base_url = 'https://partner.shopeemobile.com';
    const path     = '/api/v2/auth/token/get';
    const timestamp = Math.floor(Date.now() / 1000);
    const body     = { code, shop_id: Number(shop_id), partner_id };

    const attempts = [
      {
        label:       'attempt1_standard',
        base_string: `${partner_id}${path}${timestamp}`,
        sign_in:     'query',
      },
      {
        label:       'attempt2_explicit_string_cast',
        base_string: `${String(2034402)}${path}${String(timestamp)}`,
        sign_in:     'query',
      },
      {
        label:       'attempt3_sign_in_body',
        base_string: `${partner_id}${path}${timestamp}`,
        sign_in:     'body',
      },
    ].map(a => ({ ...a, sign: crypto.createHmac('sha256', partner_key).update(a.base_string).digest('hex').toUpperCase() }));

    const results = await Promise.all(attempts.map(async (a) => {
      const qs  = new URLSearchParams({ partner_id, timestamp, sign: a.sign_in === 'query' ? a.sign : '' });
      if (a.sign_in === 'query') qs.set('sign', a.sign); else qs.delete('sign');
      const url       = `${base_url}${path}?${qs.toString()}`;
      const sentBody  = a.sign_in === 'body' ? { ...body, sign: a.sign } : body;

      try {
        const resp = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(sentBody),
        });
        const text = await resp.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
        return { label: a.label, base_string: a.base_string, sign: a.sign, url, body_sent: sentBody, http_status: resp.status, response: data };
      } catch (err) {
        console.error(`[Shopee debug-sign] fetch failed (${a.label})`);
        console.error(`[Shopee debug-sign] message:`, err.message);
        console.error(`[Shopee debug-sign] code:   `, err.code);
        console.error(`[Shopee debug-sign] cause:  `, err.cause);
        return { label: a.label, base_string: a.base_string, sign: a.sign, url, error: err.message, code: err.code, cause: String(err.cause ?? '') };
      }
    }));

    return res.status(200).json({
      partner_key_length: partner_key.length,
      key_preview: partner_key.substring(0, 8) + '...' + partner_key.slice(-8),
      timestamp,
      results,
    });
  }

  // ── /api/shopee/sync-orders ──────────────────────────────────────────────────
  if (resource === 'sync-orders') {
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      console.log('[Shopee sync-orders] token:', access_token.slice(0, 10) + '...', '| shop_id:', shop_id);

      const ts      = Math.floor(Date.now() / 1000);
      const WINDOW  = 15 * 24 * 60 * 60; // 15 days in seconds
      const windows = Array.from({ length: 6 }, (_, i) => ({
        time_from: ts - (6 - i) * WINDOW,
        time_to:   ts - (5 - i) * WINDOW,
      }));
      // Last window ends exactly at now
      windows[5].time_to = ts;

      console.log('[Shopee sync-orders] fetching 6 x 15-day windows (90 days total)');

      const allSns = new Set();
      for (const [idx, { time_from, time_to }] of windows.entries()) {
        const listData = await shopeeGet('/api/v2/order/get_order_list', {
          time_range_field: 'create_time',
          time_from,
          time_to,
          page_size: 100,
        }, access_token, shop_id);
        if (idx === 0) console.log('[Shopee sync-orders] window[0] raw response:', JSON.stringify(listData));
        const sns = (listData?.response?.order_list ?? []).map(o => o.order_sn);
        sns.forEach(sn => allSns.add(sn));
        console.log(`[Shopee sync-orders] window[${idx}] time_from=${time_from} time_to=${time_to}: ${sns.length} SNs`);
      }

      const orderSns = [...allSns];
      console.log('[Shopee sync-orders] total unique order SNs:', orderSns.length);

      let orders = [];
      if (orderSns.length) {
        for (let i = 0; i < orderSns.length; i += 50) {
          const batch  = orderSns.slice(i, i + 50);
          const detail = await shopeeGet('/api/v2/order/get_order_detail', {
            order_sn_list: batch.join(','),
          }, access_token, shop_id);
          if (i === 0) console.log('[Shopee sync-orders] get_order_detail raw response (batch 0):', JSON.stringify(detail));
          orders = orders.concat(detail?.response?.order_list ?? []);
        }
      }

      console.log('[Shopee sync-orders] total orders to MERGE into BQ:', orders.length);
      const rows = orders.flatMap(o => flattenOrderToRows(o, shop_id));
      const orderSns = orders.map(o => o.order_sn);
      const count = await upsertShopeeOrderRows(rows, orderSns);
      await _logSync('orders', count);
      return res.status(200).json({ success: true, records_synced: count });
    } catch (err) {
      console.error('[Shopee sync-orders] error:', err.message, err.stack);
      await _logSync('orders', 0, err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── /api/shopee/sync-products ─────────────────────────────────────────────
  if (resource === 'sync-products') {
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      // Fetch item list
      const listData = await shopeeGet('/api/v2/product/get_item_list', {
        offset: 0, page_size: 100, item_status: 'NORMAL',
      }, access_token, shop_id);
      const itemIds = (listData?.response?.item ?? []).map(i => i.item_id);
      console.log('[Shopee sync-products] fetched', itemIds.length, 'item IDs');

      let products = [];
      if (itemIds.length) {
        for (let i = 0; i < itemIds.length; i += 50) {
          const batch = itemIds.slice(i, i + 50);
          const detail = await shopeeGet('/api/v2/product/get_item_base_info', {
            item_id_list: batch.join(','),
          }, access_token, shop_id);
          products = products.concat(detail?.response?.item_list ?? []);
        }
      }
      const count = await syncShopeeProducts(products, shop_id, SHOPEE_USER_ID);
      await _logSync('products', count);
      return res.status(200).json({ success: true, records_synced: count });
    } catch (err) {
      await _logSync('products', 0, err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── /api/shopee/sync-finance ──────────────────────────────────────────────
  if (resource === 'sync-finance') {
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const ts = Math.floor(Date.now() / 1000);
      let total = 0;

      const walletData = await shopeeGet('/api/v2/payment/get_wallet_balance', {}, access_token, shop_id);
      if (walletData?.response) total += await syncShopeeWallet(walletData.response, shop_id, SHOPEE_USER_ID);

      const txData = await shopeeGet('/api/v2/payment/get_transaction_list', {
        page_no: 1, page_size: 100,
        create_time_from: ts - 30 * 86400, create_time_to: ts,
      }, access_token, shop_id);
      const txList = txData?.response?.transaction_list ?? [];
      if (txList.length) total += await syncShopeeTransactions(txList, shop_id, SHOPEE_USER_ID);

      const escrowData = await shopeeGet('/api/v2/payment/get_escrow_list', {
        page_no: 1, page_size: 100, release_time_from: ts - 30 * 86400, release_time_to: ts,
      }, access_token, shop_id);
      const escrowList = escrowData?.response?.escrow_list ?? [];
      if (escrowList.length) total += await syncShopeeEscrow(escrowList, shop_id, SHOPEE_USER_ID);

      await _logSync('finance', total);
      return res.status(200).json({ success: true, records_synced: total });
    } catch (err) {
      await _logSync('finance', 0, err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── /api/shopee/sync-analytics ────────────────────────────────────────────
  if (resource === 'sync-analytics') {
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const ts = Math.floor(Date.now() / 1000);

      // Get product list first
      const listData = await shopeeGet('/api/v2/product/get_item_list', {
        offset: 0, page_size: 50, item_status: 'NORMAL',
      }, access_token, shop_id);
      const itemIds = (listData?.response?.item ?? []).map(i => i.item_id);

      const analytics = [];
      for (const item_id of itemIds) {
        const perfData = await shopeeGet('/api/v2/product/get_item_performance', {
          item_id,
          time_from: ts - 29 * 86400, time_to: ts,
        }, access_token, shop_id);
        const days = perfData?.response?.daily_performance ?? [];
        for (const d of days) {
          analytics.push({
            item_id,
            date:            d.date ?? '',
            impressions:     d.impressions ?? 0,
            product_views:   d.product_views ?? 0,
            add_to_cart:     d.add_to_cart_count ?? 0,
            purchases:       d.purchase_count ?? 0,
            conversion_rate: d.conversion_rate ?? 0,
            revenue:         d.revenue ?? 0,
          });
        }
      }
      const count = analytics.length ? await syncShopeeAnalytics(analytics, shop_id, SHOPEE_USER_ID) : 0;
      await _logSync('analytics', count);
      return res.status(200).json({ success: true, records_synced: count });
    } catch (err) {
      await _logSync('analytics', 0, err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST /api/shopee/accept-order ─────────────────────────────────────────
  if (resource === 'accept-order') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { order_sn } = req.body ?? {};
    if (!order_sn) return res.status(400).json({ error: 'order_sn required' });
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const data = await shopeePost('/api/v2/order/accept_order',
        { order_sn }, access_token, shop_id);
      if (data.error) return res.status(400).json({ success: false, error: data.message ?? data.error });
      return res.status(200).json({ success: true, message: 'Order accepted', data: data.response });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST /api/shopee/ship-order ───────────────────────────────────────────
  if (resource === 'ship-order') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { order_sn, tracking_number, logistics_id } = req.body ?? {};
    if (!order_sn) return res.status(400).json({ error: 'order_sn required' });
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const body = {
        order_sn,
        pickup: { tracking_no: tracking_number ?? '', address_id: null },
        dropoff: { tracking_no: tracking_number ?? '', slug: null, sender_real_name: null },
        non_integrated: { tracking_number: tracking_number ?? '' },
      };
      const data = await shopeePost('/api/v2/logistics/ship_order', body, access_token, shop_id);
      if (data.error) return res.status(400).json({ success: false, error: data.message ?? data.error });
      return res.status(200).json({ success: true, message: 'Order shipped', data: data.response });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST /api/shopee/cancel-order ─────────────────────────────────────────
  if (resource === 'cancel-order') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { order_sn, cancel_reason } = req.body ?? {};
    if (!order_sn) return res.status(400).json({ error: 'order_sn required' });
    const VALID_REASONS = ['OUT_OF_STOCK', 'CUSTOMER_REQUEST', 'UNDELIVERABLE_AREA'];
    if (!VALID_REASONS.includes(cancel_reason)) {
      return res.status(400).json({ error: `cancel_reason must be one of: ${VALID_REASONS.join(', ')}` });
    }
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const data = await shopeePost('/api/v2/order/cancel_order',
        { order_sn, cancel_reason }, access_token, shop_id);
      if (data.error) return res.status(400).json({ success: false, error: data.message ?? data.error });
      return res.status(200).json({ success: true, message: 'Order cancelled', data: data.response });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── GET /api/shopee/summary?period=7|30|month ────────────────────────────────
  if (resource === 'summary') {
    try {
      const period = req.query.period ?? '7';
      const now    = Math.floor(Date.now() / 1000);
      let timeFrom;
      if (period === 'month') {
        const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
        timeFrom = Math.floor(d.getTime() / 1000);
      } else {
        timeFrom = now - Number(period) * 86400;
      }

      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const WINDOW = 15 * 86400;

      // Fetch order SNs across all 15-day windows concurrently
      const windows = [];
      for (let t = timeFrom; t < now; t += WINDOW) windows.push({ from: t, to: Math.min(t + WINDOW, now) });
      const listResults = await Promise.all(windows.map(w =>
        shopeeGet('/api/v2/order/get_order_list', {
          time_range_field: 'create_time', time_from: w.from, time_to: w.to, page_size: 100,
        }, access_token, shop_id)
      ));
      const allSns = [...new Set(listResults.flatMap(r => (r?.response?.order_list ?? []).map(o => o.order_sn)))];

      // Fetch order details + inventory concurrently
      const detailBatches = [];
      for (let i = 0; i < allSns.length; i += 50) {
        detailBatches.push(shopeeGet('/api/v2/order/get_order_detail', {
          order_sn_list: allSns.slice(i, i + 50).join(','),
          response_optional_fields: 'item_list,total_amount,payment_method,buyer_username',
        }, access_token, shop_id));
      }
      const [detailResults, invSnap] = await Promise.all([
        Promise.all(detailBatches),
        getDb().collection('inventory').get(),
      ]);
      const orders = detailResults.flatMap(r => r?.response?.order_list ?? []);

      // Build inventory map: sku → data
      const invMap = {};
      invSnap.docs.forEach(d => { const data = d.data(); if (data.sku) invMap[data.sku] = data; });

      // Revenue aggregation
      const completed = orders.filter(o => o.order_status === 'COMPLETED');
      const cancelled = orders.filter(o => ['CANCELLED','TO_RETURN'].includes(o.order_status));
      const revenue   = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
      const completed_pct = orders.length ? Math.round(completed.length / orders.length * 100) : 0;

      // Orders by status
      const byStatus = (statuses) => orders.filter(o => statuses.includes(o.order_status)).length;
      const orders_by_status = {
        unpaid:    byStatus(['UNPAID']),
        to_ship:   byStatus(['READY_TO_SHIP','PROCESSED','RETRY_SHIP']),
        shipping:  byStatus(['SHIPPED','IN_CANCEL','TO_CONFIRM_RECEIVE']),
        completed: completed.length,
        cancelled: cancelled.length,
      };

      // Top products by qty sold
      const prodMap = {};
      for (const o of orders) {
        for (const item of o.item_list ?? []) {
          const id = String(item.item_id);
          if (!prodMap[id]) prodMap[id] = { item_id: id, name: item.item_name ?? '', image: null, sku: null, qty_sold: 0, revenue: 0 };
          prodMap[id].qty_sold += item.model_quantity_purchased ?? 1;
          prodMap[id].revenue  += (item.model_discounted_price ?? item.model_original_price ?? 0) * (item.model_quantity_purchased ?? 1);
        }
      }
      // Match sku/image from inventory
      Object.values(invMap).forEach(inv => {
        if (inv.shopee_item_id && prodMap[String(inv.shopee_item_id)]) {
          prodMap[String(inv.shopee_item_id)].sku   = inv.sku;
          prodMap[String(inv.shopee_item_id)].image = inv.image_url ?? null;
        }
      });
      const top_products = Object.values(prodMap)
        .sort((a, b) => b.qty_sold - a.qty_sold)
        .slice(0, 5);

      // Stock alerts
      const invList    = invSnap.docs.map(d => d.data());
      const out_of_stock = invList.filter(i => (i.current_stock ?? 0) <= 0).map(i => ({ sku: i.sku, name: i.name ?? i.nama_produk, shopee_qty: i.shopee_qty ?? 0, tiktok_qty: i.tiktok_qty ?? 0 }));
      const low_stock    = invList.filter(i => (i.current_stock ?? 0) > 0 && (i.current_stock ?? 0) <= (i.min_stock ?? 0)).map(i => ({ sku: i.sku, name: i.name ?? i.nama_produk, current_stock: i.current_stock, min_stock: i.min_stock }));

      // ── BigQuery: escrow released in period (matches Shopee Seller Center) ──
      // Shopee shows "released" = escrow paid out to wallet, keyed by completed_date.
      // This differs from order total_amount (gross, keyed by create_time).
      let escrow_released = 0, escrow_order_count = 0;
      try {
        const bq      = getBigQuery();
        const project = process.env.FIREBASE_PROJECT_ID;
        const WIB_MS  = 7 * 3600 * 1000;
        let utcFrom;
        if (period === 'month') {
          const wibNow = new Date(Date.now() + WIB_MS);
          wibNow.setUTCDate(1); wibNow.setUTCHours(0, 0, 0, 0);
          utcFrom = new Date(wibNow.getTime() - WIB_MS).toISOString();
        } else {
          utcFrom = new Date(Date.now() - Number(period) * 86400 * 1000).toISOString();
        }
        const utcTo = new Date().toISOString();
        const [bqRows] = await bq.query({
          query: `
            SELECT IFNULL(SUM(escrow_amount),0) AS total_escrow, COUNT(*) AS order_count
            FROM \`${project}.mystocks.shopee_order_finance\`
            WHERE shop_id = '${String(shop_id)}'
              AND completed_date >= TIMESTAMP('${utcFrom}')
              AND completed_date <= TIMESTAMP('${utcTo}')
          `,
          location: 'asia-southeast2',
        });
        if (bqRows.length > 0) {
          escrow_released    = Number(bqRows[0].total_escrow  ?? 0);
          escrow_order_count = Number(bqRows[0].order_count   ?? 0);
        }
        console.log(`[shopee/summary] escrow_released=${escrow_released} for ${escrow_order_count} orders (${utcFrom} → ${utcTo})`);
      } catch (e) {
        console.warn('[shopee/summary] BQ escrow query failed:', e.message);
      }

      return res.status(200).json({
        period,
        revenue: {
          total:              revenue,
          order_count:        orders.length,
          avg_order:          orders.length ? Math.round(revenue / orders.length) : 0,
          completed_pct,
          escrow_released,
          escrow_order_count,
        },
        orders_by_status,
        top_products,
        stock_alerts: { out_of_stock, low_stock },
      });
    } catch (err) {
      console.error('[shopee/summary]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/shopee/products-action ─────────────────────────────────────────
  if (resource === 'products-action') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action, sku, shopee_item_id, shopee_qty, tiktok_qty, price } = req.body ?? {};
    if (!action) return res.status(400).json({ error: 'action required' });

    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      let shopeeResult = null;

      if (action === 'update_stock' && shopee_item_id) {
        shopeeResult = await shopeePost('/api/v2/product/update_stock', {
          item_id:    Number(shopee_item_id),
          stock_list: [{ model_id: 0, normal_stock: Number(shopee_qty) }],
        }, access_token, shop_id);
      }

      if (action === 'update_price' && shopee_item_id && price !== undefined) {
        shopeeResult = await shopeePost('/api/v2/product/update_price_v2', {
          item_id:    Number(shopee_item_id),
          price_list: [{ model_id: 0, original_price: Number(price) }],
        }, access_token, shop_id);
      }

      // Save overrides to Firestore inventory/{sku}
      if (sku) {
        const updates = { updated_at: FieldValue.serverTimestamp() };
        if (shopee_qty !== undefined) updates.shopee_qty  = Number(shopee_qty);
        if (tiktok_qty !== undefined) updates.tiktok_qty  = Number(tiktok_qty);
        if (price      !== undefined) updates.harga_jual  = Number(price);
        await getDb().collection('inventory').doc(sku).set(updates, { merge: true });
      }

      return res.status(200).json({ success: true, shopee: shopeeResult });
    } catch (err) {
      console.error('[shopee/products-action]', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── GET /api/shopee/orders-list ──────────────────────────────────────────────
  if (resource === 'orders-list') {
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const ts        = Math.floor(Date.now() / 1000);
      const time_from = ts - 15 * 24 * 60 * 60;

      const listData = await shopeeGet('/api/v2/order/get_order_list', {
        time_range_field: 'create_time', time_from, time_to: ts, page_size: 100,
      }, access_token, shop_id);

      const orderSns = (listData?.response?.order_list ?? []).map(o => o.order_sn);
      let orders = [];
      for (let i = 0; i < orderSns.length; i += 50) {
        const detail = await shopeeGet('/api/v2/order/get_order_detail', {
          order_sn_list: orderSns.slice(i, i + 50).join(','),
          response_optional_fields: 'buyer_username,recipient_address,item_list,pay_time,ship_by_date,shipping_carrier,payment_method,total_amount,note,cancel_reason,buyer_cpf_id,shipping_document_status',
        }, access_token, shop_id);
        orders = orders.concat(detail?.response?.order_list ?? []);
      }

      // Build item_id → inventory map for photos/names
      const invSnap = await getDb().collection('inventory').get();
      const invMap = {};
      invSnap.docs.forEach(d => {
        const data = d.data();
        if (data.shopee_item_id) invMap[String(data.shopee_item_id)] = data;
      });

      const enriched = orders.map(o => ({
        ...o,
        item_list: (o.item_list ?? []).map(item => ({
          ...item,
          inventory: invMap[String(item.item_id)] ?? null,
        })),
      })).sort((a, b) => (b.create_time ?? 0) - (a.create_time ?? 0));

      const firstRTS = enriched.find(o => o.order_status === 'READY_TO_SHIP');
      if (firstRTS) console.log('[Shopee orders-list] first READY_TO_SHIP raw:', JSON.stringify(firstRTS, null, 2));

      console.log('[Shopee orders-list] shipping_document_status all:',
        enriched.map(o => ({ order_sn: o.order_sn, status: o.order_status, shipping_document_status: o.shipping_document_status ?? 'MISSING' }))
      );

      return res.status(200).json({ orders: enriched, total: enriched.length });
    } catch (err) {
      console.error('[Shopee orders-list] error');
      console.error('[Shopee orders-list] message:', err.message);
      console.error('[Shopee orders-list] code:   ', err.code);
      console.error('[Shopee orders-list] cause:  ', err.cause);
      console.error('[Shopee orders-list] full:   ', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      return res.status(500).json({ error: err.message, code: err.code, cause: String(err.cause ?? '') });
    }
  }

  // ── POST /api/shopee/orders-action ───────────────────────────────────────────
  if (resource === 'orders-action') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action, order_sns = [], tracking_number, logistics_id, cancel_reason } = req.body ?? {};
    if (!action || !order_sns.length) return res.status(400).json({ error: 'action and order_sns required' });

    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const success = [], failed = [];

      for (const order_sn of order_sns) {
        try {
          let data;
          if (action === 'ship') {
            data = await shopeePost('/api/v2/logistics/ship_order', {
              order_sn,
              pickup:          { tracking_no: tracking_number ?? '' },
              dropoff:         { tracking_no: tracking_number ?? '', slug: logistics_id ?? null, sender_real_name: null },
              non_integrated:  { tracking_number: tracking_number ?? '' },
            }, access_token, shop_id);
          } else if (action === 'cancel') {
            data = await shopeePost('/api/v2/order/cancel_order', {
              order_sn, cancel_reason: cancel_reason ?? 'OUT_OF_STOCK',
            }, access_token, shop_id);
          }
          if (data?.error && data.error !== '') failed.push({ order_sn, error: data.message ?? data.error });
          else success.push(order_sn);
        } catch (err) {
          failed.push({ order_sn, error: err.message });
        }
      }
      return res.status(200).json({ success, failed });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/shopee/ship-orders ─────────────────────────────────────────────
  if (resource === 'ship-orders') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { order_sns = [], method, pickup_time_id } = req.body ?? {};
    console.log('[ship-orders] body:', JSON.stringify({ order_sns, method, pickup_time_id }));
    if (!['pickup', 'dropoff'].includes(method))
      return res.status(400).json({ error: 'method must be pickup or dropoff' });
    if (!order_sns.length) return res.status(400).json({ error: 'order_sns required' });
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);

      // ── Pickup pre-flight: resolve address_id once for all orders ────────────
      let pickupAddressId = null;
      if (method === 'pickup') {
        const addrData = await shopeeGet('/api/v2/logistics/get_address_list', {}, access_token, shop_id);
        console.log('[ship-orders] get_address_list response:', JSON.stringify(addrData));
        const addrList = addrData?.response?.address_list ?? [];
        const hasType = (a, t) => (Array.isArray(a.address_type) ? a.address_type : [a.address_type]).includes(t);
        const pickupAddr = addrList.find(a => hasType(a, 'PICKUP_ADDRESS'))
                        ?? addrList.find(a => hasType(a, 'DEFAULT_ADDRESS'))
                        ?? addrList.find(a => a.default_address)
                        ?? addrList[0];
        if (!pickupAddr) {
          return res.status(400).json({ error: 'No pickup address found in seller account' });
        }
        pickupAddressId = pickupAddr.address_id;
        console.log('[ship-orders] selected address_id:', pickupAddressId, 'address_type:', pickupAddr.address_type);
      }

      const success = [], failed = [];
      for (const order_sn of order_sns) {
        try {
          const body = { order_sn };
          if (method === 'pickup') {
            // WIB = UTC+7. Shift now by +7h, zero UTC fields → get exact WIB midnight in UTC seconds.
            const WIB_OFFSET_MS  = 7 * 60 * 60 * 1000;
            const nowWIB         = new Date(Date.now() + WIB_OFFSET_MS);
            const wibHour        = nowWIB.getUTCHours();
            const midnightWIB    = new Date(nowWIB); midnightWIB.setUTCHours(0, 0, 0, 0);
            const todayFrom      = Math.floor((midnightWIB.getTime() - WIB_OFFSET_MS) / 1000); // today 00:00 WIB → UTC
            const todayTo        = todayFrom + 86400 - 1;                                        // today 23:59:59 WIB → UTC
            const tomorrowFrom   = todayFrom + 86400;
            const tomorrowTo     = tomorrowFrom + 86400 - 1;

            // Helper: format Unix timestamp as readable WIB string for logging
            const wibStr = ts => new Date(ts * 1000 + WIB_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ') + ' WIB';

            const primary  = wibHour < 20
              ? { label: 'today',    from: todayFrom,    to: todayTo    }
              : { label: 'tomorrow', from: tomorrowFrom, to: tomorrowTo };
            const fallback = wibHour < 20
              ? { label: 'tomorrow', from: tomorrowFrom, to: tomorrowTo }
              : { label: 'today',    from: todayFrom,    to: todayTo    };
            console.log(`[ship-orders] WIB hour=${wibHour}, primary=${primary.label}`);
            console.log(`[ship-orders] today    time_from=${todayFrom} (${wibStr(todayFrom)})  time_to=${todayTo} (${wibStr(todayTo)})`);
            console.log(`[ship-orders] tomorrow time_from=${tomorrowFrom} (${wibStr(tomorrowFrom)})  time_to=${tomorrowTo} (${wibStr(tomorrowTo)})`);

            if (pickup_time_id) {
              console.log(`[ship-orders] using explicit pickup_time_id=${pickup_time_id} for ${order_sn}`);
              body.pickup = { address_id: pickupAddressId, pickup_time_id };
            } else {
              // Auto-select: try today then tomorrow
              let chosenSlot = null;
              for (const date of [primary, fallback]) {
                console.log(`[ship-orders] querying slots for ${date.label}: time_from=${date.from} time_to=${date.to}`);
                const slotData = await shopeeGet('/api/v2/logistics/get_time_slot_list', {
                  order_sn,
                  pickup_address_id: pickupAddressId,
                  pickup_time_from:  date.from,
                  pickup_time_to:    date.to,
                }, access_token, shop_id);
                console.log(`[ship-orders] get_time_slot_list (${date.label}) for ${order_sn}:`, JSON.stringify(slotData));
                const slots = slotData?.response?.pickup_time_id_list ?? [];
                if (slots.length > 0) {
                  chosenSlot = slots[slots.length - 1];
                  console.log(`[ship-orders] selected slot (${date.label}, last of ${slots.length}) for ${order_sn}:`, JSON.stringify(chosenSlot));
                  break;
                }
              }
              if (chosenSlot) {
                body.pickup = { address_id: pickupAddressId, pickup_time_id: chosenSlot.pickup_time_id ?? chosenSlot };
              } else {
                console.log(`[ship-orders] no slots found for ${order_sn}, proceeding with address_id only`);
                body.pickup = { address_id: pickupAddressId };
              }
            }
          } else {
            body.dropoff = { tracking_no: '', slug: null, sender_real_name: null };
          }
          console.log(`[ship-orders] calling ship_order for ${order_sn}:`, JSON.stringify(body));
          const data = await shopeePost('/api/v2/logistics/ship_order', body, access_token, shop_id);
          console.log(`[ship-orders] response for ${order_sn}:`, JSON.stringify(data));
          if (data?.error && data.error !== '') {
            console.warn(`[ship-orders] failed ${order_sn}: error=${data.error} message=${data.message}`);
            failed.push({ order_sn, error: data.message ?? data.error });
          } else {
            success.push(order_sn);
          }
        } catch (err) {
          console.error(`[ship-orders] caught for ${order_sn}: message=${err.message} code=${err.code} cause=${err.cause}`);
          console.error(`[ship-orders] full err:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
          failed.push({ order_sn, error: err.message });
        }
      }
      console.log('[ship-orders] done — success:', success, 'failed:', failed);
      return res.status(200).json({ success, failed });
    } catch (err) {
      console.error('[ship-orders] outer catch: message=', err.message, 'code=', err.code);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/shopee/print-resi ───────────────────────────────────────────────
  if (resource === 'print-resi') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { order_sns = [] } = req.body ?? {};
    if (!order_sns.length) return res.status(400).json({ error: 'order_sns required' });
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);

      const createData = await shopeePost('/api/v2/logistics/create_shipping_document', {
        order_list: order_sns.map(sn => ({ order_sn: sn })),
      }, access_token, shop_id);
      console.log('[print-resi] create_shipping_document response:', JSON.stringify(createData));

      await new Promise(r => setTimeout(r, 8000));

      const orderList = order_sns.map(sn => ({ order_sn: sn }));
      let data = await shopeePost('/api/v2/logistics/download_shipping_document', {
        order_list:             orderList,
        shipping_document_type: 'NORMAL_AIR_WAYBILL',
      }, access_token, shop_id);
      console.log('[print-resi] download_shipping_document response (attempt 1):', JSON.stringify(data));

      if (data?.error === 'logistics.shipping_document_should_print_first' || data?.message?.includes('should_print_first')) {
        console.log('[print-resi] document not ready, retrying after 5s…');
        await new Promise(r => setTimeout(r, 5000));
        data = await shopeePost('/api/v2/logistics/download_shipping_document', {
          order_list:             orderList,
          shipping_document_type: 'NORMAL_AIR_WAYBILL',
        }, access_token, shop_id);
        console.log('[print-resi] download_shipping_document response (attempt 2):', JSON.stringify(data));
      }

      if (data?.error && data.error !== '')
        return res.status(400).json({ error: data.message ?? data.error, code: data.error });
      return res.status(200).json({
        url:         data?.response?.file_url   ?? null,
        file_type:   data?.response?.file_type  ?? null,
        result_list: data?.response?.result_list ?? [],
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET /api/shopee/financial?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=monthly ─
  if (resource === 'financial') {
    const { from, to, granularity = 'monthly' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required (YYYY-MM-DD)' });
    try {
      const { shop_id } = await getValidToken(SHOPEE_USER_ID);
      const [summary, trend] = await Promise.all([
        getFinancialSummary(shop_id, from, to),
        getFinancialTrend(shop_id, from, to, granularity),
      ]);
      return res.status(200).json({ ...summary, trend });
    } catch (err) {
      console.error('[financial] error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET /api/shopee/product-performance?from=...&to=... ───────────────────────
  if (resource === 'product-performance') {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required (YYYY-MM-DD)' });
    try {
      const { shop_id } = await getValidToken(SHOPEE_USER_ID);
      const data = await getRevenueBySku(shop_id, from, to);
      return res.status(200).json({ data });
    } catch (err) {
      console.error('[product-performance] error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET /api/shopee/stock-velocity?from=...&to=... ────────────────────────────
  if (resource === 'stock-velocity') {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required (YYYY-MM-DD)' });
    try {
      const { shop_id } = await getValidToken(SHOPEE_USER_ID);
      const data = await getRevenueBySku(shop_id, from, to);
      return res.status(200).json({ data });
    } catch (err) {
      console.error('[stock-velocity] error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET /api/shopee/sync-escrow-backfill ─────────────────────────────────────
  if (resource === 'sync-escrow-backfill') {
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);
      const result = await runEscrowBackfill(access_token, shop_id, 50);
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error('[sync-escrow-backfill] error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── TEMPORARY: GET /api/shopee/debug-finance?date=YYYY-MM-DD ────────────────
  // Diagnose UTC vs WIB discrepancy: compares Shopee escrow API vs BigQuery for a given WIB date.
  if (resource === 'debug-finance') {
    res.setHeader('Cache-Control', 'no-store');
    const targetDate = req.query.date ?? '2026-06-01';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    try {
      const { access_token, shop_id } = await getValidToken(SHOPEE_USER_ID);

      // ── 1. Shopee API: get_escrow_list for the WIB day window ─────────────
      const dayStart = Math.floor(new Date(`${targetDate}T00:00:00+07:00`).getTime() / 1000);
      const dayEnd   = dayStart + 86400;
      console.log('[debug-finance] Shopee window (UTC):', new Date(dayStart * 1000).toISOString(), '→', new Date(dayEnd * 1000).toISOString());

      let shopeeRows = [], shopeeTotal = 0;
      try {
        let pageNo = 1, more = true;
        while (more && pageNo <= 10) {
          const d = await shopeeGet('/api/v2/payment/get_escrow_list', {
            release_time_from: dayStart, release_time_to: dayEnd, page_size: 100, page_no: pageNo,
          }, access_token, shop_id);
          const list = d?.response?.escrow_list ?? [];
          shopeeRows = shopeeRows.concat(list.map(e => ({
            order_sn: e.order_sn, payout_amount: e.payout_amount,
            release_time_utc: e.escrow_release_time ? new Date(e.escrow_release_time * 1000).toISOString() : null,
          })));
          shopeeTotal += list.reduce((s, e) => s + Number(e.payout_amount ?? 0), 0);
          more = d?.response?.more === true;
          pageNo++;
        }
      } catch (e) { console.error('[debug-finance] Shopee failed:', e.message); }

      // ── 2. BigQuery: shopee_order_finance diagnostic ──────────────────────────
      const bq      = getBigQuery();
      const project = process.env.FIREBASE_PROJECT_ID;
      const ft      = `\`${project}.mystocks.shopee_order_finance\``;
      const utcDate     = targetDate;
      const prevUtcDate = new Date(new Date(`${targetDate}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      const safeShop    = String(shop_id).replace(/[^0-9]/g, '');

      console.log('[debug-finance] shop_id from token:', shop_id, '| safeShop:', safeShop);
      console.log('[debug-finance] scanning UTC dates:', prevUtcDate, 'and', utcDate);

      // 2a. Total row count and distinct shop_ids — tells us if table has data at all
      let tableStats = {};
      try {
        const statsQuery = `
          SELECT
            COUNT(*) AS total_rows,
            COUNT(DISTINCT shop_id) AS distinct_shops,
            STRING_AGG(DISTINCT shop_id ORDER BY shop_id) AS shop_ids,
            MIN(DATE(completed_date)) AS earliest_date,
            MAX(DATE(completed_date)) AS latest_date
          FROM ${ft}`;
        console.log('[debug-finance] stats query:', statsQuery);
        const [sJob] = await bq.createQueryJob({ query: statsQuery, location: 'asia-southeast2' });
        const [sRows] = await sJob.getQueryResults();
        const s = sRows[0] ?? {};
        tableStats = {
          total_rows:      Number(s.total_rows ?? 0),
          distinct_shops:  Number(s.distinct_shops ?? 0),
          shop_ids:        s.shop_ids ?? '',
          earliest_date:   s.earliest_date?.value ?? s.earliest_date ?? null,
          latest_date:     s.latest_date?.value   ?? s.latest_date   ?? null,
        };
        console.log('[debug-finance] table stats:', JSON.stringify(tableStats));
      } catch (e) { console.error('[debug-finance] stats query failed:', e.message); tableStats = { error: e.message }; }

      // 2b. Look up BQ rows by order_sn (not date) — reveals backfill-date corruption
      // If rows exist but have wrong completed_date (e.g. sync time instead of release time),
      // the date filter would return 0 but this lookup still finds them.
      let bqRows = [], bqTotalUtc = 0, bqTotalWib = 0, bqRowCountUtc = 0, bqRowCountWib = 0, lastSyncedAt = null;
      let bqDateMismatch = []; // rows whose wib_date ≠ targetDate — confirms backfill bug
      try {
        const snList = shopeeRows.map(r => `'${String(r.order_sn).replace(/'/g, '')}'`).join(',');
        const bqQuery = snList.length
          ? `SELECT order_sn, escrow_amount,
               FORMAT_TIMESTAMP('%Y-%m-%d', completed_date)                             AS utc_date,
               FORMAT_TIMESTAMP('%Y-%m-%d', completed_date, 'Asia/Jakarta') AS wib_date,
               FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', synced_at)                       AS synced_at_str
             FROM ${ft}
             WHERE shop_id = '${safeShop}'
               AND order_sn IN (${snList})
             ORDER BY completed_date ASC`
          : `SELECT order_sn, escrow_amount,
               FORMAT_TIMESTAMP('%Y-%m-%d', completed_date)                             AS utc_date,
               FORMAT_TIMESTAMP('%Y-%m-%d', completed_date, 'Asia/Jakarta') AS wib_date,
               FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', synced_at)                       AS synced_at_str
             FROM ${ft}
             WHERE shop_id = '${safeShop}'
               AND DATE(completed_date, 'Asia/Jakarta') = DATE('${utcDate}')
             ORDER BY completed_date ASC`;
        console.log('[debug-finance] order_sn lookup query (first 500 chars):', bqQuery.slice(0, 500));
        const [job] = await bq.createQueryJob({ query: bqQuery, location: 'asia-southeast2' });
        const [rows] = await job.getQueryResults();
        bqRows = rows.map(r => ({
          order_sn: r.order_sn, escrow_amount: Number(r.escrow_amount ?? 0),
          utc_date: r.utc_date, wib_date: r.wib_date,
          synced_at: r.synced_at_str ?? null,
        }));
        bqTotalUtc    = bqRows.filter(r => r.utc_date === utcDate).reduce((s, r) => s + r.escrow_amount, 0);
        bqTotalWib    = bqRows.filter(r => r.wib_date === targetDate).reduce((s, r) => s + r.escrow_amount, 0);
        bqRowCountUtc = bqRows.filter(r => r.utc_date === utcDate).length;
        bqRowCountWib = bqRows.filter(r => r.wib_date === targetDate).length;
        bqDateMismatch = bqRows.filter(r => r.wib_date !== targetDate)
          .map(r => ({ order_sn: r.order_sn, stored_wib_date: r.wib_date, synced_at: r.synced_at }));
        const syncs = bqRows.map(r => r.synced_at).filter(Boolean).sort();
        lastSyncedAt = syncs[syncs.length - 1] ?? null;
        console.log('[debug-finance] BQ lookup found', bqRows.length, 'rows;', bqDateMismatch.length, 'with wrong wib_date');
      } catch (e) { console.error('[debug-finance] BQ order_sn query failed:', e.message, e.stack); }

      // ── 3. Firestore webhook persistence sample ────────────────────────────
      const webhookChecks = await Promise.all(shopeeRows.slice(0, 3).map(async r => {
        try {
          const doc = await getDb().collection('order_recipients').doc(r.order_sn).get();
          return { order_sn: r.order_sn, firestore_persisted: doc.exists, source: doc.data()?.source ?? null };
        } catch { return { order_sn: r.order_sn, firestore_persisted: false }; }
      }));

      // ── 4. Diagnosis ───────────────────────────────────────────────────────
      const utcGap = Math.round(shopeeTotal - bqTotalUtc);
      const wibGap = Math.round(shopeeTotal - bqTotalWib);
      const suspectedIssue = bqDateMismatch.length > 0
        ? `backfill_date_corruption — ${bqDateMismatch.length} orders found in BQ but stamped with wrong wib_date (${bqDateMismatch[0]?.stored_wib_date ?? '?'} instead of ${targetDate}); fetchEscrowDetail used sync time not release time`
        : Math.abs(wibGap) < 1000 ? 'none — totals match'
        : bqRows.length === 0 ? 'sync_gap — orders not in shopee_order_finance at all; run escrow-list sync'
        : Math.abs(wibGap) < Math.abs(utcGap) && Math.abs(utcGap) > 10000
          ? 'timezone — use AT TIME ZONE Asia/Jakarta'
          : 'unknown — inspect bq_raw_rows';

      return res.status(200).json({
        target_date_wib:    targetDate,
        shop_id_used:       safeShop,
        table_stats:        tableStats,
        shopee_api_total:   Math.round(shopeeTotal),
        shopee_row_count:   shopeeRows.length,
        bigquery_utc_total: Math.round(bqTotalUtc),
        bigquery_wib_total: Math.round(bqTotalWib),
        bigquery_utc_rows:  bqRowCountUtc,
        bigquery_wib_rows:  bqRowCountWib,
        utc_gap:            utcGap,
        wib_gap:            wibGap,
        lookup_note:        `Rows looked up by order_sn (not date). bq_date_mismatch shows orders found but with wrong completed_date — confirms backfill corruption.`,
        last_bq_sync:       lastSyncedAt,
        webhook_persistence: webhookChecks,
        suspected_issue:    suspectedIssue,
        bq_date_mismatch:   bqDateMismatch.slice(0, 10),
        shopee_raw_rows:    shopeeRows,
        bq_raw_rows:        bqRows,
      });
    } catch (err) {
      console.error('[debug-finance] error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: `Unknown resource: ${resource}` });
}
