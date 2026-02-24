/**
 * Módulo Impresión v1.0
 * Impresión de comandas de cocina: items, variaciones, ingredientes, mesa, hora
 * Sin precios — solo info relevante para cocina
 * Formato ESC/POS para impresoras térmicas 80mm
 */

const crypto = require('crypto');

// ==========================================
// ESC/POS constants (impresora térmica 80mm)
// ==========================================
const ESC = '\x1B';
const GS  = '\x1D';
const CMD = {
  INIT:           `${ESC}@`,
  BOLD_ON:        `${ESC}E\x01`,
  BOLD_OFF:       `${ESC}E\x00`,
  DOUBLE_ON:      `${GS}!\x11`,       // doble ancho + alto
  DOUBLE_OFF:     `${GS}!\x00`,
  ALIGN_CENTER:   `${ESC}a\x01`,
  ALIGN_LEFT:     `${ESC}a\x00`,
  FONT_NORMAL:    `${ESC}M\x00`,
  FONT_SMALL:     `${ESC}M\x01`,
  CUT:            `${GS}V\x00`,
  PARTIAL_CUT:    `${GS}V\x01`,
  FEED_3:         `${ESC}d\x03`,
  FEED_5:         `${ESC}d\x05`,
  UNDERLINE_ON:   `${ESC}-\x01`,
  UNDERLINE_OFF:  `${ESC}-\x00`
};
const LINE_WIDTH = 42; // caracteres por línea en 80mm
const SEPARATOR = '-'.repeat(LINE_WIDTH);
const DOUBLE_SEP = '='.repeat(LINE_WIDTH);

class ImpresionModule {
  constructor() {
    this.name = 'impresion';
    this.version = '1.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;

    // Historial de comandas (últimas 100)
    this.historial = [];
    this.maxHistorial = 100;

    // Métricas internas
    this.internalMetrics = {
      comandas_generadas: 0,
      reimpresiones: 0,
      errores: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this.registerUIHandlers();

    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this.uiHandler) {
      for (const action of ['ticket', 'historial', 'health', 'metrics']) {
        this.uiHandler.unregister('impresion', action);
      }
    }

    this.historial = [];
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('impresion.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('impresion', 'ticket', this.handleImprimirComanda.bind(this));
    this.uiHandler.register('impresion', 'historial', this.handleGetHistorial.bind(this));
    this.uiHandler.register('impresion', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('impresion', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('impresion.ui_handlers.registered', {
      handlers: ['ticket', 'historial', 'health', 'metrics']
    });
  }

  // ==========================================
  // Event Handler: pedido.enviado_cocina
  // ==========================================

  async onPedidoEnviadoCocina(event) {
    const data = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { pedido_id, cuenta_id, canal, items, notas_generales } = data;

    this.logger.info('impresion.comanda.generando', {
      correlation_id: correlationId,
      pedido_id,
      items_count: items?.length || 0
    });

    try {
      const comanda = this.formatearComanda({
        pedido_id,
        cuenta_id,
        canal,
        items: items || [],
        notas_generales,
        reimpresion: false
      });

      await this.enviarImpresora(comanda);

      const registro = {
        comanda_id: `cmd_${crypto.randomUUID().slice(0, 8)}`,
        pedido_id,
        cuenta_id,
        canal: canal || null,
        items_count: items?.length || 0,
        reimpresion: false,
        generada_at: new Date().toISOString()
      };

      this.guardarHistorial(registro);
      this.internalMetrics.comandas_generadas++;

      await this.eventBus.publish('impresion.comanda_generada', registro);

      this.logger.info('impresion.comanda.enviada', {
        correlation_id: correlationId,
        pedido_id,
        comanda_id: registro.comanda_id
      });
    } catch (error) {
      this.internalMetrics.errores++;

      await this.eventBus.publish('impresion.error', {
        error: error.message,
        pedido_id,
        fase: 'formato'
      });

      this.logger.error('impresion.comanda.error', {
        correlation_id: correlationId,
        pedido_id,
        error: error.message
      });
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  /**
   * POST /modules/impresion/ticket
   * Reimprimir comanda manualmente (llamado desde comandero)
   * Body: { cuenta_id, pedido_id?, items?, canal?, notas_generales? }
   */
  async handleImprimirComanda(data) {
    const { cuenta_id, pedido_id, items, canal, notas_generales } = data;

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

      await this.enviarImpresora(comanda);

      const registro = {
        comanda_id: `cmd_${crypto.randomUUID().slice(0, 8)}`,
        pedido_id: pedido_id || cuenta_id,
        cuenta_id,
        canal: canal || null,
        items_count: items.length,
        reimpresion: true,
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

  async handleGetHistorial(data) {
    const limit = parseInt(data?.limit) || 20;
    return {
      status: 200,
      data: { comandas: this.historial.slice(0, limit), total: this.historial.length }
    };
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        historial_size: this.historial.length
      }
    };
  }

  // ==========================================
  // Formateador de Comandas (ESC/POS)
  // ==========================================

  /**
   * Genera el texto ESC/POS para una comanda de cocina.
   * Sin precios — solo items, variaciones, ingredientes, mesa, hora.
   */
  formatearComanda({ pedido_id, cuenta_id, canal, items, notas_generales, reimpresion }) {
    const lineas = [];

    // -- Init impresora
    lineas.push(CMD.INIT);

    // -- Header: COMANDA
    lineas.push(CMD.ALIGN_CENTER);
    lineas.push(CMD.DOUBLE_ON);
    lineas.push(reimpresion ? '** REIMPRESION **' : 'COMANDA');
    lineas.push(CMD.DOUBLE_OFF);

    // -- Referencia mesa/pedido y hora
    lineas.push(CMD.FONT_NORMAL);
    lineas.push(DOUBLE_SEP);

    const refMesa = this.extraerRefMesa(cuenta_id, canal);
    if (refMesa) {
      lineas.push(CMD.BOLD_ON);
      lineas.push(CMD.DOUBLE_ON);
      lineas.push(refMesa);
      lineas.push(CMD.DOUBLE_OFF);
      lineas.push(CMD.BOLD_OFF);
    }

    lineas.push(CMD.ALIGN_LEFT);

    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

    lineas.push(`Hora: ${hora}  Fecha: ${fecha}`);
    lineas.push(`Pedido: ${pedido_id || '-'}`);
    if (canal) lineas.push(`Canal: ${canal}`);

    lineas.push(DOUBLE_SEP);

    // -- Items
    lineas.push(CMD.BOLD_ON);
    lineas.push('ITEMS:');
    lineas.push(CMD.BOLD_OFF);
    lineas.push(SEPARATOR);

    for (const item of items) {
      this.formatearItem(lineas, item);
      lineas.push(SEPARATOR);
    }

    // -- Notas generales
    if (notas_generales) {
      lineas.push(CMD.BOLD_ON);
      lineas.push('NOTAS:');
      lineas.push(CMD.BOLD_OFF);
      lineas.push(notas_generales);
      lineas.push(SEPARATOR);
    }

    // -- Footer
    lineas.push(CMD.ALIGN_CENTER);
    lineas.push(CMD.FONT_SMALL);
    lineas.push(`${items.length} item(s)`);
    lineas.push(CMD.FONT_NORMAL);

    // -- Corte
    lineas.push(CMD.FEED_5);
    lineas.push(CMD.PARTIAL_CUT);

    return lineas.join('\n');
  }

  /**
   * Formatea un item individual de la comanda.
   * Soporta: item normal, mitad-mitad, al gusto, con variaciones.
   */
  formatearItem(lineas, item) {
    // Cantidad + Nombre (bold, doble)
    const qty = item.cantidad > 1 ? `${item.cantidad}x ` : '';
    lineas.push(CMD.BOLD_ON);
    lineas.push(`${qty}${item.nombre}`);
    lineas.push(CMD.BOLD_OFF);

    // Tipo especial: mitad-mitad
    if (item.tipo === 'mitad-mitad' || item.pizza_izquierda || item.pizza_derecha) {
      if (item.pizza_izquierda) {
        lineas.push(`  IZQ: ${item.pizza_izquierda}`);
      }
      if (item.pizza_derecha) {
        lineas.push(`  DER: ${item.pizza_derecha}`);
      }
    }

    // Ingredientes (al gusto)
    if (item.ingredientes && item.ingredientes.length > 0) {
      lineas.push('  Ingredientes:');
      for (const ing of item.ingredientes) {
        if (typeof ing === 'string') {
          lineas.push(`    + ${ing}`);
        } else if (ing.nombre) {
          lineas.push(`    + ${ing.nombre}`);
        }
      }
    }

    // Variaciones
    if (item.variaciones && Object.keys(item.variaciones).length > 0) {
      const v = item.variaciones;

      if (v.ingredientes_quitar && v.ingredientes_quitar.length > 0) {
        lineas.push(CMD.BOLD_ON);
        for (const ing of v.ingredientes_quitar) {
          lineas.push(`  SIN ${ing.toUpperCase()}`);
        }
        lineas.push(CMD.BOLD_OFF);
      }

      if (v.ingredientes_anadir && v.ingredientes_anadir.length > 0) {
        for (const ing of v.ingredientes_anadir) {
          const nombre = typeof ing === 'string' ? ing : ing.nombre || ing;
          lineas.push(`  CON ${nombre}`);
        }
      }

      // Otras variaciones genéricas (tamaño, masa, etc.)
      for (const [key, val] of Object.entries(v)) {
        if (key === 'ingredientes_quitar' || key === 'ingredientes_anadir') continue;
        if (val === true) {
          lineas.push(`  ${key.toUpperCase()}`);
        } else if (val && val !== false) {
          lineas.push(`  ${key}: ${val}`);
        }
      }
    }

    // Notas del item
    if (item.notas) {
      lineas.push(CMD.UNDERLINE_ON);
      lineas.push(`  >> ${item.notas}`);
      lineas.push(CMD.UNDERLINE_OFF);
    }
  }

  /**
   * Extrae referencia de mesa del cuenta_id o canal.
   * Convención: cuenta_id con prefijo indica canal (ej: "mesa_5", "glovo_123")
   */
  extraerRefMesa(cuenta_id, canal) {
    if (!cuenta_id) return null;

    // Prefijos conocidos → extraer número
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
        return `${label} ${ref}`;
      }
    }

    // Si hay canal explícito
    if (canal && prefijos[canal]) {
      return `${prefijos[canal]} - ${cuenta_id}`;
    }

    return `REF: ${cuenta_id}`;
  }

  // ==========================================
  // Envío a impresora
  // ==========================================

  /**
   * Envía el contenido formateado a la impresora.
   * Publicamos via eventBus para que el bridge hardware lo gestione.
   * En entornos sin impresora física, se loguea el contenido.
   */
  async enviarImpresora(contenido) {
    // Publicar al bus para que el bridge de hardware lo envíe
    // El bridge escucha 'impresion.raw' y lo enruta a la impresora física
    await this.eventBus.publish('impresion.raw', {
      tipo: 'comanda',
      contenido,
      timestamp: new Date().toISOString()
    });

    this.logger.debug('impresion.enviada', { bytes: contenido.length });
  }

  // ==========================================
  // Utilidades
  // ==========================================

  guardarHistorial(registro) {
    this.historial.unshift(registro);
    if (this.historial.length > this.maxHistorial) {
      this.historial.pop();
    }
  }
}

module.exports = ImpresionModule;
