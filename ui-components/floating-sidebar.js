/**
 * FloatingSidebar - Barra vertical lateral flotante
 * Para botones emoji 10x10mm, posicionable a izquierda o derecha
 *
 * Uso:
 * const sidebar = new FloatingSidebar({
 *   position: 'left', // 'left' o 'right'
 *   buttons: [...]
 * });
 */

class FloatingSidebar {
  constructor(options = {}) {
    this.options = {
      position: options.position || 'left', // 'left', 'right'
      align: options.align || 'top', // 'top', 'center', 'bottom'
      buttons: options.buttons || [],
      collapsible: options.collapsible !== false,
      draggable: options.draggable !== false,
      showHandle: options.showHandle !== false,
      showTooltips: options.showTooltips !== false,
      rememberPosition: options.rememberPosition !== false,
      storageKey: options.storageKey || 'floating-sidebar-position',
      compact: options.compact || false,
      onButtonClick: options.onButtonClick || (() => {})
    };

    this.element = null;
    this.isCollapsed = false;
    this.isDragging = false;
    this.currentPosition = { x: 0, y: 0 };
    this.dragOffset = { x: 0, y: 0 };
    this.tooltip = null;

    this.create();
    this.loadSavedPosition();
    this.show();
  }

  create() {
    // Container principal
    this.element = document.createElement('div');
    this.element.className = `floating-sidebar position-${this.options.position} align-${this.options.align}`;

    if (this.options.compact) {
      this.element.classList.add('compact');
    }

    // Drag handle
    if (this.options.showHandle && this.options.draggable) {
      const handle = document.createElement('div');
      handle.className = 'floating-sidebar-handle';
      handle.addEventListener('mousedown', this.startDrag.bind(this));
      handle.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });
      this.element.appendChild(handle);
      this.handleElement = handle;
    }

    // Collapse button
    if (this.options.collapsible) {
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'floating-sidebar-collapse';
      collapseBtn.innerHTML = '◀';
      collapseBtn.setAttribute('aria-label', 'Collapse sidebar');
      collapseBtn.onclick = () => this.toggleCollapse();
      this.element.appendChild(collapseBtn);
      this.collapseBtn = collapseBtn;
    }

    // Contenedor de botones
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'floating-sidebar-buttons';
    this.element.appendChild(buttonsContainer);
    this.buttonsContainer = buttonsContainer;

    // Indicador de posición
    const indicator = document.createElement('div');
    indicator.className = 'floating-sidebar-position-indicator';
    this.element.appendChild(indicator);

    // Crear tooltip
    if (this.options.showTooltips) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'floating-sidebar-tooltip';
      this.element.appendChild(this.tooltip);
    }

    // Añadir al DOM
    document.body.appendChild(this.element);

    // Añadir botones
    this.options.buttons.forEach((btn, index) => {
      this.addButton(btn, index);
    });
  }

  addButton(buttonConfig, index) {
    let buttonElement;

    if (buttonConfig instanceof HTMLElement) {
      // Si ya es un elemento HTML, usarlo directamente
      buttonElement = buttonConfig;
    } else if (buttonConfig.element) {
      // Si tiene propiedad element (como EmojiActionButton)
      buttonElement = buttonConfig.element;
    } else {
      // Crear botón emoji simple
      const emoji = buttonConfig.emoji || buttonConfig;
      const label = buttonConfig.label || null;
      const badge = buttonConfig.badge || null;
      const active = buttonConfig.active || false;

      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.setAttribute('data-index', index);

      if (active) {
        btn.classList.add('active');
      }

      // Click handler
      btn.onclick = (e) => {
        e.stopPropagation();
        this.handleButtonClick(buttonConfig, index, btn);
      };

      // Tooltip on hover
      if (this.options.showTooltips && (label || buttonConfig.tooltip)) {
        btn.onmouseenter = (e) => this.showTooltip(label || buttonConfig.tooltip, btn);
        btn.onmouseleave = () => this.hideTooltip();
      }

      // Badge
      if (badge) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'emoji-btn-badge';
        badgeEl.textContent = badge;
        wrapper.appendChild(badgeEl);
      }

      wrapper.appendChild(btn);
      buttonElement = wrapper;
    }

    this.buttonsContainer.appendChild(buttonElement);
  }

  handleButtonClick(config, index, element) {
    // Marcar como activo
    this.setActiveButton(index);

    // Callback
    if (typeof config.onClick === 'function') {
      config.onClick(config, index);
    } else {
      this.options.onButtonClick(config, index);
    }
  }

  setActiveButton(index) {
    // Remover active de todos
    this.buttonsContainer.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Añadir active al seleccionado
    const activeBtn = this.buttonsContainer.querySelector(`[data-index="${index}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;

    if (this.isCollapsed) {
      this.element.classList.add('collapsed');
      if (this.collapseBtn) {
        this.collapseBtn.innerHTML = this.options.position === 'left' ? '▶' : '◀';
      }
    } else {
      this.element.classList.remove('collapsed');
      if (this.collapseBtn) {
        this.collapseBtn.innerHTML = this.options.position === 'left' ? '◀' : '▶';
      }
    }
  }

  startDrag(e) {
    if (!this.options.draggable) return;

    e.preventDefault();
    this.isDragging = true;
    this.element.classList.add('dragging');

    const rect = this.element.getBoundingClientRect();
    const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };

    // Event listeners
    document.addEventListener('mousemove', this.drag.bind(this));
    document.addEventListener('mouseup', this.stopDrag.bind(this));
    document.addEventListener('touchmove', this.drag.bind(this), { passive: false });
    document.addEventListener('touchend', this.stopDrag.bind(this));
  }

  drag(e) {
    if (!this.isDragging) return;

    e.preventDefault();

    const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

    let x = clientX - this.dragOffset.x;
    let y = clientY - this.dragOffset.y;

    // Limitar al viewport
    const rect = this.element.getBoundingClientRect();
    x = Math.max(0, Math.min(x, window.innerWidth - rect.width));
    y = Math.max(0, Math.min(y, window.innerHeight - rect.height));

    this.currentPosition = { x, y };

    // Aplicar posición
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
    this.element.style.transform = 'none';
  }

  stopDrag() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.element.classList.remove('dragging');

    // Guardar posición
    if (this.options.rememberPosition) {
      this.savePosition();
    }

    // Remover event listeners
    document.removeEventListener('mousemove', this.drag.bind(this));
    document.removeEventListener('mouseup', this.stopDrag.bind(this));
    document.removeEventListener('touchmove', this.drag.bind(this));
    document.removeEventListener('touchend', this.stopDrag.bind(this));
  }

  savePosition() {
    if (!this.options.rememberPosition) return;

    const position = {
      x: this.currentPosition.x,
      y: this.currentPosition.y,
      side: this.options.position,
      align: this.options.align
    };

    localStorage.setItem(this.options.storageKey, JSON.stringify(position));
  }

  loadSavedPosition() {
    if (!this.options.rememberPosition) return;

    const saved = localStorage.getItem(this.options.storageKey);
    if (!saved) return;

    try {
      const position = JSON.parse(saved);
      this.currentPosition = { x: position.x, y: position.y };

      // Aplicar posición guardada
      this.element.style.left = `${position.x}px`;
      this.element.style.top = `${position.y}px`;
      this.element.style.right = 'auto';
      this.element.style.bottom = 'auto';
      this.element.style.transform = 'none';
    } catch (e) {
      console.warn('Failed to load saved position:', e);
    }
  }

  setPosition(side, align = 'top') {
    this.element.classList.remove('position-left', 'position-right');
    this.element.classList.remove('align-top', 'align-center', 'align-bottom');

    this.element.classList.add(`position-${side}`);
    this.element.classList.add(`align-${align}`);

    this.options.position = side;
    this.options.align = align;

    // Reset inline styles
    this.element.style.left = '';
    this.element.style.right = '';
    this.element.style.top = '';
    this.element.style.bottom = '';
    this.element.style.transform = '';

    // Actualizar collapse button direction
    if (this.collapseBtn && !this.isCollapsed) {
      this.collapseBtn.innerHTML = side === 'left' ? '◀' : '▶';
    }
  }

  showTooltip(text, element) {
    if (!this.tooltip) return;

    this.tooltip.textContent = text;
    this.tooltip.classList.add('visible');

    // Posicionar tooltip relativo al botón
    const rect = element.getBoundingClientRect();
    const sidebarRect = this.element.getBoundingClientRect();

    this.tooltip.style.top = `${rect.top - sidebarRect.top + rect.height / 2}px`;
    this.tooltip.style.transform = 'translateY(-50%)';
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.classList.remove('visible');
  }

  show() {
    this.element.classList.add('active', 'animating-in');
    setTimeout(() => {
      this.element.classList.remove('animating-in');
    }, 300);
  }

  hide() {
    this.element.classList.remove('active');
  }

  addButtonDynamic(buttonConfig) {
    const index = this.options.buttons.length;
    this.options.buttons.push(buttonConfig);
    this.addButton(buttonConfig, index);
  }

  removeButton(index) {
    const button = this.buttonsContainer.querySelector(`[data-index="${index}"]`);
    if (button) {
      const wrapper = button.closest('.emoji-btn-wrapper') || button.parentElement;
      wrapper.remove();
    }
    this.options.buttons.splice(index, 1);
  }

  clearButtons() {
    this.buttonsContainer.innerHTML = '';
    this.options.buttons = [];
  }

  setBadge(index, value) {
    const button = this.buttonsContainer.querySelector(`[data-index="${index}"]`);
    if (!button) return;

    const wrapper = button.parentElement;
    let badge = wrapper.querySelector('.emoji-btn-badge');

    if (value) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'emoji-btn-badge';
        wrapper.appendChild(badge);
      }
      badge.textContent = value;
    } else {
      if (badge) badge.remove();
    }
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }
}

// Export para módulos ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FloatingSidebar;
}
