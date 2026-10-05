/**
 * nichos/cola-candidatos — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Cola FIFO de candidatos por proyecto. Encola candidatos detectados
 * (manual o automatico via nichos.candidato.detectado) y sirve lotes
 * FIFO por RPC.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/cola-candidatos.json
 *   {
 *     _version, _updated,
 *     cola: {
 *       version:          Int,
 *       items:            [ { id_nicho, payload, encolado_at } ],
 *       total_encolados:  Int
 *     }
 *   }
 *
 * Invariante: FIFO estricto — el primer candidato encolado es el primero
 * en salir.
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. REFLEJO puro.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

function esqueletoVacio() {
  return {
    version: 0,
    items: [],
    total_encolados: 0
  };
}

class ColaCandidatos extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cola-candidatos';
    this.version = '0.1.0';
    this.colaPorProyecto = new Map();   // project_id → esqueleto

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cola-candidatos.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ cola: this.colaPorProyecto.get(pid) || null }),
      hidratar: (pid, data) => {
        if (data && data.cola && typeof data.cola === 'object') {
          this.colaPorProyecto.set(pid, data.cola);
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
  onEncolarRequest(e) {
    return this._atender(e, 'encolar', 'nichos.cola.candidatos.encolar.response', d => this._encolar(d));
  }

  onSacarRequest(e) {
    return this._atender(e, 'sacar', 'nichos.cola.candidatos.sacar.response', d => this._sacar(d));
  }

  // ── F7b: auto-encolar candidatos detectados ──
  onCandidatoDetectado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id || !d.candidato) return;
    this._encolar({
      project_id: d.project_id,
      candidato: d.candidato
    });
  }

  // =============================================================
  // Estado — snapshot por proyecto. Esqueleto vacio si no hay fichero.
  // =============================================================
  _store(project_id) {
    let s = this.colaPorProyecto.get(project_id);
    if (!s) {
      s = esqueletoVacio();
      this.colaPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES — logica pura
  // =============================================================
  _encolar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.candidato) return this._invalid('candidato');

    const store = this._store(input.project_id);
    const id_nicho = input.candidato.id_nicho || input.candidato.id || `cand_${Date.now()}`;

    const item = {
      id_nicho,
      payload: input.candidato,
      encolado_at: nowISO()
    };

    store.items.push(item);
    store.version += 1;
    store.total_encolados += 1;

    this._persist.marcarDirty(input.project_id);

    const posicion = store.items.length;

    this.eventBus?.publish('nichos.candidato.encolado', {
      project_id: input.project_id,
      id_nicho,
      posicion,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: {
        encolado: { id_nicho, posicion }
      }
    };
  }

  _sacar(input) {
    if (!input.project_id) return this._invalid('project_id');

    // El tamaño del lote llega como `n` (canónico de la cola) o `tamano`
    // (el que envía batch-validacion). Se aceptan ambos.
    const crudo = (typeof input.n === 'number' && input.n > 0) ? input.n
      : (typeof input.tamano === 'number' && input.tamano > 0) ? input.tamano
      : 1;
    const n = crudo;
    const store = this._store(input.project_id);

    const lote = store.items.splice(0, n);
    if (lote.length > 0) {
      store.version += 1;
      this._persist.marcarDirty(input.project_id);
    }

    // Devuelve `lote` (canónico) + `candidatos` (alias): el batch-validacion
    // leía `data.candidatos` y nunca veía nada → cola_vacia silenciosa.
    return {
      status: 200,
      data: {
        lote,
        candidatos: lote
      }
    };
  }
}

module.exports = ColaCandidatos;
