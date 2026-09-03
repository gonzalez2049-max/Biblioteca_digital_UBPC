const { json, handler } = require('../lib/http');
const { sql, ensureSchema } = require('../lib/db');

module.exports = handler(async (req, res) => {
  const out = { ok: true, db: false, time: new Date().toISOString() };
  try { await ensureSchema(); await sql`SELECT 1`; out.db = true; }
  catch (e) { out.ok = false; out.error = 'db_unavailable'; }
  return json(res, out.ok ? 200 : 503, out);
});
