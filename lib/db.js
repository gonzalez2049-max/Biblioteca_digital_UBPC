// Acceso a la base de datos (Neon / Postgres) y creación/seed del esquema.
// La URL se detecta desde las variables de entorno de Vercel (lib/env.js); nunca se escribe en el código.
const { neon } = require('@neondatabase/serverless');
const bcrypt = require('bcryptjs');
const { resolvePostgresUrl } = require('./env');

let _client = null;
function client() {
  if (_client) return _client;
  const { url } = resolvePostgresUrl();
  if (!url) throw new Error('No se encontró la URL de Postgres/Neon en las variables de entorno');
  _client = neon(url, { fullResults: true }); // fullResults => resultados como { rows, ... }
  return _client;
}
// `sql` se usa como tagged template en toda la API: sql`SELECT ...`.
function sql(strings, ...values) { return client()(strings, ...values); }

let schemaReady = null;

// Crea las tablas si no existen y siembra las filas base. Idempotente y cacheado por cold start.
function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      correo TEXT UNIQUE NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('principal','biblioteca','editor')),
      activo BOOLEAN NOT NULL DEFAULT true,
      password_hash TEXT NOT NULL,
      color TEXT DEFAULT '#2563eb',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      ruta TEXT NOT NULL,
      tema TEXT NOT NULL,
      roles JSONB NOT NULL DEFAULT '[]',
      aprendizaje TEXT DEFAULT '',
      tipo TEXT DEFAULT '',
      autor TEXT DEFAULT '',
      anio TEXT DEFAULT '',
      keywords TEXT DEFAULT '',
      tiempo TEXT DEFAULT '',
      imagen_url TEXT,
      archivo JSONB,
      enlace TEXT DEFAULT '',
      youtube TEXT DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado','oculto')),
      creado_por TEXT DEFAULT '',
      modificado_por TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_resources_estado ON resources (estado)`;
    await sql`CREATE TABLE IF NOT EXISTS singletons (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    )`;
    await sql`CREATE TABLE IF NOT EXISTS audit (
      id BIGSERIAL PRIMARY KEY,
      t TIMESTAMPTZ NOT NULL DEFAULT now(),
      who TEXT NOT NULL,
      what TEXT NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT '',
      size BIGINT DEFAULT 0,
      url TEXT NOT NULL,
      pathname TEXT,
      uploaded_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

    // Filas singleton por defecto.
    await sql`INSERT INTO singletons (key, data) VALUES ('weekly', '{}') ON CONFLICT (key) DO NOTHING`;
    await sql`INSERT INTO singletons (key, data) VALUES ('experience', ${JSON.stringify(DEFAULT_EXPERIENCE)}) ON CONFLICT (key) DO NOTHING`;
    await sql`INSERT INTO singletons (key, data) VALUES ('stats', ${JSON.stringify(DEFAULT_STATS)}) ON CONFLICT (key) DO NOTHING`;

    // Administrador principal inicial SOLO si están definidas AMBAS variables de entorno.
    // Nunca se crea un usuario con contraseña por defecto (sin claves temporales).
    const { rows } = await sql`SELECT count(*)::int AS n FROM admins`;
    if (rows[0].n === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
      await sql`INSERT INTO admins (id, nombre, correo, rol, activo, password_hash, color)
        VALUES ('u1', ${process.env.ADMIN_NAME || 'Administrador principal'}, ${process.env.ADMIN_EMAIL}, 'principal', true, ${hash}, '#7c5cfc')`;
    }
  })();
  return schemaReady;
}

async function addAudit(who, what) {
  try { await sql`INSERT INTO audit (who, what) VALUES (${who}, ${what})`; } catch (e) { /* no bloquear la acción principal */ }
}

const DEFAULT_EXPERIENCE = {
  hero: { label: 'Textos principales de la portada', value: 'Centro de Transferencia del Conocimiento · Seguridad, Evidencia y Cuidado. ¿Qué necesitas resolver hoy?' },
  turno: { label: 'Lo necesito para el turno', value: 'Acción rápida junto a la cama del paciente. Recursos breves para resolver en segundos durante el turno.' },
  tematica: { label: 'Recursos permanentes por temática', value: 'Explora y filtra el conocimiento clínico por temática, ruta o rol.' },
  roles: { label: 'Recursos según rol', value: 'Contenido pensado para tu función clínica: Enfermería, TENS, Kinesiología, Auxiliares, Jefaturas y Champions.' },
  practica: { label: 'De la evidencia a la práctica', value: 'Un recorrido claro: necesidad clínica → recurso → aplicación práctica → evaluación.' },
  mejora: { label: 'Oportunidades de mejora', value: 'Brechas detectadas que podemos cerrar juntos, del monitoreo de indicadores a la acción concreta.' },
  updates: { label: 'Últimas actualizaciones', value: 'Novedades del Centro: nuevos recursos, evidencias y herramientas publicadas cada semana.' },
};

const DEFAULT_STATS = {
  visitas: 0, descargas: 0, eviAperturas: 0,
  aperturas: {}, busquedas: [], sinResultado: [], usoTema: {}, usoRol: {}, interacciones: [],
};

module.exports = { sql, ensureSchema, addAudit, DEFAULT_EXPERIENCE, DEFAULT_STATS };
