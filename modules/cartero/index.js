/**
 * cartero — REFLEJO JS del puente con el proveedor de correo (Gmail del dueño).
 *
 * Contrato (plan-construccion.md HOJA 5):
 *   entrada = borrador de newsletter (lo produce el redactor) + destino (M7: el Gmail del dueño)
 *   salida  = cartero.envio_resultado { ok:true } SOLO con ack explícito del proveedor
 *             cartero.enviar.failed (par de fallo) · cartero.verificado (estado del canal)
 *   garantía = ok:true jamás sin confirmación del proveedor (M7/M11, honestidad);
 *              historial de envíos por proyecto (p6); persiste por proyecto
 *   no hace = no redacta (eso es el redactor); no decide qué se envía (eso es el reloj/el dueño)
 *
 * FORMA: REFLEJO puro (sin blueprint) — determinista. Transporte real: provider
 * `local.gmail` (Gmail API OAuth2, el puente que ya usa el sistema en facturacion/facturas)
 * vía ServiceExecutor. verificarCanal = llamada autenticada barata (list 1) → estado
 * disponible | error_autenticacion | suspendido | error (no clasificable).
 * Egress consciente: registra el interruptor `cartero` (apagado por defecto).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');
const ServiceExecutor = require('../../core/service-executor');

class CarteroReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cartero';
    this.version = 'reflejo-0.1.0';
    this.envios = new Map(); // `${project_id}:${id}` -> { id, candidato_id, para, asunto, estado, messageId?, detalle?, fecha, project_id }
    this._persistencia = new PosPersistencia({
      modulo: this,
      file: 'cartero.json',
      dir: '/radar',
      snapshot: (pid) => ({
        envios: [...this.envios.values()].filter((e) => e.project_id === pid)
      }),
      hidratar: (pid, data) => {
        (data.envios || []).forEach((e) => this.envios.set(`${pid}:${e.id}`, e));
      }
    });
  }

  async onLoad(context) {
    await super.onLoad(context);
    this.services = new ServiceExecutor(this.eventBus, this.logger);
    // Egress consciente: el cartero sale al correo del dueño. Interruptor propio.
    this.eventBus?.publish('interruptor.registrar', {
      id: 'cartero',
      label: 'Cartero de nichos (egress a Gmail del dueño)',
      grupo: 'radar',
      descripcion: 'El cartero entrega la newsletter semanal por Gmail (M7). Apagarlo detiene el envío sin tocar el historial.',
      default: false
    });
  }

  // ── Handlers ──
  onVerificarRequest(e) {
    return this._atender(e, 'verificar', 'cartero.verificar.response', (d) => this._verificarCanal(d));
  }

  onEnviarRequest(e) {
    return this._atender(e, 'enviar', 'cartero.enviar.response', (d) => this._enviar(d));
  }

  onEnviosListarRequest(e) {
    return this._atender(e, 'envios.listar', 'cartero.envios.listar.response', (d) => this._listarEnvios(d));
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    const project_id = d.project_id;
    if (!project_id) return;
    await this._persistencia.restaurar(project_id);
  }

  // ── Ops (REFLEJO: deterministas) ──

  async _verificarCanal(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    // Llamada autenticada barata al proveedor: listar 1 correo.
    let estado = 'error';
    let detalle = null;
    try {
      const res = await this.services.call('local.gmail', 'list', { maxResults: 1 }, { projectId: pid, timeout: 15000 });
      estado = 'disponible';
      detalle = { account: res?.account || null, mensajes: (res?.messages || []).length };
    } catch (err) {
      const msg = (err?.message || String(err)).toLowerCase();
      if (/(auth|oauth|token|credential|invalid_grant|401)/.test(msg)) estado = 'error_autenticacion';
      else if (/(suspended|disabled|inactive|forbidden|403)/.test(msg)) estado = 'suspendido';
      else estado = 'error';
      detalle = { error: err?.message || String(err) };
    }
    const ts = new Date().toISOString();
    this._publicarEvento('cartero.verificado', { estado, detalle, ts, project_id: pid });
    return { status: 200, data: { estado, detalle, ts } };
  }

  async _enviar(input) {
    const pid = input.project_id;
    if (!pid) return this._invalid('project_id');
    const borrador = input.borrador;
    if (!borrador || typeof borrador.newsletter !== 'string' || borrador.newsletter.trim().length === 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'borrador con newsletter requerida (la produce el redactor)', { field: 'borrador' });
    }
    const para = input.para;
    if (!para) return this._errorResponse(400, 'INVALID_INPUT', 'destino requerido (para)', { field: 'para' });
    const asunto = input.asunto || borrador.titulo || 'Newsletter semanal de nichos';
    const id = `envio_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; // único aunque dos envíos caigan en el mismo ms
    const candidato_id = borrador.candidato_id || null;

    try {
      const res = await this.services.call('local.gmail', 'send', {
        to: para,
        subject: asunto,
        body: borrador.newsletter,
        html: false
      }, { projectId: pid, timeout: 30000 });
      // ok:true SOLO con confirmación explícita del proveedor: messageId presente.
      const messageId = res?.messageId || null;
      if (!messageId) throw new Error('Proveedor respondió sin messageId (sin ack)');
      const envio = { id, candidato_id, para, asunto, estado: 'ENVIADO', messageId, fecha: new Date().toISOString(), project_id: pid };
      this.envios.set(`${pid}:${id}`, envio);
      this._persistencia.marcarDirty(pid);
      this._publicarEvento('cartero.envio_resultado', { ok: true, envio });
      return { status: 200, data: { ok: true, envio } };
    } catch (err) {
      const detalle = err?.message || String(err);
      const envio = { id, candidato_id, para, asunto, estado: 'FALLIDO', detalle, fecha: new Date().toISOString(), project_id: pid };
      this.envios.set(`${pid}:${id}`, envio);
      this._persistencia.marcarDirty(pid);
      this._publicarEvento('cartero.enviar.failed', { motivo: 'proveedor_sin_ack', detalle, envio });
      return { status: 200, data: { ok: false, envio } }; // el RPC responde ok:false con detalle; no cuelga el bus
    }
  }

  _listarEnvios(input) {
    const { project_id, estado } = input;
    const envios = [...this.envios.values()]
      .filter((e) => !project_id || e.project_id === project_id)
      .filter((e) => !estado || e.estado === estado)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    return { status: 200, data: { envios, total: envios.length } };
  }

  _publicarEvento(evento, payload) {
    this.eventBus?.publish(evento, payload);
  }
}

module.exports = CarteroReflejo;
