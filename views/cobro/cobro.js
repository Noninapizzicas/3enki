/**
 * Cobro View Controller
 * Vista de cobro/pago para sistemas POS
 * Version: 1.0.0
 */

class CobroView {
  constructor() {
    // State
    this.cuentaId = null;
    this.cuentaNombre = '';
    this.cuentaTipo = '';
    this.orderItems = [];
    this.config = null;

    // Calculations
    this.subtotal = 0;
    this.descuentoPorcentaje = 0;
    this.descuentoMonto = 0;
    this.propina = 0;
    this.iva = 0;
    this.total = 0;

    // Payment
    this.metodoPago = null;
    this.efectivoRecibido = 0;
    this.vuelto = 0;
    this.mixtoEfectivo = 0;
    this.mixtoTarjeta = 0;

    // UI Components
    this.sidebarButtons = new Map();

    // WebSocket
    this.ws = null;
    this.wsConnected = false;

    // DOM Elements
    this.elements = {};
  }

  /**
   * Initialize the view
   */
  async init() {
    try {
      // Load configuration
      await this.loadConfig();

      // Get cuenta ID from URL params
      const urlParams = new URLSearchParams(window.location.search);
      this.cuentaId = urlParams.get('cuenta_id') || 'demo-cuenta-1';

      // Cache DOM elements
      this.cacheElements();

      // Load cuenta data
      await this.loadCuenta();

      // Initialize UI
      this.initSidebar();
      this.initEventListeners();

      // Connect WebSocket if enabled
      if (this.config.realtime?.enabled) {
        this.connectWebSocket();
      }

      // Initial render
      this.render();

      console.log('✅ Cobro View initialized', {
        cuentaId: this.cuentaId,
        items: this.orderItems.length,
        total: this.total
      });

    } catch (error) {
      console.error('❌ Error initializing Cobro View:', error);
      this.showToast('Error al cargar la vista', 'error');
    }
  }

  /**
   * Load view configuration
   */
  async loadConfig() {
    try {
      const response = await fetch('./view.json');
      if (!response.ok) throw new Error('Failed to load config');
      this.config = await response.json();
    } catch (error) {
      console.error('Error loading config:', error);
      // Fallback to default config
      this.config = {
        layout: { max_width: '600px' },
        sections: {
          totales: { iva_porcentaje: 21 }
        },
        realtime: { enabled: false }
      };
    }
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      // Header
      cuentaNombre: document.getElementById('cuentaNombre'),
      cuentaTipo: document.getElementById('cuentaTipo'),
      headerTotal: document.getElementById('headerTotal'),

      // Items
      itemsList: document.getElementById('itemsList'),
      emptyState: document.getElementById('emptyState'),

      // Totales
      subtotalEl: document.getElementById('subtotal'),
      descuentoInput: document.getElementById('descuentoInput'),
      descuentoEl: document.getElementById('descuento'),
      propinaEl: document.getElementById('propina'),
      ivaEl: document.getElementById('iva'),
      totalFinalEl: document.getElementById('totalFinal'),

      // Propina presets
      presetButtons: document.querySelectorAll('.preset-btn'),
      propinaInput: document.getElementById('propinaInput'),

      // Payment methods
      metodoButtons: document.querySelectorAll('.metodo-btn'),
      efectivoDetails: document.getElementById('efectivoDetails'),
      mixtoDetails: document.getElementById('mixtoDetails'),
      efectivoRecibidoInput: document.getElementById('efectivoRecibido'),
      vueltoEl: document.getElementById('vuelto'),
      mixtoEfectivoInput: document.getElementById('mixtoEfectivo'),
      mixtoTarjetaInput: document.getElementById('mixtoTarjeta'),

      // Actions
      btnVolver: document.getElementById('btnVolver'),
      btnImprimir: document.getElementById('btnImprimir'),
      btnConfirmar: document.getElementById('btnConfirmar'),

      // Modal
      modalConfirmar: document.getElementById('modalConfirmar'),
      confirmTotal: document.getElementById('confirmTotal'),
      confirmMetodo: document.getElementById('confirmMetodo'),

      // Sidebar
      sidebar: document.getElementById('sidebar'),

      // Toast
      toastContainer: document.getElementById('toastContainer')
    };
  }

  /**
   * Initialize event listeners
   */
  initEventListeners() {
    // Descuento input
    if (this.elements.descuentoInput) {
      this.elements.descuentoInput.addEventListener('input', (e) => {
        this.descuentoPorcentaje = parseFloat(e.target.value) || 0;
        if (this.descuentoPorcentaje < 0) this.descuentoPorcentaje = 0;
        if (this.descuentoPorcentaje > 100) this.descuentoPorcentaje = 100;
        e.target.value = this.descuentoPorcentaje;
        this.calculateTotals();
      });
    }

    // Propina presets
    this.elements.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = parseFloat(btn.dataset.value) || 0;
        this.propina = value;
        this.elements.propinaInput.value = '';

        // Update active state
        this.elements.presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.calculateTotals();
      });
    });

    // Propina custom input
    if (this.elements.propinaInput) {
      this.elements.propinaInput.addEventListener('input', (e) => {
        this.propina = parseFloat(e.target.value) || 0;
        if (this.propina < 0) this.propina = 0;

        // Clear preset selection
        this.elements.presetButtons.forEach(b => b.classList.remove('active'));

        this.calculateTotals();
      });
    }

    // Payment methods
    this.elements.metodoButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const metodo = btn.dataset.metodo;
        this.selectMetodoPago(metodo);
      });
    });

    // Efectivo recibido
    if (this.elements.efectivoRecibidoInput) {
      this.elements.efectivoRecibidoInput.addEventListener('input', (e) => {
        this.efectivoRecibido = parseFloat(e.target.value) || 0;
        this.vuelto = Math.max(0, this.efectivoRecibido - this.total);
        this.elements.vueltoEl.textContent = this.formatCurrency(this.vuelto);
      });
    }

    // Mixto inputs
    if (this.elements.mixtoEfectivoInput) {
      this.elements.mixtoEfectivoInput.addEventListener('input', (e) => {
        this.mixtoEfectivo = parseFloat(e.target.value) || 0;
        this.mixtoTarjeta = Math.max(0, this.total - this.mixtoEfectivo);
        this.elements.mixtoTarjetaInput.value = this.mixtoTarjeta.toFixed(2);
      });
    }

    if (this.elements.mixtoTarjetaInput) {
      this.elements.mixtoTarjetaInput.addEventListener('input', (e) => {
        this.mixtoTarjeta = parseFloat(e.target.value) || 0;
        this.mixtoEfectivo = Math.max(0, this.total - this.mixtoTarjeta);
        this.elements.mixtoEfectivoInput.value = this.mixtoEfectivo.toFixed(2);
      });
    }

    // Action buttons
    if (this.elements.btnVolver) {
      this.elements.btnVolver.addEventListener('click', () => this.volver());
    }

    if (this.elements.btnImprimir) {
      this.elements.btnImprimir.addEventListener('click', () => this.imprimir());
    }

    if (this.elements.btnConfirmar) {
      this.elements.btnConfirmar.addEventListener('click', () => this.confirmar());
    }

    // Make functions globally accessible for modal
    window.closeModal = (modalId) => this.closeModal(modalId);
    window.procesarPago = () => this.procesarPago();
  }

  /**
   * Initialize sidebar buttons
   */
  initSidebar() {
    if (!this.config.sidebar?.buttons) return;

    this.config.sidebar.buttons.forEach(btnConfig => {
      const button = this.createSidebarButton(btnConfig);
      if (button) {
        this.elements.sidebar.appendChild(button);
        this.sidebarButtons.set(btnConfig.id, button);
      }
    });
  }

  /**
   * Create sidebar button element
   */
  createSidebarButton(config) {
    try {
      // Check if SidebarButton class exists
      if (typeof SidebarButton !== 'undefined') {
        const container = document.createElement('div');
        const button = new SidebarButton(container, config);

        // Handle click
        container.addEventListener('click', () => {
          if (config.route) {
            window.location.href = config.route;
          }
        });

        return container;
      }

      // Fallback to simple button
      const btn = document.createElement('button');
      btn.className = 'sidebar-btn';
      btn.innerHTML = `<span class="sidebar-emoji">${config.emoji}</span>`;
      btn.title = config.tooltip || config.label;

      if (config.route) {
        btn.addEventListener('click', () => {
          window.location.href = config.route;
        });
      }

      return btn;
    } catch (error) {
      console.error('Error creating sidebar button:', error);
      return null;
    }
  }

  /**
   * Load cuenta data from API
   */
  async loadCuenta() {
    try {
      // Try to load from API
      const endpoint = this.config.api?.load_cuenta?.replace(':id', this.cuentaId);
      if (endpoint) {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          this.cuentaNombre = data.nombre;
          this.cuentaTipo = data.tipo;
          this.orderItems = data.items || [];
          this.calculateTotals();
          return;
        }
      }
    } catch (error) {
      console.warn('Could not load from API, using demo data:', error);
    }

    // Fallback to demo data
    this.loadDemoData();
  }

  /**
   * Load demo data for testing
   */
  loadDemoData() {
    this.cuentaNombre = 'Mesa 1';
    this.cuentaTipo = 'Local';
    this.orderItems = [
      {
        id: 'item-1',
        producto_id: 'pizza-margarita',
        nombre: 'Pizza Margarita',
        variacion: 'Mediana',
        precio_unitario: 8.50,
        cantidad: 2,
        precio_total: 17.00,
        notas: ''
      },
      {
        id: 'item-2',
        producto_id: 'pizza-carbonara',
        nombre: 'Pizza Carbonara',
        variacion: 'Grande',
        precio_unitario: 10.50,
        cantidad: 1,
        precio_total: 10.50,
        notas: 'Sin cebolla'
      },
      {
        id: 'item-3',
        producto_id: 'coca-cola',
        nombre: 'Coca-Cola',
        variacion: '33cl',
        precio_unitario: 2.50,
        cantidad: 3,
        precio_total: 7.50,
        notas: ''
      }
    ];

    this.calculateTotals();
  }

  /**
   * Calculate all totals
   */
  calculateTotals() {
    // Subtotal (before IVA)
    const totalConIva = this.orderItems.reduce((sum, item) => sum + item.precio_total, 0);
    const ivaPorcentaje = this.config.sections?.totales?.iva_porcentaje || 21;
    this.subtotal = totalConIva / (1 + ivaPorcentaje / 100);

    // Descuento
    this.descuentoMonto = this.subtotal * (this.descuentoPorcentaje / 100);

    // IVA (applied after discount)
    const baseImponible = this.subtotal - this.descuentoMonto;
    this.iva = baseImponible * (ivaPorcentaje / 100);

    // Total
    this.total = baseImponible + this.iva + this.propina;

    // Update UI
    this.updateTotalsDisplay();
  }

  /**
   * Update totals display
   */
  updateTotalsDisplay() {
    if (this.elements.subtotalEl) {
      this.elements.subtotalEl.textContent = this.formatCurrency(this.subtotal);
    }

    if (this.elements.descuentoEl) {
      this.elements.descuentoEl.textContent = `-${this.formatCurrency(this.descuentoMonto)}`;
    }

    if (this.elements.propinaEl) {
      this.elements.propinaEl.textContent = `+${this.formatCurrency(this.propina)}`;
    }

    if (this.elements.ivaEl) {
      this.elements.ivaEl.textContent = this.formatCurrency(this.iva);
    }

    if (this.elements.totalFinalEl) {
      this.elements.totalFinalEl.textContent = this.formatCurrency(this.total);
    }

    if (this.elements.headerTotal) {
      this.elements.headerTotal.textContent = this.formatCurrency(this.total);
    }
  }

  /**
   * Render the view
   */
  render() {
    this.renderHeader();
    this.renderItems();
    this.updateTotalsDisplay();
  }

  /**
   * Render header
   */
  renderHeader() {
    if (this.elements.cuentaNombre) {
      this.elements.cuentaNombre.textContent = this.cuentaNombre;
    }

    if (this.elements.cuentaTipo) {
      this.elements.cuentaTipo.textContent = this.cuentaTipo;
    }
  }

  /**
   * Render order items
   */
  renderItems() {
    if (!this.elements.itemsList) return;

    // Clear current items
    this.elements.itemsList.innerHTML = '';

    // Show empty state if no items
    if (this.orderItems.length === 0) {
      this.elements.itemsList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🛒</span>
          <p class="empty-message">No hay items en el pedido</p>
        </div>
      `;
      return;
    }

    // Render each item
    this.orderItems.forEach(item => {
      const itemEl = this.createItemElement(item);
      this.elements.itemsList.appendChild(itemEl);
    });
  }

  /**
   * Create item element
   */
  createItemElement(item) {
    const div = document.createElement('div');
    div.className = 'order-item';
    div.dataset.itemId = item.id;

    div.innerHTML = `
      <div class="item-main">
        <div class="item-header">
          <span class="item-nombre">${item.nombre}</span>
          ${item.variacion ? `<span class="item-variacion">(${item.variacion})</span>` : ''}
        </div>
        <div class="item-precio-unitario">${this.formatCurrency(item.precio_unitario)} c/u</div>
        ${item.notas ? `<div class="item-notas">📝 ${item.notas}</div>` : ''}
      </div>

      <div class="item-quantity">
        <button class="qty-btn qty-decrease" data-item-id="${item.id}">−</button>
        <span class="qty-value">${item.cantidad}</span>
        <button class="qty-btn qty-increase" data-item-id="${item.id}">+</button>
      </div>

      <div class="item-precio">${this.formatCurrency(item.precio_total)}</div>

      <button class="item-delete" data-item-id="${item.id}" title="Eliminar">🗑️</button>
    `;

    // Event listeners
    const decreaseBtn = div.querySelector('.qty-decrease');
    const increaseBtn = div.querySelector('.qty-increase');
    const deleteBtn = div.querySelector('.item-delete');

    decreaseBtn.addEventListener('click', () => this.decreaseQuantity(item.id));
    increaseBtn.addEventListener('click', () => this.increaseQuantity(item.id));
    deleteBtn.addEventListener('click', () => this.deleteItem(item.id));

    return div;
  }

  /**
   * Increase item quantity
   */
  increaseQuantity(itemId) {
    const item = this.orderItems.find(i => i.id === itemId);
    if (item) {
      item.cantidad += 1;
      item.precio_total = item.precio_unitario * item.cantidad;
      this.calculateTotals();
      this.renderItems();
      this.syncItemUpdate(item);
    }
  }

  /**
   * Decrease item quantity
   */
  decreaseQuantity(itemId) {
    const item = this.orderItems.find(i => i.id === itemId);
    if (item && item.cantidad > 1) {
      item.cantidad -= 1;
      item.precio_total = item.precio_unitario * item.cantidad;
      this.calculateTotals();
      this.renderItems();
      this.syncItemUpdate(item);
    }
  }

  /**
   * Delete item
   */
  deleteItem(itemId) {
    const index = this.orderItems.findIndex(i => i.id === itemId);
    if (index !== -1) {
      const item = this.orderItems[index];
      this.orderItems.splice(index, 1);
      this.calculateTotals();
      this.renderItems();
      this.syncItemDelete(itemId);
      this.showToast(`${item.nombre} eliminado`, 'success');
    }
  }

  /**
   * Select payment method
   */
  selectMetodoPago(metodo) {
    this.metodoPago = metodo;

    // Update button states
    this.elements.metodoButtons.forEach(btn => {
      if (btn.dataset.metodo === metodo) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show/hide details
    if (this.elements.efectivoDetails) {
      this.elements.efectivoDetails.style.display = metodo === 'efectivo' ? 'block' : 'none';
    }

    if (this.elements.mixtoDetails) {
      this.elements.mixtoDetails.style.display = metodo === 'mixto' ? 'block' : 'none';
    }

    // Reset values
    if (metodo === 'efectivo') {
      this.efectivoRecibido = 0;
      this.vuelto = 0;
      if (this.elements.efectivoRecibidoInput) this.elements.efectivoRecibidoInput.value = '';
      if (this.elements.vueltoEl) this.elements.vueltoEl.textContent = this.formatCurrency(0);
    }

    if (metodo === 'mixto') {
      this.mixtoEfectivo = 0;
      this.mixtoTarjeta = this.total;
      if (this.elements.mixtoEfectivoInput) this.elements.mixtoEfectivoInput.value = '';
      if (this.elements.mixtoTarjetaInput) this.elements.mixtoTarjetaInput.value = this.total.toFixed(2);
    }
  }

  /**
   * Volver to previous view
   */
  volver() {
    // Navigate back to comandero
    const cuentaParam = this.cuentaId ? `?cuenta_id=${this.cuentaId}` : '';
    window.location.href = `../comandero/index.html${cuentaParam}`;
  }

  /**
   * Print ticket
   */
  imprimir() {
    try {
      window.print();
      this.showToast('Imprimiendo cuenta...', 'info');
    } catch (error) {
      console.error('Error printing:', error);
      this.showToast('Error al imprimir', 'error');
    }
  }

  /**
   * Confirm payment
   */
  confirmar() {
    // Validate
    if (this.orderItems.length === 0) {
      this.showToast('No hay items en el pedido', 'warning');
      return;
    }

    if (!this.metodoPago) {
      this.showToast('Selecciona un método de pago', 'warning');
      return;
    }

    // Validate efectivo
    if (this.metodoPago === 'efectivo' && this.efectivoRecibido < this.total) {
      this.showToast('El monto recibido es insuficiente', 'warning');
      return;
    }

    // Validate mixto
    if (this.metodoPago === 'mixto') {
      const totalMixto = this.mixtoEfectivo + this.mixtoTarjeta;
      if (Math.abs(totalMixto - this.total) > 0.01) {
        this.showToast('El total mixto no coincide', 'warning');
        return;
      }
    }

    // Show confirmation modal
    this.openModal('modalConfirmar');

    // Update modal content
    if (this.elements.confirmTotal) {
      this.elements.confirmTotal.textContent = this.formatCurrency(this.total);
    }

    if (this.elements.confirmMetodo) {
      const metodoNames = {
        'efectivo': '💵 Efectivo',
        'tarjeta': '💳 Tarjeta',
        'mixto': '🔄 Mixto',
        'bizum': '📱 Bizum'
      };
      this.elements.confirmMetodo.textContent = metodoNames[this.metodoPago] || this.metodoPago;
    }
  }

  /**
   * Process payment
   */
  async procesarPago() {
    try {
      this.closeModal('modalConfirmar');

      // Prepare payment data
      const paymentData = {
        cuenta_id: this.cuentaId,
        total: this.total,
        subtotal: this.subtotal,
        descuento_porcentaje: this.descuentoPorcentaje,
        descuento_monto: this.descuentoMonto,
        propina: this.propina,
        iva: this.iva,
        metodo_pago: this.metodoPago,
        items: this.orderItems
      };

      // Add method-specific data
      if (this.metodoPago === 'efectivo') {
        paymentData.efectivo_recibido = this.efectivoRecibido;
        paymentData.vuelto = this.vuelto;
      } else if (this.metodoPago === 'mixto') {
        paymentData.mixto_efectivo = this.mixtoEfectivo;
        paymentData.mixto_tarjeta = this.mixtoTarjeta;
      }

      // Call API
      const endpoint = this.config.api?.process_payment;
      if (endpoint) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentData)
        });

        if (!response.ok) throw new Error('Payment failed');

        const result = await response.json();
        console.log('Payment processed:', result);
      }

      // Success
      this.showToast('✅ Pago procesado correctamente', 'success');

      // Navigate back after delay
      setTimeout(() => {
        window.location.href = '../comandero/index.html';
      }, 1500);

    } catch (error) {
      console.error('Error processing payment:', error);
      this.showToast('Error al procesar el pago', 'error');
    }
  }

  /**
   * Sync item update to API
   */
  async syncItemUpdate(item) {
    try {
      const endpoint = this.config.api?.update_item?.replace(':id', item.id);
      if (endpoint) {
        await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      }
    } catch (error) {
      console.error('Error syncing item update:', error);
    }
  }

  /**
   * Sync item delete to API
   */
  async syncItemDelete(itemId) {
    try {
      const endpoint = this.config.api?.delete_item?.replace(':id', itemId);
      if (endpoint) {
        await fetch(endpoint, { method: 'DELETE' });
      }
    } catch (error) {
      console.error('Error syncing item delete:', error);
    }
  }

  /**
   * Connect to WebSocket
   */
  connectWebSocket() {
    try {
      const wsUrl = this.config.realtime?.websocket?.url;
      if (!wsUrl) return;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        console.log('✅ WebSocket connected');

        // Subscribe to cuenta updates
        const topic = `cobro/${this.cuentaId}/cuenta/updated`;
        this.ws.send(JSON.stringify({ action: 'subscribe', topic }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        console.log('WebSocket disconnected');

        // Reconnect after delay
        setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error connecting WebSocket:', error);
    }
  }

  /**
   * Handle WebSocket message
   */
  handleWebSocketMessage(data) {
    if (data.topic?.includes('cuenta/updated')) {
      // Reload cuenta data
      this.loadCuenta();
      this.showToast('Cuenta actualizada', 'info');
    }
  }

  /**
   * Open modal
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  /**
   * Close modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    this.elements.toastContainer.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return `€${amount.toFixed(2)}`;
  }
}

// Initialize view when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.cobro = new CobroView();
  window.cobro.init();
});
