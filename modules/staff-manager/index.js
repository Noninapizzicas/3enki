/**
 * staff-manager v2.1.0 — Control de personal con tarjetas NFC NTAG215 (POC2 rewrite).
 *
 * Tres responsabilidades coordinadas (sub-libs en lib/):
 *   1. EmployeeRegistry — CRUD de empleados (SQLite via sql.js).
 *   2. SessionManager   — sesiones de jornada (tap_in/tap_out/auto_timeout/manager_close).
 *   3. NFCCard          — payloads NFC NTAG215 (tarjeta de empleado + core-tag de onboarding).
 *
 * Eventos del bus (publishes via eventBus.publish, NO eventBus.emit del monolito legacy):
 *   staff.session.tap_in
 *   staff.session.tap_out
 *   staff.session.auto_timeout
 *   staff.session.manager_close
 *
 * 15 ui_handlers expuestos como mqttRequest cross-modulo (auto-wired desde module.json.ui_handlers).
 */

'use strict';

const path      = require('path');
const crypto    = require('crypto');
const initSqlJs = require('sql.js');

const EmployeeRegistry = require('./lib/employee-registry');
const SessionManager   = require('./lib/session-manager');
const NFCCard          = require('./lib/nfc-card');

const BaseModule = require('../_shared/base-module');
const DEFAULT_PROJECT_ID = 'default';
const NTAG215_CAPACITY   = 504;

class StaffManagerModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'staff-manager';
    this.version = '2.1.0';

    this.core     = null;
    this.registry = null;
    this.sessions = null;

    this.dataPath      = path.resolve('./data/staff');
    this.maxShiftHours = 16;

    // request_id → { resolve, timer } para security.public-key.request/response
    this.pendingPublicKey = new Map();
    this.publicKeyTimeoutMs = 2000;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.core     = core;
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    this.logger?.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.staff?.dataPath)      this.dataPath      = path.resolve(core.config.staff.dataPath);
    if (core.config?.staff?.maxShiftHours) this.maxShiftHours = core.config.staff.maxShiftHours;

    const SQL = await initSqlJs();

    this.registry = new EmployeeRegistry({ dataPath: this.dataPath, logger: this.logger });
    this.sessions = new SessionManager({
      dataPath:       this.dataPath,
      logger:         this.logger,
      maxShiftHours:  this.maxShiftHours,
      onSessionEvent: this._emitSessionEvent.bind(this)
    });

    await this.registry.initialize(SQL);
    await this.sessions.initialize(SQL);

    this.logger?.info('module.loaded', {
      module:          this.name,
      version:         this.version,
      dataPath:        this.dataPath,
      maxShiftHours:   this.maxShiftHours
    });
  }

  async onUnload() {
    this.logger?.info('module.unloading', { module: this.name });
    await this.registry?.close();
    await this.sessions?.close();
    for (const { timer } of this.pendingPublicKey.values()) clearTimeout(timer);
    this.pendingPublicKey.clear();
    this.registry = null;
    this.sessions = null;
    this.core     = null;
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handlers — Estado
  // ==========================================

  async handleStatus() {
    try {
      const employees       = this.registry.listEmployees({ active_only: true });
      const active_sessions = this.sessions.listActiveSessions();
      return {
        status: 200,
        data: {
          module:           this.name,
          version:          this.version,
          employees_active: employees.length,
          sessions_open:    active_sessions.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.status.failed', err, 'ui_status');
    }
  }

  // ==========================================
  // UI Handlers — Empleados
  // ==========================================

  async handleEmployeeCreate(data) {
    try {
      const { name, role, pin } = data || {};
      if (!name || !role) {
        this._logError('staff-manager.ui.employee_create.validation_failed', { has_name: !!name, has_role: !!role }, 'ui_employee_create', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'name y role son requeridos', { fields: ['name', 'role'] });
      }
      const employee = this.registry.createEmployee({ name, role, pin });
      return { status: 201, data: { employee } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.employee_create.failed', err, 'ui_employee_create');
    }
  }

  async handleEmployeeList(data) {
    try {
      const active_only = (data?.active_only ?? true) !== false;
      return { status: 200, data: { employees: this.registry.listEmployees({ active_only }) } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.employee_list.failed', err, 'ui_employee_list');
    }
  }

  async handleEmployeeGet(data) {
    try {
      const id = data?.id;
      if (!id) {
        this._logError('staff-manager.ui.employee_get.validation_failed', { missing: 'id' }, 'ui_employee_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const employee = this.registry.getEmployee(id);
      if (!employee) {
        this._logError('staff-manager.ui.employee_get.not_found', { id }, 'ui_employee_get', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Empleado no encontrado', {
          entity_type: 'employee', entity_id: id
        });
      }
      return { status: 200, data: { employee } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.employee_get.failed', err, 'ui_employee_get');
    }
  }

  async handleEmployeeUpdate(data) {
    try {
      const id = data?.id;
      if (!id) {
        this._logError('staff-manager.ui.employee_update.validation_failed', { missing: 'id' }, 'ui_employee_update', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const { name, role, pin, active } = data;
      const employee = this.registry.updateEmployee(id, { name, role, pin, active });
      return { status: 200, data: { employee } };
    } catch (err) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('no encontrado') || msg.includes('not found')) {
        err._code    = 'RESOURCE_NOT_FOUND';
        err._details = { entity_type: 'employee', entity_id: data?.id };
      }
      return this._handleHandlerError('staff-manager.ui.employee_update.failed', err, 'ui_employee_update');
    }
  }

  async handleEmployeeDelete(data) {
    try {
      const id = data?.id;
      if (!id) {
        this._logError('staff-manager.ui.employee_delete.validation_failed', { missing: 'id' }, 'ui_employee_delete', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'id es requerido', { field: 'id' });
      }
      const ok = this.registry.deleteEmployee(id);
      if (!ok) {
        this._logError('staff-manager.ui.employee_delete.not_found', { id }, 'ui_employee_delete', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Empleado no encontrado', {
          entity_type: 'employee', entity_id: id
        });
      }
      return { status: 200, data: { deleted: true, id } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.employee_delete.failed', err, 'ui_employee_delete');
    }
  }

  // ==========================================
  // UI Handlers — Sesiones de jornada
  // ==========================================

  async handleTapIn(data) {
    try {
      const { employee_id, device_id } = data || {};
      if (!employee_id) {
        this._logError('staff-manager.ui.tap_in.validation_failed', { missing: 'employee_id' }, 'ui_tap_in', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'employee_id es requerido', { field: 'employee_id' });
      }
      const employee = this.registry.getEmployee(employee_id);
      if (!employee || !employee.active) {
        this._logError('staff-manager.ui.tap_in.not_found_or_inactive', { employee_id, active: employee?.active }, 'ui_tap_in', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Empleado no encontrado o inactivo', {
          entity_type: 'employee', entity_id: employee_id
        });
      }
      const result = await this.sessions.tapIn({ employee_id, device_id });
      return { status: 200, data: { employee, ...result } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.tap_in.failed', err, 'ui_tap_in');
    }
  }

  async handleTapOut(data) {
    try {
      const { employee_id } = data || {};
      if (!employee_id) {
        this._logError('staff-manager.ui.tap_out.validation_failed', { missing: 'employee_id' }, 'ui_tap_out', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'employee_id es requerido', { field: 'employee_id' });
      }
      const employee = this.registry.getEmployee(employee_id);
      if (!employee) {
        this._logError('staff-manager.ui.tap_out.not_found', { employee_id }, 'ui_tap_out', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Empleado no encontrado', {
          entity_type: 'employee', entity_id: employee_id
        });
      }
      const result = await this.sessions.tapOut({ employee_id });
      return { status: 200, data: { employee, ...result } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.tap_out.failed', err, 'ui_tap_out');
    }
  }

  async handleActiveSessions() {
    try {
      const sessions = this.sessions.listActiveSessions().map(s => ({
        ...s,
        employee: this.registry.getEmployee(s.employee_id)
      }));
      return { status: 200, data: { sessions } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.session_active.failed', err, 'ui_session_active');
    }
  }

  async handleSessionHistory(data) {
    try {
      const { employee_id, date } = data || {};
      let sessions;
      if (employee_id) {
        sessions = this.sessions.listSessionsByEmployee(employee_id);
      } else {
        const day = date || new Date().toISOString().split('T')[0];
        sessions  = this.sessions.listSessionsByDate(day).map(s => ({
          ...s,
          employee: this.registry.getEmployee(s.employee_id)
        }));
      }
      return { status: 200, data: { sessions } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.session_history.failed', err, 'ui_session_history');
    }
  }

  async handleManagerClose(data) {
    try {
      const { employee_id } = data || {};
      if (!employee_id) {
        this._logError('staff-manager.ui.manager_close.validation_failed', { missing: 'employee_id' }, 'ui_manager_close', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'employee_id es requerido', { field: 'employee_id' });
      }
      const session = await this.sessions.managerClose(employee_id);
      if (!session) {
        this._logError('staff-manager.ui.manager_close.no_active', { employee_id }, 'ui_manager_close', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay sesion activa para este empleado', {
          entity_type: 'session', entity_id: employee_id
        });
      }
      return { status: 200, data: { session } };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.manager_close.failed', err, 'ui_manager_close');
    }
  }

  async handleStaleSessions() {
    try {
      const stale = this.sessions.listStaleSessions().map(s => ({
        ...s,
        employee: this.registry.getEmployee(s.employee_id)
      }));
      return {
        status: 200,
        data: {
          max_shift_hours: this.sessions.maxShiftHours,
          stale_count:     stale.length,
          sessions:        stale
        }
      };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.session_stale.failed', err, 'ui_session_stale');
    }
  }

  // ==========================================
  // UI Handlers — NFC
  // ==========================================

  async handleNfcEmployeeCard(data) {
    try {
      const { employee_id } = data || {};
      if (!employee_id) {
        this._logError('staff-manager.ui.nfc_employee_card.validation_failed', { missing: 'employee_id' }, 'ui_nfc_employee_card', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'employee_id es requerido', { field: 'employee_id' });
      }
      const employee = this.registry.getEmployee(employee_id);
      if (!employee) {
        this._logError('staff-manager.ui.nfc_employee_card.not_found', { employee_id }, 'ui_nfc_employee_card', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Empleado no encontrado', {
          entity_type: 'employee', entity_id: employee_id
        });
      }
      const payload = NFCCard.generateEmployeeCard(employee);
      return {
        status: 200,
        data:   this._wrapNfcPayload(payload)
      };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.nfc_employee_card.failed', err, 'ui_nfc_employee_card');
    }
  }

  async handleNfcCoreTag() {
    try {
      const publicKeyPEM = await this._requestSecurityP2PPublicKey();
      if (!publicKeyPEM) {
        this._logError('staff-manager.ui.nfc_core_tag.dependency_unavailable', { dep: 'security-p2p' }, 'ui_nfc_core_tag', 'DEPENDENCY_UNAVAILABLE');
        return this._errorResponse(503, 'DEPENDENCY_UNAVAILABLE',
          'security-p2p no disponible — no response a security.public-key.request en el timeout',
          { dep: 'security-p2p' });
      }

      const coreId   = this.core?.config?.core?.id || 'event-core';
      const host     = this.core?.config?.http?.host || '127.0.0.1';
      const mqttPort = this.core?.config?.mqtt?.broker?.port || 1883;

      const payload = NFCCard.generateCoreInfoTag({
        core_id:  coreId,
        endpoint: `mqtt://${host}:${mqttPort}`,
        publicKeyPEM
      });
      return {
        status: 200,
        data:   this._wrapNfcPayload(payload)
      };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.nfc_core_tag.failed', err, 'ui_nfc_core_tag');
    }
  }

  async handleNfcParse(data) {
    try {
      const { raw } = data || {};
      if (!raw) {
        this._logError('staff-manager.ui.nfc_parse.validation_failed', { missing: 'raw' }, 'ui_nfc_parse', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'raw (JSON string o objeto) es requerido', { field: 'raw' });
      }

      let parsed;
      try {
        parsed = NFCCard.parsePayload(raw);
      } catch (parseErr) {
        this._logError('staff-manager.ui.nfc_parse.invalid_payload', { error: parseErr.message }, 'ui_nfc_parse', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', parseErr.message, { field: 'raw' });
      }
      return { status: 200, data: parsed };
    } catch (err) {
      return this._handleHandlerError('staff-manager.ui.nfc_parse.failed', err, 'ui_nfc_parse');
    }
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'AUTHENTICATION_REQUIRED' ? 401 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 : 500;
    const message = err.message || String(err);
    this.logger?.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('staff-manager.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrado')) return 'RESOURCE_NOT_FOUND';
    if (msg.includes('permission') || msg.includes('forbidden'))    return 'PERMISSION_DENIED';
    if (msg.includes('already exists'))                             return 'ALREADY_EXISTS';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      project_id:     sourcePayload?.project_id || payload?.project_id || DEFAULT_PROJECT_ID,
      timestamp:      new Date().toISOString(),
      module:         this.name,
      ...payload
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger?.error('staff-manager.publish_error', { event: name, error: err.message });
      this.metrics?.increment('staff-manager.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — bridge desde SessionManager (callback) hacia eventBus.publish
  async _emitSessionEvent(type, data) {
    const eventName = `staff.session.${type}`;
    await this._publicarEvento(eventName, { type, ...(data || {}) });

    // metric counters declarados en module.json
    if (type === 'tap_in')         this.metrics?.increment('staff.tap_in.count');
    else if (type === 'tap_out')   this.metrics?.increment('staff.tap_out.count');
    else if (type === 'auto_timeout') this.metrics?.increment('staff.auto_close.count');
    else if (type === 'manager_close') this.metrics?.increment('staff.manager_close.count');
  }

  // 6o helper — request/response via bus para obtener la clave publica de security-p2p.
  // Reemplaza el acceso directo moduleLoader.loadedModules.get('security-p2p') que violaba
  // el axioma maestro de event-core. El handler onPublicKeyRequest en security-p2p responde
  // publicando security.public-key.response con el mismo request_id.
  _requestSecurityP2PPublicKey() {
    if (!this.eventBus?.publish) return Promise.resolve(null);
    const request_id = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPublicKey.delete(request_id);
        resolve(null);
      }, this.publicKeyTimeoutMs);
      this.pendingPublicKey.set(request_id, { resolve, timer });
      this.eventBus.publish('security.public-key.request', {
        request_id,
        correlation_id: crypto.randomUUID(),
        timestamp:      new Date().toISOString()
      });
    });
  }

  // Handler subscribe — recibe security.public-key.response
  onPublicKeyResponse(event) {
    const source = event?.data || event || {};
    const { request_id, public_key } = source;
    const pending = this.pendingPublicKey.get(request_id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingPublicKey.delete(request_id);
    pending.resolve(public_key || null);
  }

  // ==========================================
  // Internals
  // ==========================================

  _logError(logEvent, fields, kind, code) {
    this.logger?.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('staff-manager.errors', { kind, code });
  }

  _wrapNfcPayload(payload) {
    const byte_size = NFCCard.byteSize(payload);
    return {
      payload,
      json_string:      NFCCard.serialize(payload),
      byte_size,
      ntag215_capacity: NTAG215_CAPACITY,
      fits:             byte_size <= NTAG215_CAPACITY
    };
  }
}

module.exports = StaffManagerModule;
