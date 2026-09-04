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

    // Recursos iniciales enfocados EXCLUSIVAMENTE en la Guía RNAO de Prevención de
    // Lesiones por Presión (LPP). Se cargan una sola vez y se marcan como 'Ejemplo',
    // por lo que pueden editarse, ocultarse o eliminarse desde Administración.
    // El marcador evita recargarlos si el usuario los borra.
    const seeded = await sql`SELECT 1 FROM singletons WHERE key = '_seeded_lpp_v1' LIMIT 1`;
    if (!seeded.rows[0]) {
      // Retirar el set genérico previo (si existiera) antes de cargar el set LPP.
      await sql`DELETE FROM resources WHERE creado_por = 'Ejemplo' AND id LIKE 'seed%'`;
      for (const r of SAMPLE_RESOURCES) {
        await sql`INSERT INTO resources (id, titulo, descripcion, ruta, tema, roles, aprendizaje, tipo, autor, anio, keywords, tiempo, imagen_url, estado, creado_por, modificado_por)
          VALUES (${r.id}, ${r.titulo}, ${r.descripcion}, ${r.ruta}, ${r.tema}, ${JSON.stringify(r.roles)}, ${r.aprendizaje}, ${r.tipo}, ${r.autor}, ${r.anio}, ${r.keywords}, ${r.tiempo}, ${r.imagen_url}, ${r.estado}, 'Ejemplo', 'Ejemplo')
          ON CONFLICT (id) DO NOTHING`;
      }
      await sql`INSERT INTO singletons (key, data) VALUES ('_seeded_lpp_v1', ${JSON.stringify({ at: new Date().toISOString() })}) ON CONFLICT (key) DO NOTHING`;
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

// Recursos iniciales — Guía RNAO de Prevención de Lesiones por Presión (LPP).
// Tarjetas breves y operativas: cada una responde ¿Qué debo revisar? · ¿Qué debo hacer? ·
// ¿Qué debo registrar? · ¿Cómo verifico? Cada recurso tiene su propia imagen en assets/lpp/.
// Campos por fila: [imagen, titulo, ruta, roles, aprendizaje, tipo, autor, anio, tiempo, keywords, revisar, hacer, registrar, verificar]
const LPP_ROWS = [
  // ── Aprender (azul): entender el riesgo y la valoración ──
  ['braden', 'Escala de Braden: valorar el riesgo', 'aprender', ['enfermeria', 'tens'], 'leer', 'Escala', 'RNAO', '2016', '5 min', 'Braden, riesgo, valoración',
    'Las 6 subescalas: percepción sensorial, humedad, actividad, movilidad, nutrición y fricción/cizalla.',
    'Puntuar de 6 a 23 y activar el paquete de prevención cuando el puntaje es ≤ 18.',
    'Puntaje total y nivel de riesgo al ingreso y luego cada 24 h.',
    'Toda cama de riesgo tiene un Braden vigente y firmado.'],
  ['revision-piel', 'Inspección de la piel', 'aprender', ['enfermeria', 'tens', 'auxiliares'], 'leer', 'Guía', 'RNAO', '2016', '4 min', 'piel, eritema, prominencias',
    'Prominencias óseas —sacro, talones, trocánteres, occipucio— buscando eritema no blanqueable.',
    'Valoración cefalocaudal con buena luz y prueba de presión del dedo sobre el enrojecimiento.',
    'Localización, categoría y aspecto de cualquier hallazgo en la piel.',
    'La inspección se realiza al ingreso y en cada turno.'],
  ['niveles-riesgo', 'Niveles de riesgo y medidas', 'aprender', ['enfermeria', 'tens', 'champions'], 'leer', 'Guía', 'RNAO', '2016', '4 min', 'riesgo, paquete de medidas',
    'La correspondencia entre el puntaje de Braden y la categoría de riesgo del paciente.',
    'Asignar el paquete de medidas según el nivel: en riesgo, alto o muy alto.',
    'Nivel de riesgo asignado y las medidas de prevención activadas.',
    'El nivel se reevalúa si cambia la condición clínica del paciente.'],
  // ── Aplicar (turquesa): las intervenciones junto a la cama ──
  ['cambios-posicion', 'Cambios de posición cada 2 horas', 'aplicar', ['enfermeria', 'tens', 'auxiliares'], 'practicar', 'Práctica', 'RNAO', '2016', '2 min', 'reposición, 30 grados',
    'La tolerancia y estabilidad del paciente antes de movilizar.',
    'Reposicionar cada 2 h alternando decúbitos y usando la posición lateral de 30°.',
    'Hora y posición en la hoja de cambios posturales.',
    'No se supera el intervalo de 2 h entre cambios.'],
  ['reposicionamiento', 'Técnica segura de reposicionamiento', 'aplicar', ['enfermeria', 'tens', 'auxiliares'], 'practicar', 'Práctica', 'RNAO', '2016', '3 min', 'cizalla, arrastre, grúa',
    'La presencia de fricción o cizalla al movilizar al paciente.',
    'Usar sábana de traslado o grúa y elevar —nunca arrastrar— al reposicionar.',
    'Técnica y ayudas mecánicas utilizadas en la movilización.',
    'La piel queda sin enrojecimiento tras el cambio.'],
  ['talones', 'Descarga y protección de talones', 'aplicar', ['enfermeria', 'tens'], 'practicar', 'Práctica', 'RNAO', '2016', '2 min', 'talones, descarga, almohada',
    'El apoyo del talón directamente sobre el colchón.',
    'Flotar los talones con una almohada bajo la pantorrilla, sin comprimir el tendón.',
    'Medida de descarga aplicada a los talones.',
    'El talón queda sin contacto y sin eritema.'],
  ['humedad', 'Manejo de la humedad de la piel', 'aplicar', ['enfermeria', 'tens', 'auxiliares'], 'practicar', 'Práctica', 'RNAO', '2016', '2 min', 'humedad, incontinencia, barrera',
    'La piel expuesta a incontinencia, sudoración o exudado.',
    'Higiene suave, secado cuidadoso y aplicación de un protector cutáneo barrera.',
    'Episodios de humedad y los cuidados de la piel realizados.',
    'La piel se mantiene seca e íntegra.'],
  ['superficies', 'Superficies de apoyo adecuadas', 'aplicar', ['enfermeria', 'champions'], 'practicar', 'Práctica', 'RNAO', '2016', '3 min', 'colchón, redistribución de presión',
    'La idoneidad del colchón o cojín según el nivel de riesgo.',
    'Indicar una superficie de redistribución de presión cuando corresponde.',
    'Tipo de superficie de apoyo asignada al paciente.',
    'La superficie funciona y mantiene una presión adecuada.'],
  ['dispositivos', 'Lesiones por dispositivos clínicos', 'aplicar', ['enfermeria', 'tens', 'kine'], 'practicar', 'Práctica', 'RNAO', '2016', '3 min', 'dispositivos, sondas, mascarillas',
    'La piel bajo sondas, mascarillas, férulas y catéteres.',
    'Rotar o almohadillar los puntos de apoyo del dispositivo.',
    'La revisión de las zonas de piel bajo cada dispositivo.',
    'No hay marcas ni lesión bajo el dispositivo.'],
  // ── Implementar (violeta): dejarlo instalado en la rutina ──
  ['registro', 'Registro estandarizado de LPP', 'implementar', ['enfermeria', 'jefaturas'], 'practicar', 'Herramienta', 'RNAO', '2016', '3 min', 'registro, ficha, documentación',
    'Los campos obligatorios de la ficha de prevención de LPP.',
    'Documentar valoración, medidas aplicadas y evolución de la piel.',
    'Braden, estado de la piel, cambios posturales y superficie de apoyo.',
    'El registro queda completo en cada turno.'],
  ['entrega-turno', 'Entrega de turno de la piel', 'implementar', ['enfermeria', 'tens', 'jefaturas'], 'practicar', 'Herramienta', 'RNAO', '2016', '2 min', 'SBAR, traspaso, continuidad',
    'El estado de la piel y el nivel de riesgo del paciente.',
    'Traspasar en formato SBAR las medidas de prevención activas.',
    'Los pendientes de prevención para el turno siguiente.',
    'El plan de prevención continúa sin interrupción entre turnos.'],
  ['checklist', 'Checklist diario de prevención', 'implementar', ['enfermeria', 'champions'], 'practicar', 'Checklist', 'RNAO', '2016', '2 min', 'bundle, checklist, adherencia',
    'El cumplimiento de todas las medidas del paquete de prevención.',
    'Aplicar la lista de verificación diaria junto a la cama.',
    'Ítems cumplidos y las brechas detectadas.',
    'Se cumple el 100% del paquete en cada paciente de riesgo.'],
  // ── Enseñar (coral): traspasar el conocimiento ──
  ['educacion', 'Educación al paciente y la familia', 'ensenar', ['enfermeria', 'tens'], 'ver', 'Cápsula', 'RNAO', '2016', '3 min', 'educación, familia, cuidador',
    'El conocimiento del paciente y su cuidador sobre las LPP.',
    'Enseñar signos de alarma y la importancia de los cambios de posición.',
    'La educación entregada y la comprensión alcanzada.',
    'El cuidador reproduce las indicaciones de prevención.'],
  ['champion', 'Rol del champion en la unidad', 'ensenar', ['champions', 'jefaturas'], 'ver', 'Guía', 'RNAO · BPSO', '2016', '4 min', 'champion, liderazgo, adherencia',
    'La adherencia del equipo a la guía de prevención.',
    'Acompañar y modelar la práctica correcta junto a la cama.',
    'Los refuerzos y capacitaciones realizados al equipo.',
    'Las buenas prácticas se sostienen en el tiempo en la unidad.'],
  ['compartir', 'Compartir la evidencia RNAO', 'ensenar', ['champions', 'enfermeria'], 'ver', 'Cápsula', 'RNAO', '2016', '3 min', 'difusión, evidencia, cápsulas',
    'Las recomendaciones clave de la guía RNAO de LPP.',
    'Difundir cápsulas breves de evidencia en las reuniones del equipo.',
    'Las instancias de difusión realizadas.',
    'Los mensajes clave son conocidos por todo el equipo.'],
  // ── Evaluar (ámbar): verificar y seguir la adherencia ──
  ['verificacion', 'Verificación junto a la cama', 'evaluar', ['enfermeria', 'champions', 'jefaturas'], 'practicar', 'Pauta', 'RNAO', '2016', '3 min', 'verificación, observación, brechas',
    'Que las medidas indicadas se estén aplicando realmente.',
    'Una observación directa breve del cuidado durante el turno.',
    'El cumplimiento observado de cada medida.',
    'Las brechas se corrigen en el momento.'],
  ['auditoria', 'Auditoría y seguimiento de adherencia', 'evaluar', ['jefaturas', 'champions'], 'leer', 'Pauta', 'RNAO · BPSO', '2016', '4 min', 'auditoría, adherencia, mejora',
    'La adherencia global del equipo al paquete de prevención.',
    'Una observación periódica y estructurada por unidad.',
    'El porcentaje de adherencia por cada medida.',
    'La tendencia se sigue y orienta los planes de mejora. (Próximamente: formularios e indicadores).'],
];

const SAMPLE_RESOURCES = LPP_ROWS.map((b, i) => ({
  id: 'lpp' + i,
  imagen_url: '/assets/lpp/' + b[0] + '.svg',
  titulo: b[1],
  ruta: b[2],
  tema: 'lesiones',
  roles: b[3],
  aprendizaje: b[4],
  tipo: b[5],
  autor: b[6],
  anio: b[7],
  tiempo: b[8],
  keywords: b[9],
  estado: 'publicado',
  descripcion: '¿Qué revisar? ' + b[10] + ' · ¿Qué hacer? ' + b[11] + ' · ¿Qué registrar? ' + b[12] + ' · ¿Cómo verifico? ' + b[13],
}));

module.exports = { sql, ensureSchema, addAudit, DEFAULT_EXPERIENCE, DEFAULT_STATS };
