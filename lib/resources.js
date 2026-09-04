// Helpers de mapeo para recursos.
function toResource(r) {
  return {
    id: r.id, titulo: r.titulo, descripcion: r.descripcion, ruta: r.ruta, tema: r.tema,
    roles: r.roles || [], aprendizaje: r.aprendizaje, tipo: r.tipo, autor: r.autor, anio: r.anio,
    keywords: r.keywords, tiempo: r.tiempo, imagen: r.imagen_url || null, archivo: r.archivo || null,
    enlace: r.enlace, youtube: r.youtube, estado: r.estado,
    creadoPor: r.creado_por, modificadoPor: r.modificado_por, fecha: r.updated_at,
  };
}
const RUTAS = ['aprender', 'aplicar', 'ensenar', 'implementar', 'evaluar'];
const ESTADOS = ['borrador', 'publicado', 'oculto'];
function clean(body) {
  const ruta = RUTAS.includes(body.ruta) ? body.ruta : 'aprender';
  const estado = ESTADOS.includes(body.estado) ? body.estado : 'borrador';
  return {
    titulo: String(body.titulo || '').slice(0, 300),
    descripcion: String(body.descripcion || '').slice(0, 4000),
    ruta, tema: String(body.tema || 'otras'),
    roles: Array.isArray(body.roles) ? body.roles : [],
    aprendizaje: String(body.aprendizaje || ''),
    tipo: String(body.tipo || ''),
    autor: String(body.autor || ''),
    anio: String(body.anio || ''),
    keywords: String(body.keywords || ''),
    tiempo: String(body.tiempo || ''),
    imagen_url: body.imagen || null,
    archivo: body.archivo || null,
    enlace: String(body.enlace || ''),
    youtube: String(body.youtube || ''),
    estado,
  };
}
module.exports = { toResource, clean };
