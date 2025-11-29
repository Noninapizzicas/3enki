/**
 * TouchActionButton Component - Mobile-optimized multi-action button
 * Gestos: tap (ver), double-tap (crear), hold 3s (editar)
 * @version 2.0.0
 */

(function() {
  'use strict';

  const COMPONENT_NAME = 'touch-action-button';
  const SELECTOR = `[data-component="${COMPONENT_NAME}"]`;

  /**
   * TouchActionButton - Botón multi-acción para móvil
   */
  class TouchActionButton {
    constructor(element) {
      this.element = element;
      this.config = this.parseConfig();
      this.state = {
        variant: this.config.variant || 'primary',
        size: this.config.size || 'md',
        disabled: this.config.disabled || false,
        holding: false,
        tapping: false
      };

      // Timers
      this.holdTimer = null;
      this.doubleTapTimer = null;
      this.tapCount = 0;

      // Progress ring
      this.progressRing = null;
      this.progressValue = 0;
      this.progressInterval = null;

      this.init();
    }

    /**
     * Parse configuration from element
     */
    parseConfig() {
      const config = JSON.parse(this.element.dataset.config || '{}');

      return {
        variant: this.element.dataset.variant || config.variant || 'primary',
        size: this.element.dataset.size || config.size || 'md',
        disabled: this.element.hasAttribute('disabled') || config.disabled || false,

        // Actions
        primaryAction: config.primaryAction || {
          type: 'navigate',
          target: '#',
          emoji: '👁',
          label: 'Ver'
        },
        secondaryAction: config.secondaryAction || {
          type: 'navigate',
          target: '#',
          emoji: '➕',
          label: 'Crear'
        },
        tertiaryAction: config.tertiaryAction || {
          type: 'navigate',
          target: '#',
          emoji: '✏️',
          label: 'Editar',
          holdDuration: 3000
        },

        // Visual
        emoji: config.emoji || '🔵',
        label: config.label || '',

        // Features
        showTooltip: config.showTooltip !== false,
        tooltipPosition: config.tooltipPosition || 'top',
        hapticFeedback: config.hapticFeedback !== false,
        showProgressRing: config.showProgressRing !== false,

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

      if (this.config.showTooltip) {
        this.createTooltip();
      }
    }

    /**
     * Setup accessibility
     */
    setupAccessibility() {
      this.element.setAttribute('role', 'button');
      this.element.setAttribute('tabindex', this.state.disabled ? '-1' : '0');

      const ariaLabel = this.config.ariaLabel ||
        `${this.config.label || 'Botón'}: Tap para ${this.config.primaryAction.label}, ` +
        `Doble tap para ${this.config.secondaryAction.label}, ` +
        `Mantener para ${this.config.tertiaryAction.label}`;

      this.element.setAttribute('aria-label', ariaLabel);

      if (this.state.disabled) {
        this.element.setAttribute('aria-disabled', 'true');
      }
    }

    /**
     * Setup button structure
     */
    setupStructure() {
      // Clear existing content
      this.element.innerHTML = '';

      // Emoji container
      this.emojiContainer = document.createElement('span');
      this.emojiContainer.className = 'touch-action-button__emoji';
      this.emojiContainer.textContent = this.config.emoji;
      this.emojiContainer.setAttribute('aria-hidden', 'true');
      this.element.appendChild(this.emojiContainer);

      // Label (if exists)
      if (this.config.label) {
        this.labelContainer = document.createElement('span');
        this.labelContainer.className = 'touch-action-button__label';
        this.labelContainer.textContent = this.config.label;
        this.element.appendChild(this.labelContainer);
      }

      // Ripple container
      this.rippleContainer = document.createElement('span');
      this.rippleContainer.className = 'touch-action-button__ripple';
      this.rippleContainer.setAttribute('aria-hidden', 'true');
      this.element.appendChild(this.rippleContainer);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Mobile touch events
      this.element.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
      this.element.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
      this.element.addEventListener('touchcancel', (e) => this.handleTouchCancel(e));
      this.element.addEventListener('touchmove', (e) => this.handleTouchMove(e));

      // Desktop fallback
      this.element.addEventListener('click', (e) => this.handleClick(e));
      this.element.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
      this.element.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

      // Keyboard
      this.element.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
      if (this.state.disabled) return;

      e.preventDefault();
      this.state.tapping = true;

      // Haptic feedback
      this.vibrate(10);

      // Create ripple effect
      this.createRipple(e.touches[0]);

      // Start hold timer (3 seconds)
      const holdDuration = this.config.tertiaryAction.holdDuration || 3000;
      this.startHoldTimer(holdDuration);
    }

    /**
     * Handle touch end
     */
    handleTouchEnd(e) {
      if (this.state.disabled) return;

      e.preventDefault();

      // If was holding, cancel it
      if (this.state.holding) {
        this.cancelHold();
        return;
      }

      // Clear hold timer
      this.clearHoldTimer();

      // Detect tap count
      this.tapCount++;

      if (this.tapCount === 1) {
        // Wait for potential second tap
        this.doubleTapTimer = setTimeout(() => {
          if (this.tapCount === 1) {
            // Single tap - Primary action
            this.executePrimaryAction(e);
          }
          this.tapCount = 0;
        }, 300);
      } else if (this.tapCount === 2) {
        // Double tap - Secondary action
        clearTimeout(this.doubleTapTimer);
        this.executeSecondaryAction(e);
        this.tapCount = 0;
      }

      this.state.tapping = false;
    }

    /**
     * Handle touch cancel
     */
    handleTouchCancel(e) {
      this.cancelHold();
      this.state.tapping = false;
      this.tapCount = 0;
      clearTimeout(this.doubleTapTimer);
    }

    /**
     * Handle touch move (cancel hold if finger moves)
     */
    handleTouchMove(e) {
      // If finger moves too much, cancel hold
      const threshold = 10; // pixels
      const touch = e.touches[0];

      if (!this.initialTouch) {
        this.initialTouch = { x: touch.clientX, y: touch.clientY };
        return;
      }

      const deltaX = Math.abs(touch.clientX - this.initialTouch.x);
      const deltaY = Math.abs(touch.clientY - this.initialTouch.y);

      if (deltaX > threshold || deltaY > threshold) {
        this.cancelHold();
      }
    }

    /**
     * Start hold timer with progress ring
     */
    startHoldTimer(duration) {
      this.state.holding = true;
      this.initialTouch = null;

      // Create progress ring if enabled
      if (this.config.showProgressRing) {
        this.createProgressRing();
        this.animateProgressRing(duration);
      }

      // Set timer for hold completion
      this.holdTimer = setTimeout(() => {
        this.executeTertiaryAction();
      }, duration);
    }

    /**
     * Clear hold timer
     */
    clearHoldTimer() {
      if (this.holdTimer) {
        clearTimeout(this.holdTimer);
        this.holdTimer = null;
      }

      this.removeProgressRing();
      this.state.holding = false;
    }

    /**
     * Cancel hold
     */
    cancelHold() {
      this.clearHoldTimer();
      this.vibrate(10); // Cancel feedback
    }

    /**
     * Create progress ring for hold
     */
    createProgressRing() {
      if (this.progressRing) return;

      this.progressRing = document.createElement('svg');
      this.progressRing.className = 'touch-action-button__progress-ring';
      this.progressRing.setAttribute('viewBox', '0 0 100 100');
      this.progressRing.setAttribute('aria-hidden', 'true');

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '50');
      circle.setAttribute('cy', '50');
      circle.setAttribute('r', '45');
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', 'currentColor');
      circle.setAttribute('stroke-width', '4');
      circle.setAttribute('stroke-dasharray', '283');
      circle.setAttribute('stroke-dashoffset', '283');
      circle.setAttribute('transform', 'rotate(-90 50 50)');

      this.progressCircle = circle;
      this.progressRing.appendChild(circle);
      this.element.appendChild(this.progressRing);
    }

    /**
     * Animate progress ring
     */
    animateProgressRing(duration) {
      const steps = 60; // 60 FPS
      const stepDuration = duration / steps;
      const dashoffsetStep = 283 / steps;

      let currentStep = 0;

      this.progressInterval = setInterval(() => {
        currentStep++;
        const offset = 283 - (dashoffsetStep * currentStep);
        this.progressCircle.setAttribute('stroke-dashoffset', offset);

        if (currentStep >= steps) {
          clearInterval(this.progressInterval);
        }
      }, stepDuration);
    }

    /**
     * Remove progress ring
     */
    removeProgressRing() {
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }

      if (this.progressRing) {
        this.progressRing.remove();
        this.progressRing = null;
        this.progressCircle = null;
      }
    }

    /**
     * Create ripple effect
     */
    createRipple(touch) {
      const ripple = document.createElement('span');
      ripple.className = 'touch-action-button__ripple-effect';

      const rect = this.element.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      this.rippleContainer.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    }

    /**
     * Execute primary action (tap)
     */
    executePrimaryAction(e) {
      this.vibrate(10);

      // Visual feedback
      this.showActionFeedback(this.config.primaryAction.emoji || '👁');

      // Execute action
      this.executeAction(this.config.primaryAction, 'primary', e);

      this.emitEvent('primary-action', { action: this.config.primaryAction });
    }

    /**
     * Execute secondary action (double-tap)
     */
    executeSecondaryAction(e) {
      this.vibrate([10, 50, 10]); // Double vibration

      // Visual feedback - change emoji momentarily
      this.showActionFeedback(this.config.secondaryAction.emoji || '➕');

      // Execute action
      this.executeAction(this.config.secondaryAction, 'secondary', e);

      this.emitEvent('secondary-action', { action: this.config.secondaryAction });
    }

    /**
     * Execute tertiary action (hold)
     */
    executeTertiaryAction() {
      this.vibrate([10, 50, 10, 50, 10]); // Triple vibration

      // Visual feedback
      this.showActionFeedback(this.config.tertiaryAction.emoji || '✏️');

      // Clear hold state
      this.clearHoldTimer();

      // Execute action
      this.executeAction(this.config.tertiaryAction, 'tertiary');

      this.emitEvent('tertiary-action', { action: this.config.tertiaryAction });
    }

    /**
     * Show action feedback (emoji change)
     */
    showActionFeedback(emoji) {
      const originalEmoji = this.emojiContainer.textContent;

      this.emojiContainer.classList.add('touch-action-button__emoji--changing');
      this.emojiContainer.textContent = emoji;

      setTimeout(() => {
        this.emojiContainer.textContent = originalEmoji;
        this.emojiContainer.classList.remove('touch-action-button__emoji--changing');
      }, 300);
    }

    /**
     * Execute action
     */
    executeAction(action, actionType, event) {
      // Use global AutoUI action executor if available
      if (window.AutoUI && window.AutoUI.executeAction) {
        window.AutoUI.executeAction(action.type, action, this.element);
      } else {
        console.warn('AutoUI.executeAction not available', action);
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
     * Create tooltip
     */
    createTooltip() {
      this.tooltip = document.createElement('div');
      this.tooltip.className = `touch-action-button__tooltip touch-action-button__tooltip--${this.config.tooltipPosition}`;
      this.tooltip.setAttribute('role', 'tooltip');

      this.tooltip.innerHTML = `
        <div class="touch-action-button__tooltip-item">
          <span class="touch-action-button__tooltip-emoji">${this.config.primaryAction.emoji}</span>
          <span class="touch-action-button__tooltip-label">Tap: ${this.config.primaryAction.label}</span>
        </div>
        <div class="touch-action-button__tooltip-item">
          <span class="touch-action-button__tooltip-emoji">${this.config.secondaryAction.emoji}</span>
          <span class="touch-action-button__tooltip-label">Doble: ${this.config.secondaryAction.label}</span>
        </div>
        <div class="touch-action-button__tooltip-item">
          <span class="touch-action-button__tooltip-emoji">${this.config.tertiaryAction.emoji}</span>
          <span class="touch-action-button__tooltip-label">Hold: ${this.config.tertiaryAction.label}</span>
        </div>
      `;

      this.element.appendChild(this.tooltip);

      // Show/hide on hover (desktop) or long tap (mobile)
      let tooltipTimer;
      this.element.addEventListener('mouseenter', () => {
        this.tooltip.classList.add('touch-action-button__tooltip--visible');
      });
      this.element.addEventListener('mouseleave', () => {
        this.tooltip.classList.remove('touch-action-button__tooltip--visible');
      });
    }

    /**
     * Desktop: Handle click
     */
    handleClick(e) {
      if (this.state.disabled) return;

      // Only for desktop (non-touch devices)
      if ('ontouchstart' in window) return;

      e.preventDefault();
      this.executePrimaryAction(e);
    }

    /**
     * Desktop: Handle double click
     */
    handleDoubleClick(e) {
      if (this.state.disabled) return;
      if ('ontouchstart' in window) return;

      e.preventDefault();
      this.executeSecondaryAction(e);
    }

    /**
     * Desktop: Handle context menu (right-click)
     */
    handleContextMenu(e) {
      if (this.state.disabled) return;
      if ('ontouchstart' in window) return;

      e.preventDefault();

      // Show custom context menu with all actions
      this.showContextMenu(e);
    }

    /**
     * Show context menu (desktop)
     */
    showContextMenu(e) {
      // TODO: Implement custom context menu
      // For now, execute tertiary action
      this.executeTertiaryAction();
    }

    /**
     * Handle keyboard
     */
    handleKeyboard(e) {
      if (this.state.disabled) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.executePrimaryAction(e);
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
      // Apply variant class
      this.element.classList.add(`${COMPONENT_NAME}--${this.state.variant}`);

      // Apply size class
      this.element.classList.add(`${COMPONENT_NAME}--${this.state.size}`);

      // Apply disabled state
      if (this.state.disabled) {
        this.element.classList.add('disabled');
        this.element.setAttribute('aria-disabled', 'true');
      }

      this.emitEvent('rendered');
    }

    /**
     * Update state
     */
    setState(newState) {
      this.state = { ...this.state, ...newState };
      this.render();
    }

    /**
     * Destroy component
     */
    destroy() {
      this.clearHoldTimer();
      clearTimeout(this.doubleTapTimer);
      this.emitEvent('destroy');
      this.element.remove();
    }
  }

  /**
   * Initialize all components on page
   */
  function initAll() {
    document.querySelectorAll(SELECTOR).forEach(element => {
      if (!element.dataset.initialized) {
        new TouchActionButton(element);
        element.dataset.initialized = 'true';
      }
    });
  }

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Re-initialize on HTMX content swap
  document.addEventListener('htmx:afterSwap', initAll);

  // Export
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['touch-action-button'] = TouchActionButton;
  window.AutoUI.components['touch-action-button'].initAll = initAll;

})();
