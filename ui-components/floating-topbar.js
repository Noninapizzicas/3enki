/**
 * FloatingTopbar - Barra superior flotante horizontal
 * Para botones emoji 10x10mm, posicionable en top
 *
 * Uso:
 * const topbar = new FloatingTopbar({
 *   align: 'center',
 *   buttons: [...]
 * });
 */

class FloatingTopbar {
  constructor(options = {}) {
    this.options = {
      align: options.align || 'center', // 'left', 'center', 'right'
      buttons: options.buttons || [],
      groups: options.groups || null, // Array de grupos con separadores
      collapsible: options.collapsible !== false,
      draggable: options.draggable !== false,
      showHandle: options.showHandle !== false,
      showTooltips: options.showTooltips !== false,
      rememberPosition: options.rememberPosition !== false,
      storageKey: options.storageKey || 'floating-topbar-position',
      compact: options.compact || false,
      autoHide: options.autoHide || false, // Auto-hide on scroll down
      onButtonClick: options.onButtonClick || (() => {})
    };

    this.element = null;
    this.isCollapsed = false;
    this.isDragging = false;
    this.currentPosition = { x: 0, y: 0 };
    this.dragOffset = { x: 0, y: 0 };
    this.tooltip = null;
    this.lastScrollY = 0;

    this.create();
    this.loadSavedPosition();

    if (this.options.autoHide) {
      this.setupAutoHide();
    }

    this.show();
  }

  create() {
    // Container principal
    this.element = document.createElement('div');
    this.element.className = `floating-topbar align-${this.options.align}`;

    if (this.options.compact) {
      this.element.classList.add('compact');
    }

    if (this.options.autoHide) {
      this.element.classList.add('auto-hide');
    }

    // Drag handle
    if (this.options.showHandle && this.options.draggable) {
      const handle = document.createElement('div');
      handle.className = 'floating-topbar-handle';
      handle.addEventListener('mousedown', this.startDrag.bind(this));
      handle.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });
      this.element.appendChild(handle);
      this.handleElement = handle;
    }

    // Collapse button
    if (this.options.collapsible) {
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'floating-topbar-collapse';
      collapseBtn.innerHTML = '▼';
      collapseBtn.setAttribute('aria-label', 'Collapse topbar');
      collapseBtn.onclick = () => this.toggleCollapse();
      this.element.appendChild(collapseBtn);
      this.collapseBtn = collapseBtn;
    }

    // Contenedor de botones
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'floating-topbar-buttons';
    this.element.appendChild(buttonsContainer);
    this.buttonsContainer = buttonsContainer;

    // Crear tooltip
    if (this.options.showTooltips) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'floating-topbar-tooltip';
      this.element.appendChild(this.tooltip);
    }

    // Añadir al DOM
    document.body.appendChild(this.element);

    // Añadir botones o grupos
    if (this.options.groups) {
      this.addGroups(this.options.groups);
    } else if (this.options.buttons) {
      this.options.buttons.forEach((btn, index) => {
        this.addButton(btn, index);
      });
    }
  }

  addGroups(groups) {
    groups.forEach((group, groupIndex) => {
      // Crear grupo
      const groupDiv = document.createElement('div');
      groupDiv.className = 'floating-topbar-group';

      // Label opcional del grupo
      if (group.label) {
        const label = document.createElement('span');
        label.className = 'floating-topbar-group-label';
        label.textContent = group.label;
        groupDiv.appendChild(label);
      }

      // Añadir botones del grupo
      group.buttons.forEach((btn, btnIndex) => {
        const index = `${groupIndex}-${btnIndex}`;
        this.addButtonToContainer(btn, index, groupDiv);
      });

      this.buttonsContainer.appendChild(groupDiv);

      // Separador después del grupo (excepto el último)
      if (groupIndex < groups.length - 1) {
        const separator = document.createElement('div');
        separator.className = 'floating-topbar-separator';
        this.buttonsContainer.appendChild(separator);
      }
    });
  }

  addButton(buttonConfig, index) {
    this.addButtonToContainer(buttonConfig, index, this.buttonsContainer);
  }

  addButtonToContainer(buttonConfig, index, container) {
    let buttonElement;

    if (buttonConfig instanceof HTMLElement) {
      buttonElement = buttonConfig;
    } else if (buttonConfig.element) {
      buttonElement = buttonConfig.element;
    } else {
      const emoji = buttonConfig.emoji || buttonConfig;
      const tooltip = buttonConfig.tooltip || null;
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
      if (this.options.showTooltips && tooltip) {
        btn.onmouseenter = (e) => this.showTooltip(tooltip, btn);
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

    container.appendChild(buttonElement);
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
        this.collapseBtn.innerHTML = '▶';
      }
    } else {
      this.element.classList.remove('collapsed');
      if (this.collapseBtn) {
        this.collapseBtn.innerHTML = '▼';
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
      this.element.style.transform = 'none';
    } catch (e) {
      console.warn('Failed to load saved position:', e);
    }
  }

  setAlign(align) {
    this.element.classList.remove('align-left', 'align-center', 'align-right');
    this.element.classList.add(`align-${align}`);
    this.options.align = align;

    // Reset inline styles
    this.element.style.left = '';
    this.element.style.right = '';
    this.element.style.top = '';
    this.element.style.transform = '';
  }

  showTooltip(text, element) {
    if (!this.tooltip) return;

    this.tooltip.textContent = text;
    this.tooltip.classList.add('visible');

    // Posicionar tooltip relativo al botón
    const rect = element.getBoundingClientRect();
    const topbarRect = this.element.getBoundingClientRect();

    this.tooltip.style.left = `${rect.left - topbarRect.left + rect.width / 2}px`;
    this.tooltip.style.transform = 'translateX(-50%)';
  }

  hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.classList.remove('visible');
  }

  setupAutoHide() {
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;

      clearTimeout(scrollTimeout);

      // Scroll down - hide
      if (currentScrollY > this.lastScrollY && currentScrollY > 100) {
        this.element.classList.add('hidden');
      } else {
        // Scroll up - show
        this.element.classList.remove('hidden');
      }

      scrollTimeout = setTimeout(() => {
        this.lastScrollY = currentScrollY;
      }, 100);
    });
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
  module.exports = FloatingTopbar;
}
