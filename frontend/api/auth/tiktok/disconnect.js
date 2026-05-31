import { getDb }               from '../../../lib/firebase.js';
import { getUserIdFromRequest } from '../../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    await getDb().collection('users').doc(userId).set(
      { tiktok: null, updated_at: Date.now() }, { merge: true }
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[disconnect]', err.message);
    return res.status(500).json({ error: 'Disconnect failed' });
  }
}
