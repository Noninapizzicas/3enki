/**
 * nichos/confirmacion-valor — CUSTODIO CON PERSISTENCIA (I3, hoja del plan).
 *
 * Recoge el FEEDBACK POST-COMPRA / el VALOR que el pagador recibio de verdad
 * del nicho: confirma que el valor prometido en la propuesta se materializo
 * (o en que grado). Lo consumen la salud financiera (F3) y el canal para
 * cerrar el circulo de la propuesta de valor.
 *
 * HIBRIDO CUSTODIO (patrón real de perfil-supervision):
 *   _ingestar   — REFLEJO: estructura el feedback crudo del canal (sintetiza
 *                 valor_recibido/puntuacion/comentario) SIN guardar.
 *   _guardar    — CUSTODIO: escribe en el store de feedback del proyecto
 *                 (single-writer; append de confirmaciones por nicho).
 *   _consultar  — lectura (no muta).
 * PosPersistencia per-proyecto (storage /prisma/nichos/confirmacion-valor.json),
 * restaura en project.activated y vuelca en onUnload. Emisor/par de fallo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor del store de feedback — el CUSTODIO (ingle el reflejo).
const ROL_CUSTODIO = 'CUSTODIO';

// Shape de una confirmacion de valor del pagador de un nicho.
function confirmacionVacia() {
  return {
    esquema: 'nichos-confirmacion-valor-v1',
    nicho: null,
    valor_recibido: null,   // 'alto' | 'medio' | 'bajo'
    puntuacion: null,        // 1-5
    comentario: null,
    recibido_el: null
  };
}

// Normalizador de puntuacion entera 1-5 (o null si no trae valor valido).
function numPuntuacion(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

const VALORES_VALIDOS = new Set(['alto', 'medio', 'bajo']);

class ConfirmacionValor extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'confirmacion-valor';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> Map<nicho, Array<confirmacion>>
    this._feedback = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'confirmacion-valor.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const m = this._feedback.get(pid);
        if (!m || m.size === 0) return null;
        return { project_id: pid, feedback: Object.fromEntries(m) };
      },
      hidratar: (pid, data) => {
        if (data && data.feedback) {
          const m = new Map();
          for (const [nicho, arr] of Object.entries(data.feedback)) m.set(nicho, arr);
          this._feedback.set(pid, m);
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el store de feedback del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onIngestarRequest(e) {
    return this._atender(e, 'ingestar', 'nichos.feedback.ingestar.response', (d) => {
      const res = this._ingestar(d);
      if (res.status !== 200) this.eventBus?.publish('nichos.feedback.guardar.failed', res);
      return res;
    });
  }

  onGuardarRequest(e) {
    return this._atender(e, 'guardar', 'nichos.feedback.guardar.response', async (d) => {
      const res = await this._guardar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.feedback_recibido', {
          project_id: res.data.project_id,
          nicho: res.data.nicho,
          valor_recibido: res.data.valor_recibido,
          puntuacion: res.data.puntuacion,
          comentario: res.data.comentario,
          confirmado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.feedback.guardar.failed', res);
      }
      return res;
    });
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.feedback.consultar.response', (d) => this._consultar(d));
  }

  // ── helpers de store ──
  _obtenerOCrear(pid) {
    let m = this._feedback.get(pid);
    if (!m) {
      m = new Map();
      this._feedback.set(pid, m);
      this._persist.marcarDirty(pid);
    }
    return m;
  }

  // ── REFLEJO (proyeccion pura): estructura el feedback crudo del canal ──
  _ingestar({ project_id, nicho, feedback_crudo } = {}) {
    const pid = project_id || this.project_id;
    if (!pid) return this._invalid('project_id');
    if (!nicho || typeof nicho !== 'string') return this._invalid('nicho');
    if (!feedback_crudo || typeof feedback_crudo !== 'object') {
      return this._errorResponse(400, 'FEEDBACK_VACIO', 'el feedback crudo es obligatorio y debe ser un objeto', { project_id: pid });
    }
    // Sintetiza: puntuacion si trae comentario o nota; valor de la puntuacion.
    const puntuacion = numPuntuacion(feedback_crudo.puntuacion ?? feedback_crudo.nota ?? feedback_crudo.rating);
    let valor = feedback_crudo.valor_recibido ?? null;
    if (valor == null && puntuacion != null) {
      valor = puntuacion >= 4 ? 'alto' : puntuacion >= 3 ? 'medio' : 'bajo';
    }
    if (valor === null) return this._invalid('feedback_crudo.valor_recibido o puntuacion');
    if (!VALORES_VALIDOS.has(valor)) return this._invalid('feedback_crudo.valor_recibido');
    return {
      status: 200,
      data: {
        project_id: pid,
        nicho,
        valor_recibido: valor,
        puntuacion,
        comentario: feedback_crudo.comentario || null,
        estructurado: true
      }
    };
  }

  // ── CUSTODIO (proyeccion de escritura, single-writer) ──
  _guardar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    // Si viene un feedback crudo (no estructurado) lo estructuras primero.
    let fb = input.feedback;
    if (fb && fb.feedback_crudo && !fb.valor_recibido) {
      const ing = this._ingestar({ project_id: pid, nicho: input.nicho, feedback_crudo: fb.feedback_crudo });
      if (ing.status !== 200) return ing;
      fb = ing.data;
    }
    if (!fb || typeof fb !== 'object') return this._invalid('feedback');
    if (!input.nicho && !fb.nicho) return this._invalid('nicho');
    const nicho = input.nicho || fb.nicho;
    const valor = fb.valor_recibido;
    if (!VALORES_VALIDOS.has(valor)) return this._invalid('feedback.valor_recibido');
    const puntuacion = numPuntuacion(fb.puntuacion);

    const store = this._obtenerOCrear(pid);
    const lista = store.get(nicho) || [];
    const confirmacion = confirmacionVacia();
    confirmacion.nicho = nicho;
    confirmacion.valor_recibido = valor;
    confirmacion.puntuacion = puntuacion;
    confirmacion.comentario = fb.comentario || null;
    confirmacion.recibido_el = new Date().toISOString();
    lista.push(confirmacion);
    store.set(nicho, lista);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        nicho,
        valor_recibido: valor,
        puntuacion,
        comentario: confirmacion.comentario,
        confirmado: true,
        total: lista.length
      }
    };
  }

  // ── lectura (no muta) ──
  _consultar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const store = this._feedback.get(pid);
    if (input.nicho) {
      const lista = (store && store.get(input.nicho)) || [];
      return { status: 200, data: { project_id: pid, nicho: input.nicho, feedback: lista } };
    }
    const m = store || new Map();
    return { status: 200, data: { project_id: pid, feedback: Object.fromEntries(m) } };
  }

  // ── Tools ──
  toolIngestar(params) { return this._ingestar(params); }
  toolGuardar(params) { return this._guardar(params); }
  toolConsultar(params) { return this._consultar(params); }
}

module.exports = ConfirmacionValor;
