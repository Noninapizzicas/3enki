/**
 * AIControlBar Component
 * Barra de controles para configuración de parámetros de IA
 * @version 1.0.0
 */

class AIControlBar {
  constructor(element, config = {}) {
    this.element = element;
    this.config = { ...this.parseConfig(), ...config };
    this.state = {
      provider: this.config.defaultProvider,
      model: this.config.defaultModel,
      temperature: this.config.defaultTemperature,
      maxTokens: this.config.defaultMaxTokens,
      collapsed: this.config.collapsed
    };

    this.providerModels = {
      deepseek: ['deepseek-chat', 'deepseek-coder'],
      openai: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      claude: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
      ollama: ['llama2', 'mistral', 'codellama']
    };

    this.init();
  }

  parseConfig() {
    const config = {};

    config.variant = this.element.getAttribute('data-variant') || 'full';
    config.position = this.element.getAttribute('data-position') || 'bottom';
    config.showProvider = this.element.getAttribute('data-show-provider') !== 'false';
    config.showModel = this.element.getAttribute('data-show-model') !== 'false';
    config.showTemperature = this.element.getAttribute('data-show-temperature') !== 'false';
    config.showMaxTokens = this.element.getAttribute('data-show-max-tokens') !== 'false';
    config.showPrompts = this.element.getAttribute('data-show-prompts') !== 'false';
    config.showCredentials = this.element.getAttribute('data-show-credentials') !== 'false';
    config.showSettingsButton = this.element.getAttribute('data-show-settings-button') === 'true';
    config.defaultProvider = this.element.getAttribute('data-default-provider') || 'deepseek';
    config.defaultModel = this.element.getAttribute('data-default-model') || '';
    config.defaultTemperature = parseFloat(this.element.getAttribute('data-default-temperature')) || 0.7;
    config.defaultMaxTokens = parseInt(this.element.getAttribute('data-default-max-tokens')) || 1000;
    config.promptsEndpoint = this.element.getAttribute('data-prompts-endpoint') || '/modules/prompt-manager/prompts';
    config.credentialsEndpoint = this.element.getAttribute('data-credentials-endpoint') || '/modules/credential-manager/credentials';
    config.collapsible = this.element.getAttribute('data-collapsible') !== 'false';
    config.collapsed = this.element.getAttribute('data-collapsed') === 'true';
    config.sticky = this.element.getAttribute('data-sticky') !== 'false';
    config.disabled = this.element.hasAttribute('disabled');

    const providersAttr = this.element.getAttribute('data-providers');
    config.providers = providersAttr ? JSON.parse(providersAttr) : ['deepseek', 'openai', 'claude', 'ollama'];

    return config;
  }

  init() {
    this.loadFromStorage();
    this.render();
    this.attachEventListeners();
    this.checkCredentials();
  }

  render() {
    this.element.classList.add('ai-control-bar');
    this.element.classList.add(`ai-control-bar--${this.config.variant}`);
    this.element.classList.add(`ai-control-bar--${this.config.position}`);
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', this.config.ariaLabel || 'Controles de configuración de IA');

    if (this.config.sticky) {
      this.element.classList.add('ai-control-bar--sticky');
    }

    if (this.config.disabled) {
      this.element.classList.add('ai-control-bar--disabled');
    }

    const orientation = ['right', 'left'].includes(this.config.position) ? 'vertical' : 'horizontal';

    this.element.innerHTML = `
      ${this.config.collapsible ? `
        <button class="ai-control-bar__toggle" aria-label="${this.state.collapsed ? 'Expandir' : 'Colapsar'} controles">
          ${this.state.collapsed ? '⚙️' : '×'}
        </button>
      ` : ''}

      <div class="ai-control-bar__controls ${this.state.collapsed ? 'ai-control-bar__controls--collapsed' : ''}" data-orientation="${orientation}">

        ${this.config.showProvider ? this.renderProviderControl() : ''}

        ${this.config.showModel ? this.renderModelControl() : ''}

        ${this.config.showTemperature ? this.renderTemperatureControl() : ''}

        ${this.config.showMaxTokens ? this.renderMaxTokensControl() : ''}

        ${this.config.showPrompts ? this.renderPromptsButton() : ''}

        ${this.config.showCredentials ? this.renderCredentialsIndicator() : ''}

        ${this.config.showSettingsButton ? this.renderSettingsButton() : ''}
      </div>
    `;

    this.controlsElement = this.element.querySelector('.ai-control-bar__controls');
    this.toggleBtn = this.element.querySelector('.ai-control-bar__toggle');
  }

  renderProviderControl() {
    const providerIcons = {
      deepseek: '🔥',
      openai: '🟢',
      claude: '🟣',
      ollama: '🦙',
      auto: '⚡'
    };

    return `
      <div class="ai-control-bar__control ai-control-bar__control--provider">
        <label class="ai-control-bar__label">
          <span class="ai-control-bar__icon">🤖</span>
          <span class="ai-control-bar__label-text">Provider</span>
        </label>
        <select class="ai-control-bar__select ai-control-bar__provider-select" ${this.config.disabled ? 'disabled' : ''}>
          ${this.config.providers.map(p => `
            <option value="${p}" ${this.state.provider === p ? 'selected' : ''}>
              ${providerIcons[p] || ''} ${this.capitalize(p)}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderModelControl() {
    const models = this.providerModels[this.state.provider] || [];

    return `
      <div class="ai-control-bar__control ai-control-bar__control--model">
        <label class="ai-control-bar__label">
          <span class="ai-control-bar__icon">🎯</span>
          <span class="ai-control-bar__label-text">Modelo</span>
        </label>
        <select class="ai-control-bar__select ai-control-bar__model-select" ${this.config.disabled ? 'disabled' : ''}>
          <option value="">Default</option>
          ${models.map(m => `
            <option value="${m}" ${this.state.model === m ? 'selected' : ''}>
              ${m}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderTemperatureControl() {
    return `
      <div class="ai-control-bar__control ai-control-bar__control--temperature">
        <label class="ai-control-bar__label">
          <span class="ai-control-bar__icon">🌡️</span>
          <span class="ai-control-bar__label-text">Temp</span>
          <span class="ai-control-bar__value">${this.state.temperature.toFixed(1)}</span>
        </label>
        <input
          type="range"
          class="ai-control-bar__slider ai-control-bar__temperature-slider"
          min="0"
          max="2"
          step="0.1"
          value="${this.state.temperature}"
          ${this.config.disabled ? 'disabled' : ''}
          aria-label="Temperature"
        />
      </div>
    `;
  }

  renderMaxTokensControl() {
    return `
      <div class="ai-control-bar__control ai-control-bar__control--max-tokens">
        <label class="ai-control-bar__label">
          <span class="ai-control-bar__icon">📊</span>
          <span class="ai-control-bar__label-text">Tokens</span>
        </label>
        <input
          type="number"
          class="ai-control-bar__input ai-control-bar__max-tokens-input"
          min="1"
          max="100000"
          step="100"
          value="${this.state.maxTokens}"
          ${this.config.disabled ? 'disabled' : ''}
          aria-label="Max tokens"
        />
      </div>
    `;
  }

  renderPromptsButton() {
    return `
      <button class="ai-control-bar__button ai-control-bar__prompts-btn" ${this.config.disabled ? 'disabled' : ''}>
        <span class="ai-control-bar__icon">📝</span>
        <span class="ai-control-bar__label-text">Prompts</span>
      </button>
    `;
  }

  renderCredentialsIndicator() {
    return `
      <button class="ai-control-bar__button ai-control-bar__credentials-btn" ${this.config.disabled ? 'disabled' : ''}>
        <span class="ai-control-bar__icon ai-control-bar__credentials-icon">🔑</span>
        <span class="ai-control-bar__label-text">Credenciales</span>
        <span class="ai-control-bar__status ai-control-bar__credentials-status" data-status="unknown">?</span>
      </button>
    `;
  }

  renderSettingsButton() {
    return `
      <button class="ai-control-bar__button ai-control-bar__settings-btn" ${this.config.disabled ? 'disabled' : ''}>
        <span class="ai-control-bar__icon">⚙️</span>
      </button>
    `;
  }

  attachEventListeners() {
    // Toggle button
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }

    // Provider select
    const providerSelect = this.element.querySelector('.ai-control-bar__provider-select');
    if (providerSelect) {
      providerSelect.addEventListener('change', (e) => {
        this.state.provider = e.target.value;
        this.updateModelSelect();
        this.saveToStorage();
        this.dispatchEvent('providerChanged', { provider: this.state.provider });
        this.dispatchEvent('configChanged', this.getConfig());
        this.checkCredentials();
      });
    }

    // Model select
    const modelSelect = this.element.querySelector('.ai-control-bar__model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        this.state.model = e.target.value;
        this.saveToStorage();
        this.dispatchEvent('modelChanged', { model: this.state.model });
        this.dispatchEvent('configChanged', this.getConfig());
      });
    }

    // Temperature slider
    const tempSlider = this.element.querySelector('.ai-control-bar__temperature-slider');
    if (tempSlider) {
      tempSlider.addEventListener('input', (e) => {
        this.state.temperature = parseFloat(e.target.value);
        const valueSpan = this.element.querySelector('.ai-control-bar__control--temperature .ai-control-bar__value');
        if (valueSpan) {
          valueSpan.textContent = this.state.temperature.toFixed(1);
        }
        this.saveToStorage();
        this.dispatchEvent('temperatureChanged', { temperature: this.state.temperature });
        this.dispatchEvent('configChanged', this.getConfig());
      });
    }

    // Max tokens input
    const maxTokensInput = this.element.querySelector('.ai-control-bar__max-tokens-input');
    if (maxTokensInput) {
      maxTokensInput.addEventListener('change', (e) => {
        this.state.maxTokens = parseInt(e.target.value);
        this.saveToStorage();
        this.dispatchEvent('maxTokensChanged', { maxTokens: this.state.maxTokens });
        this.dispatchEvent('configChanged', this.getConfig());
      });
    }

    // Prompts button
    const promptsBtn = this.element.querySelector('.ai-control-bar__prompts-btn');
    if (promptsBtn) {
      promptsBtn.addEventListener('click', () => {
        this.dispatchEvent('promptSelected');
        // TODO: Open PromptSelector component
      });
    }

    // Credentials button
    const credentialsBtn = this.element.querySelector('.ai-control-bar__credentials-btn');
    if (credentialsBtn) {
      credentialsBtn.addEventListener('click', () => {
        this.dispatchEvent('credentialsClicked');
        // TODO: Open CredentialManager panel
      });
    }

    // Settings button
    const settingsBtn = this.element.querySelector('.ai-control-bar__settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.dispatchEvent('settingsOpened');
        // TODO: Open advanced settings panel
      });
    }
  }

  updateModelSelect() {
    const modelSelect = this.element.querySelector('.ai-control-bar__model-select');
    if (!modelSelect) return;

    const models = this.providerModels[this.state.provider] || [];

    modelSelect.innerHTML = `
      <option value="">Default</option>
      ${models.map(m => `<option value="${m}">${m}</option>`).join('')}
    `;

    this.state.model = '';
  }

  toggle() {
    this.state.collapsed = !this.state.collapsed;

    if (this.state.collapsed) {
      this.controlsElement.classList.add('ai-control-bar__controls--collapsed');
      this.toggleBtn.textContent = '⚙️';
      this.toggleBtn.setAttribute('aria-label', 'Expandir controles');
      this.dispatchEvent('collapsed');
    } else {
      this.controlsElement.classList.remove('ai-control-bar__controls--collapsed');
      this.toggleBtn.textContent = '×';
      this.toggleBtn.setAttribute('aria-label', 'Colapsar controles');
      this.dispatchEvent('expanded');
    }

    this.saveToStorage();
  }

  async checkCredentials() {
    const statusEl = this.element.querySelector('.ai-control-bar__credentials-status');
    if (!statusEl) return;

    try {
      const response = await fetch(`${this.config.credentialsEndpoint}?provider=${this.state.provider}`);
      const data = await response.json();

      if (data.credentials && data.credentials.length > 0) {
        statusEl.setAttribute('data-status', 'ok');
        statusEl.textContent = '✓';
        statusEl.style.color = '#10b981';
      } else {
        statusEl.setAttribute('data-status', 'missing');
        statusEl.textContent = '!';
        statusEl.style.color = '#ef4444';
      }
    } catch (error) {
      statusEl.setAttribute('data-status', 'error');
      statusEl.textContent = '?';
      statusEl.style.color = '#f59e0b';
    }
  }

  loadFromStorage() {
    const stored = localStorage.getItem('aiControlBar');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        Object.assign(this.state, data);
      } catch (error) {
        console.error('Error loading AI control bar state:', error);
      }
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('aiControlBar', JSON.stringify(this.state));
    } catch (error) {
      console.error('Error saving AI control bar state:', error);
    }
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(`aicontrolbar:${eventName}`, {
      detail,
      bubbles: true
    });
    this.element.dispatchEvent(event);

    if (this.config.onChange) {
      this.config.onChange(this.getConfig());
    }
  }

  // Public methods
  getConfig() {
    return {
      provider: this.state.provider,
      model: this.state.model || undefined,
      temperature: this.state.temperature,
      max_tokens: this.state.maxTokens
    };
  }

  setProvider(provider) {
    if (this.config.providers.includes(provider)) {
      this.state.provider = provider;
      this.render();
      this.attachEventListeners();
      this.saveToStorage();
      this.checkCredentials();
    }
  }

  setModel(model) {
    this.state.model = model;
    this.render();
    this.attachEventListeners();
    this.saveToStorage();
  }

  setTemperature(temp) {
    this.state.temperature = Math.max(0, Math.min(2, temp));
    this.render();
    this.attachEventListeners();
    this.saveToStorage();
  }

  setMaxTokens(tokens) {
    this.state.maxTokens = Math.max(1, Math.min(100000, tokens));
    this.render();
    this.attachEventListeners();
    this.saveToStorage();
  }

  enable() {
    this.config.disabled = false;
    this.element.classList.remove('ai-control-bar--disabled');
    this.render();
    this.attachEventListeners();
  }

  disable() {
    this.config.disabled = true;
    this.element.classList.add('ai-control-bar--disabled');
    this.render();
    this.attachEventListeners();
  }

  collapse() {
    if (!this.state.collapsed) {
      this.toggle();
    }
  }

  expand() {
    if (this.state.collapsed) {
      this.toggle();
    }
  }

  reset() {
    this.state = {
      provider: this.config.defaultProvider,
      model: this.config.defaultModel,
      temperature: this.config.defaultTemperature,
      maxTokens: this.config.defaultMaxTokens,
      collapsed: this.config.collapsed
    };
    this.render();
    this.attachEventListeners();
    this.saveToStorage();
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['ai-control-bar'] = AIControlBar;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIControlBars);
  } else {
    initAIControlBars();
  }
}

function initAIControlBars() {
  document.querySelectorAll('[data-component="ai-control-bar"]').forEach(element => {
    if (!element.__aiControlBar) {
      element.__aiControlBar = new AIControlBar(element);
    }
  });
}
