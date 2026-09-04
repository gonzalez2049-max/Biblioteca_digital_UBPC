// Detección robusta de variables de entorno creadas por las integraciones de Vercel
// (Neon/Postgres y Blob), sin escribir credenciales en el código.
// Se admiten distintos nombres/prefijos: POSTGRES_*, DATABASE_*, NEON_*, STORAGE_* (Neon)
// y BLOB_* (Vercel Blob). Nunca se exponen los valores, solo se usan.

function isPgUrl(v) {
  return typeof v === 'string' && /^postgres(ql)?:\/\//i.test(v.trim());
}

// Devuelve { url, name } de la conexión a Postgres/Neon, o { url: null }.
function resolvePostgresUrl() {
  // 1) Nombres preferidos, en orden. Se prioriza una URL "pooled" (-pooler) para serverless.
  const preferred = [
    'POSTGRES_URL', 'STORAGE_POSTGRES_URL', 'STORAGE_URL', 'STORAGE_DATABASE_URL',
    'DATABASE_URL', 'NEON_DATABASE_URL', 'POSTGRES_PRISMA_URL',
    'POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED', 'STORAGE_POSTGRES_URL_NON_POOLING',
  ];
  const candidates = [];
  for (const name of preferred) {
    if (isPgUrl(process.env[name])) candidates.push({ name, url: process.env[name] });
  }
  // 2) Barrido por patrón para cualquier prefijo (p. ej. STORAGE_XXX_POSTGRES_URL).
  for (const [name, val] of Object.entries(process.env)) {
    if (candidates.find((c) => c.name === name)) continue;
    if (/(POSTGRES|DATABASE|NEON).*URL/i.test(name) && isPgUrl(val)) candidates.push({ name, url: val });
  }
  if (!candidates.length) return { url: null, name: null };
  // Preferir una URL pooled si existe.
  const pooled = candidates.find((c) => /-pooler\./.test(c.url) || /pgbouncer=true/.test(c.url));
  return pooled || candidates[0];
}

// Devuelve { token, name } del token de Vercel Blob, o { token: null }.
function resolveBlobToken() {
  const preferred = ['BLOB_READ_WRITE_TOKEN', 'STORAGE_BLOB_READ_WRITE_TOKEN'];
  for (const name of preferred) {
    if (process.env[name]) return { token: process.env[name], name };
  }
  for (const [name, val] of Object.entries(process.env)) {
    if (val && /BLOB.*(READ_WRITE|TOKEN)/i.test(name)) return { token: val, name };
  }
  return { token: null, name: null };
}

// Solo NOMBRES detectados (nunca valores), para diagnóstico en /api/health.
function detectedEnvNames() {
  const pg = resolvePostgresUrl();
  const blob = resolveBlobToken();
  return {
    postgres_var: pg.name || null,
    blob_var: blob.name || null,
    has_postgres: !!pg.url,
    has_blob: !!blob.token,
    has_auth_secret: !!process.env.AUTH_SECRET,
    has_admin_email: !!process.env.ADMIN_EMAIL,
    has_admin_password: !!process.env.ADMIN_PASSWORD,
  };
}

module.exports = { resolvePostgresUrl, resolveBlobToken, detectedEnvNames };
