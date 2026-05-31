import crypto from 'crypto';
import axios from 'axios';
import { getDb } from './firebase.js';

const BASE_URL = 'https://open-api.tiktokglobalshop.com';
const API_VERSION = '202309';
const AUTH_BASE = 'https://auth.tiktok-shops.com';
const BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/**
 * Build the HMAC-SHA256 signature for TikTok Shop API calls.
 * Sign string: {app_secret}{path}{sorted_key+value_concat}{body}
 */
function buildSignature({ appSecret, path, params = {}, body = '' }) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'sign' && k !== 'access_token')
  );
  const sortedConcat = Object.keys(filtered)
    .sort()
    .reduce((acc, key) => acc + key + filtered[key], '');
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const input = appSecret + path + sortedConcat + bodyStr;
  return crypto.createHmac('sha256', appSecret).update(input).digest('hex');
}

/**
 * Make a signed request to the TikTok Shop Open API.
 */
export async function tiktokRequest({ method = 'GET', path, params = {}, body = null, accessToken, shopId }) {
  const appKey = process.env.TIKTOK_CLIENT_KEY;
  const appSecret = process.env.TIKTOK_CLIENT_SECRET;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const baseParams = {
    app_key: appKey,
    timestamp,
    version: API_VERSION,
    ...(shopId ? { shop_id: String(shopId) } : {}),
    ...params,
  };

  const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const sign = buildSignature({ appSecret, path, params: baseParams, body: bodyStr });

  const queryParams = {
    ...baseParams,
    sign,
    ...(accessToken ? { access_token: accessToken } : {}),
  };

  const url = BASE_URL + path;

  try {
    const response = await axios({
      method,
      url,
      params: queryParams,
      data: body ? (typeof body === 'string' ? body : body) : undefined,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    if (response.data?.code !== 0) {
      const err = new Error(response.data?.message || 'TikTok API error');
      err.tiktokCode = response.data?.code;
      err.code = `TIKTOK_${response.data?.code}`;
      err.platform = 'tiktok';
      err.raw = response.data;
      throw err;
    }

    return response.data;
  } catch (err) {
    if (!err.platform) {
      err.platform = 'tiktok';
      err.code = err.code || 'TIKTOK_REQUEST_FAILED';
    }
    throw err;
  }
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export function buildAuthUrl(state = '') {
  const params = new URLSearchParams({
    app_key: process.env.TIKTOK_CLIENT_KEY,
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    state,
    scope: 'order.read,product.read,product.write,inventory.read,inventory.write,shop.read,merchant_info.read',
  });
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(code) {
  const response = await axios.get(`${AUTH_BASE}/api/v2/token/get`, {
    params: {
      app_key: process.env.TIKTOK_CLIENT_KEY,
      app_secret: process.env.TIKTOK_CLIENT_SECRET,
      auth_code: code,
      grant_type: 'authorized_code',
    },
    timeout: 15000,
  });

  if (response.data?.code !== 0) {
    const err = new Error(response.data?.message || 'Token exchange failed');
    err.tiktokCode = response.data?.code;
    err.code = `TIKTOK_TOKEN_${response.data?.code}`;
    err.platform = 'tiktok';
    err.raw = response.data;
    throw err;
  }

  const d = response.data.data;
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.access_token_expire_in || 3600) * 1000,
    refresh_expires_at: Date.now() + (d.refresh_token_expire_in || 7776000) * 1000,
    open_id: d.open_id || null,
    seller_name: d.seller_name || null,
    shop_id: null,
  };
}

async function _refresh(refreshToken) {
  const response = await axios.get(`${AUTH_BASE}/api/v2/token/refresh`, {
    params: {
      app_key: process.env.TIKTOK_CLIENT_KEY,
      app_secret: process.env.TIKTOK_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    timeout: 15000,
  });

  if (response.data?.code !== 0) {
    const err = new Error(response.data?.message || 'Refresh failed');
    err.tiktokCode = response.data?.code;
    err.code = `TIKTOK_REFRESH_${response.data?.code}`;
    err.platform = 'tiktok';
    err.raw = response.data;
    throw err;
  }

  const d = response.data.data;
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (d.access_token_expire_in || 3600) * 1000,
    refresh_expires_at: Date.now() + (d.refresh_token_expire_in || 7776000) * 1000,
  };
}

export async function getValidToken(userId, tt) {
  if (process.env.MOCK_MODE === 'true') return tt.access_token;
  if (!tt.expires_at) return tt.access_token;
  if (Date.now() < tt.expires_at - BUFFER_MS) return tt.access_token;
  if (tt.refresh_expires_at && Date.now() > tt.refresh_expires_at) {
    const e = new Error('Refresh token expired'); e.code = 'REFRESH_TOKEN_EXPIRED'; throw e;
  }
  if (!tt.refresh_token) return tt.access_token;
  const fresh = await _refresh(tt.refresh_token);
  await getDb().collection('users').doc(userId).set({ tiktok: { ...tt, ...fresh } }, { merge: true });
  return fresh.access_token;
}

export async function getShops(accessToken) {
  const data = await tiktokRequest({
    method: 'GET',
    path: '/authorization/202309/shops',
    accessToken,
  });
  return data?.data?.shops || [];
}

// ── Data Methods ────────────────────────────────────────────────────────────────────

export async function getOrders(token, shopId, { page = 1, pageSize = 20 } = {}) {
  if (process.env.MOCK_MODE === 'true') {
    return { orders: [], total: 0, page, totalPages: 0 }; // Simplified mock for now
  }
  const data = await tiktokRequest({
    method: 'POST',
    path: '/order/202309/orders/search',
    accessToken: token,
    shopId,
    body: { page_size: pageSize, sort_by: 'CREATE_TIME', sort_type: 1, page: page },
  });
  const raw = data?.data?.order_list ?? [];
  const total = data?.data?.total_count ?? raw.length;
  return { orders: raw.map(_normOrder), total, page, totalPages: Math.ceil(total/pageSize) };
}

export async function getProducts(token, shopId) {
  if (process.env.MOCK_MODE === 'true') return { products: [], total: 0 };
  const data = await tiktokRequest({
    method: 'GET',
    path: '/product/202309/products',
    accessToken: token,
    shopId,
    params: { page_size: 20 },
  });
  const raw = data?.data?.products ?? [];
  return { products: raw.map(_normProduct), total: data?.data?.total_count ?? raw.length };
}

export async function getInventory(token, shopId) {
  if (process.env.MOCK_MODE === 'true') return { products: [] };
  const { products } = await getProducts(token, shopId);
  return { products: products.map(p => ({ id:p.id, sku:p.sku, name:p.name, stock:p.stock, status:p.status })) };
}

export async function getAnalytics(token, shopId) {
  if (process.env.MOCK_MODE === 'true') return { revenue: 0, orders: 0, avgOrder: 0, topProducts: [] };
  const { orders } = await getOrders(token, shopId, { pageSize: 100 });
  const done = orders.filter(o => ['COMPLETED','DELIVERED'].includes(o.status));
  const rev  = done.reduce((s,o) => s + (o.total ?? 0), 0);
  const map  = {};
  for (const o of done) for (const i of o.items ?? []) {
    map[i.name] ??= { name: i.name, revenue: 0, units: 0 };
    map[i.name].revenue += (i.price ?? 0) * (i.qty ?? 1);
    map[i.name].units   += i.qty ?? 1;
  }
  return { revenue: rev, orders: orders.length, avgOrder: done.length ? Math.round(rev/done.length) : 0,
    topProducts: Object.values(map).sort((a,b) => b.revenue - a.revenue).slice(0,5) };
}

function _normOrder(r) {
  return { id: r.id, status: r.status,
    created_at: r.create_time ? new Date(r.create_time*1000).toISOString() : null,
    total: r.payment?.total_amount ?? 0, currency: r.payment?.currency ?? 'IDR',
    buyer_id: r.buyer_uid ?? null,
    buyer: r.recipient_address?.name ?? r.buyer_uid ?? null,
    buyer_region: r.recipient_address?.region_code ?? null,
    items: (r.line_items ?? []).map(i => ({ product_id:i.product_id??null, name:i.product_name, sku:i.seller_sku, qty:i.quantity, price:i.sale_price })) };
}

function _normProduct(r) {
  return { id: r.id, sku: r.skus?.[0]?.seller_sku ?? r.id, name: r.title ?? r.product_name,
    price: r.skus?.[0]?.price?.sale_price ?? 0,
    stock: r.skus?.[0]?.stock_infos?.[0]?.available_stock ?? 0,
    status: r.status, image: r.main_images?.[0]?.urls?.[0] ?? null,
    category: r.category_list?.[0]?.local_name ?? null };
}
