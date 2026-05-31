'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtRp = v => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtNum = v => Number(v || 0).toLocaleString('id-ID');

function Skeleton({ h = 'h-20', w = 'w-full', className = '' }) {
  return <div className={`${h} ${w} rounded-xl bg-gray-200 animate-pulse ${className}`} />;
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color }) {
  const bg = { pink:'bg-[#0026CC]/10 text-[#0026CC]', blue:'bg-blue-50 text-blue-600', green:'bg-green-50 text-green-600', amber:'bg-amber-50 text-amber-600', purple:'bg-purple-50 text-purple-600' };
  return (
    <div className="card flex items-start gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${bg[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusCard({ label, count, color }) {
  const styles = { gray:'bg-gray-100 text-gray-600', blue:'bg-blue-100 text-blue-700', orange:'bg-orange-100 text-orange-700', green:'bg-green-100 text-green-700', red:'bg-red-100 text-red-700' };
  return (
    <div className="card text-center py-4">
      <p className="text-2xl font-bold text-gray-900">{fmtNum(count)}</p>
      <span className={`mt-1.5 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${styles[color]}`}>{label}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period,      setPeriod]      = useState('7');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async (p = period) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/shopee/summary?period=${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(period); }, [period]);

  function changePeriod(p) { setPeriod(p); }

  const PERIODS = [{ key: '7', label: '7 Hari' }, { key: '30', label: '30 Hari' }, { key: 'month', label: 'Bulan Ini' }];

  const rev = data?.revenue ?? {};
  const obs = data?.orders_by_status ?? {};
  const sa  = data?.stock_alerts ?? { out_of_stock: [], low_stock: [] };
  const tp  = data?.top_products ?? [];

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Period toggle */}
            <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => changePeriod(p.key)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${period === p.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {lastUpdated && <span className="text-xs text-gray-400">Synced {lastUpdated.toLocaleTimeString('id-ID')}</span>}
            <button onClick={() => load(period)} disabled={loading}
              className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg shadow-sm transition">
              {loading ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : '↺'} Refresh
            </button>
          </div>
        </div>

        {/* Revenue overview */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0,1,2,3].map(i => <Skeleton key={i} h="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Revenue"     value={fmtRp(rev.total)}      sub={`${fmtNum(rev.order_count)} pesanan`} icon="💰" color="pink" />
            <StatCard label="Total Pesanan"     value={fmtNum(rev.order_count)} sub={`${period === 'month' ? 'Bulan ini' : period + ' hari terakhir'}`} icon="📦" color="blue" />
            <StatCard label="Rata-rata Pesanan" value={fmtRp(rev.avg_order)}   sub="per transaksi" icon="📊" color="purple" />
            <StatCard label="Pesanan Selesai"   value={`${rev.completed_pct ?? 0}%`} sub={`dari ${fmtNum(rev.order_count)} pesanan`} icon="✅" color="green" />
          </div>
        )}

        {/* Orders by status */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[0,1,2,3,4].map(i => <Skeleton key={i} h="h-20" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatusCard label="Belum Bayar"   count={obs.unpaid}    color="gray" />
            <StatusCard label="Siap Kirim"    count={obs.to_ship}   color="blue" />
            <StatusCard label="Dikirim"       count={obs.shipping}  color="orange" />
            <StatusCard label="Selesai"       count={obs.completed} color="green" />
            <StatusCard label="Dibatalkan"    count={obs.cancelled} color="red" />
          </div>
        )}

        {/* Bottom two columns */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Top Products */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Top Produk</h2>
              <Link href="/products" className="text-xs text-[#0026CC] hover:underline font-medium">Lihat Semua →</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[0,1,2,3,4].map(i => <Skeleton key={i} h="h-12" />)}</div>
            ) : tp.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">Belum ada data penjualan</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 pr-2">#</th>
                      <th className="text-left pb-2 pr-3">Produk</th>
                      <th className="text-right pb-2 pr-3">Qty</th>
                      <th className="text-right pb-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tp.map((p, i) => (
                      <tr key={p.item_id} className="hover:bg-gray-50/50">
                        <td className="py-2 pr-2 text-gray-400 font-medium">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                              {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-sm">📦</div>}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate max-w-[120px]">{p.name || '—'}</p>
                              {p.sku && <p className="text-gray-400 font-mono">{p.sku}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-gray-700">{fmtNum(p.qty_sold)}</td>
                        <td className="py-2 text-right font-semibold text-gray-900 tabular-nums">{fmtRp(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stock Alerts */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Peringatan Stok</h2>
              <Link href="/stock-management" className="text-xs text-[#0026CC] hover:underline font-medium">Kelola Stok →</Link>
            </div>
            {loading ? (
              <div className="space-y-3">{[0,1,2,3].map(i => <Skeleton key={i} h="h-10" />)}</div>
            ) : sa.out_of_stock.length === 0 && sa.low_stock.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-medium text-green-600">Semua stok aman</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sa.out_of_stock.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 mb-2">❌ Habis ({sa.out_of_stock.length})</p>
                    <div className="space-y-1.5">
                      {sa.out_of_stock.slice(0, 5).map(item => (
                        <div key={item.sku} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-red-50">
                          <div>
                            <p className="text-xs font-medium text-gray-800 truncate max-w-[160px]">{item.name || item.sku}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{item.sku}</p>
                          </div>
                          <span className="text-[10px] bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full shrink-0">Habis</span>
                        </div>
                      ))}
                      {sa.out_of_stock.length > 5 && <p className="text-xs text-gray-400 pl-3">+{sa.out_of_stock.length - 5} lainnya</p>}
                    </div>
                  </div>
                )}
                {sa.low_stock.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 mb-2">⚠️ Hampir Habis ({sa.low_stock.length})</p>
                    <div className="space-y-1.5">
                      {sa.low_stock.slice(0, 5).map(item => (
                        <div key={item.sku} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-amber-50">
                          <div>
                            <p className="text-xs font-medium text-gray-800 truncate max-w-[160px]">{item.name || item.sku}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{item.sku}</p>
                          </div>
                          <span className="text-[10px] text-amber-700 font-semibold shrink-0">{item.current_stock} / {item.min_stock}</span>
                        </div>
                      ))}
                      {sa.low_stock.length > 5 && <p className="text-xs text-gray-400 pl-3">+{sa.low_stock.length - 5} lainnya</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </Layout>
  );
}
