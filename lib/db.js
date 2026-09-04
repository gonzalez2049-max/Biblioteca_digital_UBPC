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

    // Recursos de ejemplo (una sola vez, marcados como 'Ejemplo'). Se pueden editar/eliminar
    // desde Administración. El marcador evita recargarlos si el usuario los borra.
    const seeded = await sql`SELECT 1 FROM singletons WHERE key = '_seeded_samples' LIMIT 1`;
    if (!seeded.rows[0]) {
      for (const r of SAMPLE_RESOURCES) {
        await sql`INSERT INTO resources (id, titulo, descripcion, ruta, tema, roles, aprendizaje, tipo, autor, anio, keywords, tiempo, estado, creado_por, modificado_por)
          VALUES (${r.id}, ${r.titulo}, ${r.descripcion}, ${r.ruta}, ${r.tema}, ${JSON.stringify(r.roles)}, ${r.aprendizaje}, ${r.tipo}, ${r.autor}, ${r.anio}, ${r.keywords}, ${r.tiempo}, ${r.estado}, 'Ejemplo', 'Ejemplo')
          ON CONFLICT (id) DO NOTHING`;
      }
      await sql`UPDATE singletons SET data = ${JSON.stringify({ ref: 'seed0' })} WHERE key = 'weekly'`;
      await sql`INSERT INTO singletons (key, data) VALUES ('_seeded_samples', ${JSON.stringify({ at: new Date().toISOString() })}) ON CONFLICT (key) DO NOTHING`;
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

// Recursos clínicos de ejemplo (buenas prácticas HUAP). Se cargan una sola vez.
const SAMPLE_RESOURCES = [
  ['Guía RNAO: Valoración y prevención de lesiones por presión', 'Recomendaciones basadas en evidencia para valorar el riesgo y prevenir LPP en pacientes hospitalizados.', 'aprender', 'lesiones', ['enfermeria', 'tens', 'champions'], 'leer', 'Guía', 'RNAO', '2016', 'LPP, Braden, prevención', '20 min', 'publicado'],
  ['Checklist de cambios de posición cada 2 horas', 'Lista de verificación para asegurar la reposición y el alivio de presión en pacientes de riesgo.', 'aplicar', 'lesiones', ['enfermeria', 'tens', 'auxiliares'], 'practicar', 'Checklist', 'UBPC HUAP', '2024', 'posición, alivio de presión', '2 min', 'publicado'],
  ['Escala de Braden: aplicación paso a paso', 'Cómo puntuar el riesgo de lesión por presión y qué medidas activar según el resultado.', 'aplicar', 'lesiones', ['enfermeria', 'tens'], 'practicar', 'Escala', 'Braden & Bergstrom', '2023', 'Braden, riesgo', '5 min', 'publicado'],
  ['Infografía: los 5 puntos clave para prevenir LPP', 'Material visual listo para imprimir y usar en la inducción del equipo.', 'ensenar', 'lesiones', ['champions', 'jefaturas', 'tens'], 'ver', 'Infografía', 'UBPC HUAP', '2025', 'infografía, inducción', 'Descarga', 'publicado'],
  ['Mantención segura de accesos vasculares periféricos', 'Evidencia sobre inserción, mantención y retiro oportuno de vías venosas periféricas.', 'aprender', 'accesos', ['enfermeria', 'tens'], 'leer', 'Guía', 'INS', '2021', 'vía venosa, flebitis', '15 min', 'publicado'],
  ['Algoritmo: ¿retirar o mantener la vía venosa?', 'Diagrama de flujo para decidir el retiro de un acceso periférico según signos de flebitis.', 'aplicar', 'accesos', ['enfermeria', 'tens', 'champions'], 'ver', 'Algoritmo', 'Escala VIP', '2022', 'flebitis, retiro', '3 min', 'publicado'],
  ['Checklist de instalación de catéter venoso periférico', 'Pasos de asepsia y verificación para una instalación segura junto a la cama.', 'aplicar', 'accesos', ['enfermeria', 'tens'], 'practicar', 'Checklist', 'Bundle HUAP', '2024', 'asepsia, catéter', '2 min', 'publicado'],
  ['Indicador: tasa de flebitis por 1.000 días-catéter', 'Ficha del indicador, fórmula de cálculo y meta institucional para seguimiento mensual.', 'evaluar', 'accesos', ['jefaturas', 'champions'], 'leer', 'Indicador', 'Programa IAAS HUAP', '2025', 'indicador, flebitis', 'Ficha', 'publicado'],
  ['Manejo del dolor agudo en el servicio de urgencia', 'Recomendaciones para la valoración y tratamiento oportuno del dolor en adultos.', 'aprender', 'dolor', ['enfermeria', 'kine', 'tens'], 'leer', 'Recomendación', 'MINSAL', '2023', 'dolor agudo, EVA', '12 min', 'publicado'],
  ['Escala EVA y ESCID: cuál usar y cuándo', 'Guía práctica para valorar dolor en pacientes comunicantes y no comunicantes.', 'aplicar', 'dolor', ['enfermeria', 'tens', 'kine'], 'practicar', 'Escala', 'UBPC HUAP', '2024', 'EVA, ESCID', '4 min', 'publicado'],
  ['Cápsula en video: valoración del dolor en 3 minutos', 'Microaprendizaje audiovisual para reforzar la valoración sistemática del dolor.', 'ensenar', 'dolor', ['enfermeria', 'tens', 'champions'], 'ver', 'Cápsula', 'UBPC HUAP', '2025', 'video, dolor', '3 min', 'publicado'],
  ['Norma de higiene de manos: los 5 momentos de la OMS', 'Fundamento y aplicación de los cinco momentos clave para la higiene de manos.', 'aprender', 'iaas', ['enfermeria', 'tens', 'auxiliares', 'kine'], 'leer', 'Norma', 'OMS', '2009', 'higiene de manos, IAAS', '10 min', 'publicado'],
  ['Bundle de prevención de neumonía asociada a VM', 'Paquete de medidas verificables para prevenir NAV en pacientes ventilados.', 'aplicar', 'iaas', ['enfermeria', 'kine', 'champions'], 'practicar', 'Checklist', 'Programa IAAS HUAP', '2024', 'NAV, bundle', '3 min', 'publicado'],
  ['Pauta de auditoría de higiene de manos', 'Instrumento de observación directa para medir adherencia por unidad y turno.', 'evaluar', 'iaas', ['jefaturas', 'champions'], 'practicar', 'Auditoría', 'IAAS HUAP', '2025', 'auditoría, adherencia', 'Pauta', 'publicado'],
  ['Identificación segura del paciente', 'Prácticas para verificar la identidad con dos identificadores antes de cada procedimiento.', 'aprender', 'seguridad', ['enfermeria', 'tens', 'auxiliares'], 'leer', 'Guía', 'Metas OMS', '2022', 'identificación, seguridad', '8 min', 'publicado'],
  ['Checklist de traspaso de turno SBAR', 'Estructura Situación-Antecedentes-Evaluación-Recomendación para un traspaso seguro.', 'aplicar', 'seguridad', ['enfermeria', 'tens', 'kine', 'jefaturas'], 'practicar', 'Checklist', 'SBAR', '2024', 'SBAR, traspaso', '4 min', 'publicado'],
  ['Plan de implementación por unidad, rol y brecha', 'Plantilla para bajar una guía RNAO a la realidad de tu unidad y asignar responsables.', 'implementar', 'seguridad', ['jefaturas', 'champions'], 'practicar', 'Herramienta', 'Modelo BPSO · RNAO', '2025', 'implementación, brecha', 'Plantilla', 'publicado'],
  ['Tablero de indicadores de seguridad del paciente', 'Panel con eventos adversos, caídas y adherencia a metas para seguimiento por unidad.', 'evaluar', 'seguridad', ['jefaturas', 'champions'], 'ver', 'Indicador', 'Calidad HUAP', '2025', 'indicadores, eventos', 'Panel', 'publicado'],
  ['Presentación: cultura de seguridad y notificación de eventos', 'Set de diapositivas para sensibilizar al equipo sobre la notificación sin culpa.', 'ensenar', 'seguridad', ['champions', 'jefaturas'], 'ver', 'Presentación', 'UBPC HUAP', '2025', 'cultura, notificación', 'Descarga', 'publicado'],
  ['Ruta de implementación de la guía LPP en tu unidad', 'Pasos, recursos y roles para instalar la prevención de LPP como práctica estándar.', 'implementar', 'lesiones', ['jefaturas', 'champions', 'enfermeria'], 'practicar', 'Herramienta', 'Modelo BPSO · RNAO', '2025', 'implementación, LPP', 'Plantilla', 'publicado'],
  ['Actividad práctica: taller de movilización segura', 'Guion de taller con estaciones para entrenar la movilización y el traslado seguro.', 'ensenar', 'otras', ['kine', 'tens', 'auxiliares'], 'practicar', 'Actividad', 'Kinesiología HUAP', '2024', 'taller, movilización', '45 min', 'borrador'],
  ['Pauta de seguimiento de la reevaluación del dolor', 'Instrumento para verificar que el dolor se reevalúe tras cada intervención.', 'evaluar', 'dolor', ['enfermeria', 'champions', 'jefaturas'], 'leer', 'Pauta', 'UBPC HUAP', '2025', 'reevaluación, dolor', 'Pauta', 'oculto'],
].map((b, i) => ({ id: 'seed' + i, titulo: b[0], descripcion: b[1], ruta: b[2], tema: b[3], roles: b[4], aprendizaje: b[5], tipo: b[6], autor: b[7], anio: b[8], keywords: b[9], tiempo: b[10], estado: b[11] }));

module.exports = { sql, ensureSchema, addAudit, DEFAULT_EXPERIENCE, DEFAULT_STATS };
