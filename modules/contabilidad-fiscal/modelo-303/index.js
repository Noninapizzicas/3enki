/**
 * contabilidad-fiscal/modelo-303 — REFLEJO STATELESS (D2, hoja del plan).
 *
 * Construye el modelo trimestral (303) DESDE la liquidacion. Determinista: misma liquidacion →
 * mismo modelo. NO calcula el IVA por su cuenta (eso es liquidacion-iva D1): le SUBE por EVENTO
 * liquidacion-iva.calcular.request y COMPONE las casillas del modelo con lo que devuelve — o con
 * lo DECLARADO en el input.
 *
 * Los CASILLEROS y los TIPOS son DATO: el mapeo concepto→casilla sale de lo declarado (o de un
 * mapeo por defecto de los bloques devengado/soportado/resultado del 303, que NO es un tipo de IVA).
 * Aqui no se cablea ningun tipo ni tramo de la ley.
 *
 * Honestidad (invariante 13): sin liquidacion (ni declarada ni de liquidacion-iva D1) el modelo
 * NO se rellena con ceros — queda [ABIERTO] (0 no es "sin IVA", es "desconocido").
 *
 * NO escribe, NO persiste. RPC construir es CLASE PREGUNTA → sin ui_handler.
 * Publica modelo-303.construir.response y su par .failed.
 * Escucha contabilidad.asiento_asentado (B2) y contabilidad.ejercicio_cerrado (C4), ambos emitidos.
 * Ver hoja D2 del plan-construccion y diseno-oop.md (CLASE Modelo303).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// El mapeo por defecto de los BLOQUES del 303 a los campos de la liquidacion (estructura, no ley).
// Los casilleros numericos concretos son DATO declarable (no se cablean).
const BLOQUES = [
  { casilla: 'devengado_repercutido', de: 'devengado' },
  { casilla: 'soportado_deducible', de: 'soportado' },
  { casilla: 'resultado_regimen_general', de: 'resultado' }
];

class Modelo303 extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'modelo-303';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onConstruirRequest(e) {
    return this._atender(e, 'construir', 'modelo-303.construir.response', async (d) => {
      const res = await this._construir(d);
      if (res.status !== 200) this.eventBus?.publish('modelo-303.construir.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): se observa el libro (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    this._cierres = this._cierres || [];
    if (d.estado === 'cerrado') this._cierres.push(d);
    if (this._cierres.length > 100) this._cierres.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // construir(input) → { casillas, liquidacion, abierto }
  // ══════════════════════════════════════════════════════════════════════
  async _construir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La LIQUIDACION: declarada, o traida por EVENTO de liquidacion-iva (D1).
    const { liquidacion, fuente } = await this._liquidacionDe(input);

    if (!liquidacion) {
      // Sin liquidacion el modelo NO se rellena con ceros: 0 no es "sin IVA", es desconocido.
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'modelo-303',
          periodo: this._periodo(input),
          casillas: [],
          fuente: null,
          total_a_ingresar: null,
          total_a_compensar: null,
          determinista: true,
          abierto: {
            liquidacion: 'no hay liquidacion (ni declarada ni de liquidacion-iva D1): el modelo no se rellena con ceros (0 no es "sin IVA", es desconocido)'
          }
        }
      };
    }

    // Los CASILLEROS: mapeo declarado, o el mapeo por defecto de los bloques del 303 (estructura).
    const casillas = this._casillas(input, liquidacion);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'modelo-303',
        periodo: this._periodo(input),
        fuente,
        casillas,
        total_a_ingresar: liquidacion.a_ingresar != null ? liquidacion.a_ingresar : null,
        total_a_compensar: liquidacion.a_compensar != null ? liquidacion.a_compensar : null,
        // El modelo se DERIVA de la liquidacion; no recablea ningun tipo.
        derivado_de: 'liquidacion-iva',
        tipos_cableados: false,
        determinista: true,
        abierto: {
          casilla: casillas.some((c) => c.valor === null)
            ? 'hay casillas sin valor declarado en la liquidacion: quedan null, no se rellenan'
            : null
        }
      }
    };
  }

  async _liquidacionDe(input) {
    if (input.liquidacion && typeof input.liquidacion === 'object') return { liquidacion: input.liquidacion, fuente: 'declarado' };
    // Declarada por sus cifras basicas.
    if (input.devengado != null || input.soportado != null || input.resultado != null) {
      return {
        liquidacion: {
          devengado: input.devengado != null ? Number(input.devengado) : null,
          soportado: input.soportado != null ? Number(input.soportado) : null,
          resultado: input.resultado != null ? Number(input.resultado)
            : (input.devengado != null && input.soportado != null ? this._round(Number(input.devengado) - Number(input.soportado), 2) : null),
          a_ingresar: input.a_ingresar != null ? Number(input.a_ingresar) : null,
          a_compensar: input.a_compensar != null ? Number(input.a_compensar) : null
        },
        fuente: 'declarado'
      };
    }
    const resp = await this._rpc('liquidacion-iva.calcular.request', {
      project_id: input.project_id || this.project_id,
      fecha: input.fecha, ejercicio: input.ejercicio, periodo: input.periodo
    }, { timeout_ms: 800 });
    if (resp && (resp.devengado != null || resp.resultado != null)) {
      return { liquidacion: resp, fuente: 'liquidacion-iva' };
    }
    return { liquidacion: null, fuente: null };
  }

  // Compone las casillas: mapeo declarado (lista {casilla, campo}) o los bloques por defecto.
  _casillas(input, liq) {
    const mapeo = Array.isArray(input.casillas) ? input.casillas
      : (input.mapeo && Array.isArray(input.mapeo) ? input.mapeo : BLOQUES);
    return mapeo
      .filter((m) => m && typeof m === 'object')
      .map((m) => {
        const casilla = m.casilla != null ? String(m.casilla) : (m.clave != null ? String(m.clave) : null);
        const de = m.de != null ? String(m.de) : (m.campo != null ? String(m.campo) : null);
        const valor = de != null && liq[de] != null ? liq[de] : null;
        return { casilla, de, valor };
      });
  }

  _periodo(input = {}) {
    if (input.periodo != null) return String(input.periodo);
    if (input.trimestre != null) return `T${input.trimestre}`;
    return null;
  }

  // ── Tools ──
  toolConstruir(params) { return this._construir(params); }
}

module.exports = Modelo303;
