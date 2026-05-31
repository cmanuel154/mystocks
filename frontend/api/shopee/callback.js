import crypto from 'crypto';
import { getDb } from '../../lib/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const FRONTEND = process.env.NEXT_PUBLIC_APP_URL || 'https://mystocks-dashboard.vercel.app';

export default async function handler(req, res) {
  const { code, shop_id } = req.query;

  const partner_id  = Number(process.env.SHOPEE_PARTNER_ID);
  const partner_key = process.env.SHOPEE_PARTNER_KEY;
  const base_url    = 'https://partner.shopeemobile.com';
  const path        = '/api/v2/auth/token/get';
  const timestamp   = Math.floor(Date.now() / 1000);

  const sign_variants = [
    { label: 'v1_standard',  base: `${partner_id}${path}${timestamp}` },
    { label: 'v2_with_code', base: `${partner_id}${path}${timestamp}${code}` },
    { label: 'v3_ts_first',  base: `${timestamp}${partner_id}${path}` },
  ].map(v => ({ ...v, sign: crypto.createHmac('sha256', partner_key).update(v.base).digest('hex') }));

  const { base: base_string, sign } = sign_variants[0];

  sign_variants.forEach(v => {
    console.log(`[Shopee callback] ${v.label} base:`, v.base);
    console.log(`[Shopee callback] ${v.label} sign:`, v.sign);
  });
  console.log('[Shopee callback] partner_id:', partner_id);
  console.log('[Shopee callback] partner_key_length:', partner_key?.length ?? 0);

  const url  = `${base_url}${path}?partner_id=${partner_id}&timestamp=${timestamp}&sign=${sign}`;
  const body = { code, shop_id: Number(shop_id), partner_id };

  console.log('[Shopee callback] POST', url);
  console.log('[Shopee callback] body:', JSON.stringify(body));

  let data;
  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    const responseText = await resp.text();
    console.log('[Shopee callback] http_status:', resp.status);
    console.log('[Shopee callback] response_body:', responseText);

    try { data = JSON.parse(responseText); } catch { data = { raw: responseText }; }

    if (!data || (data.error && data.error !== '')) {
      console.error('[Shopee callback] token exchange failed');
      console.error('[Shopee callback] error_code:', data?.error);
      console.error('[Shopee callback] error_message:', data?.message);
      console.error('[Shopee callback] request_id:', data?.request_id);
      console.error('[Shopee callback] full_response:', responseText);
      return res.redirect(302, `${FRONTEND}/dashboard?error=${encodeURIComponent(data?.error ?? 'unknown')}`);
    }
  } catch (err) {
    console.error('[Shopee callback] fetch error:', err.message);
    return res.redirect(302, `${FRONTEND}/dashboard?error=${encodeURIComponent(err.message)}`);
  }

  // ── Save tokens to Firestore ────────────────────────────────────────────────
  const USER_ID = 'test_user'; // hardcoded until Phase 1.5 multi-tenant
  try {
    await getDb().collection('users').doc(USER_ID).set({
      shopee: {
        connected:     true,
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        shop_id:       String(shop_id),
        partner_id:    String(partner_id),
        expire_at:     Date.now() + (data.expire_in ?? 0) * 1000,
        updated_at:    FieldValue.serverTimestamp(),
      },
    }, { merge: true });
    console.log(`[Shopee callback] tokens saved to Firestore: users/${USER_ID}`);
  } catch (err) {
    console.error('[Shopee callback] Firestore write failed:', err.message);
    // Non-blocking — continue to redirect
  }

  return res.redirect(302, `${FRONTEND}/dashboard`);
}
