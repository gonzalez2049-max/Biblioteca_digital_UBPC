// Router único de la API (una sola Función Serverless) — patrón catch-all soportado por Vercel.
// Rutas: /api/health · /api/auth/{login,logout,me} · /api/resources[/:id] · /api/weekly · /api/experience
//        · /api/users[/:id] · /api/stats[/track|/reset] · /api/audit · /api/files[/:id]
const bcrypt = require('bcryptjs');
const { put, del } = require('@vercel/blob');
const { json, readJson, handler } = require('../lib/http');
const { sql, ensureSchema, addAudit, DEFAULT_STATS } = require('../lib/db');
const { sign, setAuthCookie, clearAuthCookie, getUser, requireAuth, requirePerm, authConfigured } = require('../lib/auth');
const { toResource, clean } = require('../lib/resources');
const { detectedEnvNames, resolveBlobToken } = require('../lib/env');

const ROLES = ['principal', 'biblioteca', 'editor'];
const COLORS = ['#2563eb', '#0d9488', '#e64b5c', '#7c5cfc', '#d98514'];
function ts() {
  const d = new Date();
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

module.exports = handler(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // Ruta tomada del path real (robusto); se ignora el prefijo 'api' si aparece.
  let parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts = parts.slice(1);
  if (!parts.length && req.query && req.query.path) { const p = req.query.path; parts = Array.isArray(p) ? p : [p]; }
  const a = parts[0] || '';
  const b = parts[1];

  // ---------- HEALTH ----------
  if (a === 'health') {
    const env = detectedEnvNames();
    const out = { ok: false, time: new Date().toISOString(), env, db: { connected: false } };
    if (!env.has_postgres) { out.error = 'no_postgres_url'; return json(res, 503, out); }
    try {
      await ensureSchema();
      const tbl = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
      const admins = await sql`SELECT count(*)::int AS n FROM admins`;
      const resources = await sql`SELECT count(*)::int AS n FROM resources`;
      out.ok = true;
      out.db = { connected: true, tables: tbl.rows.map((r) => r.table_name), admins: admins.rows[0].n, resources: resources.rows[0].n };
      out.blob = { configured: env.has_blob };
      return json(res, 200, out);
    } catch (e) { out.error = 'db_error'; out.message = (e && e.message) ? String(e.message).slice(0, 300) : 'error'; return json(res, 503, out); }
  }

  // ---------- AUTH ----------
  if (a === 'auth') {
    if (b === 'login') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      if (!authConfigured()) return json(res, 503, { error: 'auth_not_configured', message: 'Autenticación no configurada: falta definir AUTH_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD en Vercel.' });
      await ensureSchema();
      const { email, password } = await readJson(req);
      if (!email || !password) return json(res, 400, { error: 'bad_request', message: 'Correo y contraseña son obligatorios' });
      const { rows } = await sql`SELECT id, nombre, correo, rol, activo, password_hash, color FROM admins WHERE lower(correo) = lower(${email}) LIMIT 1`;
      const u = rows[0];
      if (!u || !u.activo || !bcrypt.compareSync(password, u.password_hash)) return json(res, 401, { error: 'invalid_credentials', message: 'Credenciales inválidas o acceso desactivado' });
      setAuthCookie(res, sign(u));
      await addAudit(u.nombre, 'Inició sesión');
      return json(res, 200, { user: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, color: u.color } });
    }
    if (b === 'logout') { clearAuthCookie(res); return json(res, 200, { ok: true }); }
    if (b === 'me') {
      await ensureSchema();
      const pl = getUser(req);
      if (!pl) return json(res, 200, { user: null });
      const { rows } = await sql`SELECT id, nombre, correo, rol, activo, color FROM admins WHERE id = ${pl.id} LIMIT 1`;
      const u = rows[0];
      if (!u || !u.activo) return json(res, 200, { user: null });
      return json(res, 200, { user: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, color: u.color } });
    }
    return json(res, 404, { error: 'not_found' });
  }

  // ---------- RESOURCES ----------
  if (a === 'resources') {
    await ensureSchema();
    if (!b) {
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
        const u = requirePerm(req, res, 'resources'); if (!u) return;
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
    // ítem
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const u = requirePerm(req, res, 'resources'); if (!u) return;
      const body = await readJson(req);
      const ex = await sql`SELECT * FROM resources WHERE id = ${b} LIMIT 1`;
      if (!ex.rows[0]) return json(res, 404, { error: 'not_found' });
      if (body.estado && Object.keys(body).length === 1) {
        const estado = ['borrador', 'publicado', 'oculto'].includes(body.estado) ? body.estado : ex.rows[0].estado;
        const { rows } = await sql`UPDATE resources SET estado = ${estado}, modificado_por = ${u.nombre}, updated_at = now() WHERE id = ${b} RETURNING *`;
        await addAudit(u.nombre, `${estado === 'publicado' ? 'Volvió a publicar' : estado === 'oculto' ? 'Ocultó' : 'Cambió a borrador'} “${rows[0].titulo}”`);
        return json(res, 200, { resource: toResource(rows[0]) });
      }
      const c = clean({ ...ex.rows[0], ...body, imagen: body.imagen !== undefined ? body.imagen : ex.rows[0].imagen_url, archivo: body.archivo !== undefined ? body.archivo : ex.rows[0].archivo });
      const { rows } = await sql`
        UPDATE resources SET titulo=${c.titulo}, descripcion=${c.descripcion}, ruta=${c.ruta}, tema=${c.tema}, roles=${JSON.stringify(c.roles)},
          aprendizaje=${c.aprendizaje}, tipo=${c.tipo}, autor=${c.autor}, anio=${c.anio}, keywords=${c.keywords}, tiempo=${c.tiempo},
          imagen_url=${c.imagen_url}, archivo=${c.archivo ? JSON.stringify(c.archivo) : null}, enlace=${c.enlace}, youtube=${c.youtube},
          estado=${c.estado}, modificado_por=${u.nombre}, updated_at=now()
        WHERE id=${b} RETURNING *`;
      await addAudit(u.nombre, `Editó “${c.titulo}”`);
      return json(res, 200, { resource: toResource(rows[0]) });
    }
    if (req.method === 'DELETE') {
      const u = requirePerm(req, res, 'resources'); if (!u) return;
      const ex = await sql`SELECT titulo, archivo FROM resources WHERE id = ${b} LIMIT 1`;
      if (!ex.rows[0]) return json(res, 404, { error: 'not_found' });
      const arch = ex.rows[0].archivo;
      if (arch && arch.url) { try { await del(arch.url, { token: resolveBlobToken().token }); } catch (e) { /* continuar */ } }
      await sql`DELETE FROM resources WHERE id = ${b}`;
      await addAudit(u.nombre, `Eliminó “${ex.rows[0].titulo}”`);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // ---------- SINGLETONS: weekly / experience ----------
  if (a === 'weekly' || a === 'experience') {
    await ensureSchema();
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT data FROM singletons WHERE key = ${a}`;
      return json(res, 200, { [a]: (rows[0] && rows[0].data) || {} });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const u = requirePerm(req, res, 'content'); if (!u) return;
      const body = await readJson(req);
      await sql`UPDATE singletons SET data = ${JSON.stringify(body || {})} WHERE key = ${a}`;
      await addAudit(u.nombre, a === 'weekly' ? 'Actualizó la evidencia destacada de la semana' : 'Editó los textos de la portada (Experiencia pública)');
      return json(res, 200, { [a]: body || {} });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // ---------- AUDIT ----------
  if (a === 'audit') {
    await ensureSchema();
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
    const u = requireAuth(req, res); if (!u) return;
    const { rows } = await sql`SELECT to_char(t, 'DD Mon · HH24:MI') AS t, who, what FROM audit ORDER BY t DESC LIMIT 50`;
    return json(res, 200, { audit: rows });
  }

  // ---------- USERS ----------
  if (a === 'users') {
    await ensureSchema();
    if (!b) {
      if (req.method === 'GET') {
        const u = requirePerm(req, res, 'users'); if (!u) return;
        const { rows } = await sql`SELECT id, nombre, correo, rol, activo, color FROM admins ORDER BY created_at ASC`;
        return json(res, 200, { users: rows });
      }
      if (req.method === 'POST') {
        const u = requirePerm(req, res, 'users'); if (!u) return;
        const bd = await readJson(req);
        const nombre = String(bd.nombre || '').trim();
        const correo = String(bd.correo || '').trim().toLowerCase();
        const rol = ROLES.includes(bd.rol) ? bd.rol : 'editor';
        const password = String(bd.password || '').trim();
        if (!nombre || !correo) return json(res, 400, { error: 'bad_request', message: 'Nombre y correo son obligatorios' });
        if (password.length < 6) return json(res, 400, { error: 'weak_password', message: 'La contraseña debe tener al menos 6 caracteres' });
        const dup = await sql`SELECT 1 FROM admins WHERE lower(correo) = ${correo} LIMIT 1`;
        if (dup.rows[0]) return json(res, 409, { error: 'conflict', message: 'Ya existe un usuario con ese correo' });
        const nid = 'u' + Date.now().toString(36);
        const hash = bcrypt.hashSync(password, 10);
        const cnt = (await sql`SELECT count(*)::int AS count FROM admins`).rows[0].count;
        const { rows } = await sql`INSERT INTO admins (id, nombre, correo, rol, activo, password_hash, color)
          VALUES (${nid}, ${nombre}, ${correo}, ${rol}, true, ${hash}, ${COLORS[cnt % COLORS.length]})
          RETURNING id, nombre, correo, rol, activo, color`;
        await addAudit(u.nombre, `Agregó al administrador ${nombre} (${rol})`);
        return json(res, 201, { user: rows[0] });
      }
      return json(res, 405, { error: 'method_not_allowed' });
    }
    const u = requirePerm(req, res, 'users'); if (!u) return;
    const ex = await sql`SELECT id, nombre, correo, rol, activo FROM admins WHERE id = ${b} LIMIT 1`;
    if (!ex.rows[0]) return json(res, 404, { error: 'not_found' });
    const target = ex.rows[0];
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const bd = await readJson(req);
      const nombre = bd.nombre !== undefined ? String(bd.nombre).trim() : target.nombre;
      const correo = bd.correo !== undefined ? String(bd.correo).trim().toLowerCase() : target.correo;
      const rol = bd.rol !== undefined && ROLES.includes(bd.rol) ? bd.rol : target.rol;
      const activo = bd.activo !== undefined ? !!bd.activo : target.activo;
      if (target.rol === 'principal' && (rol !== 'principal' || !activo)) {
        const others = await sql`SELECT count(*)::int AS n FROM admins WHERE rol = 'principal' AND activo = true AND id <> ${b}`;
        if (others.rows[0].n === 0) return json(res, 409, { error: 'last_principal', message: 'Debe existir al menos un Administrador principal activo' });
      }
      if (bd.password) {
        if (String(bd.password).length < 6) return json(res, 400, { error: 'weak_password', message: 'La contraseña debe tener al menos 6 caracteres' });
        await sql`UPDATE admins SET password_hash = ${bcrypt.hashSync(String(bd.password), 10)} WHERE id = ${b}`;
      }
      const { rows } = await sql`UPDATE admins SET nombre=${nombre}, correo=${correo}, rol=${rol}, activo=${activo} WHERE id=${b}
        RETURNING id, nombre, correo, rol, activo, color`;
      await addAudit(u.nombre, `Modificó a ${nombre}`);
      return json(res, 200, { user: rows[0] });
    }
    if (req.method === 'DELETE') {
      if (target.rol === 'principal') {
        const others = await sql`SELECT count(*)::int AS n FROM admins WHERE rol = 'principal' AND id <> ${b}`;
        if (others.rows[0].n === 0) return json(res, 409, { error: 'last_principal', message: 'Debe existir al menos un Administrador principal' });
      }
      await sql`DELETE FROM admins WHERE id = ${b}`;
      await addAudit(u.nombre, `Eliminó la autorización de ${target.nombre}`);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // ---------- STATS ----------
  if (a === 'stats') {
    await ensureSchema();
    if (!b) {
      if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
      const u = requireAuth(req, res); if (!u) return;
      const { rows } = await sql`SELECT data FROM singletons WHERE key = 'stats'`;
      return json(res, 200, { stats: (rows[0] && rows[0].data) || {} });
    }
    if (b === 'track') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      const bd = await readJson(req);
      const type = bd.type;
      const { rows } = await sql`SELECT data FROM singletons WHERE key = 'stats'`;
      const s = (rows[0] && rows[0].data) || {};
      s.interacciones = s.interacciones || []; s.aperturas = s.aperturas || {}; s.usoTema = s.usoTema || {}; s.usoRol = s.usoRol || {};
      s.busquedas = s.busquedas || []; s.sinResultado = s.sinResultado || [];
      const push = (txt) => { s.interacciones.unshift({ t: ts(), a: txt }); s.interacciones = s.interacciones.slice(0, 80); };
      if (type === 'visit') { s.visitas = (s.visitas || 0) + 1; push('Visita al Centro público'); }
      else if (type === 'open') {
        if (bd.resourceId) s.aperturas[bd.resourceId] = (s.aperturas[bd.resourceId] || 0) + 1;
        if (bd.tema) s.usoTema[bd.tema] = (s.usoTema[bd.tema] || 0) + 1;
        if (bd.rol) s.usoRol[bd.rol] = (s.usoRol[bd.rol] || 0) + 1;
        push('Apertura de “' + String(bd.titulo || 'recurso') + '”');
      } else if (type === 'download') { s.descargas = (s.descargas || 0) + 1; push('Descarga de “' + String(bd.name || 'archivo') + '”'); }
      else if (type === 'evi') { s.eviAperturas = (s.eviAperturas || 0) + 1; push('Recurso abierto desde EVI'); }
      else if (type === 'search') {
        const q = String(bd.q || '').toLowerCase().trim();
        if (q.length >= 2) {
          const arr = (bd.hits > 0) ? s.busquedas : s.sinResultado;
          const e = arr.find((x) => x[0] === q); if (e) e[1]++; else arr.push([q, 1]);
          arr.sort((x, y) => y[1] - x[1]); if (arr.length > 20) arr.length = 20;
          push((bd.hits > 0 ? 'Búsqueda: “' : 'Búsqueda sin resultados: “') + q + '”');
        }
      } else { return json(res, 400, { error: 'bad_request', message: 'Tipo de evento no válido' }); }
      await sql`UPDATE singletons SET data = ${JSON.stringify(s)} WHERE key = 'stats'`;
      return json(res, 200, { ok: true });
    }
    if (b === 'reset') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      const u = requirePerm(req, res, 'stats'); if (!u) return;
      const fresh = { ...DEFAULT_STATS, interacciones: [{ t: ts(), a: 'Estadísticas reiniciadas a cero' }] };
      await sql`UPDATE singletons SET data = ${JSON.stringify(fresh)} WHERE key = 'stats'`;
      await addAudit(u.nombre, 'Reinició las estadísticas de uso a cero');
      return json(res, 200, { stats: fresh });
    }
    return json(res, 404, { error: 'not_found' });
  }

  // ---------- FILES ----------
  if (a === 'files') {
    await ensureSchema();
    if (!b) {
      if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
      const u = requirePerm(req, res, 'resources'); if (!u) return;
      const bd = await readJson(req);
      const filename = String(bd.filename || '').trim();
      const contentType = String(bd.contentType || 'application/octet-stream');
      const dataBase64 = String(bd.dataBase64 || '');
      const ALLOWED = /\.(pdf|docx?|pptx?|png|jpe?g|gif|webp|mp3|wav|m4a|ogg|mp4|webm|mov)$/i;
      if (!filename || !dataBase64) return json(res, 400, { error: 'bad_request', message: 'Falta el archivo o su nombre' });
      if (!ALLOWED.test(filename)) return json(res, 415, { error: 'unsupported_type', message: 'Tipo no permitido. Usa PDF, Word, PowerPoint, imagen, audio o video.' });
      const raw = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
      const buf = Buffer.from(raw, 'base64');
      if (buf.length > 4 * 1024 * 1024) return json(res, 413, { error: 'too_large', message: 'El archivo supera el máximo (~3 MB por el límite de la función serverless)' });
      const nid = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const safeName = filename.replace(/[^\w.\-]+/g, '_');
      const blob = await put(`recursos/${nid}/${safeName}`, buf, { access: 'public', contentType, addRandomSuffix: false, token: resolveBlobToken().token });
      await sql`INSERT INTO files (id, name, type, size, url, pathname, uploaded_by)
        VALUES (${nid}, ${filename}, ${contentType}, ${buf.length}, ${blob.url}, ${blob.pathname}, ${u.nombre})`;
      return json(res, 201, { file: { id: nid, name: filename, type: contentType, size: buf.length, url: blob.url, by: u.nombre } });
    }
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT id, name, type, size, url, uploaded_by, created_at FROM files WHERE id = ${b} LIMIT 1`;
      if (!rows[0]) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { file: rows[0] });
    }
    if (req.method === 'DELETE') {
      const u = requirePerm(req, res, 'resources'); if (!u) return;
      const { rows } = await sql`SELECT url FROM files WHERE id = ${b} LIMIT 1`;
      if (rows[0] && rows[0].url) { try { await del(rows[0].url, { token: resolveBlobToken().token }); } catch (e) { /* continuar */ } }
      await sql`DELETE FROM files WHERE id = ${b}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  return json(res, 404, { error: 'not_found', message: 'Ruta de API no encontrada' });
});
