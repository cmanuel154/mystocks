import axios from 'axios';

// Empty string = same domain (Vercel serves both frontend and /api/* on one domain).
// For local dev use `vercel dev` so the same port handles everything.
export const API_URL = import.meta.env.VITE_API_URL ?? '';

const api = axios.create({
  baseURL:         API_URL,
  withCredentials: true,      // sends the ms_token httpOnly cookie
  timeout:         15000,
  headers:         { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: err.response.data }));
    }
    return Promise.reject(err);
  }
);

export default api;
