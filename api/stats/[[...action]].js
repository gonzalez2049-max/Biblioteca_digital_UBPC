// Estadísticas consolidadas: /api/stats (GET) · /api/stats/track (POST) · /api/stats/reset (POST)
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit, DEFAULT_STATS } = require('../../lib/db');
const { requireAuth, requirePerm } = require('../../lib/auth');

function ts() {
  const d = new Date();
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const ap = req.query && req.query.action;
  const action = Array.isArray(ap) ? ap[0] : ap;

  // GET /api/stats  (requiere sesión)
  if (!action) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
    const u = requireAuth(req, res);
    if (!u) return;
    const { rows } = await sql`SELECT data FROM singletons WHERE key = 'stats'`;
    return json(res, 200, { stats: (rows[0] && rows[0].data) || {} });
  }

  // POST /api/stats/track  (público: registro de uso desde la portada)
  if (action === 'track') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const b = await readJson(req);
    const type = b.type;
    const { rows } = await sql`SELECT data FROM singletons WHERE key = 'stats'`;
    const a = (rows[0] && rows[0].data) || {};
    a.interacciones = a.interacciones || []; a.aperturas = a.aperturas || {}; a.usoTema = a.usoTema || {}; a.usoRol = a.usoRol || {};
    a.busquedas = a.busquedas || []; a.sinResultado = a.sinResultado || [];
    const push = (txt) => { a.interacciones.unshift({ t: ts(), a: txt }); a.interacciones = a.interacciones.slice(0, 80); };
    if (type === 'visit') { a.visitas = (a.visitas || 0) + 1; push('Visita al Centro público'); }
    else if (type === 'open') {
      if (b.resourceId) a.aperturas[b.resourceId] = (a.aperturas[b.resourceId] || 0) + 1;
      if (b.tema) a.usoTema[b.tema] = (a.usoTema[b.tema] || 0) + 1;
      if (b.rol) a.usoRol[b.rol] = (a.usoRol[b.rol] || 0) + 1;
      push('Apertura de “' + String(b.titulo || 'recurso') + '”');
    } else if (type === 'download') { a.descargas = (a.descargas || 0) + 1; push('Descarga de “' + String(b.name || 'archivo') + '”'); }
    else if (type === 'evi') { a.eviAperturas = (a.eviAperturas || 0) + 1; push('Recurso abierto desde EVI'); }
    else if (type === 'search') {
      const q = String(b.q || '').toLowerCase().trim();
      if (q.length >= 2) {
        const arr = (b.hits > 0) ? a.busquedas : a.sinResultado;
        const e = arr.find((x) => x[0] === q);
        if (e) e[1]++; else arr.push([q, 1]);
        arr.sort((x, y) => y[1] - x[1]); if (arr.length > 20) arr.length = 20;
        push((b.hits > 0 ? 'Búsqueda: “' : 'Búsqueda sin resultados: “') + q + '”');
      }
    } else { return json(res, 400, { error: 'bad_request', message: 'Tipo de evento no válido' }); }
    await sql`UPDATE singletons SET data = ${JSON.stringify(a)} WHERE key = 'stats'`;
    return json(res, 200, { ok: true });
  }

  // POST /api/stats/reset  (solo Administrador principal)
  if (action === 'reset') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    const u = requirePerm(req, res, 'stats');
    if (!u) return;
    const fresh = { ...DEFAULT_STATS, interacciones: [{ t: ts(), a: 'Estadísticas reiniciadas a cero' }] };
    await sql`UPDATE singletons SET data = ${JSON.stringify(fresh)} WHERE key = 'stats'`;
    await addAudit(u.nombre, 'Reinició las estadísticas de uso a cero');
    return json(res, 200, { stats: fresh });
  }

  return json(res, 404, { error: 'not_found' });
});
