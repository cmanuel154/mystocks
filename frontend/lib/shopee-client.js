/**
 * lib/shopee-client.js — Shopee Open Platform V2 API client (Production)
 *
 * ENV VARS REQUIRED:
 *   SHOPEE_PARTNER_ID=2034402
 *   SHOPEE_PARTNER_KEY=shpk7a6262644f49465648574a566f6e6a424a4f4771707670756a545553424e
 *   SHOPEE_SANDBOX_BASE_URL=https://partner.shopeemobile.com
 *   SHOPEE_REDIRECT_URI=https://mystocks-dashboard.vercel.app/api/shopee/callback
 *   SHOPEE_SANDBOX_SHOP_ID=227533197
 *
 * Signing spec (V2):
 *   Public API:    HMAC-SHA256( partner_id + path + timestamp )
 *   Shop-level:    HMAC-SHA256( partner_id + path + timestamp + access_token + shop_id )
 */

import crypto from 'crypto';
import axios  from 'axios';
import { getDb } from './firebase.js';

// ── Config ─────────────────────────────────────────────────────────────────────

export const BASE_URL    = process.env.SHOPEE_SANDBOX_BASE_URL || 'https://partner.shopeemobile.com';
// API_URL is used for all API calls (token exchange, data endpoints).
// It can differ from BASE_URL if the OAuth and API hosts are different.
export const API_URL     = process.env.SHOPEE_SANDBOX_API_URL || process.env.SHOPEE_SANDBOX_BASE_URL || 'https://partner.shopeemobile.com';
export const PARTNER_ID  = Number(process.env.SHOPEE_PARTNER_ID  || 2034402);
export const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || '';
export const REDIRECT_URI = process.env.SHOPEE_REDIRECT_URI || '';
export const SANDBOX_SHOP_ID = Number(process.env.SHOPEE_SANDBOX_SHOP_ID || 227533197);

/** Unix epoch in seconds. */
export const ts = () => Math.floor(Date.now() / 1000);

// ── HMAC-SHA256 signature ──────────────────────────────────────────────────────

/**
 * Build Shopee V2 HMAC-SHA256 signature.
 *
 * Always reads env vars at call time (not from module-level constants) so
 * the key is guaranteed to be fresh on every invocation.
 *
 * Public API  (auth/partner endpoints — no token, no shop):
 *   base = `${partner_id}${path}${timestamp}`
 *
 * Shop-level API (data endpoints):
 *   base = `${partner_id}${path}${timestamp}${access_token}${shop_id}`
 */
export function buildSign(path, timestamp, accessToken = '', shopId = '') {
  const partnerId  = Number(process.env.SHOPEE_PARTNER_ID  || PARTNER_ID);
  const partnerKey = process.env.SHOPEE_PARTNER_KEY         || PARTNER_KEY;

  const base = accessToken
    ? `${partnerId}${path}${timestamp}${accessToken}${shopId}`
    : `${partnerId}${path}${timestamp}`;

  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

// ── OAuth helpers ──────────────────────────────────────────────────────────────

/**
 * Build the Shopee OAuth authorization URL.
 *
 * Signature base string for /api/v2/shop/auth_partner (PUBLIC endpoint):
 *   `${partner_id}${path}${timestamp}`
 *
 * URL is built with a template literal — NOT URLSearchParams — to avoid
 * any encoding differences in partner_id / timestamp / sign values.
 * The redirect URI is explicitly encodeURIComponent'd.
 */
export function buildAuthUrl() {
  // Read env vars fresh at call time — never rely on module-level captures
  const partnerId  = Number(process.env.SHOPEE_PARTNER_ID  || PARTNER_ID);
  const partnerKey =        process.env.SHOPEE_PARTNER_KEY  || PARTNER_KEY;
  const redirectUri =       process.env.SHOPEE_REDIRECT_URI || REDIRECT_URI;
  const baseUrl    =        process.env.SHOPEE_SANDBOX_BASE_URL || BASE_URL;

  const path      = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);

  // Public endpoint: base_string has NO access_token and NO shop_id
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign       = crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');

  // Debug — visible in Vercel Function Logs
  console.log('[Shopee] buildAuthUrl:');
  console.log(`  partner_id        = ${partnerId}  (${typeof partnerId})`);
  console.log(`  path              = ${path}`);
  console.log(`  timestamp         = ${timestamp}`);
  console.log(`  base_string       = ${baseString}`);
  console.log(`  sign              = ${sign}`);
  console.log(`  partner_key_len   = ${partnerKey.length}`);
  console.log(`  partner_key_first8= ${partnerKey.slice(0, 8)}...`);
  console.log(`  redirect_uri      = ${redirectUri}`);

  // Template literal — NOT URLSearchParams — ensures no unexpected encoding
  return `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUri)}`;
}

/**
 * Exchange authorization code for access_token + refresh_token.
 * Stores tokens in Firestore under shopee_tokens/{shop_id}.
 */
export async function exchangeCode(code, shopId) {
  const path      = '/api/v2/auth/token/get';
  const timestamp = ts();
  const signature = buildSign(path, timestamp);

  // partner_id belongs in query params only — NOT in the body
  const { data } = await axios.post(
    'https://partner.shopeemobile.com' + path,
    { code, shop_id: Number(shopId) },
    {
      params:  { partner_id: PARTNER_ID, timestamp, sign: signature },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  console.log('[Shopee] exchangeCode response:', JSON.stringify(data));

  if (data.error && data.error !== '') {
    const err = new Error(`Token exchange failed: [${data.error}] ${data.message ?? ''}`);
    err.shopeeError = data.error; err.requestId = data.request_id;
    throw err;
  }

  const tokens = {
    access_token:            data.access_token,
    refresh_token:           data.refresh_token,
    expire_in:               data.expire_in,
    access_token_expires_at: new Date(Date.now() + data.expire_in * 1000).toISOString(),
    shop_id:                 Number(shopId),
    updated_at:              new Date().toISOString(),
  };

  await saveTokens(shopId, tokens);
  console.log(`[Shopee] Tokens saved for shop_id=${shopId}`);
  return tokens;
}

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Read tokens from Firestore: shopee_tokens/{shop_id}
 */
export async function getTokens(shopId) {
  const doc = await getDb().collection('shopee_tokens').doc(String(shopId)).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Write/merge tokens to Firestore: shopee_tokens/{shop_id}
 * Fields: access_token, refresh_token, expire_in, access_token_expires_at, shop_id, updated_at
 */
export async function saveTokens(shopId, tokens) {
  await getDb().collection('shopee_tokens').doc(String(shopId)).set(
    { ...tokens, shop_id: Number(shopId), updated_at: new Date().toISOString() },
    { merge: true }
  );
}

/**
 * Return a valid access_token for the given shop_id.
 * If the current token is within 5 minutes of expiry, refresh it automatically.
 */
export async function getValidToken(shopId) {
  const tokens = await getTokens(shopId);
  if (!tokens?.access_token) {
    throw Object.assign(
      new Error(`No Shopee tokens found for shop_id=${shopId} — complete OAuth first`),
      { code: 'SHOPEE_NOT_CONNECTED' }
    );
  }

  const expiry = tokens.access_token_expires_at
    ? new Date(tokens.access_token_expires_at).getTime()
    : 0;
  const buffer = 5 * 60 * 1000; // 5 min

  if (expiry && Date.now() < expiry - buffer) {
    return tokens.access_token;    // still valid
  }

  // Token expired — refresh
  console.log(`[Shopee] Access token near/past expiry for shop_id=${shopId}, refreshing…`);
  const fresh = await doRefreshToken(shopId, tokens.refresh_token);
  return fresh.access_token;
}

/**
 * Refresh the access token using the stored refresh_token.
 * Persists new tokens to Firestore.
 */
export async function doRefreshToken(shopId, refreshToken) {
  const path      = '/api/v2/auth/access_token/get';
  const timestamp = ts();
  const signature = buildSign(path, timestamp);

  const { data } = await axios.post(
    'https://partner.shopeemobile.com' + path,
    { refresh_token: refreshToken, shop_id: Number(shopId), partner_id: PARTNER_ID },
    {
      params:  { partner_id: PARTNER_ID, timestamp, sign: signature },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  if (data.error && data.error !== '') {
    const err = new Error(`Token refresh failed: [${data.error}] ${data.message ?? ''}`);
    err.shopeeError = data.error;
    throw err;
  }

  const tokens = {
    access_token:            data.access_token,
    refresh_token:           data.refresh_token,
    expire_in:               data.expire_in,
    access_token_expires_at: new Date(Date.now() + data.expire_in * 1000).toISOString(),
    shop_id:                 Number(shopId),
    updated_at:              new Date().toISOString(),
  };

  await saveTokens(shopId, tokens);
  console.log(`[Shopee] Token refreshed for shop_id=${shopId}`);
  return tokens;
}

// ── Request wrappers ───────────────────────────────────────────────────────────

/**
 * Make a SHOP-LEVEL GET request (signed with access_token + shop_id).
 */
export async function shopGet(path, shopId, accessToken, params = {}) {
  const timestamp = ts();
  const signature = buildSign(path, timestamp, accessToken, String(shopId));

  const { data } = await axios.get('https://partner.shopeemobile.com' + path, {
    params:  { partner_id: PARTNER_ID, timestamp, sign: signature, shop_id: shopId, access_token: accessToken, ...params },
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  _checkError(path, data);
  return data;
}

/**
 * Make a SHOP-LEVEL POST request (signed with access_token + shop_id).
 */
export async function shopPost(path, shopId, accessToken, body = {}) {
  const timestamp = ts();
  const signature = buildSign(path, timestamp, accessToken, String(shopId));

  const { data } = await axios.post('https://partner.shopeemobile.com' + path, body, {
    params:  { partner_id: PARTNER_ID, timestamp, sign: signature, shop_id: shopId, access_token: accessToken },
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  _checkError(path, data);
  return data;
}

/** Throw a typed error if Shopee response contains a non-empty error field. */
function _checkError(path, data) {
  if (data?.error && data.error !== '') {
    const err = new Error(`Shopee [${path}]: ${data.error} — ${data.message ?? ''}`);
    err.shopeeError = data.error;
    err.shopeeMsg   = data.message;
    err.requestId   = data.request_id;
    throw err;
  }
}
