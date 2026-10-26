/**
 * clientes.js — CLIENTE DE SIEMPRE y COBRO CON TARJETA GUARDADA (SumUp Customers API).
 *
 * POR QUÉ EXISTE: un negocio de plataforma no cobra solo "un pedido": cobra a una PERSONA que
 * vuelve. Este módulo es la puerta a eso, genérica para cualquier proyecto —una panadería con
 * reparto semanal, un taller con plazos, una reserva con señal—:
 *
 *   1. ALTA de cliente          POST /v0.1/customers           {customer_id, personal_details}
 *   2. LEER / ACTUALIZAR         GET|PUT /v0.1/customers/{id}   (solo personal_details)
 *   3. TARJETAS GUARDADAS        GET /v0.1/customers/{id}/payment-instruments
 *                                DELETE …/payment-instruments/{token}  (204, desactivar)
 *   4. COBRO CON LA GUARDADA     POST /v0.1/checkouts  →  PUT /v0.1/checkouts/{id}
 *                                con {payment_type:'card', token, customer_id}
 *
 * LA TOKENIZACIÓN NO ES UNA LÍNEA, Y HAY QUE DECIRLO: la tarjeta se guarda cuando el cliente
 * CONSENTE en la pantalla de SumUp con un checkout `purpose: SETUP_RECURRING_PAYMENT` (cargo de
 * autorización que SumUp devuelve al instante). Ese consentimiento se recoge con el Payment
 * Widget; el órgano sirve esa página él mismo (GET /pago/widget/...), así que un proyecto nuevo
 * no escribe frontend. El token resultante queda ligado a un MANDATO (`mandate.type/recurrent`,
 * `status/active`) que es la prueba del consentimiento para los cobros siguientes.
 *
 * SIN endpoint de "charge with token" NO hay recurrencia: aquí SÍ lo hay — `PUT /v0.1/checkouts/{id}`
 * (ProcessCheckout de la spec) acepta `token` + `customer_id`. Todo el cobro posterior es
 * servidor-a-servidor, sin que el cliente vuelva a teclear nada.
 */

'use strict';

/**
 * Normaliza una tarjeta guardada. El `token` es lo único que hace falta para cobrar; el resto
 * es para que el dueño reconozca la tarjeta en pantalla.
 */
function normalizarTarjeta(t = {}) {
  return {
    token: t.token || null,
    activa: t.active !== false,
    tipo: t.type || 'card',
    ultimos4: t.card?.last_4_digits || null,
    marca: t.card?.type || null,
    mandato: t.mandate
      ? { tipo: t.mandate.type || null, estado: t.mandate.status || null, merchant_code: t.mandate.merchant_code || null }
      : null,
    alta: t.created_at || null,
    // Una tarjeta sin mandato activo no se puede cobrar sin el cliente delante.
    cobrable_sin_cliente: !!(t.active !== false && t.mandate && String(t.mandate.status).toLowerCase() === 'active')
  };
}

class ClientesSumUp {
  constructor({ call, merchant, moneda = 'EUR', logger = null }) {
    if (!merchant) throw new Error('ClientesSumUp exige merchant code');
    this.call = call;
    this.merchant = merchant;
    this.moneda = String(moneda || 'EUR').toUpperCase();
    this.logger = logger;
  }

  _err(r, prefijo = 'SumUp cliente') {
    const msg = r?.data?.message || r?.data?.error_message || r?.data?.detail || r?.data?.error_code
      || (r?.text || '').slice(0, 300) || r?.message || `HTTP ${r?.status}`;
    let code = 'UPSTREAM_INVALID_RESPONSE';
    if (r?.network) code = r.code || 'UPSTREAM_UNREACHABLE';
    else if (r?.status === 401 || r?.status === 403) code = 'PERMISSION_DENIED';
    else if (r?.status === 400 || r?.status === 422) code = 'INVALID_INPUT';
    else if (r?.status === 404) code = 'NOT_FOUND';
    else if (r?.status === 409) code = 'CONFLICT';
    else if (r?.status === 429) code = 'UPSTREAM_BUSY';
    const status = r?.network ? (r.code === 'UPSTREAM_TIMEOUT' ? 504 : 502) : (r?.status || 502);
    return { status, error: { code, message: `${prefijo} ${r?.status || ''}: ${msg}`.replace(/\s+/g, ' ').trim() } };
  }

  /** Alta idempotente: si el customer_id ya existe (409), se devuelve el que hay. */
  async alta({ customer_id, personal_details = null } = {}) {
    const id = String(customer_id || '').trim();
    if (!id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id requerido (identificador TUYO del pagador, se reutiliza siempre)', field: 'customer_id' } };
    const body = { customer_id: id };
    if (personal_details && typeof personal_details === 'object') body.personal_details = personal_details;

    const r = await this.call('POST', '/v0.1/customers', { body });
    if (r.status === 201 || r.ok) {
      return { status: 200, data: { customer_id: r.data?.customer_id || id, personal_details: r.data?.personal_details || null, creado: true } };
    }
    if (r.status === 409) {
      const ya = await this.leer(id);
      if (ya.status === 200) return { status: 200, data: { ...ya.data, creado: false, ya_existia: true } };
      return { status: 409, error: { code: 'CONFLICT', message: `el customer_id '${id}' ya existe y no se pudo leer` } };
    }
    return this._err(r, 'SumUp alta cliente');
  }

  async leer(customer_id) {
    if (!customer_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id requerido' } };
    const r = await this.call('GET', `/v0.1/customers/${encodeURIComponent(customer_id)}`);
    if (!r.ok) return this._err(r, 'SumUp leer cliente');
    return { status: 200, data: { customer_id: r.data?.customer_id || customer_id, personal_details: r.data?.personal_details || null } };
  }

  async actualizar(customer_id, { personal_details } = {}) {
    if (!customer_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id requerido' } };
    if (!personal_details || typeof personal_details !== 'object' || Array.isArray(personal_details)) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'personal_details (objeto) requerido', field: 'personal_details' } };
    }
    const r = await this.call('PUT', `/v0.1/customers/${encodeURIComponent(customer_id)}`, { body: { personal_details } });
    if (!r.ok) return this._err(r, 'SumUp actualizar cliente');
    return { status: 200, data: { customer_id, personal_details: r.data?.personal_details || personal_details, actualizado: true } };
  }

  async tarjetas(customer_id) {
    if (!customer_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id requerido' } };
    const r = await this.call('GET', `/v0.1/customers/${encodeURIComponent(customer_id)}/payment-instruments`);
    if (!r.ok) return this._err(r, 'SumUp tarjetas');
    const items = Array.isArray(r.data) ? r.data : (r.data?.items || []);
    const tarjetas = items.map(normalizarTarjeta);
    return {
      status: 200,
      data: {
        customer_id, tarjetas, total: tarjetas.length,
        cobrables: tarjetas.filter(t => t.cobrable_sin_cliente).length
      }
    };
  }

  async bajaTarjeta(customer_id, token) {
    if (!customer_id || !token) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id y token requeridos' } };
    const r = await this.call('DELETE', `/v0.1/customers/${encodeURIComponent(customer_id)}/payment-instruments/${encodeURIComponent(token)}`);
    if (r.status === 204 || r.ok) return { status: 200, data: { customer_id, token, desactivada: true } };
    return this._err(r, 'SumUp baja tarjeta');
  }

  /**
   * COBRO con la tarjeta guardada (merchant-initiated). Dos pasos, sin cliente delante:
   *   1) crear el checkout de ESTE cobro (referencia única del negocio)
   *   2) procesarlo con {payment_type:'card', token, customer_id}
   *
   * El paso 2 puede pedir SCA (3DS). Si pasa, se devuelve `requiere_accion` con la URL: el cargo
   * NO se ha hecho y no se debe reintentar a ciegas (sería el segundo cargo).
   */
  async cobrarConToken({ customer_id, token, referencia, importe_centimos, descripcion = null, moneda = null, checkout_id = null } = {}) {
    if (!customer_id || !token) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id y token requeridos (la tarjeta guardada sin cliente no se cobra)' } };
    if (!referencia) return { status: 400, error: { code: 'INVALID_INPUT', message: 'referencia requerida (llave de idempotencia del cobro)', field: 'referencia' } };
    if (!Number.isInteger(importe_centimos) || importe_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'importe_centimos (entero > 0) requerido' } };
    }
    const cur = String(moneda || this.moneda).toUpperCase();
    const base = String(referencia).slice(0, 60);

    // ── 1) el checkout del cobro ──
    let co = null;
    if (checkout_id) {
      const leido = await this.call('GET', `/v0.1/checkouts/${encodeURIComponent(checkout_id)}`);
      if (leido.ok) co = leido.data;
    }
    if (!co) {
      const body = {
        checkout_reference: base,
        amount: Number((importe_centimos / 100).toFixed(2)),
        currency: cur,
        merchant_code: this.merchant,
        customer_id,
        purpose: 'CHECKOUT'
      };
      if (descripcion) body.description = String(descripcion).slice(0, 120);
      const r = await this.call('POST', '/v0.1/checkouts', { body });
      if (r.ok && r.data?.id) {
        co = r.data;
      } else if (r.status === 409) {
        // La referencia ya existe: se REUSA si sigue viva. Nunca un segundo cobro a ciegas.
        const lista = await this.call('GET', `/v0.1/checkouts?checkout_reference=${encodeURIComponent(base)}`);
        if (!lista.ok) {
          return { status: 503, error: { code: 'ESTADO_INCIERTO', message: `la referencia '${base}' ya existe y no se pudo leer el checkout: no se cobra a ciegas` } };
        }
        const items = Array.isArray(lista.data) ? lista.data : (lista.data?.items || []);
        const pagado = items.find(c => c?.status === 'PAID');
        if (pagado) {
          return { status: 409, error: { code: 'YA_PAGADO', message: 'esa referencia ya está cobrada: no se cobra dos veces' }, checkout: pagado };
        }
        const vivo = items.find(c => c?.status === 'PENDING');
        if (!vivo) {
          return { status: 409, error: { code: 'CHECKOUT_NO_REUTILIZABLE', message: `la referencia '${base}' existe pero no hay checkout vivo` } };
        }
        co = vivo;
      } else {
        return this._err(r, 'SumUp checkout para tarjeta guardada');
      }
    }
    if (co?.status === 'PAID') {
      return { status: 409, error: { code: 'YA_PAGADO', message: 'ese checkout ya está pagado' }, checkout: co };
    }

    // ── 2) procesar con la tarjeta guardada ──
    const proc = await this.call('PUT', `/v0.1/checkouts/${encodeURIComponent(co.id)}`, {
      body: { payment_type: 'card', token, customer_id }
    });

    if (proc.status === 402 || proc.status === 400 || proc.status === 422) {
      return {
        status: 200,
        data: {
          estado: 'rechazado', checkout_id: co.id, referencia: base,
          motivo: proc.data?.message || proc.data?.error_message || `SumUp ${proc.status}`,
          requiere_accion: null
        }
      };
    }
    if (!proc.ok && proc.status !== 202) return this._err(proc, 'SumUp cobro con tarjeta guardada');

    const out = proc.data || {};
    const next = out.next_step || out.nextStep || null;
    const estado = next ? 'requiere_accion' : String(out.status || '').toUpperCase();
    const txs = Array.isArray(out.transactions) ? out.transactions : [];
    const tx = txs.find(t => t.status === 'SUCCESSFUL' || t.status === 'REFUNDED') || txs[txs.length - 1] || null;

    return {
      status: 200,
      data: {
        estado: estado === 'PAID' ? 'confirmado' : (estado === 'FAILED' ? 'rechazado' : (next ? 'requiere_accion' : 'pendiente')),
        estado_sumup: estado || null,
        checkout_id: co.id,
        referencia: base,
        transaction_id: tx?.id || out.transaction_id || null,
        transaction_code: tx?.transaction_code || out.transaction_code || null,
        importe_centimos: Number.isFinite(Number(tx?.amount)) ? Math.round(Number(tx.amount) * 100) : importe_centimos,
        moneda: out.currency || cur,
        requiere_accion: next ? { tipo: next.type || next.action || 'SCA', url: next.url || next.redirect_url || null } : null,
        aviso: next
          ? 'el banco pide autenticación: el cargo NO se ha hecho; manda al cliente a la URL y NO reintentes'
          : (estado === 'pendiente' ? 'aceptado, pendiente de confirmar: se reconsulta (webhook/barrido) antes de dar por cobrado' : null)
      }
    };
  }
}

module.exports = { ClientesSumUp, normalizarTarjeta };
