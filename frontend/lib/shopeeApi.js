import crypto from 'crypto';
import axios from 'axios';
import { getDb } from './firebase.js';

const OAUTH_URL = 'https://partner.shopeemobile.com';      // auth endpoints
const API_URL   = 'https://partner.shopeemobile.com'; // data endpoints

/**
 * Build the HMAC-SHA256 signature for Shopee API requests.
 */
function buildSignature({ path, timestamp, accessToken = '', shopId = '' }) {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;

  const base = accessToken
    ? `${partnerId}${path}${timestamp}${accessToken}${shopId}`
    : `${partnerId}${path}${timestamp}`;

  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

/**
 * Make a signed request to the Shopee Open Platform API.
 */
export async function shopeeRequest({ method = 'GET', path, params = {}, body = null, accessToken, shopId }) {
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const timestamp = Math.floor(Date.now() / 1000);

  const sign = buildSignature({
    path,
    timestamp,
    accessToken: accessToken || '',
    shopId: shopId ? String(shopId) : '',
  });

  const queryParams = {
    partner_id: partnerId,
    timestamp,
    sign,
    ...(shopId ? { shop_id: shopId } : {}),
    ...(accessToken ? { access_token: accessToken } : {}),
    ...params,
  };

  const url = API_URL + path;

  try {
    const response = await axios({
      method,
      url,
      params: method === 'GET' ? queryParams : { partner_id: partnerId, timestamp, sign, ...(shopId ? { shop_id: shopId } : {}), ...(accessToken ? { access_token: accessToken } : {}) },
      data: method !== 'GET' ? { ...body, ...params } : undefined,
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data?.error && response.data.error !== '') {
      const err = new Error(response.data.message || 'Shopee API error');
      err.code = response.data.error;
      err.platform = 'shopee';
      throw err;
    }

    return response.data;
  } catch (err) {
    if (!err.platform) {
      err.platform = 'shopee';
      err.code = err.code || 'SHOPEE_REQUEST_FAILED';
    }
    throw err;
  }
}

/**
 * Build the Shopee OAuth authorization URL.
 */
export function buildAuthUrl() {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const redirectUri = process.env.SHOPEE_REDIRECT_URI;
  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/shop/auth_partner';

  const sign = buildSignature({ path, timestamp });

  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp,
    sign,
    redirect: redirectUri,
  });

  return `${OAUTH_URL}${path}?${params.toString()}`;
}

/**
 * Exchange Shopee authorization code for tokens.
 */
export async function exchangeCode(code, shopId) {
  const path = '/api/v2/auth/token/get';
  const partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = buildSignature({ path, timestamp });

  const response = await axios.post(
    OAUTH_URL + path,
    { code, shop_id: Number(shopId), partner_id: partnerId },
    {
      params: { partner_id: partnerId, timestamp, sign },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (response.data?.error && response.data.error !== '') {
    const err = new Error(response.data.message || 'Shopee token exchange failed');
    err.code = response.data.error;
    err.platform = 'shopee';
    throw err;
  }

  const { access_token, refresh_token, expire_in } = response.data;
  return {
    access_token,
    refresh_token,
    shop_id: Number(shopId),
    expires_at: Date.now() + expire_in * 1000,
  };
}

/**
 * Token Manager: Retrieves a valid access token for a user.
 */
export async function getShopeeToken(userId) {
  if (process.env.MOCK_MODE === 'true') {
    return { accessToken: 'mock-shopee-token', shopId: 'mock-shopee-shop-id' };
  }

  const db = getDb();
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();

  if (!doc.exists) return null;
  const shopee = doc.data()?.shopee;
  if (!shopee || !shopee.access_token) return null;

  if (shopee.expire_at && Date.now() > shopee.expire_at) {
    console.warn(`[Shopee TokenManager] Token expired for user ${userId}`);
    return null;
  }

  return { accessToken: shopee.access_token, shopId: shopee.shop_id };
}
