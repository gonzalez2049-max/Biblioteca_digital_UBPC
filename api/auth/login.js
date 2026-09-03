const bcrypt = require('bcryptjs');
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { sign, setAuthCookie } = require('../../lib/auth');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  await ensureSchema();
  const { email, password } = await readJson(req);
  if (!email || !password) return json(res, 400, { error: 'bad_request', message: 'Correo y contraseña son obligatorios' });

  const { rows } = await sql`SELECT id, nombre, correo, rol, activo, password_hash, color FROM admins WHERE lower(correo) = lower(${email}) LIMIT 1`;
  const u = rows[0];
  if (!u || !u.activo || !bcrypt.compareSync(password, u.password_hash)) {
    return json(res, 401, { error: 'invalid_credentials', message: 'Credenciales inválidas o acceso desactivado' });
  }
  const token = sign(u);
  setAuthCookie(res, token);
  await addAudit(u.nombre, 'Inició sesión');
  return json(res, 200, { user: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, color: u.color }, token });
});
