/**
 * contabilidad-entrada/completitud-cobertura — REFLEJO STATELESS (A12, hoja del plan).
 *
 * **LA METRICA UNICA** de cobertura. Mide que hechos publico una vertical y cuales NO
 * llegaron; produce LA Cobertura. Las demas senales (SelloCobertura Q3, AvisoCuadre C6,
 * TasaCoberturaEntrada P4) la LEEN — no la recalculan (invariante 8, conflicto 2 resuelto).
 *
 * Invariante 7 (dato ausente = desconocido): nada se estima. Lo que no llego es HUECO
 * DECLARADO (`huecos`), no un cero silencioso; y si no hay expectativa declarada, la
 * tasa es `null` (no 0: un 0 afirmaria una medida que no se hizo).
 *
 * La expectativa viene DECLARADA (`esperados`) o, en su defecto, del minimo declarado por
 * la fuente (contrato-hecho-minimo A11, consultado POR EVENTO). Sin contrato declarado, la
 * cobertura se declara `declarada:false` con tasa null — jamas se inventa la expectativa.
 *
 * Es determinista: misma entrada (esperados + llegados) → misma Cobertura. Cero estado,
 * cero reloj en el calculo.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A12 del plan-construccion y diseno-oop.md (CLASE CompletitudCobertura).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CompletitudCobertura extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'completitud-cobertura';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onMedirRequest(e) {
    return this._atender(e, 'medir', 'completitud-cobertura.medir.response', async (d) => {
      const res = await this._medir(d);
      if (res.status === 200) {
        // Exito → LA metrica unica: las demas senales la LEEN (no la recalculan).
        this.eventBus?.publish('contabilidad.cobertura_medida', {
          project_id: res.data.project_id,
          vertical: res.data.vertical,
          cobertura: res.data.cobertura,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('completitud-cobertura.medir.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: medir(esperados, llegados) → Cobertura ──
  async _medir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : null;

    let esperados = this._lista(input.esperados);
    let origen_esperados = esperados ? 'declarado' : null;

    // Sin expectativa declarada: se consulta el minimo de la fuente POR EVENTO (A11).
    // Si no responde o no hay contrato, NO se inventa la expectativa.
    if (!esperados) {
      const r = await this._rpc('contrato-hecho-minimo.exigir.request',
        { project_id: pid, vertical }, { timeout_ms: 4000 });
      const data = r && r.data ? r.data : null;
      if (data && data.declarado && Array.isArray(data.campos)) {
        esperados = this._lista(data.campos);
        origen_esperados = 'contrato-hecho-minimo';
      }
    }

    const llegados = this._lista(input.llegados) || [];

    // Sin expectativa: la cobertura se declara no-declarada (tasa null, sin cero falso).
    if (!esperados) {
      return {
        status: 200,
        data: {
          project_id: pid,
          vertical,
          cobertura: {
            declarada: false,
            esperados: null,
            llegados: llegados.length,
            cubiertos: null,
            huecos: null,
            tasa: null,
            completa: false
          },
          origen_esperados: null,
          motivo: 'no hay expectativa declarada (ni esperados en la peticion ni contrato de la fuente)'
        }
      };
    }

    // Medida determinista por CLAVE: cubiertos = esperados presentes en llegados.
    const conjuntoLlegados = new Set(llegados);
    const cubiertos = esperados.filter(e => conjuntoLlegados.has(e));
    // Lo ausente es HUECO DECLARADO (en orden de la expectativa, determinista).
    const huecos = esperados.filter(e => !conjuntoLlegados.has(e));
    const tasa = esperados.length === 0 ? 1 : this._round(cubiertos.length / esperados.length, 4);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        cobertura: {
          declarada: true,
          esperados: esperados.length,
          llegados: llegados.length,
          cubiertos: cubiertos.length,
          huecos,
          tasa,
          completa: huecos.length === 0,
          // Lo de mas (llego sin estar esperado) tambien se declara, no se oculta.
          no_esperados: llegados.filter(l => !esperados.includes(l))
        },
        origen_esperados
      }
    };
  }

  // Lista de claves declarada; no-lista → null (ausencia honesta, no []).
  _lista(raw) {
    if (!Array.isArray(raw)) return null;
    return raw.map(k => String(k)).filter(k => k.length > 0);
  }

  // ── Tools ──
  toolMedir(params) { return this._medir(params); }
}

module.exports = CompletitudCobertura;
