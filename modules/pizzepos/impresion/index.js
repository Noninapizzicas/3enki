/**
 * Módulo Impresión v3.0
 *
 * Formatea ESC/POS y envía directamente a impresoras ESP32 via MQTT.
 * Los ESP32 son nodos de primera clase que se autodescubren y se registran
 * publicando su status en impresion/{project}/status/{device}.
 *
 * Flujo directo (2 hops):
 *   evento → formatear ESC/POS → MQTT impresion/{project}/print/{device} → ESP32 → impresora
 *
 * Sin capas intermedias: no perifericos, no provider, no transport.
 * El ESP32 habla MQTT nativo — publicamos directo a su topic.
 *
 * Autodescubrimiento:
 *   Los ESP32 publican su status periodicamente. Este módulo escucha esos
 *   mensajes y mantiene un registro vivo de impresoras disponibles con sus
 *   capacidades (ancho, mac, estado BLE, etc).
 */

const crypto = require('crypto');

// ==========================================
// ESC/POS constants
// ==========================================
const ESC = '\x1B';
const GS  = '\x1D';
const CMD = {
  INIT:           `${ESC}@`,
  CODEPAGE_437:   `${ESC}t\x00`,       // Code Page 437 (US)
  BOLD_ON:        `${ESC}E\x01`,
  BOLD_OFF:       `${ESC}E\x00`,
  DOUBLE_ON:      `${GS}!\x11`,       // doble ancho + alto
  DOUBLE_OFF:     `${GS}!\x00`,
  WIDE_ON:        `${GS}!\x10`,       // solo doble ancho
  WIDE_OFF:       `${GS}!\x00`,
  TALL_ON:        `${GS}!\x01`,       // solo doble alto
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

// ==========================================
// Code Page 437 graphic characters
// ==========================================
const CP437 = {
  // Box drawing
  TOP_LEFT:     '\xC9',  // ╔
  TOP_RIGHT:    '\xBB',  // ╗
  BOT_LEFT:     '\xC8',  // ╚
  BOT_RIGHT:    '\xBC',  // ╝
  HORIZ:        '\xCD',  // ═
  VERT:         '\xBA',  // ║
  LIGHT_HORIZ:  '\xC4',  // ─
  // Symbols
  DIAMOND:      '\x04',  // ♦
  BULLET:       '\x07',  // •
  ARROW_R:      '\x10',  // ►
  SQUARE:       '\xFE',  // ■
  BLOCK:        '\xDB',  // █
  SHADE_LIGHT:  '\xB0',  // ░
  SHADE_MED:    '\xB1',  // ▒
  TRIANGLE_R:   '\x10',  // ►
  STAR:         '\x0F',  // ☼
  PHONE:        '\x15',  // §
  DOT:          '\xF9',  // ∙
};

// Icono CP437 por canal — discreto pero reconocible
const CANAL_ICON = {
  mesa:      '*',    // ♦ MESA
  telefono:  'T',      // § TEL
  llevar:    '>',    // ► LLEVAR
  glovo:     '*',       // ☼ GLOVO
  whatsapp:  '*',     // • WHATSAPP
  uber_eats: '*',     // ■ UBER
  just_eat:  '.',        // ∙ JUST EAT
  default:   '*'      // ■
};

// Anchos por tipo de impresora
const ANCHOS = {
  '58mm': 32,
  '80mm': 42
};

class ImpresionModule {
  constructor() {
    this.name = 'impresion';
    this.version = '3.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Config
    this.config = {
      ancho: '58mm',
      destino_default: ''   // vacío = usar primera impresora descubierta online
    };

    // Ancho de línea calculado
    this.lineWidth = ANCHOS['58mm'];
    this.separator = '';
    this.doubleSep = '';

    // Impresoras descubiertas via MQTT status
    // Map: device_id → { device_id, project_id, online, printer_ready, printer_name,
    //                     printer_addr, ancho, wifi_rssi, ip, uptime_sec, last_seen }
    this.impresoras = new Map();

    // Historial de comandas (últimas 100)
    this.historial = [];
    this.maxHistorial = 100;

    // Métricas internas
    this.internalMetrics = {
      comandas_generadas: 0,
      reimpresiones: 0,
      errores: 0,
      impresoras_descubiertas: 0
    };

    // Referencia al listener MQTT para cleanup
    this._onMqttMessage = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    // Merge config del módulo si existe
    if (core.config?.impresion) {
      this.config = { ...this.config, ...core.config.impresion };
    }

    // Calcular ancho de línea
    this.lineWidth = ANCHOS[this.config.ancho] || 32;
    this.separator = '-'.repeat(this.lineWidth);
    this.doubleSep = '='.repeat(this.lineWidth);

    // Iniciar autodescubrimiento de impresoras ESP32
    await this._iniciarAutoDescubrimiento();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      ancho: this.config.ancho,
      chars: this.lineWidth,
      destino_default: this.config.destino_default || '(auto-discovery)'
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this._detenerAutoDescubrimiento();
    this.impresoras.clear();
    this.historial = [];
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Autodescubrimiento de impresoras ESP32
  // ==========================================

  /**
   * Escucha impresion/+/status/+ para descubrir ESP32 que se anuncian.
   * El ESP32 publica periódicamente su status con toda su info:
   *   { device_id, project_id, online, printer_ready, printer_name,
   *     printer_addr, wifi_rssi, wifi_ssid, ip, uptime_sec, print_count, ... }
   */
  async _iniciarAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('impresion.autodiscovery.sin_mqtt', {
        nota: 'MQTT no disponible — autodescubrimiento deshabilitado'
      });
      return;
    }

    this._onMqttMessage = this._handleStatusMessage.bind(this);
    mqtt.on('message', this._onMqttMessage);

    try {
      await mqtt.subscribe('impresion/+/status/+');
      await mqtt.subscribe('enki/+/status/+');
      this.logger.info('impresion.autodiscovery.iniciado', {
        topics: ['impresion/+/status/+', 'enki/+/status/+']
      });
    } catch (err) {
      this.logger.warn('impresion.autodiscovery.subscribe_error', {
        error: err.message
      });
    }
  }

  _detenerAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onMqttMessage) {
      mqtt.removeListener('message', this._onMqttMessage);
      this._onMqttMessage = null;
    }
  }

  /**
   * Procesa mensajes de status de ESP32.
   * Topics: impresion/{projectId}/status/{deviceId}
   *         enki/{projectId}/status/{deviceId}
   */
  _handleStatusMessage(topic, payload) {
    const match = topic.match(/^(?:impresion|enki)\/([^/]+)\/status\/([^/]+)$/);
    if (!match) return;

    const [, projectId, deviceId] = match;

    let data;
    try {
      data = typeof payload === 'string' ? JSON.parse(payload)
           : Buffer.isBuffer(payload) ? JSON.parse(payload.toString())
           : payload;
    } catch {
      return;
    }

    const esNueva = !this.impresoras.has(deviceId);

    this.impresoras.set(deviceId, {
      device_id: deviceId,
      project_id: projectId,
      online: data.online !== false,
      printer_ready: data.printer_ready || false,
      printer_name: data.printer_name || null,
      printer_addr: data.printer_addr || null,
      ancho: data.ancho || null,
      wifi_rssi: data.wifi_rssi || null,
      wifi_ssid: data.wifi_ssid || null,
      ip: data.ip || null,
      uptime_sec: data.uptime_sec || 0,
      print_count: data.print_count || 0,
      error_count: data.error_count || 0,
      free_heap: data.free_heap || null,
      firmware: data.firmware || null,
      last_seen: new Date().toISOString()
    });

    if (esNueva) {
      this.internalMetrics.impresoras_descubiertas++;
      this.logger.info('impresion.impresora.descubierta', {
        device_id: deviceId,
        project_id: projectId,
        printer_name: data.printer_name,
        printer_addr: data.printer_addr,
        ip: data.ip,
        printer_ready: data.printer_ready
      });
    }
  }

  // ==========================================
  // Event Handler: cocina.item_ticket
  // ==========================================

  async onItemTicket(event) {
    const data = event?.data || event?.payload || event;
    const { pedido_id, cuenta_id, canal, item_id, nombre, cantidad, categoria, estacion,
            ingredientes, variaciones, notas, impresora, project_id } = data;

    const destino = impresora?.destino || this.config.destino_default;

    this.logger.info('impresion.ticket_pieza.generando', {
      pedido_id, item_id, nombre, estacion, destino
    });

    try {
      const ticket = this.formatearTicketPieza({
        pedido_id, cuenta_id, canal, nombre, cantidad, categoria, estacion,
        ingredientes, variaciones, notas
      });

      await this.enviarImpresora(ticket, destino, project_id);

      const registro = {
        comanda_id: `tkt_${crypto.randomUUID().slice(0, 8)}`,
        tipo: 'ticket_pieza',
        pedido_id,
        cuenta_id,
        item_id,
        nombre,
        estacion,
        destino,
        generada_at: new Date().toISOString()
      };

      this.guardarHistorial(registro);
      this.internalMetrics.comandas_generadas++;

      await this.eventBus.publish('impresion.ticket_pieza_generado', registro);

      this.logger.info('impresion.ticket_pieza.enviado', {
        pedido_id, item_id, nombre, estacion, destino
      });
    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('impresion.ticket_pieza.error', {
        pedido_id, item_id, error: error.message
      });
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  /**
   * POST /modules/impresion/ticket
   * Reimprimir comanda manualmente
   */
  async handleImprimirComanda(data) {
    const { cuenta_id, pedido_id, items, canal, notas_generales, destino, project_id } = data;

    if (!cuenta_id && !pedido_id) {
      return { status: 400, error: 'Se requiere cuenta_id o pedido_id' };
    }
    if (!items || items.length === 0) {
      return { status: 400, error: 'Se requiere al menos un item' };
    }

    try {
      const comanda = this.formatearComanda({
        pedido_id: pedido_id || cuenta_id,
        cuenta_id,
        canal,
        items,
        notas_generales,
        reimpresion: true
      });

      await this.enviarImpresora(comanda, destino, project_id);

      const registro = {
        comanda_id: `cmd_${crypto.randomUUID().slice(0, 8)}`,
        pedido_id: pedido_id || cuenta_id,
        cuenta_id,
        canal: canal || null,
        items_count: items.length,
        reimpresion: true,
        destino: destino || this.config.destino_default,
        generada_at: new Date().toISOString()
      };

      this.guardarHistorial(registro);
      this.internalMetrics.reimpresiones++;

      await this.eventBus.publish('impresion.comanda_generada', registro);

      return { status: 200, data: registro };
    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('impresion.reimpresion.error', {
        pedido_id, cuenta_id, error: error.message
      });
      return { status: 500, error: error.message };
    }
  }

  /**
   * GET /modules/impresion/estado
   */
  async handleGetEstado() {
    const impresorasOnline = Array.from(this.impresoras.values()).filter(i => i.online);
    return {
      status: 200,
      data: {
        modulo: { name: this.name, version: this.version },
        impresora: {
          ancho: this.config.ancho,
          chars_linea: this.lineWidth
        },
        destino_default: this.config.destino_default || '(auto-discovery)',
        impresoras_descubiertas: this.impresoras.size,
        impresoras_online: impresorasOnline.length
      }
    };
  }

  async handleGetHistorial(data) {
    const limit = parseInt(data?.limit) || 20;
    return {
      status: 200,
      data: { comandas: this.historial.slice(0, limit), total: this.historial.length }
    };
  }

  async handleHealthCheck() {
    const impresorasOnline = Array.from(this.impresoras.values()).filter(i => i.online && i.printer_ready);
    return {
      status: 200,
      data: {
        status: impresorasOnline.length > 0 ? 'healthy' : 'degraded',
        module: this.name,
        version: this.version,
        destino_default: this.config.destino_default,
        impresoras_listas: impresorasOnline.length,
        impresoras_total: this.impresoras.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        historial_size: this.historial.length,
        impresoras_descubiertas: this.impresoras.size
      }
    };
  }

  /**
   * GET /modules/impresion/impresoras
   * Lista impresoras descubiertas via autodescubrimiento MQTT.
   * El ESP32 se anuncia solo — sin registry manual.
   */
  async handleListarImpresoras() {
    const impresoras = Array.from(this.impresoras.values()).map(imp => ({
      device_id: imp.device_id,
      project_id: imp.project_id,
      online: imp.online,
      printer_ready: imp.printer_ready,
      printer_name: imp.printer_name,
      printer_addr: imp.printer_addr,
      ancho: imp.ancho,
      ip: imp.ip,
      wifi_rssi: imp.wifi_rssi,
      uptime_sec: imp.uptime_sec,
      print_count: imp.print_count,
      last_seen: imp.last_seen
    }));

    return {
      status: 200,
      data: {
        impresoras,
        total: impresoras.length,
        destino_default: this.config.destino_default
      }
    };
  }

  /**
   * POST /modules/impresion/ticket-venta
   */
  async handleImprimirTicketVenta(data) {
    const { cuenta_id, items, total, metodo_pago, destino, project_id } = data;

    if (!cuenta_id) {
      return { status: 400, error: 'Se requiere cuenta_id' };
    }
    if (!items || items.length === 0) {
      return { status: 400, error: 'Se requiere al menos un item' };
    }
    if (total === undefined || total === null) {
      return { status: 400, error: 'Se requiere total' };
    }

    try {
      const ticket = this.formatearTicketVenta(data);
      await this.enviarImpresora(ticket, destino, project_id);

      const registro = {
        comanda_id: `vta_${crypto.randomUUID().slice(0, 8)}`,
        tipo: 'ticket_venta',
        cuenta_id,
        items_count: items.length,
        total,
        metodo_pago: metodo_pago || null,
        destino: destino || this.config.destino_default,
        generada_at: new Date().toISOString()
      };

      this.guardarHistorial(registro);
      this.internalMetrics.comandas_generadas++;

      await this.eventBus.publish('impresion.ticket_venta_generado', registro);

      return { status: 200, data: registro };
    } catch (error) {
      this.internalMetrics.errores++;
      this.logger.error('impresion.ticket_venta.error', {
        cuenta_id, error: error.message
      });
      return { status: 500, error: error.message };
    }
  }

  // ==========================================
  // Formateador de Comandas (ESC/POS)
  // ==========================================

  formatearComanda({ pedido_id, cuenta_id, canal, items, notas_generales, reimpresion }) {
    const lineas = [];
    const w = this.lineWidth;

    lineas.push(CMD.INIT);
    lineas.push(CMD.CODEPAGE_437);

    // ══════════════════════════════════════════
    // APARTADO 1: Header — ref pedido + hora
    // ══════════════════════════════════════════
    const refMesa = this.extraerRefMesa(cuenta_id, canal);

    lineas.push(CMD.ALIGN_CENTER);
    lineas.push(CMD.DOUBLE_ON);
    lineas.push(CMD.BOLD_ON);
    if (reimpresion) {
      lineas.push('REIMP');
    }
    // Referencia principal (MESA 5, GLOVO #xx, etc)
    lineas.push(refMesa || `#${pedido_id || '-'}`);
    lineas.push(CMD.BOLD_OFF);
    lineas.push(CMD.DOUBLE_OFF);

    // Hora/fecha
    lineas.push(CMD.FONT_NORMAL);
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    lineas.push(`${hora}  ${fecha}`);

    // ══════════════════════════════════════════
    // APARTADO 2: Items — producto + ingredientes + variaciones
    // ══════════════════════════════════════════
    lineas.push(CMD.ALIGN_LEFT);

    for (const item of items) {
      this.formatearItem(lineas, item);
      lineas.push(this._separadorLigero(w));
    }

    // Notas generales
    if (notas_generales) {
      lineas.push(CMD.BOLD_ON);
      lineas.push(`${'>'} NOTAS:`);
      lineas.push(CMD.BOLD_OFF);
      lineas.push(this.truncar(notas_generales));
      lineas.push(this._separadorLigero(w));
    }

    // Footer discreto
    lineas.push(CMD.ALIGN_CENTER);
    lineas.push(CMD.FONT_SMALL);
    lineas.push(`${'.'} ${items.length} item(s) ${'.'}`);
    lineas.push(CMD.FONT_NORMAL);

    lineas.push(CMD.FEED_5);
    lineas.push(CMD.PARTIAL_CUT);

    return lineas.join('\n');
  }

  formatearItem(lineas, item) {
    const qty = item.cantidad > 1 ? `${item.cantidad}x ` : '';

    // Nombre del producto — GRANDE y negrita (doble alto)
    lineas.push(CMD.BOLD_ON);
    lineas.push(CMD.TALL_ON);
    lineas.push(this.truncar(`${qty}${item.nombre}`));
    lineas.push(CMD.TALL_OFF);
    lineas.push(CMD.BOLD_OFF);

    // Mitad-mitad
    if (item.tipo === 'mitad-mitad' || item.pizza_izquierda || item.pizza_derecha) {
      if (item.pizza_izquierda) {
        lineas.push(this.truncar(` ${'>'} IZQ: ${item.pizza_izquierda}`));
      }
      if (item.pizza_derecha) {
        lineas.push(this.truncar(` ${'>'} DER: ${item.pizza_derecha}`));
      }
    }

    // Ingredientes base — fuente normal, listados con dot
    if (item.ingredientes && item.ingredientes.length > 0) {
      for (const ing of item.ingredientes) {
        const nombre = typeof ing === 'string' ? ing : ing.nombre || String(ing);
        lineas.push(this.truncar(` ${'.'} ${nombre}`));
      }
    }

    // Variaciones — destacadas
    if (item.variaciones && Object.keys(item.variaciones).length > 0) {
      const v = item.variaciones;

      // SIN — negrita + doble alto para que salte a la vista
      if (v.ingredientes_quitar && v.ingredientes_quitar.length > 0) {
        lineas.push(CMD.BOLD_ON);
        lineas.push(CMD.TALL_ON);
        for (const ing of v.ingredientes_quitar) {
          lineas.push(this.truncar(` SIN ${ing.toUpperCase()}`));
        }
        lineas.push(CMD.TALL_OFF);
        lineas.push(CMD.BOLD_OFF);
      }

      // CON — negrita normal
      if (v.ingredientes_anadir && v.ingredientes_anadir.length > 0) {
        lineas.push(CMD.BOLD_ON);
        for (const ing of v.ingredientes_anadir) {
          const nombre = typeof ing === 'string' ? ing : ing.nombre || String(ing);
          lineas.push(this.truncar(` + CON ${nombre}`));
        }
        lineas.push(CMD.BOLD_OFF);
      }

      // Otras variaciones
      for (const [key, val] of Object.entries(v)) {
        if (key === 'ingredientes_quitar' || key === 'ingredientes_anadir') continue;
        if (val === true) {
          lineas.push(CMD.BOLD_ON);
          lineas.push(` ${'*'} ${key.toUpperCase()}`);
          lineas.push(CMD.BOLD_OFF);
        } else if (val && val !== false) {
          lineas.push(this.truncar(` ${'*'} ${key}: ${val}`));
        }
      }
    }

    // Notas del item
    if (item.notas) {
      lineas.push(CMD.UNDERLINE_ON);
      lineas.push(this.truncar(` ${'>'} ${item.notas}`));
      lineas.push(CMD.UNDERLINE_OFF);
    }
  }

  formatearTicketPieza({ pedido_id, cuenta_id, canal, nombre, cantidad, categoria, estacion,
                         ingredientes, variaciones, notas }) {
    const lineas = [];
    const w = this.lineWidth;

    lineas.push(CMD.INIT + CMD.CODEPAGE_437);

    // ── Header — ref pedido ──
    const refMesa = this.extraerRefMesa(cuenta_id, canal);
    const ref = refMesa || `#${pedido_id || '-'}`;
    lineas.push(CMD.ALIGN_CENTER + CMD.DOUBLE_ON + CMD.BOLD_ON + ref + CMD.BOLD_OFF + CMD.DOUBLE_OFF);

    // ── Producto ──
    const prod = cantidad > 1 ? this.truncar(`${cantidad}x ${nombre}`) : this.truncar(nombre);
    lineas.push(CMD.DOUBLE_ON + CMD.BOLD_ON + prod + CMD.BOLD_OFF + CMD.DOUBLE_OFF);

    // ── Variaciones (solo) ──
    if (variaciones && Object.keys(variaciones).length > 0) {
      const v = variaciones;

      if (v.ingredientes_quitar && v.ingredientes_quitar.length > 0) {
        for (const ing of v.ingredientes_quitar) {
          lineas.push(CMD.BOLD_ON + CMD.TALL_ON + this.truncar(` SIN ${ing.toUpperCase()}`) + CMD.TALL_OFF + CMD.BOLD_OFF);
        }
      }

      if (v.ingredientes_anadir && v.ingredientes_anadir.length > 0) {
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

    // Notas
    if (notas) {
      lineas.push(CMD.UNDERLINE_ON + this.truncar(` > ${notas}`) + CMD.UNDERLINE_OFF);
    }

    lineas.push(CMD.FEED_3 + CMD.PARTIAL_CUT);

    return lineas.join('\n');
  }

  // ==========================================
  // Formateador de Ticket de Venta (ESC/POS)
  // ==========================================

  formatearTicketVenta({ cuenta_id, canal, items, subtotal, iva, total, metodo_pago, propina, referencia_pago, datos_negocio }) {
    const lineas = [];
    const w = this.lineWidth;

    lineas.push(CMD.INIT);
    lineas.push(CMD.CODEPAGE_437);

    lineas.push(CMD.ALIGN_CENTER);

    // Logo
    lineas.push(CMD.DOUBLE_ON + CMD.BOLD_ON + 'NO NI NA' + CMD.BOLD_OFF + CMD.DOUBLE_OFF);
    lineas.push('pizzicas');
    lineas.push('643283034');

    lineas.push(this.doubleSep);

    lineas.push(CMD.ALIGN_LEFT);
    const refMesa = this.extraerRefMesa(cuenta_id, canal);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    if (refMesa) {
      lineas.push(CMD.BOLD_ON);
      lineas.push(refMesa);
      lineas.push(CMD.BOLD_OFF);
    }
    lineas.push(`${fecha} ${hora}`);
    lineas.push(this.separator);

    lineas.push(CMD.BOLD_ON);
    lineas.push(this.lineaColumnas('PRODUCTO', 'EUR', w));
    lineas.push(CMD.BOLD_OFF);
    lineas.push(this.separator);

    for (const item of items) {
      const qty = item.cantidad > 1 ? `${item.cantidad}x ` : '';
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
      const ivaLabel = typeof iva === 'object' ? `IVA ${iva.porcentaje || ''}%` : 'IVA';
      const ivaImporte = typeof iva === 'object' ? iva.importe : iva;
      lineas.push(this.lineaColumnas(ivaLabel, this.formatPrecio(ivaImporte), w));
    }
    if (propina && propina > 0) {
      lineas.push(this.lineaColumnas('Propina', this.formatPrecio(propina), w));
    }

    lineas.push(this.doubleSep);
    lineas.push(CMD.DOUBLE_ON);
    lineas.push(CMD.BOLD_ON);
    lineas.push(this.lineaColumnas('TOTAL', this.formatPrecio(total), w));
    lineas.push(CMD.BOLD_OFF);
    lineas.push(CMD.DOUBLE_OFF);

    if (metodo_pago) {
      lineas.push(this.separator);
      const metodos = {
        efectivo: 'EFECTIVO',
        tarjeta: 'TARJETA',
        bizum: 'BIZUM',
        transferencia: 'TRANSFERENCIA',
        mixto: 'PAGO MIXTO',
        link_pago: 'LINK DE PAGO',
        qr: 'QR'
      };
      lineas.push(`Pago: ${metodos[metodo_pago] || metodo_pago.toUpperCase()}`);
      if (referencia_pago) {
        lineas.push(CMD.FONT_SMALL);
        lineas.push(`Ref: ${referencia_pago}`);
        lineas.push(CMD.FONT_NORMAL);
      }
    }

    lineas.push(CMD.FEED_3);
    lineas.push(CMD.ALIGN_CENTER);
    lineas.push(CMD.FONT_SMALL);
    lineas.push('SABOR EN CLAVE DE SOL S.COOP');
    lineas.push('CIF: F24747164');
    lineas.push('C/ Narciso Yepes, 12');
    lineas.push('30840 Alhama de Murcia');
    lineas.push('Gracias por su visita');
    lineas.push(CMD.FONT_NORMAL);

    lineas.push(CMD.FEED_5);
    lineas.push(CMD.PARTIAL_CUT);

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

  extraerRefMesa(cuenta_id, canal) {
    if (!cuenta_id) return null;

    const prefijos = {
      mesa: 'MESA',
      telefono: 'TEL',
      llevar: 'LLEVAR',
      glovo: 'GLOVO',
      whatsapp: 'WHATSAPP'
    };

    for (const [prefijo, label] of Object.entries(prefijos)) {
      if (cuenta_id.startsWith(`${prefijo}_`)) {
        const ref = cuenta_id.slice(prefijo.length + 1);
        // Extraer solo el identificador antes del sufijo _YYYYMMDD_NNN
        const limpio = ref.replace(/_\d{8}_\d+$/, '');
        return `${label} ${limpio || ref}`;
      }
    }

    if (canal && prefijos[canal]) {
      return `${prefijos[canal]} - ${cuenta_id}`;
    }

    return `REF: ${cuenta_id}`;
  }

  // ==========================================
  // Envío directo MQTT al ESP32
  // ==========================================

  /**
   * Publica directamente al topic MQTT que el ESP32 escucha.
   * Topic: impresion/{project_id}/print/{device_id}
   * Payload: { job_id, data (base64) }
   *
   * El ESP32 recibe, decodifica base64, y envía los bytes ESC/POS por BLE.
   * Sin intermediarios: impresion → MQTT → ESP32 → BLE → impresora.
   *
   * @param {string} contenido - datos ESC/POS formateados
   * @param {string} [destino] - device_id del ESP32 (default: config.destino_default)
   * @param {string} [projectId] - project_id para el topic (inferido de auto-discovery si no se pasa)
   */
  async enviarImpresora(contenido, destino, projectId) {
    let deviceId = destino || this.config.destino_default;
    let pid = projectId || '';

    // Si no hay destino/project_id configurado, buscar la primera impresora descubierta online+ready
    if (!deviceId || !pid) {
      const candidata = Array.from(this.impresoras.values())
        .find(i => i.online && i.printer_ready);
      if (candidata) {
        deviceId = deviceId || candidata.device_id;
        pid = pid || candidata.project_id;
        this.logger.info('impresion.auto_destino', { device_id: deviceId, project_id: pid });
      }
    }

    if (!deviceId) {
      throw new Error('No hay destino configurado ni impresoras descubiertas online');
    }
    if (!pid) {
      throw new Error('No hay project_id configurado ni inferible de impresoras descubiertas');
    }

    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      throw new Error('MQTT no disponible — no se puede enviar a impresora');
    }

    const topic = `impresion/${pid}/print/${deviceId}`;
    const buffer = Buffer.from(contenido, 'binary');
    const payload = JSON.stringify({
      job_id: `job_${Date.now().toString(36)}`,
      data: buffer.toString('base64')
    });

    await mqtt.publish(topic, payload, { qos: 1 });

    this.logger.info('impresion.enviado', {
      topic,
      device_id: deviceId,
      bytes: buffer.length
    });
  }

  // ==========================================
  // Utilidades
  // ==========================================

  /**
   * Linea superior o inferior de box con caracteres CP437
   * top:    ╔══════════════════════════════╗
   * bottom: ╚══════════════════════════════╝
   */
  _lineaBox(tipo, ancho) {
    return '='.repeat(ancho);
  }

  /**
   * Separador ligero entre items
   */
  _separadorLigero(ancho) {
    return '-'.repeat(ancho);
  }

  /**
   * Detecta el canal a partir de cuenta_id o canal explícito
   */
  _detectarCanal(cuenta_id, canal) {
    if (canal && CANAL_ICON[canal]) return canal;
    if (!cuenta_id) return 'default';

    const prefijos = ['mesa', 'telefono', 'llevar', 'glovo', 'whatsapp', 'uber_eats', 'just_eat'];
    for (const p of prefijos) {
      if (cuenta_id.startsWith(`${p}_`)) return p;
    }
    return 'default';
  }

  truncar(texto) {
    return texto.length > this.lineWidth ? texto.slice(0, this.lineWidth - 1) + '\xC4' : texto;
  }

  guardarHistorial(registro) {
    this.historial.unshift(registro);
    if (this.historial.length > this.maxHistorial) {
      this.historial.pop();
    }
  }
}

module.exports = ImpresionModule;
