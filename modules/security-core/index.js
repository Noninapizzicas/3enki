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
const { DOMINIOS_SENSIBLES } = require('../../core/broker/bus-guard');

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
    this._unsubPeers = [];
    this._peerCores = new Set();   // coreIds de peers confiables (dinámico, desde security-p2p)
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
      // Peer-trust DINÁMICO: el mesh de cores confía por security-p2p (handshake X25519).
      // Cada peer confiable → su coreId entra en el trusted set del guard (conecta con clientId=coreId).
      this._unsubPeers.push(this.eventBus.subscribe('security.peer.trusted', (d) => this._onPeerTrusted(d)));
      this._unsubPeers.push(this.eventBus.subscribe('security.peer.revoked', (d) => this._onPeerRevoked(d)));
    }

    this.logger?.info?.('security-core.loaded', {
      module: this.name, version: this.version,
      guard: !!this.guard, modo: this.guard ? this.guard._mode : 'sin-guard'
    });
  }

  // ── peer-trust: el mesh de cores (security-p2p) mueve el trusted set del guard ──
  _coreIdDe(d) {
    // los eventos de security-p2p no son uniformes: handshake trae peer_core_id, el manual name.
    return (d && (d.peer_core_id || d.core_id || d.name)) || null;
  }
  _onPeerTrusted(d) {
    const coreId = this._coreIdDe(d);
    if (!coreId) return;
    this._peerCores.add(coreId);
    this.guard?.addTrustedClientId(coreId);
    this.logger?.info?.('security-core.peer_trusted', { coreId, peers: this._peerCores.size });
  }
  _onPeerRevoked(d) {
    const coreId = d && (d.core_id || d.peer_core_id);
    if (!coreId) { this.logger?.warn?.('security-core.peer_revoked_sin_coreId', { public_key: !!d?.public_key }); return; }
    this._peerCores.delete(coreId);
    this.guard?.removeTrustedClientId(coreId);
    this.logger?.info?.('security-core.peer_revoked', { coreId, peers: this._peerCores.size });
  }

  async onUnload() {
    if (typeof this._unsub === 'function') { try { this._unsub(); } catch (_) { /* ignore */ } }
    for (const u of this._unsubPeers) { if (typeof u === 'function') { try { u(); } catch (_) { /* ignore */ } } }
    this._unsubPeers = [];
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
    return { valid: !!data.valid, type: data.type, scope: data.scope || 'system', identifier: data.identifier, error: data.error };
  }

  _registrarInterruptores() {
    if (!this.eventBus?.publish) return;
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'bus-guard', label: '🛡️ Guardián del bus — BOTÓN DE PÁNICO (apágalo si algo va mal)', grupo: 'sistema',
        descripcion: 'El interruptor maestro de la seguridad del bus. OFF = broker ABIERTO (comportamiento de hoy) — es el botón de escape: si algo falla, apágalo y todo vuelve a funcionar al instante, en caliente, sin reiniciar. ON = el bus verifica identidad por certificado y AUDITA (modo observe): mide quién sería bloqueado SIN romper a nadie. Enciéndelo antes de activar el bloqueo.',
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

  // ── UI: estado de la puerta + veredicto de Fase 1 (¿listo para enforce?) ──
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
        peer_cores: [...this._peerCores],
        listo_para_enforce: this._veredictoEnforce(stats),
        escalera: 'off → observe (audita sin romper) → enforce (bloquea)'
      }
    };
  }

  // El instrumento de decisión de Fase 1: mientras corre 'observe', ¿qué dominios SENSIBLES
  // vería bloqueados enforce? Si ninguno acumula denegaciones, subir a enforce no rompe a nadie.
  _veredictoEnforce(stats) {
    const denied = (stats && stats.deniedByDomain) || {};
    const sensibles = Object.keys(denied).filter((d) => DOMINIOS_SENSIBLES.has(d));
    return {
      dominios_sensibles_con_trafico: sensibles.map((d) => ({ dominio: d, denegaciones: denied[d] })),
      recomendacion: sensibles.length === 0
        ? 'sin tráfico anónimo a dominios sensibles — enforce es seguro'
        : 'hay tráfico anónimo a dominios sensibles — enrola esos clientes ANTES de enforce',
      total_denegaciones: Object.values(denied).reduce((a, b) => a + b, 0)
    };
  }
}

module.exports = SecurityCoreModule;
module.exports._modoDe = _modoDe;
