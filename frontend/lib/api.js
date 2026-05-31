import axios from 'axios';

// NEXT_PUBLIC_API_BASE_URL replaces VITE_API_URL.
// Leave empty on Vercel (same domain). Set explicitly only when backend is on a different origin.
export const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

const api = axios.create({
  baseURL:         API_URL,
  withCredentials: true,
  timeout:         15000,
  headers:         { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired', { detail: err.response.data }));
      }
    }
    return Promise.reject(err);
  }
);

export default api;
