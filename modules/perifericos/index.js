/**
 * perifericos v2.0.0 — Routing de capacidades hardware (imprimir, display, abrir-cajon)
 * a dispositivos fisicos via transportes (BLE, TCP, ESP32-MQTT, comando shell).
 *
 * Reescritura canonica POC2: helpers POC2, error codes del catalogo, telemetria
 * estructurada, correlation_id + project_id propagados en todos los publishes.
 *
 * Eventos del bus (preservados invariantes vs monolito):
 *   publishes: periferico.impreso, .displayed, .cajon-abierto, .estado.respuesta,
 *              .listado, .dispositivo.registrado, .dispositivo.desregistrado, .error
 *   subscribes: periferico.{imprimir, display, abrir-cajon, estado, listar,
 *               registrar, desregistrar}
 *
 * Auto-descubrimiento MQTT preservado: impresion/+/status/+, enki/+/status/+,
 * devices/+/+/birth.
 */

'use strict';

const path   = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const DEFAULT_PROJECT_ID = 'default';

class PerifericosModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'perifericos';
    this.version = '2.0.0';
    this.provider = null;

    this.config = {
      data_path: './data/perifericos',
      dispositivos: [],
      auto_discovery: true
    };

    this._onMqttMessage = null;

    this.internalMetrics = {
      envios_total:    0,
      envios_ok:       0,
      envios_error:    0,
      registros_total: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger   = core.logger;
    this.metrics  = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    const userConfig = core.config?.perifericos || {};
    this.config = {
      ...this.config,
      ...userConfig,
      data_path: path.resolve(userConfig.dataPath || userConfig.data_path || this.config.data_path),
      auto_discovery: userConfig.descubrimiento?.esp32_auto !== false
    };

    this.provider = this._loadProvider();

    if (this.provider) {
      await this.provider._initialize({
        dataPath:           this.config.data_path,
        logger:             this.logger,
        dispositivosConfig: this.config.dispositivos,
        eventBus:           this.eventBus
      });
      this.logger.info('perifericos.provider.inicializado', {
        dispositivos_config: this.config.dispositivos.length,
        dispositivos_total:  this.provider._getRegistry()?.listar()?.length || 0
      });
    } else {
      this.logger.warn('perifericos.provider.no_disponible', {
        nota: 'Modulo carga sin provider — handlers responderan 503 UPSTREAM_UNREACHABLE'
      });
    }

    if (this.config.auto_discovery && this.provider) {
      await this._iniciarAutoDescubrimiento();
    }

    this.logger.info('module.loaded', {
      module:         this.name,
      version:        this.version,
      data_path:      this.config.data_path,
      auto_discovery: this.config.auto_discovery,
      provider:       !!this.provider
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this._detenerAutoDescubrimiento();
    this.internalMetrics = { envios_total: 0, envios_ok: 0, envios_error: 0, registros_total: 0 };
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus Handlers (subscribes)
  // ==========================================

  async onImprimir(event) {
    const data = this._unwrap(event);
    const { destino, formato, prioridad, opciones, project_id, correlation_id } = data;
    const contenido = data.data;

    if (!destino || !contenido) {
      const missing = !destino ? 'destino' : 'data';
      this._logError('perifericos.imprimir.validation_failed', { missing }, 'imprimir', 'INVALID_INPUT');
      await this._publicarEvento('periferico.error', {
        kind:    'imprimir',
        code:    'INVALID_INPUT',
        message: `${missing} es requerido`,
        contexto: { destino: destino || null }
      }, data);
      return;
    }

    if (!this.provider) {
      this._logError('perifericos.imprimir.no_provider', { destino }, 'imprimir', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.error', {
        kind: 'imprimir', code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible', contexto: { destino }
      }, data);
      return;
    }

    this.internalMetrics.envios_total++;
    this.metrics?.increment('perifericos.envios.total', { capacidad: 'imprimir' });

    const copias = opciones?.copias || 1;
    this.logger.info('perifericos.imprimir.enviando', {
      destino, formato: formato || 'escpos', prioridad: prioridad || 3, copias,
      bytes: typeof contenido === 'string' ? contenido.length : contenido?.length
    });

    for (let i = 0; i < copias; i++) {
      const result = await this.provider.send({
        destino, data: contenido, formato, opciones,
        _context: { logger: this.logger, eventBus: this.eventBus }
      });
      if (!result.success) {
        this.internalMetrics.envios_error++;
        this.metrics?.increment('perifericos.envios.error', { capacidad: 'imprimir' });
        this.logger.error('perifericos.imprimir.send_failed', { destino, copia: i + 1, error: result.error });
        await this._publicarEvento('periferico.error', {
          kind: 'imprimir', code: 'UPSTREAM_INVALID_RESPONSE', message: result.error,
          contexto: { destino, copia: i + 1 }
        }, data);
        return;
      }
    }

    this.internalMetrics.envios_ok++;
    this.metrics?.increment('perifericos.envios.ok', { capacidad: 'imprimir' });

    await this._publicarEvento('periferico.impreso', {
      destino, formato: formato || 'escpos', copias
    }, data);
  }

  async onDisplay(event) {
    const data = this._unwrap(event);
    const { destino, prioridad } = data;
    const contenido = data.data;

    if (!destino || !contenido) {
      const missing = !destino ? 'destino' : 'data';
      this._logError('perifericos.display.validation_failed', { missing }, 'display', 'INVALID_INPUT');
      await this._publicarEvento('periferico.error', {
        kind: 'display', code: 'INVALID_INPUT', message: `${missing} es requerido`,
        contexto: { destino: destino || null }
      }, data);
      return;
    }

    if (!this.provider) {
      this._logError('perifericos.display.no_provider', { destino }, 'display', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.error', {
        kind: 'display', code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible', contexto: { destino }
      }, data);
      return;
    }

    this.internalMetrics.envios_total++;
    this.metrics?.increment('perifericos.envios.total', { capacidad: 'display' });
    this.logger.info('perifericos.display.enviando', {
      destino, accion: contenido.accion || 'mostrar', prioridad: prioridad || 3
    });

    const result = await this.provider.send({
      destino,
      data:     typeof contenido === 'string' ? contenido : JSON.stringify(contenido),
      formato:  'json',
      opciones: { tipo_capacidad: 'display' },
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) {
      this.internalMetrics.envios_error++;
      this.metrics?.increment('perifericos.envios.error', { capacidad: 'display' });
      this.logger.error('perifericos.display.send_failed', { destino, error: result.error });
      await this._publicarEvento('periferico.error', {
        kind: 'display', code: 'UPSTREAM_INVALID_RESPONSE', message: result.error, contexto: { destino }
      }, data);
      return;
    }

    this.internalMetrics.envios_ok++;
    this.metrics?.increment('perifericos.envios.ok', { capacidad: 'display' });

    await this._publicarEvento('periferico.displayed', {
      destino, accion: contenido.accion || 'mostrar'
    }, data);
  }

  async onAbrirCajon(event) {
    const data = this._unwrap(event);
    const { destino, pin } = data;

    if (!destino) {
      this._logError('perifericos.cajon.validation_failed', { missing: 'destino' }, 'abrir-cajon', 'INVALID_INPUT');
      await this._publicarEvento('periferico.error', {
        kind: 'abrir-cajon', code: 'INVALID_INPUT', message: 'destino es requerido', contexto: {}
      }, data);
      return;
    }

    if (!this.provider) {
      this._logError('perifericos.cajon.no_provider', { destino }, 'abrir-cajon', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.error', {
        kind: 'abrir-cajon', code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible', contexto: { destino }
      }, data);
      return;
    }

    this.internalMetrics.envios_total++;
    this.metrics?.increment('perifericos.envios.total', { capacidad: 'abrir-cajon' });

    // ESC/POS apertura de cajon: ESC p <pin> <t1=25> <t2=250>
    const pinByte = (pin === 1) ? '\x01' : '\x00';
    const cmd = `\x1B\x70${pinByte}\x19\xFA`;

    this.logger.info('perifericos.cajon.abriendo', { destino, pin: pin || 0 });

    const result = await this.provider.send({
      destino, data: cmd, formato: 'escpos',
      opciones: { tipo_capacidad: 'abrir-cajon' },
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) {
      this.internalMetrics.envios_error++;
      this.metrics?.increment('perifericos.envios.error', { capacidad: 'abrir-cajon' });
      this.logger.error('perifericos.cajon.send_failed', { destino, error: result.error });
      await this._publicarEvento('periferico.error', {
        kind: 'abrir-cajon', code: 'UPSTREAM_INVALID_RESPONSE', message: result.error, contexto: { destino }
      }, data);
      return;
    }

    this.internalMetrics.envios_ok++;
    this.metrics?.increment('perifericos.envios.ok', { capacidad: 'abrir-cajon' });

    await this._publicarEvento('periferico.cajon-abierto', {
      destino, pin: pin || 0
    }, data);
  }

  async onEstado(event) {
    const data = this._unwrap(event);
    const { nombre } = data;

    if (!nombre) {
      this._logError('perifericos.estado.validation_failed', { missing: 'nombre' }, 'estado', 'INVALID_INPUT');
      await this._publicarEvento('periferico.estado.respuesta', {
        nombre: null,
        error: { code: 'INVALID_INPUT', message: 'nombre es requerido' }
      }, data);
      return;
    }

    if (!this.provider) {
      this._logError('perifericos.estado.no_provider', { nombre }, 'estado', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.estado.respuesta', {
        nombre,
        error: { code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible' }
      }, data);
      return;
    }

    const result = await this.provider.status({
      nombre, _context: { logger: this.logger }
    });

    await this._publicarEvento('periferico.estado.respuesta', {
      nombre,
      ...(result.data || {})
    }, data);
  }

  async onListar(event) {
    const data = this._unwrap(event) || {};
    const { tipo, capacidad } = data;

    if (!this.provider) {
      this._logError('perifericos.listar.no_provider', {}, 'listar', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.listado', {
        dispositivos: [], total: 0,
        error: { code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible' }
      }, data);
      return;
    }

    const result = await this.provider.list({
      tipo, capacidad, _context: { logger: this.logger }
    });

    await this._publicarEvento('periferico.listado', {
      ...(result.data || { dispositivos: [], total: 0 })
    }, data);
  }

  async onRegistrar(event) {
    const data = this._unwrap(event);

    if (!this.provider) {
      this._logError('perifericos.registrar.no_provider', {}, 'registrar', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.error', {
        kind: 'registrar', code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible', contexto: {}
      }, data);
      return;
    }

    const result = await this.provider.register({
      ...data,
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) {
      this._logError('perifericos.registrar.failed', { error: result.error }, 'registrar', 'INVALID_INPUT');
      await this._publicarEvento('periferico.error', {
        kind: 'registrar', code: 'INVALID_INPUT', message: result.error,
        contexto: { nombre: data?.nombre || null }
      }, data);
      return;
    }

    this.internalMetrics.registros_total++;
    this.metrics?.increment('perifericos.registros.total', { source: 'event' });
    this.logger.info('perifericos.registrar.ok', { nombre: result.data?.dispositivo?.nombre });

    await this._publicarEvento('periferico.dispositivo.registrado', {
      dispositivo: result.data.dispositivo,
      source:      'event'
    }, data);
  }

  async onDesregistrar(event) {
    const data = this._unwrap(event);
    const { nombre } = data;

    if (!nombre) {
      this._logError('perifericos.desregistrar.validation_failed', { missing: 'nombre' }, 'desregistrar', 'INVALID_INPUT');
      await this._publicarEvento('periferico.error', {
        kind: 'desregistrar', code: 'INVALID_INPUT', message: 'nombre es requerido', contexto: {}
      }, data);
      return;
    }

    if (!this.provider) {
      this._logError('perifericos.desregistrar.no_provider', { nombre }, 'desregistrar', 'UPSTREAM_UNREACHABLE');
      await this._publicarEvento('periferico.error', {
        kind: 'desregistrar', code: 'UPSTREAM_UNREACHABLE', message: 'Provider no disponible', contexto: { nombre }
      }, data);
      return;
    }

    const result = await this.provider.unregister({
      nombre, _context: { logger: this.logger }
    });

    if (result.success && result.data?.removed) {
      this.logger.info('perifericos.desregistrar.ok', { nombre });
      await this._publicarEvento('periferico.dispositivo.desregistrado', {
        nombre, source: 'event'
      }, data);
    }
  }

  // ==========================================
  // UI Handlers (mqttRequest cross-modulo)
  // ==========================================

  async handleListar(data) {
    try {
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }
      const result = await this.provider.list({
        tipo: data?.tipo, capacidad: data?.capacidad,
        _context: { logger: this.logger }
      });
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.list.failed', err, 'ui_list');
    }
  }

  async handleGet(data) {
    try {
      if (!data?.nombre) {
        this._logError('perifericos.ui.get.validation_failed', { missing: 'nombre' }, 'ui_get', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }
      const result = await this.provider.status({
        nombre: data.nombre, _context: { logger: this.logger }
      });
      if (!result.success) {
        this._logError('perifericos.ui.get.not_found', { nombre: data.nombre }, 'ui_get', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Dispositivo ${data.nombre} no encontrado`, {
          entity_type: 'periferico', entity_id: data.nombre
        });
      }
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.get.failed', err, 'ui_get');
    }
  }

  async handleRegistrar(data) {
    try {
      if (!data?.nombre) {
        this._logError('perifericos.ui.register.validation_failed', { missing: 'nombre' }, 'ui_register', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      if (!data?.transporte?.tipo) {
        this._logError('perifericos.ui.register.validation_failed', { missing: 'transporte.tipo' }, 'ui_register', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'transporte.tipo es requerido', { field: 'transporte.tipo' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const result = await this.provider.register({
        ...data, _context: { logger: this.logger, eventBus: this.eventBus }
      });
      if (!result.success) {
        this._logError('perifericos.ui.register.invalid', { nombre: data.nombre, error: result.error }, 'ui_register', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', result.error, { field: 'transporte', nombre: data.nombre });
      }

      this.internalMetrics.registros_total++;
      this.metrics?.increment('perifericos.registros.total', { source: 'ui' });

      await this._publicarEvento('periferico.dispositivo.registrado', {
        dispositivo: result.data.dispositivo, source: 'ui'
      }, data);

      return { status: 201, data: result.data };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.register.failed', err, 'ui_register');
    }
  }

  async handleActualizar(data) {
    try {
      if (!data?.nombre) {
        this._logError('perifericos.ui.update.validation_failed', { missing: 'nombre' }, 'ui_update', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const registry = this.provider._getRegistry();
      const dispositivo = registry.actualizar(data.nombre, data);
      return { status: 200, data: { dispositivo } };
    } catch (err) {
      if ((err.message || '').toLowerCase().includes('no encontrado')) {
        err._code = 'RESOURCE_NOT_FOUND';
        err._details = { entity_type: 'periferico', entity_id: data?.nombre };
      }
      return this._handleHandlerError('perifericos.ui.update.failed', err, 'ui_update');
    }
  }

  async handleDesregistrar(data) {
    try {
      if (!data?.nombre) {
        this._logError('perifericos.ui.delete.validation_failed', { missing: 'nombre' }, 'ui_delete', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const result = await this.provider.unregister({
        nombre: data.nombre, _context: { logger: this.logger }
      });

      const removed = !!result.data?.removed;
      if (removed) {
        await this._publicarEvento('periferico.dispositivo.desregistrado', {
          nombre: data.nombre, source: 'ui'
        }, data);
      }
      return { status: 200, data: { removed, nombre: data.nombre } };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.delete.failed', err, 'ui_delete');
    }
  }

  async handleTestDispositivo(data) {
    try {
      if (!data?.nombre) {
        this._logError('perifericos.ui.test.validation_failed', { missing: 'nombre' }, 'ui_test', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const testData = data.data || 'TEST PERIFERICO\n\n\n';
      const result = await this.provider.send({
        destino: data.nombre,
        data:    testData,
        formato: 'texto',
        _context: { logger: this.logger, eventBus: this.eventBus }
      });
      if (!result.success) {
        this._logError('perifericos.ui.test.send_failed', { nombre: data.nombre, error: result.error }, 'ui_test', 'UPSTREAM_INVALID_RESPONSE');
        return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', result.error, {
          entity_type: 'periferico', entity_id: data.nombre
        });
      }
      return { status: 200, data: { ok: true, destino: data.nombre, bytes: result.data?.bytes } };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.test.failed', err, 'ui_test');
    }
  }

  async handleEstado(data) {
    try {
      if (!data?.nombre) {
        this._logError('perifericos.ui.status.validation_failed', { missing: 'nombre' }, 'ui_status', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const result = await this.provider.status({
        nombre: data.nombre, _context: { logger: this.logger }
      });
      if (!result.success) {
        this._logError('perifericos.ui.status.not_found', { nombre: data.nombre }, 'ui_status', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Dispositivo ${data.nombre} no encontrado`, {
          entity_type: 'periferico', entity_id: data.nombre
        });
      }
      return { status: 200, data: result.data };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.status.failed', err, 'ui_status');
    }
  }

  async handleDescubrir(data) {
    try {
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const result = await this.provider.discover({
        metodo: data?.metodo, _context: { logger: this.logger }
      });
      if (!result.success) {
        this._logError('perifericos.ui.discover.failed', { error: result.error }, 'ui_discover', 'UPSTREAM_INVALID_RESPONSE');
        return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', result.error);
      }

      const registry      = this.provider._getRegistry();
      const registrados   = registry ? registry.listar() : [];
      const descubiertos  = result.data?.descubiertos || [];
      const vistos        = new Set(descubiertos.map(d => d.nombre));
      const dispositivos  = [...descubiertos];
      for (const disp of registrados) {
        if (!vistos.has(disp.nombre)) {
          dispositivos.push({
            nombre:          disp.nombre,
            tipo:            disp.tipo,
            tipo_transporte: disp.transporte?.tipo,
            conectado:       disp.estado === 'online',
            estado:          disp.estado,
            capacidades:     disp.capacidades,
            metadata:        disp.metadata
          });
        }
      }

      return {
        status: 200,
        data: {
          metodo: result.data?.metodo || 'activos',
          dispositivos,
          total:  dispositivos.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.discover.failed', err, 'ui_discover');
    }
  }

  async handleListarPorCapacidad(data) {
    try {
      if (!data?.capacidad) {
        this._logError('perifericos.ui.list_by_cap.validation_failed', { missing: 'capacidad' }, 'ui_list_by_capacidad', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT',
          'capacidad es requerida (imprimir, display, abrir-cajon, etc.)',
          { field: 'capacidad' });
      }
      if (!this.provider) {
        return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'Provider de perifericos no disponible');
      }

      const result = await this.provider.list({
        capacidad: data.capacidad, _context: { logger: this.logger }
      });
      if (!result.success) {
        this._logError('perifericos.ui.list_by_cap.failed', { capacidad: data.capacidad, error: result.error }, 'ui_list_by_capacidad', 'UNKNOWN_ERROR');
        return this._errorResponse(500, 'UNKNOWN_ERROR', result.error);
      }

      const dispositivos = [];
      for (const disp of result.data.dispositivos) {
        const statusResult = await this.provider.status({
          nombre: disp.nombre, _context: { logger: this.logger }
        });
        dispositivos.push({
          nombre:           disp.nombre,
          tipo:             disp.tipo,
          estado:           disp.estado,
          capacidades:      disp.capacidades,
          transporte_tipo:  disp.transporte?.tipo,
          conectado:        statusResult.data?.transporte?.conectado || false,
          metadata:         disp.metadata || {}
        });
      }

      return {
        status: 200,
        data: { capacidad: data.capacidad, dispositivos, total: dispositivos.length }
      };
    } catch (err) {
      return this._handleHandlerError('perifericos.ui.list_by_cap.failed', err, 'ui_list_by_capacidad');
    }
  }

  // ==========================================
  // Auto-descubrimiento ESP32 via MQTT
  // ==========================================

  async _iniciarAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('perifericos.autodiscovery.sin_mqtt');
      return;
    }

    this._onMqttMessage = this._handleDiscoveryMessage.bind(this);
    mqtt.on('message', this._onMqttMessage);

    const topics = ['impresion/+/status/+', 'enki/+/status/+', 'devices/+/+/birth'];
    try {
      for (const t of topics) await mqtt.subscribe(t);
      this.logger.info('perifericos.autodiscovery.iniciado', { topics });
    } catch (err) {
      this.logger.error('perifericos.autodiscovery.subscribe_error', { error: err.message });
      this.metrics?.increment('perifericos.errors', { kind: 'mqtt_subscribe', code: 'UNKNOWN_ERROR' });
    }
  }

  _detenerAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (mqtt && this._onMqttMessage) {
      mqtt.removeListener('message', this._onMqttMessage);
      this._onMqttMessage = null;
    }
  }

  async _handleDiscoveryMessage(topic, payload) {
    const impresionMatch = topic.match(/^impresion\/([^/]+)\/status\/([^/]+)$/);
    const enkiMatch      = topic.match(/^enki\/([^/]+)\/status\/([^/]+)$/);
    const birthMatch     = topic.match(/^devices\/([^/]+)\/([^/]+)\/birth$/);

    if (!impresionMatch && !enkiMatch && !birthMatch) return;

    const projectMatch = impresionMatch || enkiMatch || birthMatch;
    const projectId    = projectMatch[1];
    const deviceId     = projectMatch[2];

    const data = this._parsePayload(payload, 'autodiscovery');
    if (!data) return;

    const registry = this.provider?._getRegistry();
    if (!registry) return;

    const nombrePayload = data.nombre || data.name || data.device_id;
    const existente = registry.obtener(deviceId) || (nombrePayload && registry.obtener(nombrePayload));

    if (existente) {
      registry.actualizarEstado(existente.nombre, 'online');
      return;
    }

    const capacidades = data.capacidades || data.capabilities || ['imprimir'];
    const tipo        = data.tipo || data.type || 'impresora-termica';
    const nombre      = data.nombre || data.name || data.device_id || deviceId;
    const source      = impresionMatch ? 'impresion/status'
                      : enkiMatch      ? 'enki/status'
                                       : 'devices/birth';

    this.logger.info('perifericos.autodiscovery.nuevo_dispositivo', {
      device_id: deviceId, nombre, tipo, capacidades, source, project_id: projectId
    });

    try {
      await this.provider.register({
        nombre, tipo, capacidades,
        transporte: {
          tipo:   'esp32-proxy',
          config: { esp32_device_id: deviceId, project_id: projectId }
        },
        metadata: {
          ip:               data.ip || null,
          firmware:         data.firmware || null,
          printer_name:     data.printer_name || null,
          printer_addr:     data.printer_addr || null,
          auto_descubierto: true,
          descubierto_at:   new Date().toISOString()
        },
        _context: { logger: this.logger, eventBus: this.eventBus }
      });

      this.internalMetrics.registros_total++;
      this.metrics?.increment('perifericos.registros.total', { source: 'autodiscovery' });

      await this._publicarEvento('periferico.dispositivo.registrado', {
        dispositivo:      { nombre, tipo, capacidades },
        auto_descubierto: true,
        source:           'autodiscovery'
      }, { project_id: projectId });
    } catch (err) {
      this.logger.error('perifericos.autodiscovery.registro_error', {
        device_id: deviceId, error: err.message
      });
      this.metrics?.increment('perifericos.errors', { kind: 'autodiscovery', code: 'UNKNOWN_ERROR' });
    }
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
    const status = code === 'INVALID_INPUT'      ? 400 :
                   code === 'RESOURCE_NOT_FOUND'     ? 404 :
                   code === 'PERMISSION_DENIED' ? 403 :
                   code === 'CONFLICT_STATE'               ? 409 :
                   code === 'UPSTREAM_INVALID_RESPONSE'    ? 502 :
                   code === 'UPSTREAM_UNREACHABLE' ? 503 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('perifericos.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('no encontrado'))                     return 'RESOURCE_NOT_FOUND';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (msg.includes('unauthorized') || msg.includes('forbidden'))                      return 'PERMISSION_DENIED';
    if (msg.includes('conflict') || msg.includes('already exists'))                     return 'CONFLICT_STATE';
    if (msg.includes('timeout'))                                                        return 'UPSTREAM_TIMEOUT';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      project_id:     sourcePayload?.project_id || payload?.project_id || DEFAULT_PROJECT_ID,
      timestamp:      new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }

  // 5o helper auxiliar — parser MQTT canonico (mismo patron que device-registry)
  _parsePayload(payload, source = '') {
    try {
      if (typeof payload === 'string')   return JSON.parse(payload);
      if (Buffer.isBuffer(payload))      return JSON.parse(payload.toString());
      return payload;
    } catch {
      this.logger.warn('perifericos.mqtt.parse_error', { source });
      this.metrics?.increment('perifericos.errors', { kind: 'mqtt_parse', code: 'INVALID_INPUT' });
      return null;
    }
  }

  // ==========================================
  // Internals
  // ==========================================

  _unwrap(event) {
    return event?.data || event?.payload || event || {};
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('perifericos.errors', { kind, code });
  }

  _loadProvider() {
    try {
      return require('../../services/providers/local/perifericos');
    } catch (err) {
      this.logger.error('perifericos.provider.load_error', { error: err.message });
      this.metrics?.increment('perifericos.errors', { kind: 'provider_load', code: 'UPSTREAM_UNREACHABLE' });
      return null;
    }
  }
}

module.exports = PerifericosModule;
