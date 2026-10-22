/**
 * Tests unitarios de las PLANTILLAS POR PROVEEDOR de contabilidad-entrada/clasificador-documento.
 *
 * Qué se comprueba y por qué:
 *   · el esquema GENÉRICO (regexes de ticket lineal) NO sirve para una factura maquetada a
 *     columnas: se mide aquí mismo, sobre las fixtures, que captura el NIF del CLIENTE y
 *     deja fecha/base/total en null. Ese es el fallo real que las plantillas arreglan;
 *   · con la plantilla del proveedor, `clasificador-documento` devuelve `origen_esquema` y
 *     los VALORES exactos se extraen con la MISMA función que usa el extractor
 *     (`extraccion-dato._extraer`, valor = grupo 1): no se valida el patrón, se valida el DATO;
 *   · la plantilla se detecta por REMITENTE (lo que deja el canal Gmail) y también solo por
 *     señales del TEXTO (por si el remitente no llega);
 *   · `_juzgar` cierra la propuesta (faltantes vacío, propuesta true): la cadena avanza;
 *   · sin plantilla que case, todo sigue como antes: `origen_esquema:'generico'` y el
 *     esquema de siempre (no se rompe nada de lo que ya funcionaba).
 *
 * Las fixtures están ANONIMIZADAS (cliente, direcciones, teléfonos y NIF del cliente son
 * ficticios) pero conservan la MAQUETACIÓN real: mismas etiquetas, mismas columnas y los
 * mismos huecos de 40+ espacios. Así los patrones se prueban de verdad contra el layout.
 *
 * Sin core, sin MQTT, sin LLM: bus de mentira.
 * Ejecutar: node tests/unit/entrada__plantillas-documento.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ClasificadorDocumento = require('../../modules/contabilidad-entrada/clasificador-documento');
const ExtraccionDato = require('../../modules/contabilidad-entrada/extraccion-dato');

const PROYECTO = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';
const DIR_FIXTURES = path.join(__dirname, '..', 'fixtures', 'entrada');
const DIR_PLANTILLAS = path.join(__dirname, '..', '..', 'modules', 'contabilidad-entrada', 'clasificador-documento', 'plantillas');

let fallos = 0;
async function test(descripcion, fn) {
  try {
    await fn();
    console.log(`✓ ${descripcion}`);
  } catch (error) {
    fallos++;
    console.error(`✗ ${descripcion}\n  ${error.message}`);
  }
}

// ── Montaje: módulo sin core + bus de mentira que solo apunta lo publicado ────────────
function montar() {
  const mod = new ClasificadorDocumento();
  const publicados = [];
  mod.eventBus = {
    publish: (ev, data) => publicados.push({ ev, data }),
    subscribe: () => () => {}
  };
  mod.logger = { info() {}, warn() {}, error() {}, debug() {} };
  const eventos = (ev) => publicados.filter((p) => p.ev === ev);
  return { mod, publicados, eventos };
}

const fixture = (nombre) => fs.readFileSync(path.join(DIR_FIXTURES, nombre), 'utf8');

// Extrae TODOS los campos de un esquema con la función REAL del extractor.
function extraerTodo(esquema, texto) {
  const extra = new ExtraccionDato();
  const salida = {};
  for (const campo of Object.keys(esquema)) salida[campo] = extra._extraer({ texto }, esquema[campo]);
  return salida;
}

// ── Los VALORES que debe sacar cada fixture (los mismos que la factura real) ──────────
const ESPERADO_OBRADOR = {
  nif: 'B73069916', // el EMISOR (cabecera `N.I.F:`), NO el NIF del bloque CLIENTE
  fecha: '16/10/2026',
  numero: '2612184',
  base: '70,20',
  iva_pct: '4',
  iva_importe: '2,81',
  total: '73,01'
};

const ESPERADO_IONOS = {
  nif: 'B-85049435', // con GUION: el genérico no lo esperaba así
  proveedor: 'IONOS Cloud S.L.U.',
  fecha: '13/10/26',
  numero: '311101212664',
  base: '3,00',
  iva_pct: '21',
  iva_importe: '0,63',
  total: '3,63'
};

(async () => {
  console.log('\n🧪 Running plantillas-por-proveedor Tests\n');

  // ── 1. El FALLO medido: el esquema genérico no lee estas facturas ────────────────
  await test('esquema genérico (ticket lineal) FALLA en las facturas a columnas: fallo reproducido', async () => {
    const { mod } = montar();
    const generico = mod._esquema('factura');

    const obrador = extraerTodo(generico, fixture('factura-obrador.txt'));
    assert.strictEqual(obrador.nif, 'B12345674', 'el genérico coge el NIF del CLIENTE (el del emisor va en `N.I.F:` sin punto final)');
    assert.strictEqual(obrador.fecha, null, 'la fecha está en la línea siguiente a la cabecera');
    assert.strictEqual(obrador.base, null, 'la base está debajo de su etiqueta, en otra línea');
    assert.strictEqual(obrador.total, null, 'el total está dos líneas más abajo, junto a `Euros`');

    const ionos = extraerTodo(generico, fixture('factura-ionos.txt'));
    assert.strictEqual(ionos.numero, '85049435', 'el genérico confunde el nº de factura con el NIF sin guion');
    assert.strictEqual(ionos.base, null);
    assert.strictEqual(ionos.total, null);
  });

  // ── 2. Plantilla del OBRADOR detectada por REMITENTE (lo que deja el canal Gmail) ─
  await test('obrador: plantilla por remitente → valores exactos con extraccion-dato._extraer', async () => {
    const { mod, eventos } = montar();
    const texto = fixture('factura-obrador.txt');
    const res = await mod.onClasificarRequest({
      data: {
        project_id: PROYECTO,
        texto,
        documento: { path: 'inbox/email-1-factura.pdf', remitente: 'Facturas <facturas@especialidadesdelobrador.es>' },
        source_kind: 'email',
        correlation_id: 'c-obrador'
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.clase, 'factura');
    assert.strictEqual(res.data.origen_esquema, 'plantilla:obrador');
    assert.strictEqual(res.data.confianza, 1, 'identificación determinista por proveedor declarado');
    assert.ok(res.data.motivos.includes('plantilla:obrador (dominio:especialidadesdelobrador.es)'), `motivos: ${JSON.stringify(res.data.motivos)}`);
    assert.strictEqual(res.data.abierto.tipo, null);

    const extraido = extraerTodo(res.data.esquema, texto);
    for (const campo of Object.keys(ESPERADO_OBRADOR)) {
      assert.strictEqual(extraido[campo], ESPERADO_OBRADOR[campo], `${campo}: esperado ${ESPERADO_OBRADOR[campo]}, llegó ${extraido[campo]}`);
    }
    // El NIF del bloque CLIENTE (ficticio) NO puede colarse como emisor.
    assert.notStrictEqual(extraido.nif, 'B12345674');

    // Obligatorios ⊆ campos declarados, y el hecho de dominio dice de dónde salió la ley.
    for (const campo of res.data.obligatorios) assert.ok(campo in res.data.esquema, `${campo} obligatorio sin patrón`);
    const hechos = eventos('contabilidad.documento_clasificado');
    assert.strictEqual(hechos.length, 1);
    assert.strictEqual(hechos[0].data.origen_esquema, 'plantilla:obrador');
    assert.strictEqual(hechos[0].data.documento.remitente, 'Facturas <facturas@especialidadesdelobrador.es>');
  });

  // ── 3. La misma plantilla detectada SOLO por el TEXTO (sin remitente) ────────────
  await test('obrador: sin remitente, la plantilla entra por la señal de texto (cabecera FECHA/FACTURA/HOJA)', async () => {
    const { mod } = montar();
    const texto = fixture('factura-obrador.txt');
    const res = mod._clasificar({ project_id: PROYECTO, texto, documento: { path: 'inbox/x.pdf' } });

    assert.strictEqual(res.data.clase, 'factura');
    assert.strictEqual(res.data.origen_esquema, 'plantilla:obrador');
    assert.ok(res.data.motivos.some((m) => m.startsWith('plantilla:obrador (texto:')), `motivos: ${JSON.stringify(res.data.motivos)}`);

    const extraido = extraerTodo(res.data.esquema, texto);
    assert.strictEqual(extraido.fecha, '16/10/2026');
    assert.strictEqual(extraido.numero, '2612184');
    assert.strictEqual(extraido.total, '73,01');
  });

  // ── 4. Plantilla de IONOS por REMITENTE: NIF con guion e importes `EUR` ──────────
  await test('ionos: NIF con guion e importes con sufijo EUR → valores exactos', async () => {
    const { mod } = montar();
    const texto = fixture('factura-ionos.txt');
    const res = await mod.onClasificarRequest({
      data: {
        project_id: PROYECTO,
        texto,
        documento: { path: 'inbox/email-2-ionos.pdf', remitente: 'facturas@ionos.es' },
        source_kind: 'email',
        correlation_id: 'c-ionos'
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.clase, 'factura');
    assert.strictEqual(res.data.origen_esquema, 'plantilla:ionos');
    assert.ok(res.data.motivos.includes('plantilla:ionos (dominio:ionos.es)'), `motivos: ${JSON.stringify(res.data.motivos)}`);

    const extraido = extraerTodo(res.data.esquema, texto);
    for (const campo of Object.keys(ESPERADO_IONOS)) {
      assert.strictEqual(extraido[campo], ESPERADO_IONOS[campo], `${campo}: esperado ${ESPERADO_IONOS[campo]}, llegó ${extraido[campo]}`);
    }
    // El NIF del receptor (`Número de IVA: ESB12345674`) no puede confundirse con el emisor.
    assert.notStrictEqual(extraido.nif, 'ESB12345674');
  });

  // ── 5. IONOS sin remitente: la marca en el texto basta ───────────────────────────
  await test('ionos: sin remitente entra por la señal `IONOS Cloud` del texto', async () => {
    const { mod } = montar();
    const texto = fixture('factura-ionos.txt');
    const res = mod._clasificar({ project_id: PROYECTO, texto });
    assert.strictEqual(res.data.origen_esquema, 'plantilla:ionos');
    assert.strictEqual(extraerTodo(res.data.esquema, texto).total, '3,63');
  });

  // ── 6. De punta a punta con el extractor: la propuesta se CIERRA ─────────────────
  await test('extraccion-dato cierra la propuesta con el esquema de la plantilla (0 faltantes)', async () => {
    const extra = new ExtraccionDato();
    for (const [nombre, remitente, esperado] of [
      ['factura-obrador.txt', 'facturas@especialidadesdelobrador.es', ESPERADO_OBRADOR],
      ['factura-ionos.txt', 'facturas@ionos.es', ESPERADO_IONOS]
    ]) {
      const texto = fixture(nombre);
      const { mod } = montar();
      const res = mod._clasificar({ project_id: PROYECTO, texto, documento: { remitente } });
      const juzgado = extra._juzgar({
        project_id: PROYECTO,
        documento: { texto },
        esquema: res.data.esquema,
        obligatorios: res.data.obligatorios,
        clase: res.data.clase
      });
      assert.strictEqual(juzgado.status, 200);
      assert.deepStrictEqual(juzgado.data.faltantes, [], `${nombre}: faltantes ${JSON.stringify(juzgado.data.faltantes)}`);
      assert.strictEqual(juzgado.data.propuesta, true, `${nombre}: la propuesta debe cerrarse (no se encola)`);
      assert.strictEqual(juzgado.data.clase, 'factura');
      for (const campo of Object.keys(esperado)) {
        assert.strictEqual(juzgado.data.extraido[campo], esperado[campo], `${nombre} · ${campo}`);
      }
      assert.deepStrictEqual(juzgado.data.faltantes, [], `${nombre}: el extractor no dejó nada sin leer`);
    }
  });

  // ── 7. Sin plantilla: nada cambia (compatibilidad hacia atrás) ───────────────────
  await test('texto sin proveedor declarado → origen_esquema genérico y esquema de siempre', async () => {
    const { mod, eventos } = montar();
    const texto = ['PANADERIA EL HORNO S.L.', 'CIF: B12345678', 'FACTURA', 'BASE IMPONIBLE 63,60', 'IVA 10% 6,36', 'TOTAL 69,96'].join('\n');
    const res = await mod.onClasificarRequest({ data: { project_id: PROYECTO, texto } });
    assert.strictEqual(res.data.clase, 'factura');
    assert.strictEqual(res.data.origen_esquema, 'generico');
    assert.strictEqual(res.data.confianza, 0.83, 'min(1, 5/6) — la fórmula no cambia');
    assert.deepStrictEqual(Object.keys(res.data.esquema).sort(), ['base', 'fecha', 'iva_importe', 'iva_pct', 'nif', 'numero', 'proveedor', 'total']);
    assert.strictEqual(extraerTodo(res.data.esquema, texto).total, '69,96');
    // Y el encadenado lleva la plantilla/esquema tal cual, para que el extractor no adivine.
    const cadena = eventos('extraccion-dato.juzgar.request');
    assert.strictEqual(cadena.length, 1);
    assert.deepStrictEqual(cadena[0].data.esquema, res.data.esquema);
    assert.deepStrictEqual(cadena[0].data.obligatorios, ['nif', 'fecha', 'total']);
  });

  // ── 8. Las plantillas son DATO: todas válidas, compilables y con clase ───────────
  await test('plantillas/*.json: forma válida, regex compilables y obligatorios ⊆ campos', async () => {
    const ficheros = fs.readdirSync(DIR_PLANTILLAS).filter((f) => f.endsWith('.json')).sort();
    assert.ok(ficheros.length >= 2, `se esperaban al menos 2 plantillas, hay ${ficheros.length}`);
    const ids = [];
    for (const fichero of ficheros) {
      const p = JSON.parse(fs.readFileSync(path.join(DIR_PLANTILLAS, fichero), 'utf8'));
      assert.strictEqual(typeof p.id, 'string', `${fichero}: falta id`);
      assert.ok(p.id.length > 0, `${fichero}: id vacío`);
      assert.strictEqual(`${p.id}.json`, fichero, `${fichero}: el nombre del fichero debe ser <id>.json`);
      assert.strictEqual(p.clase, 'factura', `${fichero}: clase declarada`);
      assert.ok(p.detectar && (p.detectar.dominio || p.detectar.texto), `${fichero}: sin señales de detección`);
      assert.ok(Object.keys(p.campos).length > 0, `${fichero}: sin campos`);
      for (const campo of Object.keys(p.campos)) {
        const regla = p.campos[campo];
        assert.strictEqual(typeof regla.regex, 'string', `${fichero}.${campo}: regex debe ser string`);
        assert.ok(new RegExp(regla.regex, regla.flags || 'i'), `${fichero}.${campo}: regex no compila`);
        // El extractor toma el GRUPO 1: el patrón tiene que declararlo.
        assert.ok(regla.regex.includes('('), `${fichero}.${campo}: sin grupo de captura`);
      }
      for (const campo of p.obligatorios || []) {
        assert.ok(campo in p.campos, `${fichero}: obligatorio ${campo} sin patrón`);
      }
      ids.push(p.id);
    }
    assert.deepStrictEqual(ids, ['ionos', 'obrador'], `plantillas cargadas: ${ids.join(', ')}`);
  });

  // ── 9. Fixtures: son anonimizadas pero conservan el layout (columnas de verdad) ──
  await test('fixtures anonimizadas: sin datos del cliente real y con huecos de columna', async () => {
    const obrador = fixture('factura-obrador.txt');
    const ionos = fixture('factura-ionos.txt');
    // Datos personales reales FUERA.
    for (const real of ['SABOR EN CLAVE DE SOL', 'PIZZERIA NONINA', 'F24747164', 'FRANCISCO SANCHEZ', 'Narciso Yepes', '684062224', '968641384', 'ESF24747164']) {
      assert.ok(!obrador.toUpperCase().includes(real.toUpperCase()), `obrador: sigue apareciendo ${real}`);
      assert.ok(!ionos.toUpperCase().includes(real.toUpperCase()), `ionos: sigue apareciendo ${real}`);
    }
    // …y el layout de columnas intacto: el valor de los totales cae lejísimos de su etiqueta.
    const lineaBase = obrador.split('\n').find((l) => l.includes('BASE IMPONIBLE') && l.includes('IVA:'));
    assert.ok(lineaBase.length > 40, 'la línea de totales debe conservar las columnas');
    const lineaImporte = ionos.split('\n').find((l) => /Total \(base imponible\)/.test(l));
    assert.ok(/Total \(base imponible\)\s{20,}3,00 EUR/.test(lineaImporte), 'la base debe seguir a 20+ espacios de su etiqueta');
  });

  if (fallos) {
    console.error(`\n❌ ${fallos} test(s) fallaron`);
    process.exitCode = 1;
    return;
  }
  console.log('\n✅ Todos los tests de plantillas-por-proveedor pasaron');
})();
