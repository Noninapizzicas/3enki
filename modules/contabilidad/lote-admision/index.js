/**
 * contabilidad/lote-admision — REFLEJO STATELESS (A9, hoja del plan).
 *
 * DESACOPLE del cuello: la admision NO se hace en serie. Toma la cola de hechos
 * y la trocea en LOTES de tamano `paralelismo` (declarable) para que N hechos
 * entren en paralelo y la serie no atasque el embudo. Mecanico, CERO juicio:
 * misma entrada → mismos lotes (determinista, un test lo afirma).
 *
 * REFLEJO (patron real, stateless): sin PosPersistencia ni project.activated —
 * no guarda estado. Cada op entra objeto, sale objeto. Lo consumen AMBAS puertas
 * (la de hechos y la de documentos): el lote es el mismo empujon para las dos.
 * Publica contabilidad.lote_despachado (+ contabilidad.lote.despachar.failed par
 * determinista). NO REUTILIZA: el paralelismo declarable de la admision no
 * existe en el inventario.
 *
 * Ver hoja A9 del diseno-oop y bloque `lote-admision` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Paralelismo por defecto (declarable via payload; [ABIERTO] como parametro).
const PARALELISMO_DEFECTO = 8;

class LoteAdmision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lote-admision';
    this.version = 'reflejo-0.1.0';
    // Reflejo stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC ──
  onDespacharRequest(e) {
    return this._atender(e, 'despachar', 'contabilidad.lote.despachar.response', async (d) => {
      const res = this._despachar(d);
      if (res.status === 200) {
        // Un evento de dominio por cada lote despachado (fire-and-forget).
        for (const lote of res.data.lotes) {
          this.eventBus?.publish('contabilidad.lote_despachado', {
            project_id: res.data.project_id,
            lote_id: lote.lote_id,
            hechos: lote.hechos,
            n: lote.hechos.length,
            paralelismo: res.data.paralelismo,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('contabilidad.lote.despachar.failed', res);
      }
      return res;
    });
  }

  // ── proyecciones puras (deterministas) ──
  // lotear(cola) -> List<Lote>  (N hechos en paralelo; mecanico, cero juicio).
  _lotear(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const hechos = Array.isArray(input && input.hechos) ? input.hechos : null;
    if (!hechos) return this._invalid('hechos');

    const p = Number(input && input.paralelismo);
    const paralelismo = Number.isFinite(p) && p > 0 ? Math.floor(p) : PARALELISMO_DEFECTO;

    const lotes = [];
    for (let i = 0; i < hechos.length; i += paralelismo) {
      const trozo = hechos.slice(i, i + paralelismo);
      lotes.push({
        lote_id: `${pid}-lote-${lotes.length + 1}`,
        hechos: trozo
      });
    }
    return { status: 200, data: { project_id: pid, paralelismo, lotes, total: hechos.length } };
  }

  // despachar(lote) -> ok — consumido por AMBAS puertas (hechos y documentos).
  _despachar(input) {
    return this._lotear(input);
  }

  // ── Tools ──
  toolLotear(params) { return this._lotear(params); }
  toolDespachar(params) { return this._despachar(params); }
}

module.exports = LoteAdmision;
