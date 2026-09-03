const { del } = require('@vercel/blob');
const { json, handler } = require('../../lib/http');
const { sql, ensureSchema } = require('../../lib/db');
const { requirePerm, getUser } = require('../../lib/auth');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const url = new URL(req.url, 'http://x');
  const id = (req.query && req.query.id) || url.pathname.split('/').pop();

  if (req.method === 'GET') {
    // Metadatos + URL pública del archivo (para abrir / descargar).
    const { rows } = await sql`SELECT id, name, type, size, url, uploaded_by, created_at FROM files WHERE id = ${id} LIMIT 1`;
    if (!rows[0]) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { file: rows[0] });
  }

  if (req.method === 'DELETE') {
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const { rows } = await sql`SELECT url FROM files WHERE id = ${id} LIMIT 1`;
    if (rows[0] && rows[0].url) { try { await del(rows[0].url); } catch (e) { /* continuar */ } }
    await sql`DELETE FROM files WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'method_not_allowed' });
});
