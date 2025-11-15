/**
 * Cuenta Button Component
 * Botón de cuenta para POS/Comandero con estados visuales y actualización en tiempo real
 * Version: 1.0.0
 */

class CuentaButton {
  /**
   * @param {HTMLElement} element - El elemento button del DOM
   * @param {Object} options - Opciones de configuración
   * @param {string} options.id - ID único de la cuenta
   * @param {string} options.nombre - Nombre de la cuenta/mesa
   * @param {string} options.tipo - Tipo de cuenta: 'local', 'delivery', 'llevar'
   * @param {string} options.estado - Estado actual: 'pendiente', 'preparacion', 'listo', 'entregado', 'pagado', 'problema', 'cancelado'
   * @param {number} [options.total] - Total de la cuenta
   * @param {number} [options.tiempo] - Tiempo transcurrido en minutos
   * @param {Object} [options.emojis] - Emojis personalizados para esquinas
   * @param {Object} [options.config] - Configuración adicional
   */
  constructor(element, options = {}) {
    // Validación básica
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error('CuentaButton: elemento DOM inválido');
    }

    if (!options.id || !options.nombre || !options.tipo || !options.estado) {
      throw new Error('CuentaButton: faltan propiedades requeridas (id, nombre, tipo, estado)');
    }

    // Validar tipo
    const tiposValidos = ['local', 'delivery', 'llevar'];
    if (!tiposValidos.includes(options.tipo)) {
      throw new Error(`CuentaButton: tipo "${options.tipo}" no válido. Usa: ${tiposValidos.join(', ')}`);
    }

    // Validar estado
    const estadosValidos = ['pendiente', 'preparacion', 'listo', 'entregado', 'pagado', 'problema', 'cancelado'];
    if (!estadosValidos.includes(options.estado)) {
      throw new Error(`CuentaButton: estado "${options.estado}" no válido. Usa: ${estadosValidos.join(', ')}`);
    }

    // Propiedades
    this.element = element;
    this.id = options.id;
    this.nombre = options.nombre;
    this.tipo = options.tipo;
    this.estado = options.estado;
    this.total = options.total || 0;
    this.tiempo = options.tiempo || 0;
    this.emojis = options.emojis || this._getDefaultEmojis(options.estado);
    this.config = {
      apiBaseUrl: options.config?.apiBaseUrl || 'http://localhost:3000/api',
      mqttUrl: options.config?.mqttUrl || 'ws://localhost:9001',
      enableMQTT: options.config?.enableMQTT !== false,
      longPressDelay: options.config?.longPressDelay || 500,
      ...options.config
    };

    // Estado interno
    this._loading = false;
    this._mqttClient = null;
    this._touchStartTime = 0;
    this._touchTimer = null;
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
    if (!this.element.querySelector('.cuenta-button__marco')) {
      this._renderStructure();
    }

    // Actualizar contenido
    this._updateContent();

    // Establecer atributos de datos
    this.element.setAttribute('data-component', 'cuenta-button');
    this.element.setAttribute('data-id', this.id);
    this.element.setAttribute('data-tipo', this.tipo);
    this.element.setAttribute('data-estado', this.estado);

    // Event listeners
    this._attachEventListeners();

    // Conectar a MQTT si está habilitado
    if (this.config.enableMQTT) {
      this._connectMQTT();
    }

    // Cargar datos iniciales desde API
    this._loadFromAPI();
  }

  /**
   * Renderiza la estructura HTML del componente
   * @private
   */
  _renderStructure() {
    this.element.innerHTML = `
      <!-- Marcos Concéntricos -->
      <div class="cuenta-button__marco cuenta-button__marco--exterior"></div>
      <div class="cuenta-button__marco cuenta-button__marco--medio"></div>
      <div class="cuenta-button__marco cuenta-button__marco--interior"></div>

      <!-- Centro con Información -->
      <div class="cuenta-button__centro">
        <div class="cuenta-button__info">
          <div class="cuenta-button__nombre"></div>
          <div class="cuenta-button__meta">
            <span class="cuenta-button__tiempo"></span>
            <span class="cuenta-button__total"></span>
          </div>
        </div>
      </div>

      <!-- Esquinas con Emojis -->
      <div class="cuenta-button__corners">
        <span class="cuenta-button__corner cuenta-button__corner--top-left"></span>
        <span class="cuenta-button__corner cuenta-button__corner--top-right"></span>
        <span class="cuenta-button__corner cuenta-button__corner--bottom-left"></span>
        <span class="cuenta-button__corner cuenta-button__corner--bottom-right"></span>
      </div>

      <!-- Zona de Acción (Cobro) -->
      <div class="cuenta-button__action-zone cuenta-button__action-zone--right" data-action="cobro">
        <span class="cuenta-button__action-icon">💰</span>
      </div>

      <!-- Loading Overlay -->
      <div class="cuenta-button__loading" style="display: none;">
        <div class="cuenta-button__spinner"></div>
      </div>

      <!-- Screen Reader Info -->
      <span class="sr-only">
        Cuenta <span class="cuenta-button__sr-nombre"></span>,
        Estado: <span class="cuenta-button__sr-estado"></span>,
        Tipo: <span class="cuenta-button__sr-tipo"></span>,
        Total: <span class="cuenta-button__sr-total"></span>
      </span>
    `;
  }

  /**
   * Actualiza el contenido del componente
   * @private
   */
  _updateContent() {
    // Nombre
    const nombreEl = this.element.querySelector('.cuenta-button__nombre');
    if (nombreEl) nombreEl.textContent = this.nombre;

    // Tiempo
    const tiempoEl = this.element.querySelector('.cuenta-button__tiempo');
    if (tiempoEl) tiempoEl.textContent = this._formatTiempo(this.tiempo);

    // Total
    const totalEl = this.element.querySelector('.cuenta-button__total');
    if (totalEl) totalEl.textContent = this._formatTotal(this.total);

    // Emojis en esquinas
    const corners = {
      'top-left': this.emojis.topLeft,
      'top-right': this.emojis.topRight,
      'bottom-left': this.emojis.bottomLeft,
      'bottom-right': this.emojis.bottomRight
    };

    Object.entries(corners).forEach(([position, emoji]) => {
      const cornerEl = this.element.querySelector(`.cuenta-button__corner--${position}`);
      if (cornerEl) cornerEl.textContent = emoji;
    });

    // Actualizar screen reader info
    this._updateScreenReaderInfo();
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

    setScreenReaderText('.cuenta-button__sr-nombre', this.nombre);
    setScreenReaderText('.cuenta-button__sr-estado', this.estado);
    setScreenReaderText('.cuenta-button__sr-tipo', this.tipo);
    setScreenReaderText('.cuenta-button__sr-total', this._formatTotal(this.total));
  }

  /**
   * Adjunta event listeners
   * @private
   */
  _attachEventListeners() {
    // Click en el botón principal (zona izquierda - 75%)
    this.element.addEventListener('click', (e) => {
      // Ignorar clicks en la zona de acción
      if (e.target.closest('.cuenta-button__action-zone')) {
        return;
      }
      this._handleMainClick(e);
    });

    // Click en zona de acción (cobro)
    const actionZone = this.element.querySelector('.cuenta-button__action-zone');
    if (actionZone) {
      actionZone.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleActionClick(e);
      });
    }

    // Touch events para long-press
    this.element.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: true });
    this.element.addEventListener('touchend', (e) => this._handleTouchEnd(e));
    this.element.addEventListener('touchcancel', () => this._handleTouchCancel());

    // Keyboard accessibility
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._handleMainClick(e);
      }
    });
  }

  /**
   * Maneja click principal (abrir comandero)
   * @private
   */
  _handleMainClick(event) {
    if (this._loading) return;

    const customEvent = new CustomEvent('cuenta-button:click', {
      detail: {
        id: this.id,
        nombre: this.nombre,
        tipo: this.tipo,
        estado: this.estado,
        action: 'comandero',
        event
      },
      bubbles: true
    });

    this.element.dispatchEvent(customEvent);
    this.emit('action-comandero', { id: this.id, nombre: this.nombre });
  }

  /**
   * Maneja click en zona de acción (cobro)
   * @private
   */
  _handleActionClick(event) {
    if (this._loading) return;

    const customEvent = new CustomEvent('cuenta-button:action-cobro', {
      detail: {
        id: this.id,
        nombre: this.nombre,
        total: this.total,
        estado: this.estado,
        event
      },
      bubbles: true
    });

    this.element.dispatchEvent(customEvent);
    this.emit('action-cobro', { id: this.id, total: this.total });
  }

  /**
   * Maneja touch start (para long-press)
   * @private
   */
  _handleTouchStart(event) {
    this._touchStartTime = Date.now();
    this._touchTimer = setTimeout(() => {
      this._handleLongPress(event);
    }, this.config.longPressDelay);
  }

  /**
   * Maneja touch end
   * @private
   */
  _handleTouchEnd(event) {
    if (this._touchTimer) {
      clearTimeout(this._touchTimer);
      this._touchTimer = null;
    }

    const touchDuration = Date.now() - this._touchStartTime;
    if (touchDuration < this.config.longPressDelay) {
      // Click normal, ya manejado por event listener 'click'
    }
  }

  /**
   * Maneja touch cancel
   * @private
   */
  _handleTouchCancel() {
    if (this._touchTimer) {
      clearTimeout(this._touchTimer);
      this._touchTimer = null;
    }
  }

  /**
   * Maneja long-press (mostrar opciones adicionales)
   * @private
   */
  _handleLongPress(event) {
    const customEvent = new CustomEvent('cuenta-button:long-press', {
      detail: {
        id: this.id,
        nombre: this.nombre,
        tipo: this.tipo,
        estado: this.estado,
        event
      },
      bubbles: true
    });

    this.element.dispatchEvent(customEvent);
    this.emit('long-press', { id: this.id });
  }

  /**
   * Conecta a MQTT para actualizaciones en tiempo real
   * @private
   */
  async _connectMQTT() {
    try {
      // Usar Paho MQTT (debe estar incluido en el HTML)
      if (typeof Paho === 'undefined' || !Paho.MQTT) {
        console.warn('CuentaButton: Paho MQTT no disponible, actualizaciones en tiempo real deshabilitadas');
        return;
      }

      const clientId = `cuenta-button-${this.id}-${Date.now()}`;
      this._mqttClient = new Paho.MQTT.Client(
        this.config.mqttUrl.replace('ws://', '').replace('wss://', ''),
        Number(this.config.mqttUrl.split(':').pop()) || 9001,
        clientId
      );

      // Callbacks
      this._mqttClient.onConnectionLost = (response) => {
        console.warn('CuentaButton: Conexión MQTT perdida:', response.errorMessage);
        // Intentar reconectar después de 5 segundos
        setTimeout(() => this._connectMQTT(), 5000);
      };

      this._mqttClient.onMessageArrived = (message) => {
        this._handleMQTTMessage(message);
      };

      // Conectar
      await new Promise((resolve, reject) => {
        this._mqttClient.connect({
          onSuccess: resolve,
          onFailure: reject,
          cleanSession: true,
          keepAliveInterval: 30
        });
      });

      // Suscribirse a topics
      this._mqttClient.subscribe(`ordenes/${this.id}/estado`);
      this._mqttClient.subscribe(`ordenes/${this.id}/update`);

      console.log(`CuentaButton: Conectado a MQTT para cuenta ${this.id}`);

    } catch (error) {
      console.error('CuentaButton: Error conectando a MQTT:', error);
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

      if (topic === `ordenes/${this.id}/estado`) {
        // Actualizar estado
        this.updateEstado(payload.estado, { skipEmit: true });
      } else if (topic === `ordenes/${this.id}/update`) {
        // Actualizar datos completos
        this.update(payload, { skipEmit: true });
      }

      this.emit('mqtt-update', { topic, payload });

    } catch (error) {
      console.error('CuentaButton: Error procesando mensaje MQTT:', error);
    }
  }

  /**
   * Carga datos desde la API
   * @private
   */
  async _loadFromAPI() {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/ordenes/${this.id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Actualizar con datos de la API
      this.update(data, { skipEmit: true });

    } catch (error) {
      console.warn(`CuentaButton: Error cargando datos desde API:`, error.message);
      // No es crítico, usar datos iniciales
    }
  }

  /**
   * Actualiza el estado del componente
   * @param {string} nuevoEstado - Nuevo estado
   * @param {Object} options - Opciones
   * @returns {Promise<boolean>}
   */
  async updateEstado(nuevoEstado, options = {}) {
    const estadosValidos = ['pendiente', 'preparacion', 'listo', 'entregado', 'pagado', 'problema', 'cancelado'];

    if (!estadosValidos.includes(nuevoEstado)) {
      console.error(`CuentaButton: Estado "${nuevoEstado}" no válido`);
      return false;
    }

    const estadoAnterior = this.estado;
    this.estado = nuevoEstado;

    // Actualizar atributo de datos
    this.element.setAttribute('data-estado', nuevoEstado);

    // Actualizar emojis si es necesario
    if (!options.preserveEmojis) {
      this.emojis = this._getDefaultEmojis(nuevoEstado);
      this._updateContent();
    }

    // Actualizar screen reader
    this._updateScreenReaderInfo();

    // Enviar a API si no es una actualización desde MQTT
    if (!options.skipAPI) {
      await this._syncEstadoToAPI(nuevoEstado);
    }

    // Emitir evento
    if (!options.skipEmit) {
      const customEvent = new CustomEvent('cuenta-button:state-change', {
        detail: {
          id: this.id,
          estadoAnterior,
          estadoNuevo: nuevoEstado,
          nombre: this.nombre
        },
        bubbles: true
      });

      this.element.dispatchEvent(customEvent);
      this.emit('state-change', { from: estadoAnterior, to: nuevoEstado });
    }

    return true;
  }

  /**
   * Sincroniza estado con la API
   * @private
   */
  async _syncEstadoToAPI(estado) {
    try {
      this.setLoading(true);

      const response = await fetch(`${this.config.apiBaseUrl}/ordenes/${this.id}/estado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ estado })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('CuentaButton: Estado sincronizado con API:', data);

    } catch (error) {
      console.error('CuentaButton: Error sincronizando estado con API:', error);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Actualiza múltiples propiedades del componente
   * @param {Object} data - Datos a actualizar
   * @param {Object} options - Opciones
   */
  update(data, options = {}) {
    let hasChanges = false;

    if (data.nombre !== undefined && data.nombre !== this.nombre) {
      this.nombre = data.nombre;
      hasChanges = true;
    }

    if (data.tipo !== undefined && data.tipo !== this.tipo) {
      this.tipo = data.tipo;
      this.element.setAttribute('data-tipo', data.tipo);
      hasChanges = true;
    }

    if (data.estado !== undefined && data.estado !== this.estado) {
      this.updateEstado(data.estado, { ...options, skipAPI: true });
      hasChanges = true;
    }

    if (data.total !== undefined && data.total !== this.total) {
      this.total = data.total;
      hasChanges = true;
    }

    if (data.tiempo !== undefined && data.tiempo !== this.tiempo) {
      this.tiempo = data.tiempo;
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
   * @param {boolean} loading - Si está cargando
   */
  setLoading(loading) {
    this._loading = loading;
    const loadingEl = this.element.querySelector('.cuenta-button__loading');

    if (loadingEl) {
      loadingEl.style.display = loading ? 'flex' : 'none';
    }

    if (loading) {
      this.element.setAttribute('data-state', 'loading');
    } else {
      this.element.removeAttribute('data-state');
    }
  }

  /**
   * Formatea el tiempo transcurrido
   * @private
   */
  _formatTiempo(minutos) {
    if (!minutos || minutos === 0) return '';

    if (minutos < 60) {
      return `${minutos}min`;
    }

    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
  }

  /**
   * Formatea el total
   * @private
   */
  _formatTotal(total) {
    if (!total || total === 0) return '';
    return `$${total.toFixed(2)}`;
  }

  /**
   * Obtiene emojis por defecto según el estado
   * @private
   */
  _getDefaultEmojis(estado) {
    const emojiMap = {
      pendiente: { topLeft: '🕐', topRight: '📋', bottomLeft: '👨‍🍳', bottomRight: '⏳' },
      preparacion: { topLeft: '🔥', topRight: '👨‍🍳', bottomLeft: '⏱️', bottomRight: '🍳' },
      listo: { topLeft: '✅', topRight: '🔔', bottomLeft: '👍', bottomRight: '🎉' },
      entregado: { topLeft: '✅', topRight: '😊', bottomLeft: '🍽️', bottomRight: '👌' },
      pagado: { topLeft: '💰', topRight: '✅', bottomLeft: '🧾', bottomRight: '😊' },
      problema: { topLeft: '⚠️', topRight: '❗', bottomLeft: '🔴', bottomRight: '⚠️' },
      cancelado: { topLeft: '❌', topRight: '🚫', bottomLeft: '⛔', bottomRight: '❌' }
    };

    return emojiMap[estado] || emojiMap.pendiente;
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
        console.error(`CuentaButton: Error en evento "${event}":`, error);
      }
    });
    return this;
  }

  /**
   * Destruye el componente y limpia recursos
   */
  destroy() {
    // Desconectar MQTT
    if (this._mqttClient && this._mqttClient.isConnected()) {
      this._mqttClient.disconnect();
      this._mqttClient = null;
    }

    // Limpiar timers
    if (this._touchTimer) {
      clearTimeout(this._touchTimer);
      this._touchTimer = null;
    }

    // Limpiar event listeners
    this._eventListeners = {};

    // Remover del DOM
    this.element.innerHTML = '';
    this.element.removeAttribute('data-component');
    this.element.removeAttribute('data-id');
    this.element.removeAttribute('data-tipo');
    this.element.removeAttribute('data-estado');

    console.log(`CuentaButton: Componente ${this.id} destruido`);
  }

  /**
   * Obtiene el estado actual del componente
   * @returns {Object}
   */
  getState() {
    return {
      id: this.id,
      nombre: this.nombre,
      tipo: this.tipo,
      estado: this.estado,
      total: this.total,
      tiempo: this.tiempo,
      emojis: { ...this.emojis },
      loading: this._loading
    };
  }
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CuentaButton;
}

// Registrar componente globalmente
if (typeof window !== 'undefined') {
  window.CuentaButton = CuentaButton;
}
