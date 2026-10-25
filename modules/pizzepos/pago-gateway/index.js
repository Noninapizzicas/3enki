'use strict';

/**
 * pago-gateway — el LÍDER DE PAGO (puerto de pasarelas provider-agnóstico).
 *
 * El carrito/tienda pide PAGAR; el líder enruta a la PASARELA configurada (Stripe/Redsys/…),
 * devuelve la checkout_url, y al confirmarse el pago (webhook firmado) emite pago.confirmado
 * para que el consumidor libere el pedido. Cambiar de pasarela = cambiar config, no el caller.
 *
 *   tienda/carrito ──pago.iniciar.request {pedido_id, monto_centimos}──► pago-gateway
 *                                                                          │ enruta por kind
 *                                                                          ▼ (credencial + fetch)
 *                                              pasarela (Stripe checkout / Redsys / …)
 *                          pago.iniciar.response {checkout_url, session_id} ◄┘
 *   pasarela ──webhook HTTP firmado──► pago-gateway ──pago.confirmado──► consumidor libera pedido
 *
 * Degradable: sin pasarela configurada → NO_PASARELA (claro, sin reventar). NO maneja dinero:
 * el dinero vive en la pasarela; aquí solo se inicia la sesión y se verifica la confirmación.
 */

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');

class PagoGatewayModule extends BaseModule {
  constructor() {
    super();
    this.name = 'pago-gateway';
    this.version = '1.0.0';
    this._subs = [];
    this._confirmados = new Set();   // idempotencia del webhook (SumUp reintenta el mismo evento)
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    // config: global override o la del module.json (moduleConfig) — mismo fix que media-generator.
    this.config = (core.config && core.config['pago-gateway']) || core.moduleConfig || {};
    this.pasarela = this.config.pasarela || {};   // { kind, provider, moneda?, webhook_base? }

    const sub = (ev, fn) => { try { this._subs.push(this.eventBus.subscribe(ev, fn)); } catch (_) {} };
    sub('pago.iniciar.request', e => this._onIniciarRequest(e));

    this.logger?.info('module.loaded', {
      module: this.name, version: this.version,
      pasarela: this.pasarela.kind || '(sin configurar)', provider: this.pasarela.provider || null
    });
  }

  async onUnload() {
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
    if (kind === 'stripe-checkout') {
      return this._stripeCheckout(d);
    }
    if (kind === 'sumup-checkout' || kind === 'sumup') {
      return this._sumupCheckout(d);
    }
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
    // permite RECONSTRUIR el pedido si el webhook llega cuando ya no esta en memoria (un reinicio
    // en la ventana de pago). Se filtra a escalares y claves simples (form-encoded de Stripe).
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

  // ── adapter SUMUP (Hosted Checkout = link de pago alojado por SumUp) ──
  // Doc: developer.sumup.com/api/checkouts/create + /online-payments/hosted-checkout.
  //   POST api.sumup.com/v0.1/checkouts {amount(decimal), currency, checkout_reference,
  //        merchant_code, return_url(=NUESTRO webhook), redirect_url(=vuelta del cliente),
  //        hosted_checkout:{enabled:true}} → {id, hosted_checkout_url}
  // El cliente paga en checkout.sumup.com/pay/<uuid>. Nada de dinero aquí.
  async _sumupCheckout(d) {
    const merchant = d.merchant_code || this.pasarela.merchant_code || null;
    if (!merchant) {
      return { status: 500, error: { code: 'CONFIG_MISSING', message: 'sumup-checkout exige pasarela.merchant_code (MC…) en la config del proyecto' } };
    }
    // Sin return_url SumUp NO avisa: el checkout se cobraría y nadie liberaría el pedido.
    // Se falla en el arranque del pago (loud) antes que crear una sesión que nunca confirma.
    const webhookUrl = d.webhook_url || this.pasarela.webhook_url || null;
    if (!webhookUrl) {
      return { status: 500, error: { code: 'CONFIG_MISSING', message: 'sumup-checkout exige pasarela.webhook_url (URL pública del webhook; es el return_url de SumUp)' } };
    }
    const provider = this.pasarela.provider || 'SUMUP';
    const cred = await this._resolveCred(provider);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${provider}': ${cred.error}` } };

    const moneda = String(d.moneda || this.pasarela.moneda || 'eur').toUpperCase();
    const concepto = (d.concepto || `Pedido ${d.pedido_id}`).slice(0, 120);
    const clienteUrl = d.return_url || this.pasarela.return_url || null;

    // checkout_reference es el ÚNICO campo que SumUp devuelve en el GET del webhook
    // (su evento solo trae {event_type, id}), así que aquí viaja el pedido_id.
    // Reintento de pago del mismo pedido = referencia duplicada → se le añade @<ts>
    // y al leer se corta por '@'. Sin metadata en SumUp: esta es la ranura.
    const refBase = String(d.checkout_reference || d.pedido_id);

    const crear = async (ref) => {
      const body = {
        amount: Number((d.monto_centimos / 100).toFixed(2)),   // SumUp quiere decimal (12.34), no céntimos
        currency: moneda,
        checkout_reference: ref,
        merchant_code: merchant,
        description: concepto,
        hosted_checkout: { enabled: true },
        return_url: webhookUrl
      };
      if (clienteUrl) body.redirect_url = clienteUrl;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 20000);
      try {
        const resp = await fetch('https://api.sumup.com/v0.1/checkouts', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + cred.api_key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: controller.signal
        });
        clearTimeout(tid);
        const text = await resp.text();
        let parsed = null; try { parsed = JSON.parse(text); } catch (_) {}
        return { resp, text, parsed };
      } catch (err) {
        clearTimeout(tid);
        throw err;
      }
    };

    let out;
    try {
      out = await crear(refBase);
      // 409 / "duplicate": el cliente reintenta el pago del mismo pedido.
      const dup = out.resp && out.resp.status === 409;
      if (dup) {
        this.logger?.info('pago-gateway.sumup.referencia_duplicada', { ref: refBase });
        out = await crear(`${refBase}@${Date.now()}`);
      }
    } catch (err) {
      if (err.name === 'AbortError') return { status: 504, error: { code: 'UPSTREAM_TIMEOUT', message: 'SumUp no respondió a tiempo' } };
      return { status: 502, error: { code: 'UPSTREAM_UNREACHABLE', message: `red SumUp: ${err.message}` } };
    }

    const { resp, text, parsed } = out;
    if (!resp.ok) {
      const sMsg = parsed?.message || parsed?.error_message || parsed?.error?.message || (text || '').slice(0, 300) || `HTTP ${resp.status}`;
      this.logger?.warn('pago-gateway.sumup.http_error', { status: resp.status, message: sMsg });
      const code = resp.status === 401 || resp.status === 403 ? 'PERMISSION_DENIED'
        : resp.status === 400 || resp.status === 422 ? 'INVALID_INPUT'
        : 'UPSTREAM_INVALID_RESPONSE';
      return { status: resp.status, error: { code, message: `SumUp ${resp.status}: ${sMsg}` } };
    }
    if (!parsed?.hosted_checkout_url || !parsed?.id) {
      return { status: 502, error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'SumUp no devolvió hosted_checkout_url/id (¿hosted_checkout.enabled?)' } };
    }
    return {
      status: 200,
      data: {
        checkout_url: parsed.hosted_checkout_url, session_id: parsed.id,
        pasarela: 'sumup-checkout', estado: 'pendiente',
        expira_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()   // sesión alojada: 30 min
      }
    };
  }

  // suscriptor de bus → publica la response
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

  // ui_handler: probeable + invocable del frontend
  async handlePagoIniciar(data) { return this._iniciar(data || {}); }

  // ── WEBHOOK HTTP de la pasarela → pago.confirmado ──
  // Dos formas de creer a la pasarela:
  //   Stripe → firma HMAC (stripe-signature) del cuerpo.
  //   SumUp  → NO firma: su evento es {event_type, id}. Se RECONSULTA el checkout con
  //            nuestra clave secreta y solo se da por pagado si status === 'PAID'
  //            (exigencia literal de su doc: "must always verify ... by calling a relevant SumUp's API").
  async handleWebhook(req, res) {
    const raw = req?._rawBody || (typeof req?.body === 'string' ? req.body : JSON.stringify(req?.body || {}));
    let evt = null;
    try { evt = JSON.parse(raw); } catch (_) { return this._respond(res, 400, { error: 'payload no es JSON' }); }
    if (evt && typeof evt.event_type === 'string') return this._webhookSumup(req, res, evt);
    const sig = req?.headers?.['stripe-signature'] || req?.headers?.['Stripe-Signature'];
    const secret = this.pasarela.webhook_secret || null;
    try {
      // Verifica firma SIEMPRE que haya secret (Stripe: t=...,v1=...).
      if (secret) {
        const ok = this._verifyStripeSig(raw, sig, secret);
        if (!ok) { this.logger?.warn('pago-gateway.webhook.firma_invalida', {}); return this._respond(res, 400, { error: 'firma inválida' }); }
      }
      if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
        const s = evt.data?.object || {};
        const pedido_id = s.metadata?.pedido_id || null;
        const pagado = s.payment_status === 'paid' || s.status === 'complete';
        if (pedido_id && pagado) {
          // Se reenvia la metadata de contexto que puso el caller: es lo que permite al consumidor
          // reconstruir el pedido si el webhook llega tarde (deploy/reinicio en la ventana de pago).
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
    if (evt.event_type !== 'CHECKOUT_STATUS_CHANGED') {
      // Doc: "New events may be introduced at any time... silently ignore unknown events."
      this.logger?.info('pago-gateway.sumup.evento_ignorado', { event_type: evt.event_type });
      return this._respond(res, 200, { received: true, ignorado: evt.event_type });
    }
    const checkout_id = evt.id;
    if (!checkout_id) return this._respond(res, 400, { error: 'evento sin id' });

    const provider = this.pasarela.provider || 'SUMUP';
    const cred = await this._resolveCred(provider);
    // 5xx a propósito: SumUp reintenta (1min, 5min, 20min, 2h). Un 2xx aquí perdería el aviso.
    if (cred.error) return this._respond(res, 503, { error: `credencial '${provider}': ${cred.error}` });

    let resp, text;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);
      resp = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkout_id)}`, {
        method: 'GET', headers: { 'Authorization': 'Bearer ' + cred.api_key }, signal: controller.signal
      });
      clearTimeout(tid);
      text = await resp.text();
    } catch (err) {
      const code = err.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE';
      this.logger?.warn('pago-gateway.sumup.webhook.sin_verificar', { checkout_id, code, error: err.message });
      return this._respond(res, 503, { error: `no se pudo verificar el checkout (${code})` });
    }

    let co = null; try { co = JSON.parse(text); } catch (_) {}
    if (!resp.ok) {
      // 404 = la sesión ya no existe. No hay nada que confirmar y reintentar no lo arregla.
      if (resp.status === 404) return this._respond(res, 200, { received: true, ignorado: 'checkout_not_found' });
      this.logger?.warn('pago-gateway.sumup.webhook.http_error', { checkout_id, status: resp.status });
      return this._respond(res, 503, { error: `SumUp ${resp.status} al verificar` });
    }
    if (co?.status !== 'PAID') {
      this.logger?.info('pago-gateway.sumup.webhook.no_pagado', { checkout_id, status: co?.status || null });
      return this._respond(res, 200, { received: true, estado: co?.status || null });
    }
    if (this._confirmados.has(checkout_id)) {
      return this._respond(res, 200, { received: true, duplicado: true });   // SumUp reintenta hasta 4 veces
    }

    // Sin metadata en SumUp: el pedido_id viajó en checkout_reference (con posible sufijo @<ts>).
    const pedido_id = String(co.checkout_reference || '').split('@')[0] || null;
    if (!pedido_id) {
      this.logger?.warn('pago-gateway.sumup.webhook.sin_referencia', { checkout_id });
      return this._respond(res, 200, { received: true, ignorado: 'sin_checkout_reference' });
    }

    const project_slug = req?.params?.project || this.pasarela.project_slug || null;
    const monto = Number.isFinite(Number(co.amount)) ? Math.round(Number(co.amount) * 100) : null;
    const tx = Array.isArray(co.transactions) && co.transactions[0] ? co.transactions[0] : null;

    await this.eventBus.publish('pago.confirmado', {
      pedido_id, project_id: this.pasarela.project_id || null,
      project_slug,                                   // el consumidor necesita SABER A QUIEN avisar
      session_id: checkout_id, transaction_id: tx?.id || null,
      pasarela: 'sumup-checkout', monto_centimos: monto, moneda: co.currency || null,
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    this._marcarConfirmado(checkout_id);
    this.metrics?.increment?.('pago.confirmado.total', { pasarela: 'sumup-checkout' });
    this.logger?.info('pago-gateway.confirmado', { pedido_id, session_id: checkout_id, pasarela: 'sumup-checkout' });
    return this._respond(res, 200, { received: true });
  }

  // Idempotencia barata del webhook (SumUp reintenta el mismo evento). El consumidor
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
