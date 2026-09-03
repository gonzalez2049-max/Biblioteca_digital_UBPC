const { json, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit, DEFAULT_STATS } = require('../../lib/db');
const { requirePerm } = require('../../lib/auth');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // Solo el Administrador principal (permiso 'stats').
  const u = requirePerm(req, res, 'stats');
  if (!u) return;
  const fresh = { ...DEFAULT_STATS, interacciones: [{ t: new Date().toLocaleString('es-CL'), a: 'Estadísticas reiniciadas a cero' }] };
  await sql`UPDATE singletons SET data = ${JSON.stringify(fresh)} WHERE key = 'stats'`;
  await addAudit(u.nombre, 'Reinició las estadísticas de uso a cero');
  return json(res, 200, { stats: fresh });
});
