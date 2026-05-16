/**
 * pizzepos/impresion v4.0.0 — Formateo ESC/POS + envio directo MQTT a ESP32 (POC2 rewrite).
 *
 * Sin capas intermedias: evento → formatear ESC/POS → MQTT impresion/<project>/print/<device> → ESP32 → impresora.
 *
 * Autodescubrimiento ESP32:
 *   subscribe impresion/+/status/+ + enki/+/status/+ — ESP32 publica su status periodicamente.
 *   subscribe impresion/+/printed/+                  — ACK de impresion con error_code firmware.
 *
 * Eventos del bus:
 *   subscribes (10): cocina.item_ticket, cuenta.{creada,eliminada,actualizada}, mesa.{abierta,renombrada,cerrada},
 *                    llevar.ticket_creado, caja.cerrada, dia.iniciado.
 *   publishes  (4):  impresion.{error, ticket_pieza_generado, comanda_generada, ticket_venta_generado}.
 *
 * 7 ui_handlers (auto-wired desde module.json.ui_handlers).
 */

'use strict';

const crypto = require('crypto');

const DEFAULT_PROJECT_ID = 'default';

// ==========================================
// ESC/POS constants (preservadas byte a byte del monolito)
// ==========================================
const ESC = '\x1B';
const GS  = '\x1D';
const CMD = {
  INIT:           `${ESC}@`,
  CODEPAGE_437:   `${ESC}t\x00`,
  BOLD_ON:        `${ESC}E\x01`,
  BOLD_OFF:       `${ESC}E\x00`,
  DOUBLE_ON:      `${GS}!\x11`,
  DOUBLE_OFF:     `${GS}!\x00`,
  WIDE_ON:        `${GS}!\x10`,
  WIDE_OFF:       `${GS}!\x00`,
  TALL_ON:        `${GS}!\x01`,
  TALL_OFF:       `${GS}!\x00`,
  ALIGN_CENTER:   `${ESC}a\x01`,
  ALIGN_LEFT:     `${ESC}a\x00`,
  ALIGN_RIGHT:    `${ESC}a\x02`,
  FONT_NORMAL:    `${ESC}M\x00`,
  FONT_SMALL:     `${ESC}M\x01`,
  CUT:            `${GS}V\x00`,
  PARTIAL_CUT:    `${GS}V\x01`,
  FEED_3:         `${ESC}d\x03`,
  FEED_5:         `${ESC}d\x05`,
  UNDERLINE_ON:   `${ESC}-\x01`,
  UNDERLINE_OFF:  `${ESC}-\x00`
};

const ANCHOS = { '58mm': 32, '80mm': 42 };

const CANAL_ICON = {
  mesa:      '*', telefono:  'T', llevar:    '>',
  glovo:     '*', whatsapp:  '*', uber_eats: '*',
  just_eat:  '.', default:   '*'
};

class ImpresionModule {
  constructor() {
    this.name    = 'impresion';
    this.version = '4.0.0';

    this.eventBus = null;
    this.logger   = null;
    this.metrics  = null;

    this.config = {
      ancho:           '58mm',
      destino_default: ''
    };

    this.lineWidth = ANCHOS['58mm'];
    this.separator = '';
    this.doubleSep = '';

    this.impresoras    = new Map();
    this.cuentaNombres = new Map();
    this.historial     = [];
    this.maxHistorial  = 100;

    this.internalMetrics = {
      comandas_generadas:      0,
      reimpresiones:           0,
      errores:                 0,
      impresoras_descubiertas: 0
    };

    this._onMqttMessage = null;
    this._ttlInterval   = null;
    this._ttlMs         = 90000;
    this._pendingJobs   = new Map();
    this._jobTimeoutMs  = 15000;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.impresion) {
      this.config = { ...this.config, ...core.config.impresion };
    }

    this.lineWidth = ANCHOS[this.config.ancho] || 32;
    this.separator = '-'.repeat(this.lineWidth);
    this.doubleSep = '='.repeat(this.lineWidth);

    await this._iniciarAutoDescubrimiento();

    this.logger.info('module.loaded', {
      module:          this.name,
      version:         this.version,
      ancho:           this.config.ancho,
      chars:           this.lineWidth,
      destino_default: this.config.destino_default || '(auto-discovery)'
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this._detenerAutoDescubrimiento();
    this.impresoras.clear();
    this.cuentaNombres.clear();
    this.historial = [];
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Autodescubrimiento ESP32 via MQTT
  // ==========================================

  async _iniciarAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('impresion.autodiscovery.sin_mqtt');
      return;
    }

    this._onMqttMessage = this._handleStatusMessage.bind(this);
    mqtt.on('message', this._onMqttMessage);

    const topics = ['impresion/+/status/+', 'enki/+/status/+', 'impresion/+/printed/+'];
    try {
      for (const t of topics) await mqtt.subscribe(t);
      this.logger.info('impresion.autodiscovery.iniciado', { topics });
    } catch (err) {
      this.logger.error('impresion.autodiscovery.subscribe_error', { error: err.message });
      this.metrics?.increment('impresion.errors', { kind: 'mqtt_subscribe', code: 'UNKNOWN_ERROR' });
    }

    this._ttlInterval = setInterval(() => this._checkImpresorasTTL(), 30000);
  }

  _detenerAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onMqttMessage) {
      mqtt.removeListener('message', this._onMqttMessage);
      this._onMqttMessage = null;
    }
    if (this._ttlInterval) {
      clearInterval(this._ttlInterval);
      this._ttlInterval = null;
    }
    for (const [, job] of this._pendingJobs) clearTimeout(job.timer);
    this._pendingJobs.clear();
  }

  _handleStatusMessage(topic, payload) {
    // ACK de impresion
    const ackMatch = topic.match(/^impresion\/([^/]+)\/printed\/([^/]+)$/);
    if (ackMatch) {
      this._handlePrintAck(topic, payload);
      return;
    }

    const match = topic.match(/^(?:impresion|enki)\/([^/]+)\/status\/([^/]+)$/);
    if (!match) return;

    const [, projectId, deviceId] = match;
    const data = this._parsePayload(payload, 'autodiscovery');
    if (!data) return;

    const esNueva = !this.impresoras.has(deviceId);

    this.impresoras.set(deviceId, {
      device_id:     deviceId,
      project_id:    projectId,
      online:        data.online !== false,
      printer_ready: data.printer_ready || false,
      printer_name:  data.printer_name  || null,
      printer_addr:  data.printer_addr  || null,
      ancho:         data.ancho || this.config.ancho || '58mm',
      wifi_rssi:     data.wifi_rssi || null,
      wifi_ssid:     data.wifi_ssid || null,
      ip:            data.ip || null,
      uptime_sec:    data.uptime_sec || 0,
      print_count:   data.print_count || 0,
      error_count:   data.error_count || 0,
      free_heap:     data.free_heap || null,
      firmware:      data.firmware  || null,
      last_seen:     new Date().toISOString()
    });

    if (esNueva) {
      this.internalMetrics.impresoras_descubiertas++;
      this.metrics?.increment('impresion.impresoras.descubiertas');
      this.logger.info('impresion.impresora.descubierta', {
        device_id:     deviceId,
        project_id:    projectId,
        printer_name:  data.printer_name,
        printer_addr:  data.printer_addr,
        ip:            data.ip,
        printer_ready: data.printer_ready
      });
    }
  }

  _handlePrintAck(topic, payload) {
    const data = this._parsePayload(payload, 'print_ack');
    if (!data) return;

    const jobId = data.job_id;
    if (!jobId) return;

    const diagnostico = {
      job_id:           jobId,
      device_id:        data.device_id,
      success:          data.success,
      error_code:       data.error_code || null,
      error_detail:     this._mensajeError(data.error_code),
      attempts:         data.attempts || 1,
      bt_mode:          data.bt_mode || null,
      ble_connected:    data.ble_connected,
      free_heap:        data.free_heap || null,
      reconnect_count:  data.reconnect_count || null,
      timestamp:        new Date().toISOString()
    };

    const pending = this._pendingJobs.get(jobId);

    if (pending) {
      clearTimeout(pending.timer);
      this._pendingJobs.delete(jobId);

      if (data.success) {
        this.logger.info('impresion.ack_ok', {
          job_id: jobId, device: pending.deviceId,
          attempts: diagnostico.attempts,
          latency_ms: Date.now() - pending.timestamp
        });
        pending.resolve({ success: true, job_id: jobId, attempts: diagnostico.attempts });
      } else {
        this.logger.warn('impresion.ack_error', diagnostico);
        pending.resolve({ success: false, job_id: jobId, ...diagnostico });
      }
    } else if (!data.success) {
      this.logger.warn('impresion.ack_error_huerfano', diagnostico);
    } else {
      this.logger.info('impresion.ack_recibido', { job_id: jobId, success: data.success, device: data.device_id });
    }

    if (!data.success) {
      this._publicarEvento('impresion.error', {
        ...diagnostico,
        error: diagnostico.error_detail
      });
      this.metrics?.increment('impresion.error.total', { code: diagnostico.error_code || 'unknown' });
    }
  }

  _mensajeError(code) {
    const mensajes = {
      no_mac:                  'Impresora sin configurar (no hay MAC)',
      init_failed:             'Error iniciando Bluetooth',
      connect_failed:          'No se pudo conectar a la impresora',
      write_failed:            'Error escribiendo en la impresora (¿sin papel?)',
      disconnected_mid_send:   'Impresora desconectada durante el envio',
      missing_data:            'Job sin campo data (payload vacio)',
      payload_too_large:       'Payload demasiado grande para el buffer',
      base64_error:            'Error decodificando base64',
      queue_full:              'Cola de impresion llena (intentar de nuevo)'
    };
    return mensajes[code] || `Error desconocido (${code || 'sin codigo'})`;
  }

  _checkImpresorasTTL() {
    const now = Date.now();
    for (const [deviceId, imp] of this.impresoras) {
      if (!imp.online) continue;
      const lastSeen = new Date(imp.last_seen).getTime();
      if (now - lastSeen > this._ttlMs) {
        imp.online = false;
        imp.printer_ready = false;
        this.logger.warn('impresion.impresora.ttl_expirado', {
          device_id: deviceId, last_seen: imp.last_seen, ttl_ms: this._ttlMs
        });
      }
    }
  }

  // ==========================================
  // Bus handlers — cache de ref_display
  // ==========================================

  async onCuentaCreada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, ref_display } = data;
    if (cuenta_id && ref_display) {
      this.cuentaNombres.set(cuenta_id, { ref: ref_display });
      this.logger.info('impresion.ref_display.cached', { cuenta_id, ref_display });
    }
  }

  async onMesaAbierta(event) {
    const data = this._unwrap(event);
    const { cuenta_id, nombre } = data;
    if (cuenta_id && nombre && !this.cuentaNombres.has(cuenta_id)) {
      this.cuentaNombres.set(cuenta_id, { ref: nombre });
      this.logger.info('impresion.cuenta_nombre.cached', { cuenta_id, nombre });
    }
  }

  async onMesaRenombrada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, nombre } = data;
    if (cuenta_id && nombre) {
      this.cuentaNombres.set(cuenta_id, { ref: nombre });
      this.logger.info('impresion.cuenta_nombre.updated', { cuenta_id, nombre });
    }
  }

  async onMesaCerrada(event) {
    const data = this._unwrap(event);
    const { cuenta_id } = data;
    if (cuenta_id) this.cuentaNombres.delete(cuenta_id);
  }

  async onLlevarTicketCreado(event) {
    const data = this._unwrap(event);
    const { cuenta_id, numero_ticket, cliente_nombre } = data;
    if (cuenta_id && numero_ticket != null && !this.cuentaNombres.has(cuenta_id)) {
      const esNombreReal = cliente_nombre && !/^Cliente\s+\d+$/i.test(cliente_nombre);
      const ref = esNombreReal ? cliente_nombre : `LLEVAR ${numero_ticket}`;
      this.cuentaNombres.set(cuenta_id, { ref });
      this.logger.info('impresion.cuenta_nombre.cached', { cuenta_id, ref });
    }
  }

  async onCuentaActualizada(event) {
    const data = this._unwrap(event);
    const { cuenta_id, cambios } = data;
    if (!cuenta_id) return;
    const newRef = cambios?.ref_display || cambios?.nombre || null;
    if (newRef) {
      const existing = this.cuentaNombres.get(cuenta_id);
      this.cuentaNombres.set(cuenta_id, { ...existing, ref: newRef });
      this.logger.info('impresion.ref_display.updated', { cuenta_id, ref: newRef });
    }
  }

  async onCuentaEliminada(event) {
    const data = this._unwrap(event);
    const { cuenta_id } = data;
    if (cuenta_id) this.cuentaNombres.delete(cuenta_id);
  }

  async onCajaCerrada(event) {
    this.cuentaNombres.clear();
    this.historial = [];
    this.internalMetrics.comandas_generadas = 0;
    this.internalMetrics.reimpresiones      = 0;
    this.internalMetrics.errores            = 0;
    this.logger.info('impresion.reset.caja_cerrada', {
      correlation_id: event?.metadata?.correlationId || this._unwrap(event)?.correlation_id
    });
  }

  async onDiaIniciado(event) {
    this.cuentaNombres.clear();
    this.historial = [];
    this.logger.info('impresion.reset.dia_iniciado', {
      correlation_id: event?.metadata?.correlationId || this._unwrap(event)?.correlation_id
    });
  }

  // ==========================================
  // Bus handler — cocina.item_ticket → ticket pieza
  // ==========================================

  async onItemTicket(event) {
    const data = this._unwrap(event);
    const {
      pedido_id, cuenta_id, canal, ref_display,
      item_id, nombre, cantidad, categoria, estacion,
      ingredientes, variaciones, notas, impresora, project_id
    } = data;

    if (cuenta_id && ref_display) {
      this.cuentaNombres.set(cuenta_id, { ref: ref_display });
    }

    const destino = impresora?.destino || this.config.destino_default;
    this.logger.info('impresion.ticket_pieza.generando', { pedido_id, item_id, nombre, estacion, destino });

    try {
      const ticket = this.formatearTicketPieza({
        pedido_id, cuenta_id, canal, ref_display,
        nombre, cantidad, categoria, estacion,
        ingredientes, variaciones, notas
      });

      await this._enviarImpresora(ticket, destino, project_id);

      const registro = {
        comanda_id:   `tkt_${crypto.randomUUID().slice(0, 8)}`,
        tipo:         'ticket_pieza',
        pedido_id,
        cuenta_id,
        item_id,
        nombre,
        estacion,
        destino,
        generada_at:  new Date().toISOString()
      };

      this._guardarHistorial(registro);
      this.internalMetrics.comandas_generadas++;
      this.metrics?.increment('impresion.comanda.total', { tipo: 'ticket_pieza' });

      await this._publicarEvento('impresion.ticket_pieza_generado', registro, data);

      this.logger.info('impresion.ticket_pieza.enviado', { pedido_id, item_id, nombre, estacion, destino });
    } catch (err) {
      this.internalMetrics.errores++;
      this.metrics?.increment('impresion.errors', { kind: 'ticket_pieza', code: 'UNKNOWN_ERROR' });
      this.logger.error('impresion.ticket_pieza.error', { pedido_id, item_id, error: err.message });
    }
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json)
  // ==========================================

  async handleImprimirComanda(data) {
    try {
      const { cuenta_id, pedido_id, items, canal, notas_generales, destino, project_id } = data || {};

      if (!cuenta_id && !pedido_id) {
        this._logError('impresion.ui.ticket.validation_failed', { missing: 'cuenta_id|pedido_id' }, 'ui_ticket', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'cuenta_id o pedido_id es requerido', { fields: ['cuenta_id', 'pedido_id'] });
      }
      if (!items || items.length === 0) {
        this._logError('impresion.ui.ticket.validation_failed', { missing: 'items' }, 'ui_ticket', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'items es requerido y no vacio', { field: 'items' });
      }

      const comanda = this.formatearComanda({
        pedido_id: pedido_id || cuenta_id,
        cuenta_id, canal, items, notas_generales, reimpresion: true
      });
      await this._enviarImpresora(comanda, destino, project_id);

      const registro = {
        comanda_id:   `cmd_${crypto.randomUUID().slice(0, 8)}`,
        pedido_id:    pedido_id || cuenta_id,
        cuenta_id,
        canal:        canal || null,
        items_count:  items.length,
        reimpresion:  true,
        destino:      destino || this.config.destino_default,
        generada_at:  new Date().toISOString()
      };

      this._guardarHistorial(registro);
      this.internalMetrics.reimpresiones++;
      this.metrics?.increment('impresion.reimpresion.total');

      await this._publicarEvento('impresion.comanda_generada', registro, data);

      return { status: 200, data: registro };
    } catch (err) {
      this.internalMetrics.errores++;
      return this._handleHandlerError('impresion.ui.ticket.failed', err, 'ui_ticket');
    }
  }

  async handleImprimirTicketVenta(data) {
    try {
      const { cuenta_id, items, total, metodo_pago, destino, project_id } = data || {};

      if (!cuenta_id) {
        this._logError('impresion.ui.ticket_venta.validation_failed', { missing: 'cuenta_id' }, 'ui_ticket_venta', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'cuenta_id es requerido', { field: 'cuenta_id' });
      }
      if (!items || items.length === 0) {
        this._logError('impresion.ui.ticket_venta.validation_failed', { missing: 'items' }, 'ui_ticket_venta', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'items es requerido y no vacio', { field: 'items' });
      }
      if (total === undefined || total === null) {
        this._logError('impresion.ui.ticket_venta.validation_failed', { missing: 'total' }, 'ui_ticket_venta', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'total es requerido', { field: 'total' });
      }

      const ticket = this.formatearTicketVenta(data);
      await this._enviarImpresora(ticket, destino, project_id);

      const registro = {
        comanda_id:   `vta_${crypto.randomUUID().slice(0, 8)}`,
        tipo:         'ticket_venta',
        cuenta_id,
        items_count:  items.length,
        total,
        metodo_pago:  metodo_pago || null,
        destino:      destino || this.config.destino_default,
        generada_at:  new Date().toISOString()
      };

      this._guardarHistorial(registro);
      this.internalMetrics.comandas_generadas++;
      this.metrics?.increment('impresion.comanda.total', { tipo: 'ticket_venta' });

      await this._publicarEvento('impresion.ticket_venta_generado', registro, data);

      return { status: 200, data: registro };
    } catch (err) {
      this.internalMetrics.errores++;
      return this._handleHandlerError('impresion.ui.ticket_venta.failed', err, 'ui_ticket_venta');
    }
  }

  async handleGetEstado() {
    try {
      const impresorasOnline = Array.from(this.impresoras.values()).filter(i => i.online);
      return {
        status: 200,
        data: {
          modulo:                  { name: this.name, version: this.version },
          impresora:               { ancho: this.config.ancho, chars_linea: this.lineWidth },
          destino_default:         this.config.destino_default || '(auto-discovery)',
          impresoras_descubiertas: this.impresoras.size,
          impresoras_online:       impresorasOnline.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('impresion.ui.estado.failed', err, 'ui_estado');
    }
  }

  async handleGetHistorial(data) {
    try {
      const limit = parseInt(data?.limit) || 20;
      return {
        status: 200,
        data: { comandas: this.historial.slice(0, limit), total: this.historial.length }
      };
    } catch (err) {
      return this._handleHandlerError('impresion.ui.historial.failed', err, 'ui_historial');
    }
  }

  async handleHealthCheck() {
    try {
      const impresorasOnline = Array.from(this.impresoras.values()).filter(i => i.online && i.printer_ready);
      return {
        status: 200,
        data: {
          status:            impresorasOnline.length > 0 ? 'healthy' : 'degraded',
          module:            this.name,
          version:           this.version,
          destino_default:   this.config.destino_default,
          impresoras_listas: impresorasOnline.length,
          impresoras_total:  this.impresoras.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('impresion.ui.health.failed', err, 'ui_health');
    }
  }

  async handleGetMetrics() {
    try {
      return {
        status: 200,
        data: {
          ...this.internalMetrics,
          historial_size:          this.historial.length,
          impresoras_descubiertas: this.impresoras.size
        }
      };
    } catch (err) {
      return this._handleHandlerError('impresion.ui.metrics.failed', err, 'ui_metrics');
    }
  }

  async handleListarImpresoras() {
    try {
      const impresoras = Array.from(this.impresoras.values()).map(imp => ({
        device_id:      imp.device_id,
        project_id:     imp.project_id,
        online:         imp.online,
        printer_ready:  imp.printer_ready,
        printer_name:   imp.printer_name,
        printer_addr:   imp.printer_addr,
        ancho:          imp.ancho,
        ip:             imp.ip,
        wifi_rssi:      imp.wifi_rssi,
        uptime_sec:     imp.uptime_sec,
        print_count:    imp.print_count,
        last_seen:      imp.last_seen
      }));
      return {
        status: 200,
        data: {
          impresoras,
          total:           impresoras.length,
          destino_default: this.config.destino_default
        }
      };
    } catch (err) {
      return this._handleHandlerError('impresion.ui.impresoras.failed', err, 'ui_impresoras');
    }
  }

  // ==========================================
  // ESC/POS Formatters (preservados byte a byte)
  // ==========================================

  formatearComanda({ pedido_id, cuenta_id, canal, items, notas_generales, reimpresion }) {
    const lineas = [];
    const w = this.lineWidth;

    lineas.push(CMD.INIT, CMD.CODEPAGE_437);

    const { ref: refCuenta, detalle: detalleCuenta } = this.extraerRefCuenta(cuenta_id, canal);

    lineas.push(CMD.ALIGN_CENTER, CMD.DOUBLE_ON, CMD.BOLD_ON);
    if (reimpresion) lineas.push('REIMP');
    lineas.push(refCuenta || `#${pedido_id || '-'}`);
    lineas.push(CMD.BOLD_OFF, CMD.DOUBLE_OFF);
    if (detalleCuenta) lineas.push(CMD.BOLD_ON + detalleCuenta + CMD.BOLD_OFF);

    lineas.push(CMD.FONT_NORMAL);
    const ahora = new Date();
    const hora  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-ES', { day:  '2-digit', month:  '2-digit' });
    lineas.push(`${hora}  ${fecha}`);

    lineas.push(CMD.ALIGN_LEFT);
    for (const item of items) {
      this.formatearItem(lineas, item);
      lineas.push(this._separadorLigero(w));
    }

    if (notas_generales) {
      lineas.push(CMD.BOLD_ON, `${'>'} NOTAS:`, CMD.BOLD_OFF, this.truncar(notas_generales), this._separadorLigero(w));
    }

    lineas.push(CMD.ALIGN_CENTER, CMD.FONT_SMALL, `${'.'} ${items.length} item(s) ${'.'}`, CMD.FONT_NORMAL);
    lineas.push(CMD.FEED_5, CMD.PARTIAL_CUT);
    return lineas.join('\n');
  }

  formatearItem(lineas, item) {
    const qty = item.cantidad > 1 ? `${item.cantidad}x ` : '';

    lineas.push(CMD.BOLD_ON, CMD.TALL_ON, this.truncar(`${qty}${item.nombre}`), CMD.TALL_OFF, CMD.BOLD_OFF);

    if (item.tipo === 'mitad-mitad' || item.pizza_izquierda || item.pizza_derecha) {
      if (item.pizza_izquierda) lineas.push(this.truncar(` ${'>'} IZQ: ${item.pizza_izquierda}`));
      if (item.pizza_derecha)   lineas.push(this.truncar(` ${'>'} DER: ${item.pizza_derecha}`));
    }

    if (item.ingredientes?.length > 0) {
      for (const ing of item.ingredientes) {
        const nombre = typeof ing === 'string' ? ing : ing.nombre || String(ing);
        lineas.push(this.truncar(` ${'.'} ${nombre}`));
      }
    }

    if (item.variaciones && Object.keys(item.variaciones).length > 0) {
      const v = item.variaciones;

      if (v.ingredientes_quitar?.length > 0) {
        lineas.push(CMD.BOLD_ON, CMD.TALL_ON);
        for (const ing of v.ingredientes_quitar) lineas.push(this.truncar(` SIN ${ing.toUpperCase()}`));
        lineas.push(CMD.TALL_OFF, CMD.BOLD_OFF);
      }

      if (v.ingredientes_anadir?.length > 0) {
        lineas.push(CMD.BOLD_ON);
        for (const ing of v.ingredientes_anadir) {
          const nombre = typeof ing === 'string' ? ing : ing.nombre || String(ing);
          lineas.push(this.truncar(` + CON ${nombre}`));
        }
        lineas.push(CMD.BOLD_OFF);
      }

      for (const [key, val] of Object.entries(v)) {
        if (key === 'ingredientes_quitar' || key === 'ingredientes_anadir') continue;
        if (val === true) {
          lineas.push(CMD.BOLD_ON, ` ${'*'} ${key.toUpperCase()}`, CMD.BOLD_OFF);
        } else if (val && val !== false) {
          lineas.push(this.truncar(` ${'*'} ${key}: ${val}`));
        }
      }
    }

    if (item.notas) {
      lineas.push(CMD.UNDERLINE_ON, this.truncar(` ${'>'} ${item.notas}`), CMD.UNDERLINE_OFF);
    }
  }

  formatearTicketPieza({ pedido_id, cuenta_id, canal, ref_display,
                         nombre, cantidad, categoria, estacion,
                         ingredientes, variaciones, notas }) {
    const lineas = [];
    lineas.push(CMD.INIT + CMD.CODEPAGE_437);
    lineas.push(CMD.FEED_3);

    let refCuenta, detalleCuenta;
    if (ref_display) {
      refCuenta     = ref_display.toUpperCase();
      detalleCuenta = null;
    } else {
      ({ ref: refCuenta, detalle: detalleCuenta } = this.extraerRefCuenta(cuenta_id, canal));
    }
    const ref = refCuenta || `#${pedido_id || '-'}`;
    lineas.push(CMD.ALIGN_CENTER + CMD.DOUBLE_ON + CMD.BOLD_ON + ref + CMD.BOLD_OFF + CMD.DOUBLE_OFF);
    if (detalleCuenta) lineas.push(CMD.ALIGN_CENTER + CMD.BOLD_ON + detalleCuenta + CMD.BOLD_OFF);

    // Espacio entre pedido y producto (~2cm)
    lineas.push(`${ESC}d\x04`);

    const prod = cantidad > 1 ? this.truncar(`${cantidad}x ${nombre}`) : this.truncar(nombre);
    lineas.push(CMD.DOUBLE_ON + CMD.BOLD_ON + prod + CMD.BOLD_OFF + CMD.DOUBLE_OFF);

    if (variaciones && Object.keys(variaciones).length > 0) {
      const v = variaciones;

      if (v.ingredientes_quitar?.length > 0) {
        for (const ing of v.ingredientes_quitar) {
          lineas.push(CMD.BOLD_ON + CMD.TALL_ON + this.truncar(` SIN ${ing.toUpperCase()}`) + CMD.TALL_OFF + CMD.BOLD_OFF);
        }
      }

      if (v.ingredientes_anadir?.length > 0) {
        for (const ing of v.ingredientes_anadir) {
          const ingNombre = typeof ing === 'string' ? ing : ing.nombre || String(ing);
          lineas.push(CMD.BOLD_ON + this.truncar(` + CON ${ingNombre}`) + CMD.BOLD_OFF);
        }
      }

      for (const [key, val] of Object.entries(v)) {
        if (key === 'ingredientes_quitar' || key === 'ingredientes_anadir') continue;
        if (val === true) {
          lineas.push(CMD.BOLD_ON + ` * ${key.toUpperCase()}` + CMD.BOLD_OFF);
        } else if (val && val !== false) {
          lineas.push(this.truncar(` * ${key}: ${val}`));
        }
      }
    }

    if (notas) {
      lineas.push(CMD.UNDERLINE_ON + this.truncar(` > ${notas}`) + CMD.UNDERLINE_OFF);
    }

    lineas.push(CMD.FEED_5 + CMD.PARTIAL_CUT);
    return lineas.join('\n');
  }

  formatearTicketVenta({ cuenta_id, canal, items, subtotal, iva, total, metodo_pago, propina, referencia_pago }) {
    const lineas = [];
    const w = this.lineWidth;

    lineas.push(CMD.INIT + CMD.CODEPAGE_437);
    lineas.push(CMD.ALIGN_CENTER);

    // Logo y datos del negocio (preservados byte a byte)
    lineas.push(CMD.DOUBLE_ON + CMD.BOLD_ON + 'NO NI NA' + CMD.BOLD_OFF + CMD.DOUBLE_OFF);
    lineas.push('pizzicas  |  643283034');
    lineas.push(this.separator);

    lineas.push(CMD.ALIGN_LEFT);
    const { ref: refCuenta, detalle: detalleCuenta } = this.extraerRefCuenta(cuenta_id, canal);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    if (refCuenta) {
      lineas.push(CMD.BOLD_ON + refCuenta + (detalleCuenta ? `  ${detalleCuenta}` : '') + CMD.BOLD_OFF);
    }
    lineas.push(`${fecha} ${hora}`);
    lineas.push(this.separator);

    lineas.push(CMD.BOLD_ON + this.lineaColumnas('PRODUCTO', 'EUR', w) + CMD.BOLD_OFF);

    for (const item of items) {
      const qty    = item.cantidad > 1 ? `${item.cantidad}x ` : '';
      const nombre = `${qty}${item.nombre}`;
      const precio = this.formatPrecio(item.precio_total ?? (item.precio_unitario * item.cantidad));
      lineas.push(this.lineaColumnas(nombre, precio, w));

      if (item.cantidad > 1 && item.precio_unitario) {
        lineas.push(CMD.FONT_SMALL);
        lineas.push(`  ${item.precio_unitario.toFixed(2)} x ${item.cantidad}`);
        lineas.push(CMD.FONT_NORMAL);
      }
    }

    lineas.push(this.separator);

    if (subtotal !== undefined && subtotal !== null) {
      lineas.push(this.lineaColumnas('Subtotal', this.formatPrecio(subtotal), w));
    }
    if (iva !== undefined && iva !== null) {
      const ivaLabel   = typeof iva === 'object' ? `IVA ${iva.porcentaje || ''}%` : 'IVA';
      const ivaImporte = typeof iva === 'object' ? iva.importe : iva;
      lineas.push(this.lineaColumnas(ivaLabel, this.formatPrecio(ivaImporte), w));
    }
    if (propina && propina > 0) {
      lineas.push(this.lineaColumnas('Propina', this.formatPrecio(propina), w));
    }

    lineas.push(this.separator);
    lineas.push(CMD.DOUBLE_ON + CMD.BOLD_ON + this.lineaColumnas('TOTAL', this.formatPrecio(total), w) + CMD.BOLD_OFF + CMD.DOUBLE_OFF);

    if (metodo_pago) {
      const metodos = {
        efectivo: 'EFECTIVO', tarjeta: 'TARJETA', bizum: 'BIZUM',
        transferencia: 'TRANSFERENCIA', mixto: 'PAGO MIXTO',
        link_pago: 'LINK DE PAGO', qr: 'QR'
      };
      lineas.push(`Pago: ${metodos[metodo_pago] || metodo_pago.toUpperCase()}` +
        (referencia_pago ? `  Ref: ${referencia_pago}` : ''));
    }

    lineas.push('');
    lineas.push(CMD.ALIGN_CENTER + CMD.FONT_SMALL);
    lineas.push('SABOR EN CLAVE DE SOL S.COOP');
    lineas.push('CIF: F24747164');
    lineas.push('C/ Narciso Yepes, 12 - 30840 Alhama');
    lineas.push('Gracias por su visita' + CMD.FONT_NORMAL);

    lineas.push(CMD.FEED_3 + CMD.PARTIAL_CUT);
    return lineas.join('\n');
  }

  formatPrecio(valor) {
    if (valor === undefined || valor === null) return '0.00';
    return Number(valor).toFixed(2);
  }

  lineaColumnas(izq, der, ancho) {
    const espacio = ancho - izq.length - der.length;
    if (espacio < 1) {
      return `${this.truncar(izq)}\n${' '.repeat(ancho - der.length)}${der}`;
    }
    return `${izq}${' '.repeat(espacio)}${der}`;
  }

  /**
   * Devuelve { ref, detalle? } para imprimir en ticket. Cache + fallback legacy.
   */
  extraerRefCuenta(cuenta_id, canal) {
    if (!cuenta_id) return { ref: null };

    const cached = this.cuentaNombres.get(cuenta_id);
    if (cached) {
      return { ref: cached.ref.toUpperCase(), detalle: cached.detalle || null };
    }

    const prefijosLegacy = {
      mesa: 'MESA', tel: 'TEL', telefono: 'TEL', llevar: 'LLEVAR',
      glovo: 'GLOVO', wa: 'WHATSAPP', whatsapp: 'WHATSAPP',
      delivery: 'DELIVERY', llevadoo: 'LLEVADOO'
    };

    for (const [prefijo, label] of Object.entries(prefijosLegacy)) {
      if (cuenta_id.startsWith(`${prefijo}_`)) {
        const rest = cuenta_id.slice(prefijo.length + 1);
        const id   = rest.replace(/_?\d{8}_\d+$/, '');
        if (id) return { ref: `${label} ${id}` };
        const seqMatch = rest.match(/_(\d+)$/);
        const seq = seqMatch ? parseInt(seqMatch[1], 10) : rest;
        return { ref: `${label} ${seq}` };
      }
    }

    if (canal && prefijosLegacy[canal]) {
      return { ref: `${prefijosLegacy[canal]} - ${cuenta_id}` };
    }
    return { ref: `REF: ${cuenta_id}` };
  }

  // ==========================================
  // Envio MQTT directo a ESP32
  // ==========================================

  async _enviarImpresora(contenido, destino, projectId) {
    let deviceId = destino || this.config.destino_default;
    let pid      = projectId || '';

    if (!deviceId || !pid) {
      const candidata = Array.from(this.impresoras.values()).find(i => i.online && i.printer_ready);
      if (candidata) {
        deviceId = deviceId || candidata.device_id;
        pid      = pid || candidata.project_id;
        this.logger.info('impresion.auto_destino', { device_id: deviceId, project_id: pid });
      }
    }

    if (!deviceId) {
      const err = new Error('No hay destino configurado ni impresoras descubiertas online');
      err._code = 'DEPENDENCY_UNAVAILABLE';
      throw err;
    }
    if (!pid) {
      const err = new Error('No hay project_id configurado ni inferible de impresoras descubiertas');
      err._code = 'DEPENDENCY_UNAVAILABLE';
      throw err;
    }

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      const err = new Error('MQTT no disponible — no se puede enviar a impresora');
      err._code = 'MQTT_NOT_AVAILABLE';
      throw err;
    }

    const topic   = `impresion/${pid}/print/${deviceId}`;
    const buffer  = Buffer.from(contenido, 'binary');
    const jobId   = `job_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
    const payload = JSON.stringify({ job_id: jobId, data: buffer.toString('base64') });

    const ackPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pendingJobs.delete(jobId);
        this.logger.warn('impresion.ack_timeout', {
          job_id: jobId, device_id: deviceId, timeout_ms: this._jobTimeoutMs
        });
        resolve({ success: false, job_id: jobId, error: 'ACK timeout' });
      }, this._jobTimeoutMs);
      this._pendingJobs.set(jobId, { resolve, timer, deviceId, timestamp: Date.now() });
    });

    await mqtt.publish(topic, payload, { qos: 1 });

    this.logger.info('impresion.enviado', {
      topic, job_id: jobId, device_id: deviceId, bytes: buffer.length
    });

    // ACK en background — no bloquea para no serializar envios paralelos
    ackPromise.then(result => {
      if (!result.success) {
        this.logger.warn('impresion.job_fallido', {
          job_id: jobId, device_id: deviceId, error: result.error
        });
        this.internalMetrics.errores++;
        this.metrics?.increment('impresion.error.total', { code: 'job_fallido' });
      }
    });

    return { job_id: jobId, device_id: deviceId, sent: true };
  }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'DEPENDENCY_UNAVAILABLE'  ? 503 :
                   code === 'MQTT_NOT_AVAILABLE'      ? 503 :
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('impresion.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrad'))                         return 'RESOURCE_NOT_FOUND';
    if (msg.includes('permission') || msg.includes('forbidden'))                            return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation'))  return 'INVALID_INPUT';
    if (msg.includes('mqtt') || msg.includes('no disponible'))                              return 'DEPENDENCY_UNAVAILABLE';
    if (msg.includes('timeout'))                                                            return 'TIMEOUT';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    if (!this.eventBus?.publish) return;
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      timestamp:      new Date().toISOString(),
      ...payload,
      project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID
    };
    try {
      await this.eventBus.publish(name, enriched);
    } catch (err) {
      this.logger.error('impresion.publish_error', { event: name, error: err.message });
      this.metrics?.increment('impresion.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar: parser MQTT (mismo patron que device-registry/perifericos)
  _parsePayload(payload, source = '') {
    try {
      if (typeof payload === 'string')   return JSON.parse(payload);
      if (Buffer.isBuffer(payload))      return JSON.parse(payload.toString());
      return payload;
    } catch {
      this.logger.warn('impresion.mqtt.parse_error', { source });
      this.metrics?.increment('impresion.errors', { kind: 'mqtt_parse', code: 'INVALID_INPUT' });
      return null;
    }
  }

  // 6o helper: trunca a lineWidth (preservado del monolito)
  truncar(texto) {
    return texto.length > this.lineWidth
      ? texto.slice(0, this.lineWidth - 1) + '\xC4'
      : texto;
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('impresion.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }

  // ==========================================
  // Internals
  // ==========================================

  _separadorLigero(ancho) { return '-'.repeat(ancho); }

  _detectarCanal(cuenta_id, canal) {
    if (canal && CANAL_ICON[canal]) return canal;
    if (!cuenta_id) return 'default';
    const prefijos = ['mesa', 'telefono', 'llevar', 'glovo', 'whatsapp', 'uber_eats', 'just_eat'];
    for (const p of prefijos) if (cuenta_id.startsWith(`${p}_`)) return p;
    return 'default';
  }

  _guardarHistorial(registro) {
    this.historial.unshift(registro);
    if (this.historial.length > this.maxHistorial) this.historial.pop();
  }
}

module.exports = ImpresionModule;
