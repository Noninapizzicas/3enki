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
const BaseModule = require('../_shared/base-module');
const ConciliacionSumUp = require('./conciliacion');
const { TerminalSumUp } = require('./terminal');
const { ClientesSumUp } = require('./clientes');
const QR = require('./qr');

const SUMUP_API = 'https://api.sumup.com';
// Storage del proyecto. El prefijo es del ÓRGANO, no de la vertical: /pago vale para
// cualquier proyecto (pizzería, panadería, taller). Las rutas viejas se siguen leyendo
// una vez para no perder el libro de cobros al desplegar (migración sin hueco).
const PAGO_DIR = '/pago';
const LEDGER_PATH = PAGO_DIR + '/checkouts.json';
const LEDGER_LEGACY = '/pizzepos/pago/checkouts.json';
const CONCILIACION_PATH = PAGO_DIR + '/conciliacion.json';
const CONCILIACION_LEGACY = '/pizzepos/pago/conciliacion.json';
const CONFIG_PATH = PAGO_DIR + '/config.json';        // config de pasarela POR PROYECTO
const CLIENTES_PATH = PAGO_DIR + '/clientes.json';    // registro de clientes y tarjetas POR PROYECTO
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
    this.version = '3.0.0';
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
    this._pasarelaProyecto = new Map();   // project_id → bloque `pasarela` del proyecto
    this._configCargada = new Set();      // project_id ya leído de disco
    this._configNoDisponible = new Map(); // project_id → ts hasta el que no se reintenta leer
    this._registro = new Map();           // project_id → { clientes: { [customer_id]: {...} } }
    this._registroCargado = new Set();
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
    // Config de pasarela POR PROYECTO (el órgano es el mismo para todos los negocios):
    // leer / escribir por bus, y el mismo camino que usa el panel.
    sub('pago.config.request', e => this._onRespuestaSimple(e, 'pago.config.request', 'pago.config.response', d => this._configLeer(d)));
    sub('pago.config.actualizar.request', e => this._onRespuestaSimple(e, 'pago.config.actualizar.request', 'pago.config.actualizar.response', d => this._configEscribir(d)));
    // Un cambio de config invalida la caché: el siguiente pago ya usa la nueva.
    sub('pago.config.actualizada', e => { const d = e?.data || e; if (d?.project_id) this._invalidarConfig(d.project_id); });

    // ── PUERTOS DEL ÓRGANO (los mismos para TODOS los proyectos) ──
    // QR, datáfono, clientes, tarjeta guardada y recurrencia: cada puerto responde con su par
    // .request/.response. Un negocio nuevo los usa escribiendo su config, sin tocar código.
    const puertos = {
      'pago.qr.request': d => this._qr(d),
      'pago.reader.listar.request': d => this._readerListar(d),
      'pago.reader.parear.request': d => this._readerParear(d),
      'pago.reader.leer.request': d => this._readerLeer(d),
      'pago.reader.renombrar.request': d => this._readerRenombrar(d),
      'pago.reader.borrar.request': d => this._readerBorrar(d),
      'pago.reader.estado.request': d => this._readerEstado(d),
      'pago.reader.cobrar.request': d => this._readerCobrar(d),
      'pago.reader.consultar.request': d => this._readerConsultar(d),
      'pago.reader.terminar.request': d => this._readerTerminar(d),
      'pago.reader.cobrar_go.request': d => this._readerCobrarGo(d),
      'pago.cliente.alta.request': d => this._clienteAlta(d),
      'pago.cliente.leer.request': d => this._clienteLeer(d),
      'pago.cliente.actualizar.request': d => this._clienteActualizar(d),
      'pago.cliente.tarjetas.request': d => this._clienteTarjetas(d),
      'pago.cliente.tarjeta.baja.request': d => this._clienteBajaTarjeta(d),
      'pago.tokenizar.request': d => this._tokenizar(d),
      'pago.cobrar_guardada.request': d => this._cobrarGuardada(d)
    };
    for (const [ev, fn] of Object.entries(puertos)) {
      sub(ev, e => this._onRespuestaSimple(e, ev, ev.replace(/\.request$/, '.response'), fn));
    }

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

  // ══════════════════════════════════════════════════════════════════════════
  //  CONFIG POR PROYECTO — el órgano es uno; cada negocio tiene su cuenta
  //  Sin esto, dos proyectos compartirían merchant code y clave (un cobro
  //  acabaría en la cuenta del otro). Con esto, cero código por proyecto:
  //  se escribe la config del proyecto y el mismo órgano cobra con SU cuenta.
  // ══════════════════════════════════════════════════════════════════════════

  _pasarelaPara(project_id) {
    const proy = project_id ? this._pasarelaProyecto.get(project_id) : null;
    // Modo ESTRICTO (multi-negocio): sin config propia no se cobra. Un proyecto que no
    // ha declarado su cuenta NUNCA usa la del core — así nadie cobra en la cuenta de otro.
    if (!proy && project_id && this.pasarela?.exigir_config_proyecto === true) return {};
    if (!proy) return this.pasarela;
    const base = this.pasarela || {};
    const out = { ...base, ...proy };
    // Los bloques anidados se mergean: el proyecto puede cambiar solo `barrido`.
    for (const b of ['barrido', 'conciliacion']) {
      if (proy[b] && typeof proy[b] === 'object' && !Array.isArray(proy[b])) out[b] = { ...(base[b] || {}), ...proy[b] };
    }
    return out;
  }

  // La ruta del libro es del ÓRGANO (/pago/...), configurable por si un despliegue
  // quiere aislarlo en otro sitio. El prefijo pizzepos era de la vertical, no del pago.
  _ledgerPath() { return this.config?.libro_path || LEDGER_PATH; }
  _conciPath() { return this.config?.conciliacion_path || CONCILIACION_PATH; }

  _invalidarConfig(project_id) {
    if (!project_id) return;
    this._pasarelaProyecto.delete(project_id);
    this._configCargada.delete(project_id);
  }

  // Carga (una vez por proyecto) el bloque `pasarela` de /pago/config.json.
  // Degrada en silencio si no hay fs o no hay config: se usan los defaults del core.
  async _asegurarConfig(project_id) {
    if (!project_id || this._configCargada.has(project_id)) return this._pasarelaPara(project_id);
    if (Date.now() < (this._configNoDisponible.get(project_id) || 0)) return this._pasarelaPara(project_id);
    const r = await this._rpc('fs.read.request', { project_id, path: CONFIG_PATH }, { timeout_ms: FS_TIMEOUT_MS });
    if (!r) {
      this._configNoDisponible.set(project_id, Date.now() + 10 * 60 * 1000);
      return this._pasarelaPara(project_id);
    }
    if (r.success !== false && typeof r.content === 'string') {
      try {
        const j = JSON.parse(r.content);
        const p = j?.pasarela;
        if (p && typeof p === 'object' && !Array.isArray(p)) this._pasarelaProyecto.set(project_id, p);
      } catch (_) { this.logger?.warn('pago-gateway.config.json_invalido', { project_id }); }
    }
    this._configCargada.add(project_id);
    return this._pasarelaPara(project_id);
  }

  async _configLeer(d = {}) {
    if (!d.project_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'project_id requerido' } };
    const p = await this._asegurarConfig(d.project_id);
    return {
      status: 200,
      data: {
        project_id: d.project_id,
        pasarela: this._configPublica(p),
        fuente: this._pasarelaProyecto.has(d.project_id) ? 'proyecto' : 'core'
      }
    };
  }

  async _configEscribir(d = {}) {
    if (!d.project_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'project_id requerido' } };
    const cambios = d.pasarela && typeof d.pasarela === 'object' && !Array.isArray(d.pasarela) ? d.pasarela : null;
    if (!cambios) return { status: 400, error: { code: 'INVALID_INPUT', message: 'pasarela (objeto) requerido' } };

    // Validación: lo que se escribe es lo que se usará. Nada de kind inventado.
    const KINDS = new Set(['stripe-checkout', 'sumup-checkout', 'sumup']);
    if (cambios.kind !== undefined && !KINDS.has(String(cambios.kind))) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: `kind '${cambios.kind}' no implementado (stripe-checkout, sumup-checkout)`, field: 'kind' } };
    }
    if (cambios.merchant_code !== undefined && cambios.merchant_code !== null && typeof cambios.merchant_code !== 'string') {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'merchant_code debe ser string', field: 'merchant_code' } };
    }
    if (cambios.ttl_minutos !== undefined && cambios.ttl_minutos !== null) {
      const t = Number(cambios.ttl_minutos);
      if (!Number.isFinite(t) || t <= 0) return { status: 400, error: { code: 'INVALID_INPUT', message: 'ttl_minutos debe ser > 0', field: 'ttl_minutos' } };
    }
    if (cambios.provider !== undefined && typeof cambios.provider !== 'string') {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'provider debe ser string (nombre del credential-manager)', field: 'provider' } };
    }

    const actual = this._pasarelaProyecto.get(d.project_id) || {};
    const nuevas = { ...actual, ...cambios };
    for (const b of ['barrido', 'conciliacion']) {
      if (cambios[b] && typeof cambios[b] === 'object' && !Array.isArray(cambios[b])) nuevas[b] = { ...(actual[b] || {}), ...cambios[b] };
    }
    // Lo que viaja al disco es SOLO la config del proyecto (nada de defaults del core
    // mezclados: así se ve de un vistazo qué es de este negocio).
    const r = await this._rpc('fs.write.request', {
      project_id: d.project_id, path: CONFIG_PATH,
      content: JSON.stringify({ esquema: 'pago-pasarela-v1', pasarela: nuevas }, null, 2),
      encoding: 'utf-8', atomic: true
    }, { timeout_ms: FS_TIMEOUT_MS });
    if (!r || r.success === false) {
      return { status: 503, error: { code: 'STORAGE_UNAVAILABLE', message: 'no se pudo escribir /pago/config.json del proyecto' } };
    }
    this._pasarelaProyecto.set(d.project_id, nuevas);
    this._configCargada.add(d.project_id);
    this.eventBus?.publish?.('pago.config.actualizada', {
      project_id: d.project_id, pasarela: this._configPublica({ ...this.pasarela, ...nuevas }),
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    return { status: 200, data: { project_id: d.project_id, pasarela: this._configPublica({ ...this.pasarela, ...nuevas }), guardado: true } };
  }

  // Vista sin secretos: la api_key NUNCA vive aquí (está en credential-manager).
  _configPublica(p = {}) {
    return {
      kind: p.kind || null, provider: p.provider || null, moneda: p.moneda || null,
      merchant_code: p.merchant_code || null, webhook_url: p.webhook_url || null,
      return_url: p.return_url || null, ttl_minutos: p.ttl_minutos ?? null,
      min_centimos: p.min_centimos ?? null, proyecto: p.project_slug || null,
      tiene_webhook_token: !!p.webhook_token, tiene_webhook_secret: !!p.webhook_secret,
      puede_cobrar: !!(p.kind && p.provider && (p.kind === 'stripe-checkout' ? true : !!p.merchant_code))
    };
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

  // La credencial es POR PROYECTO cuando se pasa project_id: credential-manager resuelve
  // SUMUP_API_KEY_PROJECT_<id> antes de caer a la global. Sin project_id resolvía siempre
  // la global → dos negocios pagaban con la cuenta del primero.
  async _resolveCred(provider, project_id = null) {
    const payload = { provider };
    if (project_id) payload.project_id = project_id;
    const r = await this._rpc('credential.resolve.request', payload, { timeout_ms: 6000 });
    if (!r) return { error: 'credential.resolve timeout' };
    if (r.success === false || !r.api_key) return { error: r.error || `sin credencial para provider '${provider}'` };
    return { api_key: r.api_key, nivel: r.resolved_from || null, identificador: r.identifier || null };
  }

  // ── REFERENCIA UNIVERSAL ──
  // El pago no cobra "un pedido": cobra un HECHO con identidad propia. Un pedido es vocabulario
  // de pizzería; un taller dice presupuesto y una reserva dice reserva. El contrato dice
  // `referencia`; `pedido_id` se sigue admitiendo como ALIAS para no romper a los consumidores
  // que ya lo mandan (tienda-api, whatsapp-bot) y se sigue emitiendo en los eventos.
  _ref(d = {}) {
    const r = d?.referencia ?? d?.referencia_externa ?? d?.pedido_id ?? d?.order_id ?? null;
    if (r === null || r === undefined || r === '') return null;
    return String(r);
  }

  // Un bloque de pasarela con cuenta válida para operar (merchant + webhook donde haga falta).
  async _cuentaParaCobro(project_id) {
    const cfg = this._sumupCfg({ project_id });
    if (!cfg.merchant) {
      return { error: { status: 500, error: { code: 'CONFIG_MISSING', message: 'falta pasarela.merchant_code del proyecto (el código M… se copia del panel de SumUp)' } } };
    }
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
    if (cred.error) return { error: { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } } };
    return { cfg, api_key: cred.api_key };
  }

  async _terminal(d = {}) {
    const c = await this._cuentaParaCobro(d.project_id);
    if (c.error) return c;
    return { term: new TerminalSumUp({ call: this._sumupCall.bind(this), merchant: c.cfg.merchant, moneda: c.cfg.moneda, logger: this.logger }), cfg: c.cfg, api_key: c.api_key };
  }

  async _clientesDe(d = {}) {
    const c = await this._cuentaParaCobro(d.project_id);
    if (c.error) return c;
    return { cli: new ClientesSumUp({ call: this._sumupCall.bind(this), merchant: c.cfg.merchant, moneda: c.cfg.moneda, logger: this.logger }), cfg: c.cfg, api_key: c.api_key };
  }

  // ── registro de clientes y tarjetas (POR PROYECTO; el libro es del negocio) ──
  async _registroLoad(project_id) {
    if (!project_id) return null;
    if (this._registro.has(project_id)) return this._registro.get(project_id);
    if (this._registroCargado.has(project_id)) return this._registro.get(project_id) || null;
    const r = await this._rpc('fs.read.request', { project_id, path: CLIENTES_PATH }, { timeout_ms: FS_TIMEOUT_MS });
    let reg = { version: 1, clientes: {} };
    if (r && r.success !== false && typeof r.content === 'string' && r.content) {
      try {
        const j = JSON.parse(r.content);
        if (j && typeof j === 'object' && j.clientes) reg = j;
      } catch (_) { this.logger?.warn('pago-gateway.clientes.json_invalido', { project_id }); }
    }
    this._registro.set(project_id, reg);
    this._registroCargado.add(project_id);
    return reg;
  }

  async _registroSave(project_id) {
    const reg = this._registro.get(project_id);
    if (!project_id || !reg) return false;
    const r = await this._rpc('fs.write.request', {
      project_id, path: CLIENTES_PATH, content: JSON.stringify(reg, null, 2), encoding: 'utf-8', atomic: true
    }, { timeout_ms: FS_TIMEOUT_MS });
    return !!(r && r.success !== false);
  }

  // Guarda SOLO lo mínimo para reconocer al cliente y su tarjeta: nunca el número de tarjeta
  // (no lo tenemos) ni datos que no hagan falta para cobrar.
  async _registroTarjeta(project_id, { customer_id, tarjeta = null, alias = null, alta = false }) {
    if (!project_id || !customer_id) return;
    const reg = await this._registroLoad(project_id);
    if (!reg) return;
    const c = reg.clientes[customer_id] || { customer_id, creado: new Date().toISOString(), tarjetas: {} };
    if (alias) c.alias = String(alias).slice(0, 120);
    if (alta) c.actualizado = new Date().toISOString();
    if (tarjeta?.token) {
      c.tarjetas = c.tarjetas || {};
      c.tarjetas[tarjeta.token] = {
        ultimos4: tarjeta.ultimos4 || null, marca: tarjeta.marca || null,
        mandato: tarjeta.mandato || null, activa: tarjeta.activa !== false,
        cobrable_sin_cliente: !!tarjeta.cobrable_sin_cliente,
        visto: new Date().toISOString()
      };
    }
    reg.clientes[customer_id] = c;
    reg.actualizado = new Date().toISOString();
    await this._registroSave(project_id);
  }

  // ── núcleo: iniciar el pago. RETORNA {status, data|error} ──
  async _iniciar(d) {
    const referencia = this._ref(d);
    if (!referencia || !Number.isInteger(d.monto_centimos) || d.monto_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'referencia (o su alias pedido_id) y monto_centimos (entero > 0) requeridos' } };
    }
    d = { ...d, referencia, pedido_id: d.pedido_id ?? referencia };
    const p = await this._asegurarConfig(d.project_id);   // config del negocio, no la del core
    const kind = p.kind;
    if (!kind) {
      return { status: 503, error: { code: 'NO_PASARELA', message: 'sin pasarela configurada para este proyecto. Escribe pago.config (kind + provider + merchant_code) + su credencial.' } };
    }
    if (kind === 'stripe-checkout') return this._stripeCheckout(d);
    if (kind === 'sumup-checkout' || kind === 'sumup') return this._sumupCheckout(d);
    return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `pasarela '${kind}' no implementada (semilla: stripe-checkout, sumup-checkout)` } };
  }

  // ── adapter STRIPE (Checkout Session) ──
  async _stripeCheckout(d) {
    const p = this._pasarelaPara(d.project_id);
    const provider = p.provider || 'STRIPE';
    const cred = await this._resolveCred(provider, d.project_id);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${provider}': ${cred.error}` } };

    const moneda = (d.moneda || p.moneda || 'eur').toLowerCase();
    const concepto = (d.concepto || 'Pedido').slice(0, 120);
    const ret = d.return_url || p.return_url || '';
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
    params.set('metadata[pedido_id]', String(d.pedido_id ?? d.referencia));
    params.set('metadata[referencia]', String(d.referencia ?? d.pedido_id));
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
    const p = this._pasarelaPara(d.project_id);
    return {
      project_id: d.project_id || p.project_id || null,
      merchant: d.merchant_code || p.merchant_code || null,
      provider: p.provider || 'SUMUP',
      moneda: String(d.moneda || p.moneda || 'eur').toUpperCase(),
      webhookUrl: d.webhook_url || p.webhook_url || null,
      clienteUrl: d.return_url || p.return_url || null,
      webhookToken: p.webhook_token || null,
      minCentimos: Number.isInteger(p.min_centimos) ? p.min_centimos : 100,   // SumUp: mínimo 1,00
      ttlMin: this._ttlMinutos(d.project_id)
    };
  }

  _ttlMinutos(project_id = null) {
    const t = Number(this._pasarelaPara(project_id)?.ttl_minutos);
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
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const concepto = (d.concepto || `Cobro ${d.referencia || d.pedido_id}`).slice(0, 120);
    const base = String(d.checkout_reference || d.referencia || d.pedido_id).replace(/#/g, '-').slice(0, REF_MAX);
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
      referencia: String(d.referencia || d.pedido_id),
      pedido_id: String(d.pedido_id || d.referencia),   // alias: el libro viejo y los consumidores lo leen
      canal: 'online',
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

    const ruta = this._ledgerPath();
    let r = await this._rpc('fs.read.request', { project_id, path: ruta }, { timeout_ms: FS_TIMEOUT_MS });
    // Migración sin hueco: si aún no existe la ruta del órgano, se lee la vieja de pizzepos.
    if ((!r || r.success === false || !r.content) && ruta !== LEDGER_LEGACY) {
      const rl = await this._rpc('fs.read.request', { project_id, path: LEDGER_LEGACY }, { timeout_ms: FS_TIMEOUT_MS });
      if (rl && rl.success !== false && typeof rl.content === 'string' && rl.content) r = rl;
    }
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
      project_id, path: this._ledgerPath(), content: JSON.stringify(libro, null, 2), encoding: 'utf-8', atomic: true
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

  async _ledgerBuscar(project_id, { checkout_id, referencia, pedido_id, transaction_id } = {}) {
    const libro = await this._ledgerLoad(project_id);
    const checkouts = libro?.checkouts || this._ledger.get(project_id || '_sin_proyecto')?.checkouts || {};
    const todos = Object.values(checkouts);
    if (checkout_id) return checkouts[checkout_id] || null;
    if (transaction_id) return todos.find(e => e.transaction_id === transaction_id) || null;
    const ref = referencia ?? pedido_id;   // alias: el mismo hecho con dos nombres
    if (ref !== undefined && ref !== null) {
      return todos.filter(e => String(e.referencia) === String(ref) || String(e.pedido_id) === String(ref))
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

    // La referencia manda desde el LIBRO (el hecho que nosotros registramos); si no hay fila,
    // se cae al checkout_reference que devolvió SumUp.
    const entry = await this._ledgerBuscar(project_id, { checkout_id: co.id });
    const referencia = entry?.referencia || entry?.pedido_id
      || String(co.checkout_reference || '').split(/[#@]/)[0] || null;
    if (!referencia) return { confirmado: false, motivo: 'sin_referencia' };

    const yaConfirmado = this._confirmados.has(co.id) || !!entry?.transaction_id;
    if (yaConfirmado) return { confirmado: false, motivo: 'duplicado', referencia, pedido_id: referencia };

    // ── TOKENIZACIÓN ≠ COBRO ──
    // El checkout de consentimiento (SETUP_RECURRING_PAYMENT) hace un cargo de autorización que
    // SumUp devuelve al instante: aquí NO hay dinero que confirmar. Lo que nace es la tarjeta
    // guardada y su mandato, así que el desenlace es `pago.tokenizado`.
    if (entry?.canal === 'tokenizacion' || String(co.purpose || entry?.purpose || '').toUpperCase() === 'SETUP_RECURRING_PAYMENT') {
      const token = co.payment_instrument?.token || entry?.payment_instrument_token || null;
      const customer_id = co.customer_id || entry?.customer_id || referencia;
      if (token) {
        await this._registroTarjeta(project_id, {
          customer_id,
          tarjeta: { token, activa: true, cobrable_sin_cliente: true, mandato: { tipo: 'recurrent', estado: 'active' } }
        });
      }
      await this.eventBus.publish('pago.tokenizado', {
        referencia, pedido_id: referencia, project_id, project_slug,
        customer_id, payment_instrument_token: token,
        session_id: co.id, autorizacion_devuelta: true,
        pasarela: 'sumup-checkout', origen,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      this._marcarConfirmado(co.id);
      await this._ledgerMark(project_id, co.id, {
        estado: token ? 'tokenizado' : 'sin_tarjeta',
        customer_id, ...(token ? { payment_instrument_token: token } : {}),
        tokenizado_at: new Date().toISOString()
      });
      this.metrics?.increment?.('pago.tokenizado.total');
      this.logger?.info('pago-gateway.tokenizado', { customer_id, session_id: co.id, tiene_token: !!token });
      return { confirmado: false, tokenizado: !!token, referencia };
    }

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
        referencia,
        pedido_id: referencia,                            // alias heredado
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
      this.logger?.warn('pago-gateway.importe_discrepante', { referencia, session_id: co.id, ...discrepancia });
      return { confirmado: false, motivo: 'importe_discrepante', referencia, pedido_id: referencia, discrepancia };
    }

    const payload = {
      referencia,                                        // nombre del CONTRATO (hecho cobrado)
      pedido_id: referencia,                             // alias: los consumidores de siempre siguen leyendo esto
      project_id: project_id || this.pasarela.project_id || null,
      project_slug,                                    // el consumidor necesita SABER A QUIEN avisar
      session_id: co.id,
      canal: entry?.canal || 'online',                   // online (link/QR) · terminal (datáfono) · guardada
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
    this.metrics?.increment?.('pago.confirmado.total', { pasarela: 'sumup-checkout', canal: payload.canal });
    this.logger?.info('pago-gateway.confirmado', { referencia, session_id: co.id, origen, canal: payload.canal });
    return { confirmado: true, referencia, pedido_id: referencia };
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
    const referencia = previo?.referencia || previo?.pedido_id
      || String(co.checkout_reference || '').split(/[#@]/)[0] || null;
    const tx = (co.transactions || [])[0] || null;
    await this.eventBus.publish('pago.rechazado', {
      referencia, pedido_id: referencia, session_id: co.id, project_slug,
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
    return { rechazado: true, referencia, pedido_id: referencia };
  }

  // ── cancelar: matar el link (DELETE). Si ya se pagó, se confirma, no se cancela. ──
  async _cancelar(d) {
    await this._asegurarConfig(d.project_id);
    const kind = this._pasarelaPara(d.project_id).kind;
    if (kind !== 'sumup-checkout' && kind !== 'sumup') {
      return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `cancelar no implementado para '${kind}'` } };
    }
    const cfg = this._sumupCfg(d);
    const referencia = this._ref(d);
    let checkout_id = d.session_id || null;
    let entry = null;
    if (!checkout_id && referencia) {
      entry = await this._ledgerBuscar(d.project_id, { referencia });
      checkout_id = entry?.checkout_id || null;
    } else if (checkout_id) {
      entry = await this._ledgerBuscar(d.project_id, { checkout_id });
    }
    if (!checkout_id) {
      return { status: 404, error: { code: 'NOT_FOUND', message: 'sin session_id ni checkout en el libro para esa referencia' } };
    }
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const r = await this._sumupCall('DELETE', `/v0.1/checkouts/${encodeURIComponent(checkout_id)}`, { api_key: cred.api_key });
    if (r.ok) {
      await this._ledgerMark(d.project_id, checkout_id, { estado: 'cancelado', cancelado_at: new Date().toISOString() });
      await this.eventBus.publish('pago.cancelado', {
        referencia: entry?.referencia || entry?.pedido_id || referencia || null,
        pedido_id: entry?.referencia || entry?.pedido_id || referencia || null,
        session_id: checkout_id,
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
    await this._asegurarConfig(d.project_id);
    const kind = this._pasarelaPara(d.project_id).kind;
    if (kind !== 'sumup-checkout' && kind !== 'sumup') {
      return { status: 501, error: { code: 'NOT_IMPLEMENTED', message: `reembolsar no implementado para '${kind}'` } };
    }
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'sumup-checkout exige pasarela.merchant_code' } };

    const entry = await this._ledgerBuscar(d.project_id, {
      transaction_id: d.transaction_id, checkout_id: d.session_id,
      referencia: this._ref(d), pedido_id: this._ref(d)
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

    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
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
      referencia: entry?.referencia || entry?.pedido_id || this._ref(d),
      pedido_id: entry?.referencia || entry?.pedido_id || this._ref(d),
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
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
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
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
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
        merchant_nombre: merchant.merchant_name || merchant.business_profile?.name || merchant.company?.name || null,
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
      transaction_id: d.transaction_id, checkout_id: d.session_id,
      referencia: this._ref(d), pedido_id: this._ref(d)
    });
    const transaction_id = d.transaction_id || entry?.transaction_id || null;
    if (!transaction_id) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'sin transaction_id: ni en la petición ni en el libro de cobros' } };
    }
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
    if (cred.error) return { status: 500, error: { code: 'PERMISSION_DENIED', message: `credencial '${cfg.provider}': ${cred.error}` } };

    const q = new URLSearchParams({ mid: cfg.merchant });
    if (d.tx_event_id) q.set('tx_event_id', String(d.tx_event_id));
    const r = await this._sumupCall('GET', `/v1.1/receipts/${encodeURIComponent(transaction_id)}?${q.toString()}`, { api_key: cred.api_key });
    if (!r.ok) return this._errorDeSumup(r, 'SumUp recibo');

    const td = r.data?.transaction_data || {};
    const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
    const cent = v => (Number.isFinite(num(v)) ? Math.round(num(v) * 100) : null);
    const recibo = {
      referencia: entry?.referencia || entry?.pedido_id || this._ref(d),
      pedido_id: entry?.referencia || entry?.pedido_id || this._ref(d),
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
      referencia: recibo.referencia, pedido_id: recibo.pedido_id,
      session_id: entry?.checkout_id || d.session_id || null,
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
      cfg: (pid) => this._sumupCfg({ project_id: pid || null }),
      resolveCred: (p, pid) => this._resolveCred(p, pid),
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
    const r = await this._rpc('fs.read.request', { project_id, path: this._conciPath() }, { timeout_ms: FS_TIMEOUT_MS });
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
      project_id, path: this._conciPath(), content: JSON.stringify(estado, null, 2), encoding: 'utf-8', atomic: true
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
    await this._asegurarConfig(id);
    const pendientes = Object.values(libro.checkouts || {})
      .filter(e => e && e.checkout_id && e.estado === 'pendiente' && !this._confirmados.has(e.checkout_id))
      .slice(0, 50);
    if (!pendientes.length) return;

    const cfg = this._sumupCfg({ project_id: id });
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
    if (cred.error) return;
    const ahora = Date.now();

    for (const e of pendientes) {
      // Cobro PRESENCIAL: su verdad vive en el lector, no en /v0.1/checkouts (daría 404).
      if (e.canal === 'terminal' && e.reader_id) {
        const visto = await this._readerConsultar({ project_id: id, project_slug: e.project_slug || slug, reader_id: e.reader_id, checkout_id: e.checkout_id });
        if (visto.status !== 200) continue;
        // Un cobro presencial abandonado se cierra: si el cliente se fue, no queda pendiente eterno.
        if (visto.data.estado_organo === 'pendiente' && e.creado && (ahora - Date.parse(e.creado)) > 30 * 60 * 1000) {
          await this._ledgerMark(id, e.checkout_id, { estado: 'abandonado' });
        }
        continue;
      }
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

  // ══════════════════════════════════════════════════════════════════════════
  //  QR — la MISMA puerta del link, pintada
  //  Un QR no es un método de pago: es la URL del checkout dentro de un dibujo. Por eso no
  //  hay integración nueva ni comisión nueva. Dos modos:
  //    · con importe → crea (o REUSA) el checkout del hecho y pinta su URL  → QR de COBRO
  //    · con url     → pinta la URL que le den (carta, propinas, un link ya emitido)
  //  Dinámico siempre que se cobra: un QR estático impreso obliga al cliente a teclear el
  //  importe, y ahí es donde se paga de menos.
  // ══════════════════════════════════════════════════════════════════════════

  async _qr(d = {}) {
    const formato = String(d.formato || 'png').toLowerCase();     // png (WhatsApp/impresión) | svg | ambos
    const escala = Number.isInteger(d.escala) ? Math.min(Math.max(d.escala, 3), 24) : 8;
    const borde = Number.isInteger(d.borde) ? Math.min(Math.max(d.borde, 0), 10) : 4;

    let url = d.url || null;
    let checkout = null;

    if (!url) {
      const referencia = this._ref(d);
      if (!referencia) {
        return { status: 400, error: { code: 'INVALID_INPUT', message: 'pasa url (para pintar un enlace ya emitido) o referencia + importe_centimos (para cobrar con QR)' } };
      }
      if (!Number.isInteger(d.monto_centimos) || d.monto_centimos <= 0) {
        return { status: 400, error: { code: 'INVALID_INPUT', message: 'monto_centimos (entero > 0) requerido para un QR de cobro' } };
      }
      const r = await this._iniciar({ ...d, referencia, pedido_id: d.pedido_id ?? referencia, canal: 'qr' });
      if (r.status !== 200) {
        // 409 CHECKOUT_YA_PAGADO es información, no fallo del QR: se devuelve tal cual.
        return r;
      }
      url = r.data.checkout_url;
      checkout = { checkout_id: r.data.session_id, expira_at: r.data.expira_at, reutilizado: !!r.data.reutilizado };
    } else {
      try { new URL(String(url)); }
      catch (_) { return { status: 400, error: { code: 'INVALID_INPUT', message: 'url no es una URL válida', field: 'url' } } };
    }

    let q;
    try { q = QR.encode(String(url), { ecl: d.ecl || 'M' }); }
    catch (err) { return { status: 400, error: { code: 'QR_INVALID_INPUT', message: err.message } }; }

    const out = {
      status: 200,
      data: {
        url: String(url),
        ...(checkout || {}),
        qr: {
          version: q.version, modulos: q.size, correccion: q.ecl, texto: String(url)
        }
      }
    };
    if (formato === 'svg' || formato === 'ambos') {
      const svg = QR.toSvg(q, { scale: escala, border: borde });
      out.data.qr.svg = svg;
      out.data.qr.svg_data_uri = QR.dataUriSvg(svg);
    }
    if (formato === 'png' || formato === 'ambos') {
      const png = QR.toPng(q, { scale: escala, border: borde });
      out.data.qr.png_base64 = png.toString('base64');
      out.data.qr.png_data_uri = QR.dataUriPng(png);
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DATÁFONO (Reader/Terminal API) — el cobro en persona
  //  El mismo órgano, otra puerta: el cliente que viene a recoger paga en el mostrador.
  //  La verdad está en el checkout del lector: se reconsulta, nunca se supone.
  // ══════════════════════════════════════════════════════════════════════════

  async _readerListar(d = {}) {
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.listar();
  }

  async _readerParear(d = {}) {
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.parear({ pairing_code: d.pairing_code, name: d.name, metadata: d.metadata });
  }

  async _readerLeer(d = {}) {
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.leer(d.reader_id);
  }

  async _readerRenombrar(d = {}) {
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.renombrar(d.reader_id, { name: d.name, metadata: d.metadata });
  }

  async _readerBorrar(d = {}) {
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.borrar(d.reader_id);
  }

  async _readerEstado(d = {}) {
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.estado(d.reader_id);
  }

  /**
   * Manda el importe al datáfono. IDEMPOTENTE POR REFERENCIA: si ese hecho ya tiene un cobro
   * vivo en ese lector, se DEVUELVE EL MISMO (reconsultado), no se manda otro. Dos checkouts
   * vivos en el mismo datáfono = dos cobros posibles.
   */
  async _readerCobrar(d = {}) {
    const referencia = this._ref(d);
    if (!referencia) return { status: 400, error: { code: 'INVALID_INPUT', message: 'referencia (o su alias pedido_id) requerida' } };
    if (!d.reader_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido (¿qué datáfono?)', field: 'reader_id' } };
    if (!Number.isInteger(d.monto_centimos) || d.monto_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'monto_centimos (entero > 0) requerido' } };
    }
    const t = await this._terminal(d);
    if (t.error) return t.error;

    // ¿Ya hay algo para esta referencia?
    let entry = await this._ledgerBuscar(d.project_id, { referencia });
    if (entry?.canal === 'terminal') {
      if (entry.estado === 'confirmado') {
        return { status: 409, error: { code: 'YA_PAGADO', message: 'esa referencia ya está cobrada', referencia, transaction_id: entry.transaction_id || null } };
      }
      if (entry.estado === 'pendiente' && entry.checkout_id && entry.reader_id) {
        const visto = await t.term.consultar(entry.reader_id, entry.checkout_id);
        if (visto.status === 200) {
          const est = visto.data.estado_organo;
          if (est === 'pendiente') {
            return { status: 200, data: { ...visto.data, reutilizado: true, aviso: 'ya había un cobro vivo en ese datáfono: se devuelve el mismo' } };
          }
          if (est === 'confirmado') {
            await this._confirmarTerminal({ ...visto.data, project_id: d.project_id, project_slug: d.project_slug, entry });
            return { status: 409, error: { code: 'YA_PAGADO', message: 'el cobro de esa referencia ya se completó en el datáfono', referencia } };
          }
          // rechazado / cancelado → se permite un intento nuevo con sufijo
        }
      }
    }

    // Un intento nuevo: sufijo en la referencia para no chocar con el anterior.
    const intento = Number.isInteger(entry?.intento) ? entry.intento + 1 : 0;
    const refIntento = intento ? `${referencia.slice(0, REF_MAX - 2)}#${intento}` : referencia;

    const out = await t.term.cobrar(d.reader_id, {
      referencia: refIntento,
      importe_centimos: d.monto_centimos,
      descripcion: d.concepto || d.descripcion || null,
      moneda: d.moneda || t.cfg.moneda,
      return_url: d.return_url || t.cfg.webhookUrl || null,
      propina_centimos: Number.isInteger(d.propina_centimos) ? d.propina_centimos : null,
      tip_rates: Array.isArray(d.tip_rates) ? d.tip_rates : null,
      tip_timeout: d.tip_timeout,
      card_type: d.card_type,
      installments: d.installments
    });
    if (out.status !== 200) return out;

    await this._ledgerPut(d.project_id, {
      checkout_id: out.data.checkout_id || out.data.client_transaction_id,
      referencia,
      pedido_id: referencia,
      canal: 'terminal',
      reader_id: d.reader_id,
      project_slug: d.project_slug || null,
      monto_centimos: d.monto_centimos,
      propina_centimos: Number.isInteger(d.propina_centimos) ? d.propina_centimos : null,
      moneda: out.data.moneda || t.cfg.moneda,
      estado: 'pendiente',
      intento,
      creado: new Date().toISOString(),
      reembolsos: []
    });
    await this.eventBus.publish('pago.en_terminal', {
      referencia, pedido_id: referencia, project_id: d.project_id || null, project_slug: d.project_slug || null,
      reader_id: d.reader_id, session_id: out.data.checkout_id, monto_centimos: d.monto_centimos,
      pasarela: 'sumup-terminal', correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    this.metrics?.increment?.('pago.terminal.iniciado');
    return { status: 200, data: { ...out.data, referencia, intento, aviso: 'cobro enviado al datáfono: el cliente completa en el dispositivo' } };
  }

  /**
   * LA verdad del cobro presencial: se pregunta al lector y se traduce a los eventos del órgano.
   * Es lo que usan el caller (polling), el barrido y el webhook.
   */
  async _readerConsultar(d = {}) {
    const reader_id = d.reader_id || null;
    const checkout_id = d.checkout_id || d.session_id || null;
    if (!reader_id || !checkout_id) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id y checkout_id requeridos' } };
    }
    const t = await this._terminal(d);
    if (t.error) return t.error;
    const r = await t.term.consultar(reader_id, checkout_id);
    if (r.status !== 200) return r;

    const entry = await this._ledgerBuscar(d.project_id, { checkout_id });
    const datos = { ...r.data, referencia: entry?.referencia || null, pedido_id: entry?.referencia || null };

    if (r.data.estado_organo === 'confirmado') {
      await this._confirmarTerminal({ ...datos, project_id: d.project_id, project_slug: d.project_slug, entry });
    } else if (r.data.estado_organo === 'rechazado') {
      await this._rechazarTerminal({ ...datos, project_id: d.project_id, project_slug: d.project_slug, entry });
    } else if (r.data.estado_organo === 'cancelado') {
      await this._cancelarTerminal({ ...datos, project_id: d.project_id, project_slug: d.project_slug, entry });
    }
    return { status: 200, data: datos };
  }

  async _readerTerminar(d = {}) {
    const reader_id = d.reader_id || null;
    let reader = reader_id;
    if (!reader && (d.checkout_id || d.session_id)) {
      const entry = await this._ledgerBuscar(d.project_id, { checkout_id: d.checkout_id || d.session_id });
      reader = entry?.reader_id || null;
    }
    if (!reader) return { status: 400, error: { code: 'INVALID_INPUT', message: 'reader_id requerido (o el checkout_id de un cobro en datáfono)' } };
    const t = await this._terminal(d);
    if (t.error) return t.error;
    return t.term.terminar(reader);
  }

  async _readerCobrarGo(d = {}) {
    const referencia = this._ref(d);
    if (!referencia) return { status: 400, error: { code: 'INVALID_INPUT', message: 'referencia requerida' } };
    const t = await this._terminal(d);
    if (t.error) return t.error;
    const out = await t.term.cobrarGo(d.reader_id, {
      referencia, importe_centimos: d.monto_centimos,
      propina_centimos: Number.isInteger(d.propina_centimos) ? d.propina_centimos : null,
      moneda: d.moneda || t.cfg.moneda
    });
    if (out.status !== 200) return out;
    if (out.data.estado_organo === 'confirmado') {
      await this._confirmarTerminal({
        project_id: d.project_id, project_slug: d.project_slug, reader_id: d.reader_id,
        checkout_id: out.data.client_transaction_id, referencia,
        importe_centimos: d.monto_centimos, moneda: out.data.moneda,
        transaction_id: out.data.transaction_id, entry: null
      });
    }
    return out;
  }

  // ── transiciones del cobro PRESENCIAL (un solo camino, como el online) ──
  async _confirmarTerminal({ project_id = null, project_slug = null, entry = null, reader_id = null,
    checkout_id = null, referencia = null, importe_centimos = null, moneda = null,
    transaction_id = null, origen = 'consulta' } = {}) {
    const ref = referencia || entry?.referencia || entry?.pedido_id || null;
    const id = checkout_id || entry?.checkout_id || null;
    if (!ref || !id) return { confirmado: false, motivo: 'sin_referencia' };
    if (this._confirmados.has(id)) return { confirmado: false, motivo: 'duplicado', referencia: ref };

    const fila = entry || await this._ledgerBuscar(project_id, { checkout_id: id });
    const cobrado = Number.isInteger(importe_centimos) ? importe_centimos : (fila?.monto_centimos ?? null);
    // Misma guarda de integridad que el pago online: lo cobrado tiene que ser lo pedido.
    const discrepancia = this._cuadraCobro({ entry: fila, co: { currency: moneda }, montoCentimos: cobrado, propinaCentimos: fila?.propina_centimos ?? null });
    if (discrepancia) {
      await this.eventBus.publish('pago.importe_discrepante', {
        referencia: ref, pedido_id: ref, project_id, project_slug,
        session_id: id, canal: 'terminal', reader_id,
        esperado_centimos: discrepancia.esperado, cobrado_centimos: discrepancia.cobrado,
        motivo: discrepancia.motivo, pasarela: 'sumup-terminal', origen,
        correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
      await this._ledgerMark(project_id, id, { estado: 'discrepante', discrepancia: discrepancia.motivo });
      return { confirmado: false, motivo: 'importe_discrepante', referencia: ref };
    }

    await this.eventBus.publish('pago.confirmado', {
      referencia: ref, pedido_id: ref, project_id, project_slug,
      session_id: id, canal: 'terminal', reader_id,
      transaction_id: transaction_id || null,
      entry_mode: 'TERMINAL',
      monto_centimos: cobrado,
      moneda: moneda || fila?.moneda || null,
      pasarela: 'sumup-terminal', origen,
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    this._marcarConfirmado(id);
    await this._ledgerMark(project_id, id, {
      estado: 'confirmado', transaction_id: transaction_id || null,
      confirmado_at: new Date().toISOString(), origen
    });
    this.metrics?.increment?.('pago.confirmado.total', { pasarela: 'sumup-terminal', canal: 'terminal' });
    this.logger?.info('pago-gateway.confirmado_terminal', { referencia: ref, session_id: id, origen });
    return { confirmado: true, referencia: ref };
  }

  async _rechazarTerminal({ project_id = null, project_slug = null, entry = null, checkout_id = null,
    referencia = null, motivo = null, origen = 'consulta' } = {}) {
    const ref = referencia || entry?.referencia || entry?.pedido_id || null;
    const id = checkout_id || entry?.checkout_id || null;
    if (!id || this._rechazados.has(id) || this._confirmados.has(id)) return { rechazado: false };
    await this.eventBus.publish('pago.rechazado', {
      referencia: ref, pedido_id: ref, project_id, project_slug,
      session_id: id, canal: 'terminal', motivo: motivo || 'FAILED',
      pasarela: 'sumup-terminal', origen,
      correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    await this._ledgerMark(project_id, id, { estado: 'rechazado', rechazado_at: new Date().toISOString() });
    this._rechazados.add(id);
    if (this._rechazados.size > 500) this._rechazados.delete(this._rechazados.values().next().value);
    return { rechazado: true, referencia: ref };
  }

  async _cancelarTerminal({ project_id = null, project_slug = null, entry = null, checkout_id = null, referencia = null } = {}) {
    const ref = referencia || entry?.referencia || entry?.pedido_id || null;
    const id = checkout_id || entry?.checkout_id || null;
    if (!id) return { cancelado: false };
    if (this._confirmados.has(id)) return { cancelado: false, motivo: 'ya_confirmado' };
    await this._ledgerMark(project_id, id, { estado: 'cancelado', cancelado_at: new Date().toISOString() });
    await this.eventBus.publish('pago.cancelado', {
      referencia: ref, pedido_id: ref, project_id, project_slug, session_id: id, canal: 'terminal',
      pasarela: 'sumup-terminal', correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
    });
    return { cancelado: true, referencia: ref };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CLIENTE DE SIEMPRE + TARJETA GUARDADA (Customers API)
  //  Genérico: el cliente es del NEGOCIO, no de la pizzería. Un taller cobra plazos con la
  //  misma tarjeta guardada; una panadería, la semana. El registro vive en /pago/clientes.json.
  // ══════════════════════════════════════════════════════════════════════════

  async _clienteAlta(d = {}) {
    const c = await this._clientesDe(d);
    if (c.error) return c.error;
    const id = d.customer_id || this._ref(d);
    const r = await c.cli.alta({ customer_id: id, personal_details: d.personal_details || null });
    if (r.status === 200) await this._registroTarjeta(d.project_id, { customer_id: r.data.customer_id, alias: d.alias || null, alta: true });
    return r;
  }

  async _clienteLeer(d = {}) {
    const c = await this._clientesDe(d);
    if (c.error) return c.error;
    return c.cli.leer(d.customer_id || this._ref(d));
  }

  async _clienteActualizar(d = {}) {
    const c = await this._clientesDe(d);
    if (c.error) return c.error;
    return c.cli.actualizar(d.customer_id || this._ref(d), { personal_details: d.personal_details });
  }

  async _clienteTarjetas(d = {}) {
    const c = await this._clientesDe(d);
    if (c.error) return c.error;
    const r = await c.cli.tarjetas(d.customer_id || this._ref(d));
    if (r.status === 200) {
      for (const t of r.data.tarjetas) {
        await this._registroTarjeta(d.project_id, { customer_id: r.data.customer_id, tarjeta: t });
      }
    }
    return r;
  }

  async _clienteBajaTarjeta(d = {}) {
    const c = await this._clientesDe(d);
    if (c.error) return c.error;
    const r = await c.cli.bajaTarjeta(d.customer_id || this._ref(d), d.token);
    if (r.status === 200) {
      await this._registroTarjeta(d.project_id, {
        customer_id: d.customer_id || this._ref(d),
        tarjeta: { token: d.token, activa: false, cobrable_sin_cliente: false }
      });
    }
    return r;
  }

  /**
   * CONSENTIMIENTO para guardar la tarjeta (no es un cobro: la autorización se devuelve al
   * instante). Crea el checkout `SETUP_RECURRING_PAYMENT` del cliente y devuelve la URL de la
   * página que el PROPIO órgano sirve con el Payment Widget — así ningún proyecto escribe frontend.
   */
  async _tokenizar(d = {}) {
    const customer_id = d.customer_id || this._ref(d);
    if (!customer_id) return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id requerido (el pagador al que se le guarda la tarjeta)', field: 'customer_id' } };
    const cfg = this._sumupCfg(d);
    if (!cfg.merchant) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'falta pasarela.merchant_code' } };
    if (!cfg.webhookUrl) return { status: 500, error: { code: 'CONFIG_MISSING', message: 'falta pasarela.webhook_url: sin aviso de SumUp no se sabe si el cliente consintió' } };

    const c = await this._clientesDe(d);
    if (c.error) return c.error;

    // Alta idempotente: el cliente tiene que existir para poder ligarle la tarjeta.
    const alta = await c.cli.alta({ customer_id, personal_details: d.personal_details || null });
    if (alta.status !== 200) return alta;

    const importe = Number.isInteger(d.monto_centimos) && d.monto_centimos > 0 ? d.monto_centimos : cfg.minCentimos;
    const r = await this._sumupCheckout({
      ...d, referencia: `tok-${customer_id}`.slice(0, REF_MAX), monto_centimos: importe,
      concepto: d.concepto || 'Alta de tarjeta para pagos futuros',
      purpose: 'SETUP_RECURRING_PAYMENT', customer_id
    });
    if (r.status !== 200) return r;

    const coid = r.data.session_id;
    // La página del widget la sirve ESTE módulo: el proyecto no escribe ni una línea.
    const base = (() => { try { return new URL(cfg.webhookUrl).origin; } catch (_) { return ''; } })();
    const slug = d.project_slug || this._pasarelaPara(d.project_id).project_slug || null;
    const t = cfg.webhookToken ? `?t=${encodeURIComponent(cfg.webhookToken)}` : '';
    const widget_url = slug ? `${base}/modules/pago-gateway/pago/widget/${encodeURIComponent(slug)}/${encodeURIComponent(coid)}${t}` : null;

    await this._ledgerPut(d.project_id, {
      checkout_id: coid,
      checkout_reference: `tok-${customer_id}`.slice(0, REF_MAX),
      referencia: String(customer_id),
      pedido_id: String(customer_id),
      canal: 'tokenizacion',
      project_slug: slug,
      customer_id,
      monto_centimos: importe,
      moneda: cfg.moneda,
      estado: 'pendiente',
      purpose: 'SETUP_RECURRING_PAYMENT',
      creado: new Date().toISOString(),
      reembolsos: []
    });

    return {
      status: 200,
      data: {
        customer_id,
        checkout_id: coid,
        widget_url,
        hosted_checkout_url: r.data.checkout_url,
        expira_at: r.data.expira_at,
        importe_autorizacion_centimos: importe,
        aviso: 'la autorización se devuelve al instante; lo que queda es la tarjeta guardada con el consentimiento del cliente'
      }
    };
  }

  /**
   * COBRO con la tarjeta guardada (recurrente / merchant-initiated), servidor-a-servidor.
   * La referencia es la llave: si ese hecho ya está cobrado, NO se cobra otra vez.
   */
  async _cobrarGuardada(d = {}) {
    const referencia = this._ref(d);
    if (!referencia) return { status: 400, error: { code: 'INVALID_INPUT', message: 'referencia requerida' } };
    const customer_id = d.customer_id || null;
    const token = d.token || d.payment_instrument_token || null;
    if (!customer_id || !token) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'customer_id y token requeridos (tarjeta guardada del cliente)' } };
    }
    if (!Number.isInteger(d.monto_centimos) || d.monto_centimos <= 0) {
      return { status: 400, error: { code: 'INVALID_INPUT', message: 'monto_centimos (entero > 0) requerido' } };
    }

    // Idempotencia ANTES de tocar la API: un cobro confirmado no se repite nunca.
    const previo = await this._ledgerBuscar(d.project_id, { referencia });
    if (previo?.canal === 'guardada') {
      if (previo.estado === 'confirmado') {
        return { status: 409, error: { code: 'YA_PAGADO', message: 'esa referencia ya está cobrada con tarjeta guardada', transaction_id: previo.transaction_id || null } };
      }
      if (previo.estado === 'requiere_accion') {
        return { status: 409, error: { code: 'REQUIERE_ACCION', message: 'hay un cobro pendiente de autenticación del banco: no se reintenta (sería un segundo cargo)', url: previo.requiere_accion?.url || null } };
      }
    }

    const c = await this._clientesDe(d);
    if (c.error) return c.error;
    const out = await c.cli.cobrarConToken({
      customer_id, token, referencia, importe_centimos: d.monto_centimos,
      descripcion: d.concepto || d.descripcion || null, moneda: d.moneda || c.cfg.moneda,
      checkout_id: previo?.canal === 'guardada' && previo.estado === 'pendiente' ? previo.checkout_id : null
    });

    if (out.status === 409 && out.error?.code === 'YA_PAGADO') {
      return out;
    }
    if (out.status !== 200) return out;

    const datos = out.data;
    const entry = {
      checkout_id: datos.checkout_id,
      referencia,
      pedido_id: referencia,
      canal: 'guardada',
      customer_id,
      payment_instrument_token: token,
      project_slug: d.project_slug || null,
      monto_centimos: d.monto_centimos,
      moneda: datos.moneda || c.cfg.moneda,
      estado: datos.estado === 'confirmado' ? 'pendiente' : (datos.estado === 'requiere_accion' ? 'requiere_accion' : datos.estado),
      creado: new Date().toISOString(),
      reembolsos: []
    };
    if (datos.requiere_accion) entry.requiere_accion = datos.requiere_accion;
    await this._ledgerPut(d.project_id, entry);

    if (datos.estado === 'confirmado') {
      // Se relee el checkout: la confirmación pasa SIEMPRE por el mismo camino (integridad incluida).
      const t = await this._cuentaParaCobro(d.project_id);
      if (!t.error) {
        const co = await this._sumupCall('GET', `/v0.1/checkouts/${encodeURIComponent(datos.checkout_id)}`, { api_key: t.api_key });
        if (co.ok) await this._confirmarSumup(co.data, { project_id: d.project_id, project_slug: d.project_slug, origen: 'guardada' });
      }
    } else if (datos.estado === 'rechazado') {
      await this._rechazarSumup({ id: datos.checkout_id, checkout_reference: referencia, status: 'FAILED', amount: Number((d.monto_centimos / 100).toFixed(2)), currency: datos.moneda, transactions: [] },
        { project_id: d.project_id, project_slug: d.project_slug, origen: 'guardada' });
    }
    return out;
  }

  // ui_handlers
  async handlePagoIniciar(data) { return this._iniciar(data || {}); }
  async handlePagoCancelar(data) { return this._cancelar(data || {}); }
  async handlePagoReembolsar(data) { return this._sumupReembolsar(data || {}); }
  async handlePagoMetodos(data) { return this._sumupMetodos(data || {}); }
  async handlePagoEstado(data) { return this._sumupEstado(data || {}); }
  async handlePagoRecibo(data) { return this._sumupRecibo(data || {}); }
  async handlePagoConciliar(data) { return this._conciliar(data || {}); }
  // Config de la pasarela DEL PROYECTO (lo que enciende el botón sin tocar código).
  async handlePagoConfigLeer(data) { return this._configLeer(data || {}); }
  async handlePagoConfigEscribir(data) { return this._configEscribir(data || {}); }
  // QR, datáfono, clientes, tarjeta guardada y recurrencia (mismos puertos para todo proyecto).
  async handlePagoQr(data) { return this._qr(data || {}); }
  async handlePagoReaderListar(data) { return this._readerListar(data || {}); }
  async handlePagoReaderParear(data) { return this._readerParear(data || {}); }
  async handlePagoReaderEstado(data) { return this._readerEstado(data || {}); }
  async handlePagoReaderCobrar(data) { return this._readerCobrar(data || {}); }
  async handlePagoReaderConsultar(data) { return this._readerConsultar(data || {}); }
  async handlePagoReaderTerminar(data) { return this._readerTerminar(data || {}); }
  async handlePagoReaderCobrarGo(data) { return this._readerCobrarGo(data || {}); }
  async handlePagoClienteAlta(data) { return this._clienteAlta(data || {}); }
  async handlePagoClienteTarjetas(data) { return this._clienteTarjetas(data || {}); }
  async handlePagoClienteBajaTarjeta(data) { return this._clienteBajaTarjeta(data || {}); }
  async handlePagoTokenizar(data) { return this._tokenizar(data || {}); }
  async handlePagoCobrarGuardada(data) { return this._cobrarGuardada(data || {}); }

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
    const proyectoStripe = req?.params?.project ? await this._proyectoPorSlug(req.params.project) : null;
    const secret = this._pasarelaPara(proyectoStripe?.id)?.webhook_secret || null;
    try {
      if (secret) {
        const ok = this._verifyStripeSig(raw, sig, secret);
        if (!ok) { this.logger?.warn('pago-gateway.webhook.firma_invalida', {}); return this._respond(res, 400, { error: 'firma inválida' }); }
      }
      if (evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') {
        const s = evt.data?.object || {};
        const referencia = s.metadata?.referencia || s.metadata?.pedido_id || null;
        const pagado = s.payment_status === 'paid' || s.status === 'complete';
        if (referencia && pagado) {
          const meta = s.metadata || {};
          const contexto = {};
          for (const k of ['project_slug', 'cliente_nombre', 'cliente_telefono', 'canal_origen']) {
            if (meta[k] !== undefined && meta[k] !== '') contexto[k] = meta[k];
          }
          await this.eventBus.publish('pago.confirmado', {
            referencia, pedido_id: referencia, project_id: meta.project_id || null,
            session_id: s.id, pasarela: 'stripe-checkout', monto_centimos: s.amount_total || null,
            ...contexto,
            correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
          });
          this.metrics?.increment?.('pago.confirmado.total');
          this.logger?.info('pago-gateway.confirmado', { referencia, session_id: s.id });
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
    // El proyecto sale del path del webhook: su config y su credencial son SUYAS.
    const proyecto = req?.params?.project ? await this._proyectoPorSlug(req.params.project) : null;
    const project_id = proyecto?.id || this.pasarela.project_id || null;
    await this._asegurarConfig(project_id);
    // Token opcional en la URL: cualquiera puede POSTear el endpoint (SumUp no firma); el token
    // evita que un tercero nos queme la cuota de API con eventos inventados.
    const esperado = this._pasarelaPara(project_id).webhook_token || null;
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
    const familiaReader = /^readers?[._]/i.test(tipo) || /reader/i.test(tipo);
    if (!/^checkouts?[._]/i.test(tipo) && tipo !== 'CHECKOUT_STATUS_CHANGED' && !familiaReader) {
      // Doc: "New events may be introduced at any time... silently ignore unknown events."
      this.logger?.info('pago-gateway.sumup.evento_ignorado', { event_type: evt.event_type });
      return this._respond(res, 200, { received: true, ignorado: evt.event_type });
    }
    // El id puede venir en la raíz (formato documentado) o dentro del objeto del evento.
    const checkout_id = evt.id || evt.checkout_id || evt.data?.id || evt.data?.checkout_id
      || evt.checkout?.id || evt.object?.id || null;
    if (!checkout_id) return this._respond(res, 400, { error: 'evento sin id' });

    // EVENTO DE DATÁFONO: solo interesa si ese checkout lo abrimos NOSOTROS. Si no está en el
    // libro, se ignora con 200 y sin gastar una llamada — la doc pide ignorar en silencio lo
    // que no se reconoce, y un reader que no es nuestro no se puede verificar con nuestra clave.
    if (familiaReader) {
      const terminal = await this._webhookTerminal(project_id, req?.params?.project, checkout_id);
      if (terminal) return this._respond(res, 200, { received: true, ...terminal });
      this.logger?.info('pago-gateway.sumup.evento_reader_ajeno', { event_type: evt.event_type, checkout_id });
      return this._respond(res, 200, { received: true, ignorado: evt.event_type });
    }

    const cfg = this._sumupCfg({ project_id });
    const cred = await this._resolveCred(cfg.provider, cfg.project_id);
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
      // La sesión ya no existe como checkout ONLINE. Pero puede ser un cobro PRESENCIAL: el
      // checkout del lector vive en otra familia de endpoints. Si está en el libro como
      // terminal, se reconsulta en el datáfono antes de dar el aviso por perdido.
      const terminal = await this._webhookTerminal(project_id, req?.params?.project, checkout_id);
      if (terminal) return this._respond(res, 200, { received: true, ...terminal });
      // No hay nada que confirmar y reintentar no lo arregla.
      return this._respond(res, 200, { received: true, ignorado: 'checkout_not_found' });
    }
    if (!r.ok) {
      this.logger?.warn('pago-gateway.sumup.webhook.http_error', { checkout_id, status: r.status });
      return this._respond(res, 503, { error: `SumUp ${r.status} al verificar` });
    }

    const co = r.data;
    const project_slug = req?.params?.project || this.pasarela.project_slug || null;

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

  // ── PÁGINA DEL WIDGET (tokenización) ──
  //   El consentimiento para guardar la tarjeta se recoge con el Payment Widget de SumUp, que
  //   exige una página con su SDK. Esa página la sirve ESTE módulo, genérica para cualquier
  //   proyecto: el negocio no escribe frontend ni toca su web. Los datos de la tarjeta van del
  //   navegador a SumUp directamente — nunca pasan por aquí.
  async handleWidget(req, res) {
    const proyecto = req?.params?.project ? await this._proyectoPorSlug(req.params.project) : null;
    const project_id = proyecto?.id || this.pasarela.project_id || null;
    await this._asegurarConfig(project_id);
    const p = this._pasarelaPara(project_id);
    const esperado = p.webhook_token || null;
    const recibido = req?.query?.t || req?.query?.token || null;
    if (esperado && recibido !== esperado) return this._respond(res, 401, { error: 'token inválido' });

    const checkout_id = req?.params?.checkout_id || null;
    if (!checkout_id) return this._respond(res, 400, { error: 'checkout_id requerido' });

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>Guardar tarjeta</title>'
      + '<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f6f6f6;color:#111}'
      + '.caja{max-width:420px;margin:0 auto;background:#fff;border-radius:14px;padding:20px;box-shadow:0 2px 10px rgba(0,0,0,.08)}'
      + 'h1{font-size:18px;margin:0 0 6px}p{font-size:14px;line-height:1.4;color:#444;margin:0 0 14px}'
      + '#estado{font-size:14px;margin-top:14px}</style></head><body><div class="caja">'
      + '<h1>Guardar tarjeta para pagos futuros</h1>'
      + '<p>No se te cobra nada ahora: SumUp hace una autorización y la devuelve al instante. '
      + 'Solo se guarda la tarjeta con tu permiso.</p>'
      + '<div id="sumup-card"></div><div id="estado"></div></div>'
      + '<script src="https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js"></script>'
      + '<script>'
      + 'var estado=document.getElementById("estado");'
      + 'SumUpCard.mount({id:"sumup-card",checkoutId:' + JSON.stringify(String(checkout_id)) + ',onResponse:function(tipo,cuerpo){'
      + 'if(tipo==="success"){estado.textContent="Tarjeta guardada. Ya puedes cerrar esta página.";}'
      + 'else if(tipo==="error"){estado.textContent="No se pudo guardar la tarjeta: "+((cuerpo&&(cuerpo.message||cuerpo.error_message))||tipo);}'
      + '}});'
      + '</script></body></html>';
    try {
      if (res && typeof res.writeHead === 'function') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
      }
    } catch (_) {}
    return { status: 200, html: true, checkout_id };
  }

  // Un evento que no es de un checkout online: ¿es un cobro en datáfono? Solo si el libro lo
  // conoce como terminal; entonces la verdad se pide al lector.
  async _webhookTerminal(project_id, project_slug, checkout_id) {
    if (!project_id || !checkout_id) return null;
    const entry = await this._ledgerBuscar(project_id, { checkout_id });
    if (!entry || entry.canal !== 'terminal' || !entry.reader_id) return null;
    const r = await this._readerConsultar({ project_id, project_slug, reader_id: entry.reader_id, checkout_id });
    if (r.status !== 200) return { terminal: true, estado: 'sin_verificar' };
    return { terminal: true, estado: r.data.estado_organo };
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
