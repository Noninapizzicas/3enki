/**
 * Producto Button Component
 * Botón rectangular para productos - 30mm×12mm
 * Version: 1.0.0
 */

class ProductoButton {
  /**
   * @param {HTMLElement} element - El elemento button del DOM
   * @param {Object} options - Opciones de configuración
   * @param {string} options.id - ID único del producto
   * @param {string} options.nombre - Nombre del producto
   * @param {number} options.precio - Precio del producto
   * @param {string} options.categoria - Categoría: pizzas, bebidas, entrantes, postres, etc.
   * @param {string} [options.evento] - Evento: normal, oferta, promocion, sin_stock, etc.
   * @param {Object} [options.emojis] - Emojis personalizados
   * @param {string} [options.descripcion] - Descripción del producto
   * @param {boolean} [options.disponible] - Si está disponible
   * @param {Object} [options.config] - Configuración adicional
   */
  constructor(element, options = {}) {
    // Validación básica
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error('ProductoButton: elemento DOM inválido');
    }

    if (!options.id || !options.nombre || options.precio === undefined || !options.categoria) {
      throw new Error('ProductoButton: faltan propiedades requeridas (id, nombre, precio, categoria)');
    }

    // Validar categoría
    const categoriasValidas = [
      'pizzas', 'bebidas', 'entrantes', 'postres',
      'ensaladas', 'pasta', 'carnes', 'pescados', 'otros'
    ];
    if (!categoriasValidas.includes(options.categoria)) {
      throw new Error(`ProductoButton: categoría "${options.categoria}" no válida`);
    }

    // Validar evento si existe
    if (options.evento) {
      const eventosValidos = [
        'normal', 'oferta', 'promocion', 'sin_stock',
        'no_disponible', 'destacado', 'nuevo', 'vegano', 'picante'
      ];
      if (!eventosValidos.includes(options.evento)) {
        throw new Error(`ProductoButton: evento "${options.evento}" no válido`);
      }
    }

    // Propiedades
    this.element = element;
    this.id = options.id;
    this.nombre = options.nombre;
    this.precio = options.precio;
    this.categoria = options.categoria;
    this.evento = options.evento || 'normal';
    this.descripcion = options.descripcion || '';
    this.disponible = options.disponible !== false;
    this.emojis = options.emojis || this._getDefaultEmojis(this.evento);
    this.config = {
      apiBaseUrl: options.config?.apiBaseUrl || 'http://localhost:3000/api',
      mqttUrl: options.config?.mqttUrl || 'ws://localhost:9001',
      enableMQTT: options.config?.enableMQTT !== false,
      enableRipple: options.config?.enableRipple !== false,
      enableHaptic: options.config?.enableHaptic !== false,
      ...options.config
    };

    // Estado interno
    this._loading = false;
    this._mqttClient = null;
    this._touchStartTime = 0;
    this._touchStartPos = null;
    this._eventListeners = {};

    // Inicializar
    this._init();
  }

  /**
   * Inicializa el componente
   * @private
   */
  _init() {
    // Renderizar estructura HTML si no existe
    if (!this.element.querySelector('.producto-button__marco')) {
      this._renderStructure();
    }

    // Actualizar contenido
    this._updateContent();

    // Establecer atributos de datos
    this.element.setAttribute('data-component', 'producto-button');
    this.element.setAttribute('data-id', this.id);
    this.element.setAttribute('data-categoria', this.categoria);
    this.element.setAttribute('data-evento', this.evento);

    // Event listeners
    this._attachEventListeners();

    // Conectar a MQTT si está habilitado
    if (this.config.enableMQTT) {
      this._connectMQTT();
    }

    // Cargar datos desde API
    this._loadFromAPI();
  }

  /**
   * Renderiza la estructura HTML del componente
   * @private
   */
  _renderStructure() {
    this.element.innerHTML = `
      <!-- Marco exterior -->
      <div class="producto-button__marco"></div>

      <!-- Área de contenido -->
      <div class="producto-button__content">
        <div class="producto-button__nombre"></div>
        <div class="producto-button__precio"></div>
      </div>

      <!-- Emojis en esquinas -->
      <div class="producto-button__corners">
        <span class="producto-button__emoji producto-button__emoji--top-left"></span>
        <span class="producto-button__emoji producto-button__emoji--top-right"></span>
        <span class="producto-button__emoji producto-button__emoji--bottom-left"></span>
      </div>

      <!-- Touch zones -->
      <div class="producto-button__touch-zone producto-button__touch-zone--left" data-action="variations"></div>
      <div class="producto-button__touch-zone producto-button__touch-zone--right" data-action="add"></div>

      <!-- Overlay -->
      <div class="producto-button__overlay"></div>

      <!-- Ripple -->
      <div class="producto-button__ripple"></div>

      <!-- Screen reader -->
      <span class="sr-only">
        <span class="producto-button__sr-nombre"></span>,
        Precio: <span class="producto-button__sr-precio"></span>,
        Categoría: <span class="producto-button__sr-categoria"></span>,
        Estado: <span class="producto-button__sr-evento"></span>
      </span>
    `;
  }

  /**
   * Actualiza el contenido del componente
   * @private
   */
  _updateContent() {
    // Nombre
    const nombreEl = this.element.querySelector('.producto-button__nombre');
    if (nombreEl) nombreEl.textContent = this.nombre;

    // Precio
    const precioEl = this.element.querySelector('.producto-button__precio');
    if (precioEl) precioEl.textContent = this._formatPrecio(this.precio);

    // Emojis
    this._updateEmojis();

    // Screen reader
    this._updateScreenReaderInfo();
  }

  /**
   * Actualiza emojis en esquinas
   * @private
   */
  _updateEmojis() {
    const positions = ['top-left', 'top-right', 'bottom-left'];
    const emojiMap = {
      'top-left': this.emojis.topLeft || this.emojis['top-left'] || '',
      'top-right': this.emojis.topRight || this.emojis['top-right'] || '',
      'bottom-left': this.emojis.bottomLeft || this.emojis['bottom-left'] || ''
    };

    positions.forEach(position => {
      const emojiEl = this.element.querySelector(`.producto-button__emoji--${position}`);
      if (emojiEl) {
        emojiEl.textContent = emojiMap[position];
      }
    });
  }

  /**
   * Actualiza información para lectores de pantalla
   * @private
   */
  _updateScreenReaderInfo() {
    const setScreenReaderText = (selector, text) => {
      const el = this.element.querySelector(selector);
      if (el) el.textContent = text;
    };

    setScreenReaderText('.producto-button__sr-nombre', this.nombre);
    setScreenReaderText('.producto-button__sr-precio', this._formatPrecio(this.precio));
    setScreenReaderText('.producto-button__sr-categoria', this.categoria);
    setScreenReaderText('.producto-button__sr-evento', this.evento);
  }

  /**
   * Adjunta event listeners
   * @private
   */
  _attachEventListeners() {
    // Click en touch zones
    const leftZone = this.element.querySelector('.producto-button__touch-zone--left');
    const rightZone = this.element.querySelector('.producto-button__touch-zone--right');

    if (leftZone) {
      leftZone.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleVariationsClick(e);
      });
    }

    if (rightZone) {
      rightZone.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleAddClick(e);
      });
    }

    // Click en el botón general
    this.element.addEventListener('click', (e) => {
      if (!e.target.closest('.producto-button__touch-zone')) {
        this._handleGeneralClick(e);
      }
    });

    // Touch events para ripple y haptics
    this.element.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: true });
    this.element.addEventListener('touchend', (e) => this._handleTouchEnd(e));
    this.element.addEventListener('mousedown', (e) => this._handleMouseDown(e));

    // Keyboard accessibility
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._handleAddClick(e);
      }
    });
  }

  /**
   * Maneja click en zona de variaciones (left 30%)
   * @private
   */
  _handleVariationsClick(event) {
    if (!this.disponible || this.evento === 'sin_stock' || this.evento === 'no_disponible') {
      return;
    }

    this.emit('producto:variations', {
      id: this.id,
      nombre: this.nombre,
      event
    });

    const customEvent = new CustomEvent('producto:variations', {
      detail: {
        id: this.id,
        nombre: this.nombre,
        categoria: this.categoria,
        precio: this.precio
      },
      bubbles: true
    });
    this.element.dispatchEvent(customEvent);
  }

  /**
   * Maneja click en zona de añadir (right 70%)
   * @private
   */
  _handleAddClick(event) {
    if (!this.disponible || this.evento === 'sin_stock' || this.evento === 'no_disponible') {
      return;
    }

    // Haptic feedback
    if (this.config.enableHaptic && navigator.vibrate) {
      navigator.vibrate(10);
    }

    // Enviar a API
    this._addToOrder();

    this.emit('producto:add', {
      id: this.id,
      nombre: this.nombre,
      precio: this.precio,
      categoria: this.categoria
    });

    const customEvent = new CustomEvent('producto:add', {
      detail: {
        id: this.id,
        nombre: this.nombre,
        precio: this.precio,
        categoria: this.categoria
      },
      bubbles: true
    });
    this.element.dispatchEvent(customEvent);
  }

  /**
   * Maneja click general
   * @private
   */
  _handleGeneralClick(event) {
    this.emit('producto:click', {
      id: this.id,
      nombre: this.nombre
    });

    const customEvent = new CustomEvent('producto:click', {
      detail: {
        id: this.id,
        nombre: this.nombre,
        categoria: this.categoria,
        precio: this.precio
      },
      bubbles: true
    });
    this.element.dispatchEvent(customEvent);
  }

  /**
   * Maneja touch start (para ripple effect)
   * @private
   */
  _handleTouchStart(event) {
    this._touchStartTime = Date.now();

    if (event.touches && event.touches[0]) {
      this._touchStartPos = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    }

    if (this.config.enableRipple) {
      this._showRipple(event);
    }
  }

  /**
   * Maneja touch end
   * @private
   */
  _handleTouchEnd(event) {
    const touchDuration = Date.now() - this._touchStartTime;

    // Long press detection (no usado actualmente)
    if (touchDuration > 500) {
      // Podría emitir evento long-press aquí
    }
  }

  /**
   * Maneja mouse down (para ripple en desktop)
   * @private
   */
  _handleMouseDown(event) {
    if (this.config.enableRipple) {
      this._showRipple(event);
    }
  }

  /**
   * Muestra efecto ripple
   * @private
   */
  _showRipple(event) {
    const rippleEl = this.element.querySelector('.producto-button__ripple');
    if (!rippleEl) return;

    rippleEl.classList.remove('active');
    void rippleEl.offsetWidth; // Force reflow
    rippleEl.classList.add('active');

    setTimeout(() => {
      rippleEl.classList.remove('active');
    }, 600);
  }

  /**
   * Conecta a MQTT para actualizaciones en tiempo real
   * @private
   */
  async _connectMQTT() {
    try {
      if (typeof Paho === 'undefined' || !Paho.MQTT) {
        console.warn('ProductoButton: Paho MQTT no disponible');
        return;
      }

      const clientId = `producto-button-${this.id}-${Date.now()}`;
      this._mqttClient = new Paho.MQTT.Client(
        this.config.mqttUrl.replace('ws://', '').replace('wss://', ''),
        Number(this.config.mqttUrl.split(':').pop()) || 9001,
        clientId
      );

      this._mqttClient.onConnectionLost = (response) => {
        console.warn('ProductoButton: Conexión MQTT perdida:', response.errorMessage);
        setTimeout(() => this._connectMQTT(), 5000);
      };

      this._mqttClient.onMessageArrived = (message) => {
        this._handleMQTTMessage(message);
      };

      await new Promise((resolve, reject) => {
        this._mqttClient.connect({
          onSuccess: resolve,
          onFailure: reject,
          cleanSession: true,
          keepAliveInterval: 30
        });
      });

      // Suscribirse a topics
      this._mqttClient.subscribe(`/events/productos/${this.id}/stock`);
      this._mqttClient.subscribe(`/events/productos/${this.id}/precio`);
      this._mqttClient.subscribe(`/events/productos/${this.id}/evento`);

      console.log(`ProductoButton: Conectado a MQTT para producto ${this.id}`);

    } catch (error) {
      console.error('ProductoButton: Error conectando a MQTT:', error);
    }
  }

  /**
   * Maneja mensajes MQTT
   * @private
   */
  _handleMQTTMessage(message) {
    try {
      const topic = message.destinationName;
      const payload = JSON.parse(message.payloadString);

      if (topic.endsWith('/stock')) {
        this.disponible = payload.disponible;
        if (!payload.disponible) {
          this.updateEvento('sin_stock');
        }
      } else if (topic.endsWith('/precio')) {
        this.update({ precio: payload.precio }, { skipAPI: true });
      } else if (topic.endsWith('/evento')) {
        this.updateEvento(payload.evento, { skipAPI: true });
      }

      this.emit('mqtt-update', { topic, payload });

    } catch (error) {
      console.error('ProductoButton: Error procesando mensaje MQTT:', error);
    }
  }

  /**
   * Carga datos desde la API
   * @private
   */
  async _loadFromAPI() {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/productos/${this.id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      this.update(data, { skipEmit: true });

    } catch (error) {
      console.warn(`ProductoButton: Error cargando datos desde API:`, error.message);
    }
  }

  /**
   * Añade el producto a la orden vía API
   * @private
   */
  async _addToOrder() {
    try {
      this.setLoading(true);

      const response = await fetch(`${this.config.apiBaseUrl}/orders/add-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productoId: this.id,
          nombre: this.nombre,
          precio: this.precio,
          categoria: this.categoria,
          cantidad: 1
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('ProductoButton: Producto añadido a la orden:', data);

    } catch (error) {
      console.error('ProductoButton: Error añadiendo producto a la orden:', error);
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Actualiza el evento del componente
   * @param {string} nuevoEvento - Nuevo evento
   * @param {Object} options - Opciones
   */
  updateEvento(nuevoEvento, options = {}) {
    const eventosValidos = [
      'normal', 'oferta', 'promocion', 'sin_stock',
      'no_disponible', 'destacado', 'nuevo', 'vegano', 'picante'
    ];

    if (!eventosValidos.includes(nuevoEvento)) {
      console.error(`ProductoButton: Evento "${nuevoEvento}" no válido`);
      return false;
    }

    const eventoAnterior = this.evento;
    this.evento = nuevoEvento;

    // Actualizar atributo
    this.element.setAttribute('data-evento', nuevoEvento);

    // Actualizar emojis si es necesario
    if (!options.preserveEmojis) {
      this.emojis = this._getDefaultEmojis(nuevoEvento);
      this._updateEmojis();
    }

    // Actualizar screen reader
    this._updateScreenReaderInfo();

    // Emitir evento
    if (!options.skipEmit) {
      this.emit('evento-change', { from: eventoAnterior, to: nuevoEvento });
    }

    return true;
  }

  /**
   * Actualiza múltiples propiedades
   * @param {Object} data - Datos a actualizar
   * @param {Object} options - Opciones
   */
  update(data, options = {}) {
    let hasChanges = false;

    if (data.nombre !== undefined && data.nombre !== this.nombre) {
      this.nombre = data.nombre;
      hasChanges = true;
    }

    if (data.precio !== undefined && data.precio !== this.precio) {
      this.precio = data.precio;
      hasChanges = true;
    }

    if (data.categoria !== undefined && data.categoria !== this.categoria) {
      this.categoria = data.categoria;
      this.element.setAttribute('data-categoria', data.categoria);
      hasChanges = true;
    }

    if (data.evento !== undefined && data.evento !== this.evento) {
      this.updateEvento(data.evento, { ...options, skipAPI: true });
      hasChanges = true;
    }

    if (data.disponible !== undefined && data.disponible !== this.disponible) {
      this.disponible = data.disponible;
      hasChanges = true;
    }

    if (data.emojis !== undefined) {
      this.emojis = { ...this.emojis, ...data.emojis };
      hasChanges = true;
    }

    if (hasChanges) {
      this._updateContent();

      if (!options.skipEmit) {
        this.emit('update', data);
      }
    }
  }

  /**
   * Establece el estado de loading
   * @param {boolean} loading
   */
  setLoading(loading) {
    this._loading = loading;

    if (loading) {
      this.element.style.opacity = '0.7';
      this.element.style.pointerEvents = 'none';
    } else {
      this.element.style.opacity = '1';
      this.element.style.pointerEvents = 'auto';
    }
  }

  /**
   * Formatea el precio
   * @private
   */
  _formatPrecio(precio) {
    if (!precio && precio !== 0) return '';
    return `€${precio.toFixed(2)}`;
  }

  /**
   * Obtiene emojis por defecto según el evento
   * @private
   */
  _getDefaultEmojis(evento) {
    const emojiMap = {
      normal: {},
      oferta: { 'top-left': '🔥' },
      promocion: { 'top-left': '⭐' },
      sin_stock: { 'top-left': '❌' },
      no_disponible: { 'top-left': '⛔' },
      destacado: { 'top-left': '✨' },
      nuevo: { 'top-left': '🆕' },
      vegano: { 'top-right': '🌱' },
      picante: { 'top-right': '🌶️' }
    };

    return emojiMap[evento] || {};
  }

  /**
   * Sistema de eventos personalizado
   */
  on(event, callback) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = [];
    }
    this._eventListeners[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this._eventListeners[event]) return this;

    if (callback) {
      this._eventListeners[event] = this._eventListeners[event].filter(cb => cb !== callback);
    } else {
      delete this._eventListeners[event];
    }
    return this;
  }

  emit(event, data) {
    if (!this._eventListeners[event]) return this;

    this._eventListeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`ProductoButton: Error en evento "${event}":`, error);
      }
    });
    return this;
  }

  /**
   * Destruye el componente
   */
  destroy() {
    // Desconectar MQTT
    if (this._mqttClient && this._mqttClient.isConnected()) {
      this._mqttClient.disconnect();
      this._mqttClient = null;
    }

    // Limpiar event listeners
    this._eventListeners = {};

    // Limpiar DOM
    this.element.innerHTML = '';
    this.element.removeAttribute('data-component');
    this.element.removeAttribute('data-id');
    this.element.removeAttribute('data-categoria');
    this.element.removeAttribute('data-evento');

    console.log(`ProductoButton: Componente ${this.id} destruido`);
  }

  /**
   * Obtiene el estado actual
   */
  getState() {
    return {
      id: this.id,
      nombre: this.nombre,
      precio: this.precio,
      categoria: this.categoria,
      evento: this.evento,
      disponible: this.disponible,
      emojis: { ...this.emojis },
      loading: this._loading
    };
  }
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductoButton;
}

// Registrar componente globalmente
if (typeof window !== 'undefined') {
  window.ProductoButton = ProductoButton;
}
