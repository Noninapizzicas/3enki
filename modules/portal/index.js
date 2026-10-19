/**
 * portal — la PUERTA de Enki hacia agentes externos (MCP) y operadores.
 *
 * Superficie de capacidades GUARDADA sobre lo que ya existe: getToolsForAI() (catálogo)
 * + executeTool() (dispatcher). Un cliente externo (Claude Code, Cursor) habla con esta
 * puerta vía el bridge MCP (mcp/enki-mcp-server.js) sobre ui/request/portal/*.
 *
 * El poder no es nuevo (215 tools ya existen). Lo nuevo es el GUARD:
 *   - INTERRUPTOR  'portal-mcp' (OFF por defecto): kill-switch en caliente. OFF = puerta cerrada.
 *   - SCOPE        'project' (default) | 'system': scope=project no sale de su project_id ni toca
 *                  tools de sistema. scope=system abre cross-project + tools de sistema (cargado).
 *   - MODE         'read' (default) | 'write': read solo expone/llama tools de LECTURA (sin mutación).
 *   - ALLOWLIST    opcional: si se define, SOLO esas tools (la lista manda sobre todo lo demás).
 *   - AUDIT        cada acceso emite portal.invocado → la propiocepción lo capta (nada invisible).
 *   - CONFIRMATION una tool con confirmation:true exige flag confirmado (las mutaciones piden visto bueno).
 *
 * Nace SCOPED-A-PROYECTO, MODO READ, e INTERRUPTOR OFF (aparcado). El camino seguro primero;
 * scope=system y mutaciones se abren cuando el guard esté rodado.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

// Una tool MUTA si confirmation:true o su acción casa estos verbos. El resto = lectura.
const VERBOS_ESCRITURA = /(?:^|[._-])(crear|create|add|agregar|anadir|update|actualizar|edit|editar|delete|eliminar|remove|quitar|borrar|save|guardar|set|write|escribir|enviar|send|start|arrancar|trigger|cancel|cancelar|reload|recargar|toggle|aprobar|rechazar|register|registrar|flash|build|procesar|ota|abrir|confirm|confirmar|refund|reembolsar|clonar|restore|restaurar)(?:$|[._-])/i;

// Prefijos (dominio) considerados de SISTEMA: solo accesibles con scope=system.
const PREFIJOS_SISTEMA = new Set([
  'db', 'module', 'interruptor', 'interruptores', 'plugin', 'code', 'security',
  'certificate-authority', 'gateways', 'channel', 'composition', 'admin'
]);

class PortalModule extends BaseModule {
  constructor() {
    super();
    this.name = 'portal';
    this.version = '0.2.0';
    this.config = null;
    this.moduleLoader = null;
    this.activo = false;          // interruptor 'portal-mcp' — OFF por defecto (puerta cerrada)
    this.activoWrite = false;     // interruptor 'portal-mcp-write' — OFF por defecto (solo lectura)
    this.mode = 'read';           // derivado: 'write' si activoWrite, si no 'read'
    this.scope = 'project';       // 'project' | 'system'
    this.projectId = null;        // scope=project: el único proyecto permitido
    this.allowlist = null;        // Array<string> | null (null = sin lista explícita)
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.moduleLoader = context.moduleLoader || null;
    this.config = context.moduleConfig || {};

    this.activo = this.config.portal_enabled_default === true;   // por defecto false
    this.activoWrite = this.config.mode === 'write';             // por defecto false (read)
    this.mode = this.activoWrite ? 'write' : 'read';
    this.scope = this.config.scope === 'system' ? 'system' : 'project';
    this.projectId = this.config.project_id || null;
    this.allowlist = Array.isArray(this.config.allowlist) && this.config.allowlist.length
      ? new Set(this.config.allowlist) : null;

    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'portal-mcp', label: 'Portal MCP (puerta de entrada externa)', grupo: 'sistema',
        descripcion: 'Expone las capacidades de Enki a agentes externos (Claude Code/Cursor) vía MCP. OFF = puerta cerrada. Nace scoped-a-proyecto.',
        default: this.activo
      });
      this.eventBus.publish('interruptor.registrar', {
        id: 'portal-mcp-write', label: 'Portal MCP · escritura', grupo: 'sistema',
        descripcion: 'OFF = el portal solo LEE (no expone ni ejecuta mutaciones). ON = permite OPERAR (crear/editar/borrar) dentro del scope. Independiente de portal-mcp.',
        default: this.activoWrite
      });
    } catch (_) { /* el panel puede no estar aún; se re-registra al recargar */ }

    this.logger?.info('portal.loaded', {
      module: this.name, version: this.version,
      activo: this.activo, mode: this.mode, scope: this.scope, allowlist: this.allowlist ? this.allowlist.size : 0
    });
  }

  async onUnload() {
    this.logger?.info('portal.unloaded', { module: this.name });
  }

  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'portal-mcp') {
      this.activo = !!d.enabled;
      this.logger?.warn('portal.toggled', { activo: this.activo });
    } else if (d.id === 'portal-mcp-write') {
      this.activoWrite = !!d.enabled;
      this.mode = this.activoWrite ? 'write' : 'read';   // el guard lee this.mode
      this.logger?.warn('portal.write.toggled', { mode: this.mode });
    }
  }

  // ── ¿esta tool pasa el guard de SCOPE/MODE/ALLOWLIST? ──
  _permitida(tool) {
    const name = tool.name || '';
    if (this.allowlist) return this.allowlist.has(name);           // la lista explícita manda
    const dominio = name.split('.')[0];
    if (this.scope !== 'system' && PREFIJOS_SISTEMA.has(dominio)) return false;  // sistema solo en scope=system
    if (this.mode !== 'write' && this._esEscritura(tool)) return false;          // mutaciones solo en write
    return true;
  }

  _esEscritura(tool) {
    if (tool.confirmation === true) return true;
    return VERBOS_ESCRITURA.test(tool.name || '');
  }

  // ── catálogo guardado: lo que el cliente externo PUEDE ver ──
  async handleListTools() {
    try {
      if (!this.activo) return { status: 200, data: { tools: [], cerrado: true } };  // puerta cerrada → catálogo vacío
      const todas = this.moduleLoader?.getToolsForAI?.() || [];
      const tools = todas.filter(t => this._permitida(t)).map(t => ({
        name: t.name, description: t.description, parameters: t.parameters, escritura: this._esEscritura(t)
      }));
      return { status: 200, data: { tools, total: tools.length, mode: this.mode, scope: this.scope } };
    } catch (err) {
      return this._handleHandlerError('portal.list_tools.failed', err, 'list_tools');
    }
  }

  // ── llamada guardada: el cliente externo INVOCA una tool ──
  async handleCall(data) {
    const { tool, args, project_id, confirmado } = data || {};
    try {
      if (!this.activo) return this._errorResponse(503, 'PORTAL_CERRADO', 'el portal MCP está apagado (interruptor portal-mcp)', { kind: 'kill_switch' });
      if (!tool || typeof tool !== 'string') return this._invalid('tool');

      const def = this.moduleLoader?.getTool?.(tool);
      if (!def) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `tool no encontrada: ${tool}`, { entity_type: 'tool', entity_ref: tool });
      if (!this._permitida({ name: tool, confirmation: def.confirmation })) {
        return this._errorResponse(403, 'PERMISSION_DENIED', `tool fuera del scope/modo del portal: ${tool}`,
          { kind: 'guard', mode: this.mode, scope: this.scope });
      }

      const argv = (args && typeof args === 'object') ? { ...args } : {};
      // scope=project: no se sale del proyecto permitido (si está fijado), e inyecta project_id.
      if (this.scope === 'project') {
        if (this.projectId) {
          if (argv.project_id && argv.project_id !== this.projectId) {
            return this._errorResponse(403, 'PERMISSION_DENIED', 'fuera del proyecto del portal', { kind: 'scope', permitido: this.projectId });
          }
          argv.project_id = this.projectId;
        } else if (project_id) {
          argv.project_id = project_id;
        }
      } else if (project_id && !argv.project_id) {
        argv.project_id = project_id;
      }

      // ENDURECIDO: una MUTACIÓN en scope=project no se ejecuta sin project_id resuelto
      // (nunca se muta "global" por descuido). Las lecturas sí pueden ir sin proyecto.
      if (this.scope === 'project' && this._esEscritura({ name: tool, confirmation: def.confirmation }) && !argv.project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', `mutación '${tool}' requiere project_id en scope=project`, { kind: 'write_sin_proyecto' });
      }

      // confirmación: las mutaciones que la exigen requieren flag explícito
      if (def.confirmation === true && confirmado !== true) {
        return this._errorResponse(409, 'NEEDS_CONFIRMATION', `la tool ${tool} requiere confirmación (confirmado:true)`, { kind: 'confirmation' });
      }

      const t0 = Date.now();
      const result = await this.moduleLoader.executeTool(tool, argv);
      this._auditar(tool, true, Date.now() - t0);
      return { status: 200, data: { tool, result } };
    } catch (err) {
      this._auditar(tool, false, 0, err?.message);
      return this._handleHandlerError('portal.call.failed', err, 'call');
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        module: this.name, version: this.version,
        activo: this.activo, write: this.activoWrite, mode: this.mode, scope: this.scope,
        project_id: this.projectId, allowlist: this.allowlist ? Array.from(this.allowlist) : null
      }
    };
  }

  // AUDIT: cada acceso queda en el bus → la propiocepción lo capta (nada invisible).
  _auditar(tool, ok, ms, error) {
    try {
      this.eventBus.publish('portal.invocado', {
        tool, ok, duracion_ms: ms, scope: this.scope, mode: this.mode,
        error: error || null, correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this.metrics?.increment('portal.invocado.total', { ok: String(ok) });
    } catch (_) { /* best-effort */ }
  }
}

module.exports = PortalModule;
