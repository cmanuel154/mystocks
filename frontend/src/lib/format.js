const idrFmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatIDR = (amount) => idrFmt.format(amount || 0);

export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr));
};

export const formatRelative = (dateStr) => {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(dateStr);
};

const STATUS_MAP = {
  AWAITING_SHIPMENT: 'Awaiting Shipment',
  READY_TO_SHIP: 'Ready to Ship',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  CANCEL: 'Cancelled',
};

export const formatStatus = (s) => STATUS_MAP[s] || s;

export const statusClass = (s) => {
  if (!s) return 'status-pending';
  const u = s.toUpperCase();
  if (u.includes('CANCEL')) return 'status-cancelled';
  if (u === 'COMPLETED' || u === 'DELIVERED') return 'status-delivered';
  if (u === 'SHIPPED') return 'status-shipping';
  if (u === 'PROCESSING') return 'status-processing';
  return 'status-pending';
};
