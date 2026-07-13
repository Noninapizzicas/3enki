/**
 * security-core — el cerebro de la puerta guardada del bus.
 *
 * Hace que certificate-authority rija la seguridad REAL del sistema entero: cablea el
 * BusGuard del broker (core.busGuard) al verificador de certificados y traduce los dos
 * interruptores del dueño en el peldaño de la escalera off→observe→enforce.
 *
 * Reparto (reflejo determinista, sin LLM):
 *   - REGISTRA los interruptores bus-guard (OFF) y bus-guard-enforce (OFF) — el dueño manda.
 *   - CABLEA el verifier del guard a certificate-authority.verify (node-forge, cripto ya real).
 *   - ESCUCHA interruptor.cambiado y recalcula el modo → guard.setMode.
 *   - AUDITA el estado (handleEstado) para el panel.
 *
 * El guard nace OFF: cargar este módulo NO cambia nada hasta que el dueño sube el peldaño.
 * Ver core/broker/bus-guard.js y arquitectura/cabecera/sistema-nervioso/bus-guardado.md.
 */

'use strict';

const BaseModule = require('../_shared/base-module');

// Los dos interruptores → el peldaño. bus-guard OFF gana (off); con él ON, enforce decide.
function _modoDe(activo, enforce) {
  if (!activo) return 'off';
  return enforce ? 'enforce' : 'observe';
}

class SecurityCoreModule extends BaseModule {
  constructor() {
    super();
    this.name = 'security-core';
    this.version = '1.0.0';

    this.guard = null;
    this.activo = false;    // interruptor bus-guard        — OFF (broker abierto)
    this.enforce = false;   // interruptor bus-guard-enforce — OFF (solo observa)
    this._unsub = null;
  }

  async onLoad(core) {
    this.core = core;
    this.eventBus = core.eventBus || null;
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.mqttRequest = core.mqttRequest || null;

    const config = core.moduleConfig || {};
    this.activo = config.bus_guard === true;
    this.enforce = config.bus_guard_enforce === true;

    // La puerta guardada del broker embebido (puede faltar con broker externo → degradación honesta).
    this.guard = core.busGuard || null;

    if (this.guard) {
      // Cablea el verifier: el guard NO re-implementa cripto, consulta certificate-authority.
      this.guard.setVerifier((pem) => this._verificar(pem));
      this.guard.setMode(_modoDe(this.activo, this.enforce));
    } else {
      this.logger?.warn?.('security-core.no_guard', {
        reason: 'core.busGuard ausente (¿broker externo?) — la seguridad del bus la impone ese broker'
      });
    }

    this._registrarInterruptores();

    // Observer: el dueño mueve un interruptor → recalculamos el peldaño en caliente.
    if (this.eventBus?.subscribe) {
      this._unsub = this.eventBus.subscribe('interruptor.cambiado', (d) => this._onInterruptor(d));
    }

    this.logger?.info?.('security-core.loaded', {
      module: this.name, version: this.version,
      guard: !!this.guard, modo: this.guard ? this.guard._mode : 'sin-guard'
    });
  }

  async onUnload() {
    if (typeof this._unsub === 'function') { try { this._unsub(); } catch (_) { /* ignore */ } }
    this._unsub = null;
    // Al descargar, la puerta vuelve a 'off' (no dejamos el bus a medio guardar sin cerebro).
    if (this.guard) this.guard.setMode('off');
    this.logger?.info?.('security-core.unloaded', { module: this.name });
  }

  // ── el puente al verificador real (certificate-authority) ──
  async _verificar(pem) {
    if (!this.mqttRequest) return { valid: false, error: 'mqttRequest-ausente' };
    // Lanza si certificate-authority no está cargado → el guard degrada honesto (verifier-unavailable).
    const r = await this.mqttRequest('certificate-authority', 'verify', { certificate: pem });
    const data = r?.data || r || {};
    return { valid: !!data.valid, type: data.type, identifier: data.identifier, error: data.error };
  }

  _registrarInterruptores() {
    if (!this.eventBus?.publish) return;
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'bus-guard', label: 'Guardián del bus (identidad por certificado)', grupo: 'sistema',
        descripcion: 'OFF = broker abierto (hoy). ON = el bus verifica identidad y AUDITA (modo observe): mide quién sería bloqueado sin romper a nadie. Enciéndelo antes de enforce.',
        default: this.activo
      });
      this.eventBus.publish('interruptor.registrar', {
        id: 'bus-guard-enforce', label: 'Guardián del bus · BLOQUEAR', grupo: 'sistema',
        descripcion: 'OFF = solo observa. ON = BLOQUEA: el anónimo no toca dominios sensibles (credential/security/module/...), la credencial inválida no entra. Requiere bus-guard ON y que el front/core porten su certificado.',
        default: this.enforce
      });
    } catch (_) { /* el panel puede no estar aún; se re-registra al solicitar_registro */ }
  }

  _onInterruptor(d) {
    if (!d || (d.id !== 'bus-guard' && d.id !== 'bus-guard-enforce')) return;
    if (d.id === 'bus-guard') this.activo = d.enabled === true;
    if (d.id === 'bus-guard-enforce') this.enforce = d.enabled === true;
    const modo = _modoDe(this.activo, this.enforce);
    if (this.guard) this.guard.setMode(modo);
    this.metrics?.increment?.('security.bus.mode_changed', { mode: modo });
    this.logger?.info?.('security-core.modo', { modo, activo: this.activo, enforce: this.enforce });
    // Auditoría al bus (cada flujo cierra su círculo).
    try {
      this.eventBus?.publish?.('security.bus.mode_changed', {
        modo, activo: this.activo, enforce: this.enforce, timestamp: new Date().toISOString()
      });
    } catch (_) { /* best-effort */ }
  }

  // ── UI: estado de la puerta (para el panel) ──
  async handleEstado() {
    const modo = this.guard ? this.guard._mode : 'sin-guard';
    const stats = this.guard ? this.guard.getStats() : null;
    return {
      status: 200,
      data: {
        module: this.name, version: this.version,
        guard_presente: !!this.guard,
        modo, activo: this.activo, enforce: this.enforce,
        stats,
        escalera: 'off → observe (audita sin romper) → enforce (bloquea)'
      }
    };
  }
}

module.exports = SecurityCoreModule;
module.exports._modoDe = _modoDe;
