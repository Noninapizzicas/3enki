/**
 * invitaciones — el subsistema de la cadena de delegación de capacidades.
 *
 * El admin del sistema (y luego los admins de proyecto) EMITEN invitaciones firmadas que otros
 * REDIMEN para obtener un cert scopeado a {project, role}. Este módulo cablea el banco puro
 * (modules/_shared/invitaciones.js) con la firma REAL: R1 → la CA raíz firma (certificate-authority.
 * sign-invitation), verificable con su cert público. Persiste las emitidas para listar/revocar/contar usos.
 *
 * Reparto (reflejo determinista, sin LLM):
 *   - emitir  → banco.construir (monotonía) + firma-async por la CA + persiste + código copiable
 *   - listar  → las emitidas (con estado: activa/revocada/agotada/caducada)
 *   - revocar → marca una invitación como revocada (antes de que se redima)
 *
 * La redención (verificar + project-manager.create + issueFromPublicKey) es el corte 3c — aquí no.
 * Ver arquitectura/cabecera/sistema-nervioso/invitaciones.md.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const BaseModule = require('../_shared/base-module');
const banco = require('../_shared/invitaciones');

// autoridad del emisor según quién pide (v0: solo el admin del sistema desde el panel).
const AUTORIDAD_SISTEMA = { scope: 'system', role: 'system-admin' };

class InvitacionesModule extends BaseModule {
  constructor() {
    super();
    this.name = 'invitaciones';
    this.version = '1.0.0';
    this.store = new Map();   // id → invitación (con firma + estado)
    this._storePath = null;
  }

  async onLoad(core) {
    this.core = core;
    this.eventBus = core.eventBus || null;
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.mqttRequest = core.mqttRequest || null;

    const cfg = core.moduleConfig || {};
    const dataDir = path.resolve(cfg.data_dir || path.join(process.cwd(), 'data', 'invitaciones'));
    fs.mkdirSync(dataDir, { recursive: true });
    this._storePath = path.join(dataDir, 'invitaciones.json');
    this._cargar();

    this.logger?.info?.('invitaciones.loaded', { module: this.name, version: this.version, emitidas: this.store.size });
  }

  // ── persistencia (JSON simple, por instancia) ──
  _cargar() {
    try {
      if (fs.existsSync(this._storePath)) {
        const arr = JSON.parse(fs.readFileSync(this._storePath, 'utf8'));
        for (const inv of arr) this.store.set(inv.id, inv);
      }
    } catch (err) { this.logger?.warn?.('invitaciones.load.failed', { error_message: err.message }); }
  }
  _persistir() {
    try { fs.writeFileSync(this._storePath, JSON.stringify([...this.store.values()], null, 2)); }
    catch (err) { this.logger?.warn?.('invitaciones.persist.failed', { error_message: err.message }); }
  }

  // ── el puente de firma R1: la CA raíz sella el canonical ──
  async _firmarConCA(canonical) {
    if (!this.mqttRequest) throw new Error('mqttRequest ausente (¿certificate-authority cargado?)');
    const r = await this.mqttRequest('certificate-authority', 'sign-invitation', { canonical });
    const firma = (r?.data || r || {}).signature;
    if (!firma) throw new Error('la CA no devolvió firma');
    return firma;
  }

  // código copiable para entregar: base64url del JSON de la invitación
  _codigo(inv) {
    return 'enki-inv:' + Buffer.from(JSON.stringify(inv), 'utf8').toString('base64url');
  }

  // estado derivado (para listar)
  _estado(inv) {
    if (inv.revocada) return 'revocada';
    if ((inv.limites?.usos || 0) >= (inv.limites?.usos_max || 1)) return 'agotada';
    const exp = inv.limites?.expira_at ? new Date(inv.limites.expira_at).getTime() : null;
    if (exp !== null && Date.now() > exp) return 'caducada';
    return 'activa';
  }

  // ── EMITIR (el admin del sistema crea una invitación de proyecto) ──
  // body: { accion: 'crear-proyecto'|'unirse-proyecto', project?, role?, dias?, usos_max? }
  async handleEmitir(input) {
    try {
      const body = input?.body || input || {};
      const accion = body.accion || 'crear-proyecto';
      const role = body.role || 'project-admin';
      const project = body.project || null;
      const dias = Number.isFinite(body.dias) ? body.dias : 7;
      const usos_max = Number.isFinite(body.usos_max) ? body.usos_max : 1;
      const expira_at = new Date(Date.now() + dias * 864e5).toISOString();

      let construida;
      try {
        construida = banco.construir({
          autoridad: AUTORIDAD_SISTEMA,
          grant: { accion, project, role },
          limites: { expira_at, usos_max }
        });
      } catch (err) {
        return this._errorResponse(400, 'INVALID_INPUT', err.message, { kind: 'monotonia' });
      }

      const firma = await this._firmarConCA(construida.canonical);
      const inv = banco.sellar(construida.inv, firma);

      this.store.set(inv.id, inv);
      this._persistir();
      this.metrics?.increment?.('invitaciones.emitidas', { accion });

      try {
        this.eventBus?.publish?.('invitacion.emitida', {
          id: inv.id, accion, project, role, expira_at, timestamp: new Date().toISOString()
        });
      } catch (_) { /* best-effort */ }

      this.logger?.info?.('invitacion.emitida', { id: inv.id, accion, project, role });
      return { status: 201, data: { invitacion: inv, codigo: this._codigo(inv), estado: this._estado(inv) } };
    } catch (err) {
      return this._handleHandlerError?.('invitaciones.emitir.error', err) ||
        this._errorResponse(500, 'UNKNOWN_ERROR', err.message);
    }
  }

  async handleListar(input) {
    const q = input?.query || input || {};
    let items = [...this.store.values()].map(inv => ({
      id: inv.id, otorga: inv.otorga, limites: inv.limites, estado: this._estado(inv)
    }));
    if (q.estado) items = items.filter(i => i.estado === q.estado);
    if (q.project) items = items.filter(i => i.otorga.project === q.project);
    items.sort((a, b) => (a.id < b.id ? 1 : -1));
    return { status: 200, data: { invitaciones: items, total: items.length } };
  }

  async handleRevocar(input) {
    const body = input?.body || input || {};
    const { id } = body;
    if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id requerido', { field: 'id' });
    const inv = this.store.get(id);
    if (!inv) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'invitación no encontrada', { id });
    if (inv.revocada) return { status: 200, data: { id, revocada: true, ya_estaba: true } };
    inv.revocada = true;
    inv.revocada_at = new Date().toISOString();
    this.store.set(id, inv);
    this._persistir();
    try { this.eventBus?.publish?.('invitacion.revocada', { id, timestamp: inv.revocada_at }); } catch (_) { /* best-effort */ }
    this.logger?.info?.('invitacion.revocada', { id });
    return { status: 200, data: { id, revocada: true } };
  }

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }
}

module.exports = InvitacionesModule;
module.exports.AUTORIDAD_SISTEMA = AUTORIDAD_SISTEMA;
