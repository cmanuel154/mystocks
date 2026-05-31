import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';

let _db = null;

/**
 * Returns the Firestore instance. Initialises Firebase Admin on first call.
 * Throws FIREBASE_NOT_CONFIGURED if env vars are missing so callers can
 * return a clean 200 (unauthenticated) rather than crashing with a 500.
 */
export function getDb() {
  if (_db) return _db;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    const e = new Error('Firebase env vars not set (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
    e.code = 'FIREBASE_NOT_CONFIGURED';
    throw e;
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // Vercel stores the key with literal \n — restore real newlines here
        privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }

  _db = getFirestore();
  return _db;
}
