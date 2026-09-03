// Registro de uso desde la portada pública (no requiere sesión).
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema } = require('../../lib/db');

function ts() {
  const d = new Date();
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

module.exports = handler(async (req, res) => {
  await ensureSchema();
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const b = await readJson(req);
  const type = b.type;
  const { rows } = await sql`SELECT data FROM singletons WHERE key = 'stats'`;
  const a = (rows[0] && rows[0].data) || {};
  a.interacciones = a.interacciones || [];
  a.aperturas = a.aperturas || {}; a.usoTema = a.usoTema || {}; a.usoRol = a.usoRol || {};
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
});
