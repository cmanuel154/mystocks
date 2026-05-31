'use client';

import { useEffect, useState, useMemo } from 'react';
import Layout from '@/components/Layout';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ status }) {
  if (status === 'AMAN')   return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">✅ AMAN</span>;
  if (status === 'RESTOK') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">⚠️ RESTOK</span>;
  return                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">❌ HABIS</span>;
}

function SummaryCard({ label, value, color }) {
  const colors = { blue:'bg-blue-50 border-blue-200 text-blue-700', green:'bg-green-50 border-green-200 text-green-700', yellow:'bg-yellow-50 border-yellow-200 text-yellow-700', red:'bg-red-50 border-red-200 text-red-700' };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>
      {msg}<button onClick={onClose} className="opacity-70 hover:opacity-100 ml-1">×</button>
    </div>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500";

function fmtTs(ts) {
  if (!ts) return null;
  const d = ts?.toDate ? ts.toDate() : new Date(ts._seconds ? ts._seconds * 1000 : ts);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StockManagementPage() {
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [filter,        setFilter]        = useState('Semua');
  const [toast,         setToast]         = useState({ msg: null, type: 'success' });
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [lastSynced,    setLastSynced]    = useState(null);

  // Edit modal
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoad, setEditLoad] = useState(false);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: null }), 6000);
  }

  async function loadItems() {
    setLoading(true);
    try {
      const r = await fetch('/api/inventory/list');
      const d = await r.json();
      const rows = d.items ?? [];
      setItems(rows);
      const synced = rows.find(i => i.last_synced_at);
      if (synced) setLastSynced(synced.last_synced_at);
      if (d.seeded) showToast('Data stok dimuat dari seed awal');
    } catch (e) {
      showToast('Gagal memuat data: ' + e.message, 'error');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadItems(); }, []);

  const total  = items.length;
  const aman   = items.filter(i => i.status === 'AMAN').length;
  const restok = items.filter(i => i.status === 'RESTOK').length;
  const habis  = items.filter(i => i.status === 'HABIS').length;

  const filtered = useMemo(() => items
    .filter(i => {
      if (filter === 'Aman')   return i.status === 'AMAN';
      if (filter === 'Restok') return i.status === 'RESTOK';
      if (filter === 'Habis')  return i.status === 'HABIS';
      return true;
    })
    .filter(i => !search || i.sku.toLowerCase().includes(search.toLowerCase()) || (i.name ?? i.nama_produk ?? '').toLowerCase().includes(search.toLowerCase())),
  [items, filter, search]);

  async function syncSheets() {
    setSyncingSheets(true);
    try {
      const r = await fetch('/api/inventory/sync-sheets');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const shopeeMsg = d.shopee_pushed > 0
        ? `, ${d.shopee_pushed} produk diupdate ke Shopee`
        : ', 0 produk diupdate (belum ada Shopee Item ID)';
      showToast(`✅ ${d.synced_skus} SKU disync${shopeeMsg}${d.errors.length ? ` — ${d.errors.length} error` : ''}`);
      await loadItems();
    } catch (err) {
      showToast('Sync gagal: ' + err.message, 'error');
    } finally { setSyncingSheets(false); }
  }

  function openEdit(item) {
    setEditItem(item);
    setEditForm({ min_stock: item.min_stock ?? 10, shopee_pct: item.shopee_pct ?? 80, shopee_item_id: item.shopee_item_id ?? '' });
  }

  async function submitSettings(e) {
    e.preventDefault();
    setEditLoad(true);
    try {
      const r = await fetch('/api/inventory/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: editItem.sku, ...editForm }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItems(prev => prev.map(i => i.sku === d.item.sku ? d.item : i));
      setEditItem(null);
      showToast(`Pengaturan ${d.item.sku} disimpan`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setEditLoad(false); }
  }

  return (
    <Layout>
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: null })} />

      {/* Edit Settings Modal */}
      <Modal open={!!editItem} title={`Pengaturan: ${editItem?.sku} — ${editItem?.name ?? editItem?.nama_produk}`} onClose={() => setEditItem(null)}>
        <form onSubmit={submitSettings} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Min Stok (threshold restok)</label>
            <input type="number" min="0" value={editForm.min_stock ?? ''} onChange={e => setEditForm(p => ({ ...p, min_stock: e.target.value }))} className={INPUT} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">{`Shopee % — ${editForm.shopee_pct ?? 80}% | TikTok ${100 - (editForm.shopee_pct ?? 80)}%`}</label>
            <input type="range" min="0" max="100" value={editForm.shopee_pct ?? 80}
              onChange={e => setEditForm(p => ({ ...p, shopee_pct: Number(e.target.value) }))}
              className="w-full accent-orange-500" />
            <div className="flex justify-between text-xs text-gray-400"><span>Shopee</span><span>TikTok</span></div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Shopee Item ID</label>
            <input type="text" value={editForm.shopee_item_id ?? ''} onChange={e => setEditForm(p => ({ ...p, shopee_item_id: e.target.value }))} className={INPUT} placeholder="e.g. 12345678" />
            <p className="text-[10px] text-gray-400">Diisi untuk auto-update stok ke Shopee saat sync</p>
          </div>
          <button type="submit" disabled={editLoad} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition">
            {editLoad ? 'Menyimpan…' : 'Simpan'}
          </button>
        </form>
      </Modal>

      <div className="space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total SKU"       value={total}  color="blue"   />
          <SummaryCard label="✅ Stok Aman"    value={aman}   color="green"  />
          <SummaryCard label="⚠️ Perlu Restok" value={restok} color="yellow" />
          <SummaryCard label="❌ Habis"        value={habis}  color="red"    />
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari SKU atau nama produk…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 min-w-0" />
          <div className="flex gap-1 shrink-0">
            {['Semua','Aman','Restok','Habis'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={syncSheets} disabled={syncingSheets}
            className="shrink-0 bg-green-600 hover:bg-green-500 disabled:bg-green-200 text-white text-xs font-semibold px-3 py-2 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap">
            {syncingSheets
              ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Syncing…</>
              : '🔄 Sync & Update Shopee'}
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
          <span className="shrink-0">ℹ️</span>
          <span>Stok otomatis diupdate ke Shopee setelah sync. Untuk link SKU ke produk Shopee, set <strong>Shopee Item ID</strong> di setiap SKU menggunakan tombol <strong>Edit</strong>.</span>
        </div>

        {/* Last synced */}
        {lastSynced && <p className="text-xs text-gray-400">Last sync: {fmtTs(lastSynced)}</p>}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['SKU','Nama Produk','Total Masuk','Shopee Qty','TikTok Qty','Status','Aksi']
                      .map(h => <th key={h} className="text-left px-3 py-2.5 text-gray-600 font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">Tidak ada data ditemukan</td></tr>
                  )}
                  {filtered.map(item => (
                    <tr key={item.sku} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                      <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{item.sku}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px]">
                        <p className="truncate">{item.name ?? item.nama_produk}</p>
                        {item.shopee_item_id && <p className="text-[10px] text-orange-400 mt-0.5">🛒 ID: {item.shopee_item_id}</p>}
                      </td>
                      <td className="px-3 py-2 text-right text-green-700 font-medium">{item.total_in ?? 0}</td>
                      <td className="px-3 py-2 text-right text-orange-700 font-bold">{item.shopee_qty ?? 0}</td>
                      <td className="px-3 py-2 text-right text-blue-700 font-medium">{item.tiktok_qty ?? 0}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><Badge status={item.status} /></td>
                      <td className="px-3 py-2">
                        <button onClick={() => openEdit(item)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-lg transition font-medium">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
              Menampilkan {filtered.length} dari {total} SKU
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
