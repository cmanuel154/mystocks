import { getUserIdFromRequest } from '../../lib/auth.js';
import { getTikTokToken, tiktokRequest } from '../../lib/tiktokApi.js';
import { getShopeeToken, shopeeRequest } from '../../lib/shopeeApi.js';

const MOCK_PRODUCTS = [
  {
    id: 'PROD-001',
    sku: 'SKU-001',
    name: 'Kaos Polos Putih',
    description: 'Kaos polos bahan cotton combed 30s',
    price: 125000,
    currency: 'IDR',
    image_url: 'https://placehold.co/300x300?text=Kaos+Putih',
    tiktok: { product_id: 'TT-PROD-001', status: 'ACTIVATE', stock: 45 },
    shopee: { item_id: 9001001, status: 'NORMAL', stock: 40 },
  },
  {
    id: 'PROD-002',
    sku: 'SKU-002',
    name: 'Celana Jeans Slim',
    description: 'Celana jeans slim fit denim stretch',
    price: 180000,
    currency: 'IDR',
    image_url: 'https://placehold.co/300x300?text=Celana+Jeans',
    tiktok: { product_id: 'TT-PROD-002', status: 'ACTIVATE', stock: 20 },
    shopee: { item_id: 9001002, status: 'NORMAL', stock: 18 },
  },
  {
    id: 'PROD-003',
    sku: 'SKU-003',
    name: 'Topi Baseball',
    description: 'Topi baseball adjustable unisex',
    price: 75000,
    currency: 'IDR',
    image_url: 'https://placehold.co/300x300?text=Topi',
    tiktok: { product_id: 'TT-PROD-003', status: 'ACTIVATE', stock: 5 },
    shopee: { item_id: 9001003, status: 'NORMAL', stock: 12 },
  },
  {
    id: 'PROD-004',
    sku: 'SKU-004',
    name: 'Jaket Bomber',
    description: 'Jaket bomber polyester water resistant',
    price: 295000,
    currency: 'IDR',
    image_url: 'https://placehold.co/300x300?text=Jaket',
    tiktok: { product_id: 'TT-PROD-004', status: 'ACTIVATE', stock: 0 },
    shopee: { item_id: 9001004, status: 'NORMAL', stock: 3 },
  },
];

export default async function handler(req, res) {
  const { resource } = req.query;

  if (resource === 'list') {
    if (process.env.MOCK_MODE === 'true') {
      return res.json({ products: MOCK_PRODUCTS, total: MOCK_PRODUCTS.length });
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const results = { tiktok: [], shopee: [], errors: [] };

    try {
      const tToken = await getTikTokToken(userId);
      if (tToken) {
        const data = await tiktokRequest({
          method: 'GET',
          path: '/product/202309/products',
          params: { page_size: 20 },
          accessToken: tToken.accessToken,
          shopId: tToken.shopId,
        });
        const rawProducts = data?.data?.products || data?.data?.product_list || [];
        results.tiktok = rawProducts.map(p => ({
          id: p.id,
          sku: p.skus?.[0]?.seller_sku || p.id,
          name: p.title || p.product_name,
          price: p.skus?.[0]?.price?.original_price || 0,
          currency: 'IDR',
          image_url: p.main_images?.[0]?.urls?.[0] || null,
          status: p.status,
          tiktok: {
            product_id: p.id,
            status: p.status,
            stock: p.skus?.[0]?.stock_infos?.[0]?.available_stock ?? 0,
          },
          _raw: p,
        }));
      }
    } catch (err) {
      results.errors.push({ platform: 'tiktok', error: err.message, code: err.code });
    }

    try {
      const sToken = await getShopeeToken(userId);
      if (sToken) {
        const data = await shopeeRequest({
          method: 'GET',
          path: '/api/v2/product/get_item_list',
          params: { offset: 0, page_size: 20, item_status: 'NORMAL' },
          accessToken: sToken.accessToken,
          shopId: sToken.shopId,
        });
        const items = data?.response?.item || [];
        results.shopee = items.map(i => ({
          id: String(i.item_id),
          name: i.item_name,
          shopee: { item_id: i.item_id, status: 'NORMAL' },
          _raw: i,
        }));
      }
    } catch (err) {
      results.errors.push({ platform: 'shopee', error: err.message, code: err.code });
    }

    const products = [...results.tiktok, ...results.shopee];
    return res.json({ products, total: products.length, errors: results.errors });
  }

  // Detail view: resource is the product ID
  const productId = resource;
  if (process.env.MOCK_MODE === 'true') {
    const product = MOCK_PRODUCTS.find(p => p.id === productId || p.sku === productId);
    if (!product) return res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' });
    return res.json(product);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const tToken = await getTikTokToken(userId);
    if (tToken) {
      const data = await tiktokRequest({
        method: 'GET',
        path: `/product/202309/products/${productId}`,
        accessToken: tToken.accessToken,
        shopId: tToken.shopId,
      });
      return res.json(data?.data || {});
    }
  } catch (err) {
    console.error('[Product Detail] TikTok Error:', err.message);
  }

  res.status(404).json({ error: 'Product not found', code: 'NOT_FOUND' });
}
