const bcrypt = require('bcryptjs');
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { requirePerm } = require('../../lib/auth');

const ROLES = ['principal', 'biblioteca', 'editor'];
const COLORS = ['#2563eb', '#0d9488', '#e64b5c', '#7c5cfc', '#d98514'];

module.exports = handler(async (req, res) => {
  await ensureSchema();

  if (req.method === 'GET') {
    const u = requirePerm(req, res, 'users');
    if (!u) return;
    const { rows } = await sql`SELECT id, nombre, correo, rol, activo, color FROM admins ORDER BY created_at ASC`;
    return json(res, 200, { users: rows });
  }

  if (req.method === 'POST') {
    const u = requirePerm(req, res, 'users');
    if (!u) return;
    const b = await readJson(req);
    const nombre = String(b.nombre || '').trim();
    const correo = String(b.correo || '').trim().toLowerCase();
    const rol = ROLES.includes(b.rol) ? b.rol : 'editor';
    const password = String(b.password || '').trim();
    if (!nombre || !correo) return json(res, 400, { error: 'bad_request', message: 'Nombre y correo son obligatorios' });
    if (password.length < 6) return json(res, 400, { error: 'weak_password', message: 'La contraseña debe tener al menos 6 caracteres' });
    const dup = await sql`SELECT 1 FROM admins WHERE lower(correo) = ${correo} LIMIT 1`;
    if (dup.rows[0]) return json(res, 409, { error: 'conflict', message: 'Ya existe un usuario con ese correo' });
    const id = 'u' + Date.now().toString(36);
    const hash = bcrypt.hashSync(password, 10);
    const { count } = await sql`SELECT count(*)::int AS count FROM admins`.then(r => r.rows[0]);
    const color = COLORS[count % COLORS.length];
    const { rows } = await sql`INSERT INTO admins (id, nombre, correo, rol, activo, password_hash, color)
      VALUES (${id}, ${nombre}, ${correo}, ${rol}, true, ${hash}, ${color})
      RETURNING id, nombre, correo, rol, activo, color`;
    await addAudit(u.nombre, `Agregó al administrador ${nombre} (${rol})`);
    return json(res, 201, { user: rows[0] });
  }

  return json(res, 405, { error: 'method_not_allowed' });
});
