const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { requirePerm } = require('../../lib/auth');
const { toResource, clean } = require('../../lib/resources');
const { del } = require('@vercel/blob');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const url = new URL(req.url, 'http://x');
  const id = (req.query && req.query.id) || url.pathname.split('/').pop();

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const body = await readJson(req);
    const existing = await sql`SELECT * FROM resources WHERE id = ${id} LIMIT 1`;
    if (!existing.rows[0]) return json(res, 404, { error: 'not_found' });

    // Cambio rápido de estado (publicar / ocultar) sin reenviar todo el recurso.
    if (body.estado && Object.keys(body).length === 1) {
      const estado = ['borrador', 'publicado', 'oculto'].includes(body.estado) ? body.estado : existing.rows[0].estado;
      const { rows } = await sql`UPDATE resources SET estado = ${estado}, modificado_por = ${u.nombre}, updated_at = now() WHERE id = ${id} RETURNING *`;
      await addAudit(u.nombre, `${estado === 'publicado' ? 'Volvió a publicar' : estado === 'oculto' ? 'Ocultó' : 'Cambió a borrador'} “${rows[0].titulo}”`);
      return json(res, 200, { resource: toResource(rows[0]) });
    }

    const c = clean({ ...existing.rows[0], ...body, imagen: body.imagen !== undefined ? body.imagen : existing.rows[0].imagen_url, archivo: body.archivo !== undefined ? body.archivo : existing.rows[0].archivo });
    const { rows } = await sql`
      UPDATE resources SET titulo=${c.titulo}, descripcion=${c.descripcion}, ruta=${c.ruta}, tema=${c.tema}, roles=${JSON.stringify(c.roles)},
        aprendizaje=${c.aprendizaje}, tipo=${c.tipo}, autor=${c.autor}, anio=${c.anio}, keywords=${c.keywords}, tiempo=${c.tiempo},
        imagen_url=${c.imagen_url}, archivo=${c.archivo ? JSON.stringify(c.archivo) : null}, enlace=${c.enlace}, youtube=${c.youtube},
        estado=${c.estado}, modificado_por=${u.nombre}, updated_at=now()
      WHERE id=${id} RETURNING *`;
    await addAudit(u.nombre, `Editó “${c.titulo}”`);
    return json(res, 200, { resource: toResource(rows[0]) });
  }

  if (req.method === 'DELETE') {
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const existing = await sql`SELECT titulo, archivo FROM resources WHERE id = ${id} LIMIT 1`;
    if (!existing.rows[0]) return json(res, 404, { error: 'not_found' });
    // Elimina el archivo del Blob si lo tenía.
    const arch = existing.rows[0].archivo;
    if (arch && arch.url) { try { await del(arch.url); } catch (e) { /* continuar */ } }
    await sql`DELETE FROM resources WHERE id = ${id}`;
    await addAudit(u.nombre, `Eliminó “${existing.rows[0].titulo}”`);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'method_not_allowed' });
});
