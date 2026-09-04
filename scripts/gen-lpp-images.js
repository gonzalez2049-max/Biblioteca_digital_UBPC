/* Genera 17 ilustraciones clínicas originales (SVG) para las tarjetas de LPP.
   Estilo plano, institucional, respetuoso; sin heridas. Acento por ruta.
   Salida: assets/lpp/<name>.svg  (permanentes, dentro del proyecto). */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'lpp');
fs.mkdirSync(OUT, { recursive: true });

const ROUTE_COLOR = { aprender: '#2563eb', aplicar: '#0d9488', ensenar: '#e64b5c', implementar: '#7c5cfc', evaluar: '#d98514' };

const SKIN = '#eabd97', SKIN2 = '#d59f76', HAIR = '#3b4149', UNI = '#2e6f8f', UNI2 = '#245a75',
  BED = '#cdd8e1', SHEET = '#eef3f7', LINE = '#93a3b0', INK = '#33414c', WHITE = '#ffffff', SCRUB = '#3aa0a6';

function frame(accent, inner) {
  const g = 'a' + Math.random().toString(36).slice(2, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240" role="img">
  <defs>
    <linearGradient id="bg${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f6fa"/><stop offset="1" stop-color="#e6edf3"/></linearGradient>
    <radialGradient id="ac${g}" cx="82%" cy="16%" r="70%"><stop offset="0" stop-color="${accent}" stop-opacity="0.20"/><stop offset="60%" stop-color="${accent}" stop-opacity="0.05"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="240" fill="url(#bg${g})"/>
  <rect width="400" height="240" fill="url(#ac${g})"/>
  <rect x="0" y="232" width="400" height="8" fill="${accent}" opacity="0.9"/>
  <circle cx="356" cy="34" r="20" fill="${WHITE}" opacity="0.85"/><g transform="translate(356,34)"><rect x="-4" y="-11" width="8" height="22" rx="2" fill="${accent}"/><rect x="-11" y="-4" width="22" height="8" rx="2" fill="${accent}"/></g>
  ${inner}
</svg>`;
}

// primitivas
const head = (x, y, r = 13, skin = SKIN, hair = HAIR) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${skin}"/><path d="M${x - r} ${y - 2} a${r} ${r} 0 0 1 ${2 * r} 0 v-3 a${r} ${r} 0 0 0 ${-2 * r} 0 z" fill="${hair}"/>`;
const nurse = (x, y, color = UNI) =>
  `${head(x, y)}<path d="M${x - 15} ${y + 40} q0 -26 15 -26 q15 0 15 26 z" fill="${color}"/><rect x="${x - 3}" y="${y + 14}" width="6" height="14" fill="${SKIN}"/>`;
const bedPatient = (x, y) =>
  `<rect x="${x}" y="${y + 30}" width="180" height="14" rx="4" fill="${BED}"/><rect x="${x + 4}" y="${y + 14}" width="172" height="20" rx="8" fill="${SHEET}"/>
   <rect x="${x + 6}" y="${y}" width="46" height="20" rx="10" fill="${SHEET}"/>${head(x + 20, y + 6, 11)}
   <rect x="${x}" y="${y + 12}" width="6" height="34" fill="${LINE}"/><rect x="${x + 174}" y="${y + 12}" width="6" height="34" fill="${LINE}"/>`;

function scene(name, accent) {
  switch (name) {
    case 'braden': // profesional valorando con tablet + escala
      return `${bedPatient(40, 150)}
        ${nurse(250, 96, UNI)}
        <rect x="232" y="150" width="52" height="40" rx="5" fill="${WHITE}" stroke="${LINE}"/><rect x="240" y="158" width="36" height="5" rx="2" fill="${accent}"/>
        <rect x="240" y="168" width="36" height="4" rx="2" fill="${LINE}"/><rect x="240" y="176" width="24" height="4" rx="2" fill="${LINE}"/>
        <g transform="translate(300,150)"><rect width="66" height="40" rx="6" fill="${WHITE}" stroke="${LINE}"/><rect x="8" y="9" width="12" height="22" rx="2" fill="${accent}" opacity="0.5"/><rect x="24" y="9" width="12" height="22" rx="2" fill="${accent}" opacity="0.7"/><rect x="40" y="9" width="12" height="22" rx="2" fill="${accent}"/></g>`;
    case 'revision-piel': // inspección respetuosa del antebrazo
      return `${bedPatient(30, 150)}
        ${nurse(255, 92, SCRUB)}
        <path d="M120 176 q40 -14 96 -6" stroke="${SKIN2}" stroke-width="14" fill="none" stroke-linecap="round"/>
        <circle cx="234" cy="150" r="20" fill="none" stroke="${accent}" stroke-width="4"/><rect x="248" y="164" width="18" height="5" rx="2" transform="rotate(45 248 164)" fill="${accent}"/>`;
    case 'niveles-riesgo': // barras bajo/medio/alto
      return `<rect x="60" y="60" width="280" height="150" rx="12" fill="${WHITE}" stroke="${LINE}"/>
        <text x="80" y="92" font-family="Arial" font-size="16" font-weight="700" fill="${INK}">Nivel de riesgo</text>
        <rect x="80" y="120" width="70" height="60" rx="6" fill="#e7f3ec"/><rect x="80" y="150" width="70" height="30" rx="6" fill="#37a06b"/><text x="115" y="200" font-family="Arial" font-size="12" fill="${INK}" text-anchor="middle">Bajo</text>
        <rect x="165" y="120" width="70" height="60" rx="6" fill="#fdf0d9"/><rect x="165" y="138" width="70" height="42" rx="6" fill="#e0a53b"/><text x="200" y="200" font-family="Arial" font-size="12" fill="${INK}" text-anchor="middle">Medio</text>
        <rect x="250" y="120" width="70" height="60" rx="6" fill="#fbe4e4"/><rect x="250" y="126" width="70" height="54" rx="6" fill="#d75757"/><text x="285" y="200" font-family="Arial" font-size="12" fill="${INK}" text-anchor="middle">Alto</text>`;
    case 'cambios-posicion': // reloj 2h + flecha giro
      return `${bedPatient(120, 150)}
        <g transform="translate(70,96)"><circle r="34" fill="${WHITE}" stroke="${accent}" stroke-width="4"/><line x1="0" y1="0" x2="0" y2="-22" stroke="${INK}" stroke-width="3"/><line x1="0" y1="0" x2="16" y2="8" stroke="${INK}" stroke-width="3"/><text x="0" y="52" font-family="Arial" font-size="13" font-weight="700" fill="${accent}" text-anchor="middle">cada 2 h</text></g>
        <path d="M210 120 a40 40 0 1 1 -18 -30" fill="none" stroke="${accent}" stroke-width="5"/><path d="M196 84 l-8 14 16 2 z" fill="${accent}"/>`;
    case 'reposicionamiento': // dos profesionales + sábana deslizante
      return `${bedPatient(110, 150)}
        ${nurse(70, 96, UNI)}${nurse(330, 96, SCRUB)}
        <rect x="118" y="176" width="164" height="10" rx="5" fill="${accent}" opacity="0.7"/>
        <path d="M96 150 q20 6 30 22" stroke="${SKIN}" stroke-width="9" fill="none" stroke-linecap="round"/>
        <path d="M304 150 q-20 6 -30 22" stroke="${SKIN}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    case 'talones': // pierna con cojín bajo pantorrilla, talón flotando
      return `<rect x="40" y="150" width="320" height="16" rx="6" fill="${BED}"/>
        <path d="M70 150 q90 -8 150 -6" stroke="${SKIN2}" stroke-width="20" fill="none" stroke-linecap="round"/>
        <ellipse cx="240" cy="150" rx="26" ry="18" fill="${SKIN}"/>
        <path d="M175 150 q30 -34 60 -6" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="3 5"/>
        <rect x="150" y="146" width="70" height="26" rx="13" fill="${accent}" opacity="0.35"/>
        <text x="270" y="120" font-family="Arial" font-size="13" font-weight="700" fill="${accent}">talón libre</text>`;
    case 'humedad': // gota + escudo (barrera cutánea)
      return `<circle cx="200" cy="118" r="70" fill="${WHITE}" stroke="${LINE}"/>
        <path d="M200 78 c18 26 26 34 26 50 a26 26 0 1 1 -52 0 c0 -16 8 -24 26 -50 z" fill="${accent}" opacity="0.85"/>
        <path d="M262 132 l30 12 v18 c0 20 -14 30 -30 36 -16 -6 -30 -16 -30 -36 v-18 z" fill="${WHITE}" stroke="${accent}" stroke-width="4"/>
        <path d="M247 168 l9 9 17 -18" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`;
    case 'superficies': // corte de colchón/cojín preventivo
      return `<rect x="60" y="120" width="280" height="70" rx="14" fill="${WHITE}" stroke="${LINE}"/>
        <g fill="${accent}" opacity="0.25">${Array.from({ length: 9 }).map((_, i) => `<circle cx="${86 + i * 30}" cy="150" r="16"/>`).join('')}</g>
        <g fill="none" stroke="${accent}" stroke-width="2" opacity="0.6">${Array.from({ length: 9 }).map((_, i) => `<circle cx="${86 + i * 30}" cy="150" r="16"/>`).join('')}</g>
        <text x="200" y="210" font-family="Arial" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">superficie de apoyo</text>`;
    case 'dispositivos': // mascarilla + tubo, punto de contacto revisado
      return `${head(150, 120, 34, SKIN, HAIR)}
        <rect x="132" y="128" width="60" height="30" rx="12" fill="${accent}" opacity="0.55" stroke="${accent}" stroke-width="2"/>
        <path d="M192 143 q60 6 96 40" stroke="${LINE}" stroke-width="7" fill="none"/>
        <circle cx="148" cy="150" r="16" fill="none" stroke="${accent}" stroke-width="4"/><rect x="160" y="162" width="16" height="5" rx="2" transform="rotate(45 160 162)" fill="${accent}"/>`;
    case 'registro': // profesional documentando en ficha/tablet
      return `${nurse(120, 96, UNI)}
        <g transform="translate(180,120)"><rect width="150" height="96" rx="8" fill="${WHITE}" stroke="${LINE}"/><rect x="16" y="16" width="118" height="8" rx="4" fill="${accent}"/>
        ${Array.from({ length: 4 }).map((_, i) => `<rect x="16" y="${36 + i * 14}" width="${110 - i * 14}" height="6" rx="3" fill="${LINE}"/><path d="M0 0" /><path d="M0 0"/>`).join('')}
        ${Array.from({ length: 4 }).map((_, i) => `<path d="M2 ${39 + i * 14} l4 4 7 -8" transform="translate(0,0)" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>`).join('')}</g>
        <path d="M146 150 q26 -2 40 8" stroke="${SKIN}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    case 'entrega-turno': // dos profesionales comunicándose (SBAR)
      return `${nurse(120, 100, UNI)}${nurse(280, 100, SCRUB)}
        <g transform="translate(150,88)"><rect width="100" height="46" rx="12" fill="${WHITE}" stroke="${accent}" stroke-width="2"/><path d="M20 46 l-6 14 20 -10 z" fill="${WHITE}" stroke="${accent}" stroke-width="2"/><text x="50" y="30" font-family="Arial" font-size="16" font-weight="800" fill="${accent}" text-anchor="middle">SBAR</text></g>`;
    case 'checklist': // portapapeles con checks
      return `<g transform="translate(120,54)"><rect width="160" height="140" rx="12" fill="${WHITE}" stroke="${LINE}"/><rect x="54" y="-8" width="52" height="20" rx="6" fill="${accent}"/>
        ${Array.from({ length: 5 }).map((_, i) => `<rect x="24" y="${24 + i * 22}" width="16" height="16" rx="4" fill="${accent}" opacity="0.15" stroke="${accent}" stroke-width="2"/><path d="M27 ${32 + i * 22} l4 4 7 -9" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><rect x="50" y="${28 + i * 22}" width="${88 - (i % 3) * 16}" height="7" rx="3" fill="${LINE}"/>`).join('')}</g>`;
    case 'educacion': // profesional explicando a paciente/familia
      return `${nurse(96, 100, UNI)}
        <g transform="translate(130,80)"><rect width="96" height="44" rx="12" fill="${WHITE}" stroke="${accent}" stroke-width="2"/><path d="M18 44 l-6 12 18 -8 z" fill="${WHITE}" stroke="${accent}" stroke-width="2"/><rect x="16" y="16" width="64" height="6" rx="3" fill="${accent}"/><rect x="16" y="28" width="44" height="6" rx="3" fill="${LINE}"/></g>
        ${head(280, 120, 15)}${head(320, 126, 12)}<path d="M262 190 q18 -30 36 -30 q18 0 18 30 z" fill="${SCRUB}"/><path d="M306 190 q14 -24 28 -24 q10 0 12 24 z" fill="${accent}" opacity="0.6"/>`;
    case 'champion': // funcionario con distintivo/estrella
      return `${nurse(200, 90, accent)}
        <g transform="translate(200,150)"><path d="M0 -20 L6 -6 21 -6 9 3 13 18 0 9 -13 18 -9 3 -21 -6 -6 -6 z" fill="${accent}"/></g>
        <g transform="translate(232,120)"><rect width="70" height="24" rx="6" fill="${WHITE}" stroke="${accent}" stroke-width="2"/><text x="35" y="17" font-family="Arial" font-size="12" font-weight="800" fill="${accent}" text-anchor="middle">CHAMPION</text></g>`;
    case 'compartir': // compartir recomendación con el equipo (nodos)
      return `${nurse(70, 110, UNI)}
        <circle cx="230" cy="80" r="20" fill="${WHITE}" stroke="${accent}" stroke-width="3"/>${head(230, 80, 11)}
        <circle cx="300" cy="140" r="20" fill="${WHITE}" stroke="${accent}" stroke-width="3"/>${head(300, 140, 11)}
        <circle cx="230" cy="190" r="20" fill="${WHITE}" stroke="${accent}" stroke-width="3"/>${head(230, 190, 11)}
        <g stroke="${accent}" stroke-width="3"><path d="M108 120 L210 82"/><path d="M108 128 L282 140"/><path d="M108 136 L210 188"/></g>
        <g fill="${accent}"><circle cx="160" cy="101" r="4"/><circle cx="195" cy="134" r="4"/><circle cx="160" cy="162" r="4"/></g>`;
    case 'verificacion': // lupa + check (verificar medida)
      return `<circle cx="180" cy="118" r="60" fill="${WHITE}" stroke="${LINE}"/>
        <path d="M158 118 l16 16 34 -40" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="250" cy="150" r="34" fill="none" stroke="${accent}" stroke-width="7"/><rect x="272" y="172" width="46" height="10" rx="5" transform="rotate(45 272 172)" fill="${accent}"/>`;
    case 'auditoria': // seguimiento de adherencia (línea de tendencia) — solo mención
      return `<rect x="60" y="60" width="280" height="150" rx="12" fill="${WHITE}" stroke="${LINE}"/>
        <g stroke="#dbe2e8"><line x1="80" y1="90" x2="320" y2="90"/><line x1="80" y1="130" x2="320" y2="130"/><line x1="80" y1="170" x2="320" y2="170"/></g>
        <polyline points="82,175 130,150 178,158 226,120 274,110 318,86" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <g fill="${accent}"><circle cx="130" cy="150" r="5"/><circle cx="226" cy="120" r="5"/><circle cx="318" cy="86" r="5"/></g>
        <text x="200" y="200" font-family="Arial" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">adherencia en el tiempo</text>`;
    default:
      return '';
  }
}

const ITEMS = [
  ['braden', 'aprender'], ['revision-piel', 'aprender'], ['niveles-riesgo', 'aprender'],
  ['cambios-posicion', 'aplicar'], ['reposicionamiento', 'aplicar'], ['talones', 'aplicar'],
  ['humedad', 'aplicar'], ['superficies', 'aplicar'], ['dispositivos', 'aplicar'],
  ['registro', 'implementar'], ['entrega-turno', 'implementar'], ['checklist', 'implementar'],
  ['educacion', 'ensenar'], ['champion', 'ensenar'], ['compartir', 'ensenar'],
  ['verificacion', 'evaluar'], ['auditoria', 'evaluar'],
];

for (const [name, route] of ITEMS) {
  const svg = frame(ROUTE_COLOR[route], scene(name, ROUTE_COLOR[route]));
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
}
console.log('Generadas', ITEMS.length, 'imágenes en assets/lpp/');
