import { getUserIdFromRequest } from '../../lib/auth.js';
import { getTikTokToken, tiktokRequest } from '../../lib/tiktokApi.js';
import { getShopeeToken, shopeeRequest } from '../../lib/shopeeApi.js';

const MOCK_ORDERS = [
  {
    id: 'TT-ORDER-001',
    platform: 'tiktok',
    status: 'AWAITING_SHIPMENT',
    created_at: '2026-05-09T10:00:00Z',
    total: 250000,
    currency: 'IDR',
    buyer_name: 'Budi Santoso',
    items: [{ sku: 'SKU-001', name: 'Kaos Polos Putih', qty: 2, price: 125000 }],
  },
  {
    id: 'TT-ORDER-002',
    platform: 'tiktok',
    status: 'COMPLETED',
    created_at: '2026-05-08T14:30:00Z',
    total: 180000,
    currency: 'IDR',
    buyer_name: 'Siti Rahayu',
    items: [{ sku: 'SKU-002', name: 'Celana Jeans Slim', qty: 1, price: 180000 }],
  },
  {
    id: 'SP-ORDER-001',
    platform: 'shopee',
    status: 'READY_TO_SHIP',
    created_at: '2026-05-09T09:15:00Z',
    total: 75000,
    currency: 'IDR',
    buyer_name: 'Dewi Lestari',
    items: [{ sku: 'SKU-003', name: 'Topi Baseball', qty: 1, price: 75000 }],
  },
  {
    id: 'SP-ORDER-002',
    platform: 'shopee',
    status: 'SHIPPED',
    created_at: '2026-05-07T16:45:00Z',
    total: 320000,
    currency: 'IDR',
    buyer_name: 'Ahmad Fauzi',
    items: [
      { sku: 'SKU-001', name: 'Kaos Polos Putih', qty: 2, price: 125000 },
      { sku: 'SKU-003', name: 'Topi Baseball', qty: 1, price: 75000 },
    ],
  },
];

export default async function handler(req, res) {
  const { resource } = req.query;

  // ── Merged from api/orders/list.js ──────────────────────────────────────
  if (resource === 'list') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    if (process.env.MOCK_MODE === 'true') {
      return res.json({ orders: MOCK_ORDERS, total: MOCK_ORDERS.length });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const results = { tiktok: [], shopee: [], errors: [] };

    try {
      const tokenData = await getTikTokToken(userId);
      if (tokenData) {
        const data = await tiktokRequest({
          method: 'POST',
          path: '/order/202309/orders/search',
          body: { page_size: 20, sort_by: 'CREATE_TIME', sort_type: 1 },
          accessToken: tokenData.accessToken,
          shopId: tokenData.shopId,
        });
        const rawOrders = data?.data?.order_list || data?.data?.orders || [];
        results.tiktok = rawOrders.map(o => ({ ...o, platform: 'tiktok' }));
      }
    } catch (err) {
      results.errors.push({ platform: 'tiktok', error: err.message, code: err.code });
    }

    try {
      const tokenData = await getShopeeToken(userId);
      if (tokenData) {
        const data = await shopeeRequest({
          method: 'GET',
          path: '/api/v2/order/get_order_list',
          params: { page_size: 20 },
          accessToken: tokenData.accessToken,
          shopId: tokenData.shopId,
        });
        results.shopee = (data?.response?.order_list || []).map(o => ({ ...o, platform: 'shopee' }));
      }
    } catch (err) {
      results.errors.push({ platform: 'shopee', error: err.message, code: err.code });
    }

    const orders = [...results.tiktok, ...results.shopee];
    return res.json({ orders, total: orders.length, errors: results.errors });
  }

  // If resource is not 'list', we treat it as an orderId.
  // But we need a platform. We'll expect a query param ?platform=...
  const orderId = resource;
  const { platform } = req.query;

  if (!platform) return res.status(400).json({ error: 'Platform query parameter required' });

  if (process.env.MOCK_MODE === 'true') {
    const order = MOCK_ORDERS.find(o => o.id === orderId && o.platform === platform);
    if (!order) return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND', platform });
    return res.json(order);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    if (platform === 'tiktok') {
      const tokenData = await getTikTokToken(userId);
      if (!tokenData) return res.status(401).json({ error: 'TikTok not connected' });
      const data = await tiktokRequest({
        method: 'GET',
        path: `/order/202309/orders`,
        params: { order_id_list: JSON.stringify([orderId]) },
        accessToken: tokenData.accessToken,
        shopId: tokenData.shopId,
      });
      return res.json(data?.data?.order_list?.[0] || {});
    }

    if (platform === 'shopee') {
      const tokenData = await getShopeeToken(userId);
      if (!tokenData) return res.status(401).json({ error: 'Shopee not connected' });
      const data = await shopeeRequest({
        method: 'GET',
        path: '/api/v2/order/get_order_detail',
        params: { order_sn_list: orderId },
        accessToken: tokenData.accessToken,
        shopId: tokenData.shopId,
      });
      return res.json(data?.response?.order_list?.[0] || {});
    }

    res.status(400).json({ error: 'Unknown platform', code: 'INVALID_PLATFORM', platform });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
