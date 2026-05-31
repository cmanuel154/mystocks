'use client';
// Business logic is preserved exactly from src/pages/Inventory.jsx.
// Only changes: "use client", @/ imports, Layout wrapper.
import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import api from '@/lib/api';
import { formatIDR } from '@/lib/format';
import { MOCK_INVENTORY } from '@/lib/mockData';

function SyncBadge({ state }) {
  if (!state) return null;
  if (state === 'syncing') return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"><svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Syncing…</span>;
  if (state === 'success') return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>Synced</span>;
  if (state === 'partial') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">⚠ Partial</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>Failed</span>;
}

function PlatformResult({ label, result }) {
  if (!result || result.skipped) return null;
  return result.success
    ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">{label} ✓</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{label} ✗</span>;
}

function StockDisplay({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-300">—</span>;
  if (value === 0) return <span className="font-bold text-red-500">0</span>;
  if (value < 5)  return <span className="font-bold text-amber-600">{value}</span>;
  return <span className="font-semibold text-gray-800">{value}</span>;
}

function InventoryRow({ item, onSynced }) {
  const [editing, setEditing]     = useState(false);
  const [qty, setQty]             = useState('');
  const [syncState, setSyncState] = useState(null);
  const [result, setResult]       = useState(null);
  const [localItem, setLocalItem] = useState(item);

  const hasMismatch = localItem.tiktok_stock !== null && localItem.shopee_stock !== null && localItem.tiktok_stock !== localItem.shopee_stock;

  function startEdit() { setQty(String(Math.max(localItem.tiktok_stock ?? 0, localItem.shopee_stock ?? 0))); setEditing(true); setSyncState(null); setResult(null); }
  function cancelEdit() { setEditing(false); setQty(''); }

  async function handleSync() {
    const quantity = Number(qty);
    if (isNaN(quantity) || quantity < 0) return;
    setSyncState('syncing'); setResult(null);
    try {
      const { data } = await api.post('/api/inventory/sync', { sku: localItem.sku, quantity, tiktok_product_id: localItem.tiktok_product_id || null, shopee_item_id: localItem.shopee_item_id || null });
      setResult(data);
      const ttOk = data.tiktok?.success, spOk = data.shopee?.success;
      setSyncState(ttOk && spOk ? 'success' : (ttOk || spOk) ? 'partial' : 'error');
      const updated = { ...localItem, tiktok_stock: ttOk ? quantity : localItem.tiktok_stock, shopee_stock: spOk ? quantity : localItem.shopee_stock };
      setLocalItem(updated); onSynced?.(updated); setEditing(false);
    } catch (err) { setSyncState('error'); setResult({ error: err.response?.data?.error || err.message }); }
  }

  return (
    <tr className={`transition-colors ${hasMismatch ? 'bg-amber-50/40' : 'hover:bg-gray-50/50'}`}>
      <td className="px-5 py-3.5"><div><p className="text-sm font-medium text-gray-800">{localItem.name}</p>{localItem.price && <p className="text-xs text-gray-400 mt-0.5">{formatIDR(localItem.price)}</p>}</div></td>
      <td className="px-4 py-3.5 font-mono text-xs text-gray-500 hidden md:table-cell">{localItem.sku}</td>
      <td className="px-4 py-3.5 text-center"><div className="flex flex-col items-center gap-1"><StockDisplay value={localItem.tiktok_stock} />{result?.tiktok && <PlatformResult label="TikTok" result={result.tiktok} />}</div></td>
      <td className="px-4 py-3.5 text-center"><div className="flex flex-col items-center gap-1"><StockDisplay value={localItem.shopee_stock} />{result?.tiktok && <PlatformResult label="Shopee" result={result.shopee} />}</div></td>
      <td className="px-4 py-3.5 text-center hidden lg:table-cell">{hasMismatch ? <span className="status-badge bg-amber-100 text-amber-700">⚠ Mismatch</span> : <span className="text-green-500 text-xs">✓</span>}</td>
      <td className="px-4 py-3.5">
        {editing ? (
          <div className="flex items-center gap-2">
            <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} onKeyDown={e => { if (e.key==='Enter') handleSync(); if (e.key==='Escape') cancelEdit(); }} className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center font-semibold focus:border-[#0026CC] focus:outline-none focus:ring-2 focus:ring-[#0026CC]/20" autoFocus />
            <button onClick={handleSync} disabled={syncState==='syncing'} className="btn-primary py-1.5 px-3 text-xs disabled:opacity-60">{syncState==='syncing' ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : 'Sync'}</button>
            <button onClick={cancelEdit} className="btn-ghost py-1.5 px-2 text-xs text-gray-500">✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-2"><SyncBadge state={syncState} />{syncState !== 'syncing' && <button onClick={startEdit} className="btn-secondary py-1.5 px-3 text-xs">Edit Stock</button>}</div>
        )}
        {result?.error && <p className="text-[11px] text-red-500 mt-1">{result.error}</p>}
      </td>
    </tr>
  );
}

function Inventory() {
  const [inventory, setInventory]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [onlyMismatch, setOnlyMismatch]     = useState(false);
  const [bulkSyncing, setBulkSyncing]       = useState(false);
  const [bulkDone, setBulkDone]             = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/tiktok/inventory');
      const inv = data.products || data.inventory || [];
      setInventory(inv.length > 0 ? inv : MOCK_INVENTORY);
    } catch { setInventory(MOCK_INVENTORY); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  const handleSynced = useCallback(updated => setInventory(inv => inv.map(i => i.sku === updated.sku ? updated : i)), []);

  const mismatches = inventory.filter(i => i.tiktok_stock !== null && i.shopee_stock !== null && i.tiktok_stock !== i.shopee_stock);
  const filtered   = inventory.filter(i => {
    if (onlyMismatch && i.tiktok_stock === i.shopee_stock) return false;
    if (search) { const s = search.toLowerCase(); if (!i.sku?.toLowerCase().includes(s) && !i.name?.toLowerCase().includes(s)) return false; }
    return true;
  });

  async function bulkSyncMismatches() {
    if (!mismatches.length) return;
    setBulkSyncing(true); setBulkDone(false);
    try {
      const items = mismatches.map(i => ({ sku: i.sku, quantity: Math.max(i.tiktok_stock??0, i.shopee_stock??0), tiktok_product_id: i.tiktok_product_id||null, shopee_item_id: i.shopee_item_id||null }));
      const { data } = await api.post('/api/inventory/sync-bulk', { items });
      if (data.results) data.results.forEach(r => { const qty = items.find(i => i.sku===r.sku)?.quantity; if (qty!==undefined) handleSynced({ ...inventory.find(i => i.sku===r.sku), tiktok_stock: r.tiktok?.success?qty:undefined, shopee_stock: r.shopee?.success?qty:undefined }); });
      setBulkDone(true); load();
    } catch {} finally { setBulkSyncing(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="Search SKU or name…" value={search} onChange={e => setSearch(e.target.value)} className="input pl-9 w-52 text-sm py-2" />
        </div>
        {mismatches.length > 0 && <button onClick={() => setOnlyMismatch(v => !v)} className={`btn-secondary text-xs py-2 ${onlyMismatch?'border-amber-300 bg-amber-50 text-amber-700':''}`}>⚠ {mismatches.length} Mismatch{mismatches.length>1?'es':''}{onlyMismatch?' — Show all':' — Show only'}</button>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} className="btn-ghost text-xs py-2 px-3 text-gray-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Refresh</button>
          {mismatches.length > 0 && <button onClick={bulkSyncMismatches} disabled={bulkSyncing} className="btn-primary text-xs py-2">{bulkSyncing ? <><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Syncing {mismatches.length} items…</> : bulkDone ? '✓ All synced!' : <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Sync All Mismatches ({mismatches.length})</>}</button>}
        </div>
      </div>
      {!loading && mismatches.length > 0 && <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3"><svg className="h-5 w-5 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg><p className="text-sm text-amber-800"><strong>{mismatches.length} product{mismatches.length>1?'s have':' has'} mismatched stock</strong> between TikTok Shop and Shopee. Use "Sync All Mismatches" to equalise them.</p></div>}
      <div className="card p-0 overflow-hidden">
        {loading ? <div className="p-5 space-y-3">{[0,1,2,3].map(i=><div key={i} className="skeleton h-14 w-full"/>)}</div>
        : filtered.length === 0 ? <div className="flex flex-col items-center justify-center py-16"><p className="text-sm font-medium text-gray-500">No inventory found</p></div>
        : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Product</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">SKU</th>
              <th className="px-4 py-3 text-center font-medium"><span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#fe2c55]"/>TikTok</span></th>
              <th className="px-4 py-3 text-center font-medium"><span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#ee4d2d]"/>Shopee</span></th>
              <th className="px-4 py-3 text-center font-medium hidden lg:table-cell">Status</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">{filtered.map(item => <InventoryRow key={item.sku} item={item} onSynced={handleSynced}/>)}</tbody>
          </table></div>}
      </div>
      <p className="text-xs text-gray-400">{filtered.length} of {inventory.length} products shown{onlyMismatch&&' (mismatches only)'}</p>
    </div>
  );
}

export default function InventoryPage() {
  return <Layout><Inventory /></Layout>;
}
