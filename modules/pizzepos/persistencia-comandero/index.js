/**
 * Módulo Persistencia Comandero v2.0
 * Event sourcing local: guarda todos los eventos y genera registros de ventas
 * Alineado con patrones event-core: uiHandler, event envelope, cleanup
 *
 * Emite: caja.cerrada, dia.iniciado
 * Consume: boton.pulsado, ui.accion, cuenta.creada, cuenta.cerrada, cobro.*, pedido.*, mesa.*, telefono.*, llevar.*
 */

const fs = require('fs').promises;
const path = require('path');

class PersistenciaComanderoModule {
  constructor() {
    this.name = 'persistencia-comandero';
    this.version = '2.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;
    this.config = {};

    // Directorios (se configuran en onLoad)
    this.dataDir = './data';
    this.eventosDir = './data/eventos';
    this.ventasDir = './data/ventas';
    this.currentDir = './data/current';
    this.backupDir = './data/backups';

    // Cache en memoria
    this.eventosCache = [];
    this.ventasCache = [];
    this.cuentasActivasCache = new Map();
    this.fechaActual = null;

    // Métricas internas
    this.internalMetrics = {
      eventos_guardados: 0,
      ventas_guardadas: 0,
      errores_escritura: 0
    };

    // Cola de escrituras (evita perder writes por lock booleano)
    this._writeQueue = Promise.resolve();
    this._rotacionInterval = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config = core.config || {};

    this.dataDir = this.config.data_dir || './data';
    this.eventosDir = this.config.eventos_dir || './data/eventos';
    this.ventasDir = this.config.ventas_dir || './data/ventas';
    this.currentDir = this.config.current_dir || './data/current';
    this.backupDir = this.config.backup_dir || './data/backups';

    this.fechaActual = this.getFechaActual();

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this.crearDirectorios();
    await this.cargarDatosActuales();
    // Event subscriptions are auto-wired from module.json by the loader.
    // Do NOT subscribe manually here to avoid duplicate handlers.
    this.registerUIHandlers();
    this.iniciarRotacionDiaria();

    this.logger.info('module.loaded', {
      module: this.name,
      eventos_cargados: this.eventosCache.length,
      ventas_cargadas: this.ventasCache.length,
      cuentas_activas: this.cuentasActivasCache.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._rotacionInterval) {
      clearInterval(this._rotacionInterval);
      this._rotacionInterval = null;
    }

    if (this.uiHandler) {
      const actions = [
        'cuentas_activas', 'eventos', 'eventos_fecha', 'ventas', 'ventas_fecha',
        'cuadre', 'cuadre_fecha', 'cierre', 'iniciar_dia', 'backup',
        'health', 'metrics'
      ];
      for (const action of actions) {
        this.uiHandler.unregister('persistencia', action);
      }
    }

    this.cuentasActivasCache.clear();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // UI Handler Registration
  // ==========================================

  registerUIHandlers() {
    if (!this.uiHandler) {
      this.logger.warn('persistencia.uiHandler.not_available', { module: this.name });
      return;
    }

    this.uiHandler.register('persistencia', 'cuentas_activas', this.handleGetCuentasActivas.bind(this));
    this.uiHandler.register('persistencia', 'eventos', this.handleGetEventos.bind(this));
    this.uiHandler.register('persistencia', 'eventos_fecha', this.handleGetEventosFecha.bind(this));
    this.uiHandler.register('persistencia', 'ventas', this.handleGetVentas.bind(this));
    this.uiHandler.register('persistencia', 'ventas_fecha', this.handleGetVentasFecha.bind(this));
    this.uiHandler.register('persistencia', 'cuadre', this.handleCuadreCaja.bind(this));
    this.uiHandler.register('persistencia', 'cuadre_fecha', this.handleCuadreCajaFecha.bind(this));
    this.uiHandler.register('persistencia', 'cierre', this.handleCierreCaja.bind(this));
    this.uiHandler.register('persistencia', 'iniciar_dia', this.handleIniciarDia.bind(this));
    this.uiHandler.register('persistencia', 'backup', this.handleBackup.bind(this));
    this.uiHandler.register('persistencia', 'health', this.handleHealthCheck.bind(this));
    this.uiHandler.register('persistencia', 'metrics', this.handleGetMetrics.bind(this));

    this.logger.info('persistencia.ui_handlers.registered', {
      handlers: ['cuentas_activas', 'eventos', 'eventos_fecha', 'ventas', 'ventas_fecha', 'cuadre', 'cuadre_fecha', 'cierre', 'iniciar_dia', 'backup', 'health', 'metrics']
    });
  }

  // ==========================================
  // Setup
  // ==========================================

  async crearDirectorios() {
    const dirs = [this.dataDir, this.eventosDir, this.ventasDir, this.currentDir, this.backupDir];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        this.logger.error('persistencia.dir.error', {
          dir,
          error: error.message
        });
      }
    }
  }

  async suscribirEventos() {
    // Eventos de UI
    await this.eventBus.subscribe('boton.pulsado', this.onEvento.bind(this));
    await this.eventBus.subscribe('ui.accion', this.onEvento.bind(this));

    // Eventos de cuentas
    await this.eventBus.subscribe('cuenta.creada', this.onCuentaCreada.bind(this));
    await this.eventBus.subscribe('cuenta.cerrada', this.onCuentaCerrada.bind(this));

    // Eventos de cobros
    await this.eventBus.subscribe('cobro.iniciado', this.onEvento.bind(this));
    await this.eventBus.subscribe('cobro.procesado', this.onEvento.bind(this));
    await this.eventBus.subscribe('cobro.reembolsado', this.onEvento.bind(this));

    // Eventos de pedidos
    await this.eventBus.subscribe('pedido.creado', this.onPedidoCreado.bind(this));
    await this.eventBus.subscribe('pedido.enviado_cocina', this.onEvento.bind(this));
    await this.eventBus.subscribe('pedido.completado', this.onEvento.bind(this));

    // Eventos específicos de canales
    await this.eventBus.subscribe('mesa.abierta', this.onEvento.bind(this));
    await this.eventBus.subscribe('mesa.cerrada', this.onEvento.bind(this));
    await this.eventBus.subscribe('mesa.renombrada', this.onMesaRenombrada.bind(this));
    await this.eventBus.subscribe('telefono.pedido_creado', this.onEvento.bind(this));
    await this.eventBus.subscribe('llevar.ticket_creado', this.onEvento.bind(this));

    this.logger.info('persistencia.events.subscribed', {
      events_count: 14
    });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  async onEvento(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const eventType = event?.type || event?.event_type || 'unknown';

    const eventoRegistro = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      correlation_id: correlationId,
      payload: eventData
    };

    this.eventosCache.push(eventoRegistro);
    this.internalMetrics.eventos_guardados++;
    this.metrics.increment('persistencia.eventos.total');

    await this.guardarEventos();

    this.logger.debug('persistencia.evento.guardado', {
      correlation_id: correlationId,
      event_type: eventType
    });
  }

  async onCuentaCerrada(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;

    await this.onEvento(event);

    const { cuenta_id, tipo, total, metadata } = eventData;

    const cobroEvento = this.eventosCache
      .filter(e => e.event_type === 'cobro.procesado')
      .find(e => e.payload?.cuenta_id === cuenta_id);

    if (!cobroEvento) {
      this.logger.warn('persistencia.cuenta_sin_cobro', {
        correlation_id: correlationId,
        cuenta_id
      });
      return;
    }

    const cuentaCreadaEvento = this.eventosCache
      .filter(e => e.event_type === 'cuenta.creada')
      .find(e => e.payload?.cuenta_id === cuenta_id);

    const pedidosEventos = this.eventosCache
      .filter(e => e.event_type === 'pedido.creado')
      .filter(e => e.payload?.cuenta_id === cuenta_id);

    // Obtener project_id de la cuenta activa en cache
    const cuentaActiva = this.cuentasActivasCache.get(cuenta_id);
    const project_id = eventData.project_id || cuentaActiva?.project_id || null;

    const venta = {
      venta_id: `venta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      project_id,
      cuenta: {
        cuenta_id,
        tipo,
        origen: cuentaCreadaEvento?.payload?.origen || 'desconocido',
        hora_apertura: cuentaCreadaEvento?.timestamp || null,
        hora_cierre: new Date().toISOString(),
        metadata: metadata || {}
      },
      cobro: {
        cobro_id: cobroEvento.payload.cobro_id,
        monto: cobroEvento.payload.monto || total,
        propina: cobroEvento.payload.propina || 0,
        monto_total: cobroEvento.payload.monto_total || total,
        metodo_pago: cobroEvento.payload.metodo_pago,
        referencia_pago: cobroEvento.payload.referencia_pago
      },
      pedidos: pedidosEventos.map(p => ({
        pedido_id: p.payload.pedido_id,
        items: p.payload.items || [],
        total: p.payload.total || 0
      })),
      resumen: {
        subtotal: total,
        propina: cobroEvento.payload.propina || 0,
        total_final: cobroEvento.payload.monto_total || total
      }
    };

    this.ventasCache.push(venta);
    this.internalMetrics.ventas_guardadas++;
    this.metrics.increment('persistencia.ventas.total');

    await this.guardarVentas();

    this.logger.info('persistencia.venta.registrada', {
      correlation_id: correlationId,
      venta_id: venta.venta_id,
      total: venta.resumen.total_final
    });

    this.cuentasActivasCache.delete(cuenta_id);
    await this.guardarCuentasActivas();
  }

  async onCuentaCreada(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;

    await this.onEvento(event);

    const { cuenta_id, project_id, tipo, origen, metadata } = eventData;

    const cuentaActiva = {
      cuenta_id,
      project_id: project_id || null,
      tipo,
      origen,
      estado: 'abierta',
      datos_especificos: metadata || {},
      pedidos: [],
      total: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cuentasActivasCache.set(cuenta_id, cuentaActiva);
    await this.guardarCuentasActivas();

    this.logger.info('persistencia.cuenta_activa.agregada', {
      correlation_id: correlationId,
      project_id,
      cuenta_id,
      tipo
    });
  }

  async onPedidoCreado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;

    await this.onEvento(event);

    const { cuenta_id, pedido_id, items, total } = eventData;

    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (!cuenta) {
      this.logger.warn('persistencia.pedido_sin_cuenta', {
        correlation_id: correlationId,
        cuenta_id
      });
      return;
    }

    cuenta.pedidos.push({
      pedido_id,
      items: items || [],
      total: total || 0
    });

    cuenta.total += total || 0;
    cuenta.updated_at = new Date().toISOString();

    await this.guardarCuentasActivas();

    this.logger.debug('persistencia.cuenta_actualizada', {
      correlation_id: correlationId,
      cuenta_id,
      nuevo_total: cuenta.total
    });
  }

  async onMesaRenombrada(event) {
    const eventData = event?.data || event?.payload || event;

    await this.onEvento(event);

    const { cuenta_id, nombre } = eventData;
    if (!cuenta_id || !nombre) return;

    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (!cuenta) return;

    if (!cuenta.datos_especificos) cuenta.datos_especificos = {};
    cuenta.datos_especificos.nombre = nombre;
    cuenta.updated_at = new Date().toISOString();

    await this.guardarCuentasActivas();

    this.logger.info('persistencia.mesa_renombrada', { cuenta_id, nombre });
  }

  // ==========================================
  // File Operations
  // ==========================================

  _enqueueWrite(label, fn) {
    this._writeQueue = this._writeQueue.then(fn).catch(error => {
      this.internalMetrics.errores_escritura++;
      this.metrics.increment('persistencia.errores.total');
      this.logger.error(`persistencia.${label}.error`, { error: error.message });
    });
    return this._writeQueue;
  }

  async guardarEventos() {
    return this._enqueueWrite('guardar_eventos', async () => {
      const archivo = path.join(this.currentDir, 'eventos.json');
      const data = {
        fecha: this.fechaActual,
        eventos: this.eventosCache,
        total_eventos: this.eventosCache.length,
        ultima_actualizacion: new Date().toISOString()
      };
      await fs.writeFile(archivo, JSON.stringify(data, null, 2), 'utf8');
    });
  }

  async guardarVentas() {
    return this._enqueueWrite('guardar_ventas', async () => {
      const archivo = path.join(this.currentDir, 'ventas.json');
      const resumen = this.calcularResumenDia();
      const data = {
        fecha: this.fechaActual,
        ventas: this.ventasCache,
        resumen_dia: resumen,
        ultima_actualizacion: new Date().toISOString()
      };
      await fs.writeFile(archivo, JSON.stringify(data, null, 2), 'utf8');
    });
  }

  async guardarCuentasActivas() {
    return this._enqueueWrite('guardar_cuentas', async () => {
      const archivo = path.join(this.currentDir, 'cuentas_activas.json');
      const cuentasObj = {};
      for (const [cuenta_id, cuenta] of this.cuentasActivasCache.entries()) {
        cuentasObj[cuenta_id] = cuenta;
      }
      const data = {
        fecha: this.fechaActual,
        cuentas: cuentasObj,
        total_cuentas: this.cuentasActivasCache.size,
        ultima_actualizacion: new Date().toISOString()
      };
      await fs.writeFile(archivo, JSON.stringify(data, null, 2), 'utf8');
    });
  }

  async cargarDatosActuales() {
    try {
      const archivoEventos = path.join(this.currentDir, 'eventos.json');
      const dataEventos = await fs.readFile(archivoEventos, 'utf8');
      const eventosData = JSON.parse(dataEventos);
      this.eventosCache = eventosData.eventos || [];

      const archivoVentas = path.join(this.currentDir, 'ventas.json');
      const dataVentas = await fs.readFile(archivoVentas, 'utf8');
      const ventasData = JSON.parse(dataVentas);
      this.ventasCache = ventasData.ventas || [];

      const archivoCuentas = path.join(this.currentDir, 'cuentas_activas.json');
      const dataCuentas = await fs.readFile(archivoCuentas, 'utf8');
      const cuentasData = JSON.parse(dataCuentas);

      this.cuentasActivasCache.clear();
      if (cuentasData.cuentas) {
        for (const [cuenta_id, cuenta] of Object.entries(cuentasData.cuentas)) {
          this.cuentasActivasCache.set(cuenta_id, cuenta);
        }
      }

      this.logger.info('persistencia.datos_cargados', {
        eventos: this.eventosCache.length,
        ventas: this.ventasCache.length,
        cuentas_activas: this.cuentasActivasCache.size
      });

    } catch (error) {
      this.logger.info('persistencia.sin_datos_previos');
      this.eventosCache = [];
      this.ventasCache = [];
      this.cuentasActivasCache.clear();
    }
  }

  // ==========================================
  // Rotación Diaria
  // ==========================================

  async rotarArchivos() {
    const fechaAnterior = this.fechaActual;
    const nuevaFecha = this.getFechaActual();

    if (fechaAnterior === nuevaFecha) {
      return;
    }

    this.logger.info('persistencia.rotacion', {
      fecha_anterior: fechaAnterior,
      fecha_nueva: nuevaFecha
    });

    try {
      const eventosActual = path.join(this.currentDir, 'eventos.json');
      const eventosArchivo = path.join(this.eventosDir, `${fechaAnterior}.json`);
      await fs.copyFile(eventosActual, eventosArchivo);

      const ventasActual = path.join(this.currentDir, 'ventas.json');
      const ventasArchivo = path.join(this.ventasDir, `${fechaAnterior}.json`);
      await fs.copyFile(ventasActual, ventasArchivo);

      this.eventosCache = [];
      this.ventasCache = [];
      this.fechaActual = nuevaFecha;

      await this.guardarEventos();
      await this.guardarVentas();

      this.logger.info('persistencia.rotacion.completada', {
        fecha_actual: this.fechaActual
      });

    } catch (error) {
      this.logger.error('persistencia.rotacion.error', { error: error.message });
    }
  }

  iniciarRotacionDiaria() {
    this._rotacionInterval = setInterval(() => {
      this.rotarArchivos();
    }, 60 * 60 * 1000);
  }

  // ==========================================
  // UI Handlers (MQTT Request/Response)
  // ==========================================

  async handleGetCuentasActivas(data) {
    const { project_id, tipo } = data || {};

    let cuentas = Array.from(this.cuentasActivasCache.values());

    // Filtrar por proyecto
    if (project_id) {
      cuentas = cuentas.filter(c => c.project_id === project_id);
    }

    if (tipo) {
      cuentas = cuentas.filter(c => c.tipo === tipo);
    }

    return {
      status: 200,
      data: {
        fecha: this.fechaActual,
        project_id: project_id || null,
        cuentas,
        total: cuentas.length
      }
    };
  }

  async handleGetEventos(data) {
    const { project_id } = data || {};

    let eventos = this.eventosCache;

    // Filtrar por proyecto si se especifica
    if (project_id) {
      eventos = eventos.filter(e => e.payload?.project_id === project_id);
    }

    return {
      status: 200,
      data: {
        fecha: this.fechaActual,
        project_id: project_id || null,
        eventos,
        total: eventos.length
      }
    };
  }

  async handleGetEventosFecha(data) {
    const { fecha } = data;

    try {
      const archivo = path.join(this.eventosDir, `${fecha}.json`);
      const content = await fs.readFile(archivo, 'utf8');
      const eventos = JSON.parse(content);

      return { status: 200, data: eventos };
    } catch (error) {
      return { status: 404, error: 'No hay eventos para esa fecha' };
    }
  }

  async handleGetVentas(data) {
    const { project_id } = data || {};

    let ventas = this.ventasCache;

    // Filtrar por proyecto
    if (project_id) {
      ventas = ventas.filter(v => v.project_id === project_id);
    }

    const resumen = this.calcularResumenDia(ventas);

    return {
      status: 200,
      data: {
        fecha: this.fechaActual,
        project_id: project_id || null,
        ventas,
        resumen_dia: resumen,
        total: ventas.length
      }
    };
  }

  async handleGetVentasFecha(data) {
    const { fecha } = data;

    try {
      const archivo = path.join(this.ventasDir, `${fecha}.json`);
      const content = await fs.readFile(archivo, 'utf8');
      const ventas = JSON.parse(content);

      return { status: 200, data: ventas };
    } catch (error) {
      return { status: 404, error: 'No hay ventas para esa fecha' };
    }
  }

  async handleCuadreCaja(data) {
    const { project_id } = data || {};

    let ventas = this.ventasCache;
    if (project_id) {
      ventas = ventas.filter(v => v.project_id === project_id);
    }

    const resumen = this.calcularResumenDia(ventas);

    return {
      status: 200,
      data: {
        fecha: this.fechaActual,
        project_id: project_id || null,
        timestamp: new Date().toISOString(),
        cuadre: resumen
      }
    };
  }

  async handleCuadreCajaFecha(data) {
    const { fecha } = data;

    try {
      const archivo = path.join(this.ventasDir, `${fecha}.json`);
      const content = await fs.readFile(archivo, 'utf8');
      const ventas = JSON.parse(content);

      return {
        status: 200,
        data: { fecha, cuadre: ventas.resumen_dia || {} }
      };
    } catch (error) {
      return { status: 404, error: 'No hay datos para esa fecha' };
    }
  }

  async handleCierreCaja(data) {
    const { arqueo } = data;

    if (!arqueo) {
      return { status: 400, error: 'Se requiere arqueo con el dinero contado' };
    }

    if (this.cuentasActivasCache.size > 0) {
      return {
        status: 400,
        error: 'Hay cuentas abiertas sin cerrar',
        cuentas_abiertas: this.cuentasActivasCache.size
      };
    }

    try {
      const resumen = this.calcularResumenDia();
      const totalEsperadoEfectivo = resumen.por_metodo_pago.efectivo || 0;
      const totalArqueado = (arqueo.efectivo || 0) + (arqueo.monedas || 0);
      const diferencia = totalArqueado - totalEsperadoEfectivo;

      const cierre = {
        cierre_id: `cierre_${Date.now()}`,
        fecha: this.fechaActual,
        hora_cierre: new Date().toISOString(),
        arqueo,
        totales: resumen,
        diferencia,
        estado: diferencia === 0 ? 'cuadrado' : (diferencia > 0 ? 'sobrante' : 'faltante')
      };

      const archivoCierre = path.join(this.ventasDir, `cierre_${this.fechaActual}.json`);
      await fs.writeFile(archivoCierre, JSON.stringify(cierre, null, 2), 'utf8');

      await this.archivarDia();

      await this.eventBus.publish('caja.cerrada', {
        fecha: this.fechaActual,
        arqueo,
        totales: resumen,
        diferencia
      });

      this.logger.info('persistencia.cierre_caja', {
        fecha: this.fechaActual,
        diferencia,
        estado: cierre.estado
      });

      return { status: 200, data: { message: 'Cierre de caja completado', cierre } };

    } catch (error) {
      this.logger.error('persistencia.cierre_caja.error', { error: error.message });
      return { status: 500, error: 'Error realizando cierre de caja' };
    }
  }

  async handleIniciarDia() {
    try {
      this.eventosCache = [];
      this.ventasCache = [];
      this.cuentasActivasCache.clear();
      this.fechaActual = this.getFechaActual();

      await this.guardarEventos();
      await this.guardarVentas();
      await this.guardarCuentasActivas();

      await this.eventBus.publish('dia.iniciado', {
        fecha: this.fechaActual,
        hora_inicio: new Date().toISOString()
      });

      this.logger.info('persistencia.dia_iniciado', { fecha: this.fechaActual });

      return {
        status: 200,
        data: {
          message: 'Nuevo día iniciado',
          fecha: this.fechaActual,
          hora_inicio: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('persistencia.iniciar_dia.error', { error: error.message });
      return { status: 500, error: 'Error iniciando nuevo día' };
    }
  }

  async handleBackup() {
    try {
      const timestamp = Date.now();
      const backupName = `backup_${this.fechaActual}_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      await fs.mkdir(backupPath, { recursive: true });

      const eventosActual = path.join(this.currentDir, 'eventos.json');
      await fs.copyFile(eventosActual, path.join(backupPath, 'eventos.json'));

      const ventasActual = path.join(this.currentDir, 'ventas.json');
      await fs.copyFile(ventasActual, path.join(backupPath, 'ventas.json'));

      this.logger.info('persistencia.backup.creado', { backup_name: backupName });

      return {
        status: 200,
        data: {
          message: 'Backup creado exitosamente',
          backup_name: backupName,
          backup_path: backupPath
        }
      };

    } catch (error) {
      this.logger.error('persistencia.backup.error', { error: error.message });
      return { status: 500, error: 'Error creando backup' };
    }
  }

  async handleHealthCheck() {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        fecha_actual: this.fechaActual,
        eventos_cache: this.eventosCache.length,
        ventas_cache: this.ventasCache.length,
        cuentas_activas: this.cuentasActivasCache.size
      }
    };
  }

  async handleGetMetrics() {
    return {
      status: 200,
      data: {
        ...this.internalMetrics,
        eventos_dia: this.eventosCache.length,
        ventas_dia: this.ventasCache.length,
        cuentas_activas: this.cuentasActivasCache.size
      }
    };
  }

  // ==========================================
  // Business Logic
  // ==========================================

  async archivarDia() {
    try {
      const eventosActual = path.join(this.currentDir, 'eventos.json');
      const eventosArchivo = path.join(this.eventosDir, `${this.fechaActual}.json`);
      await fs.copyFile(eventosActual, eventosArchivo);

      const ventasActual = path.join(this.currentDir, 'ventas.json');
      const ventasArchivo = path.join(this.ventasDir, `${this.fechaActual}.json`);
      await fs.copyFile(ventasActual, ventasArchivo);

      this.logger.info('persistencia.dia_archivado', { fecha: this.fechaActual });
    } catch (error) {
      this.logger.error('persistencia.archivar_dia.error', { error: error.message });
    }
  }

  calcularResumenDia(ventas = null) {
    const ventasToProcess = ventas || this.ventasCache;

    const resumen = {
      total_ventas: ventasToProcess.length,
      total_ingresos: 0,
      total_propinas: 0,
      por_metodo_pago: {
        efectivo: 0,
        tarjeta: 0,
        bizum: 0,
        transferencia: 0
      },
      por_tipo_cuenta: {
        mesa: 0,
        telefono: 0,
        llevar: 0
      },
      por_camarero: {}
    };

    for (const venta of ventasToProcess) {
      resumen.total_ingresos += venta.resumen.total_final;
      resumen.total_propinas += venta.resumen.propina;

      const metodo = venta.cobro.metodo_pago;
      if (resumen.por_metodo_pago[metodo] !== undefined) {
        resumen.por_metodo_pago[metodo] += venta.resumen.total_final;
      }

      const tipo = venta.cuenta.tipo;
      if (resumen.por_tipo_cuenta[tipo] !== undefined) {
        resumen.por_tipo_cuenta[tipo] += venta.resumen.total_final;
      }

      const camarero = venta.cuenta.metadata?.camarero;
      if (camarero) {
        if (!resumen.por_camarero[camarero]) {
          resumen.por_camarero[camarero] = 0;
        }
        resumen.por_camarero[camarero] += venta.resumen.total_final;
      }
    }

    return resumen;
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  getFechaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = PersistenciaComanderoModule;
