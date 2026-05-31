import jwt           from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const COOKIE  = 'ms_token';
const EXPIRES = '7d';
const MAX_AGE = 7 * 24 * 60 * 60; // seconds

// ── Cookie parsing ─────────────────────────────────────────────────────────────

export function parseCookies(req) {
  const raw = req.headers?.cookie ?? '';
  return Object.fromEntries(
    raw.split(';').map(c => {
      const i = c.indexOf('=');
      return i === -1 ? [c.trim(), ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
}

// ── JWT helpers ────────────────────────────────────────────────────────────────

/** Sign a token with payload { userId }. */
export function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET); // throws on invalid/expired
}

/** Extract userId from the ms_token cookie. Returns null if missing or invalid. */
export function getUserIdFromRequest(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  try {
    return verifyToken(token).userId ?? null;
  } catch {
    return null;
  }
}

// ── Cookie writers ─────────────────────────────────────────────────────────────

export function setAuthCookie(res, userId) {
  const token   = signToken(userId);
  const expires = new Date(Date.now() + MAX_AGE * 1000).toUTCString();
  const secure  = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}; Expires=${expires}`
  );
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

export function setStateCookie(res, state) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `oauth_state=${state}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=600`
  );
}

export function clearStateCookie(res) {
  res.setHeader('Set-Cookie', `oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

export function generateUserId() { return randomUUID(); }
