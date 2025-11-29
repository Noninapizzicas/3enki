/**
 * CredentialIndicator Component
 * Indicador visual de estado de credenciales con niveles
 * @version 1.0.0
 */

class CredentialIndicator {
  constructor(element, config = {}) {
    this.element = element;
    this.config = { ...this.parseConfig(), ...config };
    this.status = 'loading';
    this.level = null;

    this.init();
  }

  parseConfig() {
    const config = {};
    config.variant = this.element.getAttribute('data-variant') || 'badge';
    config.provider = this.element.getAttribute('data-provider');
    config.level = this.element.getAttribute('data-level');
    config.showLevel = this.element.getAttribute('data-show-level') !== 'false';
    config.showStatus = this.element.getAttribute('data-show-status') !== 'false';
    config.enableQuickAdd = this.element.getAttribute('data-enable-quick-add') !== 'false';
    config.endpoint = this.element.getAttribute('data-endpoint') || '/modules/credential-manager/credentials';
    config.checkOnInit = this.element.getAttribute('data-check-on-init') !== 'false';

    return config;
  }

  init() {
    this.render();
    this.attachEventListeners();

    if (this.config.checkOnInit) {
      this.checkCredential();
    }
  }

  render() {
    this.element.classList.add('credential-indicator');
    this.element.classList.add(`credential-indicator--${this.config.variant}`);
    this.element.classList.add(`credential-indicator--${this.status}`);

    const statusIcons = {
      ok: '🔑',
      warning: '⚠️',
      error: '❌',
      loading: '⏳'
    };

    const levelColors = {
      CUSTOM: '#7c3aed',
      CLIENT: '#3b82f6',
      PROJECT: '#10b981',
      GLOBAL: '#6b7280'
    };

    this.element.innerHTML = `
      <div class="credential-indicator__badge">
        ${this.config.showStatus ? `
          <span class="credential-indicator__icon" style="color: ${this.getStatusColor()}">${statusIcons[this.status]}</span>
        ` : ''}

        <span class="credential-indicator__provider">${this.config.provider || 'Provider'}</span>

        ${this.config.showLevel && this.level ? `
          <span class="credential-indicator__level" style="background-color: ${levelColors[this.level]}">${this.level}</span>
        ` : ''}
      </div>

      ${this.status === 'error' && this.config.enableQuickAdd ? `
        <button class="credential-indicator__add-btn" title="Añadir credencial">+</button>
      ` : ''}
    `;
  }

  attachEventListeners() {
    const badge = this.element.querySelector('.credential-indicator__badge');
    badge.addEventListener('click', () => {
      this.dispatchEvent('credentialClicked', { provider: this.config.provider, level: this.level, status: this.status });
    });

    const addBtn = this.element.querySelector('.credential-indicator__add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchEvent('credentialAdd', { provider: this.config.provider });
      });
    }
  }

  async checkCredential() {
    this.status = 'loading';
    this.render();
    this.attachEventListeners();

    try {
      const response = await fetch(`${this.config.endpoint}?provider=${this.config.provider}`);
      const data = await response.json();

      if (data.credentials && data.credentials.length > 0) {
        const cred = data.credentials[0];
        this.level = cred.level || 'GLOBAL';
        this.status = this.level === 'GLOBAL' ? 'warning' : 'ok';
      } else {
        this.status = 'error';
        this.level = null;
      }
    } catch (error) {
      console.error('Error checking credential:', error);
      this.status = 'error';
      this.level = null;
    }

    this.render();
    this.attachEventListeners();
    this.dispatchEvent('credentialChecked', { provider: this.config.provider, level: this.level, status: this.status });
  }

  getStatusColor() {
    const colors = {
      ok: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      loading: '#3b82f6'
    };
    return colors[this.status] || '#6b7280';
  }

  setStatus(status, level = null) {
    this.status = status;
    this.level = level;
    this.render();
    this.attachEventListeners();
  }

  refresh() {
    this.checkCredential();
  }

  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(`credentialindicator:${eventName}`, {
      detail,
      bubbles: true
    });
    this.element.dispatchEvent(event);
  }
}

// Auto-initialize
if (typeof window !== 'undefined') {
  window.AutoUI = window.AutoUI || {};
  window.AutoUI.components = window.AutoUI.components || {};
  window.AutoUI.components['credential-indicator'] = CredentialIndicator;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCredentialIndicators);
  } else {
    initCredentialIndicators();
  }
}

function initCredentialIndicators() {
  document.querySelectorAll('[data-component="credential-indicator"]').forEach(element => {
    if (!element.__credentialIndicator) {
      element.__credentialIndicator = new CredentialIndicator(element);
    }
  });
}
