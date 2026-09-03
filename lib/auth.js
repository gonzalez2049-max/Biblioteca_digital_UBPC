// Autenticación (JWT en cookie httpOnly) y control de permisos por rol.
const jwt = require('jsonwebtoken');

const SECRET = process.env.AUTH_SECRET || 'dev-insecure-secret-CHANGE-ME';
const COOKIE = 'nex_token';

// Matriz de permisos por rol. La API la aplica en el servidor (no basta con ocultar botones).
const PERMS = {
  principal:  ['resources', 'content', 'users', 'stats'], // control completo
  biblioteca: ['resources', 'content'],                   // recursos y contenidos
  editor:     ['resources'],                              // solo crear/editar recursos
};

function can(rol, perm) { return !!(PERMS[rol] && PERMS[rol].includes(perm)); }

function sign(user) {
  return jwt.sign({ id: user.id, rol: user.rol, nombre: user.nombre }, SECRET, { expiresIn: '8h' });
}

function parseCookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  h.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Devuelve el usuario autenticado ({id,rol,nombre}) o null.
function getUser(req) {
  try {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const token = bearer || parseCookies(req)[COOKIE];
    if (!token) return null;
    return jwt.verify(token, SECRET);
  } catch (e) { return null; }
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax; Secure`);
}
function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`);
}

// Guardas reutilizables. Devuelven el usuario o responden con 401/403 y devuelven null.
function requireAuth(req, res) {
  const u = getUser(req);
  if (!u) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'unauthorized', message: 'Sesión no válida' })); return null; }
  return u;
}
function requirePerm(req, res, perm) {
  const u = requireAuth(req, res);
  if (!u) return null;
  if (!can(u.rol, perm)) { res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'forbidden', message: 'Tu rol no tiene permiso para esta acción' })); return null; }
  return u;
}

module.exports = { sign, getUser, setAuthCookie, clearAuthCookie, can, requireAuth, requirePerm, PERMS, COOKIE };
