import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const BASE_URL    = 'https://partner.shopeemobile.com';
const BUFFER_MS   = 5 * 60 * 1000; // 5 minutes

/**
 * Returns { access_token, shop_id } for the given userId.
 * Automatically refreshes via Shopee's token endpoint if within 5 min of expiry.
 * Throws if no Shopee credentials exist or refresh fails.
 */
export async function getValidToken(userId) {
  const doc  = await getDb().collection('users').doc(userId).get();
  const data = doc.data();
  const sp   = data?.shopee;

  if (!sp?.access_token) {
    throw Object.assign(
      new Error(`No Shopee credentials for userId=${userId} — complete OAuth first`),
      { code: 'SHOPEE_NOT_CONNECTED' }
    );
  }

  const stillValid = sp.expire_at && Date.now() < sp.expire_at - BUFFER_MS;
  if (stillValid) {
    return { access_token: sp.access_token, shop_id: sp.shop_id };
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  console.log(`[Shopee getValidToken] token near/past expiry for userId=${userId}, refreshing…`);

  const partner_id  = Number(process.env.SHOPEE_PARTNER_ID);
  const partner_key = process.env.SHOPEE_PARTNER_KEY;
  const path        = '/api/v2/auth/access_token/get';
  const timestamp   = Math.floor(Date.now() / 1000);
  const base_string = `${partner_id}${path}${timestamp}`;
  const sign        = crypto.createHmac('sha256', partner_key).update(base_string).digest('hex');

  const url  = `${BASE_URL}${path}?partner_id=${partner_id}&timestamp=${timestamp}&sign=${sign}`;
  const body = { shop_id: Number(sp.shop_id), refresh_token: sp.refresh_token, partner_id };

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  const raw = await resp.text();
  console.log('[Shopee getValidToken] refresh response:', raw);

  let result;
  try { result = JSON.parse(raw); } catch { result = null; }

  if (!result || result.error) {
    throw new Error(`Shopee token refresh failed: [${result?.error}] ${result?.message ?? raw}`);
  }

  const updated = {
    access_token:  result.access_token,
    refresh_token: result.refresh_token,
    expire_at:     Date.now() + (result.expire_in ?? 0) * 1000,
    updated_at:    FieldValue.serverTimestamp(),
  };

  await getDb().collection('users').doc(userId).set({ shopee: updated }, { merge: true });
  console.log(`[Shopee getValidToken] token refreshed for userId=${userId}`);

  return { access_token: result.access_token, shop_id: sp.shop_id };
}
