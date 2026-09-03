-- Esquema de referencia del Centro de Transferencia del Conocimiento (HUAP).
-- Se crea automáticamente desde lib/db.js (ensureSchema) en el primer arranque.
-- Este archivo es solo documentación / referencia manual.

CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  correo        TEXT UNIQUE NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('principal','biblioteca','editor')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT NOT NULL,          -- bcrypt
  color         TEXT DEFAULT '#2563eb',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resources (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  descripcion   TEXT DEFAULT '',
  ruta          TEXT NOT NULL,          -- aprender | aplicar | ensenar | implementar | evaluar
  tema          TEXT NOT NULL,          -- lesiones | accesos | dolor | iaas | seguridad | otras
  roles         JSONB NOT NULL DEFAULT '[]',
  aprendizaje   TEXT DEFAULT '',        -- leer | ver | escuchar | practicar
  tipo          TEXT DEFAULT '',
  autor         TEXT DEFAULT '',
  anio          TEXT DEFAULT '',
  keywords      TEXT DEFAULT '',
  tiempo        TEXT DEFAULT '',
  imagen_url    TEXT,                   -- URL en Vercel Blob
  archivo       JSONB,                  -- {id,name,type,size,url}
  enlace        TEXT DEFAULT '',
  youtube       TEXT DEFAULT '',
  estado        TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicado','oculto')),
  creado_por    TEXT DEFAULT '',
  modificado_por TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resources_estado ON resources (estado);

-- Contenidos editables de la portada y estadísticas (una fila por clave).
CREATE TABLE IF NOT EXISTS singletons (
  key   TEXT PRIMARY KEY,              -- 'weekly' | 'experience' | 'stats'
  data  JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS audit (
  id    BIGSERIAL PRIMARY KEY,
  t     TIMESTAMPTZ NOT NULL DEFAULT now(),
  who   TEXT NOT NULL,
  what  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT DEFAULT '',
  size        BIGINT DEFAULT 0,
  url         TEXT NOT NULL,           -- URL pública en Vercel Blob
  pathname    TEXT,
  uploaded_by TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
