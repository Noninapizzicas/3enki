/**
 * contabilidad-analitica/cuadro-mando-contable — REFLEJO STATELESS (J8, hoja del plan).
 *
 * La AGREGACION DE CONJUNTO (caja · resultado · margen · desviacion · ejercicio) SIN bajar
 * al asiento. Es la LENTE DEL JEFE: no calcula ninguna de las cifras — las COMPONE subiendo
 * por EVENTO a quien si las calcula y agrupando sus respuestas:
 *   saldo-tesoreria.calcular.request      → caja
 *   cuenta-resultados.calcular.request    → resultado
 *   margen-analitico.calcular.request     → margen
 *   desviacion.calcular.request           → desviacion
 * o usa lo DECLARADO. NO escribe nada.
 *
 * Invariante (13): dato ausente = desconocido. La cifra que no llega NO se rellena con 0:
 * queda `abierta` — un cuadro de mando con ceros inventados es una foto falsa del negocio.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.asiento_asentado` (escritor-diario B2,
 * emitido) y `contabilidad.ejercicio_cerrado` (cierre-ejercicio C4). C4 AUN NO existe en el repo
 * → la escucha de ejercicio_cerrado NO se declara (cadena colgada).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja J8 del plan-construccion y diseno-oop.md (CLASE CuadroMandoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CuadroMandoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuadro-mando-contable';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onComponerRequest(e) {
    return this._atender(e, 'componer', 'cuadro-mando-contable.componer.response', async (d) => {
      const res = await this._componer(d);
      // Reflejo: compone; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('cuadro-mando-contable.componer.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): el libro cambio → se observa (ventana acotada) ──
  // Observar NO es escribir: solo se anota que hay material nuevo para el proximo cuadro.
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._latidos = this._latidos || [];
    this._latidos.push({ project_id: d.project_id || null, numero: (d.asiento && d.asiento.numero) || null, en: new Date().toISOString() });
    if (this._latidos.length > 500) this._latidos.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // _componer(input) → { status, data }  ·  agrega las 4 cifras (no las calcula)
  // ══════════════════════════════════════════════════════════════════════
  async _componer(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const ctx = { project_id: pid, ejercicio: input.ejercicio, periodo: input.periodo, dimension: input.dimension };

    // Cada cifra: de lo DECLARADO, o subida por EVENTO a quien la calcula. Se componen en paralelo.
    const [caja, resultado, margen, desviacion] = await Promise.all([
      this._cifra(input, 'caja', 'saldo-tesoreria.calcular.request', ctx),
      this._cifra(input, 'resultado', 'cuenta-resultados.calcular.request', ctx),
      this._cifra(input, 'margen', 'margen-analitico.calcular.request', ctx),
      this._cifra(input, 'desviacion', 'desviacion.calcular.request', ctx)
    ]);

    const cifras = { caja, resultado, margen, desviacion };
    const faltan = Object.entries(cifras).filter(([, c]) => !c.disponible).map(([k]) => k);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'cuadro-mando-contable',
        ejercicio: input.ejercicio != null ? String(input.ejercicio) : null,
        periodo: input.periodo != null ? String(input.periodo) : null,
        // La foto de conjunto: las cuatro cifras con su origen declarado.
        cuadro: cifras,
        disponible: faltan.length === 0,
        faltan,
        // SIN bajar al asiento: se compone de agregados ya calculados por otros.
        sin_bajar_al_asiento: true,
        abierto: faltan.length
          ? `no llegaron: ${faltan.join(', ')} (se declaran abiertas, NO se rellenan con cero)`
          : null
      }
    };
  }

  // Trae UNA cifra del cuadro: declarada, o pedida por EVENTO a su calculador. Ausente → disponible:false.
  async _cifra(input, clave, evento, ctx) {
    // Declarada explicitamente.
    const directa = input[clave];
    if (directa !== undefined && directa !== null) {
      const n = this._num((directa && typeof directa === 'object') ? directa.importe : directa);
      if (n !== null) return { clave, importe: n, origen: 'declarado', disponible: true, fuente_evento: null };
      // Declarada como objeto sin importe: se declara el hueco, no se rellena.
      return { clave, importe: null, origen: 'declarado', disponible: false, fuente_evento: null };
    }

    // Sube best-effort por EVENTO a quien la calcula.
    const resp = await this._rpc(evento, ctx, { timeout_ms: 900 });
    const d = (resp && (resp.data || resp)) || null;
    const n = this._extraer(d);
    if (n !== null) return { clave, importe: n, origen: 'evento', disponible: true, fuente_evento: evento };
    return { clave, importe: null, origen: null, disponible: false, fuente_evento: evento };
  }

  // La cifra del payload de respuesta: intenta los campos conocidos de cada calculador.
  _extraer(d) {
    if (!d || typeof d !== 'object') return null;
    for (const k of ['importe', 'saldo', 'total', 'resultado', 'margen', 'desviacion', 'caja', 'valor', 'cifra']) {
      const n = this._num(d[k]);
      if (n !== null) return n;
    }
    return null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolComponer(params) { return this._componer(params); }
}

module.exports = CuadroMandoContable;
