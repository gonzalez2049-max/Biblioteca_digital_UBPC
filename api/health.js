// Diagnóstico y ejecución de migraciones. Público (no expone valores secretos).
// Al llamarse, ensureSchema() crea las tablas si faltan y siembra las filas base.
const { json, handler } = require('../lib/http');
const { sql, ensureSchema } = require('../lib/db');
const { detectedEnvNames } = require('../lib/env');

module.exports = handler(async (req, res) => {
  const env = detectedEnvNames(); // solo nombres/flags, nunca valores
  const out = { ok: false, time: new Date().toISOString(), env, db: { connected: false } };

  if (!env.has_postgres) {
    out.error = 'no_postgres_url';
    out.message = 'No se detectó la URL de Postgres/Neon en las variables de entorno.';
    return json(res, 503, out);
  }
  try {
    await ensureSchema(); // ejecuta las migraciones (CREATE TABLE IF NOT EXISTS + seed)
    const tbl = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
    const admins = await sql`SELECT count(*)::int AS n FROM admins`;
    const resources = await sql`SELECT count(*)::int AS n FROM resources`;
    out.ok = true;
    out.db = {
      connected: true,
      tables: tbl.rows.map((r) => r.table_name),
      admins: admins.rows[0].n,
      resources: resources.rows[0].n,
    };
    out.blob = { configured: env.has_blob };
    return json(res, 200, out);
  } catch (e) {
    out.error = 'db_error';
    out.message = (e && e.message) ? String(e.message).slice(0, 300) : 'error';
    return json(res, 503, out);
  }
});
