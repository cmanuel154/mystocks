'use client';
import { useState } from 'react';
import axios from 'axios';

export default function StockSyncModal({ item, onClose, onSynced }) {
  const [quantity, setQuantity] = useState(
    Math.max(item.tiktok_stock ?? 0, item.shopee_stock ?? 0)
  );
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const { data } = await axios.post(
        '/api/inventory/sync',
        {
          sku: item.sku,
          quantity: Number(quantity),
          tiktok_product_id: item.tiktok_product_id || null,
          shopee_item_id: item.shopee_item_id || null,
        },
        { withCredentials: true }
      );
      setResult(data);
      if (data.tiktok?.success || data.shopee?.success) {
        onSynced?.({ ...item, tiktok_stock: data.tiktok?.success ? quantity : item.tiktok_stock, shopee_stock: data.shopee?.success ? quantity : item.shopee_stock });
      }
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
            <p className="text-sm text-gray-500">SKU: {item.sku}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        {/* Current stock comparison */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-xs font-medium text-gray-500 mb-1">TikTok Stock</p>
            <p className={`text-2xl font-bold ${item.tiktok_stock === null ? 'text-gray-300' : item.tiktok_stock === 0 ? 'text-red-500' : 'text-gray-900'}`}>
              {item.tiktok_stock ?? '—'}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-xs font-medium text-gray-500 mb-1">Shopee Stock</p>
            <p className={`text-2xl font-bold ${item.shopee_stock === null ? 'text-gray-300' : item.shopee_stock === 0 ? 'text-red-500' : 'text-gray-900'}`}>
              {item.shopee_stock ?? '—'}
            </p>
          </div>
        </div>

        {item.tiktok_stock !== item.shopee_stock && item.tiktok_stock !== null && item.shopee_stock !== null && (
          <div className="mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-700 border border-yellow-200">
            Stock mismatch detected — syncing will set both platforms to the same quantity.
          </div>
        )}

        {/* New quantity */}
        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">New Quantity</label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={e => setQuantity(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Platforms that will be updated */}
        <div className="mb-5 flex gap-2">
          {item.tiktok_product_id && (
            <span className="badge-tiktok">TikTok Shop</span>
          )}
          {item.shopee_item_id && (
            <span className="badge-shopee">Shopee</span>
          )}
          {!item.tiktok_product_id && !item.shopee_item_id && (
            <span className="text-sm text-gray-400">No platform IDs configured</span>
          )}
        </div>

        {/* Sync result */}
        {result && !result.error && (
          <div className="mb-4 space-y-2">
            {result.tiktok && !result.tiktok.skipped && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.tiktok.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <span>{result.tiktok.success ? '✓' : '✗'}</span>
                <span>TikTok: {result.tiktok.success ? 'Updated successfully' : result.tiktok.error || 'Failed'}</span>
              </div>
            )}
            {result.shopee && !result.shopee.skipped && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${result.shopee.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <span>{result.shopee.success ? '✓' : '✗'}</span>
                <span>Shopee: {result.shopee.success ? 'Updated successfully' : result.shopee.error || 'Failed'}</span>
              </div>
            )}
          </div>
        )}

        {result?.error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
            {result.error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {syncing ? 'Syncing...' : 'Sync to Both Platforms'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
