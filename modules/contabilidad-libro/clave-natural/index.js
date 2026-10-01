/**
 * contabilidad-libro/clave-natural — REFLEJO STATELESS (M3, hoja del plan).
 *
 * Idempotencia determinista: reprocesar NO duplica ('un cierre = un asiento'). Un test lo afirma.
 * Calcula la CLAVE NATURAL de un hecho/documento a partir de sus COMPONENTES DECLARADOS, y decide
 * si dos elementos COINCIDEN (misma clave). Es el único criterio de "es lo mismo" del dominio.
 *
 * Invariantes:
 *  - DETERMINISTA: mismos componentes + mismos valores → misma clave. Un test lo afirma.
 *  - Los COMPONENTES de la clave son DECLARABLES (`componentes: [...]`). Si no se declaran, se
 *    usan TODOS los campos del elemento salvo los VOLÁTILES (en/timestamp/request_id/correlation_id/
 *    autor): jamas se inventa un subconjunto de dominio cableado.
 *  - No normaliza por política de negocio: normaliza MECÁNICAMENTE (trim/colapsa espacios/case).
 *  - Sin elementos → no hay clave (dato ausente = desconocido), no una clave vacía que colisione.
 *
 * R3 · ESCUCHA (la deriva que se EVITA): el plan declara escucha de `contabilidad.anclaje_cierre_declarado`
 * (anclaje-cierre-vertical, grupo posterior). NINGÚN módulo del repo lo emite AÚN: declararlo daría
 * cadena colgada (R3 deriva), así que NO se declara hasta que su emisor exista.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. Ambos RPC son PREGUNTA
 * → su cara es el bus (sin ui_handler).
 * Ver hoja M3 del plan-construccion y diseno-oop.md (CLASE ClaveNatural).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Campos VOLÁTILES: no forman parte de la identidad natural (cambian en cada paso sin mudar el hecho).
const VOLATILES = new Set(['en', 'timestamp', 'ts', 'request_id', 'correlation_id', 'autor', 'actor', 'rol', '_version']);

class ClaveNatural extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'clave-natural';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC: calcular (PREGUNTA → sin ui_handler) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'clave-natural.calcular.response', async (d) => {
      const res = this._calcular(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('clave-natural.calcular.failed', res);
      else if (res.data && res.data.componentes_declarados === false) {
        // El plan dice que "sube" a la cola cuando falta el criterio: peticion best-effort al JEFE.
        this._subirPeticionCriterio(res.data.project_id);
      }
      return res;
    });
  }

  // ── handler RPC: coincide (PREGUNTA → sin ui_handler) ──
  onCoincideRequest(e) {
    return this._atender(e, 'coincide', 'clave-natural.coincide.response', async (d) => {
      const res = this._coincide(d);
      if (res.status !== 200) this.eventBus?.publish('clave-natural.coincide.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(elemento) → clave natural determinista
  // ══════════════════════════════════════════════════════════════════════
  _calcular(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const elemento = input.elemento !== undefined ? input.elemento
      : (input.hecho !== undefined ? input.hecho : input.documento);
    if (!elemento || typeof elemento !== 'object') return this._invalid('elemento');

    const { componentes, declarados } = this._componentes(input, elemento);
    if (componentes.length === 0) {
      return this._errorResponse(422, 'SIN_COMPONENTES',
        'no hay componentes para la clave natural (el elemento no tiene campos y no se declararon componentes)',
        { project_id: pid });
    }

    const partes = componentes.map((c) => this._norm(elemento[c]));
    const clave = partes.join('|');

    return {
      status: 200,
      data: {
        project_id: pid,
        clave,
        componentes,
        partes,
        componentes_declarados: declarados,
        // Determinista: mismo elemento → misma clave. Reprocesar NO duplica.
        determinista: true,
        abierto: {
          componentes: declarados ? null : 'no se declararon `componentes`: se usan todos los campos no volátiles'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // coincide(a, b, componentes?) → bool (misma clave natural)
  // ══════════════════════════════════════════════════════════════════════
  _coincide(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const a = input.a !== undefined ? input.a : input.uno;
    const b = input.b !== undefined ? input.b : input.otro;
    if (!a || typeof a !== 'object') return this._invalid('a');
    if (!b || typeof b !== 'object') return this._invalid('b');

    const ca = this._calcular({ project_id: pid, elemento: a, componentes: input.componentes });
    if (ca.status !== 200) return ca;
    const cb = this._calcular({ project_id: pid, elemento: b, componentes: input.componentes });
    if (cb.status !== 200) return cb;

    const coincide = ca.data.clave === cb.data.clave;
    return {
      status: 200,
      data: {
        project_id: pid,
        coincide,
        clave: coincide ? ca.data.clave : null,
        clave_a: ca.data.clave,
        clave_b: cb.data.clave,
        componentes: ca.data.componentes,
        // Si coincide, es el MISMO hecho: re-procesarlo no debe duplicar (idempotencia).
        es_duplicado: coincide
      }
    };
  }

  // Los componentes de la clave: DECLARADOS o (si no) todos los campos no volátiles, ordenados.
  _componentes(input = {}, elemento = {}) {
    if (Array.isArray(input.componentes) && input.componentes.length) {
      const comps = input.componentes.map((c) => String(c)).filter(Boolean);
      if (comps.length) return { componentes: comps, declarados: true };
    }
    const comps = Object.keys(elemento).filter((k) => !VOLATILES.has(k)).sort();
    return { componentes: comps, declarados: false };
  }

  // Normalización MECÁNICA (no de negocio): trim, colapsa espacios, minúsculas. Ausente → marcador.
  _norm(v) {
    if (v === undefined || v === null) return '\u0000';   // marcador de ausente (no colisiona con '')
    if (typeof v === 'object') return JSON.stringify(v, Object.keys(v).sort());
    return String(v).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // Peticion best-effort a la cola declarativa cuando falta el criterio de componentes.
  // NO suplanta al JEFE (no manda rol): solo deja la peticion en el bus para que se declare.
  // "Sube" (request), no publica un hecho: va por `_rpc`, no por `publish`.
  _subirPeticionCriterio(pid) {
    try {
      if (pid) this._rpc('cola-declaraciones-criterio.fijar.request', {
        project_id: pid,
        clave: 'clave_natural',
        origen: 'clave-natural'
      }, { timeout_ms: 2000 });
    } catch (_) { /* best-effort: el reflejo no cuelga si el bus no esta */ }
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
  toolCoincide(params) { return this._coincide(params); }
}

module.exports = ClaveNatural;
