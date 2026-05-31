'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { MOCK_PRODUCTS } from '@/lib/mockData';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StockPill({ value }) {
  const v = value ?? null;
  if (v === null) return <span className="text-gray-300 text-xs">—</span>;
  if (v === 0) return <span className="status-badge bg-red-100 text-red-600">Out of stock</span>;
  if (v < 5)  return <span className="status-badge bg-amber-100 text-amber-700">{v} left</span>;
  return <span className="text-sm font-semibold text-gray-800">{v}</span>;
}

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${type === 'error' ? 'bg-red-700' : 'bg-green-700'}`}>
      {msg}<button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">×</button>
    </div>
  );
}

// ── View Modal ────────────────────────────────────────────────────────────────

function ProductModal({ product, onClose }) {
  const tiktokStock = product.tiktok?.stock ?? product.tiktok_stock ?? null;
  const shopeeStock = product.shopee?.stock ?? product.shopee_stock ?? null;
  const hasMismatch = tiktokStock !== null && shopeeStock !== null && tiktokStock !== shopeeStock;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="relative h-40 bg-gray-100">
          {product.image_url ? <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-4xl">📦</div>}
          <button onClick={onClose} className="absolute top-3 right-3 rounded-full bg-white/90 p-1.5 shadow hover:bg-white">
            <svg className="h-4 w-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <div className="p-5">
          <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku || '—'}</p>
          <p className="text-xl font-bold text-gray-900 mt-2">{formatIDR(product.price)}</p>
          {hasMismatch && <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">⚠ Stock mismatch — TikTok ({tiktokStock}) ≠ Shopee ({shopeeStock})</div>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">TikTok Stock</p>
              <p className={`text-2xl font-bold ${tiktokStock === 0 ? 'text-red-500' : 'text-gray-900'}`}>{tiktokStock ?? '—'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Shopee Stock</p>
              <p className={`text-2xl font-bold ${shopeeStock === 0 ? 'text-red-500' : 'text-gray-900'}`}>{shopeeStock ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Panel ────────────────────────────────────────────────────────────────

function EditPanel({ product, inv, onClose, onSaved }) {
  const [form, setForm] = useState({
    tiktok_qty: String(product.tiktok?.stock ?? product.tiktok_stock ?? inv?.tiktok_qty ?? 0),
    shopee_qty: String(product.shopee?.stock ?? product.shopee_stock ?? inv?.shopee_qty ?? 0),
    price:      String(product.price ?? inv?.harga_jual ?? 0),
  });
  const [saving, setSaving] = useState(false);

  const origPrice = product.price ?? inv?.harga_jual ?? 0;

  async function save() {
    setSaving(true);
    try {
      const sku           = product.sku;
      const shopee_item_id = inv?.shopee_item_id ?? '';
      const priceChanged  = Number(form.price) !== Number(origPrice);

      // Stock update
      await fetch('/api/shopee/products-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_stock', sku, shopee_item_id,
          shopee_qty: Number(form.shopee_qty),
          tiktok_qty: Number(form.tiktok_qty),
        }),
      });

      // Price update if changed
      if (priceChanged) {
        await fetch('/api/shopee/products-action', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_price', sku, shopee_item_id, price: Number(form.price) }),
        });
      }

      onSaved({ shopee_qty: Number(form.shopee_qty), tiktok_qty: Number(form.tiktok_qty), price: Number(form.price) });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Edit Produk</h3>
            <p className="text-xs text-gray-400 mt-0.5">{product.name} {product.sku ? `— ${product.sku}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>

        <div className="space-y-4">
          {/* Stock override */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Override Stok</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">TikTok Qty</label>
                <input type="number" min="0" value={form.tiktok_qty}
                  onChange={e => setForm(p => ({ ...p, tiktok_qty: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Shopee Qty</label>
                <input type="number" min="0" value={form.shopee_qty}
                  onChange={e => setForm(p => ({ ...p, shopee_qty: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500" />
              </div>
            </div>
            <p className="text-[10px] text-amber-600 flex items-start gap-1">
              <span title="Nilai ini akan di-overwrite saat sync Google Sheets berikutnya">⚠️</span>
              Override manual — akan menggantikan nilai dari Google Sheets sync
            </p>
          </div>

          {/* Price override */}
          <div>
            <label className="text-xs font-medium text-gray-600">Harga (Rp)</label>
            <input type="number" min="0" value={form.price}
              onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            {!inv?.shopee_item_id && <p className="text-[10px] text-gray-400 mt-0.5">Set Shopee Item ID di Stock Management untuk sync harga ke Shopee</p>}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition">
              Batal
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Products() {
  const [products,  setProducts]  = useState([]);
  const [inventory, setInventory] = useState({}); // sku → inv doc
  const [loading,   setLoading]   = useState(true);
  const [viewMode,  setViewMode]  = useState('grid');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null);  // for view modal
  const [editing,   setEditing]   = useState(null);  // for edit panel
  const [toast,     setToast]     = useState({ msg: null, type: 'success' });

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: null }), 4000);
  }

  useEffect(() => {
    Promise.all([
      api.get('/api/tiktok/products').then(({ data }) => data.products || []).catch(() => MOCK_PRODUCTS),
      fetch('/api/inventory/list').then(r => r.json()).then(d => d.items ?? []).catch(() => []),
    ]).then(([prods, invItems]) => {
      setProducts(prods.length > 0 ? prods : MOCK_PRODUCTS);
      const map = {};
      invItems.forEach(item => { if (item.sku) map[item.sku] = item; });
      setInventory(map);
    }).finally(() => setLoading(false));
  }, []);

  function refreshProducts() {
    Promise.all([
      api.get('/api/tiktok/products').then(({ data }) => data.products || []).catch(() => products),
      fetch('/api/inventory/list').then(r => r.json()).then(d => d.items ?? []).catch(() => []),
    ]).then(([prods, invItems]) => {
      setProducts(prods);
      const map = {};
      invItems.forEach(item => { if (item.sku) map[item.sku] = item; });
      setInventory(map);
    });
  }

  const filtered = useMemo(() => products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const hasMismatch = useCallback(p => {
    const t = p.tiktok?.stock ?? p.tiktok_stock ?? null;
    const s = p.shopee?.stock ?? p.shopee_stock ?? null;
    return t !== null && s !== null && t !== s;
  }, []);

  function handleSaved(p, updates) {
    setEditing(null);
    setProducts(prev => prev.map(prod => {
      if ((prod.id || prod.sku) !== (p.id || p.sku)) return prod;
      return {
        ...prod,
        price: updates.price,
        tiktok_stock: updates.tiktok_qty,
        shopee_stock: updates.shopee_qty,
        tiktok: prod.tiktok ? { ...prod.tiktok, stock: updates.tiktok_qty } : prod.tiktok,
        shopee: prod.shopee ? { ...prod.shopee, stock: updates.shopee_qty } : prod.shopee,
      };
    }));
    setInventory(prev => {
      if (!p.sku) return prev;
      return { ...prev, [p.sku]: { ...prev[p.sku], ...updates } };
    });
    showToast('Produk berhasil diperbarui');
  }

  return (
    <div className="space-y-5">
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: null })} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="Search name or SKU..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-9 w-56 text-sm py-2" />
        </div>
        <span className="text-xs text-gray-500 ml-1">{filtered.length} products</span>
        <div className="ml-auto flex rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <button onClick={() => setViewMode('grid')} className={`px-3 py-2 transition ${viewMode==='grid'?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-50'}`}>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
          </button>
          <button onClick={() => setViewMode('table')} className={`px-3 py-2 transition ${viewMode==='table'?'bg-gray-900 text-white':'text-gray-500 hover:bg-gray-50'}`}>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0,1,2,3].map(i => <div key={i} className="skeleton h-52 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16"><p className="text-sm font-medium text-gray-500">No products found</p></div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map(p => {
            const tStock = p.tiktok?.stock ?? p.tiktok_stock ?? null;
            const sStock = p.shopee?.stock ?? p.shopee_stock ?? null;
            const mismatch = hasMismatch(p);
            return (
              <div key={p.id||p.sku} className={`card text-left p-0 overflow-hidden ${mismatch?'ring-2 ring-amber-300':''}`}>
                <button onClick={() => setSelected(p)} className="block w-full text-left hover:opacity-95 transition">
                  <div className="relative h-32 bg-gray-100">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-3xl bg-gradient-to-br from-gray-50 to-gray-200">📦</div>}
                    {mismatch && <span className="absolute top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">Mismatch</span>}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">SKU: {p.sku||'—'}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1.5">{formatIDR(p.price)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="rounded-lg bg-gray-50 px-2 py-1.5"><p className="text-gray-400">TikTok</p><p className={`font-bold mt-0.5 ${tStock===0?'text-red-500':tStock<5?'text-amber-600':'text-gray-900'}`}>{tStock??'—'}</p></div>
                      <div className="rounded-lg bg-gray-50 px-2 py-1.5"><p className="text-gray-400">Shopee</p><p className={`font-bold mt-0.5 ${sStock===0?'text-red-500':sStock<5?'text-amber-600':'text-gray-900'}`}>{sStock??'—'}</p></div>
                    </div>
                  </div>
                </button>
                <div className="px-3 pb-3 flex gap-2">
                  <button onClick={() => setEditing(p)} className="flex-1 text-[11px] border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium py-1.5 rounded-lg transition">Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">SKU</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-center font-medium">TikTok</th>
              <th className="px-4 py-3 text-center font-medium">Shopee</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => {
                const tStock = p.tiktok?.stock ?? p.tiktok_stock ?? null;
                const sStock = p.shopee?.stock ?? p.shopee_stock ?? null;
                const mismatch = hasMismatch(p);
                return (
                  <tr key={p.id||p.sku} className={`hover:bg-gray-50/50 transition-colors ${mismatch?'bg-amber-50/30':''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                          {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-lg">📦</div>}
                        </div>
                        <span className="font-medium text-gray-800">{p.name}</span>
                        {mismatch && <span className="status-badge bg-amber-100 text-amber-700 ml-1">Mismatch</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-500 hidden sm:table-cell">{p.sku}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-900 tabular-nums">{formatIDR(p.price)}</td>
                    <td className="px-4 py-3.5 text-center"><StockPill value={tStock} /></td>
                    <td className="px-4 py-3.5 text-center"><StockPill value={sStock} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelected(p)} className="text-xs text-[#0026CC] hover:underline font-medium">View</button>
                        <span className="text-gray-200">|</span>
                        <button onClick={() => setEditing(p)} className="text-xs text-blue-600 hover:underline font-medium border border-blue-200 px-2 py-0.5 rounded-md hover:bg-blue-50 transition">Edit</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ProductModal product={selected} onClose={() => setSelected(null)} />}
      {editing  && (
        <EditPanel
          product={editing}
          inv={inventory[editing.sku] ?? null}
          onClose={() => setEditing(null)}
          onSaved={updates => handleSaved(editing, updates)}
        />
      )}
    </div>
  );
}

export default function ProductsPage() {
  return <Layout><Products /></Layout>;
}
