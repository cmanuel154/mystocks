/** Parse JSON body from a raw Node.js IncomingMessage. */
export async function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data',  c   => { raw += c.toString(); });
    req.on('end',   ()  => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    req.on('error', ()  => resolve({}));
  });
}

/** Returns { ok: true } or { ok: false, missing: string[] }. */
export function requireFields(obj, fields) {
  const missing = fields.filter(f => obj[f] === undefined || obj[f] === null || obj[f] === '');
  return { ok: missing.length === 0, missing };
}
