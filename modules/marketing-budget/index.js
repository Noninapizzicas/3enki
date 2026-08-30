'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const TIPOS_PARTIDA = ['canal', 'campaña', 'categoria', 'otro'];
const FUENTES_GASTO = ['manual', 'importado', 'automatizado'];

const TRANSICIONES_PARTIDA = {
  planificado: ['aprobado', 'cerrado'],
  aprobado:    ['activo', 'cerrado'],
  activo:      ['cerrado'],
  cerrado:     []
};

const STORE_VACIO = Object.freeze({
  esquema: 'marketing-budget-v1',
  presupuesto: { cantidad: null, moneda: 'EUR', periodo: { inicio: null, fin: null } },
  partidas: [],
  gastos: []
});

function clonar(obj) { return JSON.parse(JSON.stringify(obj)); }

class MarketingBudgetReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marketing-budget';
    this.version = 'reflejo-0.1.0';
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'marketing-budget.json',
      dir: '/prisma/marketing',
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

  onGetRequest(e) {
    return this._atender(e, 'get', 'marketing.budget.get.response', d => this._get(d));
  }

  onUpdateRequest(e) {
    return this._atender(e, 'update', 'marketing.budget.update.response', d => this._update(d));
  }

  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = clonar(STORE_VACIO);
      this._stores.set(pid, store);
      this._persist.marcarDirty(pid);
    }
    return store;
  }

  _calcularControl(store) {
    return store.partidas.map(p => {
      const gastado = store.gastos
        .filter(g => g.partida_id === p.id)
        .reduce((sum, g) => sum + (g.importe?.cantidad || 0), 0);
      const asignado = p.importe?.cantidad || 0;
      const diferencia = asignado - gastado;
      const porcentaje = asignado > 0 ? this._round((gastado / asignado) * 100) : 0;
      const semaforo = porcentaje >= 100 ? 'rojo' : porcentaje >= 80 ? 'amarillo' : 'verde';
      return { partida_id: p.id, nombre: p.nombre, asignado, gastado: this._round(gastado), diferencia: this._round(diferencia), porcentaje, semaforo };
    });
  }

  _get(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const control = this._calcularControl(store);
    const total_asignado = store.partidas.reduce((s, p) => s + (p.importe?.cantidad || 0), 0);
    const total_gastado = store.gastos.reduce((s, g) => s + (g.importe?.cantidad || 0), 0);

    return {
      status: 200,
      data: {
        project_id: pid,
        presupuesto: store.presupuesto,
        partidas: store.partidas,
        gastos: store.gastos,
        control,
        resumen: {
          total: store.presupuesto.cantidad,
          asignado: this._round(total_asignado),
          gastado: this._round(total_gastado),
          disponible: store.presupuesto.cantidad ? this._round(store.presupuesto.cantidad - total_asignado) : null
        }
      }
    };
  }

  _update(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };

    const store = this._obtenerOCrear(pid);
    const campos = [];

    if (input.presupuesto) {
      if (input.presupuesto.cantidad !== undefined) store.presupuesto.cantidad = input.presupuesto.cantidad;
      if (input.presupuesto.moneda !== undefined) store.presupuesto.moneda = input.presupuesto.moneda;
      if (input.presupuesto.periodo) store.presupuesto.periodo = { ...store.presupuesto.periodo, ...input.presupuesto.periodo };
      campos.push('presupuesto');
    }

    if (Array.isArray(input.partidas)) {
      for (const part of input.partidas) {
        if (!part.nombre && !part.id) continue;

        const existente = part.id ? store.partidas.find(p => p.id === part.id) : null;

        if (existente) {
          if (part.estado && part.estado !== existente.estado) {
            const validas = TRANSICIONES_PARTIDA[existente.estado] || [];
            if (!validas.includes(part.estado)) {
              return {
                status: 400,
                data: { error: 'INVALID_STATE_TRANSITION', message: `Partida '${existente.id}': transición ${existente.estado} → ${part.estado} no permitida`, transiciones_validas: validas }
              };
            }
            existente.estado = part.estado;
          }
          if (part.nombre !== undefined) existente.nombre = part.nombre;
          if (part.tipo !== undefined) existente.tipo = part.tipo;
          if (part.referencia !== undefined) existente.referencia = part.referencia;
          if (part.importe) existente.importe = { ...existente.importe, ...part.importe };
          if (part.periodo) existente.periodo = { ...existente.periodo, ...part.periodo };
        } else {
          const nueva = {
            id: part.id || crypto.randomUUID(),
            nombre: part.nombre,
            tipo: TIPOS_PARTIDA.includes(part.tipo) ? part.tipo : 'otro',
            referencia: part.referencia || null,
            importe: part.importe || { cantidad: 0, moneda: store.presupuesto.moneda },
            periodo: part.periodo || { ...store.presupuesto.periodo },
            estado: 'planificado'
          };

          if (store.presupuesto.cantidad) {
            const total_asignado = store.partidas.reduce((s, p) => s + (p.importe?.cantidad || 0), 0);
            if (total_asignado + (nueva.importe.cantidad || 0) > store.presupuesto.cantidad) {
              return {
                status: 400,
                data: { error: 'TECHO_SUPERADO', message: `Asignar ${nueva.importe.cantidad} superaría el presupuesto total (${store.presupuesto.cantidad}). Asignado actual: ${total_asignado}` }
              };
            }
          }

          store.partidas.push(nueva);
        }
      }
      campos.push('partidas');
    }

    if (Array.isArray(input.gastos)) {
      for (const gasto of input.gastos) {
        if (!gasto.partida_id || !gasto.importe) continue;

        const partida = store.partidas.find(p => p.id === gasto.partida_id);
        if (!partida) {
          return { status: 400, data: { error: 'PARTIDA_NOT_FOUND', message: `Partida '${gasto.partida_id}' no existe` } };
        }

        store.gastos.push({
          id: crypto.randomUUID(),
          partida_id: gasto.partida_id,
          fecha: new Date().toISOString(),
          importe: { cantidad: gasto.importe.cantidad, moneda: gasto.importe.moneda || store.presupuesto.moneda },
          concepto: gasto.concepto || '',
          fuente: FUENTES_GASTO.includes(gasto.fuente) ? gasto.fuente : 'manual'
        });

        const gastado_partida = store.gastos
          .filter(g => g.partida_id === gasto.partida_id)
          .reduce((s, g) => s + (g.importe?.cantidad || 0), 0);
        const asignado = partida.importe?.cantidad || 0;

        if (asignado > 0 && gastado_partida > asignado) {
          this._publicarEvento('marketing.budget.alerta', {
            project_id: pid,
            partida_id: partida.id,
            nombre: partida.nombre,
            asignado,
            gastado: this._round(gastado_partida)
          });
        }
      }
      campos.push('gastos');
    }

    this._persist.marcarDirty(pid);

    this._publicarEvento('marketing.budget.actualizado', {
      project_id: pid,
      campos_actualizados: campos
    });

    return { status: 200, data: { project_id: pid, campos_actualizados: campos } };
  }

  toolGet(params) { return this._get(params); }
  toolUpdate(params) { return this._update(params); }

  handleUiGet(msg, reply) {
    const data = msg.data || msg;
    const pid = data.project_id;
    if (typeof reply !== 'function') return this._get(data);
    if (!pid) return reply({ status: 400, error: 'project_id requerido' });
    return reply(this._get(data));
  }

  handleUiUpdate(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._update(data);
    return reply(this._update(data));
  }
}

module.exports = MarketingBudgetReflejo;
