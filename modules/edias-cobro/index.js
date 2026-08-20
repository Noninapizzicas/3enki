'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * edias-cobro — REFLEJO JS (mitad determinista del módulo híbrido).
 * El ESLABÓN que cierra el flujo pedido → cobro. Pago ANTICIPADO al hacer el
 * pedido (respondido 2026-08-20), vinculado a la cuenta del cliente, con la
 * política de descuentos ACTIVA ya aplicada en el total del presupuesto.
 *
 * Flujo:
 *   edias.presupuesto.generado ──► crea cobro PENDIENTE (pago anticipado)
 *   edias.cobro.crear.request  ──► cobro vinculado a cuenta, conduce pago-gateway
 *   pago.confirmado            ──► marca el cobro PAGADO (libera el pedido)
 *
 * El cobro NUNCA inventa el monto: lo toma del presupuesto (que ya aplicó la
 * política del admin). Si el presupuesto es incompleto, no hay cobro (no se
 * cobra un precio que no existe). Degradable: sin pasarela configurada, el
 * cobro queda PENDIENTE y se confirma manualmente (pago en efectivo/transferencia).
 */

class EdiasCobroReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'edias-cobro';
    this.version = '0.1.0';
    this._cobros = new Map(); // cobro_id -> cobro
  }

  // ── handlers RPC (una línea) ──
  onCrearRequest(e)    { return this._atender(e, 'crear',    'edias.cobro.crear.response',    d => this._crear(d)); }
  onObtenerRequest(e)  { return this._atender(e, 'obtener',  'edias.cobro.obtener.response',  d => this._obtener(d)); }
  onListarRequest(e)   { return this._atender(e, 'listar',   'edias.cobro.listar.response',   d => this._listar(d)); }
  onConfirmarRequest(e){ return this._atender(e, 'confirmar','edias.cobro.confirmar.response',d => this._confirmar(d)); }

  // ── fire-and-forget: el presupuesto generado dispara el cobro anticipado ──
  async onPresupuestoGenerado(event) {
    const d = (event && event.data) || event || {};
    if (!d.presupuesto_id || d.estado !== 'completo') return; // incompleto → no se cobra
    const cobro = this._nuevoCobro({
      presupuesto_id: d.presupuesto_id,
      pieza_id: d.pieza_id,
      cantidad: d.cantidad,
      monto: d.total,
      cuenta_id: d.cuenta_id || null,
      correlation_id: d.correlation_id || null,
    });
    this._cobros.set(cobro.cobro_id, cobro);
    this.eventBus?.publish('edias.cobro.creado', cobro);
    this.metrics?.increment('edias-cobro.reflejo.served', { op: 'presupuesto_generado' });
  }

  // ── NÚCLEO: crear un cobro (pago anticipado) ──
  async _crear(input) {
    const { presupuesto_id, cuenta_id, monto, pieza_id, cantidad } = input;
    if (!presupuesto_id) return this._invalid('presupuesto_id');
    if (typeof monto !== 'number' || monto <= 0) {
      return this._errorResponse(422, 'PRECONDITION_FAILED', 'sin_monto', { presupuesto_id });
    }
    // Idempotencia: un presupuesto solo se cobra una vez.
    for (const c of this._cobros.values()) {
      if (c.presupuesto_id === presupuesto_id) {
        return { status: 200, data: c }; // ya existe → devuelve el mismo
      }
    }
    const cobro = this._nuevoCobro({
      presupuesto_id, pieza_id, cantidad, monto,
      cuenta_id: cuenta_id || null,
      correlation_id: input.correlation_id || null,
    });
    this._cobros.set(cobro.cobro_id, cobro);
    this.eventBus?.publish('edias.cobro.creado', cobro);

    // Pago ANTICIPADO: conduce el pago-gateway (si hay pasarela configurada).
    const gateway = await this._rpc('pago.iniciar.request', {
      pedido_id: cobro.cobro_id,
      monto_centimos: Math.round(cobro.monto * 100),
      concepto: `Pieza ${pieza_id || ''} x${cantidad || 1}`.trim(),
      project_id: input.project_id,
    }, { timeout_ms: 15000 });
    if (gateway && gateway.status === 200 && gateway.data?.checkout_url) {
      cobro.estado = 'procesando';
      cobro.checkout_url = gateway.data.checkout_url;
      cobro.session_id = gateway.data.session_id;
      cobro.pasarela = gateway.data.pasarela;
    } else if (gateway && gateway.status === 503) {
      // Sin pasarela → queda PENDIENTE, se confirma manualmente (efectivo/transferencia).
      cobro.estado = 'pendiente';
      cobro.pasarela = null;
    } else {
      cobro.estado = 'pendiente';
      cobro.pasarela = null;
    }
    this.metrics?.increment('edias-cobro.reflejo.served', { op: 'crear', estado: cobro.estado });
    return { status: 200, data: cobro };
  }

  // ── obtener un cobro por id ──
  async _obtener(input) {
    const { cobro_id } = input;
    if (!cobro_id) return this._invalid('cobro_id');
    const cobro = this._cobros.get(cobro_id);
    if (!cobro) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cobro no encontrado', { cobro_id });
    return { status: 200, data: cobro };
  }

  // ── listar cobros (por cuenta o todos) ──
  async _listar(input) {
    const { cuenta_id, estado } = input;
    let lista = [...this._cobros.values()];
    if (cuenta_id) lista = lista.filter(c => c.cuenta_id === cuenta_id);
    if (estado) lista = lista.filter(c => c.estado === estado);
    lista.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return { status: 200, data: { cobros: lista, total: lista.length } };
  }

  // ── confirmar un cobro (pago recibido) ──
  async _confirmar(input) {
    const { cobro_id, referencia_pago } = input;
    if (!cobro_id) return this._invalid('cobro_id');
    const cobro = this._cobros.get(cobro_id);
    if (!cobro) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'cobro no encontrado', { cobro_id });
    if (cobro.estado === 'pagado') return { status: 200, data: cobro }; // idempotente
    cobro.estado = 'pagado';
    cobro.pagado_ts = Date.now();
    cobro.referencia_pago = referencia_pago || null;
    this.eventBus?.publish('edias.cobro.pagado', cobro); // libera el pedido
    this.metrics?.increment('edias-cobro.reflejo.served', { op: 'confirmar', estado: 'pagado' });
    return { status: 200, data: cobro };
  }

  // ── fire-and-forget: pago.confirmado (webhook pasarela) marca el cobro pagado ──
  async onPagoConfirmado(event) {
    const d = (event && event.data) || event || {};
    const cobro = d.pedido_id ? this._cobros.get(d.pedido_id) : null;
    if (!cobro || cobro.estado === 'pagado') return;
    cobro.estado = 'pagado';
    cobro.pagado_ts = Date.now();
    cobro.session_id = d.session_id || cobro.session_id;
    cobro.pasarela = d.pasarela || cobro.pasarela;
    this.eventBus?.publish('edias.cobro.pagado', cobro);
    this.metrics?.increment('edias-cobro.reflejo.served', { op: 'pago_confirmado' });
  }

  // ── helper: construir un cobro nuevo ──
  _nuevoCobro({ presupuesto_id, pieza_id, cantidad, monto, cuenta_id, correlation_id }) {
    return {
      cobro_id: this._id('cob'),
      presupuesto_id,
      pieza_id: pieza_id || null,
      cantidad: cantidad || 1,
      monto,
      cuenta_id,
      correlation_id: correlation_id || null,
      estado: 'pendiente', // pendiente → procesando → pagado
      checkout_url: null,
      session_id: null,
      pasarela: null,
      referencia_pago: null,
      pagado_ts: null,
      ts: Date.now(),
    };
  }

  _id(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
}

module.exports = EdiasCobroReflejo;
