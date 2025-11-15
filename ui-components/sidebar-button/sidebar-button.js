/**
 * Sidebar Button Component
 * Botón cuadrado para barra lateral - 10mm×10mm
 * Version: 1.0.0
 */

class SidebarButton {
  /**
   * @param {HTMLElement} element - El elemento button del DOM
   * @param {Object} options - Opciones de configuración
   * @param {string} options.id - ID único del botón
   * @param {string} options.emoji - Emoji a mostrar
   * @param {string} options.type - Tipo de botón: primary, success, warning, etc.
   * @param {string} [options.label] - Label para tooltip y accesibilidad
   * @param {string} [options.action] - Acción: navigate, toggle, custom
   * @param {string} [options.route] - Ruta de navegación
   * @param {number|string} [options.badge] - Contador para badge
   * @param {string} [options.tooltip] - Texto del tooltip (usa label por defecto)
   * @param {boolean} [options.disabled] - Si está deshabilitado
   * @param {boolean} [options.selected] - Si está seleccionado
   * @param {Object} [options.config] - Configuración adicional
   */
  constructor(element, options = {}) {
    // Validación básica
    if (!element || !(element instanceof HTMLElement)) {
      throw new Error('SidebarButton: elemento DOM inválido');
    }

    if (!options.id || !options.emoji || !options.type) {
      throw new Error('SidebarButton: faltan propiedades requeridas (id, emoji, type)');
    }

    // Validar tipo
    const tiposValidos = [
      'primary', 'success', 'warning', 'danger', 'info',
      'dark', 'purple', 'pink', 'cyan', 'orange'
    ];
    if (!tiposValidos.includes(options.type)) {
      throw new Error(`SidebarButton: tipo "${options.type}" no válido`);
    }

    // Propiedades
    this.element = element;
    this.id = options.id;
    this.emoji = options.emoji;
    this.type = options.type;
    this.label = options.label || '';
    this.action = options.action || 'custom';
    this.route = options.route || '';
    this.badge = options.badge;
    this.tooltip = options.tooltip || this.label;
    this.disabled = options.disabled || false;
    this.selected = options.selected || false;
    this.config = {
      apiBaseUrl: options.config?.apiBaseUrl || 'http://localhost:3000/api',
      mqttUrl: options.config?.mqttUrl || 'ws://localhost:9001',
      enableMQTT: options.config?.enableMQTT !== false,
      enableRipple: options.config?.enableRipple !== false,
      enableHaptic: options.config?.enableHaptic !== false,
      tooltipDelay: options.config?.tooltipDelay || 200,
      ...options.config
    };

    // Estado interno
    this._mqttClient = null;
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
    if (!this.element.querySelector('.sidebar-button__highlight')) {
      this._renderStructure();
    }

    // Actualizar contenido
    this._updateContent();

    // Establecer atributos
    this.element.setAttribute('data-component', 'sidebar-button');
    this.element.setAttribute('data-id', this.id);
    this.element.setAttribute('data-type', this.type);
    this.element.setAttribute('aria-label', this.label || this.emoji);

    if (this.disabled) {
      this.element.setAttribute('data-disabled', 'true');
      this.element.setAttribute('disabled', 'true');
    }

    if (this.selected) {
      this.element.setAttribute('data-selected', 'true');
    }

    // Event listeners
    this._attachEventListeners();

    // Conectar a MQTT si está habilitado
    if (this.config.enableMQTT && this.badge !== undefined) {
      this._connectMQTT();
    }

    // Emitir evento de inicialización
    this.emit('button:ready', { id: this.id });
  }

  /**
   * Renderiza la estructura HTML
   * @private
   */
  _renderStructure() {
    this.element.innerHTML = `
      <div class="sidebar-button__highlight"></div>
      <div class="sidebar-button__emoji"></div>
      <div class="sidebar-button__badge" style="display: none;">
        <span class="sidebar-button__badge-count">0</span>
      </div>
      <div class="sidebar-button__tooltip">
        <span class="sidebar-button__tooltip-text"></span>
      </div>
      <div class="sidebar-button__ripple"></div>
      <span class="sr-only">
        <span class="sidebar-button__sr-label"></span>
        <span class="sidebar-button__sr-badge"></span>
      </span>
    `;
  }

  /**
   * Actualiza el contenido del componente
   * @private
   */
  _updateContent() {
    // Emoji
    const emojiEl = this.element.querySelector('.sidebar-button__emoji');
    if (emojiEl) emojiEl.textContent = this.emoji;

    // Tooltip
    const tooltipEl = this.element.querySelector('.sidebar-button__tooltip-text');
    if (tooltipEl) tooltipEl.textContent = this.tooltip;

    // Badge
    this._updateBadge();

    // Screen reader
    this._updateScreenReaderInfo();
  }

  /**
   * Actualiza el badge
   * @private
   */
  _updateBadge() {
    const badgeEl = this.element.querySelector('.sidebar-button__badge');
    const badgeCountEl = this.element.querySelector('.sidebar-button__badge-count');

    if (!badgeEl || !badgeCountEl) return;

    if (this.badge !== undefined && this.badge !== null && this.badge > 0) {
      badgeCountEl.textContent = this.badge > 99 ? '99+' : this.badge;
      badgeEl.style.display = 'block';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  /**
   * Actualiza información para lectores de pantalla
   * @private
   */
  _updateScreenReaderInfo() {
    const labelEl = this.element.querySelector('.sidebar-button__sr-label');
    const badgeEl = this.element.querySelector('.sidebar-button__sr-badge');

    if (labelEl) labelEl.textContent = this.label || this.emoji;

    if (badgeEl) {
      if (this.badge && this.badge > 0) {
        badgeEl.textContent = `, ${this.badge} notificaciones`;
      } else {
        badgeEl.textContent = '';
      }
    }
  }

  /**
   * Adjunta event listeners
   * @private
   */
  _attachEventListeners() {
    // Click
    this.element.addEventListener('click', (e) => {
      if (this.disabled) return;
      this._handleClick(e);
    });

    // Touch/mouse events para ripple
    this.element.addEventListener('touchstart', () => this._showRipple(), { passive: true });
    this.element.addEventListener('mousedown', () => this._showRipple());

    // Keyboard
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this.disabled) {
          this._handleClick(e);
        }
      }
    });
  }

  /**
   * Maneja click en el botón
   * @private
   */
  _handleClick(event) {
    // Haptic feedback
    if (this.config.enableHaptic && navigator.vibrate) {
      navigator.vibrate(10);
    }

    // Navegación
    if (this.action === 'navigate' && this.route) {
      this._navigate();
    }

    // Emitir eventos
    this.emit('button:click', {
      id: this.id,
      type: this.type,
      label: this.label,
      action: this.action,
      route: this.route
    });

    const customEvent = new CustomEvent('button:click', {
      detail: {
        id: this.id,
        type: this.type,
        label: this.label,
        action: this.action,
        route: this.route
      },
      bubbles: true
    });
    this.element.dispatchEvent(customEvent);
  }

  /**
   * Navega a la ruta
   * @private
   */
  _navigate() {
    if (!this.route) return;

    // Emitir evento de navegación
    this.emit('button:navigate', {
      id: this.id,
      route: this.route
    });

    const navEvent = new CustomEvent('button:navigate', {
      detail: {
        id: this.id,
        route: this.route
      },
      bubbles: true,
      cancelable: true
    });

    const shouldNavigate = this.element.dispatchEvent(navEvent);

    // Si el evento no fue cancelado, navegar
    if (shouldNavigate) {
      // En una SPA, esto sería manejado por el router
      // Por ahora, usamos window.location
      if (this.route.startsWith('http')) {
        window.location.href = this.route;
      } else {
        // Para SPAs, puedes usar history.pushState o tu router
        console.log('Navigate to:', this.route);
        // window.history.pushState({}, '', this.route);
      }
    }
  }

  /**
   * Muestra efecto ripple
   * @private
   */
  _showRipple() {
    if (!this.config.enableRipple || this.disabled) return;

    const rippleEl = this.element.querySelector('.sidebar-button__ripple');
    if (!rippleEl) return;

    rippleEl.classList.remove('active');
    void rippleEl.offsetWidth; // Force reflow
    rippleEl.classList.add('active');

    setTimeout(() => {
      rippleEl.classList.remove('active');
    }, 500);
  }

  /**
   * Conecta a MQTT para actualizaciones de badge
   * @private
   */
  async _connectMQTT() {
    try {
      if (typeof Paho === 'undefined' || !Paho.MQTT) {
        console.warn('SidebarButton: Paho MQTT no disponible');
        return;
      }

      const clientId = `sidebar-button-${this.id}-${Date.now()}`;
      this._mqttClient = new Paho.MQTT.Client(
        this.config.mqttUrl.replace('ws://', '').replace('wss://', ''),
        Number(this.config.mqttUrl.split(':').pop()) || 9001,
        clientId
      );

      this._mqttClient.onConnectionLost = (response) => {
        console.warn('SidebarButton: Conexión MQTT perdida:', response.errorMessage);
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

      // Suscribirse a topic de notificaciones
      this._mqttClient.subscribe(`/events/notifications/${this.id}`);

      console.log(`SidebarButton: Conectado a MQTT para ${this.id}`);

    } catch (error) {
      console.error('SidebarButton: Error conectando a MQTT:', error);
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

      if (topic.endsWith(`/notifications/${this.id}`)) {
        if (payload.count !== undefined) {
          this.setBadge(payload.count);
        }
      }

    } catch (error) {
      console.error('SidebarButton: Error procesando mensaje MQTT:', error);
    }
  }

  /**
   * Establece el valor del badge
   * @param {number|string|null} value - Valor del badge (null para ocultar)
   */
  setBadge(value) {
    const oldValue = this.badge;
    this.badge = value;

    this._updateBadge();
    this._updateScreenReaderInfo();

    this.emit('button:badge-update', {
      id: this.id,
      oldValue,
      newValue: value
    });
  }

  /**
   * Incrementa el badge
   * @param {number} amount - Cantidad a incrementar (default: 1)
   */
  incrementBadge(amount = 1) {
    const currentValue = parseInt(this.badge) || 0;
    this.setBadge(currentValue + amount);
  }

  /**
   * Selecciona el botón
   */
  select() {
    this.selected = true;
    this.element.setAttribute('data-selected', 'true');

    this.emit('button:select', { id: this.id });
  }

  /**
   * Deselecciona el botón
   */
  deselect() {
    this.selected = false;
    this.element.removeAttribute('data-selected');

    this.emit('button:deselect', { id: this.id });
  }

  /**
   * Toggle de selección
   */
  toggleSelect() {
    if (this.selected) {
      this.deselect();
    } else {
      this.select();
    }
  }

  /**
   * Deshabilita el botón
   */
  disable() {
    this.disabled = true;
    this.element.setAttribute('data-disabled', 'true');
    this.element.setAttribute('disabled', 'true');
  }

  /**
   * Habilita el botón
   */
  enable() {
    this.disabled = false;
    this.element.removeAttribute('data-disabled');
    this.element.removeAttribute('disabled');
  }

  /**
   * Actualiza el emoji
   * @param {string} newEmoji
   */
  setEmoji(newEmoji) {
    this.emoji = newEmoji;
    const emojiEl = this.element.querySelector('.sidebar-button__emoji');
    if (emojiEl) emojiEl.textContent = newEmoji;
  }

  /**
   * Actualiza el tipo
   * @param {string} newType
   */
  setType(newType) {
    const tiposValidos = [
      'primary', 'success', 'warning', 'danger', 'info',
      'dark', 'purple', 'pink', 'cyan', 'orange'
    ];

    if (!tiposValidos.includes(newType)) {
      console.error(`SidebarButton: Tipo "${newType}" no válido`);
      return;
    }

    this.type = newType;
    this.element.setAttribute('data-type', newType);
  }

  /**
   * Actualiza el tooltip
   * @param {string} newTooltip
   */
  setTooltip(newTooltip) {
    this.tooltip = newTooltip;
    const tooltipEl = this.element.querySelector('.sidebar-button__tooltip-text');
    if (tooltipEl) tooltipEl.textContent = newTooltip;
  }

  /**
   * Actualiza múltiples propiedades
   * @param {Object} data
   */
  update(data) {
    if (data.emoji !== undefined) {
      this.setEmoji(data.emoji);
    }

    if (data.type !== undefined) {
      this.setType(data.type);
    }

    if (data.label !== undefined) {
      this.label = data.label;
      this._updateScreenReaderInfo();
    }

    if (data.tooltip !== undefined) {
      this.setTooltip(data.tooltip);
    }

    if (data.badge !== undefined) {
      this.setBadge(data.badge);
    }

    if (data.disabled !== undefined) {
      data.disabled ? this.disable() : this.enable();
    }

    if (data.selected !== undefined) {
      data.selected ? this.select() : this.deselect();
    }

    this.emit('update', data);
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
        console.error(`SidebarButton: Error en evento "${event}":`, error);
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
    this.element.removeAttribute('data-type');
    this.element.removeAttribute('data-selected');
    this.element.removeAttribute('data-disabled');

    console.log(`SidebarButton: Componente ${this.id} destruido`);
  }

  /**
   * Obtiene el estado actual
   */
  getState() {
    return {
      id: this.id,
      emoji: this.emoji,
      type: this.type,
      label: this.label,
      action: this.action,
      route: this.route,
      badge: this.badge,
      tooltip: this.tooltip,
      disabled: this.disabled,
      selected: this.selected
    };
  }
}

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SidebarButton;
}

// Registrar componente globalmente
if (typeof window !== 'undefined') {
  window.SidebarButton = SidebarButton;
}
