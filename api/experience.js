const { json, readJson, handler } = require('../lib/http');
const { sql, ensureSchema, addAudit } = require('../lib/db');
const { requirePerm } = require('../lib/auth');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  if (req.method === 'GET') {
    const { rows } = await sql`SELECT data FROM singletons WHERE key = 'experience'`;
    return json(res, 200, { experience: (rows[0] && rows[0].data) || {} });
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const u = requirePerm(req, res, 'content');
    if (!u) return;
    const body = await readJson(req);
    await sql`UPDATE singletons SET data = ${JSON.stringify(body || {})} WHERE key = 'experience'`;
    await addAudit(u.nombre, 'Editó los textos de la portada (Experiencia pública)');
    return json(res, 200, { experience: body || {} });
  }
  return json(res, 405, { error: 'method_not_allowed' });
});
