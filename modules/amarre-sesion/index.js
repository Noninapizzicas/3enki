'use strict';
/**
 * amarre-sesion — P08 · CUSTODIO (SS1, AS1–AS4, I4, I5).
 *
 * La sesión se ata a un PAR (participante, conversación). Dos participantes sobre
 * el mismo hilo tienen DOS sesiones y ninguna cruza de conversación. No existe
 * una sesión «global» por proyecto: ésa es justo la `session_state` que este
 * diseño mata.
 *
 * Invariantes:
 *   SS1  la clave es el par (participante, conversación): ninguna sesión es compartida.
 *   AS1  un único escritor: dos escritores = dos sesiones vivas para el mismo par.
 *   AS2  una sesión no se reutiliza en otra conversación (la clave la separa).
 *   AS3  la sesión la fija la puerta; el llamante no la impone desde el cuerpo del mensaje
 *        (aquí sólo se resuelve por par, nunca «la sesión activa del sistema»).
 *   AS4  «a qué se ata» es mecanismo_de_sesion: el amarre guarda el par declarado por I4
 *        y deja el resto como POR_DECLARAR.
 *   I4   una sesión viva pertenece a UN par.
 *   I5   cerrar una sesión NUNCA archiva la conversación: el hilo sigue completo.
 *
 * Almacén: memoria + snapshot JSON por proyecto (`/conversaciones/sesiones.json` vía
 * PosPersistencia, patrón credential-oauth), restaurado en `project.activated`.
 *
 * Contrato:
 *   sesion.resolver.request   { request_id, project_id, participante, conversacion, ahora? }
 *     → sesion.resolver.response { request_id, status, data: { sesion, reutilizada } }
 *     → sesion.resolver.failed   (participante DESCONOCIDO: rechazo de dominio, nunca timeout)
 *   sesion.senal.request      { request_id, id? | participante+conversacion, ahora? }
 *     → sesion.senal.response
 *   sesion.cerrar.request     { request_id, id? | participante+conversacion, motivo, ahora? }
 *     → sesion.cerrar.response  (NO toca la conversación — I5)
 *   sesion.huerfanas.request  { request_id, umbral_ms, ahora? }
 *     → sesion.huerfanas.response (umbral POR_DECLARAR ⇒ se exige explícito, no se estima)
 *   project.activated         → restaura las sesiones del proyecto
 *
 * Hechos: sesion.abierta · sesion.cerrada · sesion.huerfana_detectada
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const POR_DECLARAR = 'POR_DECLARAR';
const DESCONOCIDO = 'DESCONOCIDO';
const VIVA = 'VIVA';
const CERRADA = 'CERRADA';

class AmarreSesion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'amarre-sesion';
    this.version = 'reflejo-0.1.0';

    // clave = `${participante}::${conversacion}` (SS1). NO hay clave global.
    this.sesiones = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'sesiones.json',
      dir: '/conversaciones',
      snapshot: (pid) => ({
        sesiones: [...this.sesiones.values()].filter((s) => s.project_id === pid)
      }),
      hidratar: (pid, data) => this._hidratar(pid, data)
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

  // ───────────────────────────────────────────────────────────────────────
  // Handlers RPC — una línea cada uno (patrón real del bus)
  // ───────────────────────────────────────────────────────────────────────

  onSesionResolverRequest(e) {
    return this._atender(e, 'sesion.resolver', 'sesion.resolver.response', (d) => this._resolver(d));
  }

  onSesionSenalRequest(e) {
    return this._atender(e, 'sesion.senal', 'sesion.senal.response', (d) => this._senal(d));
  }

  onSesionCerrarRequest(e) {
    return this._atender(e, 'sesion.cerrar', 'sesion.cerrar.response', (d) => this._cerrar(d));
  }

  onSesionHuerfanasRequest(e) {
    return this._atender(e, 'sesion.huerfanas', 'sesion.huerfanas.response', (d) => this._huerfanas(d));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Proyecciones (aquí vive la lógica de dominio)
  // ───────────────────────────────────────────────────────────────────────

  async _resolver(d = {}) {
    const { participante, conversacion, project_id } = d;

    // Nadie tiene sesión anónima: el par empieza por un sujeto conocido (I1/I4).
    if (!participante || participante === DESCONOCIDO) {
      await this._publicarEvento('sesion.resolver.failed', {
        motivo: 'PARTICIPANTE_DESCONOCIDO',
        conversacion: conversacion || null
      });
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'No hay sesión para un participante DESCONOCIDO (nadie entra anónimo)',
        { kind: 'domain', motivo: 'PARTICIPANTE_DESCONOCIDO', field: 'participante' });
    }
    if (!conversacion) {
      await this._publicarEvento('sesion.resolver.failed', { motivo: 'CONVERSACION_AUSENTE', participante });
      return this._errorResponse(400, 'INVALID_INPUT', 'conversacion requerido (la sesión se ata a UN hilo)', {
        kind: 'domain', field: 'conversacion'
      });
    }

    const ahora = d.ahora || new Date().toISOString();
    const clave = this._clave(participante, conversacion);
    const existente = this.sesiones.get(clave);
    if (existente && existente.estado === VIVA) {
      // Viva: se devuelve LA MISMA (una sesión viva pertenece a UN par, I4).
      return { status: 200, data: { sesion: { ...existente }, reutilizada: true } };
    }

    const sesion = {
      id: `sesion-${crypto.randomUUID()}`,
      participante,
      conversacion,
      project_id: project_id || null,
      abiertaEn: ahora,
      ultimaSenal: ahora,
      estado: VIVA,
      mecanismo_de_sesion: POR_DECLARAR   // AS4: se declara la ausencia, no se elige
    };
    this.sesiones.set(clave, sesion);
    this._persist.marcarDirty(sesion.project_id);

    await this._publicarEvento('sesion.abierta', { sesion: { ...sesion } });
    this.metrics?.increment(`${this.name}.abiertas`, {});
    this.logger?.info('amarre-sesion.abierta', {
      module: this.name, id: sesion.id, participante, conversacion
    });

    return { status: 201, data: { sesion: { ...sesion }, reutilizada: false } };
  }

  async _senal(d = {}) {
    const sesion = this._buscar(d);
    if (!sesion) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay sesión para ese par/id', {
        entity_type: 'sesion', entity_id: d.id || this._clave(d.participante, d.conversacion)
      });
    }
    sesion.ultimaSenal = d.ahora || new Date().toISOString();
    this._persist.marcarDirty(sesion.project_id);
    return { status: 200, data: { sesion: { ...sesion } } };
  }

  /** Sólo la sesión: NUNCA archiva ni borra la conversación (I5). */
  async _cerrar(d = {}) {
    const sesion = this._buscar(d);
    if (!sesion) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay sesión para ese par/id', {
        entity_type: 'sesion', entity_id: d.id || this._clave(d.participante, d.conversacion)
      });
    }
    if (sesion.estado === CERRADA) {
      return { status: 200, data: { sesion: { ...sesion }, ya_cerrada: true } };
    }
    sesion.estado = CERRADA;
    sesion.cerradaEn = d.ahora || new Date().toISOString();
    sesion.motivo_cierre = d.motivo || POR_DECLARAR;
    this._persist.marcarDirty(sesion.project_id);

    await this._publicarEvento('sesion.cerrada', {
      sesion: { ...sesion },
      motivo: sesion.motivo_cierre
    });
    this.metrics?.increment(`${this.name}.cerradas`, {});
    this.logger?.info('amarre-sesion.cerrada', {
      module: this.name, id: sesion.id, motivo: sesion.motivo_cierre
    });

    return { status: 200, data: { sesion: { ...sesion } } };
  }

  /** Umbral POR_DECLARAR ⇒ se EXIGE explícito; jamás se estima un umbral por defecto. */
  async _huerfanas(d = {}) {
    const umbral = Number(d.umbral_ms);
    if (!Number.isFinite(umbral) || umbral <= 0) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'umbral_ms requerido y positivo: el umbral de vida está POR_DECLARAR y no se estima',
        { kind: 'domain', field: 'umbral_ms', motivo: 'UMBRAL_POR_DECLARAR' });
    }
    const ahoraMs = d.ahora ? new Date(d.ahora).getTime() : Date.now();
    const huerfanas = [...this.sesiones.values()]
      .filter((s) => s.estado === VIVA)
      .filter((s) => !d.project_id || s.project_id === d.project_id)
      .filter((s) => ahoraMs - new Date(s.ultimaSenal).getTime() > umbral);

    for (const s of huerfanas) {
      await this._publicarEvento('sesion.huerfana_detectada', { sesion: { ...s }, umbral_ms: umbral });
    }
    if (huerfanas.length) this.metrics?.increment(`${this.name}.huerfanas`, {});
    return { status: 200, data: { sesiones: huerfanas.map((s) => ({ ...s })), total: huerfanas.length, umbral_ms: umbral } };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  _clave(participante, conversacion) {
    return `${participante}::${conversacion}`;
  }

  _buscar(d) {
    if (d.id) {
      for (const s of this.sesiones.values()) if (s.id === d.id) return s;
      return null;
    }
    if (!d.participante || !d.conversacion) return null;
    return this.sesiones.get(this._clave(d.participante, d.conversacion)) || null;
  }

  _hidratar(project_id, data) {
    const sesiones = Array.isArray(data?.sesiones) ? data.sesiones : [];
    for (const s of sesiones) {
      if (!s || !s.participante || !s.conversacion) continue;
      const clave = this._clave(s.participante, s.conversacion);
      const actual = this.sesiones.get(clave);
      // Gana la más reciente por última señal: un snapshot viejo no pisa una viva posterior.
      if (!actual || new Date(s.ultimaSenal).getTime() >= new Date(actual.ultimaSenal).getTime()) {
        this.sesiones.set(clave, { ...s, project_id: s.project_id || project_id });
      }
    }
  }
}

module.exports = AmarreSesion;
