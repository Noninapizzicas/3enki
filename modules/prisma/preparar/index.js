/**
 * prisma/preparar v0.2.0 — Reflejo JS: el CUSTODIO de la PREPARACIÓN + ENTREGA universal.
 *
 * La lógica de estados de cocina/pedidos de pizzepos, DESNOMBRADA de hostelería:
 * cualquier negocio que prepara lo que vendió (cocina · empaquetado · encargo ·
 * pick&pack) usa la misma máquina de estados. La lógica es universal; los nombres
 * de hostelería son instancias.
 *
 * ESTADOS BASE (default — desnombrados de cocina/pedidos de pizzepos):
 *   pendiente → preparando → listo → entregado
 *   entregado  ≡ recogido | enviado (según la forma de entrega)
 *   + cancelado (transversal, desde cualquier estado no terminal)
 *
 * AMPLIABLES (puerta abierta — por proyecto):
 *   El proyecto puede DECLARAR estados y transiciones extra sin tocar código:
 *     /prisma/preparar/config.json  →  { "estados": [{ "id": "enfriando", "desde": ["listo"] }] }
 *   El freno valida contra BASE ∪ CUSTOM. Un estado custom puede ser terminal
 *   (sin "desde") o intermedio.
 *
 * Transiciones BASE:
 *   pendiente  → preparando | cancelado
 *   preparando → listo      | cancelado
 *   listo      → entregado | recogido | enviado | cancelado
 *   entregado/recogido/enviado → (terminal)
 *   cancelado  → (terminal)
 *
 * Almacén: /prisma/preparar/<pedido_id>.json por proyecto (single-writer).
 * Nace de la VENTA (carrito/cobro/encargo): el caller pasa items + entrega_at?.
 *
 * Patrón: reflejo puro event-driven (preparar.<op>.request → .response).
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s) => typeof s === 'string' && UUID_RE.test(s);

// ── ESTADOS BASE (desnombrados de cocina/pedidos de pizzepos) ──────────────
// Fiel a la fuente: la cocina permite el TAP DIRECTO a 'listo' desde pendiente
// (un ítem que ya viene hecho salta el pase intermedio — cocina/index.js).
const ESTADOS_BASE = {
  pendiente:  { desde: [],           terminal: false },
  preparando: { desde: ['pendiente'], terminal: false },
  listo:      { desde: ['pendiente', 'preparando'], terminal: false },
  entregado:  { desde: ['listo'],    terminal: true },
  recogido:   { desde: ['listo'],    terminal: true },
  enviado:    { desde: ['listo'],    terminal: true },
  cancelado:  { desde: ['pendiente', 'preparando', 'listo'], terminal: true }
};

class PrismaPrepararReflejo extends BaseModule {
  constructor() {
    super();
    this.name = 'preparar';
    this.version = '0.2.0';
    this.basePath = path.join(process.cwd(), 'data', 'projects');
    this.projectPaths = new Map(); // project_id → storage root
    this.customEstados = new Map(); // project_id → { id: {desde, terminal} } (declarados por el proyecto)
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.eventBus = context.eventBus;
    this.logger.info('preparar.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.projectPaths.clear();
    this.customEstados.clear();
  }

  onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path } = data;
    if (!project_id) return;
    const storage = base_path ? path.join(base_path, 'storage') : path.join(this.basePath, project_id, 'storage');
    this.projectPaths.set(project_id, storage);
    fs.mkdir(path.join(storage, 'prisma', 'preparar'), { recursive: true }).catch(() => {});
    this._cargarEstadosCustom(project_id).catch(() => {});
  }

  // ==========================================
  // Estados: BASE ∪ CUSTOM (puerta abierta)
  // ==========================================

  // Carga /prisma/preparar/config.json si existe: { estados: [{ id, desde, terminal? }] }
  async _cargarEstadosCustom(project_id) {
    try {
      const dir = this._storeDir(project_id);
      const raw = await fs.readFile(path.join(dir, 'config.json'), 'utf-8');
      const cfg = JSON.parse(raw);
      const estados = {};
      for (const e of cfg.estados || []) {
        if (!e?.id || typeof e.id !== 'string') continue;
        estados[e.id] = { desde: Array.isArray(e.desde) ? e.desde : [], terminal: e.terminal === true };
      }
      if (Object.keys(estados).length > 0) {
        this.customEstados.set(project_id, estados);
        this.logger.info('preparar.estados_custom', { project_id, count: Object.keys(estados).length });
      }
    } catch (_) { /* sin config.json → solo estados base */ }
  }

  _estadosCompletos(project_id) {
    return { ...ESTADOS_BASE, ...(this.customEstados.get(project_id) || {}) };
  }

  // Valida que una transición a→b es legal contra BASE ∪ CUSTOM
  _validarTransicion(project_id, desde, hacia) {
    const estados = this._estadosCompletos(project_id);
    const destino = estados[hacia];
    if (!destino) {
      return { ok: false, error: `estado desconocido: ${hacia} (declarados: ${Object.keys(estados).join(', ')})` };
    }
    const permitidos = destino.desde;
    if (permitidos.length === 0 && !destino.terminal) {
      // Estado raíz: solo se entra desde el principio
      return { ok: desde === null, error: `${hacia} es un estado inicial — no se entra desde ${desde}` };
    }
    if (!permitidos.includes(desde)) {
      return { ok: false, error: `transición inválida: ${desde} → ${hacia} (solo desde: ${permitidos.join(', ')} o ninguna)` };
    }
    return { ok: true };
  }

  _esTerminal(project_id, estado) {
    const estados = this._estadosCompletos(project_id);
    const e = estados[estado];
    return e ? e.terminal : false;
  }

  // Estado agregado del pedido: si TODOS los ítems están en el MISMO estado
  // (base o custom), el pedido es ese estado. Si no, semántica de avance base:
  // listo ⟺ todos listo/terminal · preparando si alguno está en preparando.
  _estadoAgregado(project_id, pedido) {
    const items = pedido.items || [];
    if (items.length === 0) return 'pendiente';
    const primero = items[0].estado;
    if (items.every((i) => i.estado === primero)) return primero;
    const terminales = items.filter((i) => this._esTerminal(project_id, i.estado));
    if (terminales.length === items.length) return terminales[0].estado;
    if (items.every((i) => i.estado === 'listo' || this._esTerminal(project_id, i.estado))) return 'listo';
    if (items.some((i) => i.estado === 'preparando')) return 'preparando';
    return 'pendiente';
  }

  _serialize(project_id, pedido) {
    return { ...pedido, estado_agregado: this._estadoAgregado(project_id, pedido) };
  }

  // ==========================================
  // Helpers privados
  // ==========================================

  _storeDir(project_id) {
    const storage = this.projectPaths.get(project_id) || path.join(this.basePath, project_id, 'storage');
    return path.join(storage, 'prisma', 'preparar');
  }

  async _readPedido(project_id, pedido_id) {
    try {
      const raw = await fs.readFile(path.join(this._storeDir(project_id), `${pedido_id}.json`), 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  async _writePedido(project_id, pedido) {
    const dir = this._storeDir(project_id);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `${pedido.id}.json.tmp-${crypto.randomBytes(4).toString('hex')}`);
    await fs.writeFile(tmp, JSON.stringify(pedido, null, 2), 'utf-8');
    await fs.rename(tmp, path.join(dir, `${pedido.id}.json`));
  }

  // ==========================================
  // Handlers (preparar.<op>.request → .response)
  // ==========================================

  async handleCrear(data) {
    try {
      const { project_id, items, entrega_at, forma_entrega, reserva_id, cobro_id, notas } = data || {};
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { kind: 'domain', field: 'project_id' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'items (non-empty array) is required', { kind: 'domain', field: 'items' });
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      const pedido = {
        id,
        project_id,
        estado: 'pendiente',
        forma_entrega: forma_entrega || null, // recogida | enviado | cita
        items: items.map((it) => ({
          id: it.id || crypto.randomUUID(),
          producto_id: it.producto_id || null,
          nombre: it.nombre || 'item',
          cantidad: it.cantidad || 1,
          estado: 'pendiente'
        })),
        entrega_at: entrega_at || null,
        reserva_id: reserva_id || null,
        cobro_id: cobro_id || null,
        notas: notas || null,
        created_at: now,
        updated_at: now
      };
      await this._writePedido(project_id, pedido);

      await this._publicarEvento('preparar.creado', {
        pedido_id: id, project_id, entrega_at: pedido.entrega_at, forma_entrega: pedido.forma_entrega, correlation_id: data?.correlation_id
      });
      this.metrics?.increment('preparar.pedido.creado');
      return { status: 201, data: { pedido: this._serialize(project_id, pedido), pedido_id: id } };
    } catch (err) {
      return this._handleHandlerError('preparar.crear.failed', err, 'crear');
    }
  }

  async handleListar(data) {
    try {
      const { project_id, estado } = data || {};
      if (!project_id) {
        return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { kind: 'domain', field: 'project_id' });
      }
      const dir = this._storeDir(project_id);
      let files = [];
      try { files = await fs.readdir(dir); } catch (_) { /* dir no existe → [] */ }
      const pedidos = [];
      for (const f of files.filter((x) => x.endsWith('.json') && !x.includes('.tmp-') && x !== 'config.json')) {
        try {
          const p = JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8'));
          const agregado = this._estadoAgregado(project_id, p);
          if (estado && agregado !== estado) continue;
          pedidos.push(this._serialize(project_id, p));
        } catch (_) { /* fichero corrupto se salta */ }
      }
      pedidos.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      return { status: 200, data: { pedidos, count: pedidos.length } };
    } catch (err) {
      return this._handleHandlerError('preparar.listar.failed', err, 'listar');
    }
  }

  async handleGet(data) {
    try {
      const { project_id, pedido_id } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { kind: 'domain', field: 'project_id' });
      if (!pedido_id || !isUUID(pedido_id)) return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id must be a UUID', { kind: 'domain', field: 'pedido_id' });
      const pedido = await this._readPedido(project_id, pedido_id);
      if (!pedido) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { entity_type: 'pedido', entity_id: pedido_id });
      }
      return { status: 200, data: { pedido: this._serialize(project_id, pedido) } };
    } catch (err) {
      return this._handleHandlerError('preparar.get.failed', err, 'get');
    }
  }

  async handleEstado(data) {
    try {
      const { project_id, pedido_id, item_id, estado } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { kind: 'domain', field: 'project_id' });
      if (!pedido_id || !isUUID(pedido_id)) return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id must be a UUID', { kind: 'domain', field: 'pedido_id' });
      if (!estado) return this._errorResponse(400, 'INVALID_INPUT', 'estado is required', { kind: 'domain', field: 'estado' });

      const pedido = await this._readPedido(project_id, pedido_id);
      if (!pedido) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { entity_type: 'pedido', entity_id: pedido_id });
      }

      if (item_id) {
        // Transición de UN ítem
        const item = (pedido.items || []).find((i) => i.id === item_id);
        if (!item) {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Item no encontrado', { entity_type: 'item', entity_id: item_id });
        }
        const check = this._validarTransicion(project_id, item.estado, estado);
        if (!check.ok) {
          return this._errorResponse(409, 'CONFLICT_STATE', check.error, { pedido_id, item_id, estado_actual: item.estado });
        }
        item.estado = estado;
        item[`${estado}_at`] = Date.now();
      } else {
        // Transición AGREGADA (todo el pedido a la vez)
        const actual = this._estadoAgregado(project_id, pedido);
        if (this._esTerminal(project_id, actual)) {
          return this._errorResponse(409, 'CONFLICT_STATE', `El pedido ya está ${actual} (terminal)`, { pedido_id, estado_actual: actual });
        }
        const check = this._validarTransicion(project_id, actual, estado);
        if (!check.ok) {
          return this._errorResponse(409, 'CONFLICT_STATE', check.error, { pedido_id, estado_actual: actual });
        }
        for (const i of pedido.items) i.estado = estado;
        pedido.estado = estado;
      }

      pedido.updated_at = Date.now();
      pedido.estado = this._estadoAgregado(project_id, pedido);
      await this._writePedido(project_id, pedido);

      await this._publicarEvento('preparar.estado.cambiado', {
        pedido_id, project_id, item_id: item_id || null, estado: pedido.estado, correlation_id: data?.correlation_id
      });
      this.metrics?.increment('preparar.estado.cambiado', { estado: pedido.estado });
      return { status: 200, data: { pedido: this._serialize(project_id, pedido) } };
    } catch (err) {
      return this._handleHandlerError('preparar.estado.failed', err, 'estado');
    }
  }

  async handleCancelar(data) {
    try {
      const { project_id, pedido_id, motivo } = data || {};
      if (!project_id) return this._errorResponse(400, 'INVALID_INPUT', 'project_id is required', { kind: 'domain', field: 'project_id' });
      if (!pedido_id || !isUUID(pedido_id)) return this._errorResponse(400, 'INVALID_INPUT', 'pedido_id must be a UUID', { kind: 'domain', field: 'pedido_id' });
      const pedido = await this._readPedido(project_id, pedido_id);
      if (!pedido) {
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Pedido no encontrado', { entity_type: 'pedido', entity_id: pedido_id });
      }
      const actual = this._estadoAgregado(project_id, pedido);
      if (this._esTerminal(project_id, actual)) {
        return this._errorResponse(409, 'CONFLICT_STATE', `No se puede cancelar un pedido ${actual}`, { pedido_id, estado_actual: actual });
      }
      for (const i of pedido.items) i.estado = 'cancelado';
      pedido.estado = 'cancelado';
      pedido.cancelado_at = Date.now();
      pedido.motivo_cancelacion = motivo || null;
      pedido.updated_at = Date.now();
      await this._writePedido(project_id, pedido);
      await this._publicarEvento('preparar.cancelado', { pedido_id, project_id, correlation_id: data?.correlation_id });
      this.metrics?.increment('preparar.pedido.cancelado');
      return { status: 200, data: { pedido: this._serialize(project_id, pedido) } };
    } catch (err) {
      return this._handleHandlerError('preparar.cancelar.failed', err, 'cancelar');
    }
  }
}

module.exports = PrismaPrepararReflejo;
