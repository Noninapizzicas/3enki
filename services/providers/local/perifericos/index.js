/**
 * Local Perifericos Provider
 *
 * Registro de dispositivos periféricos y routing a transportes.
 * Es un provider "tonto" — ejecuta operaciones CRUD sobre el registry
 * y envía datos al transporte correcto. La inteligencia (qué imprimir,
 * cuándo, con qué prioridad) está en modules/perifericos/.
 *
 * Transportes soportados:
 *   - ble-directo: Bluetooth rfcomm directo
 *   - tcp: Socket TCP (impresoras de red, CNC)
 *   - esp32-proxy: ESP32 como bridge via MQTT
 *   - comando: Pipe a comando shell (CUPS, lp)
 *
 * @version 1.0.0
 */

const DeviceRegistry = require('./registry');
const TransporteBLE = require('./transportes/ble');
const TransporteTCP = require('./transportes/tcp');
const TransporteESP32Proxy = require('./transportes/esp32-proxy');
const TransporteComando = require('./transportes/comando');

const TRANSPORTE_CLASSES = {
  'ble-directo': TransporteBLE,
  'tcp': TransporteTCP,
  'esp32-proxy': TransporteESP32Proxy,
  'comando': TransporteComando
};

// Instancias de transporte activas (nombre dispositivo → transporte)
const transportesActivos = new Map();

// Registry de dispositivos
let registry = null;

module.exports = {
  name: 'local.perifericos',
  description: 'Servicio core de periféricos — registro de dispositivos y routing a transportes',

  functions: {
    register: {
      event: 'local.perifericos.register.request',
      description: 'Registra un nuevo dispositivo periférico',
      input: {
        nombre: { type: 'string', required: true },
        tipo: { type: 'string', required: true },
        capacidades: { type: 'array', required: false },
        transporte: { type: 'object', required: true },
        metadata: { type: 'object', required: false }
      }
    },
    unregister: {
      event: 'local.perifericos.unregister.request',
      description: 'Desregistra un dispositivo',
      input: {
        nombre: { type: 'string', required: true }
      }
    },
    send: {
      event: 'local.perifericos.send.request',
      description: 'Envía datos a un dispositivo',
      input: {
        destino: { type: 'string', required: true },
        data: { type: 'string', required: true },
        formato: { type: 'string', required: false },
        opciones: { type: 'object', required: false }
      }
    },
    status: {
      event: 'local.perifericos.status.request',
      description: 'Estado de un dispositivo',
      input: {
        nombre: { type: 'string', required: true }
      }
    },
    list: {
      event: 'local.perifericos.list.request',
      description: 'Lista dispositivos registrados',
      input: {
        tipo: { type: 'string', required: false },
        capacidad: { type: 'string', required: false }
      }
    }
  },

  /**
   * Inicializa el registry. Llamado por el módulo perifericos en onLoad.
   * @param {Object} options
   * @param {string} options.dataPath
   * @param {Object} options.logger
   * @param {Object[]} [options.dispositivosConfig] - Dispositivos pre-registrados
   * @param {Object} [options.eventBus] - EventBus para transportes ESP32-proxy
   */
  async _initialize(options = {}) {
    const { dataPath, logger, dispositivosConfig, eventBus } = options;

    registry = new DeviceRegistry({
      dataPath: dataPath || './data/perifericos',
      logger: logger || console
    });

    await registry.initialize(dispositivosConfig);

    // Pre-crear transportes para dispositivos existentes
    for (const disp of registry.listar()) {
      try {
        _crearTransporte(disp, logger, eventBus);
      } catch (err) {
        (logger || console).warn('perifericos.transporte.init_skip', {
          nombre: disp.nombre,
          error: err.message
        });
      }
    }

    return registry;
  },

  _getRegistry() {
    return registry;
  },

  // ==========================================
  // Provider Functions
  // ==========================================

  async register({ nombre, tipo, capacidades, transporte, metadata, _context }) {
    _ensureRegistry();

    try {
      const dispositivo = registry.registrar({ nombre, tipo, capacidades, transporte, metadata });

      // Crear instancia de transporte
      const logger = _context?.logger || console;
      const eventBus = _context?.eventBus || null;
      _crearTransporte(dispositivo, logger, eventBus);

      return {
        success: true,
        data: { dispositivo }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async unregister({ nombre, _context }) {
    _ensureRegistry();

    // Desconectar transporte activo
    const transporte = transportesActivos.get(nombre);
    if (transporte) {
      await transporte.desconectar();
      transportesActivos.delete(nombre);
    }

    const removed = registry.desregistrar(nombre);
    return {
      success: true,
      data: { removed }
    };
  },

  async send({ destino, data, formato, opciones, _context }) {
    _ensureRegistry();

    const dispositivo = registry.obtener(destino);
    if (!dispositivo) {
      return { success: false, error: `Dispositivo '${destino}' no encontrado` };
    }

    let transporte = transportesActivos.get(dispositivo.nombre);
    if (!transporte) {
      const logger = _context?.logger || console;
      const eventBus = _context?.eventBus || null;
      transporte = _crearTransporte(dispositivo, logger, eventBus);
    }

    if (!transporte) {
      return { success: false, error: `No hay transporte disponible para '${destino}'` };
    }

    // Conectar si no está conectado
    const estado = await transporte.getEstado();
    if (!estado.conectado) {
      const connResult = await transporte.conectar();
      if (!connResult.ok) {
        registry.actualizarEstado(dispositivo.nombre, 'error');
        return { success: false, error: `Error conectando: ${connResult.error}` };
      }
    }

    const result = await transporte.enviar(data, opciones);

    if (result.ok) {
      registry.actualizarEstado(dispositivo.nombre, 'online');
    } else {
      registry.actualizarEstado(dispositivo.nombre, 'error');
    }

    return {
      success: result.ok,
      data: result.ok ? { ok: true, bytes: result.bytes, destino } : undefined,
      error: result.ok ? undefined : result.error
    };
  },

  async status({ nombre, _context }) {
    _ensureRegistry();

    const dispositivo = registry.obtener(nombre);
    if (!dispositivo) {
      return { success: false, error: `Dispositivo '${nombre}' no encontrado` };
    }

    const transporte = transportesActivos.get(dispositivo.nombre);
    const estadoTransporte = transporte ? await transporte.getEstado() : null;

    return {
      success: true,
      data: {
        dispositivo,
        transporte: estadoTransporte
      }
    };
  },

  async list({ tipo, capacidad, _context }) {
    _ensureRegistry();

    const dispositivos = registry.listar({ tipo, capacidad });
    return {
      success: true,
      data: {
        dispositivos,
        total: dispositivos.length
      }
    };
  },

  /**
   * Descubrimiento de dispositivos.
   * Intenta detectar dispositivos disponibles según el método solicitado.
   * Actualmente soporta: transportes activos (reporte de conectados).
   * Futuro: mDNS, BLE scan, ESP32 auto-discovery.
   *
   * @param {string} [metodo] - Método de descubrimiento: 'activos' | 'mdns' | 'ble' (default: 'activos')
   */
  async discover({ metodo, _context } = {}) {
    _ensureRegistry();

    const metodoFinal = metodo || 'activos';
    const logger = _context?.logger || console;

    if (metodoFinal === 'activos') {
      // Reportar dispositivos con transporte activo y su estado de conexión
      const descubiertos = [];
      for (const [nombre, transporte] of transportesActivos.entries()) {
        const estado = await transporte.getEstado();
        descubiertos.push({
          nombre,
          tipo_transporte: transporte.tipo,
          conectado: estado.conectado,
          estado: estado.estado,
          info: estado.info || {}
        });
      }

      return {
        success: true,
        data: {
          metodo: metodoFinal,
          descubiertos,
          total: descubiertos.length
        }
      };
    }

    // Métodos futuros: mdns, ble, esp32
    logger.info('perifericos.discover.metodo_futuro', { metodo: metodoFinal });
    return {
      success: true,
      data: {
        metodo: metodoFinal,
        descubiertos: [],
        total: 0,
        nota: `Método '${metodoFinal}' aún no implementado. Disponible: 'activos'.`
      }
    };
  }
};

// ==========================================
// Internal helpers
// ==========================================

function _ensureRegistry() {
  if (!registry) {
    throw new Error('Provider no inicializado. Llama a _initialize() primero.');
  }
}

/**
 * Crea una instancia de transporte para un dispositivo y la cachea.
 */
function _crearTransporte(dispositivo, logger, eventBus) {
  const { tipo, config } = dispositivo.transporte;
  const TransporteClass = TRANSPORTE_CLASSES[tipo];

  if (!TransporteClass) {
    (logger || console).warn('perifericos.transporte.tipo_desconocido', {
      nombre: dispositivo.nombre,
      tipo
    });
    return null;
  }

  const deps = tipo === 'esp32-proxy' ? { eventBus } : undefined;
  const transporte = deps
    ? new TransporteClass(config, logger, deps)
    : new TransporteClass(config, logger);

  transportesActivos.set(dispositivo.nombre, transporte);
  return transporte;
}
