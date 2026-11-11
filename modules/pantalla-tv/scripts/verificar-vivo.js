'use strict';

/**
 * verificar-vivo — el constructor del REPO contra la pantalla que está en la calle.
 *
 * No es un test de mentira: lee los datos reales del proyecto, construye con el
 * código versionado y compara pieza a pieza con el bloques.json publicado. Si el
 * port cambió una pieza (precio, forma, orden de zona, foto degradada a ficha),
 * aquí canta.
 *
 * Uso:
 *   node modules/pantalla-tv/scripts/verificar-vivo.js \
 *        --storage /opt/enki/data/projects/the-pirate/storage/pizzepos \
 *        --publicado /opt/enki/public/a/the-pirate/escaparate/bloques.json \
 *        [--cableado modules/pantalla-tv/ejemplos/the-pirate.json]
 *
 * Sale 1 si hay cualquier diferencia. Es de SOLO LECTURA: no escribe nada.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { construir, hoyEn } = require('../construir');
const { proyectarCartaPublica, normalizarTelefono } = require('../../pizzepos/carta-digital/proyeccion');

function arg(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : porDefecto;
}

const STORAGE = arg('storage', '/opt/enki/data/projects/the-pirate/storage/pizzepos');
const PUBLICADO = arg('publicado', '/opt/enki/public/a/the-pirate/escaparate/bloques.json');
const CABLEADO = arg('cableado', path.join(__dirname, '..', 'ejemplos', 'the-pirate.json'));

const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(STORAGE, f), 'utf8')); } catch { return def; } };
const leerJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

const cableado = leerJSON(CABLEADO);
const tarifas = leer('tarifas.json', {});
const carta_id = tarifas.general;
const carta = leer(`cartas/${carta_id}.json`, null);
const marca = leer('marca.json', null);
const contenidoRaw = leer('contenido.json', {});
const contenido = contenidoRaw.productos || contenidoRaw;
const servicio = leer('servicio/config.json', {});
const porciones = leer('porciones.json', null);
const promos = leer('promos.json', null);

// Mismas huellas que el módulo, pero desde disco: así la deduplicación de fotos
// (13 nombres, un fichero) se compara en igualdad de condiciones.
const huellas = {};
const urls = Object.values(contenido).map(v => v && (v.imagen || (Array.isArray(v.imagenes) && v.imagenes[0]))).filter(Boolean);
for (const u of urls) {
  if (/^(https?:)?\/\//i.test(u) || String(u).startsWith('data:')) continue;
  const base = String(u).split('/').pop().split('?')[0];
  const f = path.join(STORAGE, 'contenido', 'imagenes', base);
  try { huellas[base] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); } catch { /* imagen remota o ausente */ }
}

const telefono = (marca && marca.negocio && marca.negocio.local && marca.negocio.local.telefono) || null;

const { salida, informe } = construir({
  cableado, proyectar: proyectarCartaPublica, hoy: hoyEn(servicio && servicio.zona_horaria),
  datos: {
    carta_id, carta, tarifas, marca, contenido, servicio,
    porciones, promos, huellas,
    whatsapp_url: telefono ? `https://wa.me/${normalizarTelefono(telefono)}` : null
  }
});

console.log(`\nconstruido: carta ${carta_id} v${salida.sello.carta.version} · ${salida.sello.hoy} · ${salida.piezas.length} piezas · huella ${salida.sello.huella}`);
for (const i of informe) console.log(`  ${i.estado === 'ok' ? '·' : '!'} ${String(i.bloque).padEnd(18)} zona ${i.zona}  ${String(i.n).padStart(3)}  ${i.estado}${i.requiere ? '  (' + i.requiere + ')' : ''}`);

const publicado = leerJSON(PUBLICADO);
if (!publicado) {
  console.log(`\n(sin publicado en ${PUBLICADO}: solo se muestra lo construido)`);
  process.exit(0);
}

// ── comparación pieza a pieza (id, forma, precio, zona, imagen, título)
const firma = (p) => [p.id, p.forma, p.zona || '-', p.precio || '-', p.titulo || '-', p.imagen ? 'img' : 'sin'].join('|');
const A = salida.piezas.map(firma);
const B = (publicado.piezas || []).map(firma);

const soloA = A.filter(x => !B.includes(x));
const soloB = B.filter(x => !A.includes(x));

console.log(`\npublicado: ${B.length} piezas · construido: ${A.length} piezas`);
console.log(`  carta publicada : ${JSON.stringify(publicado.sello && publicado.sello.carta)}`);
console.log(`  carta construida: ${JSON.stringify(salida.sello.carta)}`);

if (!soloA.length && !soloB.length) {
  console.log('\nOK — las piezas son idénticas a las que sirve la calle.');
  process.exit(0);
}
if (soloA.length) { console.log('\nSOLO en lo construido:'); for (const x of soloA) console.log('  + ' + x); }
if (soloB.length) { console.log('\nSOLO en lo publicado:'); for (const x of soloB) console.log('  - ' + x); }
process.exit(1);
