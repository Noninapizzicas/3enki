/**
 * terminal.js — PROTOCOLO de cobro PRESENCIAL de SumUp (Reader / Terminal API).
 *
 * POR QUÉ EXISTE: el link de pago cubre al cliente que pide desde casa; el datáfono cubre al
 * que viene a recoger. Son el MISMO órgano con dos puertas, así que el terminal entra por aquí
 * y no por un módulo aparte: cualquier proyecto (pizzería, taller, mostrador de reservas)
 * cobra en persona sin escribir una línea.
 *
 * Doc verificada contra la spec OpenAPI oficial (sumup/sumup-openapi, openapi31.json):
 *   GET    /v0.1/merchants/{mc}/readers                       listar
 *   POST   /v0.1/merchants/{mc}/readers                       parear {pairing_code, name}
 *   GET    /v0.1/merchants/{mc}/readers/{id}                  leer
 *   PATCH  /v0.1/merchants/{mc}/readers/{id}                  renombrar / metadata
 *   DELETE /v0.1/merchants/{mc}/readers/{id}                  desemparejar
 *   GET    /v0.1/merchants/{mc}/readers/{id}/status           ONLINE|OFFLINE + estado de pantalla
 *   POST   /v0.1/merchants/{mc}/readers/{id}/checkout         mandar el importe al datáfono
 *   GET    /v0.1/merchants/{mc}/readers/{id}/checkout/{coid}  resultado del cobro
 *   POST   /v0.1/merchants/{mc}/readers/{id}/terminate        cancelar en el dispositivo (202)
 *   POST   /v0/merchants/{mc}/readers/{id}/go-checkout        variante SumUp Go (idempotencia
 *                                                             por client_transaction_id)
 *
 * RAREZAS QUE MANDA LA SPEC Y AQUÍ SE RESPETAN:
 *  - El importe va en UNIDADES MENORES ({value, currency, minor_unit}), no decimal como el checkout.
 *  - El dispositivo tiene que estar ONLINE; tras aceptar, el sistema tiene 60 s para arrancar el
 *    cobro. Mientras tanto, otro checkout para el mismo lector se RECHAZA (la propia SumUp ya
 *    impide el doble cobro en el device; nosotros además no creamos el segundo).
 *  - `terminate` es asíncrono y SIN confirmación: devuelve 202 y el estado final se lee del
 *    checkout. No se puede dar por cancelado sin reconsultar.
 *  - El estado del checkout del lector es pending|successful|failed|cancelled (minúsculas).
 */

'use strict';

// Monedas sin decimales (la spec lo dice literal: CLP, COP y HUF → minor_unit 0).
const MINOR_UNIT_0 = new Set(['CLP', 'COP', 'HUF', 'ISK', 'JPY', 'KRW', 'VND', 'XAF', 'XOF', 'XPF']);

function minorUnitFor(currency) {
  return MINOR_UNIT_0.has(String(currency || '').toUpperCase()) ? 0 : 2;
}

/** Importe en unidades menores listo para la API del lector. */
function amountOf(importe_centimos, moneda) {
  const cur = String(moneda || 'EUR').toUpperCase();
  const mu = minorUnitFor(cur);
  // `importe_centimos` es la unidad interna del órgano (céntimos = 2 decimales).
  const value = mu === 2 ? Math.round(importe_centimos) : Math.round(importe_centimos / 100);
  return { currency: cur, minor_unit: mu, value };
}

/** Traduce el estado del checkout del lector al vocabulario del órgano. */
function estadoDeReaderCheckout(status) {
  switch (String(status || '').toLowerCase()) {
    case 'successful': return 'confirmado';
    case 'failed': return 'rechazado';
    case 'cancelled': return 'cancelado';
    case 'pending': return 'pendiente';
    default: return 'desconocido';
  }
}

class TerminalSumUp {
  /**
   * @param {object} deps
   * @param {(method:string, path:string, opts?:object)=>Promise<object>} deps.call
   *        transporte ya autenticado (lo inyecta el órgano: _sumupCall)
   * @param {string} deps.merchant  merchant code de la cuenta DEL PROYECTO
   * @param {string} [deps.moneda]  moneda por defecto de la cuenta
   */
  constructor({ call, merchant, moneda = 'EUR', logger = null }) {
    if (!merchant) throw new Error('TerminalSumUp exige merchant code');
    this.call = call;
    this.merchant = merchant;
    this.moneda = String(moneda || 'EUR').toUpperCase();
    this.logger = logger;
  }

  _base() { return `/v0.1/merchants/${encodeURIComponent(this.merchant)}/readers`; }

  _err(r, prefijo = 'SumUp lector') {
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

  async listar() {
    const r = await this.call('GET', this._base());
    if (!r.ok) return this._err(r);
    const items = r.data?.items || (Array.isArray(r.data) ? r.data : []);
    return {
      status: 200,
      data: {
        lectores: items.map(x => ({
          reader_id: x.id, nombre: x.name, estado: x.status,
          modelo: x.device?.model || null, serial: x.device?.identifier || null,
          metadata: x.metadata || null, creado: x.created_at || null
        })),
        total: items.length
      }
    };
  }

  async parear({ pairing_code, name, metadata = null } = {}) {
    const codigo = String(pairing_code || '').trim();
    if (codigo.length < 8 || codigo.length > 9) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'pairing_code debe ser el código de 8 o 9 caracteres que muestra el datáfono al emparejar', field: 'pairing_code' } };
    }
    if (!name || !String(name).trim()) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'name requerido (nombre con el que reconocerás el datáfono)', field: 'name' } };
    }
    const body = { pairing_code: codigo, name: String(name).trim().slice(0, 500) };
    if (metadata && typeof metadata === 'object') body.metadata = metadata;
    const r = await this.call('POST', this._base(), { body });
    if (r.status === 201 || r.ok) {
      return {
        status: 200,
        data: {
          reader_id: r.data?.id, nombre: r.data?.name, estado: r.data?.status,
          modelo: r.data?.device?.model || null, serial: r.data?.device?.identifier || null,
          aviso: r.data?.status === 'processing'
            ? 'emparejamiento iniciado: el datáfono debe confirmar en pantalla antes de poder cobrar'
            : null
        }
      };
    }
    return this._err(r, 'SumUp parear');
  }

  async leer(reader_id) {
    if (!reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido' } };
    const r = await this.call('GET', `${this._base()}/${encodeURIComponent(reader_id)}`);
    if (!r.ok) return this._err(r);
    return { status: 200, data: { reader_id: r.data?.id, nombre: r.data?.name, estado: r.data?.status, modelo: r.data?.device?.model || null, serial: r.data?.device?.identifier || null, metadata: r.data?.metadata || null } };
  }

  async renombrar(reader_id, { name, metadata = null } = {}) {
    if (!reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido' } };
    const body = {};
    if (name !== undefined) {
      if (!String(name).trim()) return { status: 400, error: { code: 'INVALID_INPUT', message: 'name no puede ir vacío', field: 'name' } };
      body.name = String(name).trim().slice(0, 500);
    }
    // La spec es explícita: metadata REEMPLAZA el objeto entero. Se avisa en la respuesta.
    if (metadata && typeof metadata === 'object') body.metadata = metadata;
    if (!Object.keys(body).length) return { status: 400, error: { code: 'INVALID_INPUT', message: 'nada que cambiar (name o metadata)' } };
    const r = await this.call('PATCH', `${this._base()}/${encodeURIComponent(reader_id)}`, { body });
    if (!r.ok) return this._err(r, 'SumUp renombrar lector');
    return { status: 200, data: { reader_id: r.data?.id, nombre: r.data?.name, metadata_reemplazada: !!metadata } };
  }

  async borrar(reader_id) {
    if (!reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido' } };
    const r = await this.call('DELETE', `${this._base()}/${encodeURIComponent(reader_id)}`);
    if (!r.ok) return this._err(r, 'SumUp desemparejar');
    return { status: 200, data: { reader_id, desemparejado: true } };
  }

  /** ¿Puede cobrar AHORA? ONLINE + batería + firmware. Un IDLE offline no cobra. */
  async estado(reader_id) {
    if (!reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido' } };
    const r = await this.call('GET', `${this._base()}/${encodeURIComponent(reader_id)}/status`);
    if (!r.ok) return this._err(r, 'SumUp estado lector');
    const d = r.data?.data || r.data || {};
    return {
      status: 200,
      data: {
        reader_id,
        conexion: d.status || null,                 // ONLINE | OFFLINE
        pantalla: d.state || null,                  // IDLE | WAITING_FOR_CARD | WAITING_FOR_PIN…
        bateria: Number.isFinite(d.battery_level) ? d.battery_level : null,
        temperatura: Number.isFinite(d.battery_temperature) ? d.battery_temperature : null,
        firmware: d.firmware_version || null,
        tipo_conexion: d.connection_type || null,
        ultima_actividad: d.last_activity || null,
        puede_cobrar: String(d.status || '').toUpperCase() === 'ONLINE'
      }
    };
  }

  /**
   * Manda el importe al datáfono. El cobro es ASÍNCRONO: aquí solo se sabe que se aceptó.
   * `referencia` viaja como affiliate.foreign_transaction_id para poder reencontrar la
   * transacción en la API de transacciones aunque se pierda el checkout.
   */
  async cobrar(reader_id, { referencia, importe_centimos, descripcion = null, moneda = null, return_url = null,
    propina_centimos = null, tip_rates = null, tip_timeout = null, card_type = null, installments = null, affiliate = null } = {}) {
    if (!reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido' } };
    if (!referencia) return { status: 400, error: { code: 'INVALID_INPUT', message: 'referencia requerida (es la llave contra el doble cobro)', field: 'referencia' } };
    if (!Number.isInteger(importe_centimos) || importe_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'importe_centimos (entero > 0) requerido' } };
    }
    const total = amountOf(importe_centimos, moneda || this.moneda);
    const body = {
      total_amount: total,
      // La referencia del negocio viaja en el affiliate: sin esto, un cobro presencial no se
      // puede casar con el pedido si el webhook del lector se pierde.
      affiliate: {
        foreign_transaction_id: String(referencia).slice(0, 128),
        ...(affiliate && typeof affiliate === 'object' ? affiliate : {})
      }
    };
    if (descripcion) body.description = String(descripcion).slice(0, 255);
    if (return_url) body.return_url = return_url;
    if (Number.isInteger(propina_centimos) && propina_centimos >= 0) {
      // En el lector la propina se ofrece en el propio dispositivo: total = base + propina.
      body.total_amount = amountOf(importe_centimos + propina_centimos, moneda || this.moneda);
    }
    if (Array.isArray(tip_rates) && tip_rates.length) {
      const rates = tip_rates.map(Number).filter(x => Number.isFinite(x) && x >= 0 && x <= 1);
      if (!rates.length) return { status: 400, error: { code: 'INVALID_INPUT', message: 'tip_rates debe ser una lista de fracciones (0.05 = 5%)', field: 'tip_rates' } };
      body.tip_rates = rates;
      body.tip_timeout = Number.isInteger(tip_timeout) ? tip_timeout : 60;
    }
    if (card_type === 'credit' || card_type === 'debit') body.card_type = card_type;
    if (Number.isInteger(installments) && installments > 0) body.installments = installments;

    const r = await this.call('POST', `${this._base()}/${encodeURIComponent(reader_id)}/checkout`, { body });
    if (r.status === 201 || r.ok) {
      return {
        status: 200,
        data: {
          checkout_id: r.data?.data?.checkout_id || null,
          client_transaction_id: r.data?.data?.client_transaction_id || null,
          reader_id,
          estado: 'pendiente',
          importe_centimos: body.total_amount.minor_unit === 2 ? body.total_amount.value : body.total_amount.value * 100,
          moneda: total.currency,
          aviso: 'cobro aceptado: el cliente debe completar en el datáfono'
        }
      };
    }
    return this._err(r, 'SumUp cobro en lector');
  }

  /** Resultado del cobro en el lector (LA verdad: se reconsulta, no se adivina). */
  async consultar(reader_id, checkout_id) {
    if (!reader_id || !checkout_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id y checkout_id requeridos' } };
    const r = await this.call('GET', `${this._base()}/${encodeURIComponent(reader_id)}/checkout/${encodeURIComponent(checkout_id)}`);
    if (!r.ok) return this._err(r, 'SumUp consultar cobro en lector');
    const d = r.data?.data || r.data || {};
    const mu = Number.isFinite(d.total_amount?.minor_unit) ? d.total_amount.minor_unit : 2;
    const value = Number(d.total_amount?.value);
    return {
      status: 200,
      data: {
        reader_id, checkout_id,
        estado: String(d.status || '').toLowerCase(),          // pending|successful|failed|cancelled
        estado_organo: estadoDeReaderCheckout(d.status),
        pago: d.payment_status || null,
        motivo_fallo: d.payment_failure_reason || null,
        importe_centimos: Number.isFinite(value) ? (mu === 2 ? value : value * 100) : null,
        moneda: d.total_amount?.currency || this.moneda,
        tarjeta: d.card_type || null,
        tipo_pago: d.payment_type || null,
        cliente_transaccion: d.client_transaction_id || null,
        serial: d.reader_serial_number || null,
        firmware: d.reader_firmware_version || null,
        creado: d.created_at || null,
        actualizado: d.updated_at || null
      }
    };
  }

  /** Cancela lo que el cliente esté haciendo en el datáfono. 202 = aceptado, NO confirmado. */
  async terminar(reader_id) {
    if (!reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido' } };
    const r = await this.call('POST', `${this._base()}/${encodeURIComponent(reader_id)}/terminate`, { body: {} });
    if (r.status === 202 || r.ok) {
      return { status: 200, data: { reader_id, terminado: 'aceptado', aviso: 'la cancelación es asíncrona y sin confirmación: el estado final se lee del checkout' } };
    }
    return this._err(r, 'SumUp terminar lector');
  }

  /**
   * Variante SumUp Go (/v0/.../go-checkout). Aquí SÍ hay idempotencia documentada:
   * `client_transaction_id` es la clave — reintentar con el mismo valor devuelve el resultado
   * del pago original en vez de cobrar otra vez. Por eso la referencia del negocio es la clave.
   */
  async cobrarGo(reader_id, { referencia, importe_centimos, propina_centimos = null, moneda = null } = {}) {
    if (!reader_id || !referencia) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id y referencia requeridos' } };
    if (!Number.isInteger(importe_centimos) || importe_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'importe_centimos (entero > 0) requerido' } };
    }
    const total = amountOf(importe_centimos + (Number.isInteger(propina_centimos) ? propina_centimos : 0), moneda || this.moneda);
    const body = { client_transaction_id: String(referencia).slice(0, 128), total_amount: total };
    if (Number.isInteger(propina_centimos) && propina_centimos >= 0) body.tip_amount = amountOf(propina_centimos, moneda || this.moneda).value;
    const r = await this.call('POST', `/v0/merchants/${encodeURIComponent(this.merchant)}/readers/${encodeURIComponent(reader_id)}/go-checkout`, { body });
    if (!r.ok) return this._err(r, 'SumUp Go cobro');
    const d = r.data?.data || r.data || {};
    return {
      status: 200,
      data: {
        reader_id, client_transaction_id: body.client_transaction_id,
        estado: d.status || d.payment_status || 'pendiente',
        estado_organo: estadoDeReaderCheckout(d.status || d.payment_status),
        transaction_id: d.transaction_id || d.id || null,
        importe_centimos,
        moneda: total.currency
      }
    };
  }
}

module.exports = { TerminalSumUp, minorUnitFor, amountOf, estadoDeReaderCheckout };
