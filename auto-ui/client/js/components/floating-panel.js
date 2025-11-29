/**
 * FloatingPanel Component - Mobile-optimized draggable bottom sheet
 * Panel flotante desde abajo, ajustable, integrado con TouchActionButton
 * @version 2.0.0
 */

(function() {
  'use strict';

  const COMPONENT_NAME = 'floating-panel';
  const SELECTOR = `[data-component="${COMPONENT_NAME}"]`;

  /**
   * FloatingPanel - Panel flotante arrastrable
   */
  class FloatingPanel {
    constructor(element, config = {}) {
      this.element = element;
      this.config = { ...this.parseConfig(), ...config };
      this.state = {
        variant: this.config.variant || 'default',
        size: this.config.size || 'medium',
        open: false,
        dragging: false,
        currentHeight: 0,
        targetHeight: 0,
        startY: 0,
        currentY: 0,
        isDismissing: false
      };

      // Elements
      this.backdrop = null;
      this.handle = null;
      this.closeButton = null;
      this.header = null;
      this.body = null;
      this.footer = null;

      // Focus trap
      this.focusableElements = [];
      this.firstFocusable = null;
      this.lastFocusable = null;

      this.init();
    }

    /**
     * Parse configuration
     */
    parseConfig() {
      const config = JSON.parse(this.element.dataset.config || '{}');

      return {
        variant: this.element.dataset.variant || config.variant || 'default',
        size: this.element.dataset.size || config.size || 'medium',
        title: config.title || '',
        content: config.content || '',
        showHandle: config.showHandle !== false,
        showCloseButton: config.showCloseButton !== false,
        draggable: config.draggable !== false,
        swipeToClose: config.swipeToClose !== false,
        backdropClose: config.backdropClose !== false,
        backdrop: config.backdrop !== false,
        backdropBlur: config.backdropBlur !== false,
        snapPoints: config.snapPoints || [30, 60, 90],
        animation: config.animation || 'slide',
        hapticFeedback: config.hapticFeedback !== false,
        persistent: config.persistent || false,
        actions: config.actions || [],
        onOpen: config.onOpen,
        onClose: config.onClose,
        onResize: config.onResize,
        ...config
      };
    }

    /**
     * Initialize panel
     */
    init() {
      this.setupStructure();
      this.setupAccessibility();
      this.setupEventListeners();
      this.render();

      // Start hidden
      this.element.style.display = 'none';
    }

    /**
     * Setup structure
     */
    setupStructure() {
      this.element.innerHTML = '';

      // Backdrop
      if (this.config.backdrop) {
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'floating-panel__backdrop';
        if (this.config.backdropBlur) {
          this.backdrop.classList.add('floating-panel__backdrop--blur');
        }
        document.body.appendChild(this.backdrop);
      }

      // Panel container
      this.panel = document.createElement('div');
      this.panel.className = 'floating-panel__container';
      this.element.appendChild(this.panel);

      // Handle
      if (this.config.showHandle) {
        this.handle = document.createElement('div');
        this.handle.className = 'floating-panel__handle';
        this.handle.setAttribute('aria-hidden', 'true');
        this.panel.appendChild(this.handle);
      }

      // Header
      if (this.config.title || this.config.showCloseButton) {
        this.header = document.createElement('div');
        this.header.className = 'floating-panel__header';

        if (this.config.title) {
          const title = document.createElement('h2');
          title.className = 'floating-panel__title';
          title.textContent = this.config.title;
          this.header.appendChild(title);
        }

        if (this.config.showCloseButton) {
          this.closeButton = document.createElement('button');
          this.closeButton.type = 'button';
          this.closeButton.className = 'floating-panel__close';
          this.closeButton.setAttribute('aria-label', 'Cerrar');
          this.closeButton.innerHTML = '×';
          this.header.appendChild(this.closeButton);
        }

        this.panel.appendChild(this.header);
      }

      // Body
      this.body = document.createElement('div');
      this.body.className = 'floating-panel__body';
      if (this.config.content) {
        this.body.innerHTML = this.config.content;
      }
      this.panel.appendChild(this.body);

      // Footer (actions)
      if (this.config.actions && this.config.actions.length > 0) {
        this.footer = document.createElement('div');
        this.footer.className = 'floating-panel__footer';

        this.config.actions.forEach(actionConfig => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `floating-panel__action floating-panel__action--${actionConfig.variant || 'secondary'}`;
          button.textContent = actionConfig.label;
          button.dataset.action = actionConfig.action;
          this.footer.appendChild(button);
        });

        this.panel.appendChild(this.footer);
      }
    }

    /**
     * Setup accessibility
     */
    setupAccessibility() {
      this.element.setAttribute('role', 'dialog');
      this.element.setAttribute('aria-modal', 'true');

      if (this.config.title) {
        this.element.setAttribute('aria-label', this.config.title);
      } else {
        this.element.setAttribute('aria-label', 'Panel flotante');
      }

      this.element.setAttribute('tabindex', '-1');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Drag events (handle)
      if (this.config.draggable && this.handle) {
        this.handle.addEventListener('touchstart', (e) => this.handleDragStart(e), { passive: true });
        this.handle.addEventListener('mousedown', (e) => this.handleDragStart(e));
      }

      // Global drag events
      document.addEventListener('touchmove', (e) => this.handleDragMove(e), { passive: false });
      document.addEventListener('touchend', (e) => this.handleDragEnd(e));
      document.addEventListener('mousemove', (e) => this.handleDragMove(e));
      document.addEventListener('mouseup', (e) => this.handleDragEnd(e));

      // Close button
      if (this.closeButton) {
        this.closeButton.addEventListener('click', () => this.close());
      }

      // Backdrop click
      if (this.backdrop && this.config.backdropClose) {
        this.backdrop.addEventListener('click', () => {
          if (!this.config.persistent) {
            this.close();
          }
        });
      }

      // Keyboard
      document.addEventListener('keydown', (e) => this.handleKeyboard(e));

      // Action buttons
      if (this.footer) {
        this.footer.querySelectorAll('.floating-panel__action').forEach(btn => {
          btn.addEventListener('click', (e) => this.handleAction(e));
        });
      }
    }

    /**
     * Handle drag start
     */
    handleDragStart(e) {
      if (!this.config.draggable) return;

      this.state.dragging = true;
      this.state.startY = e.touches ? e.touches[0].clientY : e.clientY;
      this.state.currentHeight = this.panel.offsetHeight;

      this.panel.style.transition = 'none';
      this.element.classList.add('floating-panel--dragging');

      this.vibrate(10);
    }

    /**
     * Handle drag move
     */
    handleDragMove(e) {
      if (!this.state.dragging) return;

      const currentY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaY = this.state.startY - currentY;
      const newHeight = this.state.currentHeight + deltaY;
      const maxHeight = window.innerHeight * 0.95;
      const minHeight = window.innerHeight * 0.15;

      // Constrain height
      const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

      // Apply height
      this.panel.style.height = `${constrainedHeight}px`;

      // Prevent scrolling
      if (e.cancelable) {
        e.preventDefault();
      }

      // Check if swiping down significantly to close
      if (deltaY < -100 && this.config.swipeToClose) {
        this.state.isDismissing = true;
        this.element.classList.add('floating-panel--dismissing');
      } else {
        this.state.isDismissing = false;
        this.element.classList.remove('floating-panel--dismissing');
      }
    }

    /**
     * Handle drag end
     */
    handleDragEnd(e) {
      if (!this.state.dragging) return;

      this.state.dragging = false;
      this.panel.style.transition = '';
      this.element.classList.remove('floating-panel--dragging');

      // If dismissing (swiped down a lot), close
      if (this.state.isDismissing) {
        this.close();
        return;
      }

      // Find nearest snap point
      const currentHeight = this.panel.offsetHeight;
      const viewportHeight = window.innerHeight;
      const currentPercentage = (currentHeight / viewportHeight) * 100;

      // Find closest snap point
      let closestSnap = this.config.snapPoints[0];
      let minDiff = Math.abs(currentPercentage - closestSnap);

      this.config.snapPoints.forEach(snap => {
        const diff = Math.abs(currentPercentage - snap);
        if (diff < minDiff) {
          minDiff = diff;
          closestSnap = snap;
        }
      });

      // Snap to closest point
      this.snapToSize(closestSnap);
      this.vibrate(10);
    }

    /**
     * Snap to size percentage
     */
    snapToSize(percentage) {
      const height = (window.innerHeight * percentage) / 100;
      this.panel.style.height = `${height}px`;
      this.state.currentHeight = height;

      // Update state.size based on percentage
      if (percentage <= 35) {
        this.state.size = 'small';
      } else if (percentage <= 70) {
        this.state.size = 'medium';
      } else {
        this.state.size = 'full';
      }

      this.emitEvent('resize', { size: this.state.size, height, percentage });

      if (this.config.onResize) {
        this.config.onResize({ size: this.state.size, height, percentage });
      }
    }

    /**
     * Handle keyboard
     */
    handleKeyboard(e) {
      if (!this.state.open) return;

      // ESC to close
      if (e.key === 'Escape' && !this.config.persistent) {
        e.preventDefault();
        this.close();
      }

      // Tab for focus trap
      if (e.key === 'Tab') {
        this.handleTab(e);
      }
    }

    /**
     * Handle tab (focus trap)
     */
    handleTab(e) {
      this.updateFocusableElements();

      if (e.shiftKey) {
        // Shift+Tab - Going backwards
        if (document.activeElement === this.firstFocusable) {
          e.preventDefault();
          this.lastFocusable?.focus();
        }
      } else {
        // Tab - Going forward
        if (document.activeElement === this.lastFocusable) {
          e.preventDefault();
          this.firstFocusable?.focus();
        }
      }
    }

    /**
     * Update focusable elements
     */
    updateFocusableElements() {
      const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      this.focusableElements = Array.from(this.element.querySelectorAll(focusableSelector));
      this.firstFocusable = this.focusableElements[0];
      this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
    }

    /**
     * Handle action button click
     */
    handleAction(e) {
      const action = e.target.dataset.action;

      if (action === 'close') {
        this.close();
      } else if (action === 'submit') {
        this.emitEvent('submit');
        // Don't auto-close on submit, let the handler decide
      } else {
        this.emitEvent('action', { action });
      }
    }

    /**
     * Open panel
     */
    open(config = {}) {
      if (this.state.open) return;

      // Merge config
      if (config.content) {
        this.config.content = config.content;
        this.body.innerHTML = config.content;
      }
      if (config.title) {
        this.config.title = config.title;
        if (this.header) {
          const titleEl = this.header.querySelector('.floating-panel__title');
          if (titleEl) titleEl.textContent = config.title;
        }
      }
      if (config.size) {
        this.state.size = config.size;
      }

      this.state.open = true;

      // Show elements
      this.element.style.display = 'block';
      if (this.backdrop) {
        this.backdrop.style.display = 'block';
      }

      // Force reflow
      void this.element.offsetHeight;

      // Add open class (triggers animation)
      this.element.classList.add('floating-panel--open');
      if (this.backdrop) {
        this.backdrop.classList.add('floating-panel__backdrop--open');
      }

      // Set initial height based on size
      this.setSize(this.state.size, false);

      // Lock body scroll
      document.body.style.overflow = 'hidden';

      // Focus trap
      this.updateFocusableElements();
      setTimeout(() => {
        this.element.focus();
      }, 300);

      // Callbacks
      this.emitEvent('open');
      if (this.config.onOpen) {
        this.config.onOpen();
      }

      this.vibrate(10);
    }

    /**
     * Close panel
     */
    close() {
      if (!this.state.open) return;

      this.state.open = false;

      // Remove open class (triggers animation)
      this.element.classList.remove('floating-panel--open');
      if (this.backdrop) {
        this.backdrop.classList.remove('floating-panel__backdrop--open');
      }

      // Unlock body scroll
      document.body.style.overflow = '';

      // Hide after animation
      setTimeout(() => {
        this.element.style.display = 'none';
        if (this.backdrop) {
          this.backdrop.style.display = 'none';
        }
      }, 300);

      // Callbacks
      this.emitEvent('close');
      if (this.config.onClose) {
        this.config.onClose();
      }

      this.vibrate(10);
    }

    /**
     * Toggle panel
     */
    toggle() {
      if (this.state.open) {
        this.close();
      } else {
        this.open();
      }
    }

    /**
     * Set size
     */
    setSize(size, animate = true) {
      this.state.size = size;

      if (!animate) {
        this.panel.style.transition = 'none';
      }

      let percentage;
      switch (size) {
        case 'small':
          percentage = this.config.snapPoints[0] || 30;
          break;
        case 'medium':
          percentage = this.config.snapPoints[1] || 60;
          break;
        case 'full':
          percentage = this.config.snapPoints[2] || 90;
          break;
        default:
          percentage = 60;
      }

      this.snapToSize(percentage);

      if (!animate) {
        setTimeout(() => {
          this.panel.style.transition = '';
        }, 50);
      }
    }

    /**
     * Set content
     */
    setContent(content) {
      this.config.content = content;
      this.body.innerHTML = content;
      this.updateFocusableElements();
    }

    /**
     * Set title
     */
    setTitle(title) {
      this.config.title = title;
      if (this.header) {
        const titleEl = this.header.querySelector('.floating-panel__title');
        if (titleEl) {
          titleEl.textContent = title;
        }
      }
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
      this.element.classList.add('floating-panel');

      // Variant
      this.element.classList.add(`floating-panel--${this.state.variant}`);

      // Size
      this.element.classList.add(`floating-panel--${this.state.size}`);

      // Animation
      this.element.setAttribute('data-animation', this.config.animation);

      this.emitEvent('rendered');
    }

    /**
     * Destroy panel
     */
    destroy() {
      if (this.backdrop) {
        this.backdrop.remove();
      }

      this.emitEvent('destroy');
      this.element.remove();
    }
  }

  /**
   * Initialize all panels
   */
  function initAll() {
    document.querySelectorAll(SELECTOR).forEach(element => {
      if (!element.dataset.initialized) {
        new FloatingPanel(element);
        element.dataset.initialized = 'true';
      }
    });
  }

  /**
   * Create panel programmatically
   */
  function create(config = {}) {
    const panel = document.createElement('div');
    panel.setAttribute('data-component', COMPONENT_NAME);
    panel.setAttribute('data-config', JSON.stringify(config));
    document.body.appendChild(panel);

    const instance = new FloatingPanel(panel, config);
    panel.dataset.initialized = 'true';

    return instance;
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
  window.AutoUI.components['floating-panel'] = FloatingPanel;
  window.AutoUI.components['floating-panel'].initAll = initAll;
  window.AutoUI.components['floating-panel'].create = create;

})();
