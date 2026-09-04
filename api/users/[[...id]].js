// Usuarios/permisos consolidados: colección (/api/users) e ítem (/api/users/:id)
const bcrypt = require('bcryptjs');
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { requirePerm } = require('../../lib/auth');

const ROLES = ['principal', 'biblioteca', 'editor'];
const COLORS = ['#2563eb', '#0d9488', '#e64b5c', '#7c5cfc', '#d98514'];

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const idp = req.query && req.query.id;
  const id = Array.isArray(idp) ? idp[0] : idp;

  if (!id) {
    // ---- Colección ----
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
      const nid = 'u' + Date.now().toString(36);
      const hash = bcrypt.hashSync(password, 10);
      const cnt = (await sql`SELECT count(*)::int AS count FROM admins`).rows[0].count;
      const color = COLORS[cnt % COLORS.length];
      const { rows } = await sql`INSERT INTO admins (id, nombre, correo, rol, activo, password_hash, color)
        VALUES (${nid}, ${nombre}, ${correo}, ${rol}, true, ${hash}, ${color})
        RETURNING id, nombre, correo, rol, activo, color`;
      await addAudit(u.nombre, `Agregó al administrador ${nombre} (${rol})`);
      return json(res, 201, { user: rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // ---- Ítem ----
  const u = requirePerm(req, res, 'users');
  if (!u) return;
  const ex = await sql`SELECT id, nombre, correo, rol, activo FROM admins WHERE id = ${id} LIMIT 1`;
  if (!ex.rows[0]) return json(res, 404, { error: 'not_found' });
  const target = ex.rows[0];

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const b = await readJson(req);
    const nombre = b.nombre !== undefined ? String(b.nombre).trim() : target.nombre;
    const correo = b.correo !== undefined ? String(b.correo).trim().toLowerCase() : target.correo;
    const rol = b.rol !== undefined && ROLES.includes(b.rol) ? b.rol : target.rol;
    const activo = b.activo !== undefined ? !!b.activo : target.activo;
    if (target.rol === 'principal' && (rol !== 'principal' || !activo)) {
      const others = await sql`SELECT count(*)::int AS n FROM admins WHERE rol = 'principal' AND activo = true AND id <> ${id}`;
      if (others.rows[0].n === 0) return json(res, 409, { error: 'last_principal', message: 'Debe existir al menos un Administrador principal activo' });
    }
    if (b.password) {
      if (String(b.password).length < 6) return json(res, 400, { error: 'weak_password', message: 'La contraseña debe tener al menos 6 caracteres' });
      await sql`UPDATE admins SET password_hash = ${bcrypt.hashSync(String(b.password), 10)} WHERE id = ${id}`;
    }
    const { rows } = await sql`UPDATE admins SET nombre=${nombre}, correo=${correo}, rol=${rol}, activo=${activo} WHERE id=${id}
      RETURNING id, nombre, correo, rol, activo, color`;
    await addAudit(u.nombre, `Modificó a ${nombre}${activo !== target.activo ? (activo ? ' (activó acceso)' : ' (desactivó acceso)') : ''}${rol !== target.rol ? ` (rol → ${rol})` : ''}`);
    return json(res, 200, { user: rows[0] });
  }

  if (req.method === 'DELETE') {
    if (target.rol === 'principal') {
      const others = await sql`SELECT count(*)::int AS n FROM admins WHERE rol = 'principal' AND id <> ${id}`;
      if (others.rows[0].n === 0) return json(res, 409, { error: 'last_principal', message: 'Debe existir al menos un Administrador principal' });
    }
    await sql`DELETE FROM admins WHERE id = ${id}`;
    await addAudit(u.nombre, `Eliminó la autorización de ${target.nombre}`);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'method_not_allowed' });
});
