/**
 * Test — encolado-excepcion.CERRAR: una excepcion atendida deja de estar pendiente.
 *
 * Defecto de raiz: `desatasco-entrada` resolvia/descartaba y anotaba en el historial, pero NADIE
 * cerraba la excepcion en la cola (y el custodio solo tenia `encolar`/`tomar`). Resultado: el
 * panel mostraba como pendiente trabajo ya hecho, para siempre.
 *
 * Aqui se fija:
 *   1. cerrar por id → estado 'cerrada', cierre con resultado y causa, pendientes 0
 *   2. anuncia el HECHO `contabilidad.excepcion_cerrada`
 *   3. sin motivo → 400 (cerrar sin causa es tapar)
 *   4. resultado fuera de RESUELTA|DESCARTADA → 400
 *   5. cerrar dos veces → 200 idempotente con `ya_cerrada`
 *   6. rol distinto de ENCOLADO_EXCEPCION → 403
 *   7. sin cola en memoria → hidrata del disco (mismo defecto que regla-contrapartida)
 *
 * Ejecutar: node tests/unit/entrada__encolado-excepcion-cierre.test.js
 */

'use strict';

const assert = require('assert');
const Modulo = require('../../modules/contabilidad-entrada/encolado-excepcion/index.js');

const PID = 'p-cierre';
const EXC = {
  excepcion_id: 'exc_p_1', clave: 'cuadre:inbox/a.png', motivo: 'descuadre', origen: 'control-cuadre-documento',
  payload: null, estado: 'pendiente', tomada_por: null, tomada_en: null, encolada_en: '2026-10-23T00:00:00.000Z'
};

function crear({ enMemoria = true } = {}) {
  const bus = { eventos: [], publish(ev, payload) { this.eventos.push({ ev, payload }); }, subscribe() { return () => {}; } };
  const m = new Modulo();
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.project_id = PID;
  if (enMemoria) m._colas.set(PID, { esquema: 'contabilidad-encolado-excepcion-v1', cola: [{ ...EXC }], claves: new Set([EXC.clave]) });
  const llamadas = [];
  m._persist = {
    marcarDirty() {}, flush: async () => {}, detener() {},
    async restaurar(pid) {
      llamadas.push(pid);
      m._colas.set(pid, { esquema: 'contabilidad-encolado-excepcion-v1', cola: [{ ...EXC }], claves: new Set([EXC.clave]) });
    },
  };
  return { m, bus, llamadas };
}

const pedido = (extra = {}) => ({ request_id: 't', project_id: PID, rol: 'ENCOLADO_EXCEPCION', excepcion_id: EXC.excepcion_id, resultado: 'RESUELTA', motivo: 'asiento confirmado', ...extra });

(async () => {
  // 1 + 2. cierra y anuncia
  {
    const { m, bus } = crear();
    const r = await m.onCerrarRequest(pedido());
    const d = r.data || r;
    assert.strictEqual(d.cerrada, true);
    assert.strictEqual(d.resultado, 'RESUELTA');
    assert.strictEqual(d.pendientes, 0, 'ya no queda pendiente');
    const exc = m._colas.get(PID).cola[0];
    assert.strictEqual(exc.estado, 'cerrada');
    assert.strictEqual(exc.cierre.motivo, 'asiento confirmado');
    assert.ok(exc.cierre.cerrada_en, 'deja la fecha de cierre');
    const hecho = bus.eventos.filter((e) => e.ev === 'contabilidad.excepcion_cerrada');
    assert.strictEqual(hecho.length, 1, 'anuncia el hecho de cierre');
    assert.strictEqual(hecho[0].payload.resultado, 'RESUELTA');
  }

  // 3. sin motivo → 400
  {
    const { m } = crear();
    const r = await m.onCerrarRequest(pedido({ motivo: '   ' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(m._colas.get(PID).cola[0].estado, 'pendiente', 'no se cierra sin causa');
  }

  // 4. resultado inválido → 400
  {
    const { m } = crear();
    const r = await m.onCerrarRequest(pedido({ resultado: 'OK' }));
    assert.strictEqual(r.status, 400);
  }

  // 5. cerrar dos veces → idempotente
  {
    const { m } = crear();
    await m.onCerrarRequest(pedido());
    const r2 = await m.onCerrarRequest(pedido({ motivo: 'otra vez' }));
    assert.strictEqual(r2.status, 200);
    assert.strictEqual((r2.data || r2).ya_cerrada, true);
  }

  // 6. rol ajeno → 403
  {
    const { m } = crear();
    const r = await m.onCerrarRequest(pedido({ rol: 'OTRO' }));
    assert.strictEqual(r.status, 403);
  }

  // 7. hidrata del disco antes de cerrar
  {
    const { m, llamadas } = crear({ enMemoria: false });
    const r = await m.onCerrarRequest(pedido());
    assert.deepStrictEqual(llamadas, [PID], 'restaura la cola del disco');
    assert.strictEqual((r.data || r).cerrada, true, 'cierra la excepcion que estaba solo en disco');
  }

  console.log('OK · encolado-excepcion.cerrar: 7/7 (cierra con causa, idempotente, rol y hidratacion)');
})().catch((e) => { console.error('FALLO ·', e.message); process.exit(1); });
