#!/usr/bin/env node
'use strict';
/**
 * Verifica el template embebido de la carta digital.
 *
 * El template es un template-literal gigante: editar el JS de dentro puede romper el
 * fichero sin que se note (una comilla invertida en un comentario cierra el literal).
 * Esta sonda renderiza el HTML con una config real, extrae el JS inline y lo COMPILA.
 *
 *   node scripts/check-carta-inline.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const { generateStaticHTML } = require(
  path.join(__dirname, '..', 'modules', 'pizzepos', 'carta-digital', 'static-template.js')
);

const carta = {
  nombre_negocio: 'Rapitvapers',
  productos: [
    { id: 'elfbar600-watermelon', nombre: 'Elf Bar 600 Watermelon', precio: 5.95, categoria: 'elfbar' },
    { id: 'elfbar600-blueberry-sour-raspberry', nombre: 'Elf Bar 600 Blueberry Sour Raspberry', precio: 5.95, categoria: 'elfbar' }
  ]
};
const config = {
  nombre_negocio: 'Rapitvapers',
  project_slug: 'rapitvapers',
  telegram_bot: 'Rapitvapers_bot',
  pedido_endpoint: '/tienda/pedido/rapitvapers',
  pago_online: false,
  whatsapp_telefono: '',
  moneda: '€'
};

const html = generateStaticHTML(carta, config, {});
fs.mkdirSync('/tmp/carta-check', { recursive: true });
fs.writeFileSync('/tmp/carta-check/index.html', html);

const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!bloques.length) {
  console.error('FALLO: el HTML no trae JS inline');
  process.exit(1);
}
const js = bloques.join('\n;\n');
fs.writeFileSync('/tmp/carta-check/inline.js', js);

try {
  new vm.Script(js, { filename: 'carta-inline.js' });
} catch (e) {
  console.error('FALLO · el JS inline NO compila: ' + e.message);
  process.exit(1);
}
console.log(`OK · JS inline compila (${bloques.length} bloques, ${js.length} bytes)`);

const requeridas = [
  'function _hayBandejaCompartir',
  'function _compartirPedidoTelegram',
  'function pedirTelegram',
  'function buildOrderMsg',
  'function buildP1Line'
];
for (const r of requeridas) {
  if (!js.includes(r)) {
    console.error('FALLO: falta «' + r + '»');
    process.exit(1);
  }
}

// La bandeja tiene que ir ANTES del borrador dentro de pedirTelegram.
const posBandeja = js.indexOf('_hayBandejaCompartir()) { return _compartirPedidoTelegram');
const posBorrador = js.indexOf("var urlBorrador = CONFIG.telegram_borrador");
if (posBandeja < 0 || posBorrador < 0 || posBandeja > posBorrador) {
  console.error('FALLO: el camino de la bandeja no está delante del borrador');
  process.exit(1);
}

// El botón Telegram sigue pintándose con telegram_bot configurado.
if (!/id="btn-telegram"/.test(html)) {
  console.error('FALLO: no se pinta el botón Telegram');
  process.exit(1);
}

console.log('OK · botón Telegram presente · bandeja antes que borrador · HTML en /tmp/carta-check/index.html');
