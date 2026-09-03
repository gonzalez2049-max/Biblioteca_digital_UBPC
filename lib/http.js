// Utilidades HTTP compartidas para las funciones serverless.
function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

// Lee el cuerpo de la petición como JSON (soporta el body ya parseado por Vercel o el stream crudo).
async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
    return req.body;
  }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 30 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Envuelve un handler con manejo de errores uniforme.
function handler(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
      console.error('[api]', err && err.message ? err.message : err);
      if (!res.headersSent) json(res, 500, { error: 'internal_error', message: 'Error interno del servidor' });
    }
  };
}

module.exports = { json, readJson, handler };
