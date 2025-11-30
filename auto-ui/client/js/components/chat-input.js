/**
 * ChatInput Component - Client-side behavior
 * Category: ai
 * Optimizado para móvil con barras de acciones configurables
 * @version 1.0.0
 */

(function() {
  'use strict';

  const COMPONENT_NAME = 'chat-input';
  const SELECTOR = `[data-component="${COMPONENT_NAME}"]`;

  /**
   * ChatInput Component
   */
  class ChatInput {
    constructor(element) {
      this.element = element;
      this.config = this.parseConfig();
      this.state = {
        value: '',
        loading: false,
        disabled: this.config.disabled || false,
        topBarCollapsed: this.config.topBar?.collapsed || false,
        bottomBarCollapsed: this.config.bottomBar?.collapsed || false
      };

      // DOM references
      this.textarea = null;
      this.sendButton = null;
      this.topBar = null;
      this.bottomBar = null;
      this.charCounter = null;
      this.tokenCounter = null;

      this.init();
    }

    /**
     * Parse configuration from element
     */
    parseConfig() {
      const config = JSON.parse(this.element.dataset.config || '{}');
      return {
        variant: this.element.dataset.variant || config.variant || 'default',
        size: this.element.dataset.size || config.size || 'md',
        placeholder: config.placeholder || 'Escribe tu mensaje...',
        multiline: config.multiline !== false,
        maxRows: config.maxRows || 5,
        maxLength: config.maxLength || 4000,
        showCharCount: config.showCharCount || false,
        showTokenCount: config.showTokenCount || false,
        submitOnEnter: config.submitOnEnter !== false,
        clearOnSubmit: config.clearOnSubmit !== false,
        focusOnMount: config.focusOnMount || false,
        hapticFeedback: config.hapticFeedback !== false,
        disabled: config.disabled || false,
        loading: config.loading || false,
        endpoint: config.endpoint || null,
        streaming: config.streaming !== false,
        sendButton: {
          emoji: '🚀',
          label: 'Enviar',
          position: 'right',
          holdAction: null,
          ...config.sendButton
        },
        topBar: {
          enabled: true,
          collapsible: true,
          collapsed: false,
          buttons: [],
          ...config.topBar
        },
        bottomBar: {
          enabled: true,
          collapsible: true,
          collapsed: false,
          buttons: [],
          ...config.bottomBar
        }
      };
    }

    /**
     * Initialize component
     */
    init() {
      this.render();
      this.setupEventListeners();
      this.setupAccessibility();

      if (this.config.focusOnMount) {
        this.focus();
      }

      if (this.config.loading) {
        this.setLoading(true);
      }

      this.emitEvent('init');
    }

    /**
     * Render component HTML
     */
    render() {
      const variant = this.config.variant;
      const size = this.config.size;

      this.element.className = `chat-input chat-input--${variant} chat-input--${size}`;
      this.element.innerHTML = '';

      // Top bar
      if (this.config.topBar.enabled && variant !== 'compact' && variant !== 'minimal') {
        this.topBar = this.renderBar('top', this.config.topBar);
        this.element.appendChild(this.topBar);
      }

      // Input wrapper
      const inputWrapper = document.createElement('div');
      inputWrapper.className = 'chat-input__wrapper';

      // Textarea/Input
      if (this.config.multiline) {
        this.textarea = document.createElement('textarea');
        this.textarea.rows = 1;
        this.textarea.style.maxHeight = `${this.config.maxRows * 24}px`;
      } else {
        this.textarea = document.createElement('input');
        this.textarea.type = 'text';
      }

      this.textarea.className = 'chat-input__field';
      this.textarea.placeholder = this.config.placeholder;
      this.textarea.maxLength = this.config.maxLength;
      this.textarea.disabled = this.state.disabled;
      this.textarea.value = this.state.value;

      inputWrapper.appendChild(this.textarea);

      // Counters container
      if (this.config.showCharCount || this.config.showTokenCount) {
        const counters = document.createElement('div');
        counters.className = 'chat-input__counters';

        if (this.config.showCharCount) {
          this.charCounter = document.createElement('span');
          this.charCounter.className = 'chat-input__char-count';
          this.charCounter.textContent = `0/${this.config.maxLength}`;
          counters.appendChild(this.charCounter);
        }

        if (this.config.showTokenCount) {
          this.tokenCounter = document.createElement('span');
          this.tokenCounter.className = 'chat-input__token-count';
          this.tokenCounter.textContent = '~0 tokens';
          counters.appendChild(this.tokenCounter);
        }

        inputWrapper.appendChild(counters);
      }

      // Send button
      this.sendButton = document.createElement('button');
      this.sendButton.type = 'button';
      this.sendButton.className = 'chat-input__send';
      this.sendButton.innerHTML = `<span class="chat-input__send-emoji">${this.config.sendButton.emoji}</span>`;
      this.sendButton.setAttribute('aria-label', this.config.sendButton.label);
      this.sendButton.disabled = this.state.disabled || !this.state.value;

      // Add loading spinner
      const spinner = document.createElement('span');
      spinner.className = 'chat-input__spinner';
      spinner.innerHTML = '⏳';
      spinner.style.display = 'none';
      this.sendButton.appendChild(spinner);

      inputWrapper.appendChild(this.sendButton);
      this.element.appendChild(inputWrapper);

      // Bottom bar
      if (this.config.bottomBar.enabled && variant !== 'compact' && variant !== 'minimal') {
        this.bottomBar = this.renderBar('bottom', this.config.bottomBar);
        this.element.appendChild(this.bottomBar);
      }

      // Apply initial state
      this.updateState();
    }

    /**
     * Render action bar (top or bottom)
     */
    renderBar(position, config) {
      const bar = document.createElement('div');
      bar.className = `chat-input__bar chat-input__bar--${position}`;

      if (config.collapsed) {
        bar.classList.add('chat-input__bar--collapsed');
      }

      // Collapse toggle
      if (config.collapsible) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'chat-input__bar-toggle';
        toggle.innerHTML = position === 'top' ? '▼' : '▲';
        toggle.setAttribute('aria-label', `${config.collapsed ? 'Expandir' : 'Colapsar'} barra`);
        toggle.addEventListener('click', () => this.toggleBar(position));
        bar.appendChild(toggle);
      }

      // Buttons container
      const buttonsContainer = document.createElement('div');
      buttonsContainer.className = 'chat-input__bar-buttons';

      // Render buttons
      config.buttons.forEach(btn => {
        const button = this.renderBarButton(btn);
        buttonsContainer.appendChild(button);
      });

      bar.appendChild(buttonsContainer);

      return bar;
    }

    /**
     * Render individual bar button
     */
    renderBarButton(config) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-input__bar-btn';
      button.dataset.id = config.id;
      button.dataset.action = config.action || 'emit';

      if (config.variant) {
        button.classList.add(`chat-input__bar-btn--${config.variant}`);
      }
      if (config.active) {
        button.classList.add('chat-input__bar-btn--active');
      }
      if (config.disabled) {
        button.disabled = true;
      }

      // Emoji
      const emoji = document.createElement('span');
      emoji.className = 'chat-input__bar-btn-emoji';
      emoji.textContent = config.emoji;
      button.appendChild(emoji);

      // Badge
      if (config.badge !== undefined && config.badge !== null) {
        const badge = document.createElement('span');
        badge.className = 'chat-input__bar-btn-badge';
        badge.textContent = config.badge;
        button.appendChild(badge);
      }

      // Tooltip/Label
      if (config.label) {
        button.setAttribute('aria-label', config.label);
        button.title = config.label;
      }

      // Click handler
      button.addEventListener('click', (e) => this.handleBarButtonClick(config, e));

      return button;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Textarea events
      this.textarea.addEventListener('input', (e) => this.handleInput(e));
      this.textarea.addEventListener('keydown', (e) => this.handleKeydown(e));
      this.textarea.addEventListener('focus', () => this.handleFocus());
      this.textarea.addEventListener('blur', () => this.handleBlur());

      // Send button
      this.sendButton.addEventListener('click', () => this.handleSubmit());

      // Hold action for send button
      if (this.config.sendButton.holdAction) {
        this.setupHoldAction(this.sendButton, this.config.sendButton.holdAction);
      }

      // Paste handler for files
      this.textarea.addEventListener('paste', (e) => this.handlePaste(e));
    }

    /**
     * Setup accessibility
     */
    setupAccessibility() {
      this.element.setAttribute('role', 'form');
      this.element.setAttribute('aria-label', 'Chat input');

      this.textarea.setAttribute('aria-label', this.config.placeholder);
      this.textarea.id = `chat-input-${Date.now()}`;

      if (this.config.maxLength) {
        this.textarea.setAttribute('aria-describedby', `${this.textarea.id}-counter`);
      }
    }

    /**
     * Handle input changes
     */
    handleInput(e) {
      this.state.value = e.target.value;

      // Auto-expand textarea
      if (this.config.multiline) {
        this.autoExpand();
      }

      // Update counters
      this.updateCounters();

      // Update send button state
      this.sendButton.disabled = this.state.disabled || !this.state.value.trim() || this.state.loading;

      this.emitEvent('change', { value: this.state.value });
    }

    /**
     * Handle keydown
     */
    handleKeydown(e) {
      // Submit on Enter (if not Shift+Enter)
      if (e.key === 'Enter' && !e.shiftKey && this.config.submitOnEnter) {
        e.preventDefault();
        if (this.state.value.trim() && !this.state.loading) {
          this.handleSubmit();
        }
      }
    }

    /**
     * Handle focus
     */
    handleFocus() {
      this.element.classList.add('chat-input--focused');
      this.emitEvent('focus');
    }

    /**
     * Handle blur
     */
    handleBlur() {
      this.element.classList.remove('chat-input--focused');
      this.emitEvent('blur');
    }

    /**
     * Handle submit
     */
    async handleSubmit() {
      const value = this.state.value.trim();
      if (!value || this.state.loading) return;

      // Haptic feedback
      this.haptic();

      const message = {
        content: value,
        timestamp: Date.now()
      };

      this.emitEvent('submit', { message });

      // If endpoint configured, send to server
      if (this.config.endpoint) {
        await this.sendMessage(message);
      }

      // Clear input
      if (this.config.clearOnSubmit) {
        this.clear();
      }
    }

    /**
     * Send message to endpoint
     */
    async sendMessage(message) {
      this.setLoading(true);

      try {
        if (this.config.streaming) {
          await this.sendWithStreaming(message);
        } else {
          const response = await fetch(this.config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
          });

          if (!response.ok) throw new Error('Error al enviar mensaje');

          const data = await response.json();
          this.emitEvent('response', { data });
        }
      } catch (error) {
        console.error('ChatInput error:', error);
        this.emitEvent('error', { error: error.message });
        this.showError('Error al enviar mensaje');
      } finally {
        this.setLoading(false);
      }
    }

    /**
     * Send with SSE streaming
     */
    async sendWithStreaming(message) {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...message, stream: true })
      });

      if (!response.ok) throw new Error('Error al enviar mensaje');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullResponse += chunk;

        this.emitEvent('stream-chunk', { chunk, fullResponse });
      }

      this.emitEvent('stream-complete', { response: fullResponse });
    }

    /**
     * Handle bar button click
     */
    handleBarButtonClick(config, event) {
      this.haptic();

      switch (config.action) {
        case 'emit':
          this.emitEvent('button-click', { button: config });
          if (config.event) {
            this.emitEvent(config.event, { button: config });
          }
          break;

        case 'navigate':
          if (config.target) {
            window.location.href = config.target;
          }
          break;

        case 'toggle':
          event.target.closest('.chat-input__bar-btn').classList.toggle('chat-input__bar-btn--active');
          this.emitEvent('button-toggle', { button: config, active: event.target.closest('.chat-input__bar-btn').classList.contains('chat-input__bar-btn--active') });
          break;

        case 'open-panel':
          this.openPanel(config);
          break;

        case 'custom':
          if (config.handler && window[config.handler]) {
            window[config.handler](config, this);
          }
          break;
      }
    }

    /**
     * Open floating panel
     */
    openPanel(config) {
      // Emit event for FloatingPanel integration
      this.emitEvent('open-panel', {
        button: config,
        panel: config.panel || {
          title: config.label,
          size: 'small'
        }
      });
    }

    /**
     * Toggle bar visibility
     */
    toggleBar(position) {
      const bar = position === 'top' ? this.topBar : this.bottomBar;
      const stateKey = position === 'top' ? 'topBarCollapsed' : 'bottomBarCollapsed';

      this.state[stateKey] = !this.state[stateKey];
      bar.classList.toggle('chat-input__bar--collapsed', this.state[stateKey]);

      const toggle = bar.querySelector('.chat-input__bar-toggle');
      if (toggle) {
        toggle.innerHTML = this.state[stateKey]
          ? (position === 'top' ? '▼' : '▲')
          : (position === 'top' ? '▲' : '▼');
      }

      this.haptic();
      this.emitEvent('bar-toggle', { position, collapsed: this.state[stateKey] });
    }

    /**
     * Auto-expand textarea
     */
    autoExpand() {
      this.textarea.style.height = 'auto';
      const scrollHeight = this.textarea.scrollHeight;
      const maxHeight = this.config.maxRows * 24;
      this.textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }

    /**
     * Update character/token counters
     */
    updateCounters() {
      const length = this.state.value.length;

      if (this.charCounter) {
        this.charCounter.textContent = `${length}/${this.config.maxLength}`;
        this.charCounter.classList.toggle('chat-input__char-count--warning', length > this.config.maxLength * 0.9);
      }

      if (this.tokenCounter) {
        // Rough estimation: ~4 chars per token
        const tokens = Math.ceil(length / 4);
        this.tokenCounter.textContent = `~${tokens} tokens`;
      }
    }

    /**
     * Setup hold action for button
     */
    setupHoldAction(button, holdConfig) {
      let holdTimer = null;
      let isHolding = false;

      const startHold = () => {
        isHolding = true;
        button.classList.add('chat-input__send--holding');

        holdTimer = setTimeout(() => {
          if (isHolding) {
            this.haptic('heavy');
            this.emitEvent('hold-action', { action: holdConfig });
            if (holdConfig.event) {
              this.emitEvent(holdConfig.event, { action: holdConfig });
            }
          }
          isHolding = false;
          button.classList.remove('chat-input__send--holding');
        }, holdConfig.duration || 1000);
      };

      const cancelHold = () => {
        isHolding = false;
        button.classList.remove('chat-input__send--holding');
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
      };

      button.addEventListener('mousedown', startHold);
      button.addEventListener('touchstart', startHold);
      button.addEventListener('mouseup', cancelHold);
      button.addEventListener('mouseleave', cancelHold);
      button.addEventListener('touchend', cancelHold);
      button.addEventListener('touchcancel', cancelHold);
    }

    /**
     * Handle paste (for files)
     */
    handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          this.emitEvent('paste-file', { file, type: 'image' });
          break;
        }
      }
    }

    /**
     * Set loading state
     */
    setLoading(loading) {
      this.state.loading = loading;
      this.element.classList.toggle('chat-input--loading', loading);

      this.textarea.disabled = loading;
      this.sendButton.disabled = loading;

      const spinner = this.sendButton.querySelector('.chat-input__spinner');
      const emoji = this.sendButton.querySelector('.chat-input__send-emoji');

      if (spinner && emoji) {
        spinner.style.display = loading ? 'inline' : 'none';
        emoji.style.display = loading ? 'none' : 'inline';
      }

      if (loading) {
        this.sendButton.setAttribute('aria-label', 'Enviando...');
      } else {
        this.sendButton.setAttribute('aria-label', this.config.sendButton.label);
      }
    }

    /**
     * Show error state
     */
    showError(message) {
      this.element.classList.add('chat-input--error');

      // Show toast if available
      if (window.AutoUI && window.AutoUI.showToast) {
        window.AutoUI.showToast(message, 'danger');
      }

      // Remove error state after delay
      setTimeout(() => {
        this.element.classList.remove('chat-input--error');
      }, 3000);
    }

    /**
     * Clear input
     */
    clear() {
      this.state.value = '';
      this.textarea.value = '';
      this.updateCounters();
      this.sendButton.disabled = true;

      if (this.config.multiline) {
        this.textarea.style.height = 'auto';
      }

      this.emitEvent('clear');
    }

    /**
     * Focus input
     */
    focus() {
      this.textarea.focus();
    }

    /**
     * Set value programmatically
     */
    setValue(value) {
      this.state.value = value;
      this.textarea.value = value;
      this.updateCounters();
      this.sendButton.disabled = !value.trim();

      if (this.config.multiline) {
        this.autoExpand();
      }
    }

    /**
     * Update bar buttons
     */
    updateBarButtons(position, buttons) {
      const bar = position === 'top' ? this.topBar : this.bottomBar;
      if (!bar) return;

      const container = bar.querySelector('.chat-input__bar-buttons');
      container.innerHTML = '';

      buttons.forEach(btn => {
        const button = this.renderBarButton(btn);
        container.appendChild(button);
      });
    }

    /**
     * Update state
     */
    updateState() {
      this.element.classList.toggle('chat-input--disabled', this.state.disabled);
      this.element.classList.toggle('chat-input--loading', this.state.loading);
    }

    /**
     * Haptic feedback
     */
    haptic(style = 'light') {
      if (!this.config.hapticFeedback) return;

      if (navigator.vibrate) {
        const durations = { light: 10, medium: 20, heavy: 30 };
        navigator.vibrate(durations[style] || 10);
      }
    }

    /**
     * Emit custom event
     */
    emitEvent(eventName, detail = {}) {
      const event = new CustomEvent(`chat-input:${eventName}`, {
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
     * Destroy component
     */
    destroy() {
      this.emitEvent('destroy');
      this.element.innerHTML = '';
    }
  }

  /**
   * Initialize all components
   */
  function initAll() {
    document.querySelectorAll(SELECTOR).forEach(element => {
      if (!element.dataset.initialized) {
        new ChatInput(element);
        element.dataset.initialized = 'true';
      }
    });
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Re-init on HTMX swap
  document.addEventListener('htmx:afterSwap', initAll);

  // Export
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['chat-input'] = ChatInput;
  window.AutoUI.components['chat-input'].initAll = initAll;

})();
