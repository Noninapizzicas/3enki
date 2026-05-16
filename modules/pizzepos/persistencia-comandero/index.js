/**
 * pizzepos/persistencia-comandero v4.0.0 — Event-sourcing + jornada (POC2 rewrite).
 *
 * Sustrato de persistencia para TODOS los modulos pizzepos:
 *   1. Event sourcing (26 subscribes captan todos los eventos del bus pizzepos en JSONL append-only).
 *   2. Snapshots de cuentas activas (in-memory + persist).
 *   3. Ventas (registradas tras cuenta.cerrada con cobro asociado).
 *   4. Jornada (caja.cerrada + dia.iniciado).
 *   5. Backup multi-proyecto.
 *
 * Persistencia:
 *   - Globales:      ./data/{eventos,ventas,current,backups}/
 *   - Por proyecto:  data/projects/<id>/persistencia/{current,eventos,ventas,backups}/
 *                    data/projects/<id>/contabilidad/cierres/
 *
 * Eventos del bus:
 *   subscribes (26): boton.pulsado, ui.accion, cuenta.{creada,cerrada,eliminada,estado_cambiado,actualizada},
 *                    cobro.{iniciado,procesado,reembolsado}, pedido.{creado,enviado_cocina,completado},
 *                    mesa.{abierta,cerrada,renombrada}, telefono.pedido_creado, llevar.ticket_creado,
 *                    comandero.{item_agregado,item_eliminado,enviar_cocina}, catalogo.actualizado,
 *                    cocina.{item_preparando,item_preparado,item_avanzado,pedido_listo}.
 *   publishes  (3):  caja.cerrada, cuenta.cerrada_forzada, dia.iniciado.
 *
 * Descomposicion futura documentada en notas/persistencia-comandero-descomposicion.md.
 */

'use strict';

const fs     = require('fs').promises;
const path   = require('path');
const crypto = require('crypto');

const DEFAULT_PROJECT_ID = 'default';

class PersistenciaComanderoModule {
  constructor() {
    this.name    = 'persistencia-comandero';
    this.version = '4.0.0';

    this.eventBus  = null;
    this.logger    = null;
    this.metrics   = null;
    this.uiHandler = null;
    this.config    = {};

    this.dataDir            = './data';
    this.eventosDir         = './data/eventos';
    this.ventasDir          = './data/ventas';
    this.currentDir         = './data/current';
    this.backupDir          = './data/backups';
    this.projectsBasePath   = path.join(process.cwd(), 'data', 'projects');

    this.eventosCache         = [];
    this.ventasCache          = [];
    this.cuentasActivasCache  = new Map();
    this.fechaJornada         = null;
    this.horaInicioJornada    = null;

    this.internalMetrics = {
      eventos_guardados:   0,
      ventas_guardadas:    0,
      errores_escritura:   0
    };

    this._writeQueue = Promise.resolve();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger    = core.logger;
    this.metrics   = core.metrics;
    this.eventBus  = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.config    = core.config || {};

    this.logger.info('module.loading', { module: this.name, version: this.version });

    this.dataDir    = this.config.data_dir    || './data';
    this.eventosDir = this.config.eventos_dir || './data/eventos';
    this.ventasDir  = this.config.ventas_dir  || './data/ventas';
    this.currentDir = this.config.current_dir || './data/current';
    this.backupDir  = this.config.backup_dir  || './data/backups';

    await this._crearDirectorios();
    await this._cargarJornada();
    await this._cargarDatosActuales();

    this.logger.info('module.loaded', {
      module:           this.name,
      version:          this.version,
      eventos_cargados: this.eventosCache.length,
      ventas_cargadas:  this.ventasCache.length,
      cuentas_activas:  this.cuentasActivasCache.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    try { await this._writeQueue; } catch (_) { /* flush best-effort */ }
    this.cuentasActivasCache.clear();
    this.eventosCache       = [];
    this.ventasCache        = [];
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus handlers — event sourcing puro
  // ==========================================

  async onEvento(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;
    const eventType     = event?.type || event?.event_type || 'unknown';

    const eventoRegistro = {
      timestamp:      new Date().toISOString(),
      event_type:     eventType,
      correlation_id: correlationId,
      payload:        eventData
    };

    this.eventosCache.push(eventoRegistro);
    this.internalMetrics.eventos_guardados++;
    this.metrics?.increment?.('persistencia.eventos.total');

    await this._guardarEventos();

    this.logger.debug('persistencia.evento.guardado', {
      correlation_id: correlationId,
      event_type:     eventType
    });
  }

  async onCuentaCreada(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;

    await this.onEvento(event);

    const { cuenta_id, project_id, turno, tipo, nombre, origen, ref_display, estado, total, metadata } = eventData;

    // Shim: reflejar nombre tambien en datos_especificos.nombre por compat con restauradores legacy
    const datosEspecificos = { ...(metadata || {}) };
    if (nombre && !datosEspecificos.nombre) datosEspecificos.nombre = nombre;

    const cuentaActiva = {
      cuenta_id,
      project_id:        project_id || null,
      turno:             Number.isInteger(turno) ? turno : null,
      tipo,
      nombre:            nombre || null,
      origen,
      ref_display:       ref_display || null,
      estado:            estado || 'pendiente',
      datos_especificos: datosEspecificos,
      pedidos:           [],
      total:             Number.isFinite(total) ? total : 0,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString()
    };

    this.cuentasActivasCache.set(cuenta_id, cuentaActiva);
    await this._guardarCuentasActivas();

    this.logger.info('persistencia.cuenta_activa.agregada', {
      correlation_id: correlationId, project_id, cuenta_id, tipo
    });
  }

  async onCuentaCerrada(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;

    await this.onEvento(event);

    const { cuenta_id, tipo, total, metadata } = eventData;
    const cuentaActiva = this.cuentasActivasCache.get(cuenta_id);
    const project_id   = eventData.project_id || cuentaActiva?.project_id || null;

    const cobroEvento = this.eventosCache
      .filter(e => e.event_type === 'cobro.procesado')
      .find(e => e.payload?.cuenta_id === cuenta_id);

    if (cobroEvento) {
      const cuentaCreadaEvento = this.eventosCache
        .filter(e => e.event_type === 'cuenta.creada')
        .find(e => e.payload?.cuenta_id === cuenta_id);

      const pedidosEventos = this.eventosCache
        .filter(e => e.event_type === 'pedido.creado')
        .filter(e => e.payload?.cuenta_id === cuenta_id);

      const venta = this._buildVenta({
        cuenta_id, tipo, total, metadata, project_id,
        cuentaCreadaEvento, cobroEvento, pedidosEventos
      });

      this.ventasCache.push(venta);
      this.internalMetrics.ventas_guardadas++;
      this.metrics?.increment?.('persistencia.ventas.total');
      await this._guardarVentas();

      this.logger.info('persistencia.venta.registrada', {
        correlation_id: correlationId, venta_id: venta.venta_id, total: venta.resumen.total_final
      });
    } else if (cuenta_id && (cuenta_id.startsWith('llevadoo_') || cuenta_id.startsWith('D_')) && metadata?.motivo !== 'cancelado') {
      // Llevadoo: pago externo (no pasa por caja) pero refleja en totales de venta
      const cuentaCreadaEvento = this.eventosCache
        .filter(e => e.event_type === 'cuenta.creada')
        .find(e => e.payload?.cuenta_id === cuenta_id);

      const pedidosEventos = this.eventosCache
        .filter(e => e.event_type === 'pedido.creado')
        .filter(e => e.payload?.cuenta_id === cuenta_id);

      const venta = this._buildVentaExterna({
        cuenta_id, total, metadata, project_id,
        cuentaCreadaEvento, pedidosEventos
      });

      this.ventasCache.push(venta);
      this.internalMetrics.ventas_guardadas++;
      this.metrics?.increment?.('persistencia.ventas.total');
      await this._guardarVentas();

      this.logger.info('persistencia.venta.registrada_externo', {
        correlation_id: correlationId, venta_id: venta.venta_id,
        total: venta.resumen.total_final, metodo: 'externo_llevadoo'
      });
    } else {
      this.logger.warn('persistencia.cuenta_sin_cobro', { correlation_id: correlationId, cuenta_id });
    }

    // SIEMPRE eliminar cuenta de cache
    this.cuentasActivasCache.delete(cuenta_id);
    await this._guardarCuentasActivas();
  }

  async onCuentaEstadoCambiado(event) {
    const eventData = this._unwrap(event);
    const { cuenta_id, estado_nuevo } = eventData;
    if (!cuenta_id || !estado_nuevo) return;

    await this.onEvento(event);

    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (cuenta) {
      cuenta.estado     = estado_nuevo;
      cuenta.updated_at = eventData.changed_at || new Date().toISOString();
      await this._guardarCuentasActivas();
      this.logger.info('persistencia.cuenta_activa.estado_actualizado', { cuenta_id, estado: estado_nuevo });
    }
  }

  async onCuentaActualizada(event) {
    const eventData = this._unwrap(event);
    const { cuenta_id, cambios } = eventData;
    if (!cuenta_id || !cambios) return;

    await this.onEvento(event);

    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (!cuenta) return;

    if (cambios.pagado      !== undefined) cuenta.pagado      = cambios.pagado;
    if (cambios.servido     !== undefined) cuenta.servido     = cambios.servido;
    if (cambios.total       !== undefined) cuenta.total       = cambios.total;
    if (cambios.items       !== undefined) cuenta.items       = cambios.items;
    if (cambios.estado      !== undefined) cuenta.estado      = cambios.estado;
    if (cambios.ref_display !== undefined) cuenta.ref_display = cambios.ref_display;
    if (cambios.nombre      !== undefined) {
      cuenta.datos_especificos = cuenta.datos_especificos || {};
      cuenta.datos_especificos.nombre = cambios.nombre;
    }
    cuenta.updated_at = eventData.updated_at || new Date().toISOString();

    await this._guardarCuentasActivas();
    this.logger.info('persistencia.cuenta_activa.actualizada', {
      cuenta_id, cambios: Object.keys(cambios)
    });
  }

  async onCuentaEliminada(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;
    await this.onEvento(event);

    const { cuenta_id } = eventData;
    if (!cuenta_id) return;

    if (this.cuentasActivasCache.has(cuenta_id)) {
      this.cuentasActivasCache.delete(cuenta_id);
      await this._guardarCuentasActivas();
      this.logger.info('persistencia.cuenta_eliminada.limpieza', { correlation_id: correlationId, cuenta_id });
    }
  }

  async onPedidoCreado(event) {
    const eventData     = this._unwrap(event);
    const correlationId = event?.metadata?.correlationId || eventData?.correlation_id;

    await this.onEvento(event);

    const { cuenta_id, pedido_id, items, total } = eventData;
    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (!cuenta) {
      this.logger.warn('persistencia.pedido_sin_cuenta', { correlation_id: correlationId, cuenta_id });
      return;
    }

    cuenta.pedidos.push({
      pedido_id,
      items: items || [],
      total: total || 0
    });
    // NO sumar total — ya se acumula via onCuentaActualizada en cada comandero.item_agregado.
    cuenta.updated_at = new Date().toISOString();
    await this._guardarCuentasActivas();
  }

  async onMesaRenombrada(event) {
    const eventData = this._unwrap(event);
    await this.onEvento(event);

    const { cuenta_id, nombre } = eventData;
    if (!cuenta_id || !nombre) return;

    const cuenta = this.cuentasActivasCache.get(cuenta_id);
    if (!cuenta) return;

    cuenta.datos_especificos       = cuenta.datos_especificos || {};
    cuenta.datos_especificos.nombre = nombre;
    cuenta.updated_at              = new Date().toISOString();

    await this._guardarCuentasActivas();
    this.logger.info('persistencia.mesa_renombrada', { cuenta_id, nombre });
  }

  // ==========================================
  // UI Handlers (auto-wired desde module.json)
  // ==========================================

  async handleGetCuentasActivas(data) {
    try {
      const { project_id, tipo } = data || {};
      let cuentas = Array.from(this.cuentasActivasCache.values());
      if (project_id) cuentas = cuentas.filter(c => c.project_id === project_id);
      if (tipo)       cuentas = cuentas.filter(c => c.tipo === tipo);
      return {
        status: 200,
        data: { fecha: this.fechaJornada, project_id: project_id || null, cuentas, total: cuentas.length }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.cuentas_activas.failed', err, 'ui_cuentas_activas');
    }
  }

  async handleGetEventos(data) {
    try {
      const { project_id } = data || {};
      let eventos = this.eventosCache;
      if (project_id) eventos = eventos.filter(e => e.payload?.project_id === project_id);
      return {
        status: 200,
        data: { fecha: this.fechaJornada, project_id: project_id || null, eventos, total: eventos.length }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.eventos.failed', err, 'ui_eventos');
    }
  }

  async handleGetEventosFecha(data) {
    try {
      const { fecha, project_id } = data || {};
      if (!fecha) {
        this._logError('persistencia.eventos_fecha.validation_failed', { missing: 'fecha' }, 'ui_eventos_fecha', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'fecha es requerida (YYYY-MM-DD)', { field: 'fecha' });
      }

      if (project_id) {
        const dirs = await this._getProjectDirs(project_id);
        if (dirs) {
          const proj = await this._readJsonSafe(path.join(dirs.eventos, `${fecha}.json`), 'eventos_fecha_proj');
          if (proj) return { status: 200, data: proj };
        }
      }

      const global = await this._readJsonSafe(path.join(this.eventosDir, `${fecha}.json`), 'eventos_fecha_global');
      if (!global) {
        this._logError('persistencia.eventos_fecha.not_found', { fecha, project_id }, 'ui_eventos_fecha', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay eventos para esa fecha', {
          entity_type: 'eventos_fecha', entity_id: fecha
        });
      }
      return { status: 200, data: global };
    } catch (err) {
      return this._handleHandlerError('persistencia.eventos_fecha.failed', err, 'ui_eventos_fecha');
    }
  }

  async handleGetVentas(data) {
    try {
      const { project_id } = data || {};
      let ventas = this.ventasCache;
      if (project_id) ventas = ventas.filter(v => v.project_id === project_id);
      const resumen = this._calcularResumenDia(ventas);
      return {
        status: 200,
        data: { fecha: this.fechaJornada, project_id: project_id || null, ventas, resumen_dia: resumen, total: ventas.length }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.ventas.failed', err, 'ui_ventas');
    }
  }

  async handleGetVentasFecha(data) {
    try {
      const { fecha, project_id } = data || {};
      if (!fecha) {
        this._logError('persistencia.ventas_fecha.validation_failed', { missing: 'fecha' }, 'ui_ventas_fecha', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'fecha es requerida (YYYY-MM-DD)', { field: 'fecha' });
      }

      if (project_id) {
        const dirs = await this._getProjectDirs(project_id);
        if (dirs) {
          const proj = await this._readJsonSafe(path.join(dirs.ventas, `${fecha}.json`), 'ventas_fecha_proj');
          if (proj) return { status: 200, data: proj };
        }
      }

      const global = await this._readJsonSafe(path.join(this.ventasDir, `${fecha}.json`), 'ventas_fecha_global');
      if (!global) {
        this._logError('persistencia.ventas_fecha.not_found', { fecha, project_id }, 'ui_ventas_fecha', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay ventas para esa fecha', {
          entity_type: 'ventas_fecha', entity_id: fecha
        });
      }
      return { status: 200, data: global };
    } catch (err) {
      return this._handleHandlerError('persistencia.ventas_fecha.failed', err, 'ui_ventas_fecha');
    }
  }

  async handleCuadreCaja(data) {
    try {
      const { project_id } = data || {};
      let ventas = this.ventasCache;
      if (project_id) ventas = ventas.filter(v => v.project_id === project_id);
      const resumen = this._calcularResumenDia(ventas);
      return {
        status: 200,
        data: {
          fecha:      this.fechaJornada,
          project_id: project_id || null,
          timestamp:  new Date().toISOString(),
          cuadre:     resumen
        }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.cuadre.failed', err, 'ui_cuadre');
    }
  }

  async handleCuadreCajaFecha(data) {
    try {
      const { fecha, project_id } = data || {};
      if (!fecha) {
        this._logError('persistencia.cuadre_fecha.validation_failed', { missing: 'fecha' }, 'ui_cuadre_fecha', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'fecha es requerida (YYYY-MM-DD)', { field: 'fecha' });
      }

      if (project_id) {
        const dirs = await this._getProjectDirs(project_id);
        if (dirs) {
          const proj = await this._readJsonSafe(path.join(dirs.ventas, `${fecha}.json`), 'cuadre_fecha_proj');
          if (proj) return { status: 200, data: { fecha, project_id, cuadre: proj.resumen_dia || {} } };
        }
      }

      const global = await this._readJsonSafe(path.join(this.ventasDir, `${fecha}.json`), 'cuadre_fecha_global');
      if (!global) {
        this._logError('persistencia.cuadre_fecha.not_found', { fecha }, 'ui_cuadre_fecha', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'No hay datos para esa fecha', {
          entity_type: 'cuadre_fecha', entity_id: fecha
        });
      }
      return { status: 200, data: { fecha, cuadre: global.resumen_dia || {} } };
    } catch (err) {
      return this._handleHandlerError('persistencia.cuadre_fecha.failed', err, 'ui_cuadre_fecha');
    }
  }

  async handleCierreCaja(data) {
    try {
      const { arqueo, project_id } = data || {};
      if (!arqueo) {
        this._logError('persistencia.cierre.validation_failed', { missing: 'arqueo' }, 'ui_cierre', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT',
          'arqueo es requerido con el dinero contado',
          { field: 'arqueo' });
      }

      let cuentasAbiertas  = Array.from(this.cuentasActivasCache.values());
      let ventasParaCierre = this.ventasCache;
      if (project_id) {
        cuentasAbiertas  = cuentasAbiertas.filter(c => c.project_id === project_id);
        ventasParaCierre = ventasParaCierre.filter(v => v.project_id === project_id);
      }

      const informeCuentasAbiertas = cuentasAbiertas.map(c => ({
        cuenta_id:      c.cuenta_id || c.id,
        tipo:           c.tipo,
        nombre:         c.datos_especificos?.nombre || c.nombre || 'Sin nombre',
        estado:         c.estado,
        total:          c.total || 0,
        items:          c.items || 0,
        hora_apertura:  c.created_at,
        pedidos:        c.pedidos || []
      }));

      // Cerrar cuentas abiertas
      if (cuentasAbiertas.length > 0) {
        this.logger.info('persistencia.cierre_caja.cerrando_cuentas', {
          cuentas_abiertas: cuentasAbiertas.length,
          project_id:       project_id || 'global'
        });

        for (const cuenta of cuentasAbiertas) {
          const cuentaId = cuenta.cuenta_id || cuenta.id;
          await this._publicarEvento('cuenta.cerrada_forzada', {
            cuenta_id:        cuentaId,
            project_id:       cuenta.project_id,
            motivo:           'cierre_de_caja',
            cuenta_snapshot:  cuenta
          }, data);
          this.cuentasActivasCache.delete(cuentaId);
        }
        await this._guardarCuentasActivas();
      }

      const resumen                = this._calcularResumenDia(ventasParaCierre);
      const totalEsperadoEfectivo  = resumen.por_metodo_pago.efectivo || 0;
      const totalArqueado          = arqueo.total_contado || ((arqueo.efectivo || 0) + (arqueo.monedas || 0));
      const diferencia             = totalArqueado - totalEsperadoEfectivo;

      const horaCierre = new Date().toISOString();
      const cierre = {
        cierre_id:      `cierre_${Date.now()}`,
        project_id:     project_id || null,
        fecha_jornada:  this.fechaJornada,
        hora_inicio:    this.horaInicioJornada,
        hora_cierre:    horaCierre,
        arqueo,
        totales:        resumen,
        diferencia,
        estado:         diferencia === 0 ? 'cuadrado' : (diferencia > 0 ? 'sobrante' : 'faltante'),
        cuentas_cerradas_forzadas: informeCuentasAbiertas
      };

      const desglose_productos = this._calcularDesgloseProductos(ventasParaCierre);
      cierre.desglose_productos = desglose_productos;
      const informe = this._generarInformeCierre(cierre, ventasParaCierre);

      // Guardar cierre global atomico
      const archivoCierre = path.join(this.ventasDir, `cierre_${this.fechaJornada}.json`);
      await this._atomicWriteFile(archivoCierre, JSON.stringify(cierre, null, 2));

      // Guardar cierre por proyecto
      if (project_id) {
        const dirs = await this._getProjectDirs(project_id);
        if (dirs) {
          await this._atomicWriteFile(
            path.join(dirs.ventas, `cierre_${this.fechaJornada}.json`),
            JSON.stringify(cierre, null, 2)
          );
          await this._atomicWriteFile(
            path.join(dirs.contabilidad, `cierre_${this.fechaJornada}.json`),
            JSON.stringify({ ...cierre, informe, ventas: ventasParaCierre }, null, 2)
          );
          this.logger.info('persistencia.cierre_proyecto.guardado', {
            project_id, contabilidad: path.join(dirs.contabilidad, `cierre_${this.fechaJornada}.json`)
          });
        }
      }

      await this._archivarDia(project_id);

      await this._publicarEvento('caja.cerrada', {
        fecha:       this.fechaJornada,
        project_id:  project_id || null,
        arqueo,
        totales:     resumen,
        diferencia,
        cierre,
        informe
      }, data);

      this.logger.info('persistencia.cierre_caja', {
        fecha:            this.fechaJornada,
        project_id:       project_id || 'global',
        diferencia,
        estado:           cierre.estado,
        cuentas_forzadas: informeCuentasAbiertas.length
      });

      return {
        status: 200,
        data: {
          cierre,
          user_hint: 'Cierre de caja completado'
        }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.cierre.failed', err, 'ui_cierre');
    }
  }

  async handleIniciarDia() {
    try {
      const horaInicio       = new Date().toISOString();
      this.fechaJornada      = this._getFechaCalendario();
      this.horaInicioJornada = horaInicio;

      this.eventosCache = [];
      this.ventasCache  = [];
      this.cuentasActivasCache.clear();

      await this._guardarJornada();
      await this._guardarEventos();
      await this._guardarVentas();
      await this._guardarCuentasActivas();

      await this._publicarEvento('dia.iniciado', {
        fecha:       this.fechaJornada,
        hora_inicio: horaInicio
      });

      this.logger.info('persistencia.jornada_iniciada', {
        fecha_jornada: this.fechaJornada, hora_inicio: horaInicio
      });

      return {
        status: 200,
        data: {
          fecha_jornada: this.fechaJornada,
          hora_inicio:   horaInicio,
          user_hint:     'Jornada iniciada'
        }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.iniciar_dia.failed', err, 'ui_iniciar_dia');
    }
  }

  async handleBackup() {
    try {
      const timestamp  = Date.now();
      const backupName = `backup_${this.fechaJornada}_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);
      await fs.mkdir(backupPath, { recursive: true });

      const eventosActual = path.join(this.currentDir, 'eventos.json');
      try { await fs.copyFile(eventosActual, path.join(backupPath, 'eventos.json')); }
      catch (err) { this.logger.warn('persistencia.backup.eventos_skip', { error: err.message }); }

      const ventasActual = path.join(this.currentDir, 'ventas.json');
      try { await fs.copyFile(ventasActual, path.join(backupPath, 'ventas.json')); }
      catch (err) { this.logger.warn('persistencia.backup.ventas_skip', { error: err.message }); }

      // Backup por proyecto
      const projectIds = [...this._getActiveProjectIds()];
      for (const projectId of projectIds) {
        const dirs = await this._getProjectDirs(projectId);
        if (!dirs) continue;
        const projBackup = path.join(dirs.backups, backupName);
        try {
          await fs.mkdir(projBackup, { recursive: true });
          try { await fs.copyFile(path.join(dirs.current, 'eventos.json'), path.join(projBackup, 'eventos.json')); } catch (_) { /* opcional */ }
          try { await fs.copyFile(path.join(dirs.current, 'ventas.json'),  path.join(projBackup, 'ventas.json')); }  catch (_) { /* opcional */ }
        } catch (err) {
          this.logger.warn('persistencia.backup.proyecto.error', { project_id: projectId, error: err.message });
          this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'backup_proyecto', code: 'FILESYSTEM_ERROR' });
        }
      }

      this.logger.info('persistencia.backup.creado', { backup_name: backupName, proyectos: projectIds.length });
      return {
        status: 200,
        data: { backup_name: backupName, backup_path: backupPath, user_hint: 'Backup creado exitosamente' }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.backup.failed', err, 'ui_backup');
    }
  }

  async handleHealthCheck() {
    try {
      return {
        status: 200,
        data: {
          status:             'healthy',
          module:             this.name,
          version:            this.version,
          fecha_jornada:      this.fechaJornada,
          eventos_cache:      this.eventosCache.length,
          ventas_cache:       this.ventasCache.length,
          cuentas_activas:    this.cuentasActivasCache.size,
          proyectos_activos:  [...this._getActiveProjectIds()]
        }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.health.failed', err, 'ui_health');
    }
  }

  async handleGetMetrics() {
    try {
      return {
        status: 200,
        data: {
          ...this.internalMetrics,
          eventos_dia:        this.eventosCache.length,
          ventas_dia:         this.ventasCache.length,
          cuentas_activas:    this.cuentasActivasCache.size,
          proyectos_activos:  this._getActiveProjectIds().size
        }
      };
    } catch (err) {
      return this._handleHandlerError('persistencia.metrics.failed', err, 'ui_metrics');
    }
  }

  // ==========================================
  // Persistencia (write queue + atomic)
  // ==========================================

  _enqueueWrite(label, fn) {
    this._writeQueue = this._writeQueue.then(fn).catch(err => {
      this.internalMetrics.errores_escritura++;
      this.metrics?.increment?.('persistencia.errores.total');
      this.metrics?.increment?.('persistencia-comandero.errors', { kind: label, code: this._classifyHandlerError(err) });
      this.logger.error(`persistencia.${label}.error`, { error: err.message });
    });
    return this._writeQueue;
  }

  async _guardarEventos() {
    return this._enqueueWrite('guardar_eventos', async () => {
      const archivo = path.join(this.currentDir, 'eventos.json');
      await this._atomicWriteFile(archivo, JSON.stringify({
        fecha:                this.fechaJornada,
        eventos:              this.eventosCache,
        total_eventos:        this.eventosCache.length,
        ultima_actualizacion: new Date().toISOString()
      }, null, 2));
      await this._guardarEventosPorProyecto();
    });
  }

  async _guardarEventosPorProyecto() {
    const porProyecto = new Map();
    for (const evento of this.eventosCache) {
      const pid = evento.payload?.project_id;
      if (!pid) continue;
      if (!porProyecto.has(pid)) porProyecto.set(pid, []);
      porProyecto.get(pid).push(evento);
    }

    for (const [projectId, eventos] of porProyecto) {
      const dirs = await this._getProjectDirs(projectId);
      if (!dirs) continue;
      try {
        await this._atomicWriteFile(path.join(dirs.current, 'eventos.json'), JSON.stringify({
          fecha:                this.fechaJornada,
          project_id:           projectId,
          eventos,
          total_eventos:        eventos.length,
          ultima_actualizacion: new Date().toISOString()
        }, null, 2));
      } catch (err) {
        this.logger.warn('persistencia.proyecto.eventos.error', { project_id: projectId, error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'eventos_proyecto', code: 'FILESYSTEM_ERROR' });
      }
    }
  }

  async _guardarVentas() {
    return this._enqueueWrite('guardar_ventas', async () => {
      const archivo = path.join(this.currentDir, 'ventas.json');
      const resumen = this._calcularResumenDia();
      await this._atomicWriteFile(archivo, JSON.stringify({
        fecha:                this.fechaJornada,
        ventas:               this.ventasCache,
        resumen_dia:          resumen,
        ultima_actualizacion: new Date().toISOString()
      }, null, 2));
      await this._guardarVentasPorProyecto();
    });
  }

  async _guardarVentasPorProyecto() {
    const porProyecto = new Map();
    for (const venta of this.ventasCache) {
      const pid = venta.project_id;
      if (!pid) continue;
      if (!porProyecto.has(pid)) porProyecto.set(pid, []);
      porProyecto.get(pid).push(venta);
    }

    for (const [projectId, ventas] of porProyecto) {
      const dirs = await this._getProjectDirs(projectId);
      if (!dirs) continue;
      try {
        const resumen = this._calcularResumenDia(ventas);
        await this._atomicWriteFile(path.join(dirs.current, 'ventas.json'), JSON.stringify({
          fecha:                this.fechaJornada,
          project_id:           projectId,
          ventas,
          resumen_dia:          resumen,
          ultima_actualizacion: new Date().toISOString()
        }, null, 2));
      } catch (err) {
        this.logger.warn('persistencia.proyecto.ventas.error', { project_id: projectId, error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'ventas_proyecto', code: 'FILESYSTEM_ERROR' });
      }
    }
  }

  async _guardarCuentasActivas() {
    return this._enqueueWrite('guardar_cuentas', async () => {
      const archivo = path.join(this.currentDir, 'cuentas_activas.json');
      const cuentasObj = {};
      for (const [cuenta_id, cuenta] of this.cuentasActivasCache.entries()) {
        cuentasObj[cuenta_id] = cuenta;
      }
      await this._atomicWriteFile(archivo, JSON.stringify({
        fecha:                this.fechaJornada,
        cuentas:              cuentasObj,
        total_cuentas:        this.cuentasActivasCache.size,
        ultima_actualizacion: new Date().toISOString()
      }, null, 2));
      await this._guardarCuentasActivasPorProyecto();
    });
  }

  async _guardarCuentasActivasPorProyecto() {
    const porProyecto = new Map();
    for (const [cuenta_id, cuenta] of this.cuentasActivasCache.entries()) {
      const pid = cuenta.project_id;
      if (!pid) continue;
      if (!porProyecto.has(pid)) porProyecto.set(pid, new Map());
      porProyecto.get(pid).set(cuenta_id, cuenta);
    }

    for (const [projectId, cuentasMap] of porProyecto) {
      const dirs = await this._getProjectDirs(projectId);
      if (!dirs) continue;
      try {
        const cuentasObj = {};
        for (const [cuenta_id, cuenta] of cuentasMap.entries()) {
          cuentasObj[cuenta_id] = cuenta;
        }
        await this._atomicWriteFile(path.join(dirs.current, 'cuentas_activas.json'), JSON.stringify({
          fecha:                this.fechaJornada,
          project_id:           projectId,
          cuentas:              cuentasObj,
          total_cuentas:        cuentasMap.size,
          ultima_actualizacion: new Date().toISOString()
        }, null, 2));
      } catch (err) {
        this.logger.warn('persistencia.proyecto.cuentas.error', { project_id: projectId, error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'cuentas_proyecto', code: 'FILESYSTEM_ERROR' });
      }
    }
  }

  async _cargarJornada() {
    const archivoJornada = path.join(this.currentDir, 'jornada.json');
    const datos = await this._readJsonSafe(archivoJornada, 'jornada_load');
    if (datos) {
      this.fechaJornada      = datos.fecha_jornada;
      this.horaInicioJornada = datos.hora_inicio || null;
      this.logger.info('persistencia.jornada_cargada', {
        fecha_jornada: this.fechaJornada, hora_inicio: this.horaInicioJornada
      });
    } else {
      this.fechaJornada      = this._getFechaCalendario();
      this.horaInicioJornada = new Date().toISOString();
      await this._guardarJornada();
      this.logger.info('persistencia.jornada_nueva', { fecha_jornada: this.fechaJornada });
    }
  }

  async _guardarJornada() {
    return this._enqueueWrite('guardar_jornada', async () => {
      const archivo = path.join(this.currentDir, 'jornada.json');
      const data = {
        fecha_jornada:  this.fechaJornada,
        hora_inicio:    this.horaInicioJornada,
        guardado_at:    new Date().toISOString()
      };
      await this._atomicWriteFile(archivo, JSON.stringify(data, null, 2));

      for (const projectId of this._getActiveProjectIds()) {
        const dirs = await this._getProjectDirs(projectId);
        if (!dirs) continue;
        try {
          await this._atomicWriteFile(path.join(dirs.current, 'jornada.json'), JSON.stringify(data, null, 2));
        } catch (err) {
          this.logger.warn('persistencia.proyecto.jornada.error', { project_id: projectId, error: err.message });
          this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'jornada_proyecto', code: 'FILESYSTEM_ERROR' });
        }
      }
    });
  }

  async _cargarDatosActuales() {
    const eventos = await this._readJsonSafe(path.join(this.currentDir, 'eventos.json'),         'eventos_load');
    const ventas  = await this._readJsonSafe(path.join(this.currentDir, 'ventas.json'),          'ventas_load');
    const cuentas = await this._readJsonSafe(path.join(this.currentDir, 'cuentas_activas.json'), 'cuentas_load');

    this.eventosCache = eventos?.eventos || [];
    this.ventasCache  = ventas?.ventas  || [];
    this.cuentasActivasCache.clear();
    if (cuentas?.cuentas) {
      for (const [cuenta_id, cuenta] of Object.entries(cuentas.cuentas)) {
        this.cuentasActivasCache.set(cuenta_id, cuenta);
      }
    }

    if (eventos || ventas || cuentas) {
      this.logger.info('persistencia.datos_cargados', {
        eventos:          this.eventosCache.length,
        ventas:           this.ventasCache.length,
        cuentas_activas:  this.cuentasActivasCache.size
      });
    } else {
      this.logger.info('persistencia.sin_datos_previos');
    }
  }

  async _crearDirectorios() {
    for (const dir of [this.dataDir, this.eventosDir, this.ventasDir, this.currentDir, this.backupDir]) {
      try { await fs.mkdir(dir, { recursive: true }); }
      catch (err) {
        this.logger.error('persistencia.dir.error', { dir, error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'mkdir', code: 'FILESYSTEM_ERROR' });
      }
    }
  }

  async _archivarDia(projectId = null) {
    try {
      const eventosActual = path.join(this.currentDir, 'eventos.json');
      const eventosArchivo = path.join(this.eventosDir, `${this.fechaJornada}.json`);
      try { await fs.copyFile(eventosActual, eventosArchivo); }
      catch (err) {
        this.logger.warn('persistencia.archivar.eventos_skip', { error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'archivar_eventos', code: 'FILESYSTEM_ERROR' });
      }

      const ventasActual = path.join(this.currentDir, 'ventas.json');
      const ventasArchivo = path.join(this.ventasDir, `${this.fechaJornada}.json`);
      try { await fs.copyFile(ventasActual, ventasArchivo); }
      catch (err) {
        this.logger.warn('persistencia.archivar.ventas_skip', { error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'archivar_ventas', code: 'FILESYSTEM_ERROR' });
      }

      this.logger.info('persistencia.dia_archivado', { fecha: this.fechaJornada });

      const projectIds = projectId ? [projectId] : [...this._getActiveProjectIds()];
      for (const pid of projectIds) {
        const dirs = await this._getProjectDirs(pid);
        if (!dirs) continue;
        try {
          const evCurrent = path.join(dirs.current, 'eventos.json');
          const evArchivo = path.join(dirs.eventos, `${this.fechaJornada}.json`);
          try { await fs.copyFile(evCurrent, evArchivo); } catch (_) { /* opcional */ }

          const vtCurrent = path.join(dirs.current, 'ventas.json');
          const vtArchivo = path.join(dirs.ventas, `${this.fechaJornada}.json`);
          try { await fs.copyFile(vtCurrent, vtArchivo); } catch (_) { /* opcional */ }
        } catch (err) {
          this.logger.warn('persistencia.proyecto.archivar.error', { project_id: pid, error: err.message });
          this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'archivar_proyecto', code: 'FILESYSTEM_ERROR' });
        }
      }
      this.logger.info('persistencia.dia_archivado.proyectos', {
        fecha: this.fechaJornada, count: projectIds.length
      });
    } catch (err) {
      this.logger.error('persistencia.archivar_dia.error', { error: err.message });
      this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'archivar', code: 'UNKNOWN_ERROR' });
    }
  }

  // ==========================================
  // Multi-proyecto helpers
  // ==========================================

  async _getProjectDirs(projectId) {
    if (!projectId) return null;
    const base = path.join(this.projectsBasePath, projectId, 'persistencia');
    const dirs = {
      base,
      current:        path.join(base, 'current'),
      eventos:        path.join(base, 'eventos'),
      ventas:         path.join(base, 'ventas'),
      backups:        path.join(base, 'backups'),
      contabilidad:   path.join(this.projectsBasePath, projectId, 'contabilidad', 'cierres')
    };
    for (const dir of Object.values(dirs)) {
      try { await fs.mkdir(dir, { recursive: true }); }
      catch (err) {
        this.logger.warn('persistencia.proyecto.mkdir.error', { dir, error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'mkdir_proyecto', code: 'FILESYSTEM_ERROR' });
      }
    }
    return dirs;
  }

  _getActiveProjectIds() {
    const ids = new Set();
    for (const cuenta of this.cuentasActivasCache.values())
      if (cuenta.project_id) ids.add(cuenta.project_id);
    for (const venta of this.ventasCache)
      if (venta.project_id) ids.add(venta.project_id);
    for (const evento of this.eventosCache)
      if (evento.payload?.project_id) ids.add(evento.payload.project_id);
    return ids;
  }

  // ==========================================
  // Business logic — venta builders + agregaciones
  // ==========================================

  _buildVenta({ cuenta_id, tipo, total, metadata, project_id, cuentaCreadaEvento, cobroEvento, pedidosEventos }) {
    return {
      venta_id:    `venta_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`,
      timestamp:   new Date().toISOString(),
      project_id,
      cuenta: {
        cuenta_id, tipo,
        origen:        cuentaCreadaEvento?.payload?.origen || 'desconocido',
        hora_apertura: cuentaCreadaEvento?.timestamp || null,
        hora_cierre:   new Date().toISOString(),
        metadata:      metadata || {}
      },
      cobro: {
        cobro_id:        cobroEvento.payload.cobro_id,
        monto:           cobroEvento.payload.monto || total,
        propina:         cobroEvento.payload.propina || 0,
        monto_total:     cobroEvento.payload.monto_total || total,
        metodo_pago:     cobroEvento.payload.metodo_pago,
        referencia_pago: cobroEvento.payload.referencia_pago
      },
      pedidos: pedidosEventos.map(p => ({
        pedido_id: p.payload.pedido_id,
        items:     p.payload.items || [],
        total:     p.payload.total || 0
      })),
      resumen: {
        subtotal:    total,
        propina:     cobroEvento.payload.propina || 0,
        total_final: cobroEvento.payload.monto_total || total
      }
    };
  }

  _buildVentaExterna({ cuenta_id, total, metadata, project_id, cuentaCreadaEvento, pedidosEventos }) {
    return {
      venta_id:    `venta_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`,
      timestamp:   new Date().toISOString(),
      project_id,
      cuenta: {
        cuenta_id, tipo: 'llevadoo',
        origen:        cuentaCreadaEvento?.payload?.origen || 'llevadoo',
        hora_apertura: cuentaCreadaEvento?.timestamp || null,
        hora_cierre:   new Date().toISOString(),
        metadata:      metadata || {}
      },
      cobro: {
        cobro_id:        null,
        monto:           total || 0,
        propina:         0,
        monto_total:     total || 0,
        metodo_pago:     'externo_llevadoo',
        referencia_pago: null
      },
      pedidos: pedidosEventos.map(p => ({
        pedido_id: p.payload.pedido_id,
        items:     p.payload.items || [],
        total:     p.payload.total || 0
      })),
      resumen: {
        subtotal:    total || 0,
        propina:     0,
        total_final: total || 0
      }
    };
  }

  _calcularResumenDia(ventas = null) {
    const ventasToProcess = ventas || this.ventasCache;
    const resumen = {
      total_ventas:    ventasToProcess.length,
      total_ingresos:  0,
      total_propinas:  0,
      por_metodo_pago: { efectivo: 0, tarjeta: 0, bizum: 0, transferencia: 0, externo_llevadoo: 0 },
      por_tipo_cuenta: { mesa: 0, telefono: 0, llevar: 0, llevadoo: 0 },
      por_camarero:    {}
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
        resumen.por_camarero[camarero] = (resumen.por_camarero[camarero] || 0) + venta.resumen.total_final;
      }
    }
    return resumen;
  }

  _calcularDesgloseProductos(ventas = null) {
    const ventasToProcess = ventas || this.ventasCache;
    const porFamilia  = {};
    const porProducto = {};
    let totalUnidades = 0;

    for (const venta of ventasToProcess) {
      for (const pedido of (venta.pedidos || [])) {
        for (const item of (pedido.items || [])) {
          const nombre   = item.nombre   || item.producto_id || 'Desconocido';
          const familia  = item.categoria || item.familia    || 'Sin categoria';
          const cantidad = item.cantidad  || 1;
          const importe  = item.precio_total || item.subtotal ||
                           (item.precio_unitario || item.precio || 0) * cantidad;

          totalUnidades += cantidad;

          if (!porFamilia[familia])  porFamilia[familia]  = { cantidad: 0, importe: 0 };
          porFamilia[familia].cantidad += cantidad;
          porFamilia[familia].importe  += importe;

          if (!porProducto[nombre]) porProducto[nombre] = { cantidad: 0, importe: 0, familia };
          porProducto[nombre].cantidad += cantidad;
          porProducto[nombre].importe  += importe;
        }
      }
    }
    return { porFamilia, porProducto, totalUnidades };
  }

  _generarInformeCierre(cierre, ventasOverride = null) {
    const { fecha_jornada, hora_inicio, hora_cierre, totales, arqueo, diferencia, estado, cuentas_cerradas_forzadas, project_id } = cierre;
    const ventas = ventasOverride || this.ventasCache;

    const lineas = [];
    lineas.push(`📊 INFORME DE CIERRE DE CAJA`);
    lineas.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (project_id) lineas.push(`🏪 Proyecto: ${project_id}`);
    lineas.push(`📅 Jornada: ${fecha_jornada}`);
    lineas.push(`🕐 Inicio: ${hora_inicio ? new Date(hora_inicio).toLocaleTimeString('es-ES') : '—'}`);
    lineas.push(`🕐 Cierre: ${hora_cierre ? new Date(hora_cierre).toLocaleTimeString('es-ES') : '—'}`);
    lineas.push(``);

    lineas.push(`💰 RESUMEN DE VENTAS`);
    lineas.push(`─────────────────────`);
    lineas.push(`Total ventas: ${totales.total_ventas}`);
    lineas.push(`Ingresos: ${(totales.total_ingresos || 0).toFixed(2)} €`);
    lineas.push(`Propinas: ${(totales.total_propinas || 0).toFixed(2)} €`);
    lineas.push(``);

    lineas.push(`💳 POR MÉTODO DE PAGO`);
    lineas.push(`─────────────────────`);
    for (const [metodo, total] of Object.entries(totales.por_metodo_pago || {})) {
      if (Number(total) > 0) lineas.push(`  ${metodo}: ${Number(total).toFixed(2)} €`);
    }
    lineas.push(``);

    lineas.push(`📋 POR TIPO DE CUENTA`);
    lineas.push(`─────────────────────`);
    for (const [tipo, total] of Object.entries(totales.por_tipo_cuenta || {})) {
      if (Number(total) > 0) lineas.push(`  ${tipo}: ${Number(total).toFixed(2)} €`);
    }
    lineas.push(``);

    const { porFamilia, porProducto, totalUnidades } = this._calcularDesgloseProductos(ventas);

    if (totalUnidades > 0) {
      lineas.push(`🍕 PRODUCTOS VENDIDOS (${totalUnidades} uds)`);
      lineas.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      const familiasOrdenadas = Object.entries(porFamilia).sort((a, b) => b[1].importe - a[1].importe);
      for (const [familia, datosFamilia] of familiasOrdenadas) {
        lineas.push(``);
        lineas.push(`📦 ${familia} — ${datosFamilia.cantidad} uds | ${datosFamilia.importe.toFixed(2)} €`);
        lineas.push(`─────────────────────`);

        const productosEnFamilia = Object.entries(porProducto)
          .filter(([, p]) => p.familia === familia)
          .sort((a, b) => b[1].cantidad - a[1].cantidad);

        for (const [nombre, datos] of productosEnFamilia) {
          lineas.push(`  ${nombre}: ${datos.cantidad} uds | ${datos.importe.toFixed(2)} €`);
        }
      }
      lineas.push(``);
    }

    lineas.push(`🔢 ARQUEO DE CAJA`);
    lineas.push(`─────────────────────`);
    const totalContado = arqueo.total_contado || ((arqueo.efectivo || 0) + (arqueo.monedas || 0));
    lineas.push(`Efectivo contado: ${totalContado.toFixed(2)} €`);
    lineas.push(`Efectivo esperado: ${(totales.por_metodo_pago?.efectivo || 0).toFixed(2)} €`);
    lineas.push(`Diferencia: ${diferencia >= 0 ? '+' : ''}${diferencia.toFixed(2)} €`);
    lineas.push(`Estado: ${estado === 'cuadrado' ? '✅ Cuadrado' : estado === 'sobrante' ? '⬆️ Sobrante' : '⬇️ Faltante'}`);
    lineas.push(``);

    if (ventas.length > 0) {
      lineas.push(`📝 DETALLE DE VENTAS (${ventas.length})`);
      lineas.push(`─────────────────────`);
      for (const venta of ventas) {
        const nombre = venta.cuenta?.nombre || venta.cuenta?.tipo || '—';
        const metodo = venta.cobro?.metodo_pago || '—';
        const total  = (venta.resumen?.total_final || 0).toFixed(2);
        const items  = venta.pedidos?.reduce((sum, p) => sum + (p.items?.length || 0), 0) || 0;
        lineas.push(`  • ${nombre} | ${items} items | ${total} € (${metodo})`);
      }
      lineas.push(``);
    }

    if (cuentas_cerradas_forzadas?.length > 0) {
      lineas.push(`⚠️ CUENTAS CERRADAS AL CIERRE (${cuentas_cerradas_forzadas.length})`);
      lineas.push(`─────────────────────`);
      for (const c of cuentas_cerradas_forzadas) {
        lineas.push(`  • ${c.nombre} | Estado: ${c.estado} | ${(c.total || 0).toFixed(2)} € | ${c.items} items`);
      }
      lineas.push(``);
    }

    if (totales.por_camarero && Object.keys(totales.por_camarero).length > 0) {
      lineas.push(`👤 POR CAMARERO`);
      lineas.push(`─────────────────────`);
      for (const [camarero, total] of Object.entries(totales.por_camarero)) {
        lineas.push(`  ${camarero}: ${Number(total).toFixed(2)} €`);
      }
      lineas.push(``);
    }

    lineas.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lineas.push(`Generado: ${new Date().toLocaleString('es-ES')}`);
    return lineas.join('\n');
  }

  _getFechaCalendario() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day   = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
                   code === 'EXTERNAL_API_FAILED'     ? 502 :
                   code === 'TIMEOUT'                 ? 504 :
                   code === 'FILESYSTEM_ERROR'        ? 500 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment?.('persistencia-comandero.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrad')) return 'RESOURCE_NOT_FOUND';
    if (ecod === 'EACCES' || msg.includes('permission'))                                 return 'PERMISSION_DENIED';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (ecod && ecod.startsWith('E'))                                                    return 'FILESYSTEM_ERROR';
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
      this.logger.error('persistencia.publish_error', { event: name, error: err.message });
      this.metrics?.increment?.('persistencia-comandero.errors', { kind: 'publish', code: 'UNKNOWN_ERROR' });
    }
  }

  // 5o helper auxiliar — escritura atomica `.tmp + rename`
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper — lectura JSON con log + metric en error (no swallow silencioso)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('persistencia.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment?.('persistencia-comandero.errors', {
          kind: kind || 'read_json',
          code: this._classifyHandlerError(err)
        });
      }
      return null;
    }
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment?.('persistencia-comandero.errors', { kind, code });
  }

  _unwrap(event) { return event?.data || event?.payload || event || {}; }
}

module.exports = PersistenciaComanderoModule;
