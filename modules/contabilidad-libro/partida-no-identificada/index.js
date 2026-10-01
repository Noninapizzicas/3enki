/**
 * contabilidad-libro/partida-no-identificada — MICRO-AGENTE (E7, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * RECONOCE Y CLASIFICA EL MOVIMIENTO SIN CONTRAPARTIDA (comision/interes/devolucion). PROPONE.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Un movimiento bancario que llega sin contrapartida (una comision, un interes, una devolucion)
 * no tiene aun su cuenta. Esta hoja MIRA el movimiento, busca la REGLA declarada que lo cubre
 * (E8, via `regla-movimiento-bancario.aplicar.request` por EVENTO) y expone una PROPUESTA.
 *
 * Invariantes:
 *  - PROPONE, no escribe: `juzgar` deriva una propuesta; NUNCA apila un asiento ni fija la regla
 *    (el corte duro lo fija regla-movimiento-bancario E8). El que asienta es escritor-diario (B2).
 *  - Dato ausente = desconocido: sin movimiento NO hay nada que reconocer; sin regla declarada que
 *    lo cubra, la contrapartida queda ABIERTA (no se adivina la cuenta de la comision).
 *  - Cuando NO hay regla que cubra → SUBE `encolado-excepcion.encolar.request` (lo dudoso a cola).
 *
 * ESCUCHA (R3): contabilidad.movimiento_regla_declarada, emitido por regla-movimiento-bancario
 * (E8) → emisor vivo. El handler es fire-and-forget (toma constancia; no anuncia hecho).
 *
 * Forma: MICRO-AGENTE (mitad refleja) → STATELESS. Sin PosPersistencia. RPC juzgar es PREGUNTA → SIN ui_handler.
 * Ver hoja E7 del plan-construccion y diseno-oop.md (CLASE PartidaNoIdentificada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los TIPOS reconocidos de partida sin contrapartida. El `tipo` es DATO declarable; no se cablea
// una regla de negocio oculta — solo se nombra lo que la operacion bancaria declara.
const TIPOS = new Set(['comision', 'interes', 'interés', 'devolucion', 'devolución', 'abono', 'cargo', 'otro']);

class PartidaNoIdentificada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'partida-no-identificada';
    this.version = 'reflejo-0.1.0';
    // Reglas declaradas observadas por proyecto (memoria acotada, no store).
    this._reglas = new Map(); // project_id -> [regla]
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'partida-no-identificada.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      // Micro-agente (mitad refleja): PROPONE; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) {
        this.eventBus?.publish('partida-no-identificada.juzgar.failed', res);
        return res;
      }
      // SUBE a regla-movimiento-bancario (E8) por EVENTO: la regla declarada es la que decide.
      if (res.data.contexto) {
        const regla = await this._rpc('regla-movimiento-bancario.aplicar.request', {
          project_id: res.data.project_id, contexto: res.data.contexto, movimiento: res.data.movimiento
        });
        const aplicada = Boolean(regla && regla.status === 200 && regla.data && regla.data.aplicada === true);
        const cuenta = aplicada ? (regla.data.cuenta != null ? regla.data.cuenta : (regla.data.contrapartida != null ? regla.data.contrapartida : null)) : null;
        res.data.propuesta.cuenta = cuenta;
        res.data.propuesta.completa = cuenta != null;
        if (aplicada) res.data.regla = regla.data.regla || null;
        if (!aplicada) {
          res.data.abierto = 'no hay regla declarada que cubra este movimiento: la contrapartida queda abierta (no se adivina la cuenta)';
          // Lo dudoso va a la cola (A8.1): no se adivina.
          this.eventBus?.publish('encolado-excepcion.encolar.request', {
            project_id: res.data.project_id,
            rol: 'PARTIDA_NO_IDENTIFICADA',
            clave: res.data.clave || `partida:${res.data.movimiento_id || 's/ref'}`,
            motivo: 'movimiento sin contrapartida y sin regla declarada: la clasificacion queda abierta (no se adivina)',
            origen: 'partida-no-identificada',
            payload: { tipo: res.data.tipo, importe: res.data.importe },
            correlation_id: d.correlation_id
          });
        }
      }
      return res;
    });
  }

  // ── handler FIRE-AND-FORGET: una regla de movimiento quedo declarada → se observa ──
  onMovimientoReglaDeclarada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const lista = this._reglas.get(pid) || [];
    lista.push(d.regla || d);
    if (lista.length > 500) lista.shift();
    this._reglas.set(pid, lista);
  }

  // ══════════════════════════════════════════════════════════════════════
  // juzgar(movimiento) → PROPUESTA de clasificacion (PREGUNTA; PROPONE, no fija)
  // ══════════════════════════════════════════════════════════════════════
  async _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const movimiento = input.movimiento !== undefined ? input.movimiento
      : (input.partida !== undefined ? input.partida : (input.movimiento_bancario !== undefined ? input.movimiento_bancario : null));
    if (!movimiento || typeof movimiento !== 'object') return this._invalid('movimiento');

    const movimiento_id = movimiento.movimiento_id != null ? String(movimiento.movimiento_id)
      : (movimiento.id != null ? String(movimiento.id) : null);
    const clave = input.clave != null ? String(input.clave) : (movimiento.clave != null ? String(movimiento.clave) : null);

    // El TIPO reconocido (declarado o inferido del concepto). Es DATO, no una regla oculta.
    const tipo = this._tipo(input.tipo ?? movimiento.tipo, movimiento);
    const importe = this._num(input.importe ?? movimiento.importe ?? movimiento.total ?? movimiento.cargo ?? movimiento.abono);

    // El CONTEXTO contra el que se aplica la regla declarada (concepto/texto del movimiento).
    const contexto = input.contexto != null ? String(input.contexto)
      : this._contexto(movimiento);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo_movimiento: 'partida-no-identificada',
        movimiento_id,
        clave,
        movimiento,
        concepto: tipo,
        tipo,
        importe,
        contexto,
        propuesta: {
          // La CUENTA la propone la regla declarada (E8); aqui nace null y el handler la rellena.
          cuenta: null,
          tipo,
          completa: false
        },
        // PROPONE; el corte duro (fijar la regla) es de regla-movimiento-bancario (E8). Esta hoja NO fija.
        propone: true,
        fija: false,
        reglas_observadas: (this._reglas.get(pid) || []).length,
        // Determinista en lo declarado; lo no cubierto es juicio (mitad fuzzy del micro-agente).
        abierto: 'no hay regla declarada que cubra este movimiento: la contrapartida queda abierta (no se adivina la cuenta)'
      }
    };
  }

  // El tipo: declarado (normalizado) o inferido del texto del concepto. Nunca una constante oculta.
  _tipo(declarado, movimiento) {
    const d = declarado != null ? String(declarado).toLowerCase().trim() : '';
    if (TIPOS.has(d)) return d;
    const texto = String((movimiento && (movimiento.concepto || movimiento.descripcion || movimiento.texto)) || '').toLowerCase();
    if (texto.includes('comision') || texto.includes('comisión')) return 'comision';
    if (texto.includes('interes') || texto.includes('interés')) return 'interes';
    if (texto.includes('devolucion') || texto.includes('devolución')) return 'devolucion';
    return 'otro';
  }

  // El contexto declarado del movimiento (lo que la regla usa para casar). Ausente → null.
  _contexto(movimiento) {
    for (const k of ['concepto', 'descripcion', 'texto', 'referencia', 'contraparte']) {
      if (movimiento[k] != null && String(movimiento[k]).trim() !== '') return String(movimiento[k]).trim();
    }
    return null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = PartidaNoIdentificada;
