const bcrypt = require('bcryptjs');
const { json, readJson, handler } = require('../../lib/http');
const { sql, ensureSchema, addAudit } = require('../../lib/db');
const { requirePerm } = require('../../lib/auth');

const ROLES = ['principal', 'biblioteca', 'editor'];

module.exports = handler(async (req, res) => {
  await ensureSchema();
  const url = new URL(req.url, 'http://x');
  const id = (req.query && req.query.id) || url.pathname.split('/').pop();
  const u = requirePerm(req, res, 'users');
  if (!u) return;

  const existing = await sql`SELECT id, nombre, correo, rol, activo FROM admins WHERE id = ${id} LIMIT 1`;
  if (!existing.rows[0]) return json(res, 404, { error: 'not_found' });
  const target = existing.rows[0];

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const b = await readJson(req);
    const nombre = b.nombre !== undefined ? String(b.nombre).trim() : target.nombre;
    const correo = b.correo !== undefined ? String(b.correo).trim().toLowerCase() : target.correo;
    const rol = b.rol !== undefined && ROLES.includes(b.rol) ? b.rol : target.rol;
    const activo = b.activo !== undefined ? !!b.activo : target.activo;

    // No permitir quedarse sin ningún Administrador principal activo.
    if ((target.rol === 'principal') && (rol !== 'principal' || !activo)) {
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
