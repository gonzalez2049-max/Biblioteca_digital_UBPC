const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { getUser, requirePerm } = require('../../lib/auth');
const { toResource, clean } = require('../../lib/resources');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET') {
    const scope = url.searchParams.get('scope') || 'public';
    if (scope === 'all') {
      // Vista de administración: todos los recursos. Requiere sesión.
      const u = getUser(req);
      if (!u) return json(res, 401, { error: 'unauthorized' });
      const { rows } = await sql`SELECT * FROM resources ORDER BY updated_at DESC`;
      return json(res, 200, { resources: rows.map(toResource) });
    }
    // Portada pública: solo recursos publicados.
    const { rows } = await sql`SELECT * FROM resources WHERE estado = 'publicado' ORDER BY updated_at DESC`;
    return json(res, 200, { resources: rows.map(toResource) });
  }

  if (req.method === 'POST') {
    const u = requirePerm(req, res, 'resources');
    if (!u) return;
    const c = clean(await readJson(req));
    if (!c.titulo) return json(res, 400, { error: 'bad_request', message: 'El título es obligatorio' });
    const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { rows } = await sql`
      INSERT INTO resources (id, titulo, descripcion, ruta, tema, roles, aprendizaje, tipo, autor, anio, keywords, tiempo, imagen_url, archivo, enlace, youtube, estado, creado_por, modificado_por)
      VALUES (${id}, ${c.titulo}, ${c.descripcion}, ${c.ruta}, ${c.tema}, ${JSON.stringify(c.roles)}, ${c.aprendizaje}, ${c.tipo}, ${c.autor}, ${c.anio}, ${c.keywords}, ${c.tiempo}, ${c.imagen_url}, ${c.archivo ? JSON.stringify(c.archivo) : null}, ${c.enlace}, ${c.youtube}, ${c.estado}, ${u.nombre}, ${u.nombre})
      RETURNING *`;
    await addAudit(u.nombre, `Creó “${c.titulo}” (${c.estado})`);
    return json(res, 201, { resource: toResource(rows[0]) });
  }

  return json(res, 405, { error: 'method_not_allowed' });
});
