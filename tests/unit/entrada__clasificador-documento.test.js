/**
 * Tests unitarios para contabilidad-entrada/clasificador-documento (B del contrato).
 *
 * Qué se comprueba y por qué:
 *   · el TIPO se decide con las señales/pesos CONGELADOS (factura / albarán / ticket) y,
 *     sin señal, la clase es `otro` declarada (nunca se inventa el tipo);
 *   · la CONFIANZA sale de la fórmula del contrato, min(1, peso/6), incluido el 0.83 del
 *     ejemplo literal del contrato;
 *   · el ESQUEMA que devuelve es el que CONSUME de verdad extraccion-dato: se extrae con
 *     la MISMA función (`_extraer`, valor = grupo 1) sobre una factura digital maquetada
 *     a columnas (como sale de `pdftotext -layout`) y se comprueba que nif/fecha/total
 *     salen, y que `_juzgar` cierra la propuesta;
 *   · SIEMPRE se encadena a extraccion-dato.juzgar.request — también con `otro`.
 *
 * Sin core, sin MQTT, sin LLM: bus de mentira.
 * Ejecutar: node tests/unit/entrada__clasificador-documento.test.js
 */

'use strict';

const assert = require('assert');
const ClasificadorDocumento = require('../../modules/contabilidad-entrada/clasificador-documento');
const ExtraccionDato = require('../../modules/contabilidad-entrada/extraccion-dato');

const PROYECTO = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';

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

async function clasificar(mod, payload) {
  const res = await mod.onClasificarRequest({ data: payload });
  // La respuesta RPC correlada siempre sale por el bus (una sola cara).
  return res;
}

// ── Fixtures de TEXTO ────────────────────────────────────────────────────────────────
// Ayudante de maquetación: alinea el importe en la columna `col` (lo que hace
// `pdftotext -layout` al respetar la posición real de cada columna del PDF).
const linea = (izq, der, col) => izq + ' '.repeat(Math.max(1, col - izq.length)) + der;

// FACTURA digital completa: cabecera con razón social, CIF y nº, y bloque de totales
// alineado a columnas.
const FACTURA_DIGITAL = [
  'PANADERIA EL HORNO S.L.',
  'CIF: B12345678',
  'C/ Mayor 12, 28001 Madrid',
  '',
  'FACTURA',
  'Nº FACTURA: 2026-004512',
  'FECHA: 21/10/2026',
  '',
  'Descripcion                     Cantidad        Importe',
  linea('2 X BOLSA HARINA 25KG', '42,00', 46),
  '',
  linea('BASE IMPONIBLE', '63,60', 26),
  linea('IVA 10%', '6,36', 22),
  linea('TOTAL A PAGAR', '69,96', 26)
].join('\n');

// Factura mínima: la del EJEMPLO del contrato (factura 3 + base+iva 2 → 5/6 = 0.83).
const FACTURA_MINIMA = [
  'FACTURA',
  'CIF: B12345678',
  'BASE IMPONIBLE 63,60',
  'IVA 10% 6,36',
  'TOTAL 69,96'
].join('\n');

// Albarán valorado: pesa más la palabra «albarán» (3) que el desglose base+IVA
// que arrastra la señal de factura (2) → gana ALBARAN sin desempate.
const ALBARAN = [
  'LACTEOS NORTE S.L.',
  'CIF: B87654321',
  'ALBARAN DE ENTREGA Nº A-2026-118',
  'FECHA: 20/10/2026',
  'Pedido: P-7781',
  '',
  linea('BASE IMPONIBLE', '195,00', 26),
  linea('IVA 10%', '19,50', 22),
  linea('TOTAL', '214,50', 26)
].join('\n');

// Texto REAL que produce el OCR del motor con un ticket de panadería (columnas
// descolocadas: los importes caen en líneas sueltas). Se clasifica por las palabras.
const TICKET_OCR = [
  'PANADERIA EL HORNO S.L.',
  'CIF: B12345678',
  'C/ Mayor 12, 28001 Madrid',
  'TICKET SIMPLIFICADO',
  'N. TICKET: 2026-004512',
  'FECHA: 21/10/2026 17:42',
  '2 X BOLSA HARINA 25KG',
  'BASE IMPONIBLE',
  'IVA 10%',
  'TOTAL',
  '42,00',
  '18.40',
  '3,20',
  '63.60',
  '6.36',
  '69.96',
  'GRACIAS POR SU COMPRA'
].join('\n');

// Ningún papel contable: ni factura, ni albarán, ni ticket, ni NIF → 'otro'.
const OTRO = [
  'ACTA DE REUNION',
  'Se acuerda revisar el inventario trimestral.',
  'Sin incidencias.'
].join('\n');

const CAMPOS_FACTURA = ['nif', 'fecha', 'numero', 'base', 'iva_pct', 'iva_importe', 'total', 'proveedor'];

(async () => {
  console.log('\n🧪 Running clasificador-documento Tests\n');

  // ── 1. Factura digital maquetada: tipo, confianza y esquema que EXTRAE ────────────
  await test('factura digital (pdftotext -layout) → clase factura y esquema completo', async () => {
    const { mod, eventos } = montar();
    const res = await clasificar(mod, { project_id: PROYECTO, texto: FACTURA_DIGITAL, documento: { path: 'inbox/f.pdf' }, source_kind: 'digital', correlation_id: 'c-1' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.tipo, 'clasificador-documento');
    assert.strictEqual(res.data.clase, 'factura');
    assert.strictEqual(res.data.confianza, 1, `confianza: ${res.data.confianza} (7/6 → 1)`);
    assert.deepStrictEqual(Object.keys(res.data.esquema).sort(), CAMPOS_FACTURA.slice().sort());
    assert.deepStrictEqual(res.data.obligatorios, ['nif', 'fecha', 'total']);
    assert.strictEqual(res.data.encadenado_a, 'extraccion-dato');
    assert.strictEqual(res.data.abierto.tipo, null);
    assert.deepStrictEqual(res.data.senales, { factura: 7, albaran: 0, ticket: 0, nif: true });
    // El hecho de dominio se anuncia con la clase y el correlation_id de la cadena.
    const hechos = eventos('contabilidad.documento_clasificado');
    assert.strictEqual(hechos.length, 1);
    assert.strictEqual(hechos[0].data.clase, 'factura');
    assert.strictEqual(hechos[0].data.source_kind, 'digital');
    assert.strictEqual(hechos[0].data.correlation_id, 'c-1');
  });

  // ── 2. El esquema extrae con la MISMA lógica de extraccion-dato (_extraer) ───────
  await test('el esquema extrae nif/fecha/total con extraccion-dato._extraer (grupo 1)', async () => {
    const { mod } = montar();
    const res = await clasificar(mod, { project_id: PROYECTO, texto: FACTURA_DIGITAL });
    const esquema = res.data.esquema;
    const extra = new ExtraccionDato();

    // `_extraer` es la función real del extractor: {regex, flags} → grupo 1.
    const esperado = {
      nif: 'B12345678',
      fecha: '21/10/2026',
      numero: '2026-004512',
      base: '63,60',
      iva_pct: '10',
      iva_importe: '6,36',
      total: '69,96',
      proveedor: 'PANADERIA EL HORNO S.L.'
    };
    for (const campo of CAMPOS_FACTURA) {
      const valor = extra._extraer({ texto: FACTURA_DIGITAL }, esquema[campo]);
      assert.strictEqual(valor, esperado[campo], `${campo}: esperado ${esperado[campo]}, llegó ${valor}`);
    }

    // Y de punta a punta: extraccion-dato cierra la PROPUESTA con ese esquema.
    const juzgado = extra._juzgar({
      project_id: PROYECTO,
      documento: { texto: FACTURA_DIGITAL },
      esquema,
      obligatorios: res.data.obligatorios
    });
    assert.strictEqual(juzgado.status, 200);
    assert.deepStrictEqual(juzgado.data.faltantes, [], `faltantes: ${JSON.stringify(juzgado.data.faltantes)}`);
    assert.strictEqual(juzgado.data.propuesta, true, 'la propuesta debe cerrarse (no se encola)');
    assert.strictEqual(juzgado.data.extraido.total, '69,96');
  });

  // ── 3. Fórmula de confianza del ejemplo LITERAL del contrato (0.83) ──────────────
  await test('ejemplo del contrato: factura 3 + base+iva 2 → confianza 0.83 y motivos', async () => {
    const { mod } = montar();
    const res = await clasificar(mod, { project_id: PROYECTO, texto: FACTURA_MINIMA });
    assert.strictEqual(res.data.clase, 'factura');
    assert.strictEqual(res.data.confianza, 0.83, `confianza: ${res.data.confianza}`);
    assert.deepStrictEqual(res.data.senales, { factura: 5, albaran: 0, ticket: 0, nif: true });
    assert.deepStrictEqual(res.data.motivos, ['factura (3)', 'base+iva (2)', 'nif (1)']);
  });

  // ── 4. Albarán: la palabra manda sobre el desglose base+IVA ──────────────────────
  await test('albarán → clase albaran (3) por encima de la señal base+iva de factura', async () => {
    const { mod } = montar();
    const res = await clasificar(mod, { project_id: PROYECTO, texto: ALBARAN });
    assert.strictEqual(res.data.clase, 'albaran');
    assert.strictEqual(res.data.senales.albaran, 3);
    assert.strictEqual(res.data.senales.factura, 2, 'base+iva refuerza factura, pero no le basta');
    assert.strictEqual(res.data.confianza, 0.5, 'min(1, 3/6)');
    assert.deepStrictEqual(res.data.obligatorios, ['nif', 'fecha', 'total']);

    const extra = new ExtraccionDato();
    assert.strictEqual(extra._extraer({ texto: ALBARAN }, res.data.esquema.nif), 'B87654321');
    assert.strictEqual(extra._extraer({ texto: ALBARAN }, res.data.esquema.fecha), '20/10/2026');
    assert.strictEqual(extra._extraer({ texto: ALBARAN }, res.data.esquema.total), '214,50');
  });

  // ── 5. Ticket: el texto REAL del OCR (columnas descolocadas) ────────────────────
  await test('ticket OCR real → clase ticket, confianza 1 y esquema no vacío', async () => {
    const { mod } = montar();
    const res = await clasificar(mod, { project_id: PROYECTO, texto: TICKET_OCR, source_kind: 'ocr' });
    assert.strictEqual(res.data.clase, 'ticket');
    assert.strictEqual(res.data.senales.ticket, 9, 'ticket 3 + simplificado 3 + gracias 3');
    assert.strictEqual(res.data.confianza, 1, 'min(1, 9/6)');
    assert.ok(Object.keys(res.data.esquema).length > 0, 'el ticket debe traer esquema');
    assert.deepStrictEqual(res.data.obligatorios, ['fecha', 'total']);
    // El nº de ticket y la fecha sí salen del texto real del motor.
    const extra = new ExtraccionDato();
    assert.strictEqual(extra._extraer({ texto: TICKET_OCR }, res.data.esquema.numero), '2026-004512');
    assert.strictEqual(extra._extraer({ texto: TICKET_OCR }, res.data.esquema.fecha), '21/10/2026');
  });

  // ── 6. `otro`: no se inventa el tipo ni el esquema, y AUN ASÍ se encadena ───────
  await test("'otro' → confianza 0, esquema {} y abierto.tipo declarado", async () => {
    const { mod, eventos } = montar();
    const res = await clasificar(mod, { project_id: PROYECTO, texto: OTRO, correlation_id: 'c-otro' });
    assert.strictEqual(res.data.clase, 'otro');
    assert.strictEqual(res.data.confianza, 0);
    assert.deepStrictEqual(res.data.esquema, {});
    assert.deepStrictEqual(res.data.obligatorios, []);
    assert.deepStrictEqual(res.data.motivos, []);
    assert.ok(typeof res.data.abierto.tipo === 'string' && res.data.abierto.tipo.length > 0, 'abierto.tipo debe declararse');

    const cadena = eventos('extraccion-dato.juzgar.request');
    assert.strictEqual(cadena.length, 1, 'con otro TAMBIÉN se encadena (nada se pierde en silencio)');
    assert.strictEqual(cadena[0].data.clase, 'otro');
    assert.deepStrictEqual(cadena[0].data.esquema, {});
    assert.deepStrictEqual(cadena[0].data.obligatorios, []);
    assert.strictEqual(cadena[0].data.texto, OTRO);
    assert.strictEqual(cadena[0].data.correlation_id, 'c-otro');
  });

  // ── 7. Encadenado SIEMPRE, con la forma exacta que consume extraccion-dato ──────
  await test('toda clase encadena 1 vez a extraccion-dato con texto/documento/clase/esquema', async () => {
    const { mod, eventos } = montar();
    for (const [texto, clase] of [[FACTURA_DIGITAL, 'factura'], [ALBARAN, 'albaran'], [TICKET_OCR, 'ticket'], [OTRO, 'otro']]) {
      const res = await clasificar(mod, {
        project_id: PROYECTO,
        texto,
        documento: { path: 'inbox/doc', nombre: 'doc' },
        correlation_id: 'c-cadena'
      });
      const cadena = eventos('extraccion-dato.juzgar.request');
      const ultimo = cadena[cadena.length - 1].data;
      assert.strictEqual(res.data.clase, clase);
      assert.strictEqual(ultimo.clase, clase);
      assert.strictEqual(ultimo.project_id, PROYECTO);
      assert.strictEqual(ultimo.texto, texto);
      assert.strictEqual(ultimo.documento.texto, texto, 'extraccion-dato lee el texto desde documento.texto');
      assert.strictEqual(ultimo.documento.path, 'inbox/doc');
      assert.deepStrictEqual(ultimo.esquema, res.data.esquema);
      assert.deepStrictEqual(ultimo.obligatorios, res.data.obligatorios);
      assert.strictEqual(ultimo.correlation_id, 'c-cadena');
    }
    assert.strictEqual(eventos('extraccion-dato.juzgar.request').length, 4);
    assert.strictEqual(eventos('contabilidad.documento_clasificado').length, 4);
  });

  // ── 8. Fallos deterministas: sin texto, texto ridículo, sin proyecto ────────────
  await test('sin texto / texto < 8 chars → 400 INVALID_INPUT y NO encadena', async () => {
    for (const payload of [
      { project_id: PROYECTO },
      { project_id: PROYECTO, texto: '' },
      { project_id: PROYECTO, texto: 'AB CD' },
      { project_id: PROYECTO, texto: '   \n  ' }
    ]) {
      const { mod, eventos } = montar();
      const res = await clasificar(mod, payload);
      assert.strictEqual(res.status, 400, `payload ${JSON.stringify(payload)}`);
      assert.strictEqual(res.error.code, 'INVALID_INPUT');
      assert.strictEqual(res.error.details.field, 'texto');
      assert.strictEqual(eventos('extraccion-dato.juzgar.request').length, 0, 'sin texto no hay nada que extraer');
      assert.strictEqual(eventos('contabilidad.documento_clasificado').length, 0);
      assert.strictEqual(eventos('clasificador-documento.clasificar.failed').length, 1);
    }
  });

  await test('sin project_id → 400 INVALID_INPUT project_id', async () => {
    const { mod, eventos } = montar();
    const res = await clasificar(mod, { texto: FACTURA_DIGITAL });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
    assert.strictEqual(res.error.details.field, 'project_id');
    assert.strictEqual(eventos('extraccion-dato.juzgar.request').length, 0);
  });

  // ── 9. Forma del esquema: consumible por _extraer (regex + flags + grupo 1) ─────
  await test('cada campo del esquema es {regex,flags} compilable con grupo 1', async () => {
    const { mod } = montar();
    for (const texto of [FACTURA_DIGITAL, ALBARAN, TICKET_OCR]) {
      const res = await clasificar(mod, { project_id: PROYECTO, texto });
      const esquema = res.data.esquema;
      for (const campo of Object.keys(esquema)) {
        const regla = esquema[campo];
        assert.strictEqual(typeof regla.regex, 'string', `${campo}.regex debe ser string`);
        assert.strictEqual(typeof regla.flags, 'string', `${campo}.flags debe ser string`);
        const rx = new RegExp(regla.regex, regla.flags); // si no compila, esto revienta
        assert.ok(rx.exec('') === null || true);
        // El extractor toma el GRUPO 1: el patrón tiene que declararlo.
        assert.ok(rx.source.includes('('), `${campo} debe declarar un grupo de captura`);
      }
      // `obligatorios` siempre es un subconjunto de los campos declarados.
      for (const campo of res.data.obligatorios) {
        assert.ok(Object.prototype.hasOwnProperty.call(esquema, campo), `${campo} obligatorio pero sin patrón`);
      }
    }
  });

  // ── 10. Desempate (regla 2): empate factura/ticket sin NIF+base·IVA → ticket ────
  await test('empate factura/ticket sin NIF ni desglose → ticket (regla 2 del contrato)', async () => {
    const { mod } = montar();
    // FACTURA (3) vs TICKET (3): empate. Sin NIF ni base+IVA no hay preferencia
    // por factura → cae al `ticket` documentado.
    const res = await clasificar(mod, { project_id: PROYECTO, texto: 'FACTURA\nTICKET\nVenta mostrador' });
    assert.strictEqual(res.data.clase, 'ticket');
    assert.strictEqual(res.data.senales.factura, 3);
    assert.strictEqual(res.data.senales.ticket, 3);
    assert.strictEqual(res.data.senales.nif, false);
  });

  if (fallos) {
    console.error(`\n❌ ${fallos} test(s) fallaron`);
    process.exitCode = 1;
    return;
  }
  console.log('\n✅ Todos los tests del clasificador-documento pasaron');
})();
