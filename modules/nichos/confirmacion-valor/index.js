/**
 * nichos/confirmacion-valor — REFLEJO JS (CUSTODIO del vertical NICHOS).
 *
 * Store append-only de feedback por proyecto. Ingiere feedback crudo
 * (por RPC o automaticamente desde el canal via F7b) y lo consulta como
 * cronologia ordenada.
 *
 * Store (per-proyecto, PosPersistencia): /prisma/pos/nichos/confirmacion-valor.json
 *   { _version, _updated, entradas: [ {id, feedback_crudo, fuente, at} ] }
 *
 * Dos RPCs:
 *   nichos.feedback.ingerir   — append de una entrada.
 *   nichos.feedback.consultar — leer la cronologia del proyecto.
 *
 * F7b: nichos.canal.mensaje.recibido — ingiere feedback automaticamente.
 *
 * Patron: ModuloHibridoReflejo + PosPersistencia. Sin mitad blueprint.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

class ConfirmacionValor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'confirmacion-valor';
    this.version = '0.1.0';
    this.entradasPorProyecto = new Map(); // project_id → { entradas: [] }

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'confirmacion-valor.json',
      dir: '/prisma/pos/nichos',
      snapshot: (pid) => ({ entradas: (this.entradasPorProyecto.get(pid) || {}).entradas || [] }),
      hidratar: (pid, data) => {
        if (data && Array.isArray(data.entradas)) {
          this.entradasPorProyecto.set(pid, { entradas: data.entradas });
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
  onIngerirRequest(e) {
    return this._atender(e, 'ingerir', 'nichos.feedback.ingerir.response', d => this._ingerir(d));
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.feedback.consultar.response', d => this._consultar(d));
  }

  // ── FIRE-AND-FORGET: ingiere feedback del canal (F7b) ──
  onMensajeRecibido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return;
    if (!d.mensaje_entrante && !d.texto) return;

    this._ingerir({
      project_id: d.project_id,
      feedback_crudo: d.mensaje_entrante || d.texto,
      fuente: 'canal'
    });
  }

  // =============================================================
  // Estado — entradas por proyecto
  // =============================================================
  _store(project_id) {
    let s = this.entradasPorProyecto.get(project_id);
    if (!s) {
      s = { entradas: [] };
      this.entradasPorProyecto.set(project_id, s);
    }
    return s;
  }

  // =============================================================
  // PROYECCIONES
  // =============================================================
  _ingerir(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.feedback_crudo) return this._invalid('feedback_crudo');

    const store = this._store(input.project_id);
    const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entrada = {
      id,
      feedback_crudo: input.feedback_crudo,
      fuente: input.fuente || 'rpc',
      at: nowISO()
    };

    store.entradas.push(entrada);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('nichos.feedback.ingerido', {
      id_proyecto: input.project_id,
      entrada_ref: id,
      timestamp: nowISO()
    });

    return {
      status: 200,
      data: { entrada_feedback: entrada }
    };
  }

  _consultar(input) {
    if (!input.proyecto && !input.project_id) return this._invalid('proyecto');

    const projectId = input.proyecto || input.project_id;
    const store = this._store(projectId);

    return {
      status: 200,
      data: { entradas: store.entradas }
    };
  }
}

module.exports = ConfirmacionValor;
