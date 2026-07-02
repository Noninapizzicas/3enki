#!/usr/bin/env node
'use strict';
/**
 * deployment__reconcile.test.js — Tests del NÚCLEO PURO del reconciliador VPS.
 *
 * Solo la lógica sin efectos (detección de dominio, Gen-1, render de plantillas,
 * comparación, checklist). La capa de efectos (systemctl, escribir /etc) no se
 * testea aquí — vive tras `require.main === module` y se prueba en un VPS real
 * con `--dry-run`.
 */

const assert = require('assert');
const {
  detectarDominio,
  esGen1,
  renderPlantilla,
  renderBloqueNamespace,
  renderCaddyfile,
  difieren,
  evaluarChecklist,
  MARCA_NAMESPACE
} = require('../../deployment/reconcile.js');
const { MANIFIESTO } = require('../../deployment/vps.manifest.js');
const { publicNs } = require('../../lib/public-ns.js');

let pass = 0, fail = 0;
function test(nombre, fn) {
  try { fn(); console.log(`  ✓ ${nombre}`); pass++; }
  catch (e) { console.log(`  ✗ ${nombre}\n      ${e.message}`); fail++; }
}

console.log('=== deployment__reconcile (núcleo puro) ===\n');

// ---- detectarDominio ----
test('dominio explícito gana sobre todo', () => {
  assert.strictEqual(
    detectarDominio('mi-vps.com', 'otro.es {\n}', 'DOMAIN=tercero.net'),
    'mi-vps.com');
});
test('sin explícito, detecta del primer bloque del Caddyfile vivo', () => {
  const caddy = '# comentario\npizzepos.es {\n\thandle /health {\n\t}\n}\n';
  assert.strictEqual(detectarDominio(null, caddy, null), 'pizzepos.es');
});
test('ignora el bloque :80 del modo IP y cae al .env', () => {
  const caddy = ':80 {\n\thandle {\n\t}\n}\n';
  assert.strictEqual(detectarDominio(null, caddy, 'DOMAIN=enki-ai.online'), 'enki-ai.online');
});
test('lee DOMAIN del .env con comillas', () => {
  assert.strictEqual(detectarDominio(null, null, 'FOO=1\nDOMAIN="pizzepos.es"\n'), 'pizzepos.es');
});
test('null si no hay ninguna fuente', () => {
  assert.strictEqual(detectarDominio(null, null, null), null);
});

// ---- esGen1 ----
test('Gen-1 si existe el dir viejo', () => {
  assert.strictEqual(esGen1({ existeDirGen1: true, existeUnitGen1: false }), true);
});
test('Gen-1 si existe la unidad vieja', () => {
  assert.strictEqual(esGen1({ existeDirGen1: false, existeUnitGen1: true }), true);
});
test('NO Gen-1 si no existe nada viejo (canónico)', () => {
  assert.strictEqual(esGen1({ existeDirGen1: false, existeUnitGen1: false }), false);
});

// ---- renderPlantilla ----
test('sustituye {{VAR}} por su valor', () => {
  assert.strictEqual(renderPlantilla('a {{X}} b {{Y}}', { X: '1', Y: '2' }), 'a 1 b 2');
});
test('deja {{VAR}} intacta si no hay valor', () => {
  assert.strictEqual(renderPlantilla('a {{X}} b', {}), 'a {{X}} b');
});
test('render de ORIGIN del enki-frontend: {{DOMAIN}} anidado', () => {
  const tmpl = leerPlantillaFrontend();
  const origin = renderPlantilla('https://{{DOMAIN}}', { DOMAIN: 'enki-ai.online' });
  const out = renderPlantilla(tmpl, { ORIGIN: origin });
  assert.ok(out.includes('Environment=ORIGIN=https://enki-ai.online'), 'ORIGIN renderizado');
  assert.ok(!out.includes('{{'), 'sin placeholders sin sustituir');
});

// ---- renderCaddyfile ----
test('sustituye el dominio placeholder y su .log', () => {
  const tmpl = 'pizzepos.es {\n\tlog {\n\t\toutput file /var/log/caddy/pizzepos.log\n\t}\n}\n';
  const out = renderCaddyfile(tmpl, 'enki-ai.online', MANIFIESTO.caddy);
  assert.ok(out.includes('enki-ai.online {'), 'dominio sustituido');
  assert.ok(out.includes('enki-ai.online.log'), 'log sustituido');
  assert.ok(!out.includes('pizzepos'), 'no queda rastro del placeholder');
});
test('el Caddyfile renderizado trae /<ns>/* (generado) y /tienda/* (estático)', () => {
  const fs = require('fs');
  const tmpl = fs.readFileSync(MANIFIESTO.caddy.plantilla, 'utf-8');
  const out = renderCaddyfile(tmpl, 'x.com', MANIFIESTO.caddy, 'a', '/opt/enki/public/a');
  assert.ok(out.includes('handle_path /a/*'), '/a/* generado desde public_ns');
  assert.ok(out.includes('handle /tienda/*'), '/tienda/* (backend pedidos) sigue estático');
});

// ---- difieren ----
test('iguales salvo espacios finales → no difieren', () => {
  assert.strictEqual(difieren('abc\n', 'abc'), false);
});
test('contenido distinto → difieren', () => {
  assert.strictEqual(difieren('abc', 'abd'), true);
});
test('null vs vacío → no difieren', () => {
  assert.strictEqual(difieren(null, ''), false);
});

// ---- evaluarChecklist ----
test('checklist OK cuando todo está presente', () => {
  const sondas = {
    caddyfileText: 'handle_path /a/*\nhandle /tienda/*\n',
    dirsEscribibles: { [MANIFIESTO.public_dir]: true },
    serviciosActivos: { enki: true, 'enki-frontend': true, caddy: true },
    healthOk: true
  };
  const v = evaluarChecklist(sondas, MANIFIESTO);
  assert.strictEqual(v.ok, true, 'ok');
  assert.strictEqual(v.fallos.length, 0);
});
test('checklist detecta el drift clásico: falta el bloque del namespace', () => {
  const sondas = {
    caddyfileText: 'handle /tienda/*\n',   // sin /a/*
    dirsEscribibles: { [MANIFIESTO.public_dir]: true },
    serviciosActivos: { enki: true, 'enki-frontend': true, caddy: true },
    healthOk: true
  };
  const v = evaluarChecklist(sondas, MANIFIESTO);
  assert.strictEqual(v.ok, false, 'detecta el fallo');
  assert.ok(v.fallos.some((f) => f.includes('/a/*')), 'nombra el bloque del namespace');
});
test('checklist detecta servicio caído', () => {
  const sondas = {
    caddyfileText: 'handle_path /a/*\nhandle /tienda/*\n',
    dirsEscribibles: { [MANIFIESTO.public_dir]: true },
    serviciosActivos: { enki: false, 'enki-frontend': true, caddy: true },
    healthOk: true
  };
  const v = evaluarChecklist(sondas, MANIFIESTO);
  assert.strictEqual(v.ok, false);
  assert.ok(v.fallos.some((f) => f.includes('enki')), 'nombra el servicio caído');
});

// ---- namespace público global ----
test('bloque de namespace: prefijo, root y file_server correctos', () => {
  const b = renderBloqueNamespace('a', '/opt/enki/public/a');
  assert.ok(b.includes('handle_path /a/* {'), 'prefijo /a/');
  assert.ok(b.includes('root * /opt/enki/public/a'), 'root al dir del namespace');
  assert.ok(b.includes('file_server'), 'file_server');
});
test('el prefijo es configurable: cambiar el ns cambia el bloque (/es/)', () => {
  const b = renderBloqueNamespace('es', '/opt/enki/public/es');
  assert.ok(b.includes('handle_path /es/* {'), 'un solo botón → /es/');
  assert.ok(!b.includes('/a/'), 'sin rastro del valor anterior');
});
test('el Caddyfile real trae el marcador @@NAMESPACE@@', () => {
  const fs = require('fs');
  const tmpl = fs.readFileSync(MANIFIESTO.caddy.plantilla, 'utf-8');
  assert.ok(tmpl.includes(MARCA_NAMESPACE), 'la plantilla tiene el marcador');
});
test('renderCaddyfile inyecta el bloque único en el marcador (dominio + ns)', () => {
  const fs = require('fs');
  const tmpl = fs.readFileSync(MANIFIESTO.caddy.plantilla, 'utf-8');
  const out = renderCaddyfile(tmpl, 'enki-ai.online', MANIFIESTO.caddy, 'a', '/opt/enki/public/a');
  assert.ok(!out.includes(MARCA_NAMESPACE), 'el marcador se consumió');
  assert.ok(out.includes('handle_path /a/* {'), 'bloque del namespace inyectado');
  assert.ok(out.includes('enki-ai.online {'), 'dominio sustituido');
  assert.ok(!out.includes('pizzepos'), 'sin rastro del placeholder');
});
test('el manifiesto deriva public_ns del botón único (config.json)', () => {
  assert.strictEqual(MANIFIESTO.public_ns, publicNs(), 'manifiesto usa el mismo ns');
  assert.strictEqual(MANIFIESTO.public_dir, `/opt/enki/public/${publicNs()}`, 'public_dir derivado');
});

function leerPlantillaFrontend() {
  const fs = require('fs');
  return fs.readFileSync(MANIFIESTO.servicios['enki-frontend'].plantilla, 'utf-8');
}

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
