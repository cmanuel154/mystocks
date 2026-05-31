// Frontend fallback data shown when API is unreachable (e.g. backend not running)
// Uses realistic beauty/cosmetics products matching a typical TikTok Shop seller

export const MOCK_PRODUCTS = [
  {
    id: 'P001', sku: 'LM-RED-01', name: 'Lipstik Matte Red Velvet',
    description: 'Lipstik matte long-lasting formula, warna red velvet tahan 12 jam',
    price: 85000, currency: 'IDR',
    image_url: 'https://placehold.co/300x300/fe2c55/white?text=Lipstik',
    tiktok: { product_id: 'TT-P001', status: 'ACTIVATE', stock: 42 },
    shopee: { item_id: 901001, status: 'NORMAL', stock: 45 },
  },
  {
    id: 'P002', sku: 'BO-CORAL-01', name: 'Blush On Coral Crush',
    description: 'Blush on warna coral natural, pigmented dan blendable',
    price: 120000, currency: 'IDR',
    image_url: 'https://placehold.co/300x300/ee4d2d/white?text=Blush',
    tiktok: { product_id: 'TT-P002', status: 'ACTIVATE', stock: 8 },
    shopee: { item_id: 901002, status: 'NORMAL', stock: 12 },
  },
  {
    id: 'P003', sku: 'FD-BEIGE-01', name: 'Foundation Porcelain Glow',
    description: 'Foundation coverage penuh, formula ringan cocok untuk kulit Asia',
    price: 195000, currency: 'IDR',
    image_url: 'https://placehold.co/300x300/f5e6d3/555?text=Foundation',
    tiktok: { product_id: 'TT-P003', status: 'ACTIVATE', stock: 0 },
    shopee: { item_id: 901003, status: 'NORMAL', stock: 3 },
  },
  {
    id: 'P004', sku: 'SS-MIST-01', name: 'Setting Spray Dewy Mist',
    description: 'Setting spray untuk tampilan dewy segar sepanjang hari',
    price: 95000, currency: 'IDR',
    image_url: 'https://placehold.co/300x300/a8d8ea/white?text=Setting+Spray',
    tiktok: { product_id: 'TT-P004', status: 'ACTIVATE', stock: 25 },
    shopee: { item_id: 901004, status: 'NORMAL', stock: 25 },
  },
];

export const MOCK_ORDERS = [
  {
    id: 'TT-ORD-7821', platform: 'tiktok', status: 'AWAITING_SHIPMENT',
    created_at: new Date(Date.now() - 1 * 3600000).toISOString(),
    total: 170000, currency: 'IDR', buyer_name: 'Rina Wulandari',
    items: [{ sku: 'LM-RED-01', name: 'Lipstik Matte Red Velvet', qty: 2, price: 85000 }],
  },
  {
    id: 'TT-ORD-7820', platform: 'tiktok', status: 'COMPLETED',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    total: 315000, currency: 'IDR', buyer_name: 'Siti Nurhaliza',
    items: [{ sku: 'BO-CORAL-01', name: 'Blush On Coral Crush', qty: 1, price: 120000 }, { sku: 'LM-RED-01', name: 'Lipstik Matte Red Velvet', qty: 1, price: 85000 }],
  },
  {
    id: 'SP-ORD-4491', platform: 'shopee', status: 'READY_TO_SHIP',
    created_at: new Date(Date.now() - 8 * 3600000).toISOString(),
    total: 195000, currency: 'IDR', buyer_name: 'Dewi Kartika',
    items: [{ sku: 'FD-BEIGE-01', name: 'Foundation Porcelain Glow', qty: 1, price: 195000 }],
  },
  {
    id: 'SP-ORD-4490', platform: 'shopee', status: 'SHIPPED',
    created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    total: 95000, currency: 'IDR', buyer_name: 'Ayu Pratiwi',
    items: [{ sku: 'SS-MIST-01', name: 'Setting Spray Dewy Mist', qty: 1, price: 95000 }],
  },
  {
    id: 'TT-ORD-7819', platform: 'tiktok', status: 'PROCESSING',
    created_at: new Date(Date.now() - 30 * 3600000).toISOString(),
    total: 290000, currency: 'IDR', buyer_name: 'Nurul Hidayah',
    items: [{ sku: 'FD-BEIGE-01', name: 'Foundation Porcelain Glow', qty: 1, price: 195000 }, { sku: 'SS-MIST-01', name: 'Setting Spray Dewy Mist', qty: 1, price: 95000 }],
  },
  {
    id: 'SP-ORD-4489', platform: 'shopee', status: 'COMPLETED',
    created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
    total: 240000, currency: 'IDR', buyer_name: 'Putri Andini',
    items: [{ sku: 'BO-CORAL-01', name: 'Blush On Coral Crush', qty: 2, price: 120000 }],
  },
  {
    id: 'TT-ORD-7818', platform: 'tiktok', status: 'CANCELLED',
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    total: 85000, currency: 'IDR', buyer_name: 'Maya Sari',
    items: [{ sku: 'LM-RED-01', name: 'Lipstik Matte Red Velvet', qty: 1, price: 85000 }],
  },
  {
    id: 'SP-ORD-4488', platform: 'shopee', status: 'AWAITING_SHIPMENT',
    created_at: new Date(Date.now() - 96 * 3600000).toISOString(),
    total: 400000, currency: 'IDR', buyer_name: 'Lestari Indah',
    items: [{ sku: 'FD-BEIGE-01', name: 'Foundation Porcelain Glow', qty: 1, price: 195000 }, { sku: 'BO-CORAL-01', name: 'Blush On Coral Crush', qty: 1, price: 120000 }, { sku: 'SS-MIST-01', name: 'Setting Spray Dewy Mist', qty: 1, price: 95000 }],
  },
];

export const MOCK_INVENTORY = MOCK_PRODUCTS.map(p => ({
  sku: p.sku,
  name: p.name,
  tiktok_product_id: p.tiktok.product_id,
  shopee_item_id: p.shopee.item_id,
  tiktok_stock: p.tiktok.stock,
  shopee_stock: p.shopee.stock,
  price: p.price,
}));
