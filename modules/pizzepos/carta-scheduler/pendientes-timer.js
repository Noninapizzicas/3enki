'use strict';

/**
 * PendientesTimer — lifecycle con setInterval canonico.
 *
 * Aplica las reglas del contrato `lifecycle`:
 *  - El timer se ARRANCA en start() (llamado desde onLoad del modulo).
 *  - Se PARA en stop() (llamado desde onUnload). Sin clearInterval, fuga de
 *    memoria + ejecuciones zombies tras unload.
 *  - El callback nunca lanza: si falla, log warn + metric, sigue corriendo.
 *  - Telemetria por tick: cuenta de pendientes vencidos + duracion del cleanup.
 *
 * Cierra drift del original carta-scheduler:
 *  - El cleanupTimer SI tenia clearInterval en onUnload (este es OK del original)
 *  - Pero NO emitia metric por tick → sin observabilidad operativa
 *  - El callback no estaba blindado: una excepcion mataba todos los proximos ticks
 *
 * @example
 *   const timer = new PendientesTimer({
 *     intervalMs: 3600000, // 1h
 *     callback:   () => this.limpiarPendientesVencidos(),
 *     logger,
 *     metrics,
 *     moduleName: 'carta-scheduler'
 *   });
 *   timer.start();   // en onLoad
 *   timer.stop();    // en onUnload
 */
class PendientesTimer {
  /**
   * @param {Object} args
   * @param {number} args.intervalMs   — intervalo del setInterval en ms
   * @param {Function} args.callback   — async () => void; ejecutado en cada tick
   * @param {Object} args.logger
   * @param {Object} args.metrics      — API canonica (increment / gauge / timing)
   * @param {string} args.moduleName   — para signatures de log/metric
   */
  constructor({ intervalMs, callback, logger, metrics, moduleName = 'module' }) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error('PendientesTimer: intervalMs must be a positive number');
    }
    if (typeof callback !== 'function') {
      throw new Error('PendientesTimer: callback must be a function');
    }
    if (!logger) throw new Error('PendientesTimer: logger is required');
    this.intervalMs = intervalMs;
    this.callback   = callback;
    this.logger     = logger;
    this.metrics    = metrics;
    this.moduleName = moduleName;
    this._handle    = null;
    this._running   = false;
    this._tickCount = 0;
  }

  /**
   * Arranca el timer. Idempotente: si ya esta corriendo, log y no-op.
   */
  start() {
    if (this._handle) {
      this.logger.warn(`${this.moduleName}.timer.start.already_running`, { interval_ms: this.intervalMs });
      return;
    }
    this._handle = setInterval(() => this._tick().catch(() => {}), this.intervalMs);
    // setInterval keeps the event loop alive; en tests largos puede convenir
    // unref para que el proceso termine. Mantenemos el handle por defecto
    // (en produccion el modulo tiene control por onUnload).
    this._running = true;
    this.logger.info(`${this.moduleName}.timer.started`, { interval_ms: this.intervalMs });
    this._increment(`${this.moduleName}.timer.started`, 1, {});
  }

  /**
   * Para el timer y limpia el handle. Idempotente: si ya esta parado, no-op.
   * Llamado desde onUnload (regla lifecycle: onUnload limpia TODOS los timers).
   */
  stop() {
    if (!this._handle) return;
    clearInterval(this._handle);
    this._handle  = null;
    this._running = false;
    this.logger.info(`${this.moduleName}.timer.stopped`, { ticks: this._tickCount });
    this._increment(`${this.moduleName}.timer.stopped`, 1, {});
  }

  /**
   * Estado actual. Util en handleHealth.
   */
  isRunning() { return this._running; }
  ticks()     { return this._tickCount; }

  // ----------------------------------------------------------------- internal

  async _tick() {
    this._tickCount++;
    const t0 = Date.now();
    try {
      await this.callback();
      const dur = Date.now() - t0;
      this.logger.debug(`${this.moduleName}.timer.tick.ok`, { tick: this._tickCount, dur_ms: dur });
      this._timing(`${this.moduleName}.timer.tick.duration`, dur, { status: 'ok' });
    } catch (err) {
      const dur = Date.now() - t0;
      // El callback fallo; loggear pero NO matar el timer (proximos ticks deben
      // seguir corriendo — este es el blindaje que el original carecia).
      this.logger.warn(`${this.moduleName}.timer.tick.failed`, {
        tick: this._tickCount, dur_ms: dur,
        error_message: err.message, stack: err.stack
      });
      this._timing(`${this.moduleName}.timer.tick.duration`, dur, { status: 'error' });
      this._increment(`${this.moduleName}.timer.errors`, 1, { kind: 'callback' });
    }
  }

  _increment(name, value, labels) {
    if (this.metrics?.increment) this.metrics.increment(name, value || 1, labels);
  }

  _timing(name, value, labels) {
    if (this.metrics?.timing) this.metrics.timing(name, value, labels);
  }
}

module.exports = PendientesTimer;
