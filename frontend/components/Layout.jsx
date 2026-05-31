'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import AuthGuard from './AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { formatRelative } from '@/lib/format';

const PAGE_TITLES = {
  '/dashboard':        'Dashboard',
  '/orders':           'Pesanan',
  '/products':         'Products',
  '/inventory':        'Inventory',
  '/stock-management': 'Stock Management',
};

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { tiktokShopName, tiktokConnected, loading } = useAuth();

  // Auth guard disabled — all pages accessible without login (Phase 1.5 will add Google OAuth)
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0026CC] border-t-transparent" />
      </div>
    );
  }

  const title = PAGE_TITLES[pathname] || 'MyStocks';
  const now   = new Date().toISOString();

  return (
    <AuthGuard>
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 transition-transform duration-200 lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden -ml-1 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>

          <h1 className="text-base font-semibold text-gray-900">{title}</h1>

          <div className="ml-auto flex items-center gap-4">
            {tiktokConnected && tiktokShopName && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-100 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="text-xs font-medium text-gray-600 truncate max-w-[140px]">{tiktokShopName}</span>
              </div>
            )}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Synced {formatRelative(now)}
            </div>
          </div>
        </header>

        {/* Page content — children replaces <Outlet /> */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="p-4 lg:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
    </AuthGuard>
  );
}
