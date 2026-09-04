// Autenticación consolidada: /api/auth/login, /api/auth/logout, /api/auth/me
const bcrypt = require('bcryptjs');
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { sign, setAuthCookie, clearAuthCookie, getUser, authConfigured } = require('../../lib/auth');

module.exports = handler(async (req, res) => {
  const action = (req.query && req.query.action) || '';

  if (action === 'login') {
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

  if (action === 'logout') { clearAuthCookie(res); return json(res, 200, { ok: true }); }

  if (action === 'me') {
    await ensureSchema();
    const p = getUser(req);
    if (!p) return json(res, 200, { user: null });
    const { rows } = await sql`SELECT id, nombre, correo, rol, activo, color FROM admins WHERE id = ${p.id} LIMIT 1`;
    const u = rows[0];
    if (!u || !u.activo) return json(res, 200, { user: null });
    return json(res, 200, { user: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, color: u.color } });
  }

  return json(res, 404, { error: 'not_found' });
});
