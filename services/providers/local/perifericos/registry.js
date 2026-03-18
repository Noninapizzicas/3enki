/**
 * DeviceRegistry — Registro de dispositivos periféricos
 *
 * Mantiene un inventario de todos los dispositivos conocidos con su
 * nombre lógico, capacidades, transporte y estado actual.
 *
 * Persistencia: JSON en data/perifericos/dispositivos.json
 *
 * Cada dispositivo tiene:
 *   - id: UUID auto-generado
 *   - nombre: nombre lógico único ('cocina', 'barra', 'cnc-taller')
 *   - tipo: tipo de dispositivo ('impresora-termica', 'cnc', 'escaner')
 *   - capacidades: ['imprimir', 'cortar-papel', ...]
 *   - transporte: { tipo, config }
 *   - estado: 'online' | 'offline' | 'error'
 *   - ultimo_contacto: ISO timestamp
 *   - metadata: { marca, modelo, ancho, firmware, ... }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DeviceRegistry {
  /**
   * @param {Object} options
   * @param {string} options.dataPath - Ruta al directorio de datos
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.resolve('./data/perifericos');
    this.logger = options.logger || console;
    this.filePath = path.join(this.dataPath, 'dispositivos.json');

    /** @type {Map<string, Object>} id → dispositivo */
    this.dispositivos = new Map();

    /** @type {Map<string, string>} nombre → id (índice para búsqueda rápida) */
    this.indiceNombre = new Map();
  }

  /**
   * Inicializa el registry: crea directorio y carga datos persistidos.
   * @param {Object[]} [dispositivosConfig] - Dispositivos pre-registrados desde config.json
   */
  async initialize(dispositivosConfig) {
    // Asegurar directorio
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Cargar datos persistidos
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const lista = JSON.parse(raw);
        for (const disp of lista) {
          this.dispositivos.set(disp.id, disp);
          this.indiceNombre.set(disp.nombre, disp.id);
        }
        this.logger.info('perifericos.registry.cargado', { count: this.dispositivos.size });
      } catch (err) {
        this.logger.warn('perifericos.registry.error_carga', { error: err.message });
      }
    }

    // Merge con config: registrar dispositivos de config que no existan
    if (Array.isArray(dispositivosConfig)) {
      for (const cfg of dispositivosConfig) {
        if (!cfg.nombre) continue;
        if (!this.indiceNombre.has(cfg.nombre)) {
          this.registrar(cfg);
        }
      }
    }
  }

  /**
   * Registra un nuevo dispositivo.
   * @param {Object} datos
   * @param {string} datos.nombre - Nombre lógico único
   * @param {string} datos.tipo - Tipo de dispositivo
   * @param {string[]} [datos.capacidades] - Capacidades del dispositivo
   * @param {Object} datos.transporte - { tipo, config }
   * @param {Object} [datos.metadata] - Metadatos adicionales
   * @returns {Object} El dispositivo registrado
   */
  registrar(datos) {
    if (!datos.nombre) throw new Error('nombre es requerido');
    if (!datos.transporte?.tipo) throw new Error('transporte.tipo es requerido');

    // No duplicar nombres
    if (this.indiceNombre.has(datos.nombre)) {
      throw new Error(`Ya existe un dispositivo con nombre '${datos.nombre}'`);
    }

    const dispositivo = {
      id: crypto.randomUUID(),
      nombre: datos.nombre,
      tipo: datos.tipo || 'generico',
      capacidades: datos.capacidades || [],
      transporte: {
        tipo: datos.transporte.tipo,
        config: datos.transporte.config || {}
      },
      estado: 'offline',
      ultimo_contacto: null,
      metadata: datos.metadata || {},
      registrado_at: new Date().toISOString()
    };

    this.dispositivos.set(dispositivo.id, dispositivo);
    this.indiceNombre.set(dispositivo.nombre, dispositivo.id);
    this._persistir();

    this.logger.info('perifericos.registry.registrado', {
      id: dispositivo.id,
      nombre: dispositivo.nombre,
      tipo: dispositivo.tipo,
      transporte: dispositivo.transporte.tipo
    });

    return dispositivo;
  }

  /**
   * Desregistra un dispositivo por nombre o ID.
   * @param {string} nombreOId
   * @returns {boolean}
   */
  desregistrar(nombreOId) {
    const disp = this.obtener(nombreOId);
    if (!disp) return false;

    this.dispositivos.delete(disp.id);
    this.indiceNombre.delete(disp.nombre);
    this._persistir();

    this.logger.info('perifericos.registry.desregistrado', {
      id: disp.id,
      nombre: disp.nombre
    });
    return true;
  }

  /**
   * Obtiene un dispositivo por nombre o ID.
   * @param {string} nombreOId
   * @returns {Object|null}
   */
  obtener(nombreOId) {
    // Buscar por ID directo
    if (this.dispositivos.has(nombreOId)) {
      return this.dispositivos.get(nombreOId);
    }
    // Buscar por nombre
    const id = this.indiceNombre.get(nombreOId);
    return id ? this.dispositivos.get(id) : null;
  }

  /**
   * Actualiza un dispositivo existente (merge parcial).
   * @param {string} nombreOId
   * @param {Object} cambios
   * @returns {Object} Dispositivo actualizado
   */
  actualizar(nombreOId, cambios) {
    const disp = this.obtener(nombreOId);
    if (!disp) throw new Error(`Dispositivo '${nombreOId}' no encontrado`);

    // Si cambia el nombre, actualizar índice
    if (cambios.nombre && cambios.nombre !== disp.nombre) {
      if (this.indiceNombre.has(cambios.nombre)) {
        throw new Error(`Ya existe un dispositivo con nombre '${cambios.nombre}'`);
      }
      this.indiceNombre.delete(disp.nombre);
      this.indiceNombre.set(cambios.nombre, disp.id);
    }

    // Merge campos permitidos
    const camposPermitidos = ['nombre', 'tipo', 'capacidades', 'metadata'];
    for (const campo of camposPermitidos) {
      if (cambios[campo] !== undefined) {
        disp[campo] = cambios[campo];
      }
    }

    // Merge transporte (deep)
    if (cambios.transporte) {
      disp.transporte = {
        ...disp.transporte,
        ...cambios.transporte,
        config: { ...(disp.transporte.config || {}), ...(cambios.transporte.config || {}) }
      };
    }

    this._persistir();
    return disp;
  }

  /**
   * Actualiza el estado de un dispositivo (online/offline/error).
   * @param {string} nombreOId
   * @param {string} estado - 'online' | 'offline' | 'error'
   */
  actualizarEstado(nombreOId, estado) {
    const disp = this.obtener(nombreOId);
    if (!disp) return;

    disp.estado = estado;
    if (estado === 'online') {
      disp.ultimo_contacto = new Date().toISOString();
    }
    // No persistir en cada cambio de estado (es transitorio)
  }

  /**
   * Lista todos los dispositivos.
   * @param {Object} [filtro]
   * @param {string} [filtro.tipo] - Filtrar por tipo
   * @param {string} [filtro.capacidad] - Filtrar por capacidad
   * @param {string} [filtro.estado] - Filtrar por estado
   * @returns {Object[]}
   */
  listar(filtro) {
    let lista = Array.from(this.dispositivos.values());

    if (filtro?.tipo) {
      lista = lista.filter(d => d.tipo === filtro.tipo);
    }
    if (filtro?.capacidad) {
      lista = lista.filter(d => d.capacidades.includes(filtro.capacidad));
    }
    if (filtro?.estado) {
      lista = lista.filter(d => d.estado === filtro.estado);
    }

    return lista;
  }

  /**
   * Busca dispositivos por capacidad.
   * @param {string} capacidad
   * @returns {Object[]}
   */
  buscarPorCapacidad(capacidad) {
    return this.listar({ capacidad });
  }

  // --- Internal ---

  _persistir() {
    try {
      const lista = Array.from(this.dispositivos.values());
      fs.writeFileSync(this.filePath, JSON.stringify(lista, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('perifericos.registry.error_persistir', { error: err.message });
    }
  }
}

module.exports = DeviceRegistry;
