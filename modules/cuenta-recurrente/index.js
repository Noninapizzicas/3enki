'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const DESCUENTO_RECURRENCIA = 0.10; // 10% por recurrencia
const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const STORE_VACIO = Object.freeze({
  esquema: 'cuenta-recurrente-v1',
  cuentas: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class CuentaRecurrenteReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cuenta-recurrente';
    this.version = 'reflejo-1.0.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cuenta-recurrente.json',
      dir: '/prisma/cuenta-recurrente',
      snapshot: (pid) => {
        const s = this._stores.get(pid);
        return s ? { project_id: pid, store: s } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.store) this._stores.set(pid, data.store);
      }
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

  // =============================================================
  // Handlers RPC (una linea cada uno, delegan a _atender)
  // =============================================================
  onActivarRequest(e) {
    return this._atender(e, 'activar', 'cuenta-recurrente.activar.response', d => this._activar(d));
  }
  onDesactivarRequest(e) {
    return this._atender(e, 'desactivar', 'cuenta-recurrente.desactivar.response', d => this._desactivar(d));
  }
  onGenerarSemanaRequest(e) {
    return this._atender(e, 'generar_semana', 'cuenta-recurrente.generar_semana.response', d => this._generarSemana(d));
  }
  onTickSemanal(e) {
    const d = (e && (e.data || e)) || {};
    return this._recordarSemanal(d);
  }

  // =============================================================
  // Store
  // =============================================================
  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = clonar(STORE_VACIO);
      this._stores.set(pid, store);
      this._persist.marcarDirty(pid);
    }
    return store;
  }

  _buscarCuenta(store, cuenta_id) {
    return store.cuentas.find(c => c.id === cuenta_id);
  }

  // =============================================================
  // Proyecciones
  // =============================================================
  _activar(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    if (!input.cliente_nombre) return { status: 400, data: { error: 'INVALID_INPUT', message: 'cliente_nombre requerido' } };
    if (!input.pedido_base) return { status: 400, data: { error: 'INVALID_INPUT', message: 'pedido_base requerido' } };
    if (!input.dia_semana || !DIAS_SEMANA.includes(input.dia_semana)) {
      return { status: 400, data: { error: 'INVALID_INPUT', message: `dia_semana requerido (${DIAS_SEMANA.join(', ')})` } };
    }

    const store = this._obtenerOCrear(pid);
    const cuenta = {
      id: input.cuenta_id || crypto.randomUUID(),
      cliente_nombre: input.cliente_nombre,
      cliente_telefono: input.cliente_telefono || null,
      pedido_base: clonar(input.pedido_base), // items + total_centimos del pedido base
      dia_semana: input.dia_semana,
      descuento_pct: DESCUENTO_RECURRENCIA,
      estado: 'ACTIVA',
      creada_en: new Date().toISOString(),
      ultima_semana_generada: null
    };
    store.cuentas.push(cuenta);
    this._persist.marcarDirty(pid);

    this._publicarEvento('cuenta-recurrente.activada', {
      project_id: pid,
      cuenta_id: cuenta.id,
      cliente_nombre: cuenta.cliente_nombre,
      dia_semana: cuenta.dia_semana
    });

    return { status: 200, data: { project_id: pid, cuenta } };
  }

  _desactivar(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    if (!input.cuenta_id) return { status: 400, data: { error: 'INVALID_INPUT', message: 'cuenta_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const cuenta = this._buscarCuenta(store, input.cuenta_id);
    if (!cuenta) return { status: 404, data: { error: 'RESOURCE_NOT_FOUND', message: `Cuenta recurrente '${input.cuenta_id}' no existe` } };

    cuenta.estado = 'INACTIVA';
    this._persist.marcarDirty(pid);

    this._publicarEvento('cuenta-recurrente.desactivada', {
      project_id: pid,
      cuenta_id: cuenta.id
    });

    return { status: 200, data: { project_id: pid, cuenta_id: cuenta.id, estado: 'INACTIVA' } };
  }

  _generarSemana(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    if (!input.cuenta_id) return { status: 400, data: { error: 'INVALID_INPUT', message: 'cuenta_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const cuenta = this._buscarCuenta(store, input.cuenta_id);
    if (!cuenta) return { status: 404, data: { error: 'RESOURCE_NOT_FOUND', message: `Cuenta recurrente '${input.cuenta_id}' no existe` } };
    if (cuenta.estado !== 'ACTIVA') {
      return { status: 409, data: { error: 'CONFLICT_STATE', message: 'La cuenta recurrente no esta ACTIVA' } };
    }

    // Estado ilegal imposible: ACTIVA sin pedido base
    if (!cuenta.pedido_base || !Array.isArray(cuenta.pedido_base.items) || cuenta.pedido_base.items.length === 0) {
      return { status: 409, data: { error: 'CONFLICT_STATE', message: 'Cuenta ACTIVA sin pedido base' } };
    }

    const fecha_semana = input.fecha_semana || new Date().toISOString().slice(0, 10);
    const pedido = this._generarPedidoSemana(cuenta, fecha_semana);

    this._persist.marcarDirty(pid);

    this._publicarEvento('cuenta-recurrente.pedido_generado', {
      project_id: pid,
      cuenta_id: cuenta.id,
      fecha_semana,
      pedido
    });

    return { status: 200, data: { project_id: pid, cuenta_id: cuenta.id, fecha_semana, pedido } };
  }

  // =============================================================
  // Proyecciones internas (del plan)
  // =============================================================
  _generarPedidoSemana(cuenta, fecha_semana) {
    // Clona el pedido base con la fecha de la semana
    const items = clonar(cuenta.pedido_base.items || []);
    const total_base_centimos = cuenta.pedido_base.total_centimos || 0;
    const total_descuento = this._aplicarDescuento(total_base_centimos);

    return {
      cliente_nombre: cuenta.cliente_nombre,
      cliente_telefono: cuenta.cliente_telefono,
      fecha_semana,
      items,
      total_base_centimos,
      descuento_pct: cuenta.descuento_pct,
      descuento_centimos: Math.round(total_base_centimos * cuenta.descuento_pct),
      total_centimos: total_descuento,
      estado: 'PENDIENTE_PAGO'
    };
  }

  _aplicarDescuento(total_centimos) {
    // 10% por recurrencia
    return Math.round(total_centimos * (1 - DESCUENTO_RECURRENCIA));
  }

  async _recordarSemanal(d) {
    const pid = d.project_id;
    if (!pid) return;
    const store = this._stores.get(pid);
    if (!store) return;

    const activas = store.cuentas.filter(c => c.estado === 'ACTIVA');
    for (const cuenta of activas) {
      // El recordatorio solo se envia con ok:true del proveedor (notificador-pedidos)
      const resp = await this._rpc('notificar.request', {
        project_id: pid,
        canal: 'whatsapp',
        destino: cuenta.cliente_telefono,
        mensaje: `¿Repites esta semana, ${cuenta.cliente_nombre}? Tu pedido de ${cuenta.dia_semana} te espera.`
      });
      if (resp && resp.ok) {
        this._publicarEvento('cuenta-recurrente.recordatorio_enviado', {
          project_id: pid,
          cuenta_id: cuenta.id,
          cliente_nombre: cuenta.cliente_nombre
        });
      }
    }
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
    }
  }

  // =============================================================
  // Tools (para el LLM / UI)
  // =============================================================
  toolActivar(params) { return this._activar(params); }
  toolDesactivar(params) { return this._desactivar(params); }
  toolGenerarSemana(params) { return this._generarSemana(params); }

  handleUiActivar(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._activar(data);
    return reply(this._activar(data));
  }
  handleUiDesactivar(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._desactivar(data);
    return reply(this._desactivar(data));
  }
  handleUiGenerarSemana(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._generarSemana(data);
    return reply(this._generarSemana(data));
  }
}

module.exports = CuentaRecurrenteReflejo;
