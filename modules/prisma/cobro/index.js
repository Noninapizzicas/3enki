/**
 * prisma/cobro — REFLEJO JS: el PAGO universal.
 *
 * Copiado y generalizado de pizzepos/cobros. Cobra el total de un carrito:
 * efectivo (con cambio), tarjeta, bizum, transferencia, mixto (split). Ciclo
 * pendiente → completado → reembolsado. CAMBIO vs cobros: dinero en CÉNTIMOS
 * (coherente con carrito/opciones); toma el total del carrito (carrito.get) o
 * inline; sin llevadoo/cajón/link/qr (integraciones externas = follow-up).
 * Cierra el lazo mínimo de venta: carrito → cobro. v0.1 en memoria. Ver prisma.md.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();
const METODOS = new Set(['efectivo', 'tarjeta', 'bizum', 'transferencia', 'mixto']);
const NOMBRE = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum', transferencia: 'Transferencia', mixto: 'Mixto' };

class PrismaCobroReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cobro';
    this.version = 'reflejo-0.1.0';
    this.cobros = new Map();   // cobro_id → cobro
  }

  onCrearRequest(e)      { return this._atender(e, 'crear', 'cobro.crear.response', d => this._crear(d)); }
  onConfirmarRequest(e)  { return this._atender(e, 'confirmar', 'cobro.confirmar.response', d => this._confirmar(d)); }
  onReembolsarRequest(e) { return this._atender(e, 'reembolsar', 'cobro.reembolsar.response', d => this._reembolsar(d)); }
  onGetRequest(e)        { return this._atender(e, 'get', 'cobro.get.response', d => this._get(d)); }
  onListRequest(e)       { return this._atender(e, 'list', 'cobro.list.response', d => this._list(d)); }
  onMetodosRequest(e)    { return this._atender(e, 'metodos', 'cobro.metodos.response', d => this._metodos(d)); }

  _int(x) { return (typeof x === 'number' && Number.isFinite(x)) ? Math.round(x) : 0; }

  // split (mixto): cada parte con su método y su importe; la suma cuadra el total.
  _procesarMixto(desglose, monto_total) {
    if (!Array.isArray(desglose) || desglose.length === 0) return { error: 'desglose vacío' };
    let suma = 0; const out = [];
    for (const d of desglose) {
      if (!d || !METODOS.has(d.metodo) || d.metodo === 'mixto') return { error: `método inválido en desglose: ${d && d.metodo}` };
      const m = this._int(d.monto_centimos);
      if (m <= 0) return { error: 'monto de desglose <= 0' };
      suma += m; out.push({ metodo: d.metodo, monto_centimos: m });
    }
    if (suma !== monto_total) return { error: `el desglose (${suma}) no cuadra con el total (${monto_total})` };
    return { desglose: out };
  }

  async _crear(input) {
    if (!input.cuenta_id) return this._invalid('cuenta_id');
    if (!input.metodo_pago || !METODOS.has(input.metodo_pago)) {
      return this._errorResponse(400, 'INVALID_INPUT', `método de pago no soportado: ${input.metodo_pago}`, { field: 'metodo_pago', validos: [...METODOS] });
    }
    // total: inline o del carrito
    let monto = this._int(input.monto_centimos);
    if (!monto) {
      const r = await this._rpc('carrito.get.request', { cuenta_id: input.cuenta_id, project_id: input.project_id });
      monto = (r && r.status === 200 && r.data) ? this._int(r.data.total_centimos) : 0;
    }
    if (monto <= 0) return this._errorResponse(400, 'INVALID_INPUT', 'monto a cobrar debe ser > 0', { field: 'monto_centimos' });

    // idempotencia: un cobro activo por cuenta
    const activo = [...this.cobros.values()].find(c => c.cuenta_id === input.cuenta_id && ['pendiente', 'procesando', 'completado'].includes(c.estado));
    if (activo) return this._errorResponse(409, 'ALREADY_EXISTS', `ya existe un cobro ${activo.estado} para esta cuenta`, { entity_type: 'cobro', cuenta_id: input.cuenta_id, cobro_id: activo.id });

    const propina = this._int(input.propina_centimos);
    const monto_total = monto + propina;
    const cobro = {
      id: crypto.randomUUID(), cuenta_id: input.cuenta_id,
      monto_centimos: monto, propina_centimos: propina, monto_total_centimos: monto_total,
      metodo_pago: input.metodo_pago, estado: 'pendiente', created_at: nowISO()
    };

    if (input.metodo_pago === 'efectivo' && input.monto_recibido_centimos !== undefined) {
      const recibido = this._int(input.monto_recibido_centimos);
      cobro.monto_recibido_centimos = recibido;
      cobro.cambio_centimos = recibido - monto_total;
      if (cobro.cambio_centimos < 0) return this._errorResponse(400, 'INVALID_INPUT', 'monto recibido insuficiente', { faltan_centimos: -cobro.cambio_centimos });
    }
    if (input.metodo_pago === 'mixto') {
      const r = this._procesarMixto(input.desglose, monto_total);
      if (r.error) return this._errorResponse(400, 'INVALID_INPUT', r.error, { field: 'desglose' });
      cobro.desglose = r.desglose;
    }

    this.cobros.set(cobro.id, cobro);
    this.eventBus?.publish('cobro.iniciado', { cobro_id: cobro.id, cuenta_id: cobro.cuenta_id, monto_total_centimos: monto_total, metodo_pago: cobro.metodo_pago, project_id: input.project_id, correlation_id: input.correlation_id, timestamp: nowISO() });
    return { status: 201, data: cobro };
  }

  async _confirmar(input) {
    if (!input.id) return this._invalid('id');
    const cobro = this.cobros.get(input.id);
    if (!cobro) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cobro no existe', { entity_type: 'cobro', id: input.id });
    if (!['pendiente', 'procesando'].includes(cobro.estado)) return this._errorResponse(409, 'CONFLICT_STATE', `no se puede confirmar un cobro en estado ${cobro.estado}`, { estado_actual: cobro.estado });
    cobro.estado = 'completado';
    cobro.referencia_pago = input.referencia_pago || `REF_${crypto.randomUUID().slice(0, 8)}`;
    cobro.completado_at = nowISO();
    this.eventBus?.publish('cobro.procesado', { cobro_id: cobro.id, cuenta_id: cobro.cuenta_id, monto_total_centimos: cobro.monto_total_centimos, referencia_pago: cobro.referencia_pago, project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: cobro };
  }

  async _reembolsar(input) {
    if (!input.id) return this._invalid('id');
    const cobro = this.cobros.get(input.id);
    if (!cobro) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cobro no existe', { entity_type: 'cobro', id: input.id });
    if (cobro.estado !== 'completado') return this._errorResponse(409, 'CONFLICT_STATE', 'solo se reembolsan cobros completados', { estado_actual: cobro.estado });
    cobro.estado = 'reembolsado';
    cobro.motivo_reembolso = input.motivo || null;
    cobro.reembolsado_at = nowISO();
    this.eventBus?.publish('cobro.reembolsado', { cobro_id: cobro.id, cuenta_id: cobro.cuenta_id, monto_reembolsado_centimos: cobro.monto_total_centimos, motivo: cobro.motivo_reembolso, project_id: input.project_id, timestamp: nowISO() });
    return { status: 200, data: cobro };
  }

  _get(input) {
    if (!input.id) return this._invalid('id');
    const cobro = this.cobros.get(input.id);
    if (!cobro) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cobro no existe', { entity_type: 'cobro', id: input.id });
    return { status: 200, data: cobro };
  }

  _list(input) {
    let out = [...this.cobros.values()];
    if (input && input.cuenta_id) out = out.filter(c => c.cuenta_id === input.cuenta_id);
    if (input && input.estado) out = out.filter(c => c.estado === input.estado);
    return { status: 200, data: { cobros: out, total: out.length } };
  }

  _metodos() {
    return { status: 200, data: { metodos: [...METODOS].map(id => ({ id, nombre: NOMBRE[id] })) } };
  }
}

module.exports = PrismaCobroReflejo;
