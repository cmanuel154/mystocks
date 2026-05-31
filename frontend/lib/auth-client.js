const KEY = 'mystocks_session';

export function getSession() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function isLoggedIn() {
  return getSession() !== null;
}

export function setSession(user) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(user));
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEY);
    window.location.href = '/login';
  }
}
