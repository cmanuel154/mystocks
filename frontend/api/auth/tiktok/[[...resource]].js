import { randomUUID }          from 'crypto';
import { getDb }               from '../../../lib/firebase.js';
import {
  setStateCookie, getUserIdFromRequest, clearStateCookie,
} from '../../../lib/auth.js';
import {
  buildAuthUrl, exchangeCode, getAuthorizedShops,
} from '../../../lib/tiktokApi.js';

const FRONTEND      = () => process.env.FRONTEND_URL       || 'https://mystocks-dashboard.vercel.app';
const FRONTEND_PROD =       process.env.NEXT_PUBLIC_APP_URL || 'https://mystocks-dashboard.vercel.app';

function setCookies(res, cookies) {
  const isSecure = process.env.NODE_ENV === 'production';
  const headers  = cookies.map(({ name, value, maxAge = 86400 * 7 }) =>
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure ? '; Secure' : ''}`
  );
  res.setHeader('Set-Cookie', headers);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query;

  // ── Merged from api/auth/tiktok/callback.js ───────────────────────────────
  if (action === 'callback') {
    const { code, state, error } = req.query;

    if (error) return res.redirect(`${FRONTEND()}/dashboard?tiktok_error=${error}`);
    if (!code)  return res.status(400).json({ error: 'No code provided' });

    const cookies = req.headers.cookie
      ? Object.fromEntries(req.headers.cookie.split('; ').map(c => c.split('=')))
      : {};
    const storedState = cookies.oauth_state;

    if (!state || state !== storedState) return res.status(400).json({ error: 'Invalid state' });

    clearStateCookie(res);

    const userId = getUserIdFromRequest(req);
    if (!userId) return res.redirect(`${FRONTEND()}/login?tiktok_error=auth_required`);

    try {
      const tokens = await exchangeCode(code);
      const shops  = await getAuthorizedShops(tokens.access_token);
      if (shops.length === 0)
        return res.redirect(`${FRONTEND()}/dashboard?tiktok_error=no_shops_authorized`);

      const primaryShop = shops[0];
      await getDb().collection('users').doc(userId).set({
        tiktok: {
          ...tokens,
          shop_id:   primaryShop.id,
          shop_name: primaryShop.name,
          region:    primaryShop.region,
        },
        updated_at: Date.now(),
      }, { merge: true });

      console.log(`[auth/tiktok/callback] Connected TikTok for user ${userId}`);
      return res.redirect(`${FRONTEND()}/dashboard?tiktok=connected`);
    } catch (err) {
      console.error('[auth/tiktok/callback] Error:', err);
      return res.redirect(`${FRONTEND()}/dashboard?tiktok_error=${encodeURIComponent(err.message)}`);
    }
  }

  // ── Merged from api/tiktok/callback.js ────────────────────────────────────
  if (action === 'tiktok-callback') {
    const { code, state, app_key, locale, shop_region, error: oauthError } = req.query;

    console.log('[TikTok callback] received params:', {
      code: code?.slice(0, 20) + '...', state, app_key, locale, shop_region, oauthError,
    });

    if (oauthError) {
      console.error('[TikTok callback] OAuth error:', oauthError);
      return res.redirect(302, `${FRONTEND_PROD}/login?error=${encodeURIComponent(oauthError)}`);
    }
    if (!code) {
      console.error('[TikTok callback] Missing code param');
      return res.redirect(302, `${FRONTEND_PROD}/login?error=missing_code`);
    }

    const appKey    = process.env.TIKTOK_APP_KEY    || process.env.TIKTOK_CLIENT_KEY;
    const appSecret = process.env.TIKTOK_APP_SECRET || process.env.TIKTOK_CLIENT_SECRET;

    const exchangeBody = {
      app_key:    appKey,
      app_secret: appSecret,
      auth_code:  code,
      grant_type: 'authorized_code',
    };

    console.log('[TikTok callback] token exchange request:', {
      url:        'https://auth.tiktok-shops.com/api/v2/token/get',
      app_key:    appKey,
      auth_code:  code?.slice(0, 20) + '...',
      grant_type: 'authorized_code',
    });

    try {
      const resp = await fetch('https://auth.tiktok-shops.com/api/v2/token/get', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(exchangeBody),
      });
      const raw = await resp.text();
      console.log('[TikTok callback] http_status:', resp.status);
      console.log('[TikTok callback] response:', raw);

      let data;
      try { data = JSON.parse(raw); } catch { data = null; }

      if (!data || data.code !== 0) {
        const msg = data?.message ?? `HTTP ${resp.status}: ${raw}`;
        console.error('[TikTok callback] token exchange failed:', msg);
        return res.redirect(302, `${FRONTEND_PROD}/login?error=${encodeURIComponent(msg)}`);
      }

      const { access_token, refresh_token, access_token_expire_in, open_id, seller_name } = data.data;
      console.log('[TikTok callback] success:', { open_id, seller_name, expires_in: access_token_expire_in });

      let shop_id = '';
      console.log('[TikTok callback] fetching shops...');
      try {
        const shopResp = await fetch('https://open-api.tiktokglobalshop.com/authorization/202309/shops', {
          headers: { 'x-tts-access-token': access_token, 'Content-Type': 'application/json' },
        });
        const shopData = await shopResp.json();
        console.log('[TikTok callback] shops response:', JSON.stringify(shopData));
        const shops = shopData?.data?.shops ?? [];
        if (shops.length > 0) shop_id = String(shops[0].shop_id ?? shops[0].id ?? '');
      } catch (e) {
        console.warn('[TikTok callback] getShops failed:', e.message);
      }

      console.log('[TikTok callback] setting cookies and redirecting, shop_id:', shop_id);

      setCookies(res, [
        { name: 'tiktok_access_token',  value: access_token,  maxAge: access_token_expire_in ?? 86400 * 7 },
        { name: 'tiktok_refresh_token', value: refresh_token, maxAge: 86400 * 90 },
        { name: 'tiktok_shop_id',       value: shop_id,       maxAge: 86400 * 90 },
        { name: 'tiktok_open_id',       value: open_id ?? '', maxAge: 86400 * 90 },
      ]);

      return res.redirect(302, `${FRONTEND_PROD}/dashboard`);
    } catch (err) {
      console.error('[TikTok callback] unexpected error:', err.message, err.stack);
      return res.redirect(302, `${FRONTEND_PROD}/login?error=${encodeURIComponent(err.message)}`);
    }
  }

  // ── Original index.js: OAuth initiation ──────────────────────────────────
  if (process.env.MOCK_MODE === 'true') return res.redirect(302, `${FRONTEND()}/dashboard`);

  if (!process.env.TIKTOK_CLIENT_KEY)
    return res.status(500).json({ error: 'TIKTOK_CLIENT_KEY not configured' });

  const state   = randomUUID();
  setStateCookie(res, state);
  const authUrl = buildAuthUrl(state);
  console.log(`[auth/tiktok] Redirecting. key=${process.env.TIKTOK_CLIENT_KEY}`);
  return res.redirect(302, authUrl);
}
