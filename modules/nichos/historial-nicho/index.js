/**
 * nichos/historial-nicho — CUSTODIO CON PERSISTENCIA (L4, hoja del plan).
 *
 * Registro APPEND-ONLY e inmutable de los ESTADOS y DECISIONES que cada nicho
 * ha recorrido en el pipeline. Es la memoria de auditoría de un nicho: nadie
 * borra ni muta una entrada una vez escrita; solo se anade al final.
 *
 * SINGLE-WRITER: el único escritor del historial es el pipeline-por-nicho (L1),
 * el dueño de la máquina de estados. Cualquier otra escritura se rechaza (guard
 * de rol por evento [ABIERTO]; aqui el pipeline es el escritor declarado).
 *
 * PosPersistencia per-proyecto (storage /prisma/nichos/historial-nicho.json),
 * restaura en project.activated y vuelca en onUnload. Emisor/par de fallo.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol único escritor — el pipeline-por-nicho (dueño de la máquina de estados).
const ROL_PIPELINE = 'PIPELINE';

// Shape de una entrada del historial de un nicho.
function entradaVacia() {
  return {
    esquema: 'nichos-historial-nicho-v1',
    nicho: null,
    estado: null,      // estado del pipeline al que se transiciono
    decision: null,    // decision asociada (opcional)
    evento: null,      // evento que disparo la transicion (opcional)
    en_el: null        // timestamp append-only (inmutable)
  };
}

class HistorialNicho extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'historial-nicho';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> Map<nicho, Array<entrada>>
    this._historial = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'historial-nicho.json',
      dir: '/prisma/nichos',
      snapshot: (pid) => {
        const m = this._historial.get(pid);
        if (!m || m.size === 0) return null;
        return { project_id: pid, historial: Object.fromEntries(m) };
      },
      hidratar: (pid, data) => {
        if (data && data.historial) {
          const m = new Map();
          for (const [nicho, arr] of Object.entries(data.historial)) m.set(nicho, arr);
          this._historial.set(pid, m);
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el historial del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una línea, delegan a _atender) ──
  onAppendRequest(e) {
    return this._atender(e, 'append', 'nichos.historial.append.response', async (d) => {
      const res = await this._appendUnico(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.historial_actualizado', {
          project_id: res.data.project_id,
          nicho: res.data.nicho,
          entrada: res.data.entrada,
          total: res.data.total,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.historial.append.failed', res);
      }
      return res;
    });
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'nichos.historial.consultar.response', (d) => this._consultar(d));
  }

  // ── helpers de store ──
  _obtenerOCrear(pid) {
    let m = this._historial.get(pid);
    if (!m) {
      m = new Map();
      this._historial.set(pid, m);
      this._persist.marcarDirty(pid);
    }
    return m;
  }

  // ── CUSTODIO: anade una entrada (append-only inmutable, single-writer) ──
  _appendUnico(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    // GUARD de escritor: solo el pipeline puede escribir el historial.
    if (input.rol !== ROL_PIPELINE) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo el PIPELINE (dueño de la maquina) puede anadir al historial del nicho', {
        rol_esperado: ROL_PIPELINE, rol_recibido: input.rol
      });
    }
    if (!input.nicho || typeof input.nicho !== 'string') return this._invalid('nicho');
    if (!input.estado || typeof input.estado !== 'string') return this._invalid('estado');

    const store = this._obtenerOCrear(pid);
    const lista = store.get(input.nicho) || [];
    const entrada = entradaVacia();
    entrada.nicho = input.nicho;
    entrada.estado = input.estado;
    entrada.decision = input.decision || null;
    entrada.evento = input.evento || null;
    entrada.en_el = new Date().toISOString();
    lista.push(entrada);
    store.set(input.nicho, lista);
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        nicho: input.nicho,
        entrada,
        total: lista.length,
        anadido: true
      }
    };
  }

  // ── lectura (no muta) ──
  _consultar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const store = this._historial.get(pid);
    if (input.nicho) {
      const lista = (store && store.get(input.nicho)) || [];
      return { status: 200, data: { project_id: pid, nicho: input.nicho, historial: lista } };
    }
    const m = store || new Map();
    return { status: 200, data: { project_id: pid, historial: Object.fromEntries(m) } };
  }

  // ── Tools ──
  toolAppendUnico(params) { return this._appendUnico(params); }
  toolConsultar(params) { return this._consultar(params); }
}

module.exports = HistorialNicho;
