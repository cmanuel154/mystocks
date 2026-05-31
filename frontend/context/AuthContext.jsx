'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { API_URL } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState({
    tiktokConnected:      false,
    shopeeConnected:      false,
    tiktokShopId:         null,
    shopeeShopId:         null,
    tiktokShopName:       null,
    tiktokSellerName:     null,
    tiktokTokenExpiresAt: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/session');
      setSession(data);
    } catch {
      setSession({ tiktokConnected: false, shopeeConnected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();

    const params = new URLSearchParams(window.location.search);
    if (params.has('tiktok') || params.has('shopee')) {
      fetchSession();
      window.history.replaceState({}, '', window.location.pathname);
    }

    const handleExpired = () => setSession(s => ({ ...s, tiktokConnected: false }));
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [fetchSession]);

  function connectTikTok()  { window.location.href = `${API_URL}/api/auth/tiktok`; }
  function connectShopee()  { window.location.href = `${API_URL}/api/auth/shopee`; }

  async function disconnectTikTok() { await api.post('/api/auth/tiktok/disconnect'); fetchSession(); }
  async function disconnectShopee() { await api.post('/api/auth/shopee/disconnect'); fetchSession(); }
  async function logout()           { await api.post('/api/auth/logout'); setSession({ tiktokConnected: false, shopeeConnected: false }); }

  const isConnected = session.tiktokConnected || session.shopeeConnected;

  return (
    <AuthContext.Provider value={{ ...session, isConnected, loading, connectTikTok, connectShopee, disconnectTikTok, disconnectShopee, logout, refreshSession: fetchSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
