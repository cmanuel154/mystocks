'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn, setSession } from '@/lib/auth-client';

export default function LoginPage() {
  const router   = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Already logged in → go straight to dashboard
  useEffect(() => {
    if (isLoggedIn()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (d.success) {
        setSession(d.user);
        router.replace('/dashboard');
      } else {
        setError(d.message ?? 'Login gagal');
      }
    } catch {
      setError('Terjadi kesalahan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            <img src="/MyStocks.png" alt="MyStocks" className="h-16 w-16 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MyStocks</h1>
          <p className="mt-1 text-sm text-gray-500">Marketplace Dashboard</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-8 space-y-5">
          <h2 className="text-base font-semibold text-gray-900 text-center">Masuk ke MyStocks</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@mystocks.id"
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:border-[#0026CC] focus:ring-2 focus:ring-[#0026CC]/10 transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm pr-10 focus:outline-none focus:border-[#0026CC] focus:ring-2 focus:ring-[#0026CC]/10 transition"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                  {showPw
                    ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full rounded-xl bg-[#0026CC] hover:bg-[#0020A8] disabled:opacity-60 text-white font-semibold py-2.5 text-sm transition flex items-center justify-center gap-2">
              {loading
                ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Masuk…</>
                : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400">© 2026 MyStocks. All rights reserved.</p>
      </div>
    </div>
  );
}
