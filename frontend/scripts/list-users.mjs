import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, '..', '.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  let val = t.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[t.slice(0, eq).trim()] = val;
}

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })});
}

const db = getFirestore();
const snap = await db.collection('users').get();
console.log(`\nTotal docs in 'users': ${snap.size}\n`);
for (const doc of snap.docs) {
  const d = doc.data();
  const token = d?.tiktok?.access_token;
  console.log(`doc ID: "${doc.id}"`);
  console.log(`  tiktok.access_token : ${token ? token.slice(0, 40) + '...' : 'none'}`);
  console.log(`  tiktok.shop_id      : ${d?.tiktok?.shop_id ?? 'none'}`);
  console.log(`  shopee              : ${JSON.stringify(d?.shopee)}`);

  // Generate JWT for this doc ID
  const msToken = jwt.sign({ userId: doc.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  console.log(`  ms_token cookie     : ${msToken}`);
  console.log(`  document.cookie cmd : document.cookie = "ms_token=${msToken}; path=/; SameSite=Lax"`);
  console.log();
}
