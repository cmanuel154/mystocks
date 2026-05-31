/**
 * lib/shopee/api.js — Low-level Shopee Open Platform V2 request helpers.
 * Handles HMAC-SHA256 signing for both public and shop-level endpoints.
 */

import crypto from 'crypto';

const BASE_URL = 'https://partner.shopeemobile.com';

function _sign(path, timestamp, accessToken = '', shopId = '') {
  const pid = Number(process.env.SHOPEE_PARTNER_ID);
  const key = process.env.SHOPEE_PARTNER_KEY;
  const base = accessToken
    ? `${pid}${path}${timestamp}${accessToken}${shopId}`
    : `${pid}${path}${timestamp}`;
  return crypto.createHmac('sha256', key).update(base).digest('hex');
}

/** Signed GET request to a shop-level Shopee endpoint. */
export async function shopeeGet(path, extraParams, accessToken, shopId) {
  const pid = Number(process.env.SHOPEE_PARTNER_ID);
  const ts  = Math.floor(Date.now() / 1000);
  const sig = _sign(path, ts, accessToken, String(shopId));
  const params = new URLSearchParams({
    partner_id:   pid,
    timestamp:    ts,
    sign:         sig,
    shop_id:      shopId,
    access_token: accessToken,
    ...extraParams,
  });
  const url  = `${BASE_URL}${path}?${params.toString()}`;
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

/** Signed POST request to a shop-level Shopee endpoint. */
export async function shopeePost(path, body, accessToken, shopId) {
  const pid = Number(process.env.SHOPEE_PARTNER_ID);
  const ts  = Math.floor(Date.now() / 1000);
  const sig = _sign(path, ts, accessToken, String(shopId));
  const qs  = new URLSearchParams({
    partner_id: pid, timestamp: ts, sign: sig,
    shop_id: shopId, access_token: accessToken,
  });
  const url  = `${BASE_URL}${path}?${qs.toString()}`;
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
