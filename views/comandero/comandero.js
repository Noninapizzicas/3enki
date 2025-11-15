/**
 * Comandero View Controller
 * Controlador de la vista de toma de pedidos
 * Version: 1.0.0
 */

class ComanderoView {
  constructor() {
    // Estado de la vista
    this.cuentaId = null;
    this.cuentaNombre = 'Mesa 1';
    this.cuentaTipo = 'local';
    this.orderItems = [];
    this.productos = [];
    this.categorias = [];
    this.selectedCategory = null;

    // Componentes UI
    this.productoButtons = new Map();
    this.sidebarButtons = new Map();
    this.categoryButtons = new Map();

    // WebSocket
    this.ws = null;

    // Inicializar
    this.init();
  }

  /**
   * Inicializa la vista
   */
  async init() {
    try {
      // Cargar configuración
      await this.loadConfig();

      // Inicializar UI
      this.initHeader();
      this.initTopbar();
      this.initSidebar();

      // Cargar datos
      await this.loadCuenta();
      await this.loadProductos();

      // Renderizar productos
      this.renderProductos();

      // Conectar WebSocket
      this.connectWebSocket();

      // Event listeners globales
      this.attachGlobalListeners();

      console.log('✅ Comandero View initialized');
    } catch (error) {
      console.error('Error initializing view:', error);
      this.showToast('Error al inicializar la vista', 'error');
    }
  }

  /**
   * Carga la configuración desde view.json
   */
  async loadConfig() {
    try {
      const response = await fetch('./view.json');
      this.config = await response.json();
      this.categorias = this.config.categorias;
    } catch (error) {
      console.error('Error loading config:', error);
      // Usar configuración por defecto
      this.categorias = [
        { id: 'pizzas', nombre: 'Pizzas', emoji: '🍕', color: '#f97316' },
        { id: 'bebidas', nombre: 'Bebidas', emoji: '🥤', color: '#06b6d4' },
        { id: 'postres', nombre: 'Postres', emoji: '🍰', color: '#ec4899' }
      ];
    }
  }

  /**
   * Inicializa el header
   */
  initHeader() {
    const cuentaNombreEl = document.getElementById('cuentaNombre');
    const cuentaTipoEl = document.getElementById('cuentaTipo');

    if (cuentaNombreEl) cuentaNombreEl.textContent = this.cuentaNombre;
    if (cuentaTipoEl) cuentaTipoEl.textContent = this.cuentaTipo;

    this.updateSummary();
  }

  /**
   * Inicializa el topbar con categorías
   */
  initTopbar() {
    const topbar = document.getElementById('topbarCategories');
    if (!topbar) return;

    this.categorias.forEach((categoria, index) => {
      const button = document.createElement('button');
      button.className = 'category-button';
      if (index === 0) button.classList.add('active');
      button.innerHTML = `
        <span class="emoji">${categoria.emoji}</span>
        <span>${categoria.nombre}</span>
      `;

      button.addEventListener('click', () => {
        this.selectCategory(categoria.id);
      });

      topbar.appendChild(button);
      this.categoryButtons.set(categoria.id, button);
    });

    // Seleccionar primera categoría
    if (this.categorias.length > 0) {
      this.selectedCategory = this.categorias[0].id;
    }
  }

  /**
   * Inicializa el sidebar
   */
  initSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const sidebarConfig = this.config?.sidebar?.buttons || [
      { id: 'cobrar', emoji: '💰', type: 'success', label: 'Cobrar' },
      { id: 'sep1', type: 'separator' },
      { id: 'cuentas', emoji: '📋', type: 'info', label: 'Ver Cuentas' }
    ];

    sidebarConfig.forEach(btnConfig => {
      if (btnConfig.type === 'separator') {
        const divider = document.createElement('div');
        divider.className = 'sidebar-divider';
        sidebar.appendChild(divider);
        return;
      }

      const element = document.createElement('button');
      element.className = 'sidebar-button';
      sidebar.appendChild(element);

      const btn = new SidebarButton(element, {
        id: btnConfig.id,
        emoji: btnConfig.emoji,
        type: btnConfig.type || 'primary',
        label: btnConfig.label,
        action: btnConfig.action || 'custom',
        route: btnConfig.route
      });

      // Event listeners
      btn.on('button:click', (data) => {
        this.handleSidebarAction(data);
      });

      this.sidebarButtons.set(btnConfig.id, btn);
    });
  }

  /**
   * Maneja acciones del sidebar
   */
  handleSidebarAction(data) {
    const { id, action } = data;

    switch (id) {
      case 'cobrar':
        this.scrollToCobro();
        break;

      case 'mitad-mitad':
        this.openModal('modalMitad');
        break;

      case 'pizza-gusto':
        this.openModal('modalGusto');
        break;

      case 'ver-cuentas':
        window.location.href = '/cuentas';
        break;

      case 'nueva-local':
        this.createNewCuenta('local');
        break;

      case 'nueva-delivery':
        this.createNewCuenta('delivery');
        break;

      case 'nueva-llevar':
        this.createNewCuenta('llevar');
        break;

      default:
        console.log('Sidebar action:', id, action);
    }
  }

  /**
   * Selecciona una categoría
   */
  selectCategory(categoryId) {
    this.selectedCategory = categoryId;

    // Actualizar botones activos
    this.categoryButtons.forEach((button, id) => {
      if (id === categoryId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });

    // Scroll a la sección
    const section = document.getElementById(`category-${categoryId}`);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Carga los datos de la cuenta
   */
  async loadCuenta() {
    try {
      // TODO: Cargar desde API real
      // const response = await fetch(`/modules/comandero/cuentas/${this.cuentaId}`);
      // const data = await response.json();

      // Mock data
      this.cuentaId = 'mesa-1';
      this.cuentaNombre = 'Mesa 1';
      this.cuentaTipo = 'local';
      this.orderItems = [];

      this.initHeader();
    } catch (error) {
      console.error('Error loading cuenta:', error);
    }
  }

  /**
   * Carga los productos
   */
  async loadProductos() {
    try {
      // TODO: Cargar desde API real
      // const response = await fetch('/modules/comandero/productos');
      // this.productos = await response.json();

      // Mock data
      this.productos = this.generateMockProductos();
    } catch (error) {
      console.error('Error loading productos:', error);
      this.productos = this.generateMockProductos();
    }
  }

  /**
   * Genera productos de ejemplo
   */
  generateMockProductos() {
    const productos = [];

    // Pizzas
    const pizzas = [
      { nombre: 'Margarita', precio: 8.50, evento: 'oferta' },
      { nombre: 'Carbonara', precio: 10.50, evento: 'destacado' },
      { nombre: 'Vegetariana', precio: 9.50, evento: 'vegano' },
      { nombre: '4 Quesos', precio: 11.50, evento: 'nuevo' },
      { nombre: 'Hawaiana', precio: 9.00, evento: 'normal' },
      { nombre: 'Pepperoni', precio: 10.00, evento: 'picante' }
    ];

    pizzas.forEach((p, i) => {
      productos.push({
        id: `pizza-${i}`,
        nombre: p.nombre,
        precio: p.precio,
        categoria: 'pizzas',
        evento: p.evento
      });
    });

    // Bebidas
    const bebidas = [
      { nombre: 'Coca-Cola', precio: 2.50 },
      { nombre: 'Agua', precio: 1.50 },
      { nombre: 'Cerveza', precio: 3.00 },
      { nombre: 'Vino', precio: 12.00 }
    ];

    bebidas.forEach((b, i) => {
      productos.push({
        id: `bebida-${i}`,
        nombre: b.nombre,
        precio: b.precio,
        categoria: 'bebidas',
        evento: 'normal'
      });
    });

    // Postres
    const postres = [
      { nombre: 'Tiramisú', precio: 4.50, evento: 'nuevo' },
      { nombre: 'Helado', precio: 3.50 },
      { nombre: 'Brownie', precio: 4.00 }
    ];

    postres.forEach((p, i) => {
      productos.push({
        id: `postre-${i}`,
        nombre: p.nombre,
        precio: p.precio,
        categoria: 'postres',
        evento: p.evento || 'normal'
      });
    });

    return productos;
  }

  /**
   * Renderiza los productos por categoría
   */
  renderProductos() {
    const container = document.getElementById('productosGrid');
    if (!container) return;

    container.innerHTML = '';

    // Agrupar por categoría
    const productosPorCategoria = {};
    this.productos.forEach(producto => {
      if (!productosPorCategoria[producto.categoria]) {
        productosPorCategoria[producto.categoria] = [];
      }
      productosPorCategoria[producto.categoria].push(producto);
    });

    // Renderizar por categoría
    this.categorias.forEach(categoria => {
      const productos = productosPorCategoria[categoria.id] || [];
      if (productos.length === 0) return;

      // Sección de categoría
      const section = document.createElement('div');
      section.className = 'category-section';
      section.id = `category-${categoria.id}`;

      // Título
      const title = document.createElement('h3');
      title.className = 'category-section-title';
      title.innerHTML = `
        <span class="emoji">${categoria.emoji}</span>
        <span>${categoria.nombre}</span>
      `;
      section.appendChild(title);

      // Grid de productos
      const grid = document.createElement('div');
      grid.className = 'productos-grid';

      productos.forEach(producto => {
        const button = document.createElement('button');
        button.className = 'producto-button';
        grid.appendChild(button);

        const productoBtn = new ProductoButton(button, {
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          categoria: producto.categoria,
          evento: producto.evento || 'normal',
          config: { enableMQTT: false }
        });

        // Event listeners
        productoBtn.on('producto:add', (data) => {
          this.addToOrder(data);
        });

        productoBtn.on('producto:variations', (data) => {
          this.showVariations(data);
        });

        this.productoButtons.set(producto.id, productoBtn);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  /**
   * Añade un producto a la orden
   */
  addToOrder(producto) {
    // Buscar si ya existe
    const existingItem = this.orderItems.find(item => item.id === producto.id);

    if (existingItem) {
      existingItem.cantidad++;
    } else {
      this.orderItems.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        categoria: producto.categoria,
        cantidad: 1
      });
    }

    this.updateSummary();
    this.updateCobroSection();
    this.showToast(`${producto.nombre} añadido`, 'success');
  }

  /**
   * Muestra variaciones de un producto
   */
  showVariations(producto) {
    const modal = document.getElementById('modalVariaciones');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');

    if (titleEl) titleEl.textContent = `Variaciones de ${producto.nombre}`;
    if (bodyEl) {
      bodyEl.innerHTML = `
        <p>Selecciona la variación para <strong>${producto.nombre}</strong></p>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
          <button class="btn-secondary" onclick="comandero.closeModal('modalVariaciones')">Pequeña (€${(producto.precio * 0.8).toFixed(2)})</button>
          <button class="btn-secondary" onclick="comandero.closeModal('modalVariaciones')">Mediana (€${producto.precio.toFixed(2)})</button>
          <button class="btn-secondary" onclick="comandero.closeModal('modalVariaciones')">Grande (€${(producto.precio * 1.3).toFixed(2)})</button>
        </div>
      `;
    }

    this.openModal('modalVariaciones');
  }

  /**
   * Actualiza el resumen del pedido
   */
  updateSummary() {
    const totalItems = this.orderItems.reduce((sum, item) => sum + item.cantidad, 0);
    const totalAmount = this.orderItems.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

    const itemsCountEl = document.getElementById('itemsCount');
    const totalAmountEl = document.getElementById('totalAmount');

    if (itemsCountEl) {
      itemsCountEl.textContent = `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
    }

    if (totalAmountEl) {
      totalAmountEl.textContent = `€${totalAmount.toFixed(2)}`;
    }
  }

  /**
   * Actualiza la sección de cobro
   */
  updateCobroSection() {
    const subtotal = this.orderItems.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const iva = subtotal * 0.21;
    const total = subtotal + iva;

    const subtotalEl = document.getElementById('subtotal');
    const ivaEl = document.getElementById('iva');
    const totalEl = document.getElementById('totalFinal');

    if (subtotalEl) subtotalEl.textContent = `€${subtotal.toFixed(2)}`;
    if (ivaEl) ivaEl.textContent = `€${iva.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `€${total.toFixed(2)}`;

    // Renderizar items
    const cobroItemsEl = document.getElementById('cobroItems');
    if (cobroItemsEl) {
      cobroItemsEl.innerHTML = this.orderItems.map(item => `
        <div class="cobro-item">
          <div class="item-info">
            <div class="item-nombre">${item.nombre}</div>
            <div class="item-details">Cantidad: ${item.cantidad} × €${item.precio.toFixed(2)}</div>
          </div>
          <div class="item-precio">€${(item.precio * item.cantidad).toFixed(2)}</div>
        </div>
      `).join('');
    }
  }

  /**
   * Scroll a la sección de cobro
   */
  scrollToCobro() {
    const cobroSection = document.getElementById('cobroSection');
    if (cobroSection) {
      cobroSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Crea una nueva cuenta
   */
  async createNewCuenta(tipo) {
    try {
      // TODO: Llamar a API real
      // const response = await fetch('/modules/comandero/cuentas', {
      //   method: 'POST',
      //   body: JSON.stringify({ tipo })
      // });
      // const nuevaCuenta = await response.json();

      const tipoLabels = {
        local: 'Mesa',
        delivery: 'Delivery',
        llevar: 'Para Llevar'
      };

      this.showToast(`Nueva cuenta ${tipoLabels[tipo]} creada`, 'success');

      // Resetear orden actual
      this.orderItems = [];
      this.updateSummary();
      this.updateCobroSection();
    } catch (error) {
      console.error('Error creating cuenta:', error);
      this.showToast('Error al crear cuenta', 'error');
    }
  }

  /**
   * Conecta al WebSocket
   */
  connectWebSocket() {
    try {
      const wsUrl = this.config?.realtime?.websocket?.url || 'ws://localhost:9883';

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed, reconnecting in 5s...');
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
    }
  }

  /**
   * Maneja mensajes del WebSocket
   */
  handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log('WebSocket message:', message);

      // TODO: Manejar actualizaciones en tiempo real
      // - Actualizar productos (stock, precio)
      // - Actualizar cuenta
      // - Notificaciones
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Abre un modal
   */
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  /**
   * Cierra un modal
   */
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Muestra un toast
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Event listeners globales
   */
  attachGlobalListeners() {
    // Botón cobrar
    const btnCobrar = document.getElementById('btnCobrar');
    if (btnCobrar) {
      btnCobrar.addEventListener('click', () => {
        if (this.orderItems.length === 0) {
          this.showToast('No hay items en la orden', 'warning');
          return;
        }

        // TODO: Procesar cobro
        this.showToast('Procesando cobro...', 'info');
      });
    }

    // Botón imprimir
    const btnImprimir = document.getElementById('btnImprimir');
    if (btnImprimir) {
      btnImprimir.addEventListener('click', () => {
        window.print();
      });
    }
  }
}

// Funciones globales para modales (llamadas desde HTML)
window.closeModal = (modalId) => {
  if (window.comandero) {
    window.comandero.closeModal(modalId);
  }
};

window.addVariation = () => {
  if (window.comandero) {
    window.comandero.showToast('Variación añadida', 'success');
    window.comandero.closeModal('modalVariaciones');
  }
};

// Inicializar vista al cargar
document.addEventListener('DOMContentLoaded', () => {
  window.comandero = new ComanderoView();
});
