'use strict';

/**
 * media-generator — el LÍDER GENERADOR (puerto de generación provider-agnóstico).
 *
 * Un especialista (diseñador gráfico, sound designer…) NO conoce DALL-E/SD/TTS: pide al
 * PUERTO `media.generar` un asset por su TIPO + PROMPT, y el líder enruta al MOTOR concreto
 * configurado para ese tipo. Cambiar de motor = cambiar config, no el especialista.
 *
 *   especialista ──media.generar.request {tipo, prompt, opciones}──► media-generator
 *                                                                        │ enruta por tipo
 *                                                                        ▼
 *                                            motor concreto (tools_http: openai/sd/tts…)
 *                                                                        │ (credencial via credential-manager)
 *                   media.generar.response {asset_base64, ext, meta} ◄───┘
 *
 * El motor real es un `tools_http` (el loader resuelve credencial + fetch + response_path).
 * Degradable: si un tipo no tiene motor configurado → NO_MOTOR (claro, sin reventar).
 */

const crypto = require('crypto');
const BaseModule = require('../../_shared/base-module');

class MediaGeneratorModule extends BaseModule {
  constructor() {
    super();
    this.name = 'media-generator';
    this.version = '1.0.0';
    this._subs = [];
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.config = (core.config && core.config['media-generator']) || {};
    // motores: { <tipo>: { tool, defaults?, ext?, asset_es_url?, asset_field? } }
    this.motores = this.config.motores || {};

    const sub = (ev, fn) => { try { this._subs.push(this.eventBus.subscribe(ev, fn)); } catch (_) {} };
    sub('media.generar.request', e => this._onGenerar(e));

    this.logger?.info('module.loaded', {
      module: this.name, version: this.version,
      motores: Object.keys(this.motores), tipos_listos: Object.keys(this.motores).filter(t => this.motores[t]?.tool)
    });
  }

  async onUnload() {
    for (const u of this._subs) { try { u(); } catch (_) {} }
    this._subs = [];
    this.logger?.info('module.unloaded', { module: this.name });
  }

  // RPC de bus (best-effort, timeout). Tolera respuesta de tool_http ({request_id, result})
  // y de reflejo ({request_id, status, data}).
  async _rpc(evento, payload = {}, { timeout_ms = 90000 } = {}) {
    if (!this.eventBus?.subscribe || !this.eventBus?.publish) return null;
    const request_id = crypto.randomUUID();
    const responseEvent = evento.endsWith('.request') ? evento.slice(0, -8) + '.response' : `${evento}.response`;
    return new Promise((resolve) => {
      let unsub = null;
      const timeout = setTimeout(() => { if (unsub) unsub(); resolve(null); }, timeout_ms);
      try {
        unsub = this.eventBus.subscribe(responseEvent, (event) => {
          const d = event?.data || event;
          if (!d || d.request_id !== request_id) return;
          clearTimeout(timeout); if (unsub) unsub(); resolve(d);
        });
        this.eventBus.publish(evento, { request_id, ...payload });
      } catch (_) { clearTimeout(timeout); if (unsub) unsub(); resolve(null); }
    });
  }

  async _onGenerar(event) {
    const d = event?.data || event;
    const request_id = d?.request_id;
    const responder = (status, body) => {
      try {
        this.eventBus.publish('media.generar.response', {
          request_id, status,
          correlation_id: d?.correlation_id || crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          ...body
        });
      } catch (_) {}
    };

    try {
      // 1. CONTRATO
      if (!d?.tipo || !d?.prompt) {
        return responder(400, { error: { code: 'INVALID_INPUT', message: 'tipo y prompt requeridos' } });
      }
      const motor = this.motores[d.tipo];
      if (!motor || !motor.tool) {
        return responder(503, { error: { code: 'NO_MOTOR',
          message: `sin motor configurado para tipo '${d.tipo}'. Configúralo en media-generator.motores.${d.tipo} (tool de un tools_http) + su credencial.` } });
      }

      // 2. ENRUTAR — prompt + defaults del motor + opciones del especialista.
      const args = { prompt: d.prompt, ...(motor.defaults || {}), ...(d.opciones || {}) };
      this.metrics?.increment?.('media.generar.total', { tipo: d.tipo, motor: motor.tool });
      const resp = await this._rpc(`${motor.tool}.request`, args, { timeout_ms: motor.timeout_ms || 90000 });

      // 3. NORMALIZAR — desempaqueta tool_http ({result}) o reflejo ({status,data}).
      if (!resp) {
        this.metrics?.increment?.('media.generar.failed', { tipo: d.tipo, kind: 'timeout' });
        return responder(504, { error: { code: 'UPSTREAM_TIMEOUT', message: `el motor '${motor.tool}' no respondió a tiempo` } });
      }
      const out = (resp.result !== undefined) ? resp.result : resp;
      if (resp.error || out?.error || (out?.status && out.status >= 400)) {
        this.metrics?.increment?.('media.generar.failed', { tipo: d.tipo, kind: 'upstream' });
        return responder(out?.status || 502, { error: out?.error || resp.error || { code: 'UPSTREAM_INVALID_RESPONSE', message: 'el motor devolvió error' } });
      }

      // 4. EXTRAER el asset (el tool_http ya aplicó response_path → out.data es el dato útil).
      const payload = out?.data !== undefined ? out.data : out;
      let asset_base64 = null, url = null;
      if (motor.asset_es_url) {
        url = (typeof payload === 'string') ? payload : (payload?.url || null);
      } else {
        asset_base64 = (typeof payload === 'string') ? payload : (payload?.[motor.asset_field || 'b64_json'] || null);
      }
      if (!asset_base64 && !url) {
        this.metrics?.increment?.('media.generar.failed', { tipo: d.tipo, kind: 'sin_asset' });
        return responder(502, { error: { code: 'UPSTREAM_INVALID_RESPONSE', message: 'el motor no devolvió ningún asset (revisa response_path/asset_field)' } });
      }

      this.metrics?.increment?.('media.generar.ok', { tipo: d.tipo, motor: motor.tool });
      return responder(200, { data: {
        tipo: d.tipo,
        asset_base64, url,
        ext: motor.ext || (d.tipo === 'imagen' ? 'png' : (d.tipo === 'audio' || d.tipo === 'musica' ? 'mp3' : 'bin')),
        meta: { motor: motor.tool, prompt: d.prompt, opciones: d.opciones || {}, generado_at: new Date().toISOString() }
      } });
    } catch (err) {
      this.logger?.error('media-generator.generar.failed', { error: err.message });
      return responder(500, { error: { code: 'UNKNOWN_ERROR', message: err.message } });
    }
  }
}

module.exports = MediaGeneratorModule;
