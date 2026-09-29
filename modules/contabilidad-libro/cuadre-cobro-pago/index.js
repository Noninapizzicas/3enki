/**
 * contabilidad-libro/cuadre-cobro-pago — REFLEJO STATELESS (E3, hoja del plan).
 *
 * COTEJA cobros y pagos contra el BANCO. La clave natural es COMPARTIDA: **un movimiento
 * bancario = un cobro/pago**. Dado un movimiento (o un conjunto), decide deterministamente
 * si YA tiene su cobro/pago cotejado en el diario y, si no lo tiene, cual es el apunte que le
 * corresponde SEGUN LA EVIDENCIA del propio movimiento (signo → lado, importe → cuantia).
 *
 * Determinista: mismo movimiento + mismo diario → mismo resultado. Cero juicio: aqui NO se
 * interpreta una descripcion ambigua (eso es E7). Si el movimiento NO se puede cotejar con
 * nada del diario por su clave natural, se declara `cotejado:false` y se manda a la cola del
 * juicio (E7), jamas se inventa el cobro/pago.
 *
 * El movimiento llega por DOS vias, ninguna es un `require` cruzado:
 *   - `contabilidad.movimiento_bancario` (fire-and-forget de E2): se ACUMULA la muestra en un
 *     espejo en memoria (idempotente por su clave natural).
 *   - `cuadre-cobro-pago.cuadrar.request`: se COTEJA lo que venga declarado o el espejo.
 *
 * Invariantes:
 *  - El diario se PIDE a escritor-diario (B2) POR EVENTO; si no responde, se declara
 *    `diario_disponible:false` y no se afirma el cotejo (nada se estima).
 *  - La direccion del apunte (debe/haber) sale del SIGNO declarado del movimiento, no de una
 *    constante: `cargo` → salida, `abono` → entrada. Sin signo → no se afirma la direccion.
 *  - NO escribe, NO persiste, NO muta el libro.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja E3 del plan-construccion y diseno-oop.md (CLASE CuadreCobroPago).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuadreCobroPago extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadre-cobro-pago';
    this.version = 'reflejo-0.1.0';
    // espejo en memoria de los movimientos que entraron por el bus: project_id -> Map<clave, Movimiento>
    this._espejo = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── fire-and-forget: el extracto (E2) publico un movimiento → se refleja (no muta nada) ──
  onMovimientoBancario(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const movimiento = d.movimiento;
    if (!pid || !movimiento || typeof movimiento !== 'object') return null;
    const clave = d.clave != null ? String(d.clave) : this._claveDe(movimiento);
    if (!clave) return null;
    this._espejoDe(pid).set(clave, movimiento);   // idempotente: un movimiento = una clave
    return null;
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onCuadrarRequest(e) {
    return this._atender(e, 'cuadrar', 'cuadre-cobro-pago.cuadrar.response', async (d) => {
      const res = await this._cuadrar(d);
      if (res.status !== 200) this.eventBus?.publish('cuadre-cobro-pago.cuadrar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: cuadrar(m:Movimiento) → Opcion<Asiento cotejado> ──
  async _cuadrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Los movimientos a cotejar: los declarados en la peticion o el espejo acumulado.
    const declarados = Array.isArray(input.movimientos) ? input.movimientos
      : (input.movimiento && typeof input.movimiento === 'object' ? [input.movimiento]
        : (input.m ? [input.m] : null));
    const movimientos = declarados || [...this._espejoDe(pid).values()];

    // El diario (B2) se pide POR EVENTO. Sin el, no se afirma el cotejo.
    const { asientos, diario_disponible } = await this._diario(pid, input);

    const por_clave = new Map();
    for (const a of asientos) {
      if (a && a.clave_natural != null) por_clave.set(String(a.clave_natural), a);
    }

    const cotejados = [];
    const pendientes = [];
    for (const m of movimientos) {
      if (!m || typeof m !== 'object') continue;
      const clave = this._claveDe(m);
      if (!clave) { pendientes.push({ movimiento: m, motivo: 'movimiento sin clave natural: no se puede cotejar' }); continue; }

      const asiento = por_clave.get(clave) || null;
      if (asiento) {
        // Un movimiento bancario = un cobro/pago: ya tiene su asiento.
        cotejados.push({
          clave,
          movimiento: m,
          asiento,
          lado: this._lado(m),
          importe: this._num(m.importe),
          cuadrado: true
        });
      } else {
        // Sin asiento que le corresponda: NO se inventa el cobro/pago — va a la cola del juicio.
        pendientes.push({
          clave,
          movimiento: m,
          lado: this._lado(m),
          importe: this._num(m.importe),
          motivo: diario_disponible
            ? 'el movimiento no tiene cobro/pago cotejado en el diario: un movimiento = un cobro/pago'
            : 'el diario (B2) no respondio: no se afirma el cotejo',
          requiere_cola: true,
          juicio: 'partida-no-identificada'
        });
      }
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        periodo: input.periodo != null ? String(input.periodo) : null,
        fuente_asientos: diario_disponible ? 'diario' : null,
        diario_disponible,
        total_movimientos: movimientos.length,
        cotejados,
        pendientes,
        cuadra: pendientes.length === 0 && diario_disponible,
        juicio_delegado_a: 'partida-no-identificada'
      }
    };
  }

  // El diario se pide a escritor-diario (B2) por EVENTO (nunca require cruzado).
  async _diario(pid, input) {
    const r = await this._rpc('escritor-diario.asientos.request',
      { project_id: pid, periodo: input.periodo != null ? String(input.periodo) : null }, { timeout_ms: 4000 });
    const asientos = r && r.data && Array.isArray(r.data.asientos) ? r.data.asientos
      : (Array.isArray(r) ? r : null);
    if (asientos) return { asientos, diario_disponible: true };
    return { asientos: [], diario_disponible: false };
  }

  // El lado del apunte lo dice el SIGNO del movimiento (dato declarado), no una constante.
  _lado(m) {
    const s = m && m.signo != null ? String(m.signo).toLowerCase().trim() : null;
    if (s === 'cargo' || s === 'debito' || s === 'salida') return 'salida';
    if (s === 'abono' || s === 'credito' || s === 'entrada') return 'entrada';
    return null;   // sin signo → no se afirma la direccion (dato ausente = desconocido)
  }

  _claveDe(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.clave != null) return String(m.clave);
    const partes = [m.fecha, m.importe, m.signo, (m.referencia != null ? m.referencia : m.concepto)];
    if (partes.every(v => v === null || v === undefined)) return null;
    return partes.map(v => (v === null || v === undefined ? '-' : String(v))).join('|');
  }

  _espejoDe(pid) {
    let m = this._espejo.get(pid);
    if (!m) { m = new Map(); this._espejo.set(pid, m); }
    return m;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : null;
  }

  // ── Tools ──
  toolCuadrar(params) { return this._cuadrar(params); }
}

module.exports = CuadreCobroPago;
