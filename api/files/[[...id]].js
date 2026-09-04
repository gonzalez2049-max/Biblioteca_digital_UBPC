// Archivos consolidados: subir (/api/files POST) · metadatos/eliminar (/api/files/:id)
const { put, del } = require('@vercel/blob');
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema } = require('../../lib/db');
const { requirePerm } = require('../../lib/auth');
const { resolveBlobToken } = require('../../lib/env');

const MAX = 4 * 1024 * 1024; // ~3 MB útil (límite de cuerpo de función serverless ~4.5 MB)
const ALLOWED_EXT = /\.(pdf|docx?|pptx?|png|jpe?g|gif|webp|mp3|wav|m4a|ogg|mp4|webm|mov)$/i;

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const idp = req.query && req.query.id;
  const id = Array.isArray(idp) ? idp[0] : idp;

  if (!id) {
    // ---- Subir ----
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const b = await readJson(req);
    const filename = String(b.filename || '').trim();
    const contentType = String(b.contentType || 'application/octet-stream');
    const dataBase64 = String(b.dataBase64 || '');
    if (!filename || !dataBase64) return json(res, 400, { error: 'bad_request', message: 'Falta el archivo o su nombre' });
    if (!ALLOWED_EXT.test(filename)) return json(res, 415, { error: 'unsupported_type', message: 'Tipo no permitido. Usa PDF, Word, PowerPoint, imagen, audio o video.' });
    const raw = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
    const buf = Buffer.from(raw, 'base64');
    if (buf.length > MAX) return json(res, 413, { error: 'too_large', message: 'El archivo supera el máximo (~3 MB por el límite de la función serverless)' });
    const nid = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const safeName = filename.replace(/[^\w.\-]+/g, '_');
    const { token } = resolveBlobToken();
    const blob = await put(`recursos/${nid}/${safeName}`, buf, { access: 'public', contentType, addRandomSuffix: false, token });
    await sql`INSERT INTO files (id, name, type, size, url, pathname, uploaded_by)
      VALUES (${nid}, ${filename}, ${contentType}, ${buf.length}, ${blob.url}, ${blob.pathname}, ${u.nombre})`;
    return json(res, 201, { file: { id: nid, name: filename, type: contentType, size: buf.length, url: blob.url, by: u.nombre } });
  }

  // ---- Ítem ----
  if (req.method === 'GET') {
    const { rows } = await sql`SELECT id, name, type, size, url, uploaded_by, created_at FROM files WHERE id = ${id} LIMIT 1`;
    if (!rows[0]) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { file: rows[0] });
  }
  if (req.method === 'DELETE') {
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const { rows } = await sql`SELECT url FROM files WHERE id = ${id} LIMIT 1`;
    if (rows[0] && rows[0].url) { try { await del(rows[0].url, { token: resolveBlobToken().token }); } catch (e) { /* continuar */ } }
    await sql`DELETE FROM files WHERE id = ${id}`;
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: 'method_not_allowed' });
});
