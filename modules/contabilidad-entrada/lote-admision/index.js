/**
 * contabilidad-entrada/lote-admision — REFLEJO STATELESS (A9, hoja del plan).
 *
 * DESACOPLE DEL CUELLO: N hechos en paralelo. El paralelismo es de ADMISION;
 * la ESCRITURA sigue unica (la hace escritor-diario B2, single-writer del libro).
 *
 * Esta hoja NO escribe el libro ni normaliza: REPARTE el lote y SUBE cada elemento
 * por EVENTO a quien le toca (normalizador-hecho A2 y, si el elemento ya trae su
 * asiento, escritor-diario B2). El reflejo decide y declara; el trabajo lo hacen
 * los custodios por su propio camino.
 *
 * Invariantes:
 *  - SIN lote declarado NO se admite nada (dato ausente = desconocido): no se fabrica un lote vacio.
 *  - UN solo escritor del libro: la admision encola contra `escritor-diario`, no escribe ella.
 *  - `paralelo` es un HECHO de la admision (cuantas ramas se abrieron), no una promesa.
 *  - Determinista: mismo lote → mismo reparto.
 *
 * R3 · ESCUCHA: el plan declara `—` (ninguno); no se anade ninguna sin emisor.
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja A9 del plan-construccion y diseno-oop.md (CLASE LoteAdmision).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class LoteAdmision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lote-admision';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'lote-admision.admitir.response', async (d) => {
      const res = this._admitir(d);
      // Reflejo: reparte y declara; no escribe el libro → no hay hecho de dominio que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('lote-admision.admitir.failed', res);
      else this._encolar(res, d);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // admitir(lote) → reparto del lote (paralelismo de ADMISION)
  // ══════════════════════════════════════════════════════════════════════
  _admitir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const lote = Array.isArray(input.lote) ? input.lote
      : (Array.isArray(input.hechos) ? input.hechos
        : (Array.isArray(input.elementos) ? input.elementos : null));
    if (lote === null) return this._invalid('lote');

    const elementos = lote.filter((h) => h && typeof h === 'object');
    const descartados = lote.length - elementos.length;

    // El reparto es determinista: cada elemento se admite con su indice (su rama).
    const ramas = elementos.map((hecho, i) => ({
      indice: i,
      hecho,
      destino: input.destino != null ? String(input.destino) : 'normalizador-hecho',
      con_asiento: Boolean(hecho.asiento)
    }));

    return {
      status: 200,
      data: {
        project_id: pid,
        admitidos: ramas.length,
        descartados,
        paralelo: ramas.length > 1,
        ramas,
        // Un solo escritor del libro: la admision NO asienta; encola contra escritor-diario.
        escritura: 'unica (escritor-diario)',
        determinista: true,
        abierto: {
          lote: ramas.length ? null : 'el lote no traia elementos declarados (no se admite nada, no se inventa)',
          descartados: descartados ? `${descartados} elemento(s) sin forma de objeto fueron descartados` : null
        }
      }
    };
  }

  // SUBE (best-effort) cada rama por EVENTO: el trabajo lo hacen los custodios, no esta hoja.
  _encolar(res, d) {
    const pid = res.data.project_id;
    for (const rama of res.data.ramas) {
      try {
        this.eventBus?.publish('normalizador-hecho.entrar.request', {
          project_id: pid,
          hecho: rama.hecho,
          correlation_id: d.correlation_id
        });
        // Solo encola contra el libro si el elemento YA DECLARA su asiento: no se inventa un apunte.
        if (rama.con_asiento) {
          this.eventBus?.publish('escritor-diario.asentar.request', {
            project_id: pid,
            asiento: rama.hecho.asiento,
            origen: 'lote-admision',
            correlation_id: d.correlation_id
          });
        }
      } catch (_) { /* best-effort */ }
    }
  }

  // ── Tools ──
  toolAdmitir(params) { return this._admitir(params); }
}

module.exports = LoteAdmision;
