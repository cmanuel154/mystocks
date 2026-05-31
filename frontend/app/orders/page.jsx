'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  UNPAID:              { label: 'Menunggu Pembayaran', tab: 'Menunggu Pembayaran', color: 'bg-gray-100 text-gray-600' },
  READY_TO_SHIP:       { label: 'Siap Diproses',       tab: 'Siap Diproses',       color: 'bg-blue-100 text-blue-700' },
  PROCESSED:           { label: 'Siap Diproses',       tab: 'Siap Diproses',       color: 'bg-blue-100 text-blue-700' },
  RETRY_SHIP:          { label: 'Siap Diproses',       tab: 'Siap Diproses',       color: 'bg-blue-100 text-blue-700' },
  SHIPPED:             { label: 'Dalam Pengiriman',    tab: 'Dalam Pengiriman',    color: 'bg-orange-100 text-orange-700' },
  IN_CANCEL:           { label: 'Dalam Pengiriman',    tab: 'Dalam Pengiriman',    color: 'bg-orange-100 text-orange-700' },
  TO_CONFIRM_RECEIVE:  { label: 'Dalam Pengiriman',    tab: 'Dalam Pengiriman',    color: 'bg-orange-100 text-orange-700' },
  COMPLETED:           { label: 'Selesai',             tab: 'Selesai',             color: 'bg-green-100 text-green-700' },
  CANCELLED:           { label: 'Dibatalkan',          tab: 'Dibatalkan',          color: 'bg-red-100 text-red-700' },
  TO_RETURN:           { label: 'Dibatalkan',          tab: 'Dibatalkan',          color: 'bg-red-100 text-red-700' },
};

const TABS = ['Semua', 'Menunggu Pembayaran', 'Siap Diproses', 'Dalam Pengiriman', 'Selesai', 'Dibatalkan'];
const CARRIERS = ['JNE', 'J&T', 'SiCepat', 'AnterAja', 'Ninja Express', 'Pos Indonesia', 'Lion Parcel', 'Wahana'];
const CANCEL_REASONS = [
  { value: 'OUT_OF_STOCK',      label: 'Stok habis' },
  { value: 'CUSTOMER_REQUEST',  label: 'Permintaan pembeli' },
  { value: 'UNDELIVERABLE_AREA',label: 'Area tidak terjangkau' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtRp  = v => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
const fmtTs  = v => v ? new Date(v * 1000).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const maskName = n => { if (!n) return '—'; if (n.length <= 2) return n; return n[0] + '***' + n.slice(-1); };

function statusInfo(s) { return STATUS_MAP[s] ?? { label: s, tab: 'Semua', color: 'bg-gray-100 text-gray-500' }; }

// ── UI primitives ─────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${type === 'success' ? 'bg-green-700' : 'bg-red-700'} text-white`}>
      {msg}<button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">×</button>
    </div>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SEL = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500";
const BTN = "w-full text-white text-sm font-semibold py-2 rounded-lg transition";

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      {[1,2,3,4,5,6].map(i => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${50 + i * 10}%` }} /></td>
      ))}
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab,     setActiveTab]     = useState('Semua');
  const [subTab,        setSubTab]        = useState('Perlu Diproses');
  const [search,        setSearch]        = useState('');
  const [selected,      setSelected]      = useState(new Set());
  const [courierFilter, setCourierFilter] = useState('Semua');
  const [toast,       setToast]       = useState({ msg: null, type: 'success' });
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [shipModal,      setShipModal]      = useState(null); // order_sn
  const [shipForm,       setShipForm]       = useState({ carrier: 'JNE', tracking: '' });
  const [cancelModal,    setCancelModal]    = useState(null); // order_sn or 'bulk'
  const [cancelReason,   setCancelReason]   = useState('OUT_OF_STOCK');
  const [shipMethodModal, setShipMethodModal] = useState(null); // 'pickup' | 'dropoff'
  const [printLoading,   setPrintLoading]   = useState(false);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: null }), 5000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/shopee/orders-list');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setOrders(d.orders ?? []);
      setLastUpdated(new Date());
    } catch (e) {
      showToast('Gagal memuat pesanan: ' + e.message, 'error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCourierFilter('Semua'); }, [activeTab, subTab]);

  // Tab counts
  const counts = useMemo(() => {
    const c = { Semua: orders.length };
    TABS.slice(1).forEach(t => { c[t] = orders.filter(o => statusInfo(o.order_status).tab === t).length; });
    return c;
  }, [orders]);

  const subCounts = useMemo(() => {
    const siapOrders = orders.filter(o => statusInfo(o.order_status).tab === 'Siap Diproses');
    return {
      'Perlu Diproses': siapOrders.filter(o => o.order_status === 'READY_TO_SHIP').length,
      'Telah Diproses': siapOrders.filter(o => o.order_status === 'PROCESSED').length,
    };
  }, [orders]);

  const filtered = useMemo(() => orders.filter(o => {
    if (activeTab !== 'Semua' && statusInfo(o.order_status).tab !== activeTab) return false;
    if (activeTab === 'Siap Diproses') {
      if (subTab === 'Perlu Diproses' && o.order_status !== 'READY_TO_SHIP') return false;
      if (subTab === 'Telah Diproses' && o.order_status !== 'PROCESSED') return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (o.order_sn ?? '').toLowerCase().includes(q)
          || (o.buyer_username ?? '').toLowerCase().includes(q);
    }
    return true;
  }), [orders, activeTab, subTab, search]);

  // Courier counts (from pre-courier-filter list) and final displayed list
  const courierOptions = useMemo(() => {
    const map = {};
    filtered.forEach(o => { const c = o.shipping_carrier; if (c) map[c] = (map[c] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const displayedOrders = useMemo(() =>
    courierFilter === 'Semua' ? filtered : filtered.filter(o => o.shipping_carrier === courierFilter),
    [filtered, courierFilter]
  );

  // Selection
  const allSelected = displayedOrders.length > 0 && displayedOrders.every(o => selected.has(o.order_sn));
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(displayedOrders.map(o => o.order_sn))); }
  function toggleOne(sn) { setSelected(prev => { const s = new Set(prev); s.has(sn) ? s.delete(sn) : s.add(sn); return s; }); }

  // Actions
  async function doAction(action, order_sns, extra = {}) {
    setActionLoading(true);
    try {
      const r = await fetch('/api/shopee/orders-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, order_sns, ...extra }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const ok = d.success?.length ?? 0;
      const err = d.failed?.length ?? 0;
      showToast(`${ok} pesanan berhasil${err ? `, ${err} gagal` : ''}`);
      setSelected(new Set());
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setActionLoading(false); }
  }

  const selArr = [...selected];
  const perluSelected = selArr.filter(sn => orders.find(x => x.order_sn === sn)?.order_status === 'READY_TO_SHIP');

  async function doShipOrders(method) {
    setActionLoading(true);
    try {
      const r = await fetch('/api/shopee/ship-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ order_sns: perluSelected, method }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const ok   = d.success?.length ?? 0;
      const fail = d.failed?.length  ?? 0;
      if (fail > 0 && method === 'pickup') {
        const firstErr = d.failed[0]?.error ?? 'Gagal';
        showToast(`${fail} pesanan gagal: ${firstErr}. Coba gunakan Drop Off.`, 'error');
      }
      setSelected(new Set());
      setShipMethodModal(null);
      if (ok > 0) {
        showToast(`${ok} pesanan diproses, mencetak resi…`);
        try {
          const pr = await fetch('/api/shopee/print-resi', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ order_sns: d.success }),
          });
          const pd = await pr.json();
          if (pd.url) window.open(pd.url, '_blank');
          else showToast('Resi tidak tersedia: ' + (pd.error ?? 'tidak ada URL'), 'error');
        } catch (pe) {
          showToast('Gagal mencetak resi: ' + pe.message, 'error');
        }
      }
      await load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setActionLoading(false); }
  }

  async function doPrintResi() {
    setPrintLoading(true);
    try {
      const sns = selArr.filter(sn => orders.find(x => x.order_sn === sn)?.order_status === 'PROCESSED');
      if (!sns.length) { showToast('Pilih pesanan yang sudah diproses', 'error'); return; }
      const r = await fetch('/api/shopee/print-resi', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ order_sns: sns }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.url) window.open(d.url, '_blank');
      else showToast('Tidak ada URL dokumen tersedia', 'error');
    } catch (e) {
      showToast(e.message, 'error');
    } finally { setPrintLoading(false); }
  }

  return (
    <Layout>
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: null })} />

      {/* Ship modal */}
      <Modal open={!!shipModal} title={`Input Resi — ${shipModal}`} onClose={() => setShipModal(null)}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 font-medium">Pilih Kurir</label>
            <select value={shipForm.carrier} onChange={e => setShipForm(p => ({ ...p, carrier: e.target.value }))} className={SEL + ' mt-1'}>
              {CARRIERS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 font-medium">Nomor Resi</label>
            <input value={shipForm.tracking} onChange={e => setShipForm(p => ({ ...p, tracking: e.target.value }))}
              className={SEL + ' mt-1'} placeholder="Masukkan nomor resi…" />
          </div>
          <button disabled={actionLoading || !shipForm.tracking}
            onClick={async () => { await doAction('ship', [shipModal], { tracking_number: shipForm.tracking, logistics_id: shipForm.carrier }); setShipModal(null); setShipForm({ carrier: 'JNE', tracking: '' }); }}
            className={BTN + ' bg-blue-600 hover:bg-blue-500 disabled:opacity-40'}>
            {actionLoading ? 'Memproses…' : 'Kirim'}
          </button>
        </div>
      </Modal>

      {/* Pickup / Drop Off confirm modal */}
      <Modal open={!!shipMethodModal}
        title={shipMethodModal === 'pickup' ? 'Konfirmasi Pickup' : 'Konfirmasi Drop Off'}
        onClose={() => setShipMethodModal(null)}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {shipMethodModal === 'pickup'
              ? `Atur pickup untuk ${perluSelected.length} pesanan? Kurir akan menjemput paket Anda.`
              : `Atur drop off untuk ${perluSelected.length} pesanan? Antar paket ke gerai kurir terdekat.`}
          </p>
          <button disabled={actionLoading}
            onClick={() => doShipOrders(shipMethodModal)}
            className={BTN + ' bg-[#0026CC] hover:bg-[#0020A8] disabled:opacity-40'}>
            {actionLoading ? 'Memproses…' : 'Konfirmasi'}
          </button>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal open={!!cancelModal} title={cancelModal === 'bulk' ? `Batalkan ${selArr.length} Pesanan` : `Batalkan — ${cancelModal}`} onClose={() => setCancelModal(null)}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 font-medium">Alasan Pembatalan</label>
            <select value={cancelReason} onChange={e => setCancelReason(e.target.value)} className={SEL + ' mt-1'}>
              {CANCEL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button disabled={actionLoading}
            onClick={async () => {
              const sns = cancelModal === 'bulk' ? selArr : [cancelModal];
              await doAction('cancel', sns, { cancel_reason: cancelReason });
              setCancelModal(null);
            }}
            className={BTN + ' bg-red-600 hover:bg-red-500 disabled:opacity-40'}>
            {actionLoading ? 'Memproses…' : 'Batalkan Pesanan'}
          </button>
        </div>
      </Modal>

      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">Pesanan</h1>
            <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">Shopee Sandbox</span>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-xs text-gray-400">Diperbarui: {lastUpdated.toLocaleTimeString('id-ID')}</span>}
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition font-medium">
              {loading ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : '↺'} Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto pb-0">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition -mb-px ${activeTab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
              {counts[t] > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === t ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sub-tabs for Siap Diproses */}
        {activeTab === 'Siap Diproses' && (
          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto pb-0">
            {['Perlu Diproses', 'Telah Diproses'].map(t => (
              <button key={t} onClick={() => setSubTab(t)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition -mb-px ${subTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${subTab === t ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {subCounts[t]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Courier filter pills */}
        {activeTab === 'Siap Diproses' && courierOptions.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCourierFilter('Semua')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition whitespace-nowrap ${courierFilter === 'Semua' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}>
              Semua ({filtered.length})
            </button>
            {courierOptions.map(([carrier, count]) => (
              <button key={carrier}
                onClick={() => setCourierFilter(carrier)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition whitespace-nowrap ${courierFilter === carrier ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}>
                {carrier} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nomor pesanan atau nama pembeli…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-500 min-w-0" />
          <div className="flex gap-2 shrink-0 flex-wrap">
            {/* Pickup / Drop Off — visible only in Perlu Diproses sub-tab */}
            {activeTab === 'Siap Diproses' && subTab === 'Perlu Diproses' && (
              <>
                <button
                  disabled={!perluSelected.length || actionLoading}
                  onClick={() => setShipMethodModal('pickup')}
                  className="text-xs bg-[#0026CC] hover:bg-[#0020A8] text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-40 whitespace-nowrap">
                  Pickup{perluSelected.length > 0 ? ` (${perluSelected.length})` : ''}
                </button>
                <button
                  disabled={!perluSelected.length || actionLoading}
                  onClick={() => setShipMethodModal('dropoff')}
                  className="text-xs bg-white border border-[#0026CC] text-[#0026CC] hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-40 whitespace-nowrap">
                  Drop Off{perluSelected.length > 0 ? ` (${perluSelected.length})` : ''}
                </button>
              </>
            )}
            {/* Print Resi — visible only in Telah Diproses sub-tab */}
            {activeTab === 'Siap Diproses' && subTab === 'Telah Diproses' && selArr.length > 0 && (
              <button
                disabled={printLoading}
                onClick={doPrintResi}
                className="text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-40 whitespace-nowrap">
                {printLoading ? 'Memuat…' : `Print Resi (${selArr.length})`}
              </button>
            )}
            {selArr.length > 0 && (
              <>
                <span className="text-xs text-gray-500 self-center">{selArr.length} dipilih</span>
                <button onClick={() => setCancelModal('bulk')}
                  className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-medium transition">
                  Batalkan
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Produk</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Pembayaran</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Pembeli</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Info Pesanan</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Pengiriman</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Status</th>
                  <th className="px-4 py-3 text-left text-gray-600 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && [1,2,3,4,5].map(i => <SkeletonRow key={i} />)}
                {!loading && displayedOrders.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl">📦</span>
                      <p className="font-medium text-gray-500">Tidak ada pesanan ditemukan</p>
                      <p className="text-xs text-gray-400">Coba ubah filter atau refresh data</p>
                    </div>
                  </td></tr>
                )}
                {!loading && displayedOrders.map(order => {
                  const si = statusInfo(order.order_status);
                  const items = order.item_list ?? [];
                  const addr = order.recipient_address ?? {};
                  return (
                    <tr key={order.order_sn} className="border-b border-gray-100 hover:bg-orange-50/30 align-top transition">

                      {/* Checkbox */}
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(order.order_sn)} onChange={() => toggleOne(order.order_sn)} className="rounded mt-0.5" />
                      </td>

                      {/* Product */}
                      <td className="px-4 py-3 max-w-[200px]">
                        {items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="flex gap-2 mb-1.5">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                              {item.inventory?.image_url
                                ? <img src={item.inventory.image_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">📦</div>}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate leading-tight">{item.item_name ?? item.inventory?.name ?? '—'}</p>
                              <p className="text-gray-400">{item.model_name ?? ''}</p>
                              <p className="text-gray-500">{fmtRp(item.model_discounted_price ?? item.model_original_price)} × {item.model_quantity_purchased ?? 1}</p>
                            </div>
                          </div>
                        ))}
                        {items.length > 2 && <p className="text-gray-400 text-[10px]">+{items.length - 2} produk lainnya</p>}
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-bold text-gray-900">{fmtRp(order.total_amount)}</p>
                        <p className="text-gray-400 mt-0.5">{order.payment_method ?? '—'}</p>
                      </td>

                      {/* Buyer */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-gray-800">{maskName(order.buyer_username)}</p>
                        <p className="text-gray-400 mt-0.5">{[addr.city, addr.state].filter(Boolean).join(', ') || '—'}</p>
                        <p className="text-gray-400">{addr.phone ? addr.phone.replace(/(\d{3})\d+(\d{3})/, '$1****$2') : '—'}</p>
                      </td>

                      {/* Order info */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-mono text-gray-700 text-[10px]">{order.order_sn}</p>
                        <p className="text-gray-400 mt-0.5">Pesan: {fmtTs(order.create_time)}</p>
                        {order.ship_by_date && (
                          <p className="text-orange-500 mt-0.5">⏰ Kirim sebelum: {fmtTs(order.ship_by_date)}</p>
                        )}
                        {order.message_to_seller && (
                          <p className="text-blue-500 mt-0.5 max-w-[140px] truncate">💬 {order.message_to_seller}</p>
                        )}
                      </td>

                      {/* Shipping */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-gray-700">{order.shipping_carrier ?? '—'}</p>
                        {order.tracking_number
                          ? <p className="font-mono text-gray-600 text-[10px] mt-0.5">{order.tracking_number}</p>
                          : <p className="text-gray-300 mt-0.5 text-[10px]">Belum ada resi</p>}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${si.color}`}>
                          {si.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          {['READY_TO_SHIP','PROCESSED','RETRY_SHIP'].includes(order.order_status) && (
                            <button onClick={() => { setShipModal(order.order_sn); setShipForm({ carrier: 'JNE', tracking: '' }); }}
                              className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-lg font-medium transition whitespace-nowrap">
                              Input Resi
                            </button>
                          )}
                          {!['COMPLETED','CANCELLED','TO_RETURN'].includes(order.order_status) && (
                            <button onClick={() => { setCancelModal(order.order_sn); setCancelReason('OUT_OF_STOCK'); }}
                              className="text-[10px] bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-700 px-2 py-1 rounded-lg font-medium transition whitespace-nowrap">
                              Batalkan
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            {displayedOrders.length} pesanan ditampilkan{courierFilter !== 'Semua' ? ` · ${courierFilter}` : ''}
          </div>
        </div>
      </div>
    </Layout>
  );
}
