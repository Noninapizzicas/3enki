'use strict';

/**
 * pago-gateway — el LÍDER DE PAGO (puerto de pasarelas provider-agnóstico).
 *
 *   tienda/carrito ──pago.iniciar.request {pedido_id, project_id, monto_centimos}──► pago-gateway
 *                                                                                     │ enruta por kind
 *                                                                                     ▼ (credencial + fetch)
 *                                              pasarela (Stripe Checkout / SumUp Hosted Checkout / …)
 *                          pago.iniciar.response {checkout_url, session_id} ◄──────────┘
 *   pasarela ──webhook HTTP──► pago-gateway ──pago.confirmado──► consumidor libera pedido
 *
 * Puertos (todos por bus, request→response):
 *   pago.iniciar.request    { pedido_id, project_id, monto_centimos, concepto, return_url }
 *   pago.cancelar.request   { session_id | pedido_id, project_id }  → mata el link (SumUp DELETE)
 *   pago.reembolsar.request { transaction_id | pedido_id, monto_centimos?, project_id }
 *
 * Garantías que sostienen el dinero (SumUp):
 *   1. IDEMPOTENCIA DE CREACIÓN — la referencia es el pedido, y un 409 DUPLICATED_CHECKOUT NO crea
 *      un segundo link: se REUTILIZA el checkout PENDING existente (dos links vivos = dos cobros).
 *   2. CADUCIDAD PROPIA — valid_until = ahora + ttl, para que el link muera cuando muere el pedido.
 *   3. RECONCILIACIÓN — libro de cobros por proyecto + barrido periódico: si el webhook se pierde
 *      (deploy, caída > 2 h de reintentos), el barrido ve el checkout PAID y confirma igual.
 *   4. WEBHOOK VERIFICADO — SumUp no firma: se reconsulta el checkout y solo PAID confirma.
 *   5. REEMBOLSOS — v1.0 merchant-scoped, con tope por libro; sin reintento automático (un
 *      timeout en un reembolso es estado incierto, no se repite a ciegas).
 *   6. INTEGRIDAD DEL IMPORTE — un checkout PAID que no cuadra con lo pedido (menos el importe
 *      de la propina, que el cliente puede añadir en la pantalla de SumUp) NO se confirma:
 *      se emite pago.importe_discrepante. Confirmar sin cuadrar es regalar el pedido.
 *   7. CONCILIACIÓN CON LA CUENTA — el órgano `conciliacion.js` cierra lo que el barrido no
 *      puede: reembolsos y contracargos hechos desde el panel de SumUp, cobros que no casan
 *      con ningún pedido (cobro.huerfano), y la liquidación diaria con la comisión REAL
 *      (cobro.liquidado). Sin él el sistema solo sabe lo que él mismo hizo.
 *   8. REEMBOLSO QUE NO SE QUEDA EN EL LIMBO — un timeout o un 5xx de SumUp no se reintenta a
 *      ciegas (podría devolver dos veces), pero tampoco se abandona: se RECONSULTA la
 *      transacción (v2.1 transactions?id=) y sus eventos REFUND, y si el dinero ya salió se
 *      registra como devuelto. Antes, ese caso quedaba "incierto" hasta el siguiente tick.
 *   9. PREFLIGHT HONESTO — `pago.estado` dice si la cuenta PUEDE cobrar hoy (merchant válido,
 *      moneda, país, métodos con tarjeta, webhook configurado) antes de encender el botón.
 *      El fallo típico del alta (scope de pagos online sin activar) se ve aquí, no al cobrar.
 *  10. TICKET DIGITAL — `pago.recibo` lee el recibo estructurado de SumUp (v1.1) de cualquier
 *      cobro: importe, IVA, propina, autorización. Base de la factura simplificada.
 *  11. A PRUEBA DE EVENTOS NUEVOS — SumUp puede añadir tipos de evento sin avisar (su doc lo
 *      dice literal). Se acepta cualquier evento de la familia `checkout*` y se reconsulta
 *      siempre: el payload no firmado nunca es prueba, pero tampoco se tira a la basura.
 */

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');
const ConciliacionSumUp = require('./conciliacion');

const SUMUP_API = 'https://api.sumup.com';
const LEDGER_PATH = '/pizzepos/pago/checkouts.json';   // relativo al storage del proyecto
const CONCILIACION_PATH = '/pizzepos/pago/conciliacion.json';
const LEDGER_MAX = 800;
const REF_MAX = 60;                                    // deja sitio al sufijo #n (máx SumUp: 64)
const SUMUP_TIMEOUT_MS = 8000;                        // el cliente está esperando el link
const SUMUP_WEBHOOK_TIMEOUT_MS = 4000;                // el webhook se responde RÁPIDO (si tarda, SumUp lo da por fallido)
const FS_TIMEOUT_MS = 3000;
const SUMUP_PURPOSES = new Set(['CHECKOUT', 'SETUP_RECURRING_PAYMENT']);

class PagoGatewayModule extends BaseModule {
  constructor() {
    super();
    this.name = 'pago-gateway';
    this.version = '1.4.0';
    this._subs = [];
    this._confirmados = new Set();      // idempotencia caliente del webhook (SumUp reintenta 4 veces)
    this._rechazados = new Set();       // ídem para FAILED (SumUp manda el evento varias veces)
    this._ledger = new Map();           // project_id → { checkouts: { [checkout_id]: entry } }
    this._ledgerCargado = new Set();    // project_id ya leído de disco
    this._ledgerNoDisponible = new Map(); // project_id → ts hasta el que no se reintenta leer
    this._conciEstado = new Map();      // project_id → { history_cursor, payouts_hasta, vistos[] }
    this._conci = null;
    this._conciTimer = null;
    this._barrido = null;
    this._barriendo = false;
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.config = (core.config && core.config['pago-gateway']) || core.moduleConfig || {};
    this.pasarela = this.config.pasarela || {};

    const sub = (ev, fn) => { try { this._subs.push(this.eventBus.subscribe(ev, fn)); } catch (_) {} };
    sub('pago.iniciar.request', e => this._onIniciarRequest(e));
    sub('pago.cancelar.request', e => this._onCancelarRequest(e));
    sub('pago.reembolsar.request', e => this._onReembolsarRequest(e));
    sub('pago.estado.request', e => this._onRespuestaSimple(e, 'pago.estado.request', 'pago.estado.response', d => this._sumupEstado(d)));
    sub('pago.recibo.request', e => this._onRespuestaSimple(e, 'pago.recibo.request', 'pago.recibo.response', d => this._sumupRecibo(d)));

    this._montarConciliacion();
    this._arrancarBarrido();

    this.logger?.info('module.loaded', {
      module: this.name, version: this.version,
      pasarela: this.pasarela.kind || '(sin configurar)', provider: this.pasarela.provider || null,
      ttl_min: this._ttlMinutos(), barrido: this._barridoActivo(),
      conciliacion: this._conciliacionActiva()
    });
  }

  async onUnload() {
    if (this._barrido) { clearInterval(this._barrido); this._barrido = null; }
    if (this._conciTimer) { clearInterval(this._conciTimer); this._conciTimer = null; }
    for (const u of this._subs) { try { u(); } catch (_) {} }
    this._subs = [];
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // RPC de bus (resuelve credencial via credential-manager, como el loader/tools_http).
  async _rpc(evento, payload = {}, { timeout_ms = 15000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request') ? evento.slice(0, -8) + '.response' : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const dd = event?.data || event;
          if (!dd || dd.request_id !== request_id) return;
          clearTimeout(timeout); if (unsub) unsub(); resolve(dd);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) { clearTimeout(timeout); if (unsub) unsub(); resolve(null); }
    });
  }

  async _resolveCred(provider) {
    const r = await this._rpc('credential.resolve.request', { provider }, { timeout_ms: 6000 });
    if (!r) return { error: 'credential.resolve timeout' };
    if (r.success === false || !r.api_key) return { error: r.error || `sin credencial para provider '${provider}'` };
    return { api_key: r.api_key };
  }

  // ── núcleo: iniciar el pago. RETORNA {status, data|error} ──
  async _iniciar(d) {
    if (!d?.pedido_id || !Number.isInteger(d.monto_centimos) || d.monto_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'pedido_id y monto_centimos (entero > 0) requeridos' } };
    }
    const kind = this.pasarela.kind;
    if (!kind) {
      return { status: 503, error: { code: 'NO_PASARELA', message: 'sin pasarela configurada. Configúrala en pago-gateway.pasarela (kind + provider) + su credencial.' } };
    }
    if (kind === 'stripe-checkout') return this._stripeCheckout(d);
    if (kind === 'sumup-checkout' || kind === 'sumup') return this._sumupCheckout(d);
    return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `pasarela '${kind}' no implementada (semilla: stripe-checkout, sumup-checkout)` } };
  }

  // ── adapter STRIPE (Checkout Session) ──
  async _stripeCheckout(d) {
    const provider = this.pasarela.provider || 'STRIPE';
    const cred = await this._resolveCred(provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${provider}': ${cred.error}` } };

    const moneda = (d.moneda || this.pasarela.moneda || 'eur').toLowerCase();
    const concepto = (d.concepto || 'Pedido').slice(0, 120);
    const ret = d.return_url || this.pasarela.return_url || '';
    const sep = ret.includes('?') ? '&' : '?';
    // Stripe Checkout Sessions: body x-www-form-urlencoded (NO json).
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('line_items[0][price_data][currency]', moneda);
    params.set('line_items[0][price_data][product_data][name]', concepto);
    params.set('line_items[0][price_data][unit_amount]', String(d.monto_centimos));
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', ret ? (ret + sep + 'pago=ok&session={CHECKOUT_SESSION_ID}') : 'https://example.com/?pago=ok');
    params.set('cancel_url', ret ? (ret + sep + 'pago=cancel') : 'https://example.com/?pago=cancel');
    params.set('metadata[pedido_id]', String(d.pedido_id));
    if (d.project_id) params.set('metadata[project_id]', String(d.project_id));
    // METADATA ADICIONAL del caller: la pasarela la devuelve en el webhook, asi que es lo que
    // permite RECONSTRUIR el pedido si el webhook llega cuando ya no esta en memoria.
    if (d.metadata && typeof d.metadata === 'object') {
      for (const [k, v] of Object.entries(d.metadata)) {
        if (v === null || v === undefined || v === '') continue;
        if (!/^[a-z0-9_]{1,40}$/i.test(k)) continue;
        params.set('metadata[' + k + ']', String(v).slice(0, 500));
      }
    }

    let resp, text;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 20000);
      resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cred.api_key, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(), signal: controller.signal
      });
      clearTimeout(tid);
      text = await resp.text();
    } catch (err) {
      if (err.name === 'AbortError') return { status: 504, error: { code: 'UPSTREAM_TIMEOUT', message: 'Stripe no respondió a tiempo' } };
      return { status: 502, error: { code: 'UPSTREAM_UNREACHABLE', message: `red Stripe: ${err.message}` } };
    }
    let parsed = null; try { parsed = JSON.parse(text); } catch (_) {}
    if (!resp.ok) {
      const sMsg = parsed?.error?.message || (text || '').slice(0, 300) || `HTTP ${resp.status}`;
      this.logger?.warn('pago-gateway.stripe.http_error', { status: resp.status, message: sMsg });
      const code = resp.status === 401 || resp.status === 403 ? 'PERMISSION_DENIED' : resp.status === 400 ? 'INVALID_INPUT' : 'UPSTREAM_INVALID_RESPONSE';
      return { status: resp.status, error: { code, message: `Stripe ${resp.status}: ${sMsg}` } };
    }
    if (!parsed?.url || !parsed?.id) {
      return { status: 502, error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'Stripe no devolvió checkout url/id' } };
    }
    return { status: 200, data: { checkout_url: parsed.url, session_id: parsed.id, pasarela: 'stripe-checkout', estado: 'pendiente' } };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMUP — Hosted Checkout (link de pago alojado)
  //  Doc: developer.sumup.com/api/checkouts/create · /online-payments/hosted-checkout
  //       /online-payments/webhooks · /api/transactions (v2.1) · /refunds (v1.0)
  // ══════════════════════════════════════════════════════════════════════════

  _sumupCfg(d = {}) {
    const p = this.pasarela;
    return {
      merchant: d.merchant_code || p.merchant_code || null,
      provider: p.provider || 'SUMUP',
      moneda: String(d.moneda || p.moneda || 'eur').toUpperCase(),
      webhookUrl: d.webhook_url || p.webhook_url || null,
      clienteUrl: d.return_url || p.return_url || null,
      webhookToken: p.webhook_token || null,
      minCentimos: Number.isInteger(p.min_centimos) ? p.min_centimos : 100,   // SumUp: mínimo 1,00
      ttlMin: this._ttlMinutos()
    };
  }

  _ttlMinutos() {
    const t = Number(this.pasarela?.ttl_minutos);
    return Number.isFinite(t) && t > 0 ? Math.min(t, 30) : 15;   // Hosted Checkout vive 30 min como máximo
  }

  // POST/GET/DELETE con 1 reintento en 429/5xx/red. NO se usa para reembolsos (ver _sumupReembolsar).
  async _sumupCall(method, path, { api_key, body = null, retry = true, timeout_ms = SUMUP_TIMEOUT_MS } = {}) {
    const intento = async () => {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeout_ms);
      try {
        const headers = { Authorization: 'Bearer ' + api_key };
        if (body !== null) headers['Content-Type'] = 'application/json';
        const resp = await fetch(SUMUP_API + path, {
          method, headers, body: body !== null ? JSON.stringify(body) : undefined, signal: controller.signal
        });
        const text = await resp.text();
        let data = null; try { data = JSON.parse(text); } catch (_) {}
        return { ok: resp.ok, status: resp.status, data, text };
      } finally { clearTimeout(tid); }
    };
    let last = null;
    for (let i = 0; i < (retry ? 2 : 1); i++) {
      try { last = await intento(); }
      catch (err) {
        last = {
          ok: false, status: 0, network: true,
          code: err.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
          message: `red SumUp: ${err.message}`
        };
      }
      const reintentable = last.network || last.status === 429 || (last.status >= 500 && last.status < 600);
      if (!reintentable) return last;
      if (i === 0) await new Promise(r => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
    }
    return last;
  }

  _errorDeSumup(r, prefijo = 'SumUp') {
    const msg = r?.data?.message || r?.data?.error_message || r?.data?.detail || r?.data?.error_code
      || (r?.text || '').slice(0, 300) || r?.message || `HTTP ${r?.status}`;
    let code = 'UPSTREAM_INVALID_RESPONSE';
    if (r?.network) code = r.code || 'UPSTREAM_UNREACHABLE';
    else if (r?.status === 401 || r?.status === 403) code = 'PERMISSION_DENIED';
    else if (r?.status === 400 || r?.status === 422) code = 'INVALID_INPUT';
    else if (r?.status === 429) code = 'UPSTREAM_BUSY';
    else if (r?.status === 404) code = 'NOT_FOUND';
    const status = r?.network ? (r.code === 'UPSTREAM_TIMEOUT' ? 504 : 502) : (r?.status || 502);
    return { status, error: { code, message: `${prefijo} ${r?.status || ''}: ${msg}`.replace(/\s+/g, ' ').trim() } };
  }

  // Crear checkout REUTILIZANDO el existente si la referencia ya está tomada.
  // Dos links vivos para el mismo pedido = dos cobros posibles. Eso no se hace.
  async _sumupCrearOReusar({ api_key, cfg, base, monto_centimos, concepto, validUntil, purpose = null, customerId = null }) {
    let ultimo = null;
    for (let intento = 0; intento < 3; intento++) {
      const ref = intento === 0 ? base : `${base}#${intento}`;
      const body = {
        amount: Number((monto_centimos / 100).toFixed(2)),   // SumUp quiere DECIMAL (12.34), no céntimos
        currency: cfg.moneda,
        checkout_reference: ref,
        merchant_code: cfg.merchant,
        description: concepto,
        hosted_checkout: { enabled: true },
        return_url: cfg.webhookUrl,
        valid_until: validUntil
      };
      if (cfg.clienteUrl) body.redirect_url = cfg.clienteUrl;
      // FUTURO YA CABLEADO: el día que haya cliente de siempre (tarjeta guardada), el adapter
      // no cambia — solo llega `customer_id` y `purpose: SETUP_RECURRING_PAYMENT` desde el caller.
      if (purpose && purpose !== 'CHECKOUT') body.purpose = purpose;
      if (customerId) body.customer_id = customerId;
      if (cfg.webhookToken) {
        const u = new URL(cfg.webhookUrl);
        u.searchParams.set('t', cfg.webhookToken);
        body.return_url = u.toString();
      }

      const r = await this._sumupCall('POST', '/v0.1/checkouts', { api_key, body });
      if (r.ok && r.data?.hosted_checkout_url && r.data?.id) {
        return { ok: true, checkout: r.data, ref, intento, reutilizado: false };
      }
      if (r.ok) {
        return { ok: false, status: 502, error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'SumUp devolvió OK sin hosted_checkout_url/id (¿hosted_checkout.enabled?)' } };
      }
      if (r.status === 409) {
        // DUPLICATED_CHECKOUT: la referencia ya existe. Nunca crear otra a ciegas.
        const lista = await this._sumupCall('GET', `/v0.1/checkouts?checkout_reference=${encodeURIComponent(ref)}`, { api_key });
        if (!lista.ok) {
          // Sin poder leer el existente no se sabe si hay un link vivo: NO se crea otro.
          // Se devuelve 503 (reintentable) para que el caller reintente el mismo pedido.
          return {
            ok: false, status: 503,
            error: { code: 'ESTADO_INCIERTO', message: `la referencia '${ref}' ya existe y no se pudo leer el checkout (${lista.status || lista.code}): no se crea un segundo link a ciegas` }
          };
        }
        const existentes = Array.isArray(lista?.data) ? lista.data : (lista?.data?.items || []);
        const vivo = existentes.find(c => c?.status === 'PENDING' && c?.hosted_checkout_url);
        if (vivo) {
          this.logger?.info('pago-gateway.sumup.checkout_reutilizado', { ref, checkout_id: vivo.id });
          return { ok: true, checkout: vivo, ref, intento, reutilizado: true };
        }
        const pagado = existentes.find(c => c?.status === 'PAID');
        if (pagado) {
          return { ok: false, status: 409, code: 'CHECKOUT_YA_PAGADO', checkout: pagado, ref, message: 'el pedido ya tiene un checkout PAID: no se crea otro link' };
        }
        ultimo = { status: 409, code: 'CHECKOUT_NO_REUTILIZABLE', ref };
        continue;   // FAILED / EXPIRED → se prueba el siguiente intento
      }
      return { ok: false, ...this._errorDeSumup(r) };
    }
    return { ok: false, status: 409, error: { code: ultimo?.code || 'CHECKOUT_NO_REUTILIZABLE', message: 'no se pudo crear ni reutilizar un checkout vivo para este pedido' } };
  }

  async _sumupCheckout(d) {
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) {
      return { status: 500, error: { code: 'CONFIG_MISSING', message: 'sumup-checkout exige pasarela.merchant_code (el código M… de la cuenta, se copia del panel)' } };
    }
    // Sin return_url SumUp NO avisa: el checkout se cobraría y nadie liberaría el pedido.
    if (!cfg.webhookUrl) {
      return { status: 500, error: { code: 'CONFIG_MISSING', message: 'sumup-checkout exige pasarela.webhook_url (URL pública del webhook; es el return_url de SumUp)' } };
    }
    if (d.monto_centimos < cfg.minCentimos) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: `importe por debajo del mínimo de SumUp (${(cfg.minCentimos / 100).toFixed(2)} ${cfg.moneda})` } };
    }
    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const concepto = (d.concepto || `Pedido ${d.pedido_id}`).slice(0, 120);
    const base = String(d.checkout_reference || d.pedido_id).replace(/#/g, '-').slice(0, REF_MAX);
    const validUntil = new Date(Date.now() + cfg.ttlMin * 60000).toISOString();
    const purpose = SUMUP_PURPOSES.has(String(d.purpose || '').toUpperCase()) ? String(d.purpose).toUpperCase() : 'CHECKOUT';
    const customerId = d.customer_id || null;

    const out = await this._sumupCrearOReusar({
      api_key: cred.api_key, cfg, base, monto_centimos: d.monto_centimos, concepto, validUntil, purpose, customerId
    });

    if (!out.ok) {
      if (out.code === 'CHECKOUT_YA_PAGADO' && out.checkout) {
        // El pedido ya está cobrado: se confirma aquí mismo en vez de dar un link nuevo.
        await this._confirmarSumup(out.checkout, { project_id: d.project_id, project_slug: d.project_slug, origen: 'iniciar' });
        return { status: 409, error: { code: 'CHECKOUT_YA_PAGADO', message: 'el pedido ya está pagado; no se crea un link nuevo' } };
      }
      this.logger?.warn('pago-gateway.sumup.create_failed', { code: out.error?.code, message: out.error?.message });
      return { status: out.status || 502, error: out.error };
    }

    const co = out.checkout;
    await this._ledgerPut(d.project_id, {
      checkout_id: co.id,
      checkout_reference: co.checkout_reference || out.ref,
      pedido_id: String(d.pedido_id),
      project_slug: d.project_slug || this.pasarela.project_slug || null,
      monto_centimos: d.monto_centimos,
      moneda: cfg.moneda,
      estado: co.status === 'PAID' ? 'confirmado' : 'pendiente',
      creado: new Date().toISOString(),
      valid_until: co.valid_until || validUntil,
      intento: out.intento,
      reembolsos: [],
      // Contexto que SumUp devuelve y que hace falta DESPUÉS: país de la cuenta (para cuadrar
      // comisiones), tipo de checkout y el rastro de tokenización (tarjeta guardada del cliente).
      checkout_type: co.checkout_type || null,
      merchant_country: co.merchant_country || null,
      purpose: co.purpose || purpose,
      customer_id: co.customer_id || customerId || null,
      ...(co.payment_instrument?.token ? { payment_instrument_token: co.payment_instrument.token } : {})
    });

    return {
      status: 200,
      data: {
        checkout_url: co.hosted_checkout_url,
        session_id: co.id,
        pasarela: 'sumup-checkout',
        estado: 'pendiente',
        expira_at: co.valid_until || validUntil,
        reutilizado: !!out.reutilizado
      }
    };
  }

  // ── libro de cobros (durable, por proyecto; degrada a memoria si no hay fs) ──
  async _ledgerLoad(project_id) {
    if (!project_id) return null;
    if (this._ledger.has(project_id)) return this._ledger.get(project_id);
    if (this._ledgerCargado.has(project_id)) return this._ledger.get(project_id) || null;
    const bloqueadoHasta = this._ledgerNoDisponible.get(project_id) || 0;
    if (Date.now() < bloqueadoHasta) return null;

    const r = await this._rpc('fs.read.request', { project_id, path: LEDGER_PATH }, { timeout_ms: FS_TIMEOUT_MS });
    let libro = { version: 1, checkouts: {} };
    if (r && r.success !== false && typeof r.content === 'string') {
      try {
        const j = JSON.parse(r.content);
        if (j && typeof j === 'object' && j.checkouts) libro = j;
      } catch (_) { this.logger?.warn('pago-gateway.ledger.json_invalido', { project_id }); }
    } else if (!r) {
      // Sin respuesta del fs: no se martillea el bus en cada pago/barrido.
      this._ledgerNoDisponible.set(project_id, Date.now() + 10 * 60 * 1000);
      return null;
    }
    this._ledger.set(project_id, libro);
    this._ledgerCargado.add(project_id);
    return libro;
  }

  async _ledgerSave(project_id) {
    const libro = this._ledger.get(project_id);
    if (!project_id || !libro) return false;
    const r = await this._rpc('fs.write.request', {
      project_id, path: LEDGER_PATH, content: JSON.stringify(libro, null, 2), encoding: 'utf-8', atomic: true
    }, { timeout_ms: FS_TIMEOUT_MS });
    return !!(r && r.success !== false);
  }

  async _ledgerPut(project_id, entry) {
    if (!entry?.checkout_id) return;
    const libro = await this._ledgerLoad(project_id);
    if (!libro) { this._ledgerEnMemoria(project_id, entry); return; }   // degradado: solo memoria
    libro.checkouts[entry.checkout_id] = { ...(libro.checkouts[entry.checkout_id] || {}), ...entry };
    libro.actualizado = new Date().toISOString();
    const ids = Object.keys(libro.checkouts);
    if (ids.length > LEDGER_MAX) {
      ids.sort((a, b) => String(libro.checkouts[a].creado || '').localeCompare(String(libro.checkouts[b].creado || '')))
        .slice(0, ids.length - LEDGER_MAX)
        .forEach(id => { if (libro.checkouts[id].estado !== 'pendiente') delete libro.checkouts[id]; });
    }
    await this._ledgerSave(project_id);
  }

  _ledgerEnMemoria(project_id, entry) {
    const key = project_id || '_sin_proyecto';
    const libro = this._ledger.get(key) || { version: 1, checkouts: {} };
    libro.checkouts[entry.checkout_id] = { ...(libro.checkouts[entry.checkout_id] || {}), ...entry };
    this._ledger.set(key, libro);
  }

  async _ledgerMark(project_id, checkout_id, patch) {
    const libro = await this._ledgerLoad(project_id);
    if (!libro) {
      const mem = this._ledger.get(project_id || '_sin_proyecto');
      const e = mem?.checkouts?.[checkout_id];
      if (e) Object.assign(e, patch);
      return;
    }
    const e = libro.checkouts[checkout_id];
    if (!e) return;
    Object.assign(e, patch);
    libro.actualizado = new Date().toISOString();
    await this._ledgerSave(project_id);
  }

  async _ledgerBuscar(project_id, { checkout_id, pedido_id, transaction_id } = {}) {
    const libro = await this._ledgerLoad(project_id);
    const checkouts = libro?.checkouts || this._ledger.get(project_id || '_sin_proyecto')?.checkouts || {};
    const todos = Object.values(checkouts);
    if (checkout_id) return checkouts[checkout_id] || null;
    if (transaction_id) return todos.find(e => e.transaction_id === transaction_id) || null;
    if (pedido_id) {
      return todos.filter(e => String(e.pedido_id) === String(pedido_id))
        .sort((a, b) => String(b.creado).localeCompare(String(a.creado)))[0] || null;
    }
    return null;
  }

  // ── LA verdad del pago: un solo camino, lo usen webhook, barrido o reintento ──
  async _confirmarSumup(co, { project_id = null, project_slug = null, origen = 'webhook' } = {}) {
    if (!co?.id) return { confirmado: false, motivo: 'sin_checkout' };
    const txs = Array.isArray(co.transactions) ? co.transactions : [];
    // El primer transaction no siempre es el bueno (puede haber un intento fallido antes).
    const tx = txs.find(t => t.status === 'SUCCESSFUL' || t.status === 'REFUNDED') || txs[txs.length - 1] || null;

    const pedido_id = String(co.checkout_reference || '').split(/[#@]/)[0] || null;
    if (!pedido_id) return { confirmado: false, motivo: 'sin_checkout_reference' };

    const entry = await this._ledgerBuscar(project_id, { checkout_id: co.id });
    const yaConfirmado = this._confirmados.has(co.id) || !!entry?.transaction_id;
    if (yaConfirmado) return { confirmado: false, motivo: 'duplicado', pedido_id };

    const montoCentimos = tx && Number.isFinite(Number(tx.amount))
      ? Math.round(Number(tx.amount) * 100)
      : (Number.isFinite(Number(co.amount)) ? Math.round(Number(co.amount) * 100) : null);
    const propinaCentimos = Number.isFinite(Number(tx?.tip_amount)) ? Math.round(Number(tx.tip_amount) * 100) : null;

    // ── INTEGRIDAD DEL COBRO: lo que entra tiene que ser lo que se pidió ──
    //   Subcobro = se cobró menos de lo pedido → el pedido no se entrega por ese precio.
    //   Sobrecobro = solo admisible si la propina que el cliente añadió en SumUp lo explica.
    const discrepancia = this._cuadraCobro({ entry, co, montoCentimos, propinaCentimos });
    if (discrepancia) {
      await this.eventBus.publish('pago.importe_discrepante', {
        pedido_id,
        project_id: project_id || this.pasarela.project_id || null,
        project_slug,
        session_id: co.id,
        transaction_id: tx?.id || null,
        esperado_centimos: discrepancia.esperado,
        cobrado_centimos: discrepancia.cobrado,
        propina_centimos: propinaCentimos,
        motivo: discrepancia.motivo,
        moneda_esperada: discrepancia.monedaEsperada || null,
        moneda_cobrada: discrepancia.monedaCobrada || null,
        pasarela: 'sumup-checkout', origen,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      if (entry?.checkout_id) await this._ledgerMark(project_id, co.id, { estado: 'discrepante', discrepancia: discrepancia.motivo });
      this.metrics?.increment?.('pago.importe_discrepante.total', { motivo: discrepancia.motivo });
      this.logger?.warn('pago-gateway.importe_discrepante', { pedido_id, session_id: co.id, ...discrepancia });
      return { confirmado: false, motivo: 'importe_discrepante', pedido_id, discrepancia };
    }

    const payload = {
      pedido_id,
      project_id: project_id || this.pasarela.project_id || null,
      project_slug,                                    // el consumidor necesita SABER A QUIEN avisar
      session_id: co.id,
      transaction_id: tx?.id || null,
      transaction_code: tx?.transaction_code || null,
      entry_mode: tx?.entry_mode || null,              // CUSTOMER_ENTRY · APPLE_PAY · GOOGLE_PAY · PAYPAL…
      auth_code: tx?.auth_code || null,
      monto_centimos: montoCentimos,
      propina_centimos: propinaCentimos,
      iva_centimos: Number.isFinite(Number(tx?.vat_amount)) ? Math.round(Number(tx.vat_amount) * 100) : null,
      moneda: co.currency || null,
      pasarela: 'sumup-checkout',
      origen,
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    };
    await this.eventBus.publish('pago.confirmado', payload);
    this._marcarConfirmado(co.id);
    await this._ledgerMark(project_id, co.id, {
      estado: 'confirmado', transaction_id: tx?.id || null,
      transaction_code: tx?.transaction_code || null,
      confirmado_at: payload.timestamp, origen,
      // Si el cobro trae la tarjeta tokenizada (checkout con customer_id), se guarda: es la
      // puerta al "pide otra vez en dos toques" sin volver a teclear la tarjeta.
      ...(co.payment_instrument?.token ? { payment_instrument_token: co.payment_instrument.token } : {})
    });
    this.metrics?.increment?.('pago.confirmado.total', { pasarela: 'sumup-checkout' });
    this.logger?.info('pago-gateway.confirmado', { pedido_id, session_id: co.id, origen });
    return { confirmado: true, pedido_id };
  }

  /**
   * ¿El cobro cuadra con el pedido? Devuelve null si cuadra (o si no hay con qué comparar) y
   * { motivo, esperado, cobrado } si no.
   *
   *   PRECONDICIÓN: `entry` es la fila del libro creada al abrir el link; ahí está el importe
   *   que el negocio pidió. Sin fila no se juzga (webhook de un checkout ajeno a nosotros: lo
   *   caza la conciliación como cobro.huerfano, no este guarda).
   */
  _cuadraCobro({ entry, co, montoCentimos, propinaCentimos }) {
    const esperado = Number.isInteger(entry?.monto_centimos) ? entry.monto_centimos : null;
    const monedaEsperada = entry?.moneda ? String(entry.moneda).toUpperCase() : null;
    const monedaCobrada = co?.currency ? String(co.currency).toUpperCase() : null;

    if (monedaEsperada && monedaCobrada && monedaEsperada !== monedaCobrada) {
      return { motivo: 'moneda', esperado, cobrado: montoCentimos, monedaEsperada, monedaCobrada };
    }
    if (esperado === null || montoCentimos === null) return null;

    if (montoCentimos < esperado) {
      return { motivo: 'importe_insuficiente', esperado, cobrado: montoCentimos, monedaEsperada, monedaCobrada };
    }
    // Sobrecobro: solo lo explica la propina que el cliente añade en la pantalla de SumUp
    // (el importe cobrado la incluye). Un céntimo de holgura por redondeo.
    const exceso = montoCentimos - esperado;
    const explicado = (Number.isFinite(propinaCentimos) ? propinaCentimos : 0) + 1;
    if (exceso > explicado) {
      return { motivo: 'importe_excesivo', esperado, cobrado: montoCentimos, monedaEsperada, monedaCobrada };
    }
    return null;
  }

  async _rechazarSumup(co, { project_id = null, project_slug = null, origen = 'webhook' } = {}) {
    if (!co?.id) return { rechazado: false };
    if (this._rechazados.has(co.id) || this._confirmados.has(co.id)) return { rechazado: false, motivo: 'ya_registrado' };
    const previo = await this._ledgerBuscar(project_id, { checkout_id: co.id });
    if (previo?.estado === 'rechazado' || previo?.estado === 'confirmado') return { rechazado: false, motivo: 'ya_registrado' };
    const pedido_id = String(co.checkout_reference || '').split(/[#@]/)[0] || null;
    const tx = (co.transactions || [])[0] || null;
    await this.eventBus.publish('pago.rechazado', {
      pedido_id, session_id: co.id, project_slug,
      motivo: tx?.status || co.status || 'FAILED',
      transaction_id: tx?.id || null,
      monto_centimos: Number.isFinite(Number(co.amount)) ? Math.round(Number(co.amount) * 100) : null,
      pasarela: 'sumup-checkout', origen,
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    await this._ledgerMark(project_id, co.id, { estado: 'rechazado', rechazado_at: new Date().toISOString() });
    this._rechazados.add(co.id);
    if (this._rechazados.size > 500) this._rechazados.delete(this._rechazados.values().next().value);
    this.metrics?.increment?.('pago.rechazado.total', { pasarela: 'sumup-checkout' });
    return { rechazado: true, pedido_id };
  }

  // ── cancelar: matar el link (DELETE). Si ya se pagó, se confirma, no se cancela. ──
  async _cancelar(d) {
    const kind = this.pasarela.kind;
    if (kind !== 'sumup-checkout' && kind !== 'sumup') {
      return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `cancelar no implementado para '${kind}'` } };
    }
    const cfg = this._sumupCfg(d);
    let checkout_id = d.session_id || null;
    let entry = null;
    if (!checkout_id && d.pedido_id) {
      entry = await this._ledgerBuscar(d.project_id, { pedido_id: d.pedido_id });
      checkout_id = entry?.checkout_id || null;
    } else if (checkout_id) {
      entry = await this._ledgerBuscar(d.project_id, { checkout_id });
    }
    if (!checkout_id) {
      return { status: 404, error: { code: 'NOT_FOUND', message: 'sin session_id ni checkout en el libro para ese pedido' } };
    }
    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const r = await this._sumupCall('DELETE', `/v0.1/checkouts/${encodeURIComponent(checkout_id)}`, { api_key: cred.api_key });
    if (r.ok) {
      await this._ledgerMark(d.project_id, checkout_id, { estado: 'cancelado', cancelado_at: new Date().toISOString() });
      await this.eventBus.publish('pago.cancelado', {
        pedido_id: entry?.pedido_id || d.pedido_id || null, session_id: checkout_id,
        pasarela: 'sumup-checkout', correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      return { status: 200, data: { cancelado: true, session_id: checkout_id } };
    }
    if (r.status === 409) {
      // CHECKOUT_PROCESSED: ya se procesó. Se mira si fue pagado antes de decir nada.
      const co = await this._sumupCall('GET', `/v0.1/checkouts/${encodeURIComponent(checkout_id)}`, { api_key: cred.api_key });
      if (co.ok && co.data?.status === 'PAID') {
        await this._confirmarSumup(co.data, { project_id: d.project_id, project_slug: d.project_slug, origen: 'cancelar' });
        return { status: 409, error: { code: 'CHECKOUT_YA_PAGADO', message: 'el checkout ya estaba pagado: se ha confirmado el pago, no se ha cancelado' } };
      }
      return { status: 409, error: { code: 'CHECKOUT_PROCESADO', message: 'el checkout ya se procesó y no se puede desactivar' } };
    }
    if (r.status === 404) {
      await this._ledgerMark(d.project_id, checkout_id, { estado: 'perdido' });
      return { status: 200, data: { cancelado: true, session_id: checkout_id, ya_no_existia: true } };
    }
    return this._errorDeSumup(r);
  }

  // ── reembolsar (v1.0, merchant-scoped). SIN reintento automático: estado incierto no se repite. ──
  async _sumupReembolsar(d) {
    const kind = this.pasarela.kind;
    if (kind !== 'sumup-checkout' && kind !== 'sumup') {
      return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `reembolsar no implementado para '${kind}'` } };
    }
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'sumup-checkout exige pasarela.merchant_code' } };

    const entry = await this._ledgerBuscar(d.project_id, {
      transaction_id: d.transaction_id, checkout_id: d.session_id, pedido_id: d.pedido_id
    });
    const transaction_id = d.transaction_id || entry?.transaction_id || null;
    if (!transaction_id) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'sin transaction_id: ni en la petición ni en el libro de cobros' } };
    }
    const total = Number.isInteger(d.monto_centimos) && d.monto_centimos > 0 ? d.monto_centimos : null;
    const yaDevuelto = (entry?.reembolsos || []).reduce((s, x) => s + (Number(x.monto_centimos) || 0), 0);
    const cobrado = entry?.monto_centimos || null;
    if (total && cobrado && yaDevuelto + total > cobrado) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: `el reembolso excede lo cobrado (cobrado ${cobrado}, ya devuelto ${yaDevuelto}, pedido ${total})` } };
    }

    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const body = total ? { amount: Number((total / 100).toFixed(2)) } : null;
    const r = await this._sumupCall(
      'POST',
      `/v1.0/merchants/${encodeURIComponent(cfg.merchant)}/payments/${encodeURIComponent(transaction_id)}/refunds`,
      { api_key: cred.api_key, body, retry: false, timeout_ms: 20000 }
    );
    if (r.network || (r.status >= 500 && r.status < 600)) {
      // Puede haberse ejecutado igual. NO se reintenta a ciegas (riesgo de devolver dos veces):
      // se le pregunta a la transacción si el dinero salió.
      this.logger?.warn('pago-gateway.sumup.reembolso_estado_incierto', { transaction_id, code: r.code, status: r.status });
      const v = await this._reembolsoAplicado({
        cfg, api_key: cred.api_key, transaction_id,
        esperadoCentimos: total || null
      });
      if (v.aplicado) {
        const out = await this._registrarReembolso({
          d, entry, transaction_id, yaDevuelto,
          devuelto: total || v.devuelto_centimos || entry?.monto_centimos || null,
          resueltoPorReconsulta: true
        });
        this.logger?.info('pago-gateway.sumup.reembolso_resuelto_por_reconsulta', { transaction_id, devuelto: v.devuelto_centimos });
        return out;
      }
      return {
        status: 504,
        error: {
          code: 'ESTADO_INCIERTO',
          message: v.conocido
            ? 'SumUp no confirmó el reembolso al pedirlo y la transacción no muestra el REFUND: no se ha aplicado (o aún no figura). Reintenta pasado un minuto.'
            : 'SumUp no respondió al reembolso y tampoco se pudo consultar la transacción: estado desconocido. Verifica antes de repetir.'
        }
      };
    }
    if (!r.ok) {
      this.logger?.warn('pago-gateway.sumup.reembolso_failed', { transaction_id, status: r.status });
      return this._errorDeSumup(r, 'SumUp reembolso');
    }

    return this._registrarReembolso({
      d, entry, transaction_id, yaDevuelto,
      devuelto: total || entry?.monto_centimos || null
    });
  }

  // Registro único del reembolso (lo usen el camino directo o el resuelto por reconsulta).
  async _registrarReembolso({ d, entry, transaction_id, yaDevuelto, devuelto, resueltoPorReconsulta = false }) {
    const cobrado = entry?.monto_centimos || null;
    const reembolsos = [...(entry?.reembolsos || []), {
      monto_centimos: devuelto, at: new Date().toISOString(),
      ...(resueltoPorReconsulta ? { resuelto_por_reconsulta: true } : {})
    }];
    const completo = !!(cobrado && yaDevuelto + (devuelto || 0) >= cobrado);
    if (entry?.checkout_id) {
      await this._ledgerMark(d.project_id, entry.checkout_id, {
        reembolsos, estado: completo ? 'reembolsado' : entry.estado
      });
    }
    await this.eventBus.publish('pago.reembolsado', {
      pedido_id: entry?.pedido_id || d.pedido_id || null,
      session_id: entry?.checkout_id || d.session_id || null,
      transaction_id, monto_centimos: devuelto,
      total_reembolsado_centimos: yaDevuelto + (devuelto || 0),
      completo, resuelto_por_reconsulta: resueltoPorReconsulta,
      pasarela: 'sumup-checkout',
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    this.metrics?.increment?.('pago.reembolsado.total', { pasarela: 'sumup-checkout' });
    return {
      status: 200,
      data: { reembolsado: true, transaction_id, monto_centimos: devuelto, completo, resuelto_por_reconsulta: resueltoPorReconsulta }
    };
  }

  // ── qué métodos acepta ESTA cuenta (tarjeta, Apple/Google Pay, PayPal…) ──
  async _sumupMetodos(d = {}) {
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'falta merchant_code' } };
    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };
    const r = await this._sumupCall('GET', `/v0.1/merchants/${encodeURIComponent(cfg.merchant)}/payment-methods`, { api_key: cred.api_key });
    if (!r.ok) return this._errorDeSumup(r);
    const lista = Array.isArray(r.data) ? r.data : (r.data?.items || r.data?.payment_methods || []);
    const ids = lista.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean);
    const tiene = k => ids.includes(k);
    return {
      status: 200,
      data: {
        metodos: ids,
        tarjeta: tiene('card'),
        apple_pay: tiene('apple_pay'),
        google_pay: tiene('google_pay'),
        paypal: tiene('paypal'),
        bizum: false   // SumUp no ofrece Bizum en su catálogo de APMs (verificado 2026-10)
      }
    };
  }

  // ── PREFLIGHT: ¿puede esta cuenta cobrar HOY? ──
  //   El alta de SumUp falla en sitios que no se ven hasta el primer cobro: scope de pagos
  //   online sin activar, moneda de la cuenta distinta, país distinto. Esto lo dice antes.
  async _sumupEstado(d = {}) {
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'falta pasarela.merchant_code (el código M… de la cuenta SumUp)' } };
    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const [m, met] = await Promise.all([
      this._sumupCall('GET', `/v1/merchants/${encodeURIComponent(cfg.merchant)}`, { api_key: cred.api_key }),
      this._sumupCall('GET', `/v0.1/merchants/${encodeURIComponent(cfg.merchant)}/payment-methods`, { api_key: cred.api_key })
    ]);
    if (!m.ok) return this._errorDeSumup(m, 'SumUp merchant');

    const merchant = m.data || {};
    const metodos = met.ok
      ? (Array.isArray(met.data) ? met.data : (met.data?.items || met.data?.payment_methods || []))
        .map(x => (typeof x === 'string' ? x : x?.id)).filter(Boolean)
      : [];
    const tieneTarjeta = metodos.includes('card');

    const avisos = [];
    const pais = String(merchant.country || merchant.merchant_country || '').toUpperCase() || null;
    const monedaCuenta = String(merchant.default_currency || merchant.currency || '').toUpperCase() || null;
    if (pais && pais !== 'ES') avisos.push(`la cuenta es de ${pais}, no de España: revisa país y métodos`);
    if (monedaCuenta && monedaCuenta !== cfg.moneda) avisos.push(`la cuenta liquida en ${monedaCuenta} y la pasarela cobra en ${cfg.moneda}`);
    if (!met.ok) avisos.push(`no se pudieron leer los métodos de pago (${met.status || met.code}): ¿API key sin scope?`);
    else if (!tieneTarjeta) avisos.push('la cuenta NO tiene tarjeta activada para pagos online: pide el alta del scope online a SumUp');
    if (!cfg.webhookUrl) avisos.push('sin pasarela.webhook_url: SumUp no avisará del cobro y el pedido no se liberaría solo');

    // Lo que dice el libro de cobros del proyecto (si nos dan proyecto).
    let libro = null;
    if (d.project_id) {
      const l = await this._ledgerLoad(d.project_id);
      const todos = Object.values(l?.checkouts || {});
      const ahora = Date.now();
      const pendientes = todos.filter(e => e.estado === 'pendiente');
      const hoy = new Date().toISOString().slice(0, 10);
      libro = {
        total: todos.length,
        pendientes: pendientes.length,
        pendientes_vencidos: pendientes.filter(e => e.valid_until && Date.parse(e.valid_until) < ahora).length,
        confirmados_hoy: todos.filter(e => e.estado === 'confirmado' && String(e.confirmado_at || '').slice(0, 10) === hoy).length,
        cobrado_hoy_centimos: todos
          .filter(e => e.estado === 'confirmado' && String(e.confirmado_at || '').slice(0, 10) === hoy)
          .reduce((s, e) => s + (Number(e.monto_centimos) || 0), 0),
        ultimo_confirmado_at: todos.filter(e => e.confirmado_at).map(e => e.confirmado_at).sort().pop() || null
      };
    }

    const puedoCobrar = m.ok && tieneTarjeta && !!cfg.webhookUrl;
    return {
      status: 200,
      data: {
        pasarela: this.pasarela.kind || null,
        merchant_code: cfg.merchant,
        merchant_nombre: merchant.merchant_name || merchant.company?.name || null,
        merchant_pais: pais,
        merchant_moneda: monedaCuenta,
        moneda_configurada: cfg.moneda,
        business_type: merchant.business_type || null,
        metodos,
        tarjeta: tieneTarjeta,
        apple_pay: metodos.includes('apple_pay'),
        google_pay: metodos.includes('google_pay'),
        paypal: metodos.includes('paypal'),
        bizum: false,
        webhook_configurado: !!cfg.webhookUrl,
        min_centimos: cfg.minCentimos,
        ttl_minutos: cfg.ttlMin,
        puedo_cobrar: puedoCobrar,
        avisos,
        libro
      }
    };
  }

  // ── RECIBO: el ticket estructurado de SumUp de un cobro (v1.1) ──
  //   No se genera aquí: SumUp ya emite el recibo de cada transacción. Se lee y se normaliza
  //   para poder mandarlo por WhatsApp o imprimirlo (base de la factura simplificada).
  async _sumupRecibo(d = {}) {
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'falta pasarela.merchant_code' } };
    const entry = await this._ledgerBuscar(d.project_id, {
      transaction_id: d.transaction_id, checkout_id: d.session_id, pedido_id: d.pedido_id
    });
    const transaction_id = d.transaction_id || entry?.transaction_id || null;
    if (!transaction_id) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'sin transaction_id: ni en la petición ni en el libro de cobros' } };
    }
    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const q = new URLSearchParams({ mid: cfg.merchant });
    if (d.tx_event_id) q.set('tx_event_id', String(d.tx_event_id));
    const r = await this._sumupCall('GET', `/v1.1/receipts/${encodeURIComponent(transaction_id)}?${q.toString()}`, { api_key: cred.api_key });
    if (!r.ok) return this._errorDeSumup(r, 'SumUp recibo');

    const td = r.data?.transaction_data || {};
    const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
    const cent = v => (Number.isFinite(num(v)) ? Math.round(num(v) * 100) : null);
    const recibo = {
      pedido_id: entry?.pedido_id || d.pedido_id || null,
      transaction_id,
      transaction_code: td.transaction_code || entry?.transaction_code || null,
      fecha: td.timestamp || td.date || null,
      total_centimos: cent(td.amount),
      iva_centimos: cent(td.vat_amount),
      propina_centimos: cent(td.tip_amount),
      moneda: td.currency || entry?.moneda || cfg.moneda,
      metodo: td.payment_type || td.simple_payment_type || null,
      comercio: r.data?.merchant_data?.merchant_name || r.data?.merchant_data?.business_name || null,
      autorizacion: r.data?.acquirer_data?.authorization_code || null,
      crudo: r.data || null
    };
    await this.eventBus.publish('pago.recibo.obtenido', {
      pedido_id: recibo.pedido_id, session_id: entry?.checkout_id || d.session_id || null,
      transaction_id, total_centimos: recibo.total_centimos, iva_centimos: recibo.iva_centimos,
      pasarela: 'sumup-checkout',
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    return { status: 200, data: recibo };
  }

  // ── ¿el reembolso que dio timeout llegó a ejecutarse? ──
  //   SumUp no tiene idempotency-key para refunds: reintentar a ciegas puede devolver dos veces.
  //   La verdad está en la transacción (v2.1 ?id=): sus eventos REFUND dicen si el dinero salió.
  //   Devuelve { aplicado, conocido, devuelto_centimos }.
  async _reembolsoAplicado({ cfg, api_key, transaction_id, esperadoCentimos = null }) {
    const q = new URLSearchParams({ id: String(transaction_id) });
    const r = await this._sumupCall('GET', `/v2.1/merchants/${encodeURIComponent(cfg.merchant)}/transactions?${q.toString()}`,
      { api_key, timeout_ms: 12000 });
    if (!r.ok || !r.data) return { aplicado: false, conocido: false, estado: r.status || r.code || null };
    const t = Array.isArray(r.data) ? (r.data[0] || null) : r.data;
    if (!t) return { aplicado: false, conocido: false, estado: 'sin_transaccion' };

    const eventos = Array.isArray(t.events) ? t.events : [];
    const refs = eventos.filter(e => String(e.event_type || '').toUpperCase() === 'REFUND');
    const vivos = refs.filter(e => ['REFUNDED', 'SUCCESSFUL'].includes(String(e.status || '').toUpperCase()));
    const devuelto = vivos.reduce((s, e) => s + (Number.isFinite(Number(e.amount)) ? Math.round(Number(e.amount) * 100) : 0), 0);
    const aplicado = esperadoCentimos
      ? devuelto >= esperadoCentimos
      : vivos.length > 0;
    return { aplicado, conocido: true, devuelto_centimos: devuelto, eventos_refund: refs.length, estado_transaccion: t.status || null };
  }

  // ── CONCILIACIÓN con la cuenta de SumUp (historial incremental + liquidación) ──
  //   El barrido pregunta "¿mi checkout se pagó?"; esto pregunta "¿qué ha pasado en la cuenta
  //   que yo no sé?": reembolsos/contracargos desde el panel, cobros sin pedido, y el neto real.
  _conciliacionActiva() {
    const c = this.pasarela?.conciliacion;
    if (c && c.activo === false) return false;
    return this.pasarela.kind === 'sumup-checkout' || this.pasarela.kind === 'sumup';
  }

  _montarConciliacion() {
    if (!this._conciliacionActiva()) return;
    this._conci = new ConciliacionSumUp({
      cfg: () => this._sumupCfg({}),
      resolveCred: p => this._resolveCred(p),
      call: (m, path, opts) => this._sumupCall(m, path, opts),
      cargarLibro: pid => this._ledgerLoad(pid),
      buscarTx: async (pid, ids) => {
        const libro = await this._ledgerLoad(pid);
        const todos = Object.values(libro?.checkouts || this._ledger.get(pid || '_sin_proyecto')?.checkouts || {});
        return todos.find(e => (ids.transaction_id && e.transaction_id === ids.transaction_id)
          || (ids.transaction_code && e.transaction_code === ids.transaction_code)) || null;
      },
      marcar: (pid, cid, patch) => this._ledgerMark(pid, cid, patch),
      leerEstado: pid => this._conciEstadoLoad(pid),
      guardarEstado: (pid, e) => this._conciGuardar(pid, e),
      publicar: (ev, payload) => this.eventBus.publish(ev, payload),
      logger: this.logger, metrics: this.metrics
    });

    const cfgMs = Number(this.pasarela?.conciliacion?.intervalo_ms);
    const ms = Number.isFinite(cfgMs) && cfgMs >= 60000 ? cfgMs : 15 * 60000;
    const tick = () => { this._conciliar({}).catch(err => this.logger?.warn('pago-gateway.conciliacion.fallo', { error: err.message })); };
    this._conciTimer = setInterval(tick, ms);
    if (typeof this._conciTimer.unref === 'function') this._conciTimer.unref();
    const primer = setTimeout(tick, 90000);           // no competir con el arranque del core
    if (typeof primer.unref === 'function') primer.unref();
  }

  async _conciEstadoLoad(project_id) {
    if (!project_id) return null;
    if (this._conciEstado.has(project_id)) return this._conciEstado.get(project_id);
    const r = await this._rpc('fs.read.request', { project_id, path: CONCILIACION_PATH }, { timeout_ms: FS_TIMEOUT_MS });
    let est = { history_cursor: null, payouts_hasta: null, vistos: [] };
    if (r && r.success !== false && typeof r.content === 'string') {
      try { const j = JSON.parse(r.content); if (j && typeof j === 'object') est = { ...est, ...j }; } catch (_) {}
    }
    this._conciEstado.set(project_id, est);
    return est;
  }

  async _conciGuardar(project_id, estado) {
    if (!project_id || !estado) return false;
    this._conciEstado.set(project_id, estado);
    const r = await this._rpc('fs.write.request', {
      project_id, path: CONCILIACION_PATH, content: JSON.stringify(estado, null, 2), encoding: 'utf-8', atomic: true
    }, { timeout_ms: FS_TIMEOUT_MS });
    return !!(r && r.success !== false);
  }

  // Conciliar a mano un proyecto (o todos). Devuelve lo que ha visto, no una promesa vacía.
  async _conciliar(d = {}) {
    if (!this._conci) this._montarConciliacion();
    if (!this._conci) {
      return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: 'conciliación solo para pasarelas SumUp' } };
    }
    const proyectos = [];
    if (d.project_id) {
      proyectos.push({ id: d.project_id, slug: d.project_slug || null });
    } else {
      const r = await this._rpc('project.list.request', {}, { timeout_ms: 4000 });
      for (const p of (r?.projects || [])) if (p?.id) proyectos.push({ id: p.id, slug: p.slug || null });
      if (this.pasarela.project_id && !proyectos.some(p => p.id === this.pasarela.project_id)) {
        proyectos.push({ id: this.pasarela.project_id, slug: this.pasarela.project_slug || null });
      }
    }
    const resumen = await this._conci.tick(proyectos);
    return { status: 200, data: resumen };
  }

  // ── barrido de reconciliación: si el webhook se pierde, el pago no se pierde ──
  _barridoActivo() {
    const b = this.pasarela?.barrido;
    if (b && b.activo === false) return false;
    return this.pasarela.kind === 'sumup-checkout' || this.pasarela.kind === 'sumup';
  }

  _arrancarBarrido() {
    if (!this._barridoActivo()) return;
    const cfgMs = Number(this.pasarela?.barrido?.intervalo_ms);
    const ms = Number.isFinite(cfgMs) && cfgMs >= 30000 ? cfgMs : 120000;
    const tick = () => { this._barrer().catch(err => this.logger?.warn('pago-gateway.barrido.error', { error: err.message })); };
    this._barrido = setInterval(tick, ms);
    if (typeof this._barrido.unref === 'function') this._barrido.unref();
    setTimeout(tick, 20000).unref?.();
  }

  async _barrer() {
    if (this._barriendo) return;
    this._barriendo = true;
    try {
      const proyectos = [];
      const r = await this._rpc('project.list.request', {}, { timeout_ms: 4000 });
      for (const p of (r?.projects || [])) if (p?.id) proyectos.push({ id: p.id, slug: p.slug || null });
      if (this.pasarela.project_id) proyectos.push({ id: this.pasarela.project_id, slug: this.pasarela.project_slug || null });
      const vistos = new Set();
      for (const p of proyectos) {
        if (vistos.has(p.id)) continue;
        vistos.add(p.id);
        await this._barrerProyecto(p);
      }
    } finally { this._barriendo = false; }
  }

  async _barrerProyecto({ id, slug }) {
    const libro = await this._ledgerLoad(id);
    if (!libro) return;
    const pendientes = Object.values(libro.checkouts || {})
      .filter(e => e && e.checkout_id && e.estado === 'pendiente' && !this._confirmados.has(e.checkout_id))
      .slice(0, 50);
    if (!pendientes.length) return;

    const cfg = this._sumupCfg({});
    const cred = await this._resolveCred(cfg.provider);
    if (cred.error) return;
    const ahora = Date.now();

    for (const e of pendientes) {
      const r = await this._sumupCall('GET', `/v0.1/checkouts/${encodeURIComponent(e.checkout_id)}`, { api_key: cred.api_key });
      if (r.status === 404) { await this._ledgerMark(id, e.checkout_id, { estado: 'perdido' }); continue; }
      if (!r.ok) continue;
      const co = r.data;
      if (co?.status === 'PAID') {
        await this._confirmarSumup(co, { project_id: id, project_slug: e.project_slug || slug, origen: 'barrido' });
      } else if (co?.status === 'FAILED') {
        await this._rechazarSumup(co, { project_id: id, project_slug: e.project_slug || slug, origen: 'barrido' });
      } else if (co?.status === 'EXPIRED') {
        await this._ledgerMark(id, e.checkout_id, { estado: 'expirado' });
      } else if (co?.status === 'PENDING' && e.valid_until && Date.parse(e.valid_until) < ahora) {
        // Venció sin pagarse: se mata el link para que nadie pague un pedido ya descartado.
        await this._sumupCall('DELETE', `/v0.1/checkouts/${encodeURIComponent(e.checkout_id)}`, { api_key: cred.api_key });
        await this._ledgerMark(id, e.checkout_id, { estado: 'expirado' });
      }
    }
  }

  // ── suscriptores de bus ──
  async _onIniciarRequest(event) {
    const d = event?.data || event;
    const r = await this._iniciar(d);
    this.metrics?.increment?.('pago.iniciar.' + (r.status === 200 ? 'ok' : 'fail'), { pasarela: this.pasarela.kind || 'none' });
    try {
      this.eventBus.publish('pago.iniciar.response', {
        request_id: d?.request_id, correlation_id: d?.correlation_id || crypto.randomUUID(),
        timestamp: new Date().toISOString(), ...r
      });
    } catch (_) {}
  }

  async _onCancelarRequest(event) {
    const d = event?.data || event;
    const r = await this._cancelar(d);
    try {
      this.eventBus.publish('pago.cancelar.response', {
        request_id: d?.request_id, correlation_id: d?.correlation_id || crypto.randomUUID(),
        timestamp: new Date().toISOString(), ...r
      });
    } catch (_) {}
  }

  async _onReembolsarRequest(event) {
    const d = event?.data || event;
    const r = await this._sumupReembolsar(d);
    try {
      this.eventBus.publish('pago.reembolsar.response', {
        request_id: d?.request_id, correlation_id: d?.correlation_id || crypto.randomUUID(),
        timestamp: new Date().toISOString(), ...r
      });
    } catch (_) {}
  }

  // Envoltorio común para los puertos de solo-consulta (estado, recibo): correlan y responden.
  async _onRespuestaSimple(event, eventoReq, eventoResp, fn) {
    const d = event?.data || event || {};
    let r;
    try { r = await fn(d); }
    catch (err) {
      this.logger?.error('pago-gateway.rpc.fallo', { evento: eventoReq, error: err.message });
      r = { status: 502, error: { code: 'UPSTREAM_UNREACHABLE', message: err.message } };
    }
    try {
      this.eventBus.publish(eventoResp, {
        request_id: d.request_id, correlation_id: d.correlation_id || crypto.randomUUID(),
        timestamp: new Date().toISOString(), ...r
      });
    } catch (_) {}
  }

  // ui_handlers
  async handlePagoIniciar(data) { return this._iniciar(data || {}); }
  async handlePagoCancelar(data) { return this._cancelar(data || {}); }
  async handlePagoReembolsar(data) { return this._sumupReembolsar(data || {}); }
  async handlePagoMetodos(data) { return this._sumupMetodos(data || {}); }
  async handlePagoEstado(data) { return this._sumupEstado(data || {}); }
  async handlePagoRecibo(data) { return this._sumupRecibo(data || {}); }
  async handlePagoConciliar(data) { return this._conciliar(data || {}); }

  // ── WEBHOOK HTTP de la pasarela → pago.confirmado ──
  //   Stripe → firma HMAC (stripe-signature) del cuerpo.
  //   SumUp  → NO firma: su evento es {event_type, id}. Se RECONSULTA el checkout con nuestra
  //            clave secreta y solo se da por pagado si status === 'PAID' (exigencia literal de su doc).
  async handleWebhook(req, res) {
    const raw = req?._rawBody || (typeof req?.body === 'string' ? req.body : JSON.stringify(req?.body || {}));
    let evt = null;
    try { evt = JSON.parse(raw); } catch (_) { return this._respond(res, 400, { error: 'payload no es JSON' }); }
    if (evt && typeof evt.event_type === 'string') return this._webhookSumup(req, res, evt);
    const sig = req?.headers?.['stripe-signature'] || req?.headers?.['Stripe-Signature'];
    const secret = this.pasarela.webhook_secret || null;
    try {
      if (secret) {
        const ok = this._verifyStripeSig(raw, sig, secret);
        if (!ok) { this.logger?.warn('pago-gateway.webhook.firma_invalida', {}); return this._respond(res, 400, { error: 'firma inválida' }); }
      }
      if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
        const s = evt.data?.object || {};
        const pedido_id = s.metadata?.pedido_id || null;
        const pagado = s.payment_status === 'paid' || s.status === 'complete';
        if (pedido_id && pagado) {
          const meta = s.metadata || {};
          const contexto = {};
          for (const k of ['project_slug', 'cliente_nombre', 'cliente_telefono', 'canal_origen']) {
            if (meta[k] !== undefined && meta[k] !== '') contexto[k] = meta[k];
          }
          await this.eventBus.publish('pago.confirmado', {
            pedido_id, project_id: meta.project_id || null,
            session_id: s.id, pasarela: 'stripe-checkout', monto_centimos: s.amount_total || null,
            ...contexto,
            correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
          });
          this.metrics?.increment?.('pago.confirmado.total');
          this.logger?.info('pago-gateway.confirmado', { pedido_id, session_id: s.id });
        }
      }
      return this._respond(res, 200, { received: true });
    } catch (err) {
      this.logger?.error('pago-gateway.webhook.failed', { error: err.message });
      return this._respond(res, 400, { error: err.message });
    }
  }

  // ── webhook SUMUP: el evento no prueba nada, se reconsulta el checkout ──
  async _webhookSumup(req, res, evt) {
    // Token opcional en la URL: cualquiera puede POSTear el endpoint (SumUp no firma); el token
    // evita que un tercero nos queme la cuota de API con eventos inventados.
    const esperado = this.pasarela.webhook_token || null;
    if (esperado) {
      const recibido = req?.query?.t || req?.query?.token || null;
      if (recibido !== esperado) {
        this.logger?.warn('pago-gateway.sumup.webhook_token_invalido', {});
        return this._respond(res, 401, { error: 'token inválido' });
      }
    }
    // Familia de eventos de checkout. La doc pública documenta CHECKOUT_STATUS_CHANGED; la spec
    // OpenAPI ya publica checkouts.created/paid/updated/failed/expired. Se acepta toda la
    // familia (SumUp avisa de que añadirá eventos sin previo aviso) y el resto se ignora.
    const tipo = String(evt.event_type || '');
    if (!/^checkouts?[._]/i.test(tipo) && tipo !== 'CHECKOUT_STATUS_CHANGED') {
      // Doc: "New events may be introduced at any time... silently ignore unknown events."
      this.logger?.info('pago-gateway.sumup.evento_ignorado', { event_type: evt.event_type });
      return this._respond(res, 200, { received: true, ignorado: evt.event_type });
    }
    // El id puede venir en la raíz (formato documentado) o dentro del objeto del evento.
    const checkout_id = evt.id || evt.checkout_id || evt.data?.id || evt.data?.checkout_id
      || evt.checkout?.id || evt.object?.id || null;
    if (!checkout_id) return this._respond(res, 400, { error: 'evento sin id' });

    const cfg = this._sumupCfg({});
    const cred = await this._resolveCred(cfg.provider);
    // 5xx a propósito: SumUp reintenta (1min, 5min, 20min, 2h). Un 2xx aquí perdería el aviso.
    if (cred.error) return this._respond(res, 503, { error: `credencial '${cfg.provider}': ${cred.error}` });

    // Un solo intento y timeout corto: la doc es literal — «reply as soon as possible. If the
    // response takes longer, our system accepts this as a failed notification and retries it».
    // Mejor un 503 en 4 s (reintenta en 1 min) que un 200 tardío que SumUp da por perdido.
    const r = await this._sumupCall('GET', `/v0.1/checkouts/${encodeURIComponent(checkout_id)}`,
      { api_key: cred.api_key, retry: false, timeout_ms: SUMUP_WEBHOOK_TIMEOUT_MS });
    if (r.network || (!r.ok && r.status >= 500)) {
      this.logger?.warn('pago-gateway.sumup.webhook.sin_verificar', { checkout_id, status: r.status, code: r.code });
      return this._respond(res, 503, { error: 'no se pudo verificar el checkout' });
    }
    if (r.status === 404) {
      // La sesión ya no existe. No hay nada que confirmar y reintentar no lo arregla.
      return this._respond(res, 200, { received: true, ignorado: 'checkout_not_found' });
    }
    if (!r.ok) {
      this.logger?.warn('pago-gateway.sumup.webhook.http_error', { checkout_id, status: r.status });
      return this._respond(res, 503, { error: `SumUp ${r.status} al verificar` });
    }

    const co = r.data;
    const project_slug = req?.params?.project || this.pasarela.project_slug || null;
    // El proyecto sale del path del webhook (o del libro) — es lo que permite avisar a quien toca.
    const proyecto = req?.params?.project ? await this._proyectoPorSlug(req.params.project) : null;
    const project_id = proyecto?.id || this.pasarela.project_id || null;

    if (co?.status === 'PAID') {
      const out = await this._confirmarSumup(co, { project_id, project_slug, origen: 'webhook' });
      return this._respond(res, 200, { received: true, ...out });
    }
    if (co?.status === 'FAILED') {
      await this._rechazarSumup(co, { project_id, project_slug, origen: 'webhook' });
      return this._respond(res, 200, { received: true, estado: 'FAILED' });
    }
    if (co?.status === 'EXPIRED') {
      if (project_id) await this._ledgerMark(project_id, co.id, { estado: 'expirado' });
      return this._respond(res, 200, { received: true, estado: 'EXPIRED' });
    }
    this.logger?.info('pago-gateway.sumup.webhook.no_pagado', { checkout_id, status: co?.status || null });
    return this._respond(res, 200, { received: true, estado: co?.status || null });
  }

  async _proyectoPorSlug(slug) {
    if (!slug) return null;
    const r = await this._rpc('project.list.request', {}, { timeout_ms: 3000 });
    const p = (r?.projects || []).find(x => x?.slug === slug);
    return p ? { id: p.id, slug: p.slug } : null;
  }

  // Idempotencia caliente del webhook (SumUp reintenta el mismo evento). El consumidor
  // (pedidos) ya es idempotente por pedido_id; esto evita además el ruido de eventos.
  _marcarConfirmado(session_id) {
    this._confirmados.add(session_id);
    if (this._confirmados.size > 500) this._confirmados.delete(this._confirmados.values().next().value);
  }

  _verifyStripeSig(rawBody, sigHeader, secret) {
    if (!sigHeader) return false;
    const parts = String(sigHeader).split(',').reduce((a, kv) => { const [k, v] = kv.split('='); a[k] = v; return a; }, {});
    const t = parts.t, v1 = parts.v1;
    if (!t || !v1) return false;
    const signed = t + '.' + rawBody;
    const expected = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch (_) { return false; }
  }

  _respond(res, status, body) {
    try {
      if (res && typeof res.writeHead === 'function') { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
    } catch (_) {}
    return { status, ...body };
  }
}

module.exports = PagoGatewayModule;
