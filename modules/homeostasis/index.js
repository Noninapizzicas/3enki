/**
 * homeostasis — el termostato del cuerpo (auto-inhibición con realimentación negativa).
 *
 * Es un ÓRGANO más (memoria + motor + evento), pero su oficio es REGULAR a los
 * otros: cuando una facultad se desboca (miente, falla en bucle, degrada), la
 * homeostasis lo SIENTE, lo COMPARA contra un umbral y, si hace falta, la INHIBE
 * — y la vuelve a soltar cuando se enfría. El bucle clásico del cuerpo:
 *
 *   SENSOR     (señales del bus: fantasma, *.failed, health.alert, revisión)
 *      ↓  _percibir(fuente, peso)         sube la "temperatura" de la fuente
 *   COMPARADOR (umbral + histéresis)      sano → inflamación → fiebre → apoptosis
 *      ↓  _efector(fuente, estado)
 *   EFECTOR    (interruptor.set)          inhibe la facultad desbocada en caliente
 *      ↓
 *   ENFRIAMIENTO (_enfriar, por tick)     decae la temperatura; recupera con histéresis
 *
 * RESPUESTA GRADUADA (como el cuerpo): no salta a matar.
 *   inflamación → solo TESTIGO (homeostasis.alerta), observa.
 *   fiebre      → INHIBE la facultad (si es gobernable) + testigo.
 *   apoptosis   → CONSERVADOR: NO mata solo; lo CANTA fuerte (homeostasis.apoptosis)
 *                 y deja la decisión última a la voluntad (el humano). El reflejo
 *                 vive bajo la voluntad.
 *
 * AUTOINMUNE-CONSERVADORA: solo inhibe facultades que declararon interruptor
 * gobernable y NUNCA toca los órganos vitales (bus, propiocepción, la propia
 * homeostasis, el gobierno…). Mejor no actuar que devorar al cuerpo sano.
 *
 * TESTIGO (anti-acto-invisible): toda transición emite su evento al bus. No hay
 * auto-inhibición a oscuras — la propiocepción y el log lo ven siempre.
 *
 * NACE INHIBIDA (prudencia): registra su interruptor 'homeostasis' en OFF. El
 * humano la despierta deliberadamente. Dormida, SIENTE y TESTIFICA pero su
 * EFECTOR no actúa (motor dormido) — observabilidad sin riesgo desde el minuto 1.
 */

'use strict';

const crypto = require('crypto');
const BaseModule = require('../_shared/base-module');

// Órganos vitales: jamás inhibibles (autoinmune-conservadora).
const INMUNES = new Set([
  'homeostasis', 'interruptores', 'propiocepcion', 'bus', 'mqtt', 'eventbus',
  'ai-gateway', 'chat-io', 'database-manager', 'filesystem', 'project-manager'
]);

const DEFAULTS = {
  umbral_inflamacion: 2,
  umbral_fiebre: 4,
  umbral_apoptosis: 8,
  enfriamiento: 1,        // cuánto baja la temperatura por tick
  histeresis: 1,          // margen para soltar (evita flapping)
  tick_ms: 60000,         // cadencia del enfriamiento
  pesos: {                // cuánto pesa cada señal en la temperatura
    fantasma: 2,
    revision: 2,
    failed: 1,
    health: 1
  }
};

class HomeostasisModule extends BaseModule {
  constructor() {
    super();
    this.name = 'homeostasis';
    this.version = '1.0.0';
    this.config = null;
    this.activo = false;                 // motor del EFECTOR: dormido hasta que el humano lo despierte
    this.temp = new Map();               // fuente → temperatura
    this.estado = new Map();             // fuente → 'sano'|'inflamacion'|'fiebre'|'apoptosis'
    this.inhibidos = new Set();          // fuentes que inhibimos (para soltarlas al recuperar)
    this.interruptoresVivos = new Set(); // ids de interruptor gobernables (los aprende del bus)
    this._tickTimer = null;
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.metrics = context.metrics;
    this.config = Object.assign({}, DEFAULTS, context.moduleConfig || {});
    this.config.pesos = Object.assign({}, DEFAULTS.pesos, (context.moduleConfig || {}).pesos || {});

    // NACE INHIBIDA: registra su interruptor en OFF (el humano la despierta).
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'homeostasis', label: 'Homeostasis (auto-inhibición)',
        descripcion: 'El termostato del cuerpo: inhibe en caliente la facultad que se desboca y la suelta al enfriarse. Nace OFF; dormida solo observa y testifica.',
        grupo: 'sistema', default: false
      });
    } catch (_) { /* best-effort */ }

    // SENSOR genérico de *.failed: tap del bus crudo (best-effort, como propiocepción).
    // Las señales concretas (fantasma/revisión/health) llegan por subscribes del manifest;
    // este tap atrapa cualquier <dominio>.*.failed sin enumerarlos todos.
    this._startFailedTap();

    // El enfriamiento late aunque el efector duerma (la temperatura siempre baja).
    this._tickTimer = setInterval(() => this._enfriar(), this.config.tick_ms);
    if (this._tickTimer && typeof this._tickTimer.unref === 'function') this._tickTimer.unref();

    this.logger?.info('homeostasis.loaded', { module: this.name, version: this.version, activo: this.activo });
  }

  async onUnload() {
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
    this._stopFailedTap();
    this.temp.clear(); this.estado.clear(); this.inhibidos.clear(); this.interruptoresVivos.clear();
    this.logger?.info('homeostasis.unloaded', { module: this.name });
  }

  // ── tap del bus crudo para *.failed (best-effort; sin mqtt, no pasa nada) ──
  _startFailedTap() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || typeof mqtt.on !== 'function') return;     // tests / sin transporte: solo subscribes
    this._onFailedMsg = (topic, message) => {
      try {
        let env = message;
        if (Buffer.isBuffer(message) || typeof message === 'string') {
          try { env = JSON.parse(message.toString()); } catch (_) { return; }
        }
        const eventType = env?.event_type || String(topic || '').split('/').filter(Boolean).slice(-2).join('.');
        if (!eventType || !/\.failed$/.test(String(eventType))) return;
        this.onFailed({ data: env?.data || env }, eventType);
      } catch (_) { /* best-effort */ }
    };
    mqtt.on('message', this._onFailedMsg);
  }
  _stopFailedTap() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onFailedMsg && typeof mqtt.removeListener === 'function') mqtt.removeListener('message', this._onFailedMsg);
    this._onFailedMsg = null;
  }

  // ── gobierno: el humano despierta/duerme el EFECTOR en caliente ──
  onInterruptorRegistrado(event) {
    const d = (event && event.data) || event || {};
    if (d.id && d.id !== 'homeostasis') this.interruptoresVivos.add(d.id);  // aprende qué es gobernable
  }
  onInterruptorCambiado(event) {
    const d = (event && event.data) || event || {};
    if (d.id === 'homeostasis') {
      this.activo = !!d.enabled;
      this.logger?.warn('homeostasis.gobierno', { activo: this.activo });
    }
  }
  // NACIMIENTO: si interruptores arrancó después y pidió re-registro, re-anunciamos.
  onSolicitarRegistro() {
    try {
      this.eventBus.publish('interruptor.registrar', {
        id: 'homeostasis', label: 'Homeostasis (auto-inhibición)',
        descripcion: 'El termostato del cuerpo: inhibe en caliente la facultad que se desboca y la suelta al enfriarse. Nace OFF; dormida solo observa y testifica.',
        grupo: 'sistema', default: false
      });
    } catch (_) { /* best-effort */ }
  }

  // ── SENSOR: las señales de peligro del bus, normalizadas a _percibir ──
  onFantasma(event) {
    const d = (event && event.data) || event || {};
    const fuente = d.modulo || d.page_id || d.fuente || 'desconocido';
    this._percibir(fuente, this.config.pesos.fantasma, 'fantasma', d);
  }
  onRevisionRequerida(event) {
    const d = (event && event.data) || event || {};
    const fuente = d.modulo || d.skill || d.fuente || 'aprendizaje';
    this._percibir(fuente, this.config.pesos.revision, 'revision', d);
  }
  onHealthAlert(event) {
    const d = (event && event.data) || event || {};
    const fuente = d.device_id || d.fuente || 'flota';
    this._percibir(fuente, this.config.pesos.health, 'health', d);
  }
  // tap genérico de *.failed: la fuente es el dominio del evento (prefijo).
  onFailed(event, eventType) {
    const d = (event && event.data) || event || {};
    const tipo = eventType || d.event_type || '';
    const fuente = d.modulo || d.fuente || String(tipo).split('.')[0] || 'desconocido';
    if (!fuente || fuente === 'homeostasis') return;       // no nos auto-percibimos
    this._percibir(fuente, this.config.pesos.failed, 'failed', d);
  }

  // ── COMPARADOR: sube la temperatura de la fuente y reevalúa su estado ──
  _percibir(fuente, peso, señal, datos = {}) {
    if (!fuente) return;
    const t = (this.temp.get(fuente) || 0) + (peso || 1);
    this.temp.set(fuente, t);
    this.metrics?.increment('homeostasis.percibido.total', { señal });
    this._evaluar(fuente, señal, datos);
  }

  _clasificar(t) {
    if (t >= this.config.umbral_apoptosis) return 'apoptosis';
    if (t >= this.config.umbral_fiebre) return 'fiebre';
    if (t >= this.config.umbral_inflamacion) return 'inflamacion';
    return 'sano';
  }

  _evaluar(fuente, señal, datos) {
    const t = this.temp.get(fuente) || 0;
    const nuevo = this._clasificar(t);
    const previo = this.estado.get(fuente) || 'sano';
    this.estado.set(fuente, nuevo);
    if (nuevo === previo) return;                          // sin transición → nada que testificar
    this._efector(fuente, nuevo, previo, t, señal, datos);
  }

  // ── EFECTOR: respuesta graduada. Testifica SIEMPRE; actúa solo si está despierta. ──
  _efector(fuente, estado, previo, temp, señal, datos) {
    // TESTIGO: toda transición se canta al bus (anti-acto-invisible).
    this._testigo('homeostasis.alerta', { fuente, estado, previo, temp, señal });

    if (estado === 'inflamacion') {
      // solo observa — la inflamación es vigilancia, no acción.
      return;
    }

    if (estado === 'fiebre') {
      if (!this.activo) {                                  // motor dormido: siente, no actúa
        this.logger?.warn('homeostasis.fiebre.observada', { fuente, temp, dormida: true });
        return;
      }
      if (this._inhibible(fuente) && !this.inhibidos.has(fuente)) {
        const motivo = `homeostasis: fiebre por ${señal} (temp ${temp})`;
        this._inhibir(fuente, motivo);
      } else {
        this.logger?.warn('homeostasis.fiebre.no_inhibible', { fuente, temp });
      }
      return;
    }

    if (estado === 'apoptosis') {
      // CONSERVADORA: no mata sola. Lo canta fortísimo y deja el corte a la voluntad.
      this._testigo('homeostasis.apoptosis', {
        fuente, temp, señal,
        recomendacion: this._inhibible(fuente) ? 'corte_manual_sugerido' : 'fuente_no_gobernable',
        nota: 'la homeostasis no ejecuta la apoptosis sola; requiere la voluntad (humano)'
      });
      this.logger?.error('homeostasis.apoptosis', { fuente, temp, señal });
      this.metrics?.increment('homeostasis.apoptosis.total', { fuente });
    }
  }

  _inhibible(fuente) {
    return this.interruptoresVivos.has(fuente) && !INMUNES.has(fuente);
  }

  _inhibir(fuente, motivo) {
    this.inhibidos.add(fuente);
    try { this.eventBus.publish('interruptor.set', { id: fuente, enabled: false, motivo }); } catch (_) { /* */ }
    this._testigo('homeostasis.accion', { fuente, accion: 'inhibir', motivo });
    this.metrics?.increment('homeostasis.inhibido.total', { fuente });
    this.logger?.warn('homeostasis.inhibir', { fuente, motivo });
  }

  // ── ENFRIAMIENTO: la temperatura baja sola; recupera con histéresis ──
  _enfriar() {
    for (const [fuente, t] of [...this.temp.entries()]) {
      const nt = Math.max(0, t - this.config.enfriamiento);
      if (nt === 0) this.temp.delete(fuente); else this.temp.set(fuente, nt);

      const estado = this._clasificar(nt);
      const previo = this.estado.get(fuente) || 'sano';

      // recuperación: si bajó del umbral de fiebre menos la histéresis y estaba
      // inhibida → la soltamos (y lo testificamos).
      if (this.inhibidos.has(fuente) && nt < (this.config.umbral_fiebre - this.config.histeresis)) {
        this.inhibidos.delete(fuente);
        if (this.activo) {
          try { this.eventBus.publish('interruptor.set', { id: fuente, enabled: true, motivo: 'homeostasis: recuperada (enfriada)' }); } catch (_) { /* */ }
        }
        this._testigo('homeostasis.recuperado', { fuente, temp: nt });
        this.logger?.info('homeostasis.recuperado', { fuente, temp: nt });
      }

      if (estado !== previo) {
        this.estado.set(fuente, estado);
        if (estado === 'sano') this.estado.delete(fuente);
        else this._testigo('homeostasis.alerta', { fuente, estado, previo, temp: nt, señal: 'enfriamiento' });
      }
    }
  }

  _testigo(evento, payload) {
    try {
      this.eventBus.publish(evento, {
        ...payload, correlation_id: crypto.randomUUID(), timestamp: new Date().toISOString()
      });
    } catch (_) { /* best-effort */ }
  }

  // ── UI/diagnóstico: el cuadro clínico actual ──
  async handleEstado() {
    const fuentes = [...this.temp.entries()].map(([fuente, temp]) => ({
      fuente, temp, estado: this.estado.get(fuente) || this._clasificar(temp),
      inhibida: this.inhibidos.has(fuente), inhibible: this._inhibible(fuente)
    })).sort((a, b) => b.temp - a.temp);
    return { status: 200, data: {
      activo: this.activo, fuentes,
      inhibidos: [...this.inhibidos], gobernables: [...this.interruptoresVivos],
      umbrales: {
        inflamacion: this.config.umbral_inflamacion,
        fiebre: this.config.umbral_fiebre,
        apoptosis: this.config.umbral_apoptosis
      }
    } };
  }

  async handleHealthCheck() {
    return { status: 200, data: { module: this.name, version: this.version, activo: this.activo, fuentes: this.temp.size } };
  }
}

module.exports = HomeostasisModule;
