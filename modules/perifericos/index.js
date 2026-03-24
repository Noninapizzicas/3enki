/**
 * Módulo Periféricos v1.1.0
 *
 * Servicio core de periféricos a nivel de plataforma.
 * Descubre dispositivos, los registra con nombres lógicos,
 * y los expone como capacidades genéricas via eventos.
 *
 * Los módulos de dominio (pizzepos/impresion, cocina, cobros, cnc, etc.)
 * publican eventos de CAPACIDAD y este módulo resuelve:
 * nombre lógico → dispositivo físico → transporte.
 *
 * Tier: tier_2_platform (carga antes que módulos de dominio)
 *
 * Capacidades:
 *   periferico.imprimir     → enviar datos a impresora
 *   periferico.display      → enviar contenido a pantalla externa
 *   periferico.abrir-cajon  → abrir cajón de dinero (ESC/POS o GPIO)
 *   periferico.estado       → consultar estado
 *   periferico.listar       → listar dispositivos
 *   periferico.registrar    → registrar nuevo dispositivo
 *   periferico.desregistrar → eliminar dispositivo
 *
 * Eventos emitidos:
 *   periferico.impreso     → envío exitoso
 *   periferico.displayed    → contenido enviado a display
 *   periferico.cajon-abierto → cajón abierto exitosamente
 *   periferico.error       → error en envío/conexión
 *   periferico.dispositivo.registrado / .desregistrado
 *   periferico.estado.respuesta / .listado
 */

const path = require('path');

class PerifericosModule {
  constructor() {
    this.name = 'perifericos';
    this.version = '1.2.0';

    this.core = null;
    this.logger = null;
    this.eventBus = null;
    this.metrics = null;
    this.provider = null;
    this.dataPath = path.resolve('./data/perifericos');

    this.internalMetrics = {
      envios_total: 0,
      envios_ok: 0,
      envios_error: 0,
      registros_total: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.core = core;
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;

    if (core.config?.perifericos?.dataPath) {
      this.dataPath = path.resolve(core.config.perifericos.dataPath);
    }

    // Cargar el provider local.perifericos y inicializarlo
    this.provider = this._loadProvider();

    if (this.provider) {
      const dispositivosConfig = core.config?.perifericos?.dispositivos || [];
      await this.provider._initialize({
        dataPath: this.dataPath,
        logger: this.logger,
        dispositivosConfig,
        eventBus: this.eventBus
      });

      this.logger.info('perifericos.provider.inicializado', {
        dispositivos_config: dispositivosConfig.length,
        dispositivos_total: this.provider._getRegistry()?.listar()?.length || 0
      });
    } else {
      this.logger.warn('perifericos.provider.no_encontrado', {
        nota: 'Módulo funciona sin provider — el registro estará vacío'
      });
    }

    // Auto-descubrimiento: escuchar ESP32 que se anuncian por MQTT
    const autoDiscovery = core.config?.perifericos?.descubrimiento?.esp32_auto !== false;
    if (autoDiscovery && this.provider) {
      await this._iniciarAutoDescubrimiento();
    }

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      dataPath: this.dataPath,
      auto_discovery: autoDiscovery
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this._detenerAutoDescubrimiento();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Event Handlers
  // ==========================================

  /**
   * periferico.imprimir — Envía datos a un dispositivo destino.
   * El nombre es genérico ("imprimir") pero funciona para cualquier tipo de envío.
   *
   * Payload:
   *   destino: string — nombre lógico del dispositivo
   *   data: string|Buffer — datos raw (ESC/POS, gcode, texto)
   *   formato: string — 'escpos' | 'texto' | 'imagen' | 'gcode' (default: 'escpos')
   *   prioridad: number — 1 (urgente) a 5 (normal), default 3
   *   opciones: { cortar, copias, ... }
   */
  async onImprimir(event) {
    const data = event?.data || event?.payload || event;
    const { destino, formato, prioridad, opciones } = data;
    let contenido = data.data;

    if (!destino) {
      await this._emitError('destino es requerido', data);
      return;
    }
    if (!contenido) {
      await this._emitError('data es requerido', data);
      return;
    }

    this.internalMetrics.envios_total++;

    this.logger.info('perifericos.enviando', {
      destino,
      formato: formato || 'escpos',
      prioridad: prioridad || 3,
      bytes: typeof contenido === 'string' ? contenido.length : contenido?.length
    });

    // Enviar copias si se solicita
    const copias = opciones?.copias || 1;
    for (let i = 0; i < copias; i++) {
      const result = await this.provider.send({
        destino,
        data: contenido,
        formato,
        opciones,
        _context: { logger: this.logger, eventBus: this.eventBus }
      });

      if (!result.success) {
        this.internalMetrics.envios_error++;
        await this._emitError(result.error, { destino, copia: i + 1 });
        return;
      }
    }

    this.internalMetrics.envios_ok++;

    await this.eventBus.publish('periferico.impreso', {
      destino,
      formato: formato || 'escpos',
      copias,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * periferico.display — Envía contenido a una pantalla externa (TV, LED, tablet fija).
   *
   * Payload:
   *   destino: string — nombre lógico del display (ej: 'display-cocina', 'tv-barra')
   *   data: object — contenido estructurado a mostrar
   *     accion: string — 'mostrar' | 'actualizar' | 'limpiar'
   *     contenido: object — datos a renderizar (formato libre, el display los interpreta)
   *   prioridad: number — 1-5, default 3
   */
  async onDisplay(event) {
    const data = event?.data || event?.payload || event;
    const { destino, prioridad } = data;
    const contenido = data.data;

    if (!destino) {
      await this._emitError('destino es requerido', data);
      return;
    }
    if (!contenido) {
      await this._emitError('data es requerido', data);
      return;
    }

    this.internalMetrics.envios_total++;

    this.logger.info('perifericos.display.enviando', {
      destino,
      accion: contenido.accion || 'mostrar',
      prioridad: prioridad || 3
    });

    const result = await this.provider.send({
      destino,
      data: typeof contenido === 'string' ? contenido : JSON.stringify(contenido),
      formato: 'json',
      opciones: { tipo_capacidad: 'display' },
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) {
      this.internalMetrics.envios_error++;
      await this._emitError(result.error, { destino, capacidad: 'display' });
      return;
    }

    this.internalMetrics.envios_ok++;

    await this.eventBus.publish('periferico.displayed', {
      destino,
      accion: contenido.accion || 'mostrar',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * periferico.abrir-cajon — Abre cajón de dinero.
   * Envía el comando ESC/POS estándar de apertura de cajón (pulse pin 2/5).
   *
   * Payload:
   *   destino: string — nombre lógico de la impresora con cajón conectado (ej: 'caja', 'barra')
   *   pin: number — pin del cajón: 0 (pin 2) o 1 (pin 5), default 0
   */
  async onAbrirCajon(event) {
    const data = event?.data || event?.payload || event;
    const { destino, pin } = data;

    if (!destino) {
      await this._emitError('destino es requerido', data);
      return;
    }

    this.internalMetrics.envios_total++;

    // Comando ESC/POS estándar: ESC p <pin> <t1> <t2>
    // pin 0 = conector 1 (pin 2), pin 1 = conector 2 (pin 5)
    // t1=25, t2=250 → 50ms on, 500ms off
    const pinByte = (pin === 1) ? '\x01' : '\x00';
    const cmdAbrirCajon = `\x1B\x70${pinByte}\x19\xFA`;

    this.logger.info('perifericos.cajon.abriendo', { destino, pin: pin || 0 });

    const result = await this.provider.send({
      destino,
      data: cmdAbrirCajon,
      formato: 'escpos',
      opciones: { tipo_capacidad: 'abrir-cajon' },
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) {
      this.internalMetrics.envios_error++;
      await this._emitError(result.error, { destino, capacidad: 'abrir-cajon' });
      return;
    }

    this.internalMetrics.envios_ok++;

    await this.eventBus.publish('periferico.cajon-abierto', {
      destino,
      pin: pin || 0,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * periferico.estado — Consulta estado de un dispositivo.
   */
  async onEstado(event) {
    const data = event?.data || event?.payload || event;
    const { nombre } = data;

    if (!nombre) {
      await this.eventBus.publish('periferico.estado.respuesta', {
        error: 'nombre es requerido'
      });
      return;
    }

    const result = await this.provider.status({
      nombre,
      _context: { logger: this.logger }
    });

    await this.eventBus.publish('periferico.estado.respuesta', {
      nombre,
      ...result.data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * periferico.listar — Lista todos los dispositivos registrados.
   */
  async onListar(event) {
    const data = event?.data || event?.payload || event || {};
    const { tipo, capacidad } = data;

    const result = await this.provider.list({
      tipo,
      capacidad,
      _context: { logger: this.logger }
    });

    await this.eventBus.publish('periferico.listado', {
      ...result.data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * periferico.registrar — Registra un nuevo dispositivo.
   */
  async onRegistrar(event) {
    const data = event?.data || event?.payload || event;

    const result = await this.provider.register({
      ...data,
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (result.success) {
      this.internalMetrics.registros_total++;
      await this.eventBus.publish('periferico.dispositivo.registrado', {
        dispositivo: result.data.dispositivo,
        timestamp: new Date().toISOString()
      });
    } else {
      await this._emitError(result.error, data);
    }
  }

  /**
   * periferico.desregistrar — Elimina un dispositivo del registro.
   */
  async onDesregistrar(event) {
    const data = event?.data || event?.payload || event;
    const { nombre } = data;

    const result = await this.provider.unregister({
      nombre,
      _context: { logger: this.logger }
    });

    if (result.success && result.data.removed) {
      await this.eventBus.publish('periferico.dispositivo.desregistrado', {
        nombre,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleListar(data) {
    const result = await this.provider.list({
      tipo: data?.tipo,
      capacidad: data?.capacidad,
      _context: { logger: this.logger }
    });

    return { status: 200, data: result.data };
  }

  async handleGet(data) {
    if (!data?.nombre) return { status: 400, error: 'nombre requerido' };

    const result = await this.provider.status({
      nombre: data.nombre,
      _context: { logger: this.logger }
    });

    if (!result.success) return { status: 404, error: result.error };
    return { status: 200, data: result.data };
  }

  async handleRegistrar(data) {
    if (!data?.nombre) return { status: 400, error: 'nombre requerido' };
    if (!data?.transporte?.tipo) return { status: 400, error: 'transporte.tipo requerido' };

    const result = await this.provider.register({
      ...data,
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) return { status: 400, error: result.error };

    this.internalMetrics.registros_total++;
    await this.eventBus.publish('periferico.dispositivo.registrado', {
      dispositivo: result.data.dispositivo,
      timestamp: new Date().toISOString()
    });

    return { status: 201, data: result.data };
  }

  async handleActualizar(data) {
    if (!data?.nombre) return { status: 400, error: 'nombre requerido' };

    try {
      const registry = this.provider._getRegistry();
      const dispositivo = registry.actualizar(data.nombre, data);
      return { status: 200, data: { dispositivo } };
    } catch (err) {
      return { status: err.message.includes('no encontrado') ? 404 : 400, error: err.message };
    }
  }

  async handleDesregistrar(data) {
    if (!data?.nombre) return { status: 400, error: 'nombre requerido' };

    const result = await this.provider.unregister({
      nombre: data.nombre,
      _context: { logger: this.logger }
    });

    if (result.data?.removed) {
      await this.eventBus.publish('periferico.dispositivo.desregistrado', {
        nombre: data.nombre,
        timestamp: new Date().toISOString()
      });
    }

    return { status: 200, data: { removed: result.data?.removed || false } };
  }

  /**
   * Test de envío a un dispositivo — envía un mensaje de prueba.
   */
  async handleTestDispositivo(data) {
    if (!data?.nombre) return { status: 400, error: 'nombre requerido' };

    const testData = data.data || 'TEST PERIFERICO\n\n\n';

    const result = await this.provider.send({
      destino: data.nombre,
      data: testData,
      formato: 'texto',
      _context: { logger: this.logger, eventBus: this.eventBus }
    });

    if (!result.success) return { status: 500, error: result.error };
    return { status: 200, data: { ok: true, destino: data.nombre, bytes: result.data?.bytes } };
  }

  async handleEstado(data) {
    if (!data?.nombre) return { status: 400, error: 'nombre requerido' };

    const result = await this.provider.status({
      nombre: data.nombre,
      _context: { logger: this.logger }
    });

    if (!result.success) return { status: 404, error: result.error };
    return { status: 200, data: result.data };
  }

  /**
   * Descubrimiento de dispositivos.
   * Métodos: 'activos' (default) — reporta estado de transportes conectados.
   * Futuro: 'mdns', 'ble', 'esp32'.
   */
  async handleDescubrir(data) {
    const result = await this.provider.discover({
      metodo: data?.metodo,
      _context: { logger: this.logger }
    });

    if (!result.success) return { status: 500, error: result.error };

    // Combinar descubiertos con dispositivos registrados en el registry
    const registry = this.provider._getRegistry();
    const registrados = registry ? registry.listar() : [];
    const descubiertos = result.data?.descubiertos || [];

    // Unificar: transportes activos + dispositivos registrados (sin duplicados)
    const vistos = new Set(descubiertos.map(d => d.nombre));
    const dispositivos = [...descubiertos];
    for (const disp of registrados) {
      if (!vistos.has(disp.nombre)) {
        dispositivos.push({
          nombre: disp.nombre,
          tipo: disp.tipo,
          tipo_transporte: disp.transporte?.tipo,
          conectado: disp.estado === 'online',
          estado: disp.estado,
          capacidades: disp.capacidades,
          metadata: disp.metadata
        });
      }
    }

    return {
      status: 200,
      data: {
        metodo: result.data?.metodo || 'activos',
        dispositivos,
        total: dispositivos.length
      }
    };
  }

  /**
   * Lista dispositivos filtrados por capacidad.
   * Útil para que otros módulos ofrezcan selección de dispositivo al usuario.
   *
   * Ejemplo: mqttRequest('perifericos', 'listar-por-capacidad', { capacidad: 'imprimir' })
   * Retorna solo dispositivos con esa capacidad + su estado actual.
   */
  async handleListarPorCapacidad(data) {
    if (!data?.capacidad) return { status: 400, error: 'capacidad requerida (imprimir, display, abrir-cajon, cortar, etc.)' };

    const result = await this.provider.list({
      capacidad: data.capacidad,
      _context: { logger: this.logger }
    });

    if (!result.success) return { status: 500, error: result.error };

    // Enriquecer con estado de transporte activo
    const dispositivos = [];
    for (const disp of result.data.dispositivos) {
      const statusResult = await this.provider.status({
        nombre: disp.nombre,
        _context: { logger: this.logger }
      });
      dispositivos.push({
        nombre: disp.nombre,
        tipo: disp.tipo,
        estado: disp.estado,
        capacidades: disp.capacidades,
        transporte_tipo: disp.transporte?.tipo,
        conectado: statusResult.data?.transporte?.conectado || false,
        metadata: disp.metadata || {}
      });
    }

    return {
      status: 200,
      data: {
        capacidad: data.capacidad,
        dispositivos,
        total: dispositivos.length
      }
    };
  }

  // ==========================================
  // Auto-descubrimiento ESP32
  // ==========================================

  /**
   * Suscribe a topics MQTT de ESP32 para auto-registrar dispositivos.
   *
   * Escucha:
   *   esp32/+/status           → ESP32 genéricos que publican su estado
   *   periferico/+/status      → ESP32 proxy que publican como periférico
   *
   * Cuando un ESP32 se anuncia, se auto-registra en el registry con:
   *   nombre: esp32_device_id (ej: "esp32-cocina-01")
   *   tipo: inferido de capacidades declaradas o "impresora-termica" por defecto
   *   transporte: esp32-proxy
   */
  async _iniciarAutoDescubrimiento() {
    const mqtt = this.eventBus?.mqtt;
    if (!mqtt || !mqtt.isConnected) {
      this.logger.warn('perifericos.autodiscovery.sin_mqtt', {
        nota: 'MQTT no disponible — auto-descubrimiento deshabilitado'
      });
      return;
    }

    this._onMqttMessage = this._handleDiscoveryMessage.bind(this);
    mqtt.on('message', this._onMqttMessage);

    try {
      await mqtt.subscribe('esp32/+/status');
      await mqtt.subscribe('periferico/+/status');
      await mqtt.subscribe('impresion/+/status/+');
      await mqtt.subscribe('enki/+/status/+');
      await mqtt.subscribe('devices/+/+/birth');
      this.logger.info('perifericos.autodiscovery.iniciado', {
        topics: ['esp32/+/status', 'periferico/+/status', 'impresion/+/status/+', 'enki/+/status/+', 'devices/+/+/birth']
      });
    } catch (err) {
      this.logger.warn('perifericos.autodiscovery.subscribe_error', {
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
   * Procesa mensajes MQTT de descubrimiento.
   * Patterns:
   *   esp32/{deviceId}/status              → { ip, firmware, capacidades?, tipo?, nombre? }
   *   periferico/{deviceId}/status          → { online, capacidades?, tipo? }
   *   impresion/{projectId}/status/{deviceId} → { device_id, online, printer_ready, ip, ... }
   */
  async _handleDiscoveryMessage(topic, payload) {
    // Solo procesar topics de discovery
    const esp32Match = topic.match(/^esp32\/([^/]+)\/status$/);
    const perifMatch = topic.match(/^periferico\/([^/]+)\/status$/);
    const impresionMatch = topic.match(/^impresion\/([^/]+)\/status\/([^/]+)$/);
    const enkiMatch = topic.match(/^enki\/([^/]+)\/status\/([^/]+)$/);
    const birthMatch = topic.match(/^devices\/([^/]+)\/([^/]+)\/birth$/);

    if (!esp32Match && !perifMatch && !impresionMatch && !enkiMatch && !birthMatch) return;

    const deviceId = (impresionMatch || enkiMatch) ? (impresionMatch || enkiMatch)[2]
                   : birthMatch ? birthMatch[2]
                   : (esp32Match || perifMatch)[1];
    let data;

    try {
      data = typeof payload === 'string' ? JSON.parse(payload)
           : Buffer.isBuffer(payload) ? JSON.parse(payload.toString())
           : payload;
    } catch {
      return; // Payload no es JSON válido — ignorar
    }

    // Verificar si ya existe en registry
    const registry = this.provider._getRegistry();
    if (!registry) return;

    // Buscar por deviceId o por nombre del payload (el firmware envía device_id)
    const nombrePayload = data.nombre || data.name || data.device_id;
    const existente = registry.obtener(deviceId) || (nombrePayload && registry.obtener(nombrePayload));

    if (existente) {
      // Ya registrado — actualizar estado a online
      registry.actualizarEstado(existente.nombre, 'online');
      return;
    }

    // Auto-registrar nuevo dispositivo
    const capacidades = data.capacidades || data.capabilities || ['imprimir'];
    const tipo = data.tipo || data.type || 'impresora-termica';
    const nombre = data.nombre || data.name || data.device_id || deviceId;
    const source = impresionMatch ? 'impresion/status'
                 : enkiMatch ? 'enki/status'
                 : birthMatch ? 'devices/birth'
                 : esp32Match ? 'esp32/status'
                 : 'periferico/status';

    this.logger.info('perifericos.autodiscovery.nuevo_dispositivo', {
      deviceId, nombre, tipo, capacidades, source
    });

    // El projectId va en la config del transporte
    const transporteConfig = { esp32_device_id: deviceId };
    if (impresionMatch) {
      transporteConfig.project_id = impresionMatch[1];
    } else if (enkiMatch) {
      transporteConfig.project_id = enkiMatch[1];
    } else if (birthMatch) {
      transporteConfig.project_id = birthMatch[1];
    }

    try {
      await this.provider.register({
        nombre,
        tipo,
        capacidades,
        transporte: {
          tipo: 'esp32-proxy',
          config: transporteConfig
        },
        metadata: {
          ip: data.ip || null,
          firmware: data.firmware || null,
          printer_name: data.printer_name || null,
          printer_addr: data.printer_addr || null,
          auto_descubierto: true,
          descubierto_at: new Date().toISOString()
        },
        _context: { logger: this.logger, eventBus: this.eventBus }
      });

      this.internalMetrics.registros_total++;

      await this.eventBus.publish('periferico.dispositivo.registrado', {
        nombre,
        tipo,
        capacidades,
        auto_descubierto: true,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      this.logger.warn('perifericos.autodiscovery.registro_error', {
        deviceId, error: err.message
      });
    }
  }

  // ==========================================
  // Internal
  // ==========================================

  _loadProvider() {
    try {
      return require('../../services/providers/local/perifericos');
    } catch (err) {
      this.logger.error('perifericos.provider.load_error', { error: err.message });
      return null;
    }
  }

  async _emitError(error, contexto) {
    this.logger.error('perifericos.error', { error, ...contexto });
    await this.eventBus.publish('periferico.error', {
      error,
      contexto,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = PerifericosModule;
