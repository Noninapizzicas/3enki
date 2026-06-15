#!/usr/bin/env node
/**
 * CLI para exportar carta digital estática.
 *
 * Bebe de la PROYECCIÓN (misma función pura que el reflejo): carta + marca + contenido + config.
 * Así la PWA exportada hereda imágenes de `contenido` y branding de `marca` SIN tocar el POS.
 *
 * Uso:
 *   node modules/pizzepos/carta-digital/export-cli.js --project nonina
 *   node modules/pizzepos/carta-digital/export-cli.js --carta storage/pizzepos/cartas/carta_pizzicas.json
 *   node modules/pizzepos/carta-digital/export-cli.js --output ./mi-carta-web --whatsapp 34612345678
 *
 * Opciones:
 *   --project   Slug del proyecto → data/projects/<slug>/storage/pizzepos (fuente de marca/contenido)
 *   --carta     Ruta a un JSON de carta concreto (si no, primera carta del proyecto, o la legacy)
 *   --output    Directorio de salida (default: ./carta-static-output)
 *   --whatsapp  Teléfono con código de país (override; si no, marca.negocio.redes.whatsapp)
 *   --nombre    Nombre del negocio (override; si no, marca.esencia.nombre)
 *   --moneda    Símbolo de moneda (default: €)
 *   --color     Color primario hex (override; si no, marca.visual.colores.primario)
 */

const fs = require('fs');
const path = require('path');
const { generateStaticHTML, generateServiceWorker, generateManifest, generateIcon, slugify } = require('./static-template');
const { proyectarCartaPublica } = require('./proyeccion');

// ── args ──
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf('--' + name);
  if (idx === -1 || idx + 1 >= args.length) return defaultVal;
  return args[idx + 1];
}

const rootDir = path.resolve(__dirname, '..', '..', '..');
const project = getArg('project', '');
const outputDir = path.resolve(getArg('output', path.join(rootDir, 'carta-static-output')));
const moneda = getArg('moneda', '€');
const argNombre = getArg('nombre', '');
const argWhatsapp = getArg('whatsapp', '');
const argColor = getArg('color', '');

// storageRoot: raíz desde la que se resuelven las urls de contenido (/pizzepos/...).
// project mode → data/projects/<slug>/storage ; legacy → storage
const storageRoot = project
  ? path.join(rootDir, 'data', 'projects', project, 'storage')
  : path.join(rootDir, 'storage');
const pizzeposDir = path.join(storageRoot, 'pizzepos');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}

console.log('');
console.log('  ╔═══════════════════════════════════════╗');
console.log('  ║   Carta Digital — Export Estático      ║');
console.log('  ╚═══════════════════════════════════════╝');
console.log('');

// ── carta ──
let cartaPath = getArg('carta', '');
if (cartaPath) {
  cartaPath = path.resolve(rootDir, cartaPath);
} else {
  const cartasDir = path.join(pizzeposDir, 'cartas');
  const first = fs.existsSync(cartasDir) ? fs.readdirSync(cartasDir).find(f => f.endsWith('.json')) : null;
  cartaPath = first
    ? path.join(cartasDir, first)
    : path.join(rootDir, 'storage', 'pizzepos', 'cartas', 'carta_pizzicas.json');  // fallback legacy
}
const carta = readJson(cartaPath, null);
if (!carta) {
  console.error(`  ERROR: No se pudo leer la carta en ${cartaPath}`);
  console.error('  Usa --project <slug> o --carta <ruta>');
  process.exit(1);
}

// ── marca · contenido · config (fuentes de la proyección; ausentes = vacío) ──
const marca = readJson(path.join(pizzeposDir, 'marca.json'), null);
const contenido = readJson(path.join(pizzeposDir, 'contenido.json'), {});
const config = readJson(path.join(pizzeposDir, 'carta-digital', 'config.json'), {});

// ── PROYECCIÓN (misma forma que sirve el reflejo) ──
const proy = proyectarCartaPublica(carta, marca, contenido, config);
const b = proy.branding || {};

console.log(`  Carta:      ${cartaPath}`);
console.log(`  Proyecto:   ${project || '(legacy/root)'}`);
console.log(`  Productos:  ${proy.productos.length}`);
console.log(`  Categorias: ${proy.categorias.length}`);
console.log(`  Marca:      ${marca ? (b.nombre || 'sí') : 'no (sin marca.json)'}`);

// ── branding → config de la plantilla (los flags CLI mandan si se pasan) ──
const nombre = argNombre || b.nombre || 'Carta';
const colores = b.colores || {};
const colorPrimario = argColor || colores.primario || colores.principal || colores.acento || '#f59e0b';
const colorFondo = colores.fondo || '#0a0a0a';
const colorTexto = colores.texto || '#e5e5e5';
const whatsapp = argWhatsapp || b.negocio?.redes?.whatsapp || b.negocio?.local?.telefono || '';
const logoEmoji = (typeof b.logo === 'string' && b.logo.length <= 4) ? b.logo : '\u{1F355}';

const tplConfig = {
  nombre_negocio: nombre,
  moneda,
  whatsapp_telefono: whatsapp,
  mensaje_header: '¡Hola! Quiero pedir:',
  tema: { color_primario: colorPrimario, color_fondo: colorFondo, color_texto: colorTexto, logo_emoji: logoEmoji }
};

console.log(`  Negocio:    ${nombre}`);
console.log(`  WhatsApp:   ${whatsapp || '(no configurado)'}`);
console.log(`  Output:     ${outputDir}`);
console.log('');

// ── generar (la plantilla recibe la carta YA proyectada) ──
const html = generateStaticHTML({ categorias: proy.categorias, productos: proy.productos }, tplConfig);
const sw = generateServiceWorker(nombre);
const manifest = generateManifest(nombre, colorPrimario, colorFondo);

const imgDir = path.join(outputDir, 'img');
fs.mkdirSync(imgDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(outputDir, 'sw.js'), sw, 'utf8');
fs.writeFileSync(path.join(outputDir, 'manifest.json'), manifest, 'utf8');
fs.writeFileSync(path.join(outputDir, 'icon-192.svg'), generateIcon(192, logoEmoji, colorPrimario, colorFondo), 'utf8');
fs.writeFileSync(path.join(outputDir, 'icon-512.svg'), generateIcon(512, logoEmoji, colorPrimario, colorFondo), 'utf8');

// ── copiar imágenes de contenido (urls /pizzepos/... relativas al storage del proyecto) ──
let imgCount = 0;
for (const p of proy.productos) {
  if (p.imagen && !p.imagen.startsWith('http')) {
    const srcPath = path.join(storageRoot, p.imagen.replace(/^\/+/, ''));
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(imgDir, path.basename(srcPath)));
      imgCount++;
    }
  }
}

console.log('  Archivos generados:');
console.log(`    index.html    (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
console.log(`    sw.js         (service worker para offline)`);
console.log(`    manifest.json (PWA manifest)`);
if (imgCount > 0) console.log(`    img/          (${imgCount} imágenes de contenido copiadas)`);
console.log('');

console.log('  ═══════════════════════════════════════');
console.log('  SIGUIENTE PASO — Desplegar:');
console.log('  ═══════════════════════════════════════');
console.log('');
console.log('  Opción 1: Netlify (más fácil)');
console.log('    → Abre https://app.netlify.com/drop');
console.log(`    → Arrastra la carpeta: ${outputDir}`);
console.log('');
console.log('  Opción 2: GitHub Pages');
console.log('    $ cd ' + outputDir);
console.log('    $ git init && git add -A && git commit -m "Carta ' + nombre + '"');
console.log('    $ gh repo create ' + slugify(nombre) + '-carta --public --source=. --push');
console.log('');
console.log('  Opción 3: Probar local');
console.log(`    $ cd ${outputDir} && npx serve .`);
console.log('');

if (!whatsapp) {
  console.log('  NOTA: sin WhatsApp (ni flag ni marca.negocio). El botón usará "Compartir".');
  console.log('');
}

console.log('  Listo.');
console.log('');
