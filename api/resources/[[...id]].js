// Recursos consolidados: colección (/api/resources) e ítem (/api/resources/:id)
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { getUser, requirePerm } = require('../../lib/auth');
const { toResource, clean } = require('../../lib/resources');
const { del } = require('@vercel/blob');
const { resolveBlobToken } = require('../../lib/env');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const idp = req.query && req.query.id;
  const id = Array.isArray(idp) ? idp[0] : idp;
  const url = new URL(req.url, 'http://x');

  if (!id) {
    // ---- Colección ----
    if (req.method === 'GET') {
      const scope = url.searchParams.get('scope') || 'public';
      if (scope === 'all') {
        const u = getUser(req);
        if (!u) return json(res, 401, { error: 'unauthorized' });
        const { rows } = await sql`SELECT * FROM resources ORDER BY updated_at DESC`;
        return json(res, 200, { resources: rows.map(toResource) });
      }
      const { rows } = await sql`SELECT * FROM resources WHERE estado = 'publicado' ORDER BY updated_at DESC`;
      return json(res, 200, { resources: rows.map(toResource) });
    }
    if (req.method === 'POST') {
      const u = requirePerm(req, res, 'resources');
      if (!u) return;
      const c = clean(await readJson(req));
      if (!c.titulo) return json(res, 400, { error: 'bad_request', message: 'El título es obligatorio' });
      const nid = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { rows } = await sql`
        INSERT INTO resources (id, titulo, descripcion, ruta, tema, roles, aprendizaje, tipo, autor, anio, keywords, tiempo, imagen_url, archivo, enlace, youtube, estado, creado_por, modificado_por)
        VALUES (${nid}, ${c.titulo}, ${c.descripcion}, ${c.ruta}, ${c.tema}, ${JSON.stringify(c.roles)}, ${c.aprendizaje}, ${c.tipo}, ${c.autor}, ${c.anio}, ${c.keywords}, ${c.tiempo}, ${c.imagen_url}, ${c.archivo ? JSON.stringify(c.archivo) : null}, ${c.enlace}, ${c.youtube}, ${c.estado}, ${u.nombre}, ${u.nombre})
        RETURNING *`;
      await addAudit(u.nombre, `Creó “${c.titulo}” (${c.estado})`);
      return json(res, 201, { resource: toResource(rows[0]) });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // ---- Ítem ----
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const body = await readJson(req);
    const ex = await sql`SELECT * FROM resources WHERE id = ${id} LIMIT 1`;
    if (!ex.rows[0]) return json(res, 404, { error: 'not_found' });
    if (body.estado && Object.keys(body).length === 1) {
      const estado = ['borrador', 'publicado', 'oculto'].includes(body.estado) ? body.estado : ex.rows[0].estado;
      const { rows } = await sql`UPDATE resources SET estado = ${estado}, modificado_por = ${u.nombre}, updated_at = now() WHERE id = ${id} RETURNING *`;
      await addAudit(u.nombre, `${estado === 'publicado' ? 'Volvió a publicar' : estado === 'oculto' ? 'Ocultó' : 'Cambió a borrador'} “${rows[0].titulo}”`);
      return json(res, 200, { resource: toResource(rows[0]) });
    }
    const c = clean({ ...ex.rows[0], ...body, imagen: body.imagen !== undefined ? body.imagen : ex.rows[0].imagen_url, archivo: body.archivo !== undefined ? body.archivo : ex.rows[0].archivo });
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
    const ex = await sql`SELECT titulo, archivo FROM resources WHERE id = ${id} LIMIT 1`;
    if (!ex.rows[0]) return json(res, 404, { error: 'not_found' });
    const arch = ex.rows[0].archivo;
    if (arch && arch.url) { try { await del(arch.url, { token: resolveBlobToken().token }); } catch (e) { /* continuar */ } }
    await sql`DELETE FROM resources WHERE id = ${id}`;
    await addAudit(u.nombre, `Eliminó “${ex.rows[0].titulo}”`);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'method_not_allowed' });
});
