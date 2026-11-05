'use strict';

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');

/**
 * aviso-pedido-listo
 *
 * Cierra el circulo del canal de pedidos: el cliente pide por WhatsApp (puente QR),
 * el pedido entra al POS y a cocina, la cocina lo termina... y hasta hoy nadie se lo
 * decia al cliente. Cocina emite `cocina.pedido_listo` cuando TODOS los items estan
 * listos (cocina/index.js: `items.every(i => i.estado === 'listo')`), asi que ese es
 * el instante exacto en que el pedido se puede recoger.
 *
 * Que hace: lee la cuenta operativa (donde vive el cliente del canal), compone el
 * aviso y lo manda por el MISMO puente que trajo el pedido (`POST /send` del puente QR).
 *
 * Que NO hace, a proposito:
 *  - No avisa pedidos de MESA: ahi el que sirve es el camarero, no el cliente.
 *  - No avisa pedidos del POS interno sin canal: no hay cliente al que escribir.
 *  - No inventa el destino: si la cuenta no trae JID ni telefono, lo dice en el log
 *    y cuenta la metrica. Un aviso al numero equivocado es peor que ningun aviso.
 *  - No reintenta para siempre: 3 intentos cortos y se rinde con rastro.
 *
 * Config (por proyecto, en config/config.json):
 *   "whatsapp_qr": { "url": "http://127.0.0.1:8235/send", "slug": "the-pirate", "activo": true }
 * `slug` es la cuenta del PUENTE (no el slug del proyecto: el puente sirve varias
 * cuentas y cada una tiene su sesion de WhatsApp).
 */
class AvisoPedidoListoModule extends BaseModule {
  constructor() {
    super();
    this.name = 'aviso-pedido-listo';
    this.version = require('./module.json').version;

    // cuenta_id -> ISO de cuando se aviso. Un pedido se avisa UNA vez: si cocina
    // republica el evento (o dos pantallas marcan a la vez), el cliente no recibe
    // dos mensajes iguales. Bounded para no fugar memoria en un negocio abierto 12h.
    this.avisados = new Map();
    this.maxAvisados = 500;

    // request_id -> { resolve, timeoutHandle } para correlar project.get.response.
    this._pendingProject = new Map();
    this._unsubscribeProjectGetResponse = null;
    this._projectTimeoutMs = 5000;

    // 3 intentos cortos: el puente puede estar reconectando 2 segundos. Mas que eso
    // ya no es un parpadeo, y el cliente no puede esperar 30 s a un "esta listo".
    this._intentos = 3;
    this._esperaMs = 2000;
    this._timeoutHttpMs = 6000;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.moduleRegistry = core.moduleRegistry;

    this._unsubscribeProjectGetResponse = await this.eventBus.subscribe(
      'project.get.response',
      (event) => this._onProjectGetResponse(event)
    );

    this.logger?.info?.('aviso-pedido-listo.loaded', { version: this.version });
  }

  async onUnload() {
    if (typeof this._unsubscribeProjectGetResponse === 'function') {
      try { this._unsubscribeProjectGetResponse(); } catch (_) { /* ignore */ }
      this._unsubscribeProjectGetResponse = null;
    }
    for (const p of this._pendingProject.values()) clearTimeout(p.timeoutHandle);
    this._pendingProject.clear();
    this.logger?.info?.('aviso-pedido-listo.unloaded', {});
  }

  // ==========================================
  // Bus
  // ==========================================

  async onCocinaPedidoListo(event) {
    const data = (event && event.data) || event || {};
    const project_id = data.project_id;
    const cuenta_id = data.cuenta_id;

    if (!project_id || !cuenta_id) {
      this.logger?.warn?.('aviso-pedido-listo.sin_ids', {
        pedido_id: data.pedido_id || null, project_id: project_id || null, cuenta_id: cuenta_id || null
      });
      return;
    }

    const clave = `${project_id}:${cuenta_id}`;
    if (this.avisados.has(clave)) {
      this._metric('aviso_pedido.descartado.total', { project: project_id, razon: 'duplicado' });
      return;
    }

    const cuenta = await this._leerCuenta(project_id, cuenta_id);
    if (!cuenta) {
      this._metric('aviso_pedido.fallido.total', { project: project_id, razon: 'cuenta_no_encontrada' });
      return;
    }

    // Los datos del canal viven en `cuenta.metadata`: es lo que guarda
    // cuentas.handleCreateCuenta (y a lo que la restauración mapea los ficheros
    // viejos). NO en `datos_especificos`, que es la forma del fichero de
    // persistencia y no existe en la cuenta viva: leer esa forma deja `datos` vacío,
    // todo pedido se descarta como «no es de canal» y el cliente no recibe nada.
    // Medido: la cuenta real de un pedido de WhatsApp es
    //   { tipo: 'llevar', metadata: { origen: 'tienda', cliente_jid, canal_cuenta, ... } }
    const datos = this._datosCuenta(cuenta);
    // Solo pedidos de CANAL. Un pedido de mesa lo sirve el camarero; uno del POS
    // interno no tiene cliente al que escribir. Se descarta sin ruido.
    if (datos.origen !== 'tienda') {
      this._metric('aviso_pedido.descartado.total', { project: project_id, razon: 'no_es_pedido_de_canal' });
      return;
    }
    const modo = datos.modo_consumo || cuenta.tipo || null;
    if (modo === 'mesa') {
      this._metric('aviso_pedido.descartado.total', { project: project_id, razon: 'pedido_de_mesa' });
      return;
    }

    // El destino NO se adivina: la JID que trajo el pedido manda (vale tambien para
    // los remitentes con numero oculto, que WhatsApp identifica por LID). El telefono
    // es el respaldo cuando el canal solo guardo el movil.
    const destino = this._destino(cuenta);
    if (!destino) {
      this.logger?.warn?.('aviso-pedido-listo.sin_contacto', {
        project_id, cuenta_id, ref_display: cuenta.ref_display || null
      });
      this._metric('aviso_pedido.fallido.total', { project: project_id, razon: 'sin_contacto' });
      await this._publicar('aviso_pedido_listo.fallido', {
        project_id, cuenta_id,
        pedido_id: data.pedido_id || null,
        ref_display: this._refCorta(cuenta, data),
        cliente_nombre: datos.cliente_nombre || cuenta.nombre || null,
        motivo: 'sin_contacto'
      }, event);
      return;
    }

    const puente = await this._configPuente(project_id, datos);
    if (!puente.ok) {
      this._metric('aviso_pedido.fallido.total', { project: project_id, razon: puente.motivo });
      await this._publicar('aviso_pedido_listo.fallido', {
        project_id, cuenta_id,
        pedido_id: data.pedido_id || null,
        ref_display: this._refCorta(cuenta, data),
        cliente_nombre: datos.cliente_nombre || cuenta.nombre || null,
        motivo: puente.motivo
      }, event);
      return;
    }
    const cfg = puente.cfg;

    const nombre = datos.cliente_nombre || cuenta.nombre || null;
    const ref = this._refCorta(cuenta, data);
    const texto = this.formatearAviso({ nombre, ref });

    const envio = await this._enviarAlPuente(cfg, destino, texto);
    if (!envio.ok) {
      this.logger?.warn?.('aviso-pedido-listo.envio_fallido', {
        project_id, cuenta_id, ref_display: ref, motivo: envio.motivo
      });
      this._metric('aviso_pedido.fallido.total', { project: project_id, razon: envio.motivo || 'puente_no_responde' });
      await this._publicar('aviso_pedido_listo.fallido', {
        project_id, cuenta_id,
        pedido_id: data.pedido_id || null,
        ref_display: ref,
        cliente_nombre: nombre,
        motivo: envio.motivo || 'puente_no_responde'
      }, event);
      return;
    }

    this._recordar(clave);
    this._metric('aviso_pedido.enviado.total', { project: project_id });
    this.logger?.info?.('aviso-pedido-listo.enviado', {
      project_id, cuenta_id, ref_display: ref,
      message_id: envio.message_id || null,
      destino: this._enmascarar(destino)
    });
    await this._publicar('aviso_pedido_listo.enviado', {
      project_id, cuenta_id,
      pedido_id: data.pedido_id || null,
      ref_display: ref,
      cliente_nombre: nombre,
      message_id: envio.message_id || null,
      enviado_at: new Date().toISOString()
    }, event);
  }

  // ==========================================
  // Mensaje
  // ==========================================

  /**
   * Lo que el cliente necesita para venir a por su pedido: que esta listo, donde
   * (a recoger), COMO se identifica (el codigo de turno que canta la barra) y a
   * nombre de quien esta. Sin codigo ni nombre, el aviso no sirve de nada.
   */
  formatearAviso({ nombre, ref } = {}) {
    const nombreCorto = this._nombrePresentable(nombre);
    const lineas = [];
    lineas.push(nombreCorto ? `¡${nombreCorto}, tu pedido ya está listo! 🍕` : '¡Tu pedido ya está listo! 🍕');
    lineas.push('Puedes pasar a recogerlo cuando quieras.');
    lineas.push('');
    if (ref) lineas.push(`Pedido: ${ref}`);
    if (nombreCorto) lineas.push(`A nombre de: ${nombreCorto}`);
    return lineas.join('\n').trim();
  }

  _nombrePresentable(nombre) {
    const n = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : '';
    if (!n) return null;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  /** El codigo que el cliente da en la barra: "L 395". */
  _refCorta(cuenta, data) {
    const rd = String((cuenta && cuenta.ref_display) || (data && data.ref_display) || '');
    const m = rd.match(/[A-Z]\s\d{3}/);
    if (m) return m[0];
    const simbolos = { mesa: 'M', local: 'M', llevar: 'L', telefono: 'T', whatsapp: 'W', glovo: 'G', delivery: 'D', llevadoo: 'V' };
    if (Number.isInteger(cuenta && cuenta.turno)) {
      return `${simbolos[cuenta.tipo] || 'L'} ${String(cuenta.turno).padStart(3, '0')}`;
    }
    return rd || null;
  }

  // ==========================================
  // Datos: cuenta, contacto, config
  // ==========================================

  async _leerCuenta(project_id, cuenta_id) {
    try {
      const cuentas = this.moduleRegistry?.get('cuentas')?.instance;
      if (!cuentas?.handleGetCuenta) {
        this.logger?.warn?.('aviso-pedido-listo.modulo_cuentas_ausente', { project_id });
        return null;
      }
      const res = await cuentas.handleGetCuenta({ project_id, id: cuenta_id });
      if (!res || res.status !== 200 || !res.data) return null;
      return res.data;
    } catch (err) {
      this.logger?.warn?.('aviso-pedido-listo.leer_cuenta_error', {
        project_id, cuenta_id, error_message: err && err.message ? err.message : String(err)
      });
      return null;
    }
  }

  /** Los datos del canal de una cuenta, venga de la cuenta viva (`metadata`) o de un
   *  fichero restaurado viejo (`datos_especificos`). Una sola puerta: si cada sitio
   *  eligiera su campo, volvería el fallo que dejó al cliente sin aviso. */
  _datosCuenta(cuenta) {
    const m = cuenta && cuenta.metadata;
    if (m && typeof m === 'object' && Object.keys(m).length > 0) return m;
    const d = cuenta && cuenta.datos_especificos;
    return (d && typeof d === 'object') ? d : {};
  }

  _destino(cuenta) {
    const d = this._datosCuenta(cuenta);
    const jid = typeof d.cliente_jid === 'string' ? d.cliente_jid.trim() : '';
    if (jid) return jid;
    const tel = typeof d.cliente_telefono === 'string' ? d.cliente_telefono.trim() : '';
    if (tel) return tel;
    return null;
  }

  /**
   * Por QUE cuenta sale el aviso. No se adivina: el pedido trae la cuenta del puente
   * por la que ENTRÓ (`canal_cuenta`, la misma por la que el cliente recibió su
   * confirmación). Contestar por otra cuenta es hablarle al cliente desde un número
   * que no conoce. Solo si el pedido no lo trae (canal sin puente) se cae a la config
   * del proyecto; y si tampoco, no se manda y se dice.
   */
  async _configPuente(project_id, datos) {
    const cfg = await this._leerConfigProyecto(project_id);
    const qr = (cfg && cfg.whatsapp_qr) || null;
    if (qr && qr.activo === false) return { ok: false, motivo: 'puente_apagado' };

    const slug = (qr && qr.slug) || (datos && datos.canal_cuenta) || null;
    if (!slug) {
      this.logger?.warn?.('aviso-pedido-listo.sin_cuenta_puente', { project_id });
      return { ok: false, motivo: 'sin_cuenta_puente' };
    }
    const url = (qr && qr.url) || process.env.WA_PUENTE_URL
      || `http://127.0.0.1:${process.env.WA_PUENTE_PORT || 8235}/send`;
    return { ok: true, cfg: { url: String(url), slug: String(slug) } };
  }

  /** config/config.json del proyecto, o null si no se puede leer (no es un fallo grave). */
  async _leerConfigProyecto(project_id) {
    let project = null;
    try {
      project = await this._resolverProyecto(project_id);
    } catch (err) {
      this.logger?.warn?.('aviso-pedido-listo.proyecto_no_resuelto', {
        project_id, error_message: err && err.message ? err.message : String(err)
      });
      return null;
    }
    if (!project || !project.base_path) {
      // Sin base_path no hay config que leer, pero el pedido ya trae su cuenta del
      // puente: el aviso sale igual. No es un fallo, es un proyecto sin config.
      this.logger?.debug?.('aviso-pedido-listo.sin_config_proyecto', { project_id });
      return null;
    }
    try {
      const raw = await fs.readFile(path.join(project.base_path, 'config', 'config.json'), 'utf8');
      return JSON.parse(raw);
    } catch (_err) {
      return null;   // proyecto sin config: valen los defaults del puente
    }
  }

  _resolverProyecto(project_id) {
    return new Promise((resolve, reject) => {
      const request_id = crypto.randomUUID();
      const timeoutHandle = setTimeout(() => {
        this._pendingProject.delete(request_id);
        reject(new Error(`project.get.request timeout (${this._projectTimeoutMs}ms)`));
      }, this._projectTimeoutMs);
      this._pendingProject.set(request_id, { resolve, timeoutHandle });
      Promise.resolve(this.eventBus.publish('project.get.request', { request_id, project_id }))
        .catch((err) => {
          this._pendingProject.delete(request_id);
          clearTimeout(timeoutHandle);
          reject(err);
        });
    });
  }

  _onProjectGetResponse(event) {
    const data = (event && event.data) || event || {};
    const request_id = data.request_id;
    if (!request_id) return;
    const pending = this._pendingProject.get(request_id);
    if (!pending) return;
    this._pendingProject.delete(request_id);
    clearTimeout(pending.timeoutHandle);
    pending.resolve(data.success && data.project ? data.project : null);
  }

  // ==========================================
  // Transporte: POST /send del puente QR
  // ==========================================

  async _enviarAlPuente(cfg, to, text) {
    let ultimo = { ok: false, motivo: 'puente_no_responde' };
    for (let intento = 1; intento <= this._intentos; intento++) {
      ultimo = await this._postUnaVez(cfg, to, text);
      if (ultimo.ok) return ultimo;
      // Un rechazo de negocio (slug desconocido, faltan campos) no mejora reintentando.
      if (ultimo.motivo === 'puente_rechaza' && ultimo.reintentable === false) return ultimo;
      if (intento < this._intentos) await this._dormir(this._esperaMs * intento);
    }
    return ultimo;
  }

  async _postUnaVez(cfg, to, text) {
    let res;
    let cuerpo;
    try {
      res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: cfg.slug, to, text }),
        signal: AbortSignal.timeout(this._timeoutHttpMs)
      });
      cuerpo = await res.json().catch(() => null);
    } catch (err) {
      return { ok: false, motivo: 'puente_no_responde', detalle: err && err.message ? err.message : String(err) };
    }

    if (cuerpo && cuerpo.ok === true) {
      return { ok: true, message_id: cuerpo.id || null };
    }

    const error = String((cuerpo && cuerpo.error) || `HTTP ${res.status}`);
    // "sesion no conectada" es transitorio (el puente esta reconectando): merece reintento.
    const transitorio = /no conectada|timeout|reconnect/i.test(error);
    return {
      ok: false,
      motivo: transitorio ? 'puente_no_responde' : 'puente_rechaza',
      reintentable: transitorio,
      detalle: error
    };
  }

  // ==========================================
  // Helpers
  // ==========================================

  _recordar(clave) {
    if (this.avisados.has(clave)) this.avisados.delete(clave);
    this.avisados.set(clave, new Date().toISOString());
    while (this.avisados.size > this.maxAvisados) {
      this.avisados.delete(this.avisados.keys().next().value);
    }
  }

  async _publicar(evento, payload, sourceEvent) {
    try {
      await this.eventBus.publish(evento, {
        ...payload,
        correlation_id: (sourceEvent && sourceEvent.metadata && sourceEvent.metadata.correlation_id) || crypto.randomUUID()
      });
    } catch (err) {
      this.logger?.warn?.('aviso-pedido-listo.publish_error', {
        evento, error_message: err && err.message ? err.message : String(err)
      });
    }
  }

  _metric(nombre, labels) {
    if (this.metrics && typeof this.metrics.increment === 'function') {
      try { this.metrics.increment(nombre, labels); } catch (_) { /* ignore */ }
    }
  }

  _enmascarar(destino) {
    const s = String(destino || '');
    const arroba = s.indexOf('@');
    const usuario = arroba >= 0 ? s.slice(0, arroba) : s;
    if (usuario.length <= 4) return `***${arroba >= 0 ? s.slice(arroba) : ''}`;
    return `***${usuario.slice(-4)}${arroba >= 0 ? s.slice(arroba) : ''}`;
  }

  _dormir(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = AvisoPedidoListoModule;
