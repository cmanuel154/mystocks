/**
 * lib/googleSheets.js
 * Reads MyStocks spreadsheet via the Google Visualization CSV export URL.
 * Works on any public spreadsheet — no API key, no encoding issues.
 *
 * Spreadsheet must be shared: "Anyone with the link" → Viewer.
 */

const SPREADSHEET_ID = '1eIA6q0dBC5xqM-1qkRi0Rpj2Rl3fMCRW_U3BTrqGIRo';

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

/** Minimal RFC-4180 CSV parser. Returns array of string arrays. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"')            { inQuote = false; }
      else                            { field += ch; }
    } else {
      if      (ch === '"')  { inQuote = true; }
      else if (ch === ',')  { row.push(field); field = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else { field += ch; }
    }
  }
  // last field / row
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Fetch CSV and parse to rows, skipping the first `skipRows` rows. */
async function fetchSheet(sheetName, skipRows = 3) {
  const url = csvUrl(sheetName);
  console.log('[GoogleSheets] fetching:', url);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      console.error(
        '[GoogleSheets] Access denied — make sure the spreadsheet is shared:\n' +
        '  Google Sheets → Share → "Anyone with the link" → Viewer'
      );
    }
    throw new Error(`Sheets CSV fetch failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  return parseCsv(text).slice(skipRows);
}

function toNum(v) {
  return Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
}

/**
 * Reads "Master Stok" sheet, skips rows 1-3 (header).
 * Columns: A=sku B=nama_produk C=harga_jual D=shopee_qty E=tiktok_qty F=lokasi_rak G=stok_awal
 */
export async function getMasterStok() {
  const rows = await fetchSheet('Master Stok', 3);
  return rows
    .filter(r => r[0]?.trim())
    .map(r => ({
      sku:         r[0]?.trim() ?? '',
      nama_produk: r[1]?.trim() ?? '',
      harga_jual:  toNum(r[2]),
      shopee_qty:  toNum(r[3]),
      tiktok_qty:  toNum(r[4]),
      lokasi_rak:  r[5]?.trim() ?? '',
      stok_awal:   toNum(r[6]),
    }));
}

/**
 * Reads "Log Masuk" sheet, skips rows 1-3 (header).
 * Columns: A=tanggal B=sku C=nama_produk D=supplier E=jumlah_masuk
 *          F=harga_beli G=shipping_per_pcs H=packing I=admin J=hpp_per_pcs
 * Skips rows where column B (sku) is empty.
 */
export async function getLogMasuk() {
  const rows = await fetchSheet('Log Masuk', 3);
  return rows
    .filter(r => r[1]?.trim())
    .map(r => ({
      tanggal:          r[0]?.trim() ?? '',
      sku:              r[1]?.trim() ?? '',
      nama_produk:      r[2]?.trim() ?? '',
      supplier:         r[3]?.trim() ?? '',
      jumlah_masuk:     toNum(r[4]),
      harga_beli:       toNum(r[5]),
      shipping_per_pcs: toNum(r[6]),
      packing:          toNum(r[7]),
      admin:            toNum(r[8]),
      hpp_per_pcs:      toNum(r[9]),
    }));
}

// Keep getSheetData export for backward compat (not used internally)
export async function getSheetData(sheetName) {
  return fetchSheet(sheetName, 0);
}
