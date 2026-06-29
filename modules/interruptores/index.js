/**
 * interruptores — registro central de on/off del sistema (el panel de control).
 *
 * Un solo sitio para todos los botones. Cada feature REGISTRA su interruptor al
 * cargar (publish 'interruptor.registrar'); el panel los pinta; al pulsarlos,
 * 'interruptor.cambiado' avisa al dueño para que reaccione en caliente.
 *
 * - listar  : todos los interruptores con su estado (lo consume el panel).
 * - set     : pulsa uno -> persiste + emite interruptor.cambiado {id, enabled}.
 * - registrar (evento): una feature anuncia su botón {id, label, descripcion,
 *   grupo, default}. El estado persistido manda sobre el default (no se pisa
 *   un on/off que el humano ya tocó).
 *
 * Estado GLOBAL del sistema (no por proyecto): se persiste con fs directo en
 * data/interruptores.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const BaseModule = require('../_shared/base-module');

class InterruptoresModule extends BaseModule {
  constructor() {
    super();
    this.name = 'interruptores';
    this.version = '1.0.0';
    this.config = null;
    this.toggles = new Map();   // id -> { id, label, descripcion, grupo, estado, default }
    this.estadosPath = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = context.moduleConfig || {};
    this.estadosPath = path.resolve(this.config.estados_path || path.join(process.cwd(), 'data', 'interruptores.json'));

    // Semilla opcional de interruptores conocidos (por si su dueño aún no cargó).
    for (const t of (this.config.toggles_base || [])) this._upsert(t, false);
    this._cargarEstados();

    // Anuncio: pide a las features que (re)registren su botón. Cura la carrera de
    // arranque — si una feature cargó ANTES que este registro y su registrar
    // fire-and-forget se perdió, este broadcast la hace re-registrarse.
    try { this.eventBus.publish('interruptor.solicitar_registro', {}); } catch (_) { /* best-effort */ }

    this.logger?.info('interruptores.loaded', { module: this.name, version: this.version, toggles: this.toggles.size });
  }

  async onUnload() {
    this.toggles.clear();
    this.logger?.info('interruptores.unloaded', { module: this.name });
  }

  // ── una feature anuncia su botón ──
  onRegistrar(event) {
    const d = (event && event.data) || event || {};
    if (!d.id) return;
    this._upsert(d, false);          // no pisa el estado ya persistido/tocado
    this.metrics?.increment('interruptores.registrado.total');
    const estado = this.toggles.get(d.id)?.estado;
    this.logger?.info('interruptores.registrado', { id: d.id, estado });
    // Sincroniza al dueño SOLO si el estado persistido difiere del default que anuncia:
    // el modulo arranca en su default; si el humano lo cambio antes, hay que avisarle en
    // caliente para que el 'off' (o 'on') sobreviva al reinicio. Mismo evento que handleSet.
    if (typeof estado === 'boolean' && estado !== (d.default === true)) {
      try {
        this.eventBus.publish('interruptor.cambiado', {
          id: d.id, enabled: estado, correlation_id: require('crypto').randomUUID(), timestamp: new Date().toISOString()
        });
      } catch (_) { /* best-effort */ }
      this.logger?.info('interruptores.sincronizado', { id: d.id, estado });
    }
  }

  _upsert(t, overrideEstado) {
    const prev = this.toggles.get(t.id);
    const estado = (prev && !overrideEstado) ? prev.estado
      : (typeof t.estado === 'boolean' ? t.estado : (t.default === true));
    this.toggles.set(t.id, {
      id: t.id,
      label: t.label || prev?.label || t.id,
      descripcion: t.descripcion || prev?.descripcion || '',
      grupo: t.grupo || prev?.grupo || 'general',
      default: t.default === true || (prev?.default === true),
      estado
    });
  }

  // ── UI: listar todos ──
  async handleListar() {
    const toggles = Array.from(this.toggles.values())
      .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.label.localeCompare(b.label));
    return { status: 200, data: { total: toggles.length, toggles } };
  }

  // ── EVENTO: un órgano pulsa un interruptor por el bus (canal del EFECTOR).
  // Mismo camino que la UI (handleSet): persiste + emite interruptor.cambiado.
  // Así la homeostasis puede inhibir una facultad sin pasar por la UI humana.
  onSetRequest(event) {
    const d = (event && event.data) || event || {};
    if (!d.id) return;
    return this.handleSet({ id: d.id, enabled: !!d.enabled, motivo: d.motivo });
  }

  // ── UI: pulsar uno -> persiste + avisa al dueño ──
  async handleSet(data) {
    try {
      const { id } = data || {};
      if (!id) return this._errorResponse(400, 'INVALID_INPUT', 'id requerido', { field: 'id' });
      const enabled = !!(data && data.enabled);
      const t = this.toggles.get(id);
      if (!t) {
        // permite pre-fijar el estado de un interruptor que aún no se registró
        this._upsert({ id, estado: enabled, label: id }, true);
      } else {
        t.estado = enabled;
      }
      this._guardarEstados();
      try {
        const evt = { id, enabled, correlation_id: require('crypto').randomUUID(), timestamp: new Date().toISOString() };
        if (data && data.motivo) evt.motivo = data.motivo;   // testigo: por qué (p.ej. homeostasis)
        this.eventBus.publish('interruptor.cambiado', evt);
      } catch (_) { /* best-effort */ }
      this.metrics?.increment('interruptores.cambiado.total', { id });
      this.logger?.warn('interruptores.cambiado', { id, enabled });
      return { status: 200, data: { id, enabled } };
    } catch (err) {
      return this._handleHandlerError('interruptores.set.failed', err, 'set');
    }
  }

  async handleHealthCheck() {
    return { status: 200, data: { module: this.name, version: this.version, toggles: this.toggles.size } };
  }

  _cargarEstados() {
    try {
      if (!fs.existsSync(this.estadosPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.estadosPath, 'utf-8'));
      for (const [id, estado] of Object.entries(raw.estados || {})) {
        const t = this.toggles.get(id);
        if (t) t.estado = !!estado;
        else this._upsert({ id, estado: !!estado, label: id }, true);
      }
    } catch (_) { /* corrupto -> ignora */ }
  }

  _guardarEstados() {
    try {
      const estados = {};
      for (const t of this.toggles.values()) estados[t.id] = t.estado;
      fs.mkdirSync(path.dirname(this.estadosPath), { recursive: true });
      fs.writeFileSync(this.estadosPath, JSON.stringify({ _version: 1, _updated: new Date().toISOString(), estados }, null, 2));
    } catch (_) {
      this.metrics?.increment('interruptores.errors.total', { kind: 'persist' });
    }
  }
}

module.exports = InterruptoresModule;
