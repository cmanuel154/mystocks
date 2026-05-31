import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ path, className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  orders: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  inventory: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
};

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/orders',    label: 'Orders',    icon: 'orders' },
  { to: '/products',  label: 'Products',  icon: 'products' },
  { to: '/inventory', label: 'Inventory', icon: 'inventory' },
];

function TikTokMark() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.79a4.85 4.85 0 01-1.02-.1z" />
    </svg>
  );
}

export default function Sidebar({ onClose }) {
  const { tiktokConnected, shopeeConnected, tiktokShopName, tiktokSellerName, logout } = useAuth();

  return (
    <aside className="flex h-full w-60 flex-col bg-sidebar select-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fe2c55] shadow-sm shrink-0">
          <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <span className="text-base font-bold text-white tracking-tight">MyStocks</span>
        {/* Mobile close */}
        {onClose && (
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white lg:hidden">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#fe2c55]/15 text-[#fe2c55]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex h-5 w-5 items-center justify-center ${isActive ? 'text-[#fe2c55]' : ''}`}>
                  <Icon path={ICONS[icon]} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Platform status */}
      <div className="px-3 pb-2 space-y-2">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1">Platforms</p>

        {/* TikTok */}
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-white/4 border border-white/5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white shrink-0">
            <TikTokMark />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">
              {tiktokShopName || tiktokSellerName || 'TikTok Shop'}
            </p>
            {tiktokConnected
              ? <p className="text-[10px] text-green-400 flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />Connected</p>
              : <p className="text-[10px] text-slate-500 flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-600" />Not connected</p>
            }
          </div>
        </div>

        {/* Shopee */}
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-white/4 border border-white/5 opacity-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#ee4d2d]/20 text-[#ee4d2d] shrink-0 text-[10px] font-bold">S</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-300">Shopee</p>
            <p className="text-[10px] text-slate-500">Coming soon</p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="border-t border-white/5 px-3 py-3">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 transition"
        >
          <Icon path={ICONS.logout} className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
