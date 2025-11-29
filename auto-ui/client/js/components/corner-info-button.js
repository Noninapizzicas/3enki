/**
 * CornerInfoButton Component - Square info button with corner emojis
 * Botón cuadrado informativo con 4 emojis en las esquinas
 * @version 2.0.0
 */

(function() {
  'use strict';

  const COMPONENT_NAME = 'corner-info-button';
  const SELECTOR = `[data-component="${COMPONENT_NAME}"]`;

  /**
   * CornerInfoButton - Botón informativo cuadrado con emojis en esquinas
   */
  class CornerInfoButton {
    constructor(element, config = {}) {
      this.element = element;
      this.config = { ...this.parseConfig(), ...config };
      this.state = {
        variant: this.config.variant || 'primary',
        size: this.config.size || 'md',
        disabled: this.config.disabled || false,
        pressed: false
      };

      // Elements
      this.container = null;
      this.textElement = null;
      this.cornerElements = {};

      this.init();
    }

    /**
     * Parse configuration
     */
    parseConfig() {
      const config = JSON.parse(this.element.dataset.config || '{}');

      return {
        variant: this.element.dataset.variant || config.variant || 'primary',
        size: this.element.dataset.size || config.size || 'md',
        text: this.element.dataset.text || config.text || 'Acceder',

        // Corner emojis
        cornerTopLeft: config.cornerTopLeft || '📊',
        cornerTopRight: config.cornerTopRight || '📈',
        cornerBottomLeft: config.cornerBottomLeft || '📉',
        cornerBottomRight: config.cornerBottomRight || '📋',

        // Border & background
        borderWidth: config.borderWidth || '4px',
        borderColor: config.borderColor,
        bgColor: config.bgColor,

        // Navigation
        href: config.href || this.element.dataset.href,
        action: config.action,
        target: config.target || '_self',

        // Features
        hoverEffect: config.hoverEffect !== false,
        rippleEffect: config.rippleEffect !== false,
        hapticFeedback: config.hapticFeedback !== false,
        disabled: this.element.hasAttribute('disabled') || config.disabled || false,

        // Accessibility
        ariaLabel: config.ariaLabel || this.element.getAttribute('aria-label'),

        ...config
      };
    }

    /**
     * Initialize component
     */
    init() {
      this.setupStructure();
      this.setupAccessibility();
      this.setupEventListeners();
      this.render();
    }

    /**
     * Setup structure
     */
    setupStructure() {
      this.element.innerHTML = '';

      // Container
      this.container = document.createElement('div');
      this.container.className = 'corner-info-button__container';

      // Top-left corner
      this.cornerElements.topLeft = document.createElement('div');
      this.cornerElements.topLeft.className = 'corner-info-button__corner corner-info-button__corner--top-left';
      this.cornerElements.topLeft.textContent = this.config.cornerTopLeft;
      this.container.appendChild(this.cornerElements.topLeft);

      // Top-right corner
      this.cornerElements.topRight = document.createElement('div');
      this.cornerElements.topRight.className = 'corner-info-button__corner corner-info-button__corner--top-right';
      this.cornerElements.topRight.textContent = this.config.cornerTopRight;
      this.container.appendChild(this.cornerElements.topRight);

      // Center text
      this.textElement = document.createElement('div');
      this.textElement.className = 'corner-info-button__text';
      this.textElement.textContent = this.config.text;
      this.container.appendChild(this.textElement);

      // Bottom-left corner
      this.cornerElements.bottomLeft = document.createElement('div');
      this.cornerElements.bottomLeft.className = 'corner-info-button__corner corner-info-button__corner--bottom-left';
      this.cornerElements.bottomLeft.textContent = this.config.cornerBottomLeft;
      this.container.appendChild(this.cornerElements.bottomLeft);

      // Bottom-right corner
      this.cornerElements.bottomRight = document.createElement('div');
      this.cornerElements.bottomRight.className = 'corner-info-button__corner corner-info-button__corner--bottom-right';
      this.cornerElements.bottomRight.textContent = this.config.cornerBottomRight;
      this.container.appendChild(this.cornerElements.bottomRight);

      this.element.appendChild(this.container);
    }

    /**
     * Setup accessibility
     */
    setupAccessibility() {
      // Set role based on href
      if (this.config.href) {
        this.element.setAttribute('role', 'link');
        this.element.setAttribute('tabindex', '0');
      } else {
        this.element.setAttribute('role', 'button');
        this.element.setAttribute('tabindex', '0');
      }

      // Aria label
      const ariaLabel = this.config.ariaLabel || this.config.text;
      this.element.setAttribute('aria-label', ariaLabel);

      // Disabled state
      if (this.state.disabled) {
        this.element.setAttribute('aria-disabled', 'true');
        this.element.setAttribute('tabindex', '-1');
      }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Click/tap
      this.element.addEventListener('click', (e) => this.handleClick(e));

      // Touch events for ripple
      this.element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
      this.element.addEventListener('mousedown', (e) => this.handleMouseDown(e));

      // Keyboard
      this.element.addEventListener('keydown', (e) => this.handleKeyboard(e));

      // Hover effects
      if (this.config.hoverEffect) {
        this.element.addEventListener('mouseenter', () => this.handleHoverStart());
        this.element.addEventListener('mouseleave', () => this.handleHoverEnd());
      }
    }

    /**
     * Handle click
     */
    handleClick(e) {
      if (this.state.disabled) {
        e.preventDefault();
        return;
      }

      // Haptic feedback
      this.vibrate(10);

      // Custom action
      if (this.config.action) {
        this.emitEvent('action', { action: this.config.action });
      }

      // Navigation
      if (this.config.href) {
        if (this.config.target === '_blank') {
          window.open(this.config.href, '_blank');
          e.preventDefault();
        } else {
          window.location.href = this.config.href;
        }
      }

      // Emit click event
      this.emitEvent('click');
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
      if (this.state.disabled) return;

      this.state.pressed = true;
      this.element.classList.add('corner-info-button--pressed');

      if (this.config.rippleEffect) {
        this.createRipple(e.touches[0].clientX, e.touches[0].clientY);
      }

      // Remove pressed state after animation
      setTimeout(() => {
        this.state.pressed = false;
        this.element.classList.remove('corner-info-button--pressed');
      }, 200);
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(e) {
      if (this.state.disabled) return;

      this.state.pressed = true;
      this.element.classList.add('corner-info-button--pressed');

      if (this.config.rippleEffect) {
        this.createRipple(e.clientX, e.clientY);
      }

      // Remove pressed state after animation
      setTimeout(() => {
        this.state.pressed = false;
        this.element.classList.remove('corner-info-button--pressed');
      }, 200);
    }

    /**
     * Handle keyboard
     */
    handleKeyboard(e) {
      if (this.state.disabled) return;

      // Enter or Space to activate
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handleClick(e);
      }
    }

    /**
     * Handle hover start
     */
    handleHoverStart() {
      if (this.state.disabled) return;
      this.element.classList.add('corner-info-button--hover');
    }

    /**
     * Handle hover end
     */
    handleHoverEnd() {
      this.element.classList.remove('corner-info-button--hover');
    }

    /**
     * Create ripple effect
     */
    createRipple(x, y) {
      const ripple = document.createElement('span');
      ripple.className = 'corner-info-button__ripple';

      // Calculate position relative to button
      const rect = this.element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const left = x - rect.left - size / 2;
      const top = y - rect.top - size / 2;

      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${left}px`;
      ripple.style.top = `${top}px`;

      this.container.appendChild(ripple);

      // Remove after animation
      setTimeout(() => {
        ripple.remove();
      }, 600);
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
      this.element.classList.add('corner-info-button');

      // Variant
      this.element.classList.add(`corner-info-button--${this.state.variant}`);

      // Size
      this.element.classList.add(`corner-info-button--${this.state.size}`);

      // Disabled
      if (this.state.disabled) {
        this.element.classList.add('corner-info-button--disabled');
      }

      // Custom border width
      if (this.config.borderWidth) {
        this.element.style.setProperty('--corner-info-button-border-width', this.config.borderWidth);
      }

      // Custom colors (for variant='custom')
      if (this.state.variant === 'custom') {
        if (this.config.borderColor) {
          this.element.style.setProperty('--corner-info-button-border-color', this.config.borderColor);
        }
        if (this.config.bgColor) {
          this.element.style.setProperty('--corner-info-button-bg-color', this.config.bgColor);
        }
      }

      this.emitEvent('rendered');
    }

    /**
     * Update text
     */
    setText(text) {
      this.config.text = text;
      this.textElement.textContent = text;
    }

    /**
     * Update corner emoji
     */
    setCorner(position, emoji) {
      const positions = {
        'top-left': 'topLeft',
        'top-right': 'topRight',
        'bottom-left': 'bottomLeft',
        'bottom-right': 'bottomRight'
      };

      const key = positions[position];
      if (key && this.cornerElements[key]) {
        this.cornerElements[key].textContent = emoji;
        this.config[`corner${key.charAt(0).toUpperCase() + key.slice(1)}`] = emoji;
      }
    }

    /**
     * Enable button
     */
    enable() {
      this.state.disabled = false;
      this.element.classList.remove('corner-info-button--disabled');
      this.element.removeAttribute('aria-disabled');
      this.element.setAttribute('tabindex', '0');
    }

    /**
     * Disable button
     */
    disable() {
      this.state.disabled = true;
      this.element.classList.add('corner-info-button--disabled');
      this.element.setAttribute('aria-disabled', 'true');
      this.element.setAttribute('tabindex', '-1');
    }

    /**
     * Destroy component
     */
    destroy() {
      this.emitEvent('destroy');
      this.element.remove();
    }
  }

  /**
   * Initialize all buttons
   */
  function initAll() {
    document.querySelectorAll(SELECTOR).forEach(element => {
      if (!element.dataset.initialized) {
        new CornerInfoButton(element);
        element.dataset.initialized = 'true';
      }
    });
  }

  /**
   * Create button programmatically
   */
  function create(config = {}) {
    const button = document.createElement('div');
    button.setAttribute('data-component', COMPONENT_NAME);
    button.setAttribute('data-config', JSON.stringify(config));
    document.body.appendChild(button);

    const instance = new CornerInfoButton(button, config);
    button.dataset.initialized = 'true';

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
  window.AutoUI.components['corner-info-button'] = CornerInfoButton;
  window.AutoUI.components['corner-info-button'].initAll = initAll;
  window.AutoUI.components['corner-info-button'].create = create;

})();
