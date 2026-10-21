/**
 * nichos/registro-cobros — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Registro append-only de cobros por proyecto. Registra entradas de cobro
 * (EFECTIVO, COMPROMETIDO, DEVUELTO) con referencia unica y sirve
 * consultas filtradas por rango/tipo.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/registro-cobros.json
 *   {
 *     _version, _updated,
 *     registro: {
 *       version:         Int,
 *       entradas:        [ { ref, tipo, importe, moneda, timestamp, por_autor, meta } ],
 *       total_entradas:  Int
 *     }
 *   }
 *
 * Invariante: append-only — las entradas registradas NUNCA se mutan ni
 * se borran.
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. REFLEJO puro.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

const TIPOS_VALIDOS = ['EFECTIVO', 'COMPROMETIDO', 'DEVUELTO'];

function esqueletoVacio() {
  return {
    version: 0,
    entradas: [],
    total_entradas: 0
  };
}

class RegistroCobros extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'registro-cobros';
    this.version = '0.1.0';
    this.registroPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'registro-cobros.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ registro: this.registroPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.registro && typeof data.registro === 'object') {
          this.registroPorProyecto.set(pid, data.registro);
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

  // ── RPC HANDLERS ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'nichos.registro.cobros.registrar.response', d => this._registrar(d));
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.registro.cobros.consultar.response', d => this._consultar(d));
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.registroPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.registroPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura
  // =============================================================
  _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.entrada_cobro || typeof input.entrada_cobro !== 'object') return this._invalid('entrada_cobro');
    if (!input.por_autor) return this._invalid('por_autor');

    const ec = input.entrada_cobro;
    if (!TIPOS_VALIDOS.includes(ec.tipo)) return this._invalid('entrada_cobro.tipo (EFECTIVO|COMPROMETIDO|DEVUELTO)');
    if (typeof ec.importe !== 'number' || ec.importe < 0) return this._invalid('entrada_cobro.importe');

    const store = this._store(input.project_id);

    const ref = `cobro_${Date.now()}_${store.total_entradas}`;

    const entrada = {
      ref,
      tipo: ec.tipo,
      importe: ec.importe,
      moneda: ec.moneda || 'EUR',
      timestamp: nowISO(),
      por_autor: input.por_autor,
      meta: ec.meta || {}
    };

    store.entradas.push(entrada);
    store.version += 1;
    store.total_entradas += 1;

    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.cobro.registrado', {
      id_proyecto: input.project_id,
      tipo: entrada.tipo,
      importe: entrada.importe,
      cobro_ref: ref,
      timestamp: entrada.timestamp
    });

    return {
      status: 200,
      data: {
        ref_cobro: ref
      }
    };
  }

  _consultar(input) {
    if (!input.project_id) return this._invalid('project_id');

    const store = this._store(input.project_id);
    const filtro = input.filtro || {};
    let entradas = store.entradas.slice();

    // Filtrar por tipo
    if (filtro.tipo && TIPOS_VALIDOS.includes(filtro.tipo)) {
      entradas = entradas.filter(e => e.tipo === filtro.tipo);
    }

    // Filtrar por rango de fechas
    if (filtro.desde) {
      const desde = new Date(filtro.desde).getTime();
      entradas = entradas.filter(e => new Date(e.timestamp).getTime() >= desde);
    }
    if (filtro.hasta) {
      const hasta = new Date(filtro.hasta).getTime();
      entradas = entradas.filter(e => new Date(e.timestamp).getTime() <= hasta);
    }

    return {
      status: 200,
      data: {
        entradas
      }
    };
  }
}

module.exports = RegistroCobros;
