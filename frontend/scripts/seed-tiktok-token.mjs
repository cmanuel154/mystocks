/**
 * seed-tiktok-token.mjs
 * Writes a TikTok access token directly to Firestore and prints a valid
 * ms_token JWT cookie so you can paste it into your browser for testing.
 *
 * Usage:  node scripts/seed-tiktok-token.mjs
 */

import { readFileSync }               from 'fs';
import { resolve, dirname }           from 'path';
import { fileURLToPath }              from 'url';
import { createHmac }                 from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }               from 'firebase-admin/firestore';
import jwt                            from 'jsonwebtoken';

// ── Load .env.local ─────────────────────────────────────────────────────────────
const __dir  = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '..', '.env.local');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let   val = trimmed.slice(eq + 1).trim();
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

// ── Firebase Admin ──────────────────────────────────────────────────────────────
const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, JWT_SECRET } = process.env;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('Missing Firebase env vars — check .env.local');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET — check .env.local');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();

// ── Token data ──────────────────────────────────────────────────────────────────
const USER_ID = 'test_user';

const tokenData = {
  tiktok: {
    access_token:  'ROW_IOVxYQAAAAARaTd67iVwZbvJj7plvfhj732NVmArsnu7WKTe2k40Jl9u72Qt3K-vA3ej85viQfeVzsP6mIa180B-pWa3_F8pBGlHJX3uKB4PWB2HC38boJ02a89wvPorYQH6LZisTmt7LI5tPWRwlzTasKB81uv3gHIITlTmnrrzH1IqJpDxesp9WTyverIR0-rDotR4Anw',
    shop_cipher:   'ROW_nUDfCgAAAAClH2ul2A3UlwJikTm-od6E',
    shop_id:       '74996233552847473236',
    app_key:       '6k141dgdv1bl4',
    connected:     true,
    // Fields session.js reads:
    open_id:       null,
    seller_name:   'Test Seller',
    shop: {
      id:     '7496233552847473236',
      name:   'Test TikTok Shop',
      region: 'ID',
    },
    updated_at: Date.now(),
  },
  shopee:     { connected: false },
  updated_at: Date.now(),
};

// ── Write to Firestore ──────────────────────────────────────────────────────────
console.log(`Writing tokens to users/${USER_ID} …`);
await db.collection('users').doc(USER_ID).set(tokenData, { merge: true });
console.log('✓ Firestore write complete');

// Verify by reading back
const snap = await db.collection('users').doc(USER_ID).get();
console.log('✓ Verified — access_token:', snap.data()?.tiktok?.access_token?.slice(0, 30) + '…');

// ── Generate JWT cookie ─────────────────────────────────────────────────────────
const msToken = jwt.sign({ userId: USER_ID }, JWT_SECRET, { expiresIn: '7d' });
console.log('\n── Paste this cookie into your browser (DevTools → Application → Cookies) ──');
console.log(`Name:   ms_token`);
console.log(`Value:  ${msToken}`);
console.log(`Domain: mystocks-dashboard.vercel.app`);
console.log(`Path:   /`);
console.log(`HttpOnly: true`);
console.log('\nOr set it via DevTools Console:');
console.log(`document.cookie = "ms_token=${msToken}; path=/; domain=mystocks-dashboard.vercel.app; SameSite=Lax"`);
