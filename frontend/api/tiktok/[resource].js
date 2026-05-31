/**
 * GET /api/tiktok/[resource]  →  orders | products | inventory | analytics
 *
 * Single Vercel function handles all four TikTok data endpoints.
 * Vercel sets req.query.resource from the URL path segment.
 * After every orders/products fetch, data is persisted to Firestore
 * via sync.js (fire-and-forget after the response is sent).
 */
import axios             from 'axios';
import { getDb }           from '../../lib/firebase.js';
import { getUserIdFromRequest } from '../../lib/auth.js';
import { getValidToken, getOrders, getProducts, getInventory, getAnalytics, generateSign, generateSignDebug } from '../../lib/tiktokApi.js';
import { fromTikTokOrder, fromTikTokProduct, writeOrders, writeProducts, writeSyncLog } from '../../lib/sync.js';

const VALID    = ['orders', 'products', 'inventory', 'analytics'];
const FRONTEND = process.env.NEXT_PUBLIC_APP_URL || 'https://mystocks-dashboard.vercel.app';

function _parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => {
      const i = c.indexOf('=');
      return i === -1 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
    })
  );
}

export default async function handler(req, res) {
  const resource = req.query.resource;

  // ── /api/tiktok/auth — initiate OAuth ────────────────────────────────────────
  if (resource === 'auth') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    // State is included in the URL for TikTok's round-trip but NOT stored in a cookie —
    // Vercel routes /auth and /callback to different regions, losing cookies between them.
    const state       = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const app_key     = process.env.TIKTOK_APP_KEY || process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;
    const url = `https://services.tiktokshop.com/open/authorize?app_key=${app_key}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log('[TikTok auth] redirecting to:', url);
    return res.redirect(302, url);
  }

  // ── /api/tiktok/shop — list authorised shops ─────────────────────────────────
  if (resource === 'shop') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const cookies     = _parseCookies(req);
    const accessToken = cookies.tiktok_access_token || process.env.TIKTOK_ACCESS_TOKEN;
    const tokenSource = cookies.tiktok_access_token ? 'cookie' : (process.env.TIKTOK_ACCESS_TOKEN ? 'env' : 'none');
    if (!accessToken) return res.status(401).json({ error: 'No access token — set cookie or TIKTOK_ACCESS_TOKEN env var' });

    const appKey    = process.env.TIKTOK_APP_KEY    || process.env.TIKTOK_CLIENT_KEY;
    const appSecret = process.env.TIKTOK_APP_SECRET || process.env.TIKTOK_CLIENT_SECRET;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const { createHmac } = await import('crypto');
    const shopPath   = '/authorization/202309/shops';
    const params     = { app_key: appKey, timestamp };
    const inner      = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
    // Correct algorithm: SECRET + PATH + sorted_params + SECRET, lowercase hex
    const base       = appSecret + shopPath + inner + appSecret;
    const sign       = createHmac('sha256', appSecret).update(base).digest('hex');

    const url = `https://open-api.tiktokglobalshop.com/authorization/202309/shops?app_key=${encodeURIComponent(appKey)}&timestamp=${timestamp}&sign=${sign}`;
    console.log('[TikTok shop] token source:', tokenSource, '| GET', url);

    try {
      const resp = await fetch(url, {
        headers: { 'x-tts-access-token': accessToken, 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      console.log('[TikTok shop] http_status:', resp.status, '| response:', JSON.stringify(data));
      return res.status(200).json(data);
    } catch (err) {
      console.error('[TikTok shop] error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── /api/tiktok/refresh — refresh access token ───────────────────────────────
  if (resource === 'refresh') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { tiktok_refresh_token } = _parseCookies(req);
    if (!tiktok_refresh_token) return res.status(401).json({ error: 'No refresh token' });
    const app_key    = process.env.TIKTOK_APP_KEY    || process.env.TIKTOK_CLIENT_KEY;
    const app_secret = process.env.TIKTOK_APP_SECRET || process.env.TIKTOK_CLIENT_SECRET;
    try {
      const resp = await fetch('https://auth.tiktok-shops.com/api/v2/token/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ app_key, app_secret, refresh_token: tiktok_refresh_token, grant_type: 'refresh_token' }),
      });
      const data = await resp.json();
      console.log('[TikTok refresh]', data?.code, data?.message);
      if (data?.code !== 0) return res.status(401).json({ error: data?.message, code: data?.code });
      const { access_token, refresh_token, access_token_expire_in } = data.data;
      const isSecure = process.env.NODE_ENV === 'production';
      res.setHeader('Set-Cookie', [
        `tiktok_access_token=${encodeURIComponent(access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${access_token_expire_in ?? 86400 * 7}${isSecure ? '; Secure' : ''}`,
        `tiktok_refresh_token=${encodeURIComponent(refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${86400 * 90}${isSecure ? '; Secure' : ''}`,
      ]);
      return res.status(200).json({ ok: true, expires_in: access_token_expire_in });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Temporary test route — bypasses auth, full debug output ─────────────────
  if (resource === 'test') {
    try {
      const doc = await getDb().collection('users').doc('test_user').get();
      const tt  = doc.data()?.tiktok;
      if (!tt?.access_token) return res.status(404).json({ error: 'No test_user doc or missing access_token' });

      const shopCipher  = tt.shop_cipher ?? null;
      const accessToken = tt.access_token;

      const url    = 'https://open-api.tiktokglobalshop.com/order/202309/orders/search';
      const path   = '/order/202309/orders/search';
      const body   = { page_size: 20, sort_by: 'CREATE_TIME', sort_type: 1 };
      const params = { app_key: process.env.TIKTOK_CLIENT_KEY, timestamp: Math.floor(Date.now() / 1000), shop_cipher: shopCipher };
      const { signInput, sign } = generateSignDebug(path, params, body);
      params.sign  = sign;
      const headers = {
        'x-tts-access-token': accessToken,
        'Content-Type':       'application/json',
      };

      const debugOut = {
        firestoreDoc: {
          userId:            'test_user',
          accessTokenPrefix: accessToken.slice(0, 40) + '...',
          accessTokenLength: accessToken.length,
          shopCipher,
          shopId:            tt.shop_id ?? tt.shop?.id ?? null,
        },
        signing: {
          signInput,
          signOutput: sign,
        },
        request: { url, params, headers: { 'x-tts-access-token': accessToken.slice(0,20) + '...[truncated]', 'Content-Type': 'application/json' }, body },
      };

      let tiktokResponse;
      try {
        const resp = await axios.post(url, body, { params, headers, timeout: 15000 });
        tiktokResponse = { httpStatus: resp.status, data: resp.data };
      } catch (axiosErr) {
        tiktokResponse = {
          httpStatus:   axiosErr.response?.status ?? null,
          data:         axiosErr.response?.data   ?? null,
          axiosMessage: axiosErr.message,
        };
      }

      return res.status(200).json({ debug: debugOut, tiktokResponse });
    } catch (err) {
      return res.status(500).json({ error: err.message, stack: err.stack });
    }
  }

  // ── /api/tiktok/orders — cookie/env token path (takes priority over Firestore) ─
  if (resource === 'orders') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const cookies     = _parseCookies(req);
    const accessToken = cookies.tiktok_access_token || process.env.TIKTOK_ACCESS_TOKEN;
    const shopId      = cookies.tiktok_shop_id      || process.env.TIKTOK_SHOP_ID;
    const shopCipher  = cookies.tiktok_shop_cipher  || process.env.TIKTOK_SHOP_CIPHER;
    const tokenSource = cookies.tiktok_access_token ? 'cookie' : (process.env.TIKTOK_ACCESS_TOKEN ? 'env' : 'none');

    console.log('[TikTok orders] token source:', tokenSource,
      '| token prefix:', accessToken?.slice(0, 20) + '...',
      '| shop_id:', shopId,
      '| shop_cipher:', shopCipher?.slice(0, 20) + '...');

    if (!accessToken) {
      // Fall through to Firestore path below
    } else {
      try {
        const { generateSign } = await import('../../lib/tiktokApi.js');
        const path      = '/order/202309/orders/search';
        const timestamp = Math.floor(Date.now() / 1000);
        const body      = { page_size: 20, sort_by: 'CREATE_TIME', sort_type: 1 };
        const params    = {
          app_key:    process.env.TIKTOK_APP_KEY || process.env.TIKTOK_CLIENT_KEY,
          timestamp,
          shop_cipher: shopCipher || undefined,
        };
        params.sign = generateSign(path, params, body);

        const url = `https://open-api.tiktokglobalshop.com${path}`;
        console.log('[TikTok orders] POST', url, '| params:', JSON.stringify(params));

        const resp = await fetch(url + '?' + new URLSearchParams(params).toString(), {
          method:  'POST',
          headers: { 'x-tts-access-token': accessToken, 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        const data = await resp.json();
        console.log('[TikTok orders] http_status:', resp.status, '| response:', JSON.stringify(data));
        return res.status(200).json(data);
      } catch (err) {
        console.error('[TikTok orders] error:', err.message);
        return res.status(500).json({ error: err.message });
      }
    }
  }

  if (!VALID.includes(resource)) return res.status(404).json({ error: `Unknown resource: ${resource}` });

  // ── Mock mode ────────────────────────────────────────────────────────────────
  if (process.env.MOCK_MODE === 'true') {
    if (resource === 'orders')    return res.status(200).json(await getOrders(null, null, _p(req)));
    if (resource === 'products')  return res.status(200).json(await getProducts(null, null));
    if (resource === 'inventory') return res.status(200).json(await getInventory(null, null));
    if (resource === 'analytics') return res.status(200).json(await getAnalytics(null, null));
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  let tt;
  try {
    tt = (await getDb().collection('users').doc(userId).get()).data()?.tiktok;
    if (!tt?.access_token) return res.status(401).json({ error: 'TikTok not connected' });
  } catch (err) { return res.status(500).json({ error: err.message }); }

  // ── Fetch ────────────────────────────────────────────────────────────────────
  try {
    const token      = await getValidToken(userId, tt);
    const shopCipher = tt.shop_cipher ?? tt.shop?.cipher ?? null;

    if (resource === 'orders') {
      const result = await getOrders(token, shopCipher, _p(req));
      res.status(200).json(result);
      _bg(() => Promise.all([
        writeOrders(userId, result.orders.map(o => fromTikTokOrder(userId, o))),
        writeSyncLog({ userId, platform: 'tiktok', type: 'orders', status: 'success', recordsSynced: result.orders.length }),
      ]));
      return;
    }

    if (resource === 'products') {
      const result = await getProducts(token, shopCipher);
      res.status(200).json(result);
      _bg(() => Promise.all([
        writeProducts(userId, result.products.map(p => fromTikTokProduct(userId, p))),
        writeSyncLog({ userId, platform: 'tiktok', type: 'products', status: 'success', recordsSynced: result.products.length }),
      ]));
      return;
    }

    if (resource === 'inventory') return res.status(200).json(await getInventory(token, shopCipher));
    if (resource === 'analytics') return res.status(200).json(await getAnalytics(token, shopCipher));

  } catch (err) {
    console.error(`[tiktok/${resource}]`, err.message);
    if (err.code === 'REFRESH_TOKEN_EXPIRED')
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    if (!res.headersSent) {
      _bg(() => writeSyncLog({ userId, platform: 'tiktok', type: resource, status: 'error', errorMessage: err.message }));
      return res.status(500).json({ error: err.message, tiktokCode: err.tiktokCode ?? null });
    }
  }
}

const _p  = req => ({ page: parseInt(req.query.page) || 1, pageSize: parseInt(req.query.pageSize) || 20 });
const _bg = fn   => fn().catch(err => console.error('[tiktok] bg sync error:', err.message));
