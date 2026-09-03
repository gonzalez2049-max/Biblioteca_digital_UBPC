const { json, handler } = require('../../lib/http');
const { sql, ensureSchema } = require('../../lib/db');
const { getUser } = require('../../lib/auth');

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const payload = getUser(req);
  if (!payload) return json(res, 200, { user: null });
  const { rows } = await sql`SELECT id, nombre, correo, rol, activo, color FROM admins WHERE id = ${payload.id} LIMIT 1`;
  const u = rows[0];
  if (!u || !u.activo) return json(res, 200, { user: null });
  return json(res, 200, { user: { id: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, color: u.color } });
});
