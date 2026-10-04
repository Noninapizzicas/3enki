/**
 * nichos/gestion-limites-fuente — REFLEJO + CUSTODIO ligero (bloque J).
 *
 * Gestiona el presupuesto de consumo por fuente externa y proyecto.
 * Pre-check de si una fuente puede consumirse (hay margen) y descuento
 * tras consumo efectivo.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/limites-fuente.json
 *   {
 *     _version, _updated,
 *     limites: {
 *       por_fuente: {
 *         '<nombre_fuente>': {
 *           presupuesto:    Number,
 *           consumido:      Number,
 *           ventana_inicio: ISO,
 *           ventana_fin:    ISO
 *         }
 *       }
 *     }
 *   }
 *
 * Convenio de ventana: fuera de ventana → resetea consumido a 0, abre nueva.
 * Fuente sin presupuesto declarado → puede=true, margen=Infinity (abierto).
 *
 * Patrón: ModuloHibridoReflejo + PosPersistencia. Sin mitad blueprint.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();
const VENTANA_DEFAULT_MS = 3600 * 1000; // 1 hora por defecto

function esqueletoVacio() {
  return {
    por_fuente: {}
  };
}

class GestionLimitesFuente extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gestion-limites-fuente';
    this.version = '0.1.0';
    this.limitesPorProyecto = new Map(); // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'limites-fuente.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ limites: this.limitesPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.limites && typeof data.limites === 'object') {
          this.limitesPorProyecto.set(pid, data.limites);
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
  onPuedeConsumirRequest(e) {
    return this._atender(e, 'puedeConsumir', 'nichos.fuente.limites.puede.consumir.response', d => this._puedeConsumir(d));
  }

  // ── FIRE-AND-FORGET ──
  onCosteRegistrado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.fuente) return;
    this._descontar(d);
  }

  // =============================================================
  // Estado — snapshot por proyecto
  // =============================================================
  _limites(project_id) {
    let l = this.limitesPorProyecto.get(project_id);
    if (!l) {
      l = esqueletoVacio();
      this.limitesPorProyecto.set(project_id, l);
    }
    return l;
  }

  _entradaFuente(limites, fuente) {
    return limites.por_fuente[fuente] || null;
  }

  _dentroDeVentana(entrada) {
    if (!entrada || !entrada.ventana_fin) return false;
    return new Date().getTime() < new Date(entrada.ventana_fin).getTime();
  }

  _resetearVentanaSiNecesario(entrada) {
    if (!entrada) return;
    if (!this._dentroDeVentana(entrada)) {
      const ahora = new Date();
      entrada.consumido = 0;
      entrada.ventana_inicio = ahora.toISOString();
      entrada.ventana_fin = new Date(ahora.getTime() + VENTANA_DEFAULT_MS).toISOString();
    }
  }

  // =============================================================
  // PROYECCIONES
  // =============================================================
  _puedeConsumir(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.fuente) return this._invalid('fuente');

    const limites = this._limites(input.project_id);
    const entrada = this._entradaFuente(limites, input.fuente);

    // Fuente sin presupuesto declarado → abierta.
    if (!entrada || entrada.presupuesto == null) {
      return {
        status: 200,
        data: { puede: true, margen: Infinity }
      };
    }

    this._resetearVentanaSiNecesario(entrada);

    const margen = this._round(entrada.presupuesto - entrada.consumido, 4);
    return {
      status: 200,
      data: {
        puede: margen > 0,
        margen: Math.max(0, margen)
      }
    };
  }

  _descontar(input) {
    const limites = this._limites(input.project_id);
    const fuente = input.fuente;
    const importe = typeof input.importe === 'number' ? input.importe : 0;

    if (!limites.por_fuente[fuente]) {
      // Auto-vivificar la entrada con presupuesto abierto.
      const ahora = new Date();
      limites.por_fuente[fuente] = {
        presupuesto: null,
        consumido: 0,
        ventana_inicio: ahora.toISOString(),
        ventana_fin: new Date(ahora.getTime() + VENTANA_DEFAULT_MS).toISOString()
      };
    }

    const entrada = limites.por_fuente[fuente];
    this._resetearVentanaSiNecesario(entrada);
    entrada.consumido = this._round((entrada.consumido || 0) + importe, 4);

    this._persist.marcarDirty(input.project_id);

    const margen_restante = entrada.presupuesto != null
      ? this._round(Math.max(0, entrada.presupuesto - entrada.consumido), 4)
      : Infinity;

    this.eventBus?.publish('nichos.fuente.consumida', {
      project_id: input.project_id,
      fuente,
      importe,
      margen_restante,
      timestamp: nowISO()
    });
  }
}

module.exports = GestionLimitesFuente;
