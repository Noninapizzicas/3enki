/**
 * contabilidad/clave-natural — REFLEJO STATELESS (M3, hoja del plan).
 *
 * CERROJO 3 · IDEMPOTENCIA: mismos componentes → mismo hecho → mismo asiento.
 * Un solo calculador de la clave natural del hecho. La clave cuelga de la
 * UNIDAD DE CIERRE (A14 `anclaje-cierre-vertical` / M4 `definicion-cierre`,
 * [ABIERTO], declarable en cola-declaraciones-criterio): si la fuente no la
 * declara, la clave queda INCOMPLETA y el hecho va a cola — JAMAS se inventa
 * una unidad de cierre. Reprocesar no duplica: la clave lo delata.
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * no guarda estado. Cada op entra objeto, sale objeto, y es DETERMINISTA
 * (mismas entradas → misma clave; un test unitario lo afirma). La dependencia
 * con anclaje-cierre-vertical (A14) y cola-declaraciones-criterio (K9) es por
 * EVENTO, NUNCA por require cruzado. Emisor/par de fallo: exito publica
 * contabilidad.clave_calculada; error su par determinista. NO REUTILIZA: la
 * clave natural es la invariante anti-bucle de ESTA vertical; ningun modulo del
 * inventario la calcula.
 *
 * Ver hoja M3 del diseno-oop y bloque `clave-natural` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const crypto = require('crypto');

// Componentes que identifican el hecho para la clave natural. El orden importa:
// la clave es reproducible bit a bit (determinista para el test).
const COMPONENTES = [
  'vertical', 'fuente', 'documento_origen', 'fecha_operacion',
  'fecha_valor', 'tercero', 'moneda', 'total'
];

class ClaveNatural extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clave-natural';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers RPC ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'contabilidad.clave.calcular.response', async (d) => {
      const res = this._calcular(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.clave_calculada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.clave.calcular.failed', res);
      }
      return res;
    });
  }

  onRepeticionRequest(e) {
    return this._atender(e, 'repeticion', 'contabilidad.clave.repeticion.response', async (d) => {
      const res = this._esRepeticion(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.clave.repeticion.failed', res);
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──
  // calcular(hechoODocumento) -> ClaveNatural (cuelga de la unidad de cierre).
  _calcular(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = (input && (input.hecho || input.documento || input.hecho_crudo)) || null;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const vertical = hecho.vertical || (input && input.vertical) || null;
    if (!vertical) return this._invalid('hecho.vertical');

    // La unidad de cierre (M4 [ABIERTO]) viene declarada por criterio o por el
    // hecho. Sin ella la clave queda INCOMPLETA: el hecho va a cola (no se inventa).
    const unidad = (input && (input.unidad_de_cierre || input.criterio)) || hecho.unidad_cierre || null;
    if (!unidad) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'la unidad de cierre no esta declarada (M4 [ABIERTO])', {
        vertical, senal: 'unidad_de_cierre_no_declarada', accion: 'el hecho va a cola; no se inventa la unidad'
      });
    }

    const partes = this._componentes(vertical, hecho, unidad);
    const clave = this._serializar(pid, partes);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        unidad_de_cierre: unidad,
        componentes: partes,
        clave_natural: clave,
        completa: true,
        determinista: true
      }
    };
  }

  // esRepeticion(clave, yaAsentados) -> Bool — idempotencia (un test lo afirma).
  _esRepeticion(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const clave = input && input.clave;
    if (!clave) return this._invalid('clave');

    const yaAsentados = Array.isArray(input && input.ya_asentados)
      ? input.ya_asentados
      : (Array.isArray(input && input.yaAsentados) ? input.yaAsentados : []);
    // Los yaAsentados pueden ser claves sueltas o asientos con su clave.
    const claves = new Set(yaAsentados.map((a) => (a && typeof a === 'object') ? (a.clave_natural || a.clave) : a).filter(Boolean));

    const repeticion = claves.has(clave);
    if (repeticion) {
      this.eventBus?.publish('contabilidad.clave_calculada', {
        project_id: pid,
        clave_natural: clave,
        repeticion: true,
        ya_asentados: claves.size,
        correlation_id: input && input.correlation_id
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        clave_natural: clave,
        repeticion,
        ya_asentados: claves.size,
        nota: repeticion ? 'mismo hecho ya asentado: reprocesar NO duplica' : 'hecho nuevo'
      }
    };
  }

  // componentizar(vertical, hecho, unidad) -> objeto reproducible.
  _componentes(vertical, hecho, unidad) {
    const partes = { vertical: String(vertical), unidad_de_cierre: String(unidad) };
    for (const c of COMPONENTES) {
      if (c === 'vertical') continue;
      const v = hecho[c];
      partes[c] = (v === undefined || v === null) ? null : v;
    }
    return partes;
  }

  // serializar(pid, partes) -> clave determinista (reproducible bit a bit).
  _serializar(pid, partes) {
    const canon = JSON.stringify(partes);
    const hash = crypto.createHash('sha1').update(canon).digest('hex').slice(0, 16);
    return `${pid}:${partes.vertical}:${hash}`;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
  toolEsRepeticion(params) { return this._esRepeticion(params); }
}

module.exports = ClaveNatural;
