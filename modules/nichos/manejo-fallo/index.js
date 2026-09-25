/**
 * nichos/manejo-fallo — PUENTE STATELESS (L3, hoja del plan).
 *
 * Gestiona el fallo del ciclo del pipeline: ante un fallo (enviar del canal a
 * traves de nichos.canal.envio_fallido, o un fallo declarado del pipeline via
 * RPC) intenta un REINTENTO MECANICO hasta un maximo [ABIERTO]; si se agota la
 * alternativa o el fallo no es reintentable → DERIVA a puente humano (D2) por
 * evento (publica nichos.puente_solicitado con paquete cerrado). Reintento
 * mecanico ANTES de escalar a humano (regla de la hoja L3).
 *
 * PUENTE (patrón real, stateless): sin PosPersistencia; solo cuenta intentos en
 * memoria (Map fallo_id -> intentos). Cada op entra objeto, sale objeto. Comunica
 * con el exterior (canal-supervision G1 / puente-humano D2) por evento, nunca con
 * un vendor concreto. Publica nichos.fallo_manejado (+ nichos.fallo.manejar.failed
 * par determinista). Ver hoja L3 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Maximo de reintentos mecanicos antes de escalar a humano ([ABIERTO]).
const MAX_REINTENTOS = 3;

// Fallos no reintentables: son permanentes/invalidos → derivan directo a humano.
const NO_REINTENTABLES = new Set([
  'UPSTREAM_UNREACHABLE',   // recurso inexistente
  'PERMISSION_DENIED',      // sin permiso → accion humana
  'INVALID_INPUT'           // payload corrupto → revision humana
]);

class ManejoFallo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'manejo-fallo';
    this.version = 'reflejo-0.1.0';
    // Contadores de reintento por fallo (puente stateless: solo memoria).
    this._intentos = new Map();
    this.project_id = null;
  }

  async onUnload() { return super.onUnload(); }

  // project.activated — puente sin estado: solo registra el proyecto activo.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.bridge.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  // ── handler RPC (una línea, delega a _atender / fire-and-forget) ──
  onManejarRequest(e) {
    return this._atender(e, 'manejar', 'nichos.fallo.manejar.response', (d) => {
      const res = this._manejar(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.fallo_manejado', res.data);
      } else {
        this.eventBus?.publish('nichos.fallo.manejar.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: un envío del canal falló (canal-supervision G1) → maneja.
  onEnvioFallido(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._manejar({
      project_id: d.project_id || this.project_id,
      fallo: d.fallo || { tipo: 'CANAL_ENVIO', codigo: d.code || d.error?.code || 'UPSTREAM_UNREACHABLE', mensaje: d.mensaje || d.message },
      origen: 'canal'
    });
    if (res.status === 200) {
      this.eventBus?.publish('nichos.fallo_manejado', res.data);
    } else {
      this.eventBus?.publish('nichos.fallo.manejar.failed', res);
    }
    return res;
  }

  // ── proyecciones puras (puente stateless) ──
  // Reintento mecanico: incrementa el contador; si se agota → deriva a humano.
  _reintentarMecanico(fallo) {
    const id = (fallo && fallo.id) || 'default';
    const actual = this._intentos.get(id) || 0;
    if (actual >= MAX_REINTENTOS) return false; // agotado → escalar
    this._intentos.set(id, actual + 1);
    return true;
  }

  // Decide si el fallo es reintentable (mecanico) o deriva directo a humano.
  _esReintentable(fallo) {
    const codigo = (fallo && (fallo.codigo || fallo.code)) || 'UNKNOWN_ERROR';
    return !NO_REINTENTABLES.has(codigo);
  }

  // Deriva a camino sin alternativa: puente humano D2 por evento (paquete cerrado).
  _derivarASinAlternativa(fallo, raiz) {
    const f = fallo || {};
    return {
      project_id: fallo?.project_id || this.project_id,
      nicho: f.nicho || null,
      problema: f.mensaje || f.message || 'fallo no resuelto por reintento mecanico',
      dudas: [{ codigo: f.codigo || f.code || 'FALLO_NO_RETRY', causa: raiz }],
      estado: 'PENDIENTE',
      paquete_cerrado: true,
      derivado_en: new Date().toISOString()
    };
  }

  // Orquestador del manejo: reintento mecanico → si agota/irreparable → humano.
  _manejar(input) {
    const fallo = input && input.fallo;
    if (!fallo || typeof fallo !== 'object') return this._invalid('fallo');
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const reintentable = this._esReintentable(fallo);
    const reintentado = reintentable && this._reintentarMecanico(fallo);

    if (reintentado) {
      const intentos = this._intentos.get(fallo.id || 'default');
      return {
        status: 200,
        data: {
          project_id: pid,
          fallo_id: fallo.id || 'default',
          reintentado: true,
          intento: intentos,
          max_reintentos: MAX_REINTENTOS,
          resolucion: 'REINTENTO_MECANICO'
        }
      };
    }

    // Sin alternativa (o agotado) → puente humano D2 por evento.
    const causa = reintentable
      ? `reintentos agotados (max ${MAX_REINTENTOS})`
      : `fallo no reintentable (${fallo.codigo || fallo.code})`;
    const humana = this._derivarASinAlternativa({ ...fallo, project_id: pid }, causa);
    this.eventBus?.publish('nichos.puente_solicitado', humana);

    return {
      status: 200,
      data: {
        project_id: pid,
        fallo_id: fallo.id || 'default',
        reintentado: false,
        escalado_humano: true,
        resolucion: 'PUENTE_HUMANO',
        causa,
        paquete_cerrado: true
      }
    };
  }

  // ── Tools ──
  toolManejar(params) { return this._manejar(params); }
  toolReintentarMecanico(fallo) { return this._reintentarMecanico(fallo); }
}

module.exports = ManejoFallo;
