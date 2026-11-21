'use strict';

/**
 * portero-whatsapp — EL ACOPLE, no otro bot.
 *
 * El puente de WhatsApp ya hace el trabajo de bot: sesiones, reconexión, deduplicación,
 * recepción y envío. Este módulo NO lo rehace. Solo une dos piezas que ya existen:
 *
 *   whatsapp.mensaje.recibido (hecho del puente)
 *        → portero (la inteligencia del comercio: carta, precios, alérgenos, estado)
 *        → POST /send del puente (la respuesta)
 *
 * Por qué existe: el mensaje entraba al bus y no había nadie que contestara. El portero
 * ya responde, pero el canal no le pasaba el mensaje.
 *
 * Reglas:
 *   · Nace APAGADO: sin `activado: true` para el proyecto, no hace nada.
 *   · No contesta a grupos, ni a ecos propios, ni a mensajes vacíos.
 *   · Idempotente por `message_id` (el puente puede repetir el mismo mensaje).
 *   · NO contesta a un SÍ/NO corto: eso es la respuesta a `confirmacion-pedido`, y dos
 *     contestaciones al mismo mensaje es peor que ninguna.
 *   · Identidad: resuelve la cuenta por el teléfono del jid y se la pasa al portero, para
 *     que no pregunte un nombre que el cliente ya dio al pedir.
 *   · Si el portero no responde, publica `portero.whatsapp.fallido` y no inventa nada.
 */

const fs = require('fs').promises;
const BaseModule = require('../../_shared/base-module');

const VISTOS_MAX = 500;
const PUENTE_DEFECTO = 'http://127.0.0.1:8235/send';
const PORTERO_DEFECTO = 'http://127.0.0.1:3000/modules/portero/chat';

// Un SÍ/NO suelto pertenece a confirmacion-pedido. Un párrafo que empiece por "sí" no.
const SI_NO = new Set(['si', 'sii', 'siii', 'ok', 'okei', 'okey', 'vale', 'confirmo',
  'confirmado', 'correcto', 'no', 'nop', 'nope', 'cancela', 'cancelalo', 'anula',
  'anulalo', 'dejalo', 'olvidalo']);

class PorteroWhatsapp extends BaseModule {
  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.mqttRequest = core.mqttRequest;
    this.moduleRegistry = core.moduleRegistry;
    // La config del módulo vive en `config.json → modules_config['portero-whatsapp']`.
    this.config = core.config?.modules_config?.[this.name] || {};
    this._vistos = new Set();
    this._orden = [];
    this._configCache = new Map();
    this.logger?.info('module.loaded', { module: this.name, version: this.version, mode: 'acople-whatsapp' });
  }

  async onUnload() {
    this._vistos.clear();
    this._orden = [];
    this._configCache.clear();
    this.logger?.info('module.unloaded', { module: this.name });
  }

  _cfgProyecto(slug) {
    const porProyecto = this.config.proyectos || {};
    return porProyecto[slug] || {};
  }

  // ── el mensaje que ya llega ────────────────────────────────────────────────

  async onWhatsappMensajeRecibido(event) {
    const data = event?.data || event?.payload || event || {};
    const slug = String(data.project_slug || data.slug || '').trim();
    if (!slug) return;

    const cfg = this._cfgProyecto(slug);
    if (cfg.activado !== true) return;

    const jid = String(data.from || data.de || '').trim();
    if (!jid || jid.endsWith('@g.us')) return;              // un grupo no pregunta por su pedido

    const texto = String(data.text || data.texto || data.interaction?.title || '').trim();
    if (!texto) return;

    const message_id = data.message_id || data.id || null;
    if (!this._primeraVez(message_id)) return;

    // Un SÍ/NO corto es de confirmacion-pedido. No se pisa.
    if (this._esSiNo(texto)) return;

    try {
      const proyecto = await this._configProyecto(slug);
      const puente = proyecto?.whatsapp_qr || null;
      if (puente && puente.activo === false) return;         // canal apagado en el proyecto

      const cuenta_id = await this._cuentaPorTelefono(slug, this._telefono(jid));
      const respuesta = await this._preguntarPortero(slug, texto, jid, cuenta_id, cfg);

      if (!respuesta?.texto) {
        await this._publicar('portero.whatsapp.fallido', {
          project_slug: slug, jid, message_id, motivo: respuesta?.motivo || 'sin_respuesta'
        });
        return;
      }

      const envio = await this._enviar(puente, slug, jid, respuesta.texto, cfg);
      await this._publicar(envio.ok ? 'portero.whatsapp.respondido' : 'portero.whatsapp.fallido', {
        project_slug: slug, jid, message_id,
        cuenta_id: cuenta_id || null,
        intencion: respuesta.intencion || null,
        resuelto: respuesta.resuelto === true,
        enviado: envio.ok === true,
        motivo: envio.ok ? null : envio.motivo,
        texto: respuesta.texto
      });
      this.metrics?.increment?.(envio.ok ? 'portero_whatsapp.respondido.total' : 'portero_whatsapp.fallido.total',
        { project: slug, razon: envio.ok ? 'ok' : (envio.motivo || 'envio') });
      this.logger?.info?.('portero-whatsapp.turno', {
        project_slug: slug, intencion: respuesta.intencion, resuelto: respuesta.resuelto,
        cuenta_id: cuenta_id || null, enviado: envio.ok
      });
    } catch (err) {
      this.logger?.warn?.('portero-whatsapp.error', { project_slug: slug, error_message: err?.message });
      await this._publicar('portero.whatsapp.fallido', { project_slug: slug, jid, message_id, motivo: 'excepcion' });
    }
  }

  // ── el portero: la única inteligencia que ponemos ──────────────────────────

  async _preguntarPortero(slug, texto, jid, cuenta_id, cfg) {
    const url = cfg.portero_url || PORTERO_DEFECTO;
    const body = {
      project_id: cfg.project_id || slug,
      message: texto,
      sesion_id: jid                                 // estable por cliente: memoria del turno
    };
    if (cuenta_id) body.cuenta_id = cuenta_id;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      return { texto: '', motivo: 'portero_no_responde' };
    }
    if (!res.ok) return { texto: '', motivo: `portero_http_${res.status}` };

    // El portero habla SSE: `data: {"t":...}` texto, `data: {"intencion":...}` cierre.
    const raw = await res.text();
    let textoRespuesta = '';
    let fin = {};
    for (const linea of raw.split('\n')) {
      if (!linea.startsWith('data: ')) continue;
      let d = null;
      try { d = JSON.parse(linea.slice(6)); } catch (_) { continue; }
      if (d && typeof d.t === 'string') textoRespuesta += d.t;
      else if (d && d.intencion) fin = d;
    }
    return { texto: textoRespuesta.trim(), intencion: fin.intencion || null, resuelto: fin.resuelto === true };
  }

  async _enviar(puente, slug, jid, texto, cfg) {
    const url = cfg.puente_url || puente?.url || PUENTE_DEFECTO;
    const slugPuente = cfg.puente_slug || puente?.slug || slug;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: slugPuente, to: jid, text: texto }),
        signal: AbortSignal.timeout(8000)
      });
      const cuerpo = await res.json().catch(() => null);
      if (cuerpo && cuerpo.ok === true) return { ok: true, message_id: cuerpo.id || null };
      return { ok: false, motivo: 'puente_rechaza' };
    } catch (err) {
      return { ok: false, motivo: 'puente_no_responde' };
    }
  }

  // ── identidad por teléfono ─────────────────────────────────────────────────

  async _cuentaPorTelefono(slug, telefono) {
    if (!telefono || typeof this.mqttRequest !== 'function') return null;
    try {
      const res = await this.mqttRequest('cuenta', 'list', { project_id: slug });
      const cuentas = res?.data?.cuentas || res?.data?.data?.cuentas || [];
      const coinciden = cuentas.filter(c => {
        if (c.estado === 'cerrada') return false;
        const t = c.cliente_telefono || c.telefono || c.datos_especificos?.telefono ||
                  c.datos_especificos?.cliente_telefono || '';
        return this._telefono(String(t)) === telefono;
      });
      // Ambigüedad = no se adivina. La cuenta solo se usa para ahorrar una pregunta.
      return coinciden.length === 1 ? coinciden[0].id : null;
    } catch (_err) { return null; }
  }

  _telefono(valor) {
    const digitos = String(valor || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    return digitos.length >= 9 ? digitos.slice(-9) : digitos;
  }

  // ── utilidades ─────────────────────────────────────────────────────────────

  _primeraVez(message_id) {
    if (!this._vistos) { this._vistos = new Set(); this._orden = []; }
    if (!message_id) return true;                     // sin id no se puede deduplicar: se atiende
    const id = String(message_id);
    if (this._vistos.has(id)) return false;
    this._vistos.add(id);
    this._orden.push(id);
    if (this._orden.length > VISTOS_MAX) this._vistos.delete(this._orden.shift());
    return true;
  }

  _esSiNo(texto) {
    const t = String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim().replace(/\s+/g, ' ');
    if (!t || t.split(' ').length > 2) return false;
    return SI_NO.has(t);
  }

  async _configProyecto(slug) {
    if (this._configCache.has(slug)) return this._configCache.get(slug);
    let cfg = {};
    try {
      const base = await this._basePath(slug);
      if (base) {
        const raw = await fs.readFile(`${base}/config/config.json`, 'utf8');
        cfg = JSON.parse(raw) || {};
      }
    } catch (_err) { cfg = {}; }
    this._configCache.set(slug, cfg);
    return cfg;
  }

  async _basePath(project_id) {
    try {
      const pm = this.moduleRegistry?.get('project-manager')?.instance;
      const res = await pm?.handleGetProject?.({ params: { id: project_id } });
      return res?.data?.project?.base_path || null;
    } catch (_err) { return null; }
  }

  async _publicar(evento, payload) {
    try {
      await this.eventBus?.publish?.(evento, { ...payload, correlation_id: require('crypto').randomUUID() });
    } catch (_err) { /* la medición nunca tumba el turno */ }
  }
}

module.exports = PorteroWhatsapp;
