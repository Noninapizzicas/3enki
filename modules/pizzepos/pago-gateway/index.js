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
    return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `pasarela '${kind}' no implementada (semilla: stripe-checkout)` } };
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

  // ── WEBHOOK HTTP de la pasarela (Stripe POST firmado) → pago.confirmado ──
  async handleWebhook(req, res) {
    const raw = req?._rawBody || (typeof req?.body === 'string' ? req.body : JSON.stringify(req?.body || {}));
    const sig = req?.headers?.['stripe-signature'] || req?.headers?.['Stripe-Signature'];
    const secret = this.pasarela.webhook_secret || null;
    try {
      // Verifica firma SIEMPRE que haya secret (Stripe: t=...,v1=...).
      if (secret) {
        const ok = this._verifyStripeSig(raw, sig, secret);
        if (!ok) { this.logger?.warn('pago-gateway.webhook.firma_invalida', {}); return this._respond(res, 400, { error: 'firma inválida' }); }
      }
      const evt = JSON.parse(raw);
      if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
        const s = evt.data?.object || {};
        const pedido_id = s.metadata?.pedido_id || null;
        const pagado = s.payment_status === 'paid' || s.status === 'complete';
        if (pedido_id && pagado) {
          await this.eventBus.publish('pago.confirmado', {
            pedido_id, project_id: s.metadata?.project_id || null,
            session_id: s.id, pasarela: 'stripe-checkout', monto_centimos: s.amount_total || null,
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
