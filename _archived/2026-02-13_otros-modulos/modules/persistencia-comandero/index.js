const fs = require('fs').promises;
const path = require('path');

class PersistenciaComanderoModule {
  constructor() {
    this.name = 'persistencia-comandero';
    this.version = '1.1.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
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
    this.cuentasActivasCache = new Map(); // cuenta_id -> cuenta_data
    this.fechaActual = null;

    // Métricas internas
    this.internalMetrics = {
      eventos_guardados: 0,
      ventas_guardadas: 0,
      errores_escritura: 0
    };

    // Lock para escrituras
    this.writeLock = false;
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.config || {};

    // Configurar directorios desde config
    this.dataDir = this.config.data_dir || './data';
    this.eventosDir = this.config.eventos_dir || './data/eventos';
    this.ventasDir = this.config.ventas_dir || './data/ventas';
    this.currentDir = this.config.current_dir || './data/current';
    this.backupDir = this.config.backup_dir || './data/backups';

    this.fechaActual = this.getFechaActual();

    this.logger.info('modulo.loading', { module: this.name });

    // Crear directorios si no existen
    await this.crearDirectorios();

    // Cargar datos del día actual
    await this.cargarDatosActuales();

    // Suscribirse a eventos
    await this.suscribirEventos();

    // Iniciar rotación diaria
    this.iniciarRotacionDiaria();

    this.logger.info('modulo.loaded', {
      module: this.name,
      eventos_cargados: this.eventosCache.length,
      ventas_cargadas: this.ventasCache.length,
      cuentas_activas: this.cuentasActivasCache.size
    });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
  }

  // ================== Setup ==================

  async crearDirectorios() {
    const dirs = [this.dataDir, this.eventosDir, this.ventasDir, this.currentDir, this.backupDir];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        this.logger.error('[persistencia-comandero] Error creando directorio', {
          dir: dir,
          error: error.message
        });
      }
    }
  }

  async suscribirEventos() {
    // Eventos de UI - TODAS las pulsaciones
    await this.eventBus.subscribe('boton.pulsado', this.onEvento.bind(this));
    await this.eventBus.subscribe('ui.accion', this.onEvento.bind(this));

    // Eventos de cuentas
    await this.eventBus.subscribe('cuenta.creada', this.onCuentaCreada.bind(this));
    await this.eventBus.subscribe('cuenta.cerrada', this.onCuentaCerrada.bind(this));

    // Eventos de cobros
    await this.eventBus.subscribe('cobro.iniciado', this.onEvento.bind(this));
    await this.eventBus.subscribe('cobro.completado', this.onEvento.bind(this));
    await this.eventBus.subscribe('cobro.reembolsado', this.onEvento.bind(this));

    // Eventos de pedidos
    await this.eventBus.subscribe('pedido.creado', this.onPedidoCreado.bind(this));
    await this.eventBus.subscribe('pedido.enviado_cocina', this.onEvento.bind(this));
    await this.eventBus.subscribe('pedido.completado', this.onEvento.bind(this));

    // Eventos específicos de canales
    await this.eventBus.subscribe('mesa.abierta', this.onEvento.bind(this));
    await this.eventBus.subscribe('mesa.cerrada', this.onEvento.bind(this));
    await this.eventBus.subscribe('telefono.pedido_creado', this.onEvento.bind(this));
    await this.eventBus.subscribe('llevar.ticket_creado', this.onEvento.bind(this));

    this.logger.info('[persistencia-comandero] Suscrito a eventos críticos y pulsaciones UI');
  }

  // ================== Event Handlers ==================

  async onEvento(event) {
    const correlationId = event.correlation_id || 'missing-cid';

    const eventoRegistro = {
      timestamp: new Date().toISOString(),
      event_type: event.type || event.event_type,
      correlation_id: correlationId,
      payload: event.payload
    };

    // Agregar a cache
    this.eventosCache.push(eventoRegistro);
    this.internalMetrics.eventos_guardados++;
    this.metrics.increment('persistencia.eventos.total');

    // Guardar en archivo
    await this.guardarEventos();

    this.logger.debug('[persistencia-comandero] Evento guardado', {
      correlation_id: correlationId,
      event_type: eventoRegistro.event_type
    });
  }

  async onCuentaCerrada(event) {
    const correlationId = event.correlation_id || 'missing-cid';

    // Primero guardar el evento
    await this.onEvento(event);

    // Luego crear registro de venta
    const { cuenta_id, tipo, total, metadata } = event.payload;

    // Buscar cobro asociado en eventos
    const cobroEvento = this.eventosCache
      .filter(e => e.event_type === 'cobro.completado')
      .find(e => e.payload.cuenta_id === cuenta_id);

    if (!cobroEvento) {
      this.logger.warn('[persistencia-comandero] Cuenta cerrada sin cobro encontrado', {
        correlation_id: correlationId,
        cuenta_id: cuenta_id
      });
      return;
    }

    // Buscar cuenta creada
    const cuentaCreadaEvento = this.eventosCache
      .filter(e => e.event_type === 'cuenta.creada')
      .find(e => e.payload.cuenta_id === cuenta_id);

    // Buscar pedidos asociados
    const pedidosEventos = this.eventosCache
      .filter(e => e.event_type === 'pedido.creado')
      .filter(e => e.payload.cuenta_id === cuenta_id);

    // Construir registro de venta
    const venta = {
      venta_id: `venta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      cuenta: {
        cuenta_id: cuenta_id,
        tipo: tipo,
        origen: cuentaCreadaEvento?.payload?.origen || 'desconocido',
        hora_apertura: cuentaCreadaEvento?.timestamp || null,
        hora_cierre: event.timestamp || new Date().toISOString(),
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

    // Agregar a cache
    this.ventasCache.push(venta);
    this.internalMetrics.ventas_guardadas++;
    this.metrics.increment('persistencia.ventas.total');

    // Guardar en archivo
    await this.guardarVentas();

    this.logger.info('[persistencia-comandero] Venta registrada', {
      correlation_id: correlationId,
      venta_id: venta.venta_id,
      total: venta.resumen.total_final
    });

    // Remover de cuentas activas
    this.cuentasActivasCache.delete(cuenta_id);
    await this.guardarCuentasActivas();

    this.logger.info('[persistencia-comandero] Cuenta removida de cuentas activas', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id
    });
  }

  async onCuentaCreada(event) {
    const correlationId = event.correlation_id || 'missing-cid';

    // Primero guardar el evento
    await this.onEvento(event);

    // Luego agregar a cuentas activas
    const { cuenta_id, tipo, origen, metadata } = event.payload;

    const cuentaActiva = {
      cuenta_id: cuenta_id,
      tipo: tipo,
      origen: origen,
      estado: 'abierta',
      datos_especificos: metadata || {},
      pedidos: [],
      total: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cuentasActivasCache.set(cuenta_id, cuentaActiva);
    await this.guardarCuentasActivas();

    this.logger.info('[persistencia-comandero] Cuenta agregada a cuentas activas', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id,
      tipo: tipo
    });
  }

  async onPedidoCreado(event) {
    const correlationId = event.correlation_id || 'missing-cid';

    // Primero guardar el evento
    await this.onEvento(event);

    // Luego actualizar cuenta activa
    const { cuenta_id, pedido_id, items, total } = event.payload;

    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (!cuenta) {
      this.logger.warn('[persistencia-comandero] Pedido para cuenta no activa', {
        correlation_id: correlationId,
        cuenta_id: cuenta_id
      });
      return;
    }

    // Agregar pedido
    cuenta.pedidos.push({
      pedido_id: pedido_id,
      items: items || [],
      total: total || 0
    });

    // Actualizar total
    cuenta.total += total || 0;
    cuenta.updated_at = new Date().toISOString();

    await this.guardarCuentasActivas();

    this.logger.debug('[persistencia-comandero] Cuenta activa actualizada con pedido', {
      correlation_id: correlationId,
      cuenta_id: cuenta_id,
      nuevo_total: cuenta.total
    });
  }

  // ================== File Operations ==================

  async guardarEventos() {
    if (this.writeLock) return;

    try {
      this.writeLock = true;

      const archivo = path.join(this.currentDir, 'eventos.json');
      const data = {
        fecha: this.fechaActual,
        eventos: this.eventosCache,
        total_eventos: this.eventosCache.length,
        ultima_actualizacion: new Date().toISOString()
      };

      await fs.writeFile(archivo, JSON.stringify(data, null, 2), 'utf8');

    } catch (error) {
      this.internalMetrics.errores_escritura++;
      this.metrics.increment('persistencia.errores.total');
      this.logger.error('[persistencia-comandero] Error guardando eventos', {
        error: error.message
      });
    } finally {
      this.writeLock = false;
    }
  }

  async guardarVentas() {
    if (this.writeLock) return;

    try {
      this.writeLock = true;

      const archivo = path.join(this.currentDir, 'ventas.json');

      // Calcular resumen del día
      const resumen = this.calcularResumenDia();

      const data = {
        fecha: this.fechaActual,
        ventas: this.ventasCache,
        resumen_dia: resumen,
        ultima_actualizacion: new Date().toISOString()
      };

      await fs.writeFile(archivo, JSON.stringify(data, null, 2), 'utf8');

    } catch (error) {
      this.internalMetrics.errores_escritura++;
      this.metrics.increment('persistencia.errores.total');
      this.logger.error('[persistencia-comandero] Error guardando ventas', {
        error: error.message
      });
    } finally {
      this.writeLock = false;
    }
  }

  async guardarCuentasActivas() {
    if (this.writeLock) return;

    try {
      this.writeLock = true;

      const archivo = path.join(this.currentDir, 'cuentas_activas.json');

      // Convertir Map a objeto
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

    } catch (error) {
      this.internalMetrics.errores_escritura++;
      this.metrics.increment('persistencia.errores.total');
      this.logger.error('[persistencia-comandero] Error guardando cuentas activas', {
        error: error.message
      });
    } finally {
      this.writeLock = false;
    }
  }

  async cargarDatosActuales() {
    try {
      // Cargar eventos
      const archivoEventos = path.join(this.currentDir, 'eventos.json');
      const dataEventos = await fs.readFile(archivoEventos, 'utf8');
      const eventosData = JSON.parse(dataEventos);
      this.eventosCache = eventosData.eventos || [];

      // Cargar ventas
      const archivoVentas = path.join(this.currentDir, 'ventas.json');
      const dataVentas = await fs.readFile(archivoVentas, 'utf8');
      const ventasData = JSON.parse(dataVentas);
      this.ventasCache = ventasData.ventas || [];

      // Cargar cuentas activas
      const archivoCuentas = path.join(this.currentDir, 'cuentas_activas.json');
      const dataCuentas = await fs.readFile(archivoCuentas, 'utf8');
      const cuentasData = JSON.parse(dataCuentas);

      // Convertir objeto a Map
      this.cuentasActivasCache.clear();
      if (cuentasData.cuentas) {
        for (const [cuenta_id, cuenta] of Object.entries(cuentasData.cuentas)) {
          this.cuentasActivasCache.set(cuenta_id, cuenta);
        }
      }

      this.logger.info('[persistencia-comandero] Datos actuales cargados', {
        eventos: this.eventosCache.length,
        ventas: this.ventasCache.length,
        cuentas_activas: this.cuentasActivasCache.size
      });

    } catch (error) {
      // Archivos no existen, es el primer inicio del día
      this.logger.info('[persistencia-comandero] No hay datos previos, iniciando con cache vacía');
      this.eventosCache = [];
      this.ventasCache = [];
      this.cuentasActivasCache.clear();
    }
  }

  // ================== Rotación Diaria ==================

  async rotarArchivos() {
    const fechaAnterior = this.fechaActual;
    const nuevaFecha = this.getFechaActual();

    if (fechaAnterior === nuevaFecha) {
      return; // Mismo día, no rotar
    }

    this.logger.info('[persistencia-comandero] Rotando archivos de día', {
      fecha_anterior: fechaAnterior,
      fecha_nueva: nuevaFecha
    });

    try {
      // Mover eventos del día anterior
      const eventosActual = path.join(this.currentDir, 'eventos.json');
      const eventosArchivo = path.join(this.eventosDir, `${fechaAnterior}.json`);
      await fs.copyFile(eventosActual, eventosArchivo);

      // Mover ventas del día anterior
      const ventasActual = path.join(this.currentDir, 'ventas.json');
      const ventasArchivo = path.join(this.ventasDir, `${fechaAnterior}.json`);
      await fs.copyFile(ventasActual, ventasArchivo);

      // Limpiar caches
      this.eventosCache = [];
      this.ventasCache = [];
      this.fechaActual = nuevaFecha;

      // Crear archivos nuevos vacíos
      await this.guardarEventos();
      await this.guardarVentas();

      this.logger.info('[persistencia-comandero] Rotación completada', {
        fecha_actual: this.fechaActual
      });

    } catch (error) {
      this.logger.error('[persistencia-comandero] Error en rotación de archivos', {
        error: error.message
      });
    }
  }

  iniciarRotacionDiaria() {
    // Verificar cada hora si cambió el día
    setInterval(() => {
      this.rotarArchivos();
    }, 60 * 60 * 1000); // 1 hora
  }

  // ================== HTTP Handlers ==================

  async handleGetCuentasActivas(req, context) {
    const correlationId = context.correlationId;
    const { tipo } = context.query || {};

    let cuentas = Array.from(this.cuentasActivasCache.values());

    // Filtro por tipo si se especifica
    if (tipo) {
      cuentas = cuentas.filter(c => c.tipo === tipo);
    }

    this.logger.debug('[persistencia-comandero] GET /cuentas-activas', {
      correlation_id: correlationId,
      total: cuentas.length,
      tipo: tipo || 'todas'
    });

    return {
      status: 200,
      body: {
        fecha: this.fechaActual,
        cuentas: cuentas,
        total: cuentas.length
      }
    };
  }

  async handleGetEventos(req, context) {
    return {
      status: 200,
      body: {
        fecha: this.fechaActual,
        eventos: this.eventosCache,
        total: this.eventosCache.length
      }
    };
  }

  async handleGetEventosFecha(req, context) {
    const fecha = context.params.fecha;

    try {
      const archivo = path.join(this.eventosDir, `${fecha}.json`);
      const data = await fs.readFile(archivo, 'utf8');
      const eventos = JSON.parse(data);

      return {
        status: 200,
        body: eventos
      };
    } catch (error) {
      return {
        status: 404,
        body: { error: 'No hay eventos para esa fecha' }
      };
    }
  }

  async handleGetVentas(req, context) {
    const resumen = this.calcularResumenDia();

    return {
      status: 200,
      body: {
        fecha: this.fechaActual,
        ventas: this.ventasCache,
        resumen_dia: resumen,
        total: this.ventasCache.length
      }
    };
  }

  async handleGetVentasFecha(req, context) {
    const fecha = context.params.fecha;

    try {
      const archivo = path.join(this.ventasDir, `${fecha}.json`);
      const data = await fs.readFile(archivo, 'utf8');
      const ventas = JSON.parse(data);

      return {
        status: 200,
        body: ventas
      };
    } catch (error) {
      return {
        status: 404,
        body: { error: 'No hay ventas para esa fecha' }
      };
    }
  }

  async handleCuadreCaja(req, context) {
    const resumen = this.calcularResumenDia();

    return {
      status: 200,
      body: {
        fecha: this.fechaActual,
        timestamp: new Date().toISOString(),
        cuadre: resumen
      }
    };
  }

  async handleCuadreCajaFecha(req, context) {
    const fecha = context.params.fecha;

    try {
      const archivo = path.join(this.ventasDir, `${fecha}.json`);
      const data = await fs.readFile(archivo, 'utf8');
      const ventas = JSON.parse(data);

      return {
        status: 200,
        body: {
          fecha: fecha,
          cuadre: ventas.resumen_dia || {}
        }
      };
    } catch (error) {
      return {
        status: 404,
        body: { error: 'No hay datos para esa fecha' }
      };
    }
  }

  async handleCierreCaja(req, context) {
    const correlationId = context.correlationId;
    const { arqueo } = context.body || {};

    // Arqueo: dinero contado físicamente
    // arqueo = { efectivo: 500.00, monedas: 25.50 }

    if (!arqueo) {
      return {
        status: 400,
        body: { error: 'Se requiere arqueo con el dinero contado' }
      };
    }

    // Verificar que no hay cuentas abiertas
    if (this.cuentasActivasCache.size > 0) {
      return {
        status: 400,
        body: {
          error: 'Hay cuentas abiertas sin cerrar',
          cuentas_abiertas: this.cuentasActivasCache.size
        }
      };
    }

    try {
      // Calcular totales del día
      const resumen = this.calcularResumenDia();
      const totalEsperadoEfectivo = resumen.por_metodo_pago.efectivo || 0;
      const totalArqueado = (arqueo.efectivo || 0) + (arqueo.monedas || 0);
      const diferencia = totalArqueado - totalEsperadoEfectivo;

      // Crear registro de cierre
      const cierre = {
        cierre_id: `cierre_${Date.now()}`,
        fecha: this.fechaActual,
        hora_cierre: new Date().toISOString(),
        arqueo: arqueo,
        totales: resumen,
        diferencia: diferencia,
        estado: diferencia === 0 ? 'cuadrado' : (diferencia > 0 ? 'sobrante' : 'faltante')
      };

      // Guardar cierre en archivo del día
      const archivoCierre = path.join(this.ventasDir, `cierre_${this.fechaActual}.json`);
      await fs.writeFile(archivoCierre, JSON.stringify(cierre, null, 2), 'utf8');

      // Archivar datos del día
      await this.archivarDia();

      // Publicar evento de cierre - comandero debe resetear
      await this.eventBus.publish('caja.cerrada', {
        fecha: this.fechaActual,
        arqueo: arqueo,
        totales: resumen,
        diferencia: diferencia
      }, { correlationId });

      this.logger.info('[persistencia-comandero] Cierre de caja completado', {
        correlation_id: correlationId,
        fecha: this.fechaActual,
        diferencia: diferencia,
        estado: cierre.estado
      });

      return {
        status: 200,
        body: {
          message: 'Cierre de caja completado',
          cierre: cierre
        }
      };

    } catch (error) {
      this.logger.error('[persistencia-comandero] Error en cierre de caja', {
        correlation_id: correlationId,
        error: error.message
      });

      return {
        status: 500,
        body: { error: 'Error realizando cierre de caja' }
      };
    }
  }

  async handleIniciarDia(req, context) {
    const correlationId = context.correlationId;

    try {
      // Limpiar caches
      this.eventosCache = [];
      this.ventasCache = [];
      this.cuentasActivasCache.clear();
      this.fechaActual = this.getFechaActual();

      // Crear archivos nuevos vacíos
      await this.guardarEventos();
      await this.guardarVentas();
      await this.guardarCuentasActivas();

      // Publicar evento de día iniciado - comandero debe resetear
      await this.eventBus.publish('dia.iniciado', {
        fecha: this.fechaActual,
        hora_inicio: new Date().toISOString()
      }, { correlationId });

      this.logger.info('[persistencia-comandero] Nuevo día iniciado', {
        correlation_id: correlationId,
        fecha: this.fechaActual
      });

      return {
        status: 200,
        body: {
          message: 'Nuevo día iniciado',
          fecha: this.fechaActual,
          hora_inicio: new Date().toISOString()
        }
      };

    } catch (error) {
      this.logger.error('[persistencia-comandero] Error iniciando día', {
        correlation_id: correlationId,
        error: error.message
      });

      return {
        status: 500,
        body: { error: 'Error iniciando nuevo día' }
      };
    }
  }

  async archivarDia() {
    // Mover archivos del día actual a directorio de archivo
    try {
      const eventosActual = path.join(this.currentDir, 'eventos.json');
      const eventosArchivo = path.join(this.eventosDir, `${this.fechaActual}.json`);
      await fs.copyFile(eventosActual, eventosArchivo);

      const ventasActual = path.join(this.currentDir, 'ventas.json');
      const ventasArchivo = path.join(this.ventasDir, `${this.fechaActual}.json`);
      await fs.copyFile(ventasActual, ventasArchivo);

      this.logger.info('[persistencia-comandero] Día archivado', {
        fecha: this.fechaActual
      });
    } catch (error) {
      this.logger.error('[persistencia-comandero] Error archivando día', {
        error: error.message
      });
    }
  }

  async handleBackup(req, context) {
    const correlationId = context.correlationId;

    try {
      const timestamp = Date.now();
      const backupName = `backup_${this.fechaActual}_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      await fs.mkdir(backupPath, { recursive: true });

      // Copiar eventos
      const eventosActual = path.join(this.currentDir, 'eventos.json');
      await fs.copyFile(eventosActual, path.join(backupPath, 'eventos.json'));

      // Copiar ventas
      const ventasActual = path.join(this.currentDir, 'ventas.json');
      await fs.copyFile(ventasActual, path.join(backupPath, 'ventas.json'));

      this.logger.info('[persistencia-comandero] Backup creado', {
        correlation_id: correlationId,
        backup_name: backupName
      });

      return {
        status: 200,
        body: {
          message: 'Backup creado exitosamente',
          backup_name: backupName,
          backup_path: backupPath
        }
      };

    } catch (error) {
      this.logger.error('[persistencia-comandero] Error creando backup', {
        correlation_id: correlationId,
        error: error.message
      });

      return {
        status: 500,
        body: { error: 'Error creando backup' }
      };
    }
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      body: {
        status: 'healthy',
        module: 'persistencia',
        version: '1.0.0',
        fecha_actual: this.fechaActual,
        eventos_cache: this.eventosCache.length,
        ventas_cache: this.ventasCache.length,
        cuentas_activas: this.cuentasActivasCache.size
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      body: {
        ...this.internalMetrics,
        eventos_dia: this.eventosCache.length,
        ventas_dia: this.ventasCache.length,
        cuentas_activas: this.cuentasActivasCache.size
      }
    };
  }

  // ================== Utilidades ==================

  calcularResumenDia() {
    const resumen = {
      total_ventas: this.ventasCache.length,
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

    for (const venta of this.ventasCache) {
      resumen.total_ingresos += venta.resumen.total_final;
      resumen.total_propinas += venta.resumen.propina;

      // Por método de pago
      const metodo = venta.cobro.metodo_pago;
      if (resumen.por_metodo_pago[metodo] !== undefined) {
        resumen.por_metodo_pago[metodo] += venta.resumen.total_final;
      }

      // Por tipo de cuenta
      const tipo = venta.cuenta.tipo;
      if (resumen.por_tipo_cuenta[tipo] !== undefined) {
        resumen.por_tipo_cuenta[tipo] += venta.resumen.total_final;
      }

      // Por camarero (si existe)
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

  getFechaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = PersistenciaComanderoModule;
