/**
 * Auto-UI Client v2.0
 *
 * Scripts del cliente con funcionalidades mejoradas
 */

(function() {
  'use strict';

  // ==========================================
  // Global AutoUI Object
  // ==========================================

  window.AutoUI = window.AutoUI || {
    version: '2.0.0',
    config: {
      toastDuration: 3000,
      holdDuration: 2000,
      debounceDelay: 300
    },
    state: {
      sidebarOpen: true,
      modals: [],
      toasts: []
    }
  };

  const AutoUI = window.AutoUI;

  // ==========================================
  // Toast System
  // ==========================================

  AutoUI.showToast = function(message, type = 'info', duration = null) {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.warn('[AutoUI] Toast container not found');
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon según tipo
    const icons = {
      success: '✓',
      warning: '⚠',
      danger: '✗',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${AutoUI.escapeHtml(message)}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);
    AutoUI.state.toasts.push(toast);

    // Auto-remove
    const timeout = duration || AutoUI.config.toastDuration;
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
        const index = AutoUI.state.toasts.indexOf(toast);
        if (index > -1) AutoUI.state.toasts.splice(index, 1);
      }, 300);
    }, timeout);

    return toast;
  };

  // ==========================================
  // Modal System
  // ==========================================

  AutoUI.openModal = function(content, options = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.onclick = (e) => {
      if (e.target === backdrop && !options.persistent) {
        AutoUI.closeModal(backdrop);
      }
    };

    const modal = document.createElement('div');
    modal.className = 'modal';
    if (options.size) modal.classList.add(`modal-${options.size}`);

    modal.innerHTML = content;

    backdrop.appendChild(modal);
    document.getElementById('modal-container').appendChild(backdrop);
    AutoUI.state.modals.push(backdrop);

    // Focus trap
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    return backdrop;
  };

  AutoUI.closeModal = function(modal) {
    if (!modal) {
      modal = AutoUI.state.modals[AutoUI.state.modals.length - 1];
    }

    if (modal) {
      modal.style.opacity = '0';
      setTimeout(() => {
        modal.remove();
        const index = AutoUI.state.modals.indexOf(modal);
        if (index > -1) AutoUI.state.modals.splice(index, 1);
      }, 250);
    }
  };

  // ==========================================
  // Action Executor
  // ==========================================

  AutoUI.executeAction = function(action, params, element) {
    console.log('[AutoUI] Executing action:', action, params);

    switch (action) {
      case 'navigate':
        if (params.to) {
          window.location.href = params.to;
        }
        break;

      case 'back':
        history.back();
        break;

      case 'refresh':
        location.reload();
        break;

      case 'show_toast':
        AutoUI.showToast(params.message, params.type || 'info');
        break;

      case 'open_modal':
        if (params.content) {
          AutoUI.openModal(params.content, params);
        }
        break;

      case 'close_modal':
        AutoUI.closeModal();
        break;

      case 'delete':
        if (params.endpoint && element) {
          if (confirm(params.confirm || '¿Estás seguro de eliminar?')) {
            htmx.ajax('DELETE', params.endpoint, {
              target: element.closest('tr') || element,
              swap: 'outerHTML'
            });
          }
        }
        break;

      case 'submit_form':
        if (element) {
          const form = element.closest('form');
          if (form) form.submit();
        }
        break;

      case 'emit':
        if (params.event) {
          htmx.trigger('body', params.event, params.data);
        }
        break;

      case 'custom':
        if (params.handler && typeof window[params.handler] === 'function') {
          window[params.handler](params, element);
        }
        break;

      default:
        console.warn('[AutoUI] Unknown action:', action);
    }
  };

  // ==========================================
  // Hold Interaction
  // ==========================================

  (function() {
    let holdTimer = null;
    let holdProgress = null;
    let holdElement = null;

    document.addEventListener('mousedown', function(e) {
      const el = e.target.closest('[data-hold]');
      if (!el) return;

      e.preventDefault();
      holdElement = el;

      const config = JSON.parse(el.dataset.hold);
      const duration = config.duration || AutoUI.config.holdDuration;

      // Create progress indicator
      holdProgress = document.createElement('div');
      holdProgress.className = 'hold-progress';
      holdProgress.style.cssText = `
        position: absolute;
        inset: 0;
        border: 2px solid var(--primary);
        border-radius: inherit;
        clip-path: polygon(50% 50%, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%);
        pointer-events: none;
        z-index: 1;
      `;

      el.style.position = 'relative';
      el.style.overflow = 'hidden';
      el.appendChild(holdProgress);

      // Animate progress
      let progress = 0;
      const step = 20; // ms
      const increment = (step / duration) * 100;

      const animate = () => {
        progress += increment;
        if (progress >= 100) {
          progress = 100;
        }

        // Update clip-path for circular progress
        const angle = (progress / 100) * 360;
        holdProgress.style.clipPath = AutoUI.getClipPath(angle);

        if (progress < 100 && holdTimer) {
          requestAnimationFrame(animate);
        }
      };

      animate();

      holdTimer = setTimeout(function() {
        AutoUI.executeAction(config.action, config, el);
        cleanup();

        // Visual feedback
        el.style.transform = 'scale(0.95)';
        setTimeout(() => {
          el.style.transform = '';
        }, 150);
      }, duration);
    });

    document.addEventListener('mouseup', cleanup);
    document.addEventListener('mouseleave', cleanup);

    function cleanup() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (holdProgress) {
        holdProgress.remove();
        holdProgress = null;
      }
      if (holdElement) {
        holdElement = null;
      }
    }
  })();

  // Helper para circular progress
  AutoUI.getClipPath = function(angle) {
    if (angle <= 0) return 'polygon(50% 50%, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%)';
    if (angle >= 360) return 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%)';

    const points = ['50% 50%', '50% 0%'];

    if (angle <= 90) {
      const x = 50 + 50 * Math.tan(angle * Math.PI / 180);
      points.push(`${x}% 0%`);
    } else {
      points.push('100% 0%');

      if (angle <= 180) {
        const y = 50 * Math.tan((angle - 90) * Math.PI / 180);
        points.push(`100% ${y}%`);
      } else {
        points.push('100% 100%');

        if (angle <= 270) {
          const x = 50 - 50 * Math.tan((angle - 180) * Math.PI / 180);
          points.push(`${x}% 100%`);
        } else {
          points.push('0% 100%');
          const y = 100 - 50 * Math.tan((angle - 270) * Math.PI / 180);
          points.push(`0% ${y}%`);
        }
      }
    }

    return `polygon(${points.join(', ')})`;
  };

  // ==========================================
  // Sidebar Toggle
  // ==========================================

  AutoUI.toggleSidebar = function() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      AutoUI.state.sidebarOpen = !AutoUI.state.sidebarOpen;
      sidebar.classList.toggle('open');

      // Store preference
      localStorage.setItem('autoui-sidebar-open', AutoUI.state.sidebarOpen);
    }
  };

  // ==========================================
  // Tab System
  // ==========================================

  AutoUI.switchTab = function(idx) {
    const container = event.target.closest('.layout-tabs');
    if (!container) return;

    container.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    });

    container.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
      panel.setAttribute('aria-hidden', 'true');
    });

    const button = container.querySelector(`[data-tab="${idx}"].tab-button`);
    const panel = container.querySelector(`[data-tab="${idx}"].tab-panel`);

    if (button && panel) {
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      panel.classList.add('active');
      panel.setAttribute('aria-hidden', 'false');
    }
  };

  // ==========================================
  // Accordion System
  // ==========================================

  AutoUI.toggleAccordion = function(btn, allowMultiple) {
    const item = btn.closest('.accordion-item');
    const container = btn.closest('.layout-accordion');
    if (!item || !container) return;

    const isActive = item.classList.contains('active');

    if (!allowMultiple) {
      container.querySelectorAll('.accordion-item').forEach(i => {
        if (i !== item) {
          i.classList.remove('active');
        }
      });
    }

    item.classList.toggle('active');
  };

  // ==========================================
  // Form Validation
  // ==========================================

  AutoUI.validateForm = function(form) {
    const inputs = form.querySelectorAll('[required], [data-validate]');
    let isValid = true;

    inputs.forEach(input => {
      const error = AutoUI.validateField(input);
      if (error) {
        AutoUI.showFieldError(input, error);
        isValid = false;
      } else {
        AutoUI.clearFieldError(input);
      }
    });

    return isValid;
  };

  AutoUI.validateField = function(input) {
    const value = input.value.trim();
    const rules = input.dataset.validate ? JSON.parse(input.dataset.validate) : {};

    // Required
    if (input.required && !value) {
      return 'Este campo es requerido';
    }

    // Type validation
    const type = input.type;
    if (value) {
      if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return 'Email inválido';
      }

      if (type === 'url') {
        try {
          new URL(value);
        } catch {
          return 'URL inválida';
        }
      }

      // Min/Max length
      if (rules.minLength && value.length < rules.minLength) {
        return `Mínimo ${rules.minLength} caracteres`;
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        return `Máximo ${rules.maxLength} caracteres`;
      }

      // Pattern
      if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
        return 'Formato inválido';
      }
    }

    return null;
  };

  AutoUI.showFieldError = function(input, error) {
    input.classList.add('error');

    let errorEl = input.parentElement.querySelector('.form-error');
    if (!errorEl) {
      errorEl = document.createElement('span');
      errorEl.className = 'form-error';
      input.parentElement.appendChild(errorEl);
    }

    errorEl.textContent = error;
  };

  AutoUI.clearFieldError = function(input) {
    input.classList.remove('error');
    const errorEl = input.parentElement.querySelector('.form-error');
    if (errorEl) errorEl.remove();
  };

  // ==========================================
  // Debounce Utility
  // ==========================================

  AutoUI.debounce = function(func, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  // ==========================================
  // Utilities
  // ==========================================

  AutoUI.escapeHtml = function(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  AutoUI.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      AutoUI.showToast('Copiado al portapapeles', 'success');
    }).catch(() => {
      AutoUI.showToast('Error al copiar', 'danger');
    });
  };

  AutoUI.downloadJSON = function(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==========================================
  // Initialize
  // ==========================================

  document.addEventListener('DOMContentLoaded', function() {
    console.log(`[AutoUI v${AutoUI.version}] Client initialized`);

    // Restore sidebar state
    const sidebarOpen = localStorage.getItem('autoui-sidebar-open');
    if (sidebarOpen !== null) {
      AutoUI.state.sidebarOpen = sidebarOpen === 'true';
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && !AutoUI.state.sidebarOpen) {
        sidebar.classList.remove('open');
      }
    }

    // Form validation on submit
    document.addEventListener('submit', function(e) {
      const form = e.target;
      if (form.dataset.validate === 'true') {
        if (!AutoUI.validateForm(form)) {
          e.preventDefault();
          AutoUI.showToast('Por favor corrige los errores en el formulario', 'warning');
        }
      }
    });

    // Live validation on blur
    document.addEventListener('blur', function(e) {
      if (e.target.dataset.validateOnBlur) {
        const error = AutoUI.validateField(e.target);
        if (error) {
          AutoUI.showFieldError(e.target, error);
        } else {
          AutoUI.clearFieldError(e.target);
        }
      }
    }, true);

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Escape to close modal
      if (e.key === 'Escape' && AutoUI.state.modals.length > 0) {
        AutoUI.closeModal();
      }

      // Ctrl/Cmd + K para search (si existe)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('[data-search]');
        if (searchInput) searchInput.focus();
      }
    });

    // HTMX events
    document.body.addEventListener('htmx:afterSwap', function(e) {
      console.log('[AutoUI] HTMX swap completed');
    });

    document.body.addEventListener('htmx:responseError', function(e) {
      AutoUI.showToast('Error en la solicitud', 'danger');
    });
  });

})();
