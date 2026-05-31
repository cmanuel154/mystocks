'use client';

import { useState, useCallback } from 'react';

const DEFAULT_TOKEN   = '69646d62775275624d756b74684c4874';
const DEFAULT_SHOP_ID = '227533197';

// ── Reusable UI primitives ────────────────────────────────────────────────────

function Card({ title, icon, loading, error, children, className = '' }) {
  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 border-b border-gray-700 pb-3">
        <span className="text-lg">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-200 tracking-wide uppercase">{title}</h2>
      </div>
      {loading && <div className="flex-1 flex items-center justify-center py-4"><div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}
      {!loading && error && <div className="text-xs text-red-400 bg-red-900/30 rounded-lg p-3 break-all">{error}</div>}
      {!loading && !error && children}
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-200 text-right break-all">{value ?? '—'}</span>
    </div>
  );
}

function Badge({ status }) {
  const map = {
    NORMAL: 'bg-green-900/50 text-green-400',
    UNPAID: 'bg-yellow-900/50 text-yellow-400',
    READY_TO_SHIP: 'bg-blue-900/50 text-blue-400',
    SHIPPED: 'bg-purple-900/50 text-purple-400',
    COMPLETED: 'bg-green-900/50 text-green-400',
    CANCELLED: 'bg-gray-800 text-gray-500',
    IN_CANCEL: 'bg-red-900/50 text-red-400',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-800 text-gray-400'}`}>{status}</span>;
}

function SyncBtn({ label, endpoint, onDone }) {
  const [state, setState] = useState({ loading: false, result: null });
  async function run() {
    setState({ loading: true, result: null });
    try {
      const r = await fetch(`/api/shopee/${endpoint}`);
      const d = await r.json();
      setState({ loading: false, result: d });
      if (onDone) onDone(d);
    } catch (e) {
      setState({ loading: false, result: { success: false, error: e.message } });
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <button onClick={run} disabled={state.loading}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2 justify-center">
        {state.loading ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Syncing…</> : label}
      </button>
      {state.result && (
        <p className={`text-xs ${state.result.success ? 'text-green-400' : 'text-red-400'}`}>
          {state.result.success ? `✅ ${state.result.records_synced ?? 0} records synced` : `❌ ${state.result.error}`}
        </p>
      )}
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl flex items-center gap-3 ${type === 'success' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100'}`}>
      <span>{type === 'success' ? '✅' : '❌'} {msg}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">×</button>
    </div>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-200 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ShopeeTestPage() {
  const [token,  setToken]  = useState(DEFAULT_TOKEN);
  const [shopId, setShopId] = useState(DEFAULT_SHOP_ID);

  const [shopState,     setShopState]     = useState({ loading: false, error: null, data: null });
  const [productsState, setProductsState] = useState({ loading: false, error: null, data: null });
  const [ordersState,   setOrdersState]   = useState({ loading: false, error: null, data: null });

  const [toast, setToast]   = useState({ msg: null, type: 'success' });
  const [modal, setModal]   = useState(null); // { type: 'ship'|'cancel', order_sn }
  const [modalData, setModalData] = useState({});
  const [actionLoading, setActionLoading] = useState(false);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: null }), 4000);
  }

  async function fetchOne(path, setState) {
    setState({ loading: true, error: null, data: null });
    try {
      const r = await fetch(`/api/shopee/${path}?access_token=${encodeURIComponent(token)}&shop_id=${encodeURIComponent(shopId)}`);
      const json = await r.json();
      if (json.response?.error && json.response.error !== '') {
        setState({ loading: false, error: `[${json.response.error}] ${json.response.message ?? ''}`, data: json });
      } else {
        setState({ loading: false, error: null, data: json });
      }
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }

  function fetchAll() {
    fetchOne('token-test', setShopState);
    fetchOne('products',   setProductsState);
    fetchOne('orders',     setOrdersState);
  }

  async function doOrderAction(endpoint, body) {
    setActionLoading(true);
    try {
      const r = await fetch(`/api/shopee/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.success) {
        showToast(d.message ?? 'Done', 'success');
        fetchOne('orders', setOrdersState);
      } else {
        showToast(d.error ?? 'Action failed', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActionLoading(false);
      setModal(null);
      setModalData({});
    }
  }

  const shopData    = shopState.data?.response?.response ?? shopState.data?.response;
  const productList = productsState.data?.response?.response?.item ?? [];
  const orderList   = ordersState.data?.response?.response?.order_list ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: null })} />

      {/* Ship modal */}
      <Modal open={modal?.type === 'ship'} title={`Ship Order: ${modal?.order_sn}`} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Tracking Number</label>
            <input value={modalData.tracking_number ?? ''} onChange={e => setModalData(p => ({ ...p, tracking_number: e.target.value }))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Logistics ID (optional)</label>
            <input value={modalData.logistics_id ?? ''} onChange={e => setModalData(p => ({ ...p, logistics_id: e.target.value }))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-orange-500" />
          </div>
          <button disabled={actionLoading} onClick={() => doOrderAction('ship-order', { order_sn: modal.order_sn, ...modalData })}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition">
            {actionLoading ? 'Shipping…' : 'Confirm Ship'}
          </button>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal open={modal?.type === 'cancel'} title={`Cancel Order: ${modal?.order_sn}`} onClose={() => setModal(null)}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">Cancel Reason</label>
            <select value={modalData.cancel_reason ?? ''} onChange={e => setModalData(p => ({ ...p, cancel_reason: e.target.value }))}
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-red-500">
              <option value="">Select reason…</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="CUSTOMER_REQUEST">Customer Request</option>
              <option value="UNDELIVERABLE_AREA">Undeliverable Area</option>
            </select>
          </div>
          <button disabled={actionLoading || !modalData.cancel_reason} onClick={() => doOrderAction('cancel-order', { order_sn: modal.order_sn, cancel_reason: modalData.cancel_reason })}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition">
            {actionLoading ? 'Cancelling…' : 'Confirm Cancel'}
          </button>
        </div>
      </Modal>

      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><span className="text-orange-400">🛒</span> Shopee Sandbox Tester</h1>
            <p className="text-xs text-gray-500 mt-0.5">Open Platform V2 — Sandbox</p>
          </div>
          <span className="text-xs bg-orange-900/40 text-orange-400 border border-orange-800 px-3 py-1 rounded-full">Sandbox</span>
        </div>

        {/* Credentials */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Credentials</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Access Token</label>
              <input value={token} onChange={e => setToken(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono focus:outline-none focus:border-orange-500 transition" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Shop ID</label>
              <input value={shopId} onChange={e => setShopId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono focus:outline-none focus:border-orange-500 transition" />
            </div>
          </div>
          <button onClick={fetchAll} disabled={shopState.loading || productsState.loading || ordersState.loading}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-900 disabled:text-orange-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition flex items-center gap-2">
            {(shopState.loading || productsState.loading || ordersState.loading)
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Fetching…</>
              : <><span>⚡</span> Fetch All Data</>}
          </button>
        </div>

        {/* Sync to BigQuery */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sync to BigQuery</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SyncBtn label="📦 Sync Orders"    endpoint="sync-orders"    />
            <SyncBtn label="🏷️ Sync Products"  endpoint="sync-products"  />
            <SyncBtn label="💰 Sync Finance"   endpoint="sync-finance"   />
            <SyncBtn label="📊 Sync Analytics" endpoint="sync-analytics" />
          </div>
          <p className="text-xs text-gray-600">Syncs Firestore-cached Shopee data to BigQuery dataset <code className="text-gray-400">mystocks</code> using MERGE (upsert).</p>
        </div>

        {/* API cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <Card title="Shop Info" icon="🏪" loading={shopState.loading} error={shopState.error}>
            {shopData ? (
              <div className="space-y-2">
                <KV label="Shop Name"   value={shopData.shop_name} />
                <KV label="Region"      value={shopData.region} />
                <KV label="Status"      value={shopData.status} />
                <KV label="Expire Time" value={shopData.expire_time ? new Date(shopData.expire_time * 1000).toLocaleString() : null} />
              </div>
            ) : !shopState.loading && <p className="text-xs text-gray-600 italic">No data yet</p>}
            {shopState.data && <details className="mt-1"><summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">Raw</summary><pre className="text-xs text-gray-500 bg-gray-800 rounded p-2 mt-1 overflow-auto max-h-32">{JSON.stringify(shopState.data?.response, null, 2)}</pre></details>}
          </Card>

          <Card title="Products" icon="📦" loading={productsState.loading} error={productsState.error}>
            {productsState.data && productList.length === 0 && <p className="text-xs text-gray-500 italic">No products found</p>}
            {productList.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500 border-b border-gray-800"><th className="text-left pb-2">Item ID</th><th className="text-left pb-2">Status</th></tr></thead>
                  <tbody>{productList.map((item, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-1.5 text-gray-300 font-mono">{item.item_id}</td>
                      <td className="py-1.5"><Badge status={item.item_status} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {!productsState.data && !productsState.loading && <p className="text-xs text-gray-600 italic">No data yet</p>}
          </Card>

          <Card title="Orders (raw)" icon="🧾" loading={ordersState.loading} error={ordersState.error}>
            {ordersState.data && orderList.length === 0 && <p className="text-xs text-gray-500 italic">No orders</p>}
            {orderList.length > 0 && (
              <div className="overflow-auto text-xs space-y-1">
                {orderList.map((o, i) => (
                  <div key={i} className="border-b border-gray-800/50 pb-1">
                    <span className="text-gray-300 font-mono">{o.order_sn}</span>{' '}
                    <Badge status={o.order_status} />
                  </div>
                ))}
              </div>
            )}
            {!ordersState.data && !ordersState.loading && <p className="text-xs text-gray-600 italic">No data yet</p>}
          </Card>
        </div>

        {/* Order Management */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Order Management</h2>
            <button onClick={() => fetchOne('orders', setOrdersState)}
              className="text-xs text-gray-500 hover:text-gray-300 transition">↺ Refresh</button>
          </div>

          {ordersState.loading && <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}
          {ordersState.error && <p className="text-xs text-red-400">{ordersState.error}</p>}

          {orderList.length === 0 && !ordersState.loading && (
            <p className="text-xs text-gray-600 italic">No orders — click Fetch All Data first</p>
          )}

          {orderList.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left pb-2 pr-4">Order SN</th>
                    <th className="text-left pb-2 pr-4">Status</th>
                    <th className="text-left pb-2 pr-4">Buyer</th>
                    <th className="text-left pb-2 pr-4">Amount</th>
                    <th className="text-left pb-2 pr-4">Created</th>
                    <th className="text-left pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orderList.map((o, i) => (
                    <tr key={i} className="border-b border-gray-800/50 align-middle">
                      <td className="py-2 pr-4 text-gray-300 font-mono">{o.order_sn}</td>
                      <td className="py-2 pr-4"><Badge status={o.order_status} /></td>
                      <td className="py-2 pr-4 text-gray-400">{o.buyer_username ?? '—'}</td>
                      <td className="py-2 pr-4 text-gray-300">{o.total_amount ? `${o.currency ?? 'IDR'} ${Number(o.total_amount).toLocaleString()}` : '—'}</td>
                      <td className="py-2 pr-4 text-gray-500">{o.create_time ? new Date(o.create_time * 1000).toLocaleDateString() : '—'}</td>
                      <td className="py-2">
                        <div className="flex gap-1 flex-wrap">
                          {['UNPAID', 'READY_TO_SHIP'].includes(o.order_status) && (
                            <button onClick={() => doOrderAction('accept-order', { order_sn: o.order_sn })}
                              className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded text-xs transition">Accept</button>
                          )}
                          {o.order_status === 'READY_TO_SHIP' && (
                            <button onClick={() => { setModal({ type: 'ship', order_sn: o.order_sn }); setModalData({}); }}
                              className="bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs transition">Ship</button>
                          )}
                          {!['COMPLETED', 'CANCELLED'].includes(o.order_status) && (
                            <button onClick={() => { setModal({ type: 'cancel', order_sn: o.order_sn }); setModalData({}); }}
                              className="bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded text-xs transition">Cancel</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
