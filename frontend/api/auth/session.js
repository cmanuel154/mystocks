import { getUserIdFromRequest, setAuthCookie } from '../../lib/auth.js';
import { getDb }                from '../../lib/firebase.js';

const EMPTY = { tiktokConnected: false, shopeeConnected: false, shop: null, user: null };

export default async function handler(req, res) {
  // POST /api/auth/session — simple admin login
  if (req.method === 'POST') {
    const { email, password } = req.body ?? {};
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      setAuthCookie(res, 'test_user');
      return res.status(200).json({ success: true, user: { email, name: 'Admin MyStocks' } });
    }
    return res.status(401).json({ success: false, message: 'Email atau password salah' });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (process.env.MOCK_MODE === 'true') {
    return res.status(200).json({
      tiktokConnected: true, shopeeConnected: false,
      shop: { id: 'mock-shop-001', name: 'MyStocks Demo Store', region: 'ID' },
      user: { open_id: 'mock-open-id', name: 'Demo Seller' },
    });
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(200).json(EMPTY);

  try {
    const doc = await getDb().collection('users').doc(userId).get();
    const tt  = doc.data()?.tiktok;
    if (!tt?.access_token) return res.status(200).json(EMPTY);
    return res.status(200).json({
      tiktokConnected: true, shopeeConnected: false,
      shop: tt.shop ?? null,
      user: { open_id: tt.open_id ?? null, name: tt.seller_name ?? null },
    });
  } catch (err) {
    if (err.code === 'FIREBASE_NOT_CONFIGURED') return res.status(200).json(EMPTY);
    console.error('[session]', err.message);
    return res.status(500).json({ error: 'Session lookup failed' });
  }
}
