/**
 * FloatingActionBar Component - Mobile-optimized floating action bar
 * Barra flotante minimalista para contener TouchActionButtons
 * @version 2.0.0
 */

(function() {
  'use strict';

  const COMPONENT_NAME = 'floating-action-bar';
  const SELECTOR = `[data-component="${COMPONENT_NAME}"]`;

  /**
   * FloatingActionBar - Barra de acciones flotante
   */
  class FloatingActionBar {
    constructor(element) {
      this.element = element;
      this.config = this.parseConfig();
      this.state = {
        variant: this.config.variant || 'default',
        position: this.config.position || 'bottom',
        visible: true,
        collapsed: this.config.defaultCollapsed || false,
        scrollY: 0,
        lastScrollY: 0,
        isDragging: false
      };

      // Scroll detection
      this.scrollTimeout = null;
      this.scrollDirection = 'none';

      // Touch/swipe tracking
      this.touchStartY = 0;
      this.touchCurrentY = 0;
      this.swipeThreshold = 50;

      this.init();
    }

    /**
     * Parse configuration
     */
    parseConfig() {
      const config = JSON.parse(this.element.dataset.config || '{}');

      return {
        variant: this.element.dataset.variant || config.variant || 'default',
        position: this.element.dataset.position || config.position || 'bottom',
        buttons: config.buttons || [],
        maxButtons: config.maxButtons || 5,
        spacing: config.spacing || 'normal',
        autoHide: config.autoHide !== undefined ? config.autoHide : false,
        swipeable: config.swipeable !== undefined ? config.swipeable : true,
        showHandle: config.showHandle !== undefined ? config.showHandle : true,
        backdrop: config.backdrop !== undefined ? config.backdrop : true,
        safeArea: config.safeArea !== undefined ? config.safeArea : true,
        hapticFeedback: config.hapticFeedback !== undefined ? config.hapticFeedback : true,
        collapsible: config.collapsible || false,
        defaultCollapsed: config.defaultCollapsed || false,
        animation: config.animation || 'slide',
        ...config
      };
    }

    /**
     * Initialize component
     */
    init() {
      this.setupAccessibility();
      this.setupStructure();
      this.setupEventListeners();
      this.render();

      // Initial state
      if (this.state.collapsed) {
        this.collapse(false); // sin animación inicial
      }
    }

    /**
     * Setup accessibility
     */
    setupAccessibility() {
      this.element.setAttribute('role', 'toolbar');
      this.element.setAttribute('aria-label', 'Barra de acciones flotante');

      if (this.state.collapsed) {
        this.element.setAttribute('aria-expanded', 'false');
      } else {
        this.element.setAttribute('aria-expanded', 'true');
      }
    }

    /**
     * Setup structure
     */
    setupStructure() {
      // Clear existing
      this.element.innerHTML = '';

      // Handle (línea para indicar swipe)
      if (this.config.showHandle) {
        this.handle = document.createElement('div');
        this.handle.className = 'floating-action-bar__handle';
        this.handle.setAttribute('aria-hidden', 'true');
        this.element.appendChild(this.handle);
      }

      // Container de botones
      this.buttonsContainer = document.createElement('div');
      this.buttonsContainer.className = 'floating-action-bar__buttons';
      this.element.appendChild(this.buttonsContainer);

      // Renderizar botones
      this.renderButtons();

      // Collapse toggle (si es collapsible)
      if (this.config.collapsible) {
        this.collapseToggle = document.createElement('button');
        this.collapseToggle.className = 'floating-action-bar__collapse-toggle';
        this.collapseToggle.setAttribute('aria-label', 'Expandir/Colapsar barra');
        this.collapseToggle.innerHTML = this.state.collapsed ? '▲' : '▼';
        this.element.appendChild(this.collapseToggle);
      }
    }

    /**
     * Render buttons
     */
    renderButtons() {
      this.buttonsContainer.innerHTML = '';

      if (!this.config.buttons || this.config.buttons.length === 0) {
        // Placeholder si no hay botones
        const placeholder = document.createElement('div');
        placeholder.className = 'floating-action-bar__placeholder';
        placeholder.textContent = 'No hay acciones disponibles';
        this.buttonsContainer.appendChild(placeholder);
        return;
      }

      // Crear botones
      this.config.buttons.forEach((buttonConfig, index) => {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'floating-action-bar__button-wrapper';

        // Si es TouchActionButton
        if (buttonConfig.component === 'touch-action-button') {
          const button = document.createElement('button');
          button.setAttribute('data-component', 'touch-action-button');
          button.setAttribute('data-config', JSON.stringify(buttonConfig));
          button.setAttribute('data-variant', buttonConfig.variant || 'secondary');
          button.setAttribute('data-size', buttonConfig.size || 'md');
          buttonWrapper.appendChild(button);
        } else {
          // Botón genérico
          const button = document.createElement('button');
          button.className = 'floating-action-bar__button';
          button.textContent = buttonConfig.label || buttonConfig.emoji || '•';
          button.setAttribute('aria-label', buttonConfig.ariaLabel || buttonConfig.label);
          buttonWrapper.appendChild(button);
        }

        this.buttonsContainer.appendChild(buttonWrapper);
      });

      // Re-inicializar TouchActionButtons si existe el componente
      if (window.AutoUI && window.AutoUI.components && window.AutoUI.components['touch-action-button']) {
        window.AutoUI.components['touch-action-button'].initAll();
      }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Swipe gestures (móvil)
      if (this.config.swipeable) {
        this.element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.element.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.element.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
      }

      // Auto-hide en scroll
      if (this.config.autoHide) {
        window.addEventListener('scroll', () => this.handleScroll(), { passive: true });
      }

      // Collapse toggle
      if (this.config.collapsible && this.collapseToggle) {
        this.collapseToggle.addEventListener('click', () => this.toggleCollapse());
      }

      // Resize handler
      window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * Handle touch start (swipe)
     */
    handleTouchStart(e) {
      // Solo si toca el handle o la barra directamente (no los botones)
      if (!e.target.closest('.floating-action-bar__handle') &&
          !e.target.closest('.floating-action-bar') === this.element) {
        return;
      }

      this.touchStartY = e.touches[0].clientY;
      this.touchCurrentY = this.touchStartY;
      this.state.isDragging = true;
    }

    /**
     * Handle touch move (swipe)
     */
    handleTouchMove(e) {
      if (!this.state.isDragging) return;

      this.touchCurrentY = e.touches[0].clientY;
      const deltaY = this.touchCurrentY - this.touchStartY;

      // Prevenir scroll si estamos arrastrando
      if (Math.abs(deltaY) > 10) {
        e.preventDefault();
      }

      // Visual feedback del drag
      const isBottom = this.state.position.includes('bottom');
      const translateY = isBottom ? Math.max(0, deltaY) : Math.min(0, deltaY);
      this.element.style.transform = `translateY(${translateY}px)`;
    }

    /**
     * Handle touch end (swipe)
     */
    handleTouchEnd(e) {
      if (!this.state.isDragging) return;

      const deltaY = this.touchCurrentY - this.touchStartY;
      const isBottom = this.state.position.includes('bottom');

      // Determinar si el swipe fue suficiente
      const threshold = this.swipeThreshold;
      const shouldHide = isBottom ? deltaY > threshold : deltaY < -threshold;

      if (shouldHide) {
        this.hide();
        this.vibrate(10);
      } else {
        // Volver a posición original
        this.element.style.transform = '';
      }

      this.state.isDragging = false;
      this.touchStartY = 0;
      this.touchCurrentY = 0;
    }

    /**
     * Handle scroll (auto-hide)
     */
    handleScroll() {
      clearTimeout(this.scrollTimeout);

      this.state.scrollY = window.scrollY;
      this.scrollDirection = this.state.scrollY > this.state.lastScrollY ? 'down' : 'up';

      // Auto-hide logic
      if (this.scrollDirection === 'down' && this.state.visible) {
        this.scrollTimeout = setTimeout(() => {
          if (this.state.scrollY > 100) { // Solo ocultar si scroll > 100px
            this.hide();
          }
        }, 150);
      } else if (this.scrollDirection === 'up' && !this.state.visible) {
        this.show();
      }

      this.state.lastScrollY = this.state.scrollY;
    }

    /**
     * Handle resize
     */
    handleResize() {
      // Re-calcular posiciones si es necesario
      this.emitEvent('resize');
    }

    /**
     * Show bar
     */
    show(animate = true) {
      if (this.state.visible) return;

      this.state.visible = true;
      this.element.classList.remove('floating-action-bar--hidden');
      this.element.style.transform = '';

      if (!animate) {
        this.element.style.transition = 'none';
        setTimeout(() => {
          this.element.style.transition = '';
        }, 50);
      }

      this.emitEvent('show');
    }

    /**
     * Hide bar
     */
    hide(animate = true) {
      if (!this.state.visible) return;

      this.state.visible = false;
      this.element.classList.add('floating-action-bar--hidden');

      if (!animate) {
        this.element.style.transition = 'none';
        setTimeout(() => {
          this.element.style.transition = '';
        }, 50);
      }

      this.emitEvent('hide');
    }

    /**
     * Toggle visibility
     */
    toggle() {
      if (this.state.visible) {
        this.hide();
      } else {
        this.show();
      }
    }

    /**
     * Collapse bar
     */
    collapse(animate = true) {
      if (this.state.collapsed) return;

      this.state.collapsed = true;
      this.element.classList.add('floating-action-bar--collapsed');
      this.element.setAttribute('aria-expanded', 'false');

      if (this.collapseToggle) {
        this.collapseToggle.innerHTML = '▲';
      }

      if (!animate) {
        this.element.style.transition = 'none';
        setTimeout(() => {
          this.element.style.transition = '';
        }, 50);
      }

      this.vibrate(10);
      this.emitEvent('collapse');
    }

    /**
     * Expand bar
     */
    expand(animate = true) {
      if (!this.state.collapsed) return;

      this.state.collapsed = false;
      this.element.classList.remove('floating-action-bar--collapsed');
      this.element.setAttribute('aria-expanded', 'true');

      if (this.collapseToggle) {
        this.collapseToggle.innerHTML = '▼';
      }

      if (!animate) {
        this.element.style.transition = 'none';
        setTimeout(() => {
          this.element.style.transition = '';
        }, 50);
      }

      this.vibrate(10);
      this.emitEvent('expand');
    }

    /**
     * Toggle collapse
     */
    toggleCollapse() {
      if (this.state.collapsed) {
        this.expand();
      } else {
        this.collapse();
      }
    }

    /**
     * Add button dynamically
     */
    addButton(buttonConfig) {
      this.config.buttons.push(buttonConfig);
      this.renderButtons();
      this.emitEvent('button-added', { button: buttonConfig });
    }

    /**
     * Remove button by index
     */
    removeButton(index) {
      if (index < 0 || index >= this.config.buttons.length) return;

      const removed = this.config.buttons.splice(index, 1);
      this.renderButtons();
      this.emitEvent('button-removed', { button: removed[0], index });
    }

    /**
     * Update buttons
     */
    updateButtons(buttons) {
      this.config.buttons = buttons;
      this.renderButtons();
      this.emitEvent('buttons-updated', { buttons });
    }

    /**
     * Vibrate (haptic feedback)
     */
    vibrate(pattern) {
      if (!this.config.hapticFeedback) return;

      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    }

    /**
     * Emit custom event
     */
    emitEvent(eventName, detail = {}) {
      const event = new CustomEvent(`${COMPONENT_NAME}:${eventName}`, {
        detail: {
          component: this,
          element: this.element,
          config: this.config,
          state: this.state,
          ...detail
        },
        bubbles: true,
        cancelable: true
      });

      this.element.dispatchEvent(event);
    }

    /**
     * Render component
     */
    render() {
      // Base class
      this.element.classList.add('floating-action-bar');

      // Variant
      this.element.classList.add(`floating-action-bar--${this.state.variant}`);

      // Position
      this.element.classList.add(`floating-action-bar--${this.state.position}`);

      // Spacing
      this.element.classList.add(`floating-action-bar--spacing-${this.config.spacing}`);

      // Animation
      this.element.setAttribute('data-animation', this.config.animation);

      // Backdrop
      if (this.config.backdrop) {
        this.element.classList.add('floating-action-bar--backdrop');
      }

      // Safe area
      if (this.config.safeArea) {
        this.element.classList.add('floating-action-bar--safe-area');
      }

      this.emitEvent('rendered');
    }

    /**
     * Update state
     */
    setState(newState) {
      this.state = { ...this.state, ...newState };
      this.emitEvent('state-changed', { state: this.state });
    }

    /**
     * Destroy component
     */
    destroy() {
      // Remove event listeners
      window.removeEventListener('scroll', this.handleScroll);
      window.removeEventListener('resize', this.handleResize);

      this.emitEvent('destroy');
      this.element.remove();
    }
  }

  /**
   * Initialize all components
   */
  function initAll() {
    document.querySelectorAll(SELECTOR).forEach(element => {
      if (!element.dataset.initialized) {
        new FloatingActionBar(element);
        element.dataset.initialized = 'true';
      }
    });
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Re-initialize on HTMX swap
  document.addEventListener('htmx:afterSwap', initAll);

  // Export
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['floating-action-bar'] = FloatingActionBar;
  window.AutoUI.components['floating-action-bar'].initAll = initAll;

})();
