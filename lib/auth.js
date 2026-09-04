// Autenticación (JWT en cookie httpOnly) y control de permisos por rol.
const jwt = require('jsonwebtoken');

// Sin AUTH_SECRET no se firma ni verifica nada: la autenticación queda "no configurada"
// (falla cerrado). Nunca se usa un secreto por defecto inseguro.
const SECRET = process.env.AUTH_SECRET || null;
const COOKIE = 'nex_token';
function authConfigured() { return !!SECRET; }

// Matriz de permisos por rol. La API la aplica en el servidor (no basta con ocultar botones).
const PERMS = {
  principal:  ['resources', 'content', 'users', 'stats'], // control completo
  biblioteca: ['resources', 'content'],                   // recursos y contenidos
  editor:     ['resources'],                              // solo crear/editar recursos
};

function can(rol, perm) { return !!(PERMS[rol] && PERMS[rol].includes(perm)); }

function sign(user) {
  if (!SECRET) throw new Error('auth_not_configured');
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
  if (!SECRET) return null; // auth no configurada: nadie está autenticado
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
  if (!SECRET) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'auth_not_configured', message: 'Autenticación no configurada (falta AUTH_SECRET y credenciales)' })); return null; }
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

module.exports = { sign, getUser, setAuthCookie, clearAuthCookie, can, requireAuth, requirePerm, authConfigured, PERMS, COOKIE };
