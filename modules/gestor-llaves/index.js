'use strict';
/**
 * gestor-llaves — P07 · CUSTODIO (GL1–GL3, L1, L2, I7).
 *
 * El derecho de entrar a UNA conversación con UN acto: emitir (sólo con la forma
 * declarada), revocar ANEXANDO (nunca reescribiendo, L1) e hidratar las vigentes
 * a la puerta.
 *
 * DECISIÓN YA TOMADA DEL PROYECTO (no se reabre): el tipo de llave es una
 * REFERENCIA al secreto del proyecto (`HERMES_API_KEY`, que ya vive en el .env de
 * Enki). NO se inventa un sistema de tokens nuevo: cada llave emitida guarda
 * `ref_secreto: 'HERMES_API_KEY'` — la referencia, JAMÁS el valor. La emisión y
 * la revocación son por conversación, sobre esa base.
 *
 * Almacén: ledger SÓLO-AÑADIR por proyecto (`/conversaciones/llaves.json` vía
 * PosPersistencia, patrón credential-oauth). Emisión = un asiento; revocación =
 * OTRO asiento. No hay UPDATE ni DELETE de una llave: la vigencia se calcula
 * plegando el ledger (`_vigentes`). Eso es L1 hecho código, no disciplina.
 *
 * Invariantes:
 *   GL1  único escritor del derecho de entrar.
 *   GL2  la llave declara su ámbito (una conversación) y sus actos.
 *   GL3  emisión y revocación se trazan: este módulo emite los hechos.
 *   L1   una llave no se reescribe: se revoca y se emite otra.
 *   L2   una llave sin conversación NO existe.
 *   I7   LEER ≠ ESCRIBIR: los actos de la llave son un conjunto explícito.
 *
 * Contrato:
 *   llave.emitir.request   { request_id, project_id, conversacion, actos[],
 *                            emisor, forma, caducaEn?, ref_secreto?,
 *                            emisor_autorizado?, hilo_existe? }
 *     → llave.emitir.response { request_id, status, data: { llave } }
 *     → llave.emitir.failed   (payload incompleto: error de dominio, nunca timeout)
 *   llave.revocar.request  { request_id, project_id, id, actor }
 *     → llave.revocar.response { request_id, status, data: { llave } }
 *   llave.vigentes.request { request_id, project_id?, conversacion, ahora? }
 *     → llave.vigentes.response { request_id, status, data: { llaves, total, caducidad } }
 *   llave.listar.request   { request_id, project_id?, conversacion }
 *     → llave.listar.response
 *   project.activated      → restaura el ledger del proyecto
 *
 * Hechos (después de escribir): llave.emitida · llave.revocada · decision.solicitada
 */

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const POR_DECLARAR = 'POR_DECLARAR';
const NINGUNO = 'NINGUNO';
const REF_SECRETO = 'HERMES_API_KEY';
const FORMA_DECLARADA = 'REFERENCIA_SECRETO';
const TIPO_DE_LLAVE = 'tipo_de_llave';

class GestorLlaves extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gestor-llaves';
    this.version = 'reflejo-0.1.0';

    // project_id → asientos[] (SÓLO-AÑADIR). El ledger ES el estado.
    this.ledger = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'llaves.json',
      dir: '/conversaciones',
      snapshot: (pid) => ({ asientos: this._asientos(pid) }),
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

  onLlaveEmitirRequest(e) {
    return this._atender(e, 'llave.emitir', 'llave.emitir.response', (d) => this._emitir(d));
  }

  onLlaveRevocarRequest(e) {
    return this._atender(e, 'llave.revocar', 'llave.revocar.response', (d) => this._revocar(d));
  }

  onLlaveVigentesRequest(e) {
    return this._atender(e, 'llave.vigentes', 'llave.vigentes.response', (d) => this._vigentesRpc(d));
  }

  onLlaveListarRequest(e) {
    return this._atender(e, 'llave.listar', 'llave.listar.response', (d) => this._listar(d));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Proyecciones (aquí vive la lógica de dominio)
  // ───────────────────────────────────────────────────────────────────────

  async _emitir(orden = {}) {
    const { project_id, conversacion, actos, emisor, forma } = orden;

    // L2 — una llave sin conversación no existe.
    if (!conversacion) return this._falloEmitir('conversacion requerido', 'conversacion');
    if (!project_id) return this._falloEmitir('project_id requerido', 'project_id');
    if (!Array.isArray(actos) || actos.length === 0) return this._falloEmitir('actos[] requerido (LEER ≠ ESCRIBIR)', 'actos');
    if (!emisor) return this._falloEmitir('emisor requerido (toda llave tiene quién la emite)', 'emisor');

    // El hilo lo custodia chat-io: aquí llega HIDRATADO por valor (isla).
    if (orden.hilo_existe === false) {
      return { status: 409, error: { code: 'RESOURCE_NOT_FOUND', message: 'La conversación no existe: no se emite llave sobre un hilo inexistente', details: { kind: 'domain', entity_type: 'conversacion', entity_id: conversacion } } };
    }

    // La forma de la llave es una DECISIÓN: si no está declarada, no se emite.
    if (!forma || forma === POR_DECLARAR) {
      const solicitud = await this._solicitarDecision(orden, TIPO_DE_LLAVE, 'FORMA_POR_DECLARAR');
      return this._errorResponse(409, 'DECISION_REQUERIDA',
        'No se emite: la forma de la llave está POR_DECLARAR (tipo_de_llave)',
        { kind: 'domain', tipo: TIPO_DE_LLAVE, motivo: 'FORMA_POR_DECLARAR', solicitud_id: solicitud.id });
    }
    if (forma !== FORMA_DECLARADA) {
      const solicitud = await this._solicitarDecision(orden, TIPO_DE_LLAVE, 'FORMA_NO_DECLARADA');
      return this._errorResponse(409, 'DECISION_REQUERIDA',
        `Forma de llave no declarada: ${forma} (la declarada es ${FORMA_DECLARADA})`,
        { kind: 'domain', tipo: TIPO_DE_LLAVE, motivo: 'FORMA_NO_DECLARADA', forma, solicitud_id: solicitud.id });
    }

    // El emisor debe estar autorizado — y la autorización es DATO, no suposición:
    // sin ella declarada, se pide la decisión en vez de asumir permiso.
    if (orden.emisor_autorizado !== true) {
      const motivo = orden.emisor_autorizado === false ? 'EMISOR_NO_AUTORIZADO' : 'POLITICA_EMISION_NO_DECLARADA';
      const solicitud = await this._solicitarDecision(orden, 'politica_de_emision', motivo);
      return this._errorResponse(403, 'PERMISSION_DENIED',
        orden.emisor_autorizado === false
          ? 'El emisor no está autorizado a emitir llaves'
          : 'No consta autorización del emisor (política de emisión POR_DECLARAR)',
        { kind: 'domain', motivo, emisor, solicitud_id: solicitud.id });
    }

    const ahora = orden.ahora || new Date().toISOString();
    const llave = {
      id: `llave-${crypto.randomUUID()}`,
      tipo: 'EMISION',
      conversacion,
      actos: [...new Set(actos.map((a) => String(a).toUpperCase()))],
      emisor,
      emitidaEn: ahora,
      caducaEn: orden.caducaEn && orden.caducaEn !== NINGUNO ? orden.caducaEn : POR_DECLARAR,
      forma: FORMA_DECLARADA,
      // REFERENCIA al secreto del proyecto — nunca el valor.
      ref_secreto: orden.ref_secreto || REF_SECRETO,
      hilo_verificado: orden.hilo_existe === true
    };

    this._anexar(project_id, llave);
    this._persist.marcarDirty(project_id);

    // El hecho describe lo ESCRITO y se publica después de escribirlo.
    await this._publicarEvento('llave.emitida', { llave });

    this.metrics?.increment(`${this.name}.emitidas`, {});
    this.logger?.info('gestor-llaves.emitida', {
      module: this.name, id: llave.id, conversacion, actos: llave.actos, emisor
    });

    return { status: 201, data: { llave } };
  }

  async _revocar(d = {}) {
    const { project_id, id, actor } = d;
    if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id requerido', { kind: 'domain', field: 'project_id' });
    if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id de llave requerido', { kind: 'domain', field: 'id' });
    if (!actor) return this._errorResponse(400, 'INVALID_INPUT', 'actor requerido (la revocación se traza)', { kind: 'domain', field: 'actor' });

    const emision = this._asientos(project_id).find((a) => a.tipo === 'EMISION' && a.id === id);
    if (!emision) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `No existe la llave ${id}`, { entity_type: 'llave', entity_id: id });
    }
    if (this._estaRevocada(project_id, id)) {
      return this._errorResponse(409, 'CONFLICT_STATE', `La llave ${id} ya está revocada`, { entity_type: 'llave', entity_id: id });
    }

    const asiento = {
      id: `rev-${crypto.randomUUID()}`,
      tipo: 'REVOCACION',
      llave_id: id,
      conversacion: emision.conversacion,
      revocadaEn: d.ahora || new Date().toISOString(),
      actor
    };
    this._anexar(project_id, asiento);
    this._persist.marcarDirty(project_id);

    await this._publicarEvento('llave.revocada', { llave: { ...emision, revocadaEn: asiento.revocadaEn }, actor });
    this.metrics?.increment(`${this.name}.revocadas`, {});
    this.logger?.info('gestor-llaves.revocada', { module: this.name, id, actor });

    return { status: 200, data: { llave: { ...emision, revocadaEn: asiento.revocadaEn } } };
  }

  async _vigentesRpc(d = {}) {
    const { conversacion, ahora } = d;
    if (!conversacion) return this._errorResponse(400, 'INVALID_INPUT', 'conversacion requerido', { kind: 'domain', field: 'conversacion' });
    const proyecto = d.project_id || null;
    const llaves = this._vigentes(proyecto, conversacion, ahora || null);
    const caducidad = llaves.some((l) => l.caducaEn === POR_DECLARAR) ? POR_DECLARAR : 'DECLARADA';
    return { status: 200, data: { llaves, total: llaves.length, caducidad } };
  }

  async _listar(d = {}) {
    const { conversacion } = d;
    if (!conversacion) return this._errorResponse(400, 'INVALID_INPUT', 'conversacion requerido', { kind: 'domain', field: 'conversacion' });
    const proyectos = d.project_id ? [d.project_id] : [...this.ledger.keys()];
    const emisiones = [];
    for (const pid of proyectos) {
      for (const a of this._asientos(pid)) {
        if (a.tipo === 'EMISION' && a.conversacion === conversacion) {
          emisiones.push({ ...a, revocadaEn: this._revocacionDe(pid, a.id) });
        }
      }
    }
    return { status: 200, data: { llaves: emisiones, total: emisiones.length } };
  }

  /**
   * Plegado del ledger: emisiones sin revocación que cubren el hilo.
   * `caducaEn: POR_DECLARAR` ⇒ no caduca, y se DECLARA (nunca se estima).
   */
  _vigentes(project_id, conversacion, ahora) {
    const proyectos = project_id ? [project_id] : [...this.ledger.keys()];
    const out = [];
    for (const pid of proyectos) {
      for (const a of this._asientos(pid)) {
        if (a.tipo !== 'EMISION' || a.conversacion !== conversacion) continue;
        if (this._estaRevocada(pid, a.id)) continue;
        if (a.caducaEn && a.caducaEn !== POR_DECLARAR) {
          if (!ahora) continue;               // sin ahora no se puede verificar: no se da por vigente
          if (String(ahora) > String(a.caducaEn)) continue;
        }
        out.push(a);
      }
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals — el ledger (sólo-añadir)
  // ───────────────────────────────────────────────────────────────────────

  _asientos(project_id) {
    if (!this.ledger.has(project_id)) this.ledger.set(project_id, []);
    return this.ledger.get(project_id);
  }

  _anexar(project_id, asiento) {
    this._asientos(project_id).push(asiento);
  }

  _estaRevocada(project_id, llave_id) {
    return this._revocacionDe(project_id, llave_id) !== NINGUNO;
  }

  _revocacionDe(project_id, llave_id) {
    const rev = this._asientos(project_id).find((a) => a.tipo === 'REVOCACION' && a.llave_id === llave_id);
    return rev ? rev.revocadaEn : NINGUNO;
  }

  _hidratar(project_id, data) {
    const asientos = Array.isArray(data?.asientos) ? data.asientos : [];
    const actuales = this._asientos(project_id);
    for (const a of asientos) {
      if (!a || !a.id) continue;
      if (!actuales.some((x) => x.id === a.id)) actuales.push(a);   // merge por id: nunca duplica
    }
  }

  async _solicitarDecision(orden, tipo, motivo) {
    const solicitud = {
      id: `dec-${crypto.randomUUID()}`,
      tipo,
      motivo,
      conversacion: orden.conversacion || null,
      emisor: orden.emisor || null,
      actos: Array.isArray(orden.actos) ? orden.actos : [],
      preguntadoEn: new Date().toISOString()
    };
    await this._publicarEvento('decision.solicitada', { solicitud });
    this.metrics?.increment(`${this.name}.decisiones_solicitadas`, { tipo, motivo });
    return solicitud;
  }

  async _falloEmitir(message, field) {
    await this._publicarEvento('llave.emitir.failed', { motivo: 'ORDEN_INCOMPLETA', field });
    return this._errorResponse(400, 'INVALID_INPUT', message, { kind: 'domain', field });
  }
}

module.exports = GestorLlaves;
