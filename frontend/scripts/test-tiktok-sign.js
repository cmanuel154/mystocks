import crypto from 'crypto';

const APP_KEY     = '6k141dgdv1bl4';
const APP_SECRET  = '52ab0b9b10ffbbfba8b50172431074a0438f5c2d';
const ACCESS_TOKEN = 'ROW_I6ldRQAAAAARaTd67iVwZbvJj7plvfhj732NVmArsnu7WKTe2k40Jl9u72Qt3K-vA3ej85viQfeVzsP6mIa180B-pWa3_F8pBGlHJX3uKB4PWB2HC38boJ02a89wvPorYQH6LZisTmtRt238zYSd6nlqqXnSmLejfhLRECVccVc8Y6uuVfbxvpRsm0fteRH1oMwhK7AO5ag';
const PATH        = '/authorization/202309/shops';
const timestamp   = Math.floor(Date.now() / 1000).toString();

const SHOP_CIPHER = 'ROW_nUDfCgAAAAClH2ul2A3UlwJikTm-od6E';
const SHOP_ID     = '7496233552847473236';

// Two param sets: without and with shop_cipher
const paramSets = [
  { label: 'no cipher', params: { app_key: APP_KEY, timestamp } },
  { label: 'with shop_cipher', params: { app_key: APP_KEY, timestamp, shop_cipher: SHOP_CIPHER } },
];

const hosts = [
  'https://open-api.tiktokglobalshop.com',
];

for (const { label, params } of paramSets) {
  const inner = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  const variants = [
    { name: `[${label}] v1 SECRET+inner+SECRET`,      base: APP_SECRET + inner + APP_SECRET },
    { name: `[${label}] v2 inner only`,               base: inner },
    { name: `[${label}] v3 PATH+inner`,               base: PATH + inner },
    { name: `[${label}] v4 SECRET+PATH+inner+SECRET`, base: APP_SECRET + PATH + inner + APP_SECRET },
    { name: `[${label}] v5 PATH+inner+SECRET`,        base: PATH + inner + APP_SECRET },
    { name: `[${label}] v6 SECRET+PATH+inner`,        base: APP_SECRET + PATH + inner },
  ];

  console.log(`\n=== param set: ${label} ===`);
  console.log('inner:', inner);

  for (const v of variants) {
    const sign = crypto.createHmac('sha256', APP_SECRET).update(v.base).digest('hex').toUpperCase();
    const qs   = new URLSearchParams({ ...params, sign }).toString();
    const url  = `https://open-api.tiktokglobalshop.com${PATH}?${qs}`;

    console.log(`\n  --- ${v.name} ---`);
    console.log('  sign:', sign);
    try {
      const res  = await fetch(url, { headers: { 'x-tts-access-token': ACCESS_TOKEN, 'Content-Type': 'application/json' } });
      const data = await res.json();
      console.log('  HTTP:', res.status, '| code:', data.code, '| message:', data.message);
      if (data.code === 0) { console.log('\n✓ SUCCESS!', JSON.stringify(data, null, 2)); process.exit(0); }
    } catch (err) {
      console.log('  fetch error:', err.message);
    }
  }
}
