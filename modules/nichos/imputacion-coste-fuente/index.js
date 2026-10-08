/**
 * nichos/imputacion-coste-fuente — REFLEJO append-only (bloque J).
 *
 * Registra y agrega el coste imputado por consumo de fuentes externas.
 * Cada consumo queda como entrada con importe, fuente e instante.
 * Consulta agrega coste por proyecto/fuente hasta un instante dado.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/costes-fuente.json
 *   {
 *     _version, _updated,
 *     costes: {
 *       entradas: [
 *         { fuente, importe, concepto?, registrado_en: ISO }
 *       ]
 *     }
 *   }
 *
 * Convenio: las entradas son append-only. No se borran. La consulta filtra
 * por 'hasta' (ISO); sin 'hasta', agrega todo.
 *
 * Patrón: ModuloHibridoReflejo + PosPersistencia. Sin mitad blueprint.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

function esqueletoVacio() {
  return {
    entradas: []
  };
}

class ImputacionCosteFuente extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'imputacion-coste-fuente';
    this.version = '0.1.0';
    this.costesPorProyecto = new Map(); // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'costes-fuente.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ costes: this.costesPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.costes && typeof data.costes === 'object') {
          this.costesPorProyecto.set(pid, data.costes);
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── RPC HANDLER ──
  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.fuente.coste.consultar.response', d => this._consultar(d));
  }

  // ── FIRE-AND-FORGET ──
  onFuenteConsumida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.fuente) return;
    this._registrar(d);
  }

  // =============================================================
  // Estado — snapshot por proyecto
  // =============================================================
  _costes(project_id) {
    let c = this.costesPorProyecto.get(project_id);
    if (!c) {
      c = esqueletoVacio();
      this.costesPorProyecto.set(project_id, c);
    }
    return c;
  }

  // =============================================================
  // PROYECCIONES
  // =============================================================
  _consultar(input) {
    if (!input.id_proyecto && !input.project_id) return this._invalid('id_proyecto');

    const project_id = input.id_proyecto || input.project_id;
    const costes = this._costes(project_id);
    const hasta = input.hasta ? new Date(input.hasta).getTime() : Infinity;

    const filtradas = costes.entradas.filter(e => {
      return new Date(e.registrado_en).getTime() <= hasta;
    });

    let total = 0;
    const por_fuente = {};
    for (const e of filtradas) {
      const importe = typeof e.importe === 'number' ? e.importe : 0;
      total += importe;
      por_fuente[e.fuente] = this._round((por_fuente[e.fuente] || 0) + importe, 4);
    }

    return {
      status: 200,
      data: {
        coste: {
          total: this._round(total, 4),
          por_fuente,
          entradas_count: filtradas.length
        }
      }
    };
  }

  _registrar(input) {
    const project_id = input.project_id;
    const costes = this._costes(project_id);
    const importe = typeof input.importe === 'number' ? input.importe : 0;

    const entrada = {
      fuente: input.fuente,
      importe,
      concepto: input.concepto || null,
      registrado_en: nowISO()
    };

    costes.entradas.push(entrada);
    this._persist.marcarDirty(project_id);
  }
}

module.exports = ImputacionCosteFuente;
