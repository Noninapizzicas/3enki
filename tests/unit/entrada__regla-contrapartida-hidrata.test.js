/**
 * Test — regla-contrapartida HIDRATA del disco antes de operar.
 *
 * Defecto de raíz que dejaba la cuenta por proveedor sin efecto: tras un reinicio (o en un
 * proyecto que no es el "activo"), la parcela en memoria nace VACÍA (`_obtenerOCrear`), así que
 * `aplicar` respondía "no hay regla operativa declarada" aunque el fichero la tuviera — y
 * `declarar` escribía encima perdiendo las demás reglas del proyecto.
 *
 * Aquí se fija:
 *   1. sin parcela en memoria → `_asegurarParcela` restaura del disco y `aplicar` devuelve la regla
 *   2. si la parcela YA existe en memoria no se toca (puede tener cambios sin flush)
 *   3. tras la restauración, `declarar` conserva las reglas anteriores
 *
 * Ejecutar: node tests/unit/entrada__regla-contrapartida-hidrata.test.js
 */

'use strict';

const assert = require('assert');
const Modulo = require('../../modules/contabilidad-entrada/regla-contrapartida/index.js');

const PID = 'p-hidrata';
const REGLA = { clave: 'nif:B73069916::600', contexto: 'nif:B73069916', cuenta: '600', origen: 'DECLARADA', opera: true, ratificada: true };

function crear({ enDisco = [REGLA], enMemoria = null } = {}) {
  const m = new Modulo();
  m.eventBus = { publish() {}, subscribe() { return () => {}; } };
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.project_id = PID;
  if (enMemoria) m._parcelas.set(PID, { esquema: 'contabilidad-regla-contrapartida-v1', reglas: enMemoria });

  const llamadas = [];
  m._persist = {
    marcarDirty() {},
    flush: async () => {},
    detener() {},
    async restaurar(pid) {
      llamadas.push(pid);
      const reglas = new Map();
      for (const r of enDisco) reglas.set(r.clave, r);
      m._parcelas.set(pid, { esquema: 'contabilidad-regla-contrapartida-v1', reglas });
    },
  };
  return { m, llamadas };
}

(async () => {
  // 1. parcela vacía en memoria (simula reinicio) → restaurar del disco y aplicar
  {
    const { m, llamadas } = crear();
    const r = await m.onAplicarRequest({ request_id: 't1', project_id: PID, contexto: 'nif:B73069916' });
    const d = (r && r.data) || r;
    assert.deepStrictEqual(llamadas, [PID], 'restaura la parcela del proyecto pedido');
    assert.strictEqual(d.aplicada, true, 'la regla del disco se aplica');
    assert.strictEqual(d.contrapartida, '600');
  }

  // 2. parcela ya en memoria → NO se restaura (no se pisan cambios sin flush)
  {
    const memoria = new Map([[REGLA.clave, REGLA]]);
    const { m, llamadas } = crear({ enMemoria: memoria });
    await m.onAplicarRequest({ request_id: 't2', project_id: PID, contexto: 'nif:B73069916' });
    assert.deepStrictEqual(llamadas, [], 'no restaura si la parcela ya está viva en memoria');
  }

  // 3. declarar tras restaurar conserva las reglas anteriores del proyecto
  {
    const vieja = { clave: 'nif:B11111111::629', contexto: 'nif:B11111111', cuenta: '629', origen: 'DECLARADA', opera: true, ratificada: true };
    const { m } = crear({ enDisco: [vieja] });
    await m.onDeclararRequest({
      request_id: 't3', project_id: PID, rol: 'REGLA_CONTRAPARTIDA',
      regla: { contexto: 'nif:B73069916', cuenta: '600', origen: 'DECLARADA' },
    });
    const p = m._parcelas.get(PID);
    assert.ok(p.reglas.has(vieja.clave), 'la regla anterior NO se pierde al declarar');
    assert.strictEqual(p.reglas.size, 2, 'quedan las dos reglas');
  }

  console.log('OK · regla-contrapartida: 3/3 (hidrata del disco, no pisa memoria, declarar conserva)');
})().catch((e) => { console.error('FALLO ·', e.message); process.exit(1); });
