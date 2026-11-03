'use strict';

/**
 * bocaos · CONTRATO DE LAS ISLAS — el manifest, los handlers y los hechos que de verdad salen.
 *
 * Este test es el `grep` que la arquitectura dice que se puede hacer (§1.2): la unidad y el
 * contrato no dependen de que alguien se acuerde.
 *
 *   1. cada `module.json` tiene name · version · description · unidad, y su name ES su carpeta.
 *   2. cada handler declarado en `subscribes` EXISTE en la clase (el loader, si no, avisa y sigue:
 *      un evento que nadie atiende se pierde en silencio).
 *   3. cada evento declarado en `publishes` se emite de verdad en `index.js` — y al revés: lo que
 *      se emite está declarado. Sin esto, `publishes` es decoración.
 *   4. los tópicos son ASCII, minúsculas, con puntos/guiones/barras bajas.
 *   5. NINGUNA isla hace `require` de otra isla: sólo de la base común y de node. Es la regla
 *      del dueño, comprobada con un grep en vez de con una promesa.
 *
 * Ejecutar: node tests/unit/bocaos__contratos-manifiesto.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const RAIZ = path.join(__dirname, '../../modules/bocaos');
const MODULOS = fs.readdirSync(RAIZ)
  .filter((d) => fs.existsSync(path.join(RAIZ, d, 'module.json')));

const TOPICO = /^[a-z0-9._-]+$/;

function leer(dir) {
  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, dir, 'module.json'), 'utf8'));
  const src = fs.readFileSync(path.join(RAIZ, dir, 'index.js'), 'utf8');
  return { man, src };
}

test('hay al menos las islas del corazón (v3: el pedido del mercado, no el de la tienda)', () => {
  // tienda-captura y tienda-hora-listo se RETIRARON: duplicaban tienda-api + pedidos y
  // cocina.mark-ready. El pedido se llama pedido-mercado y se cuelga del pedido.creado de pizzepos.
  for (const esperado of ['pedido-mercado', 'hecho-listo', 'foto-mercado',
                          'enlace', 'propuesta', 'contrato-puntual', 'hechos-reparto']) {
    assert.ok(MODULOS.includes(esperado), `falta modules/bocaos/${esperado}`);
  }
  for (const retirado of ['tienda-captura', 'tienda-hora-listo', 'pedido']) {
    assert.ok(!MODULOS.includes(retirado), `modules/bocaos/${retirado} debería estar retirado (duplicaba pizzepos)`);
  }
});

test('las ocho islas del peldaño 4 están', () => {
  for (const esperado of ['contrato-tramos', 'frontera-plaza', 'indice-plaza', 'pedido-mercado',
                          'aviso-cliente', 'aviso-tienda', 'instrucciones-acceso', 'tarifa-pedido']) {
    assert.ok(MODULOS.includes(esperado), `falta modules/bocaos/${esperado}`);
  }
});

test('hay al menos las tres islas del peldaño 2', () => {
  for (const esperado of ['canal-rider', 'redaccion-propuesta', 'escalada-enlace']) {
    assert.ok(MODULOS.includes(esperado), `falta modules/bocaos/${esperado}`);
  }
});

test('las tres islas del acta, el censo y los términos están, con su manifest y su store', () => {
  for (const esperado of ['acta-decisiones', 'censo-parte', 'terminos-parte']) {
    assert.ok(MODULOS.includes(esperado), `falta modules/bocaos/${esperado}`);
  }
});

test('cada manifest: name = carpeta, version semver, description y unidad', () => {
  for (const dir of MODULOS) {
    const { man } = leer(dir);
    assert.strictEqual(man.name, dir, `${dir}: el name tiene que ser la carpeta`);
    assert.ok(/^\d+\.\d+\.\d+$/.test(man.version), `${dir}: version semver`);
    assert.ok(typeof man.description === 'string' && man.description.length > 20, `${dir}: description obligatoria (el loader la exige)`);
    assert.ok(['plaza', 'tienda', 'nacional'].includes(man.unidad), `${dir}: unidad declarada`);
  }
});

test('cada handler de subscribes existe en la clase', () => {
  for (const dir of MODULOS) {
    const { man } = leer(dir);
    const Clase = require(path.join(RAIZ, dir, 'index.js'));
    for (const sub of man.subscribes || []) {
      assert.ok(sub.event && sub.handler && sub.description, `${dir}: subscribe incompleto ${JSON.stringify(sub)}`);
      assert.strictEqual(typeof Clase.prototype[sub.handler], 'function', `${dir}: el handler ${sub.handler} no existe`);
    }
  }
});

test('publishes ⇄ lo que index.js emite de verdad (en los dos sentidos)', () => {
  for (const dir of MODULOS) {
    const { man, src } = leer(dir);
    const declarados = new Set((man.publishes || []).map((p) => p.event));
    for (const p of man.publishes || []) assert.ok(p.description, `${dir}: ${p.event} sin description`);

    const emitidos = new Set();
    for (const m of src.matchAll(/this\.hecho\('([^']+)'/g)) emitidos.add(m[1]);
    // Un puente no "hace" un hecho del dominio: PIDE al transporte y lo publica. Se cuenta igual,
    // porque si no `publishes` diría que el módulo no llama a nadie y sería decoración.
    for (const m of src.matchAll(/this\.eventBus\.publish\('([^']+)'/g)) emitidos.add(m[1]);
    for (const m of src.matchAll(/servir\(e,\s*'[^']+',\s*'([^']+)'/g)) {
      emitidos.add(m[1] + '.response');
      emitidos.add(m[1] + '.failed');
    }

    for (const ev of declarados) {
      assert.ok(emitidos.has(ev), `${dir}: declara ${ev} pero no lo emite`);
    }
    for (const ev of emitidos) {
      assert.ok(declarados.has(ev), `${dir}: emite ${ev} y no lo declara en publishes`);
    }
  }
});

test('tópicos ASCII, minúsculas, guiones', () => {
  for (const dir of MODULOS) {
    const { man } = leer(dir);
    for (const ev of [...(man.subscribes || []).map((s) => s.event), ...(man.publishes || []).map((p) => p.event)]) {
      assert.ok(TOPICO.test(ev), `${dir}: tópico inválido «${ev}»`);
      assert.ok(!/[A-ZÁÉÍÓÚÑ]/.test(ev), `${dir}: tópico con mayúsculas «${ev}»`);
    }
  }
});

test('ninguna isla hace require de otra isla: sólo de la base y de node', () => {
  for (const dir of MODULOS) {
    const { src } = leer(dir);
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    for (const r of requires) {
      if (!r.startsWith('.')) continue;   // node builtins (crypto) sí
      assert.strictEqual(r, '../_bocaos', `${dir}: require «${r}» — un módulo no llama a otro, le pide al bus`);
    }
  }
});

test('la base común requiere _shared y resuelve', () => {
  const base = require(path.join(RAIZ, '_bocaos.js'));
  assert.strictEqual(typeof base, 'function');
  const ModuloHibridoReflejo = require(path.join(RAIZ, '../_shared/modulo-hibrido-reflejo.js'));
  assert.ok(base.prototype instanceof ModuloHibridoReflejo, 'la base extiende _shared/modulo-hibrido-reflejo');
  assert.strictEqual(typeof base.prototype._rpc, 'function', 'hereda el RPC del bus');
});

test('quien escribe estado tiene store propio por proyecto; quien no, no lo finge', () => {
  const conEstado = ['pedido-mercado', 'hecho-listo', 'propuesta', 'contrato-puntual', 'hechos-reparto',
    'escalada-enlace', 'acta-decisiones', 'censo-parte', 'terminos-parte',
    'contrato-tramos', 'instrucciones-acceso', 'tarifa-pedido'];
  const sinEstado = ['foto-mercado', 'enlace', 'canal-rider', 'redaccion-propuesta',
    'frontera-plaza', 'indice-plaza', 'aviso-cliente', 'aviso-tienda'];
  for (const dir of conEstado) {
    const m = new (require(path.join(RAIZ, dir, 'index.js')))();
    assert.ok(/^\/bocaos\/[a-z-]+\.json$/.test(m._path || ''), `${dir}: store propio en /bocaos/`);
  }
  for (const dir of sinEstado) {
    const m = new (require(path.join(RAIZ, dir, 'index.js')))();
    assert.strictEqual(m._path, null, `${dir}: sin estado, sin store (dos verdades serían una vieja)`);
  }
});

(async () => {
  let fallos = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok — ${t.name}`); }
    catch (err) { fallos += 1; console.error(`FALLO — ${t.name}\n  ${err.message}`); }
  }
  console.log(`\n${tests.length - fallos}/${tests.length} tests ok`);
  if (fallos > 0) process.exitCode = 1;
})();
