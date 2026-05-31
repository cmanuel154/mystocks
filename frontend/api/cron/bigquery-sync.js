/**
 * GET /api/cron/bigquery-sync
 * Vercel cron: runs at 18:00 UTC (01:00 WIB) daily.
 * Protected by CRON_SECRET (set automatically by Vercel in project settings).
 *
 * Manual trigger: GET /api/cron/bigquery-sync?secret=<CRON_SECRET>
 */
import { getDb }         from '../../lib/firebase.js';
import { runNightlySync } from '../../lib/bigquery.js';
import { writeSyncLog }   from '../../lib/sync.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth   = req.headers.authorization;
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}` && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const t0 = Date.now();
  console.log('[cron/bq-sync] Starting…');

  try {
    const db    = getDb();
    const since = new Date(Date.now() - 25 * 3600 * 1000);
    const snap  = await db.collection('orders').where('synced_at','>=',since).limit(200).get();
    const uids  = [...new Set(snap.docs.map(d => d.data().user_id).filter(Boolean))];

    console.log(`[cron/bq-sync] ${uids.length} active user(s)`);
    const results = [];

    for (const userId of uids) {
      try {
        const rpt = await runNightlySync(userId);
        results.push({ userId, ...rpt });
        const total = rpt.orders + rpt.products + rpt.customers + rpt.movements;
        await writeSyncLog({ userId, platform: 'bigquery', type: 'nightly_sync',
          status: rpt.errors.length ? 'partial' : 'success', recordsSynced: total,
          errorMessage: rpt.errors.length ? rpt.errors.join('; ') : null }).catch(() => {});
      } catch (err) {
        results.push({ userId, error: err.message });
        console.error(`[cron/bq-sync] userId=${userId}:`, err.message);
      }
    }

    return res.status(200).json({ success: true, users_synced: uids.length, results, elapsed_ms: Date.now()-t0 });
  } catch (err) {
    console.error('[cron/bq-sync] Fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
